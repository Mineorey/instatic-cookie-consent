import { buildConfig } from './lib/config.js'
import { processPage, failSafe } from './lib/pipeline.js'
import { hash53 } from './lib/hash.js'
import { versionSummary, versionSummaryFromSnapshot } from './lib/versions.js'
import { scanHtml } from './lib/scan.js'
import { applyPageScan, scanRowsFromStorage, scanSummaryData, scanSummaryDue, scanSlugsFromModel, scanForeignCount } from './lib/scanstore.js'

// Instatic emits publish.before once per page, so there is no per-run hook.
// The config is rebuilt on every call (cheap); storage is only touched when
// its fingerprint differs from the cached one. Storage work is serialised
// through a promise chain so concurrent page filters never duplicate revisions.
//
// Fail-safe ("blocked, not open"): a storage failure only affects the
// version archive. The page is processed normally with the last known
// revision, so the banner works. Only when the config or the transformation
// itself fails does the page fall back to failSafe(): all absolute iframe
// sources are neutralised, no config is injected and consent.js runs in
// safe mode.
let cache = null
let loggedErrors = null
let storageLogged = null
let chain = Promise.resolve()

// The versions list shows revision, date and a short summary; the full JSON
// snapshot is stored in version-snapshots (no admin page, see the
// /versions/snapshot route). Records written before 1.2.1 carry the snapshot
// themselves: migrateVersions() moves it and adds a summary.
let versionsMigrated = false
let versionLogged = null

async function loadVersionRecords(api) {
  const res = await api.cms.storage.collection('versions').list({ limit: 1000 })
  return res.records
}

function versionRow(d) {
  const out = {}
  for (const k of Object.keys(d || {})) if (k !== 'snapshot') out[k] = d[k]
  return out
}

async function loadVersions(api) {
  return (await loadVersionRecords(api)).map((r) => versionRow(r.data)).sort((a, b) => b.revision - a.revision)
}

function versionLog(api, text) {
  if (versionLogged === text) return
  versionLogged = text
  api.plugin.log(text)
}

// Errors are logged and never stop publishing; deadlineMs bounds the work
// inside the publish filter (the rest follows on the next sync or route call).
async function migrateVersions(api, records, deadlineMs) {
  if (versionsMigrated) return
  const old = records.filter((r) => r.data && r.data.snapshot !== undefined && !r.data.summary)
  try {
    if (old.length) {
      const snaps = api.cms.storage.collection('version-snapshots')
      const have = new Set((await snaps.list({ limit: 1000 })).records.map((r) => r.data && r.data.revision))
      for (const r of old) {
        if (deadlineMs && Date.now() > deadlineMs) return
        if (!have.has(r.data.revision)) { await snaps.create({ revision: r.data.revision, snapshot: String(r.data.snapshot) }); have.add(r.data.revision) }
        const data = { ...versionRow(r.data), summary: versionSummaryFromSnapshot(r.data.snapshot) }
        await api.cms.storage.collection('versions').update(r.id, data)
        r.data = data
      }
    }
    versionsMigrated = true
  } catch (err) {
    versionLog(api, `consent: version migration failed (${err && err.message}); retried later`)
  }
}

async function sync(api, cfg) {
  if (cache && cache.fingerprint === cfg.fingerprint) return cache.revision
  const records = await loadVersionRecords(api)
  await migrateVersions(api, records, Date.now() + 1000)
  const versions = records.map((r) => r.data).sort((a, b) => b.revision - a.revision)
  let revision = versions.length ? versions[0].revision : 0
  if (!versions.length || versions[0].fingerprint !== cfg.fingerprint) {
    revision += 1
    await api.cms.storage.collection('versions').create({
      revision, createdAt: new Date().toISOString(), summary: versionSummary(cfg), fingerprint: cfg.fingerprint,
    })
    try {
      await api.cms.storage.collection('version-snapshots').create({
        revision, snapshot: JSON.stringify({ client: cfg.client, csp: cfg.csp, loaders: cfg.loaders }),
      })
    } catch (err) {
      versionLog(api, `consent: snapshot of revision ${revision} not stored (${err && err.message})`)
    }
  }
  cache = { fingerprint: cfg.fingerprint, revision }
  return revision
}

