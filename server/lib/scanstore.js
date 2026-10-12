import { classifyFinding, suggestService, SCAN_STATUS_RANK } from './scan.js'
import { HINTS } from './hints.js'

// In-memory model of the scan result list: one row per host key. applyPageScan
// turns one page's findings into the minimal storage operations; lastSeen alone
// never causes a write.
// The admin list stretches every cell of a row to its tallest cell, so the
// pages cell shows at most 10 slugs and a "+N weitere" line. In memory the
// full page list is kept; after a restart only the stored 10 are known and
// row.hidden counts the rest (see scanRowsFromStorage).
const SCAN_PAGE_CAP = 10
const SCAN_MORE_RE = /^\+(\d+) weitere$/

function scanRowData(row, base) {
  const list = row.pageList.slice().sort()
  const pages = list.slice(0, SCAN_PAGE_CAP)
  const more = list.length + (row.hidden || 0) - pages.length
  if (more > 0) pages.push(`+${more} weitere`)
  return { ...base, pages: pages.join('\n') }
}

// After a restart the stored cell listed the first 10 slugs in sort order
// and a count of the others. A slug that sorts after the last stored one
// may be one of those hidden pages: it is counted as such while hidden
// pages remain (approximate). A slug that sorts before it is new.
function scanAddPage(row, slug) {
  if (row.pageList.includes(slug)) return
  row.pageList.push(slug)
  if (row.hidden > 0 && row.cutoff !== undefined && slug > row.cutoff) row.hidden--
}

function scanHintText(id) {
  const h = id ? HINTS.find((x) => x.id === id) : null
  return h ? `${h.name}: ${h.advice.de}` : ''
}

// The host drops empty values and trims strings, so stored rows may lack keys: missing equals ''.
const SCAN_TEXT = ['host', 'status', 'kinds', 'pages', 'service', 'hint', 'suggestion', 'firstSeen', 'lastSeen']

function scanNormalise(d) {
  const out = {}
  for (const k of SCAN_TEXT) out[k] = String(d[k] === undefined || d[k] === null ? '' : d[k]).trim()
  out.generation = Number(d.generation)
  return out
}

function scanSame(a, b) {
  const x = scanNormalise(a)
  const y = scanNormalise(b)
  return Object.keys(x).every((k) => k === 'lastSeen' || x[k] === y[k])
}

function scanRank(status) {
  return Object.prototype.hasOwnProperty.call(SCAN_STATUS_RANK, status) ? SCAN_STATUS_RANK[status] : -1
}

// Add-only: ctx.slug is not unique per page (data-row entry templates,
// previews), so a render never removes a host or a page from the list; only
// scanReset does. Kinds and pages accumulate; the row status is the worst
// status seen (unknown > unblocked > blocked > covered > allowed > own) while
// the classification context (ctx.sig: services, own and allow lists) stays
// the same. After a context change the first render of a host replaces its
// status, later renders merge again (a full publish is required after
// settings changes anyway). Rows loaded from storage count as current.
export function applyPageScan(model, slug, findings, ctx, now, generation) {
  const ops = []
  const byKey = new Map()
  for (const f of findings) {
    if (!byKey.has(f.key)) byKey.set(f.key, [])
    byKey.get(f.key).push(f)
  }
  for (const [key, fs] of byKey) {
    // worst finding of this page; on a tie an iframe/script (it gets a suggestion)
    let worst = null
    let worstStatus = ''
    for (const f of fs) {
      const st = classifyFinding(f, ctx)
      const better = !worst || scanRank(st) > scanRank(worstStatus) ||
        (scanRank(st) === scanRank(worstStatus) && worst.kind !== 'iframe' && worst.kind !== 'script' && (f.kind === 'iframe' || f.kind === 'script'))
      if (better) { worst = f; worstStatus = st }
    }
    let row = model.get(key)
    const isNew = !row
    if (isNew) { row = { id: null, data: null, pageList: [], ctxSig: ctx.sig }; model.set(key, row) }
    scanAddPage(row, slug)
    const kinds = new Set(row.data && row.data.kinds ? row.data.kinds.split(',').filter(Boolean) : [])
    for (const f of fs) kinds.add(f.kind)
    let verdict = {
      status: worstStatus, service: worst.service || '', hint: scanHintText(worst.hint),
      suggestion: worstStatus === 'unknown' && (worst.kind === 'iframe' || worst.kind === 'script') ? suggestService(worst.host, worst.kind) : '',
    }
    const merge = !isNew && (row.ctxSig === undefined || row.ctxSig === ctx.sig)
    if (merge && scanRank(row.data.status) >= scanRank(worstStatus)) {
      verdict = { status: row.data.status, service: row.data.service || '', hint: row.data.hint || '', suggestion: row.data.suggestion || '' }
    }
    row.ctxSig = ctx.sig
    const base = {
      host: key, ...verdict, kinds: [...kinds].sort().join(','),
      firstSeen: row.data && row.data.firstSeen ? row.data.firstSeen : now,
      // "last changed": only advances when the row is written
      lastSeen: now, generation,
    }
    const data = scanRowData(row, base)
    if (isNew) { row.data = data; ops.push({ op: 'create', key, data }); continue }
    if (scanSame(row.data, data)) continue
    row.data = data
    ops.push({ op: 'update', key, id: row.id, data })
  }
  return ops
}