// GET /versions/snapshot?revision=N (host routes match exact paths, so the
// revision is a query parameter, not a path segment)
async function versionSnapshot(api, req) {
  const m = /[?&]revision=(\d+)/.exec(String((req && req.url) || ''))
  const revision = m ? Number(m[1]) : NaN
  const notFound = { __response: true, status: 404, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'revision not found' }) }
  if (!Number.isFinite(revision)) return notFound
  const rec = (await loadVersionRecords(api)).find((r) => r.data && r.data.revision === revision)
  if (!rec) return notFound
  let snapshot = rec.data.snapshot !== undefined ? String(rec.data.snapshot) : ''
  if (!snapshot) {
    const snaps = await api.cms.storage.collection('version-snapshots').list({ limit: 1000 })
    const s = snaps.records.find((r) => r.data && r.data.revision === revision)
    snapshot = s && s.data.snapshot !== undefined ? String(s.data.snapshot) : ''
  }
  const d = rec.data
  return { revision, fingerprint: d.fingerprint || '', createdAt: d.createdAt || '', summary: d.summary || '', snapshot }
}

function currentConfig(api) {
  const assetBase = api.plugin.assetUrl('frontend/').replace(/frontend\/$/, '')
  const cfg = buildConfig(api.cms.settings.getAll() || {}, { assetBase })
  // logged whenever the set of errors changes (the scan host lists are not
  // part of the fingerprint)
  const errorKey = cfg.errors.join('\n')
  if (loggedErrors !== errorKey) {
    loggedErrors = errorKey
    for (const e of cfg.errors) api.plugin.log('consent config:', e)
  }
  return cfg
}

async function revisionFor(api, cfg) {
  if (cache && cache.fingerprint === cfg.fingerprint) return cache.revision
  const run = chain.then(() => sync(api, cfg))
  chain = run.catch(() => {})
  return run
}

// ---- publish scan ----
// The scan must never push the filter past the host's 5 s deadline: it runs
// after the page is processed, starts only within 1.5 s of the filter start,
// and issues at most 25 storage calls per filter call, none after 2.5 s.
// Storage operations that do not fit stay in scanPending and are executed
// first on later calls (same serial chain); the in-memory model stays
// authoritative meanwhile.
const SCAN_START_MS = 1500
const SCAN_STOP_MS = 2500
const SCAN_MAX_CALLS = 25
let scanModel = null
let scanGeneration = null
let scanChain = Promise.resolve()
let scanLogged = null
const scanPageHash = new Map()
// { op: 'delete', id } (stale rows after scanReset) or { op: 'write', key }
let scanPending = []
const scanPendingKeys = new Set()
// Summary row (see scanstore.js): written after the queue has drained, so it
// is the newest record and stays on top of the admin list. scanSlugs holds
// the slugs scanned in scanSlugsGen; scanRowCount the last known number of
// host rows. scanError is the last error of the current publish run: a call
// more than SCAN_RUN_GAP_MS after the previous one starts a new run and
// clears it (operators read the list between runs).
const SCAN_RUN_GAP_MS = 60 * 1000
let scanSummary = null
let scanSummaryWanted = false
// a host row was created after the last summary write
let scanRowCreated = false
let scanSlugs = new Set()
let scanSlugsGen = null
let scanRowCount = 0
let scanError = ''
let scanLastCall = 0

function scanBudgetLeft(budget) {
  return budget.calls < SCAN_MAX_CALLS && Date.now() - budget.t0 <= SCAN_STOP_MS
}

async function ensureScanModel(api, generation, budget) {
  if (scanModel && scanGeneration === generation) return true
  if (Date.now() - budget.t0 > SCAN_START_MS) return false
  const col = api.cms.storage.collection('scan')
  // The host caps list() at 1000 records per call; collect every page before
  // deleting (deleting shifts offsets). A list that does not fit into one
  // call's budget is started again next time. The host's default order is
  // created_at desc, which has ties within one millisecond and so can skip or
  // repeat rows between pages; orderBy only accepts data fields (not
  // created_at), so page by host, then lastSeen, which is stable for every
  // row the plugin writes (stale duplicates of one host may still tie).
  const records = []
  for (let offset = 0; ; offset += 1000) {
    if (!scanBudgetLeft(budget)) return false
    budget.calls++
    const res = await col.list({ orderBy: { host: 'asc', lastSeen: 'asc' }, limit: 1000, offset })
    records.push(...res.records)
    if (res.records.length < 1000) break
  }
  const { model, stale, summary } = scanRowsFromStorage(records, generation)
  scanPending = stale.map((id) => ({ op: 'delete', id }))
  scanPendingKeys.clear()
  scanPageHash.clear()
  scanModel = model
  scanGeneration = generation
  scanSummary = summary
  const derived = scanSlugsFromModel(model)
  if (scanSlugsGen !== generation) { scanSlugs = derived; scanSlugsGen = generation } else for (const s of derived) scanSlugs.add(s)
  scanRowCount = scanForeignCount(model)
  return true
}

function scanNoteError(text) {
  if (scanError === text) return
  scanError = text
  scanSummaryWanted = true
}

// Best effort, never throws: create the new summary first, then delete the
// old one (a failed delete is queued; a duplicate left behind is removed as
// stale on the next load). Counts against the storage budget.
async function scanSummaryStep(api, budget, generation) {
  try {
    if (scanModel) scanRowCount = scanForeignCount(scanModel)
    const now = Date.now()
    const next = scanSummaryData(scanSlugsGen === generation ? scanSlugs.size : 0, scanRowCount, scanError, generation, new Date(now).toISOString())
    // a host row created since the last summary write sorts above it: rewrite
    // the summary even when its text is unchanged (own hosts, inline rows)
    if (!scanRowCreated && !scanSummaryDue(scanSummary && scanSummary.data, next, now)) { scanSummaryWanted = false; return }
    scanSummaryWanted = true
    const old = scanSummary ? scanSummary.id : null
    if (budget.calls + (old ? 2 : 1) > SCAN_MAX_CALLS || Date.now() - budget.t0 > SCAN_STOP_MS) return
    const col = api.cms.storage.collection('scan')
    // created_at has millisecond precision: a summary created in the same
    // millisecond as a host row could sort below it (SQLite), so wait 2 ms
    // (timers are host-bridged in the sandbox)
    if (budget.createdAt !== undefined && typeof setTimeout === 'function') {
      const wait = budget.createdAt + 2 - Date.now()
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    }
    budget.calls++
    const r = await col.create(next)
    scanSummary = { id: r && r.id, data: next }
    scanRowCreated = false
    scanSummaryWanted = false
    if (old !== null && old !== undefined) {
      budget.calls++
      try { await col.delete(old) } catch (e) { scanPending.push({ op: 'delete', id: old }) }
    }
  } catch (e) { /* stays wanted, retried on a later call */ }
}

async function scanDrain(api, budget) {
  const col = api.cms.storage.collection('scan')
  while (scanPending.length && scanBudgetLeft(budget)) {
    const o = scanPending[0]
    if (o.op === 'delete') { budget.calls++; await col.delete(o.id) }
    else {
      const row = scanModel.get(o.key)
      if (row) {
        budget.calls++
        if (row.id === null || row.id === undefined) { const r = await col.create(row.data); row.id = r.id; budget.createdAt = Date.now(); scanRowCreated = true }
        else await col.update(row.id, row.data)
      }
      scanPendingKeys.delete(o.key)
    }
    scanPending.shift()
  }
}

function scanForget() {
  scanModel = null
  scanGeneration = null
  scanPending = []
  scanPendingKeys.clear()
  scanPageHash.clear()
}