export function scanRowsFromStorage(records, generation) {
  const model = new Map()
  const stale = []
  const summaries = []
  for (const r of records || []) {
    const d = r.data || {}
    if (d.generation !== generation || !d.host) { stale.push(r.id); continue }
    if (d.host === SCAN_SUMMARY_HOST) { summaries.push(r); continue }
    const lines = String(d.pages || '').split('\n').map((l) => l.trim()).filter(Boolean)
    const pageList = lines.filter((l) => !SCAN_MORE_RE.test(l))
    const more = lines.map((l) => SCAN_MORE_RE.exec(l)).find(Boolean)
    const row = { id: r.id, data: scanNormalise(d), pageList }
    if (more) { row.hidden = Number(more[1]); row.cutoff = pageList.slice().sort().pop() || '' }
    model.set(d.host, row)
  }
  // one summary row per generation: the newest wins, others are removed
  let summary = null
  for (const r of summaries) {
    if (!summary || String(r.data.lastSeen || '') > String(summary.data.lastSeen || '')) { if (summary) stale.push(summary.id); summary = r }
    else stale.push(r.id)
  }
  if (summary) summary = { id: summary.id, data: scanNormalise(summary.data) }
  return { model, stale, summary }
}

// ---- summary row ----
// One extra row with host "Zusammenfassung" (no dot, so it never collides
// with a host) tells the operator that the scan ran, how much it saw and the
// last error. The admin list is ordered created_at desc: to keep it on top
// the row is replaced (create new, delete old) instead of updated.
export const SCAN_SUMMARY_HOST = 'Zusammenfassung'
const SCAN_SUMMARY_REFRESH_MS = 10 * 60 * 1000

export function scanSummaryData(slugCount, rowCount, error, generation, now) {
  const err = String(error || '').trim()
  return {
    host: SCAN_SUMMARY_HOST, status: err ? 'error' : 'ok', kinds: '',
    pages: `${slugCount} ${slugCount === 1 ? 'Seite' : 'Seiten'} geprüft · ${rowCount} ${rowCount === 1 ? 'fremder Server' : 'fremde Server'} im HTML`,
    service: '', hint: err.length > 200 ? err.slice(0, 199) + '…' : err, suggestion: '', firstSeen: '', lastSeen: now, generation,
  }
}

// Written when the counts, the error or the generation change; otherwise at
// most once per 10 minutes (lastSeen then shows when the scan last ran).
export function scanSummaryDue(stored, next, nowMs) {
  if (!stored) return true
  const a = scanNormalise(stored)
  const b = scanNormalise(next)
  if (a.status !== b.status || a.pages !== b.pages || a.hint !== b.hint || a.generation !== b.generation) return true
  const t = Date.parse(a.lastSeen)
  return !(nowMs - t < SCAN_SUMMARY_REFRESH_MS)
}

// "fremde Server": host rows that are not own hosts (inline snippets have no host)
export function scanForeignCount(model) {
  let n = 0
  for (const [key, row] of model) if (!key.startsWith('inline:') && row.data && row.data.status !== 'own') n++
  return n
}

// After a restart the scanned slugs are approximated by the stored page
// lists (pages without findings and pages behind "+N weitere" are missing).
export function scanSlugsFromModel(model) {
  const out = new Set()
  for (const row of model.values()) for (const s of row.pageList) out.add(s)
  return out
}