async function runScan(api, cfg, slug, html, t0) {
  if (!cfg.scan.enabled || !slug) return
  if (scanLastCall && t0 - scanLastCall > SCAN_RUN_GAP_MS) scanNoteError('')
  scanLastCall = t0
  const SKIPPED = 'Scan übersprungen (Zeitbudget)'
  // a page scanned before (e.g. a dynamic re-render) is not reported as skipped
  const skipped = () => { if (!scanPageHash.has(slug)) scanNoteError(SKIPPED) }
  if (Date.now() - t0 > SCAN_START_MS) { skipped(); return }
  const generation = cfg.scan.generation
  const findings = scanHtml(html, cfg.services)
  const ctx = { services: cfg.services, own: cfg.scan.own, allow: cfg.scan.allow }
  ctx.sig = hash53(JSON.stringify([ctx.own, ctx.allow, cfg.services.map((s) => [s.id, s.enabled, s.match, s.csp])]))
  const sig = hash53(JSON.stringify([generation, ctx.sig, findings]))
  if (scanPageHash.get(slug) === sig && scanGeneration === generation && !scanPending.length && !scanSummaryWanted) return
  const run = scanChain.then(async () => {
    const budget = { calls: 0, t0 }
    try {
      if (!(await ensureScanModel(api, generation, budget))) { skipped(); return }
      if (scanPageHash.get(slug) !== sig) {
        for (const o of applyPageScan(scanModel, slug, findings, ctx, new Date().toISOString(), generation)) {
          if (scanPendingKeys.has(o.key)) continue
          scanPendingKeys.add(o.key)
          scanPending.push({ op: 'write', key: o.key })
        }
        scanPageHash.set(slug, sig)
        scanSlugs.add(slug)
      }
      await scanDrain(api, budget)
      if (!scanPending.length) await scanSummaryStep(api, budget, generation)
    } catch (err) {
      // the model may now differ from storage: reload it and rescan pages
      if (scanModel) scanRowCount = scanForeignCount(scanModel)
      scanForget()
      scanNoteError(`Speicher nicht erreichbar: ${(err && err.message) || err}`)
      if (scanLogged !== cfg.fingerprint) { scanLogged = cfg.fingerprint; api.plugin.log(`consent: scan list unavailable (${err && err.message})`) }
      await scanSummaryStep(api, budget, generation)
    }
  })
  scanChain = run.catch(() => {})
  try { await run } catch (e) { /* never reached: the run handles its errors */ }
}

function safeFallback(api, html, slug, err) {
  api.plugin.log(`consent: publish.html failed for "${slug}", page published in safe mode: ${err && err.message}`)
  try { return failSafe(html) } catch (e) { return html }
}

export function activate(api) {
  api.cms.hooks.filter('publish.html', async (html, ctx) => {
    const t0 = Date.now()
    if (typeof html !== 'string' || !/<\/head>/i.test(html)) return html
    const slug = ctx && ctx.slug
    let cfg
    try { cfg = currentConfig(api) } catch (err) { return safeFallback(api, html, slug, err) }

    let revision
    try {
      revision = await revisionFor(api, cfg)
    } catch (err) {
      revision = cache ? cache.revision : 0
      if (storageLogged !== cfg.fingerprint) {
        storageLogged = cfg.fingerprint
        api.plugin.log(`consent: version archive unavailable (${err && err.message}); pages are published with revision ${cache ? cache.revision : 0} and this configuration is not archived`)
      }
    }

    let out
    try {
      const r = processPage(html, cfg, revision)
      if (!r.cspOk) api.plugin.log(`consent: no CSP meta found on "${slug}", service hosts not added`)
      out = r.html
    } catch (err) {
      out = safeFallback(api, html, slug, err)
    }

    // the scan comes last and never changes the result
    try { await runScan(api, cfg, slug, html, t0) } catch (e) {}
    return out
  })

  api.cms.routes.get('/versions', 'plugins.read', async () => {
    // no publish deadline here: finish a migration the filter had to cut short
    const run = chain.then(async () => { await migrateVersions(api, await loadVersionRecords(api), 0) })
    chain = run.catch(() => {})
    try { await run } catch (e) { /* listing still works */ }
    return { versions: await loadVersions(api) }
  })
  api.cms.routes.get('/versions/snapshot', 'plugins.read', async (ctx) => versionSnapshot(api, ctx && ctx.req))
}
