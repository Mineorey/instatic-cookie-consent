import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const BUNDLE = pathToFileURL(join(ROOT, 'dist/server/index.js')).href
let n = 0
const freshMod = () => import(BUNDLE + '?t=' + Date.now() + '-' + (n++))

before(() => {
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: ROOT })
})

function mockApi(settings, initial = [], scanStore = null) {
  const records = [...initial]
  let sid = scanStore ? scanStore.length + 1000000 : 0
  const api = { filters: {}, hooks: {}, routes: {}, logs: [] }
  api.plugin = {
    id: 'instatic.consent', version: '1.0.0',
    log: (...a) => api.logs.push(a.join(' ')),
    assetUrl: (p) => {
      if (typeof p !== 'string' || p === '') throw new TypeError('assetUrl: path required')
      return '/uploads/plugins/instatic.consent/1.0.0' + '/' + p.replace(/^\/+/, '')
    },
  }
  api.cms = {
    settings: { getAll: () => settings },
    storage: { collection: (name) => {
      if (name === 'scan') {
        // every scan storage call is counted; scanDelay simulates slow storage
        const fail = async () => { api.scanCalls++; if (api.scanDelay) await new Promise((r) => setTimeout(r, api.scanDelay)); if (api.failScan) throw new Error('scan storage down') }
        // mimic the host: strip empty values, trim strings
        const clean = (data) => {
          const o = {}
          for (const [k, v] of Object.entries(data)) { if (v === undefined || v === null || v === '') continue; o[k] = typeof v === 'string' ? v.trim() : v }
          return o
        }
        return {
          list: async (q = {}) => {
            await fail()
            const limit = q.limit === undefined ? 100 : q.limit
            if (limit > 1000) throw new Error('limit must be <= 1000')
            const offset = q.offset || 0
            ;(api.scanListQueries ||= []).push(q)
            // like the host: a data-field orderBy gives a stable order
            const keys = Object.entries(q.orderBy || {})
            const rows = keys.length ? api.scan.slice().sort((a, b) => { for (const [k, d] of keys) { const x = String(a.data[k] ?? ''), y = String(b.data[k] ?? ''); if (x !== y) return (x < y ? -1 : 1) * (d === 'desc' ? -1 : 1) } return 0 }) : api.scan
            return { records: rows.slice(offset, offset + limit).map((r) => ({ ...r })), totalCount: api.scan.length }
          },
          create: async (data) => {
            await fail()
            // failHostCreate: creating host rows fails, the summary row still works
            if (api.failHostCreate && data.host !== 'Zusammenfassung') throw new Error('host row rejected')
            api.scanWrites++; api.scanCreated.push([data.host, Date.now()]); const r = { id: 's' + ++sid, data: clean(data) }; api.scan.push(r); return { id: r.id, data: r.data } },
          update: async (id, data) => { await fail(); api.scanWrites++; const r = api.scan.find((x) => x.id === id); r.data = clean(data); return r },
          delete: async (id) => { await fail(); api.scanWrites++; api.scan.splice(api.scan.findIndex((x) => x.id === id), 1) },
        }
      }
      // 1.2.1: versions and version-snapshots are separate stores; like the host,
      // create/update keep only the manifest fields, drop empty values and trim
      const FIELDS = { versions: ['revision', 'createdAt', 'summary', 'fingerprint'], 'version-snapshots': ['revision', 'snapshot'] }
      const keep = (data) => {
        const o = {}
        for (const k of FIELDS[name] || Object.keys(data)) { const v = data[k]; if (v === undefined || v === null || v === '') continue; o[k] = typeof v === 'string' ? v.trim() : v }
        return o
      }
      const store = name === 'versions' ? records : api.snaps
      const pfx = name === 'versions' ? 'r' : 'v'
      return {
        list: async (q = {}) => {
          if (name === 'versions' && api.versionsDelay) await new Promise((r) => setTimeout(r, api.versionsDelay))
          if (name !== 'versions' && api.failSnaps) throw new Error('snapshots down')
          if ((q.limit || 100) > 1000) throw new Error('limit must be <= 1000')
          return { records: store.map((data, i) => ({ id: pfx + i, data })), totalCount: store.length }
        },
        create: async (data) => {
          await new Promise((r) => setTimeout(r, 5))
          if (name !== 'versions' && api.failSnaps) throw new Error('snapshots down')
          store.push(keep(data)); return { id: pfx + (store.length - 1), data: store[store.length - 1] }
        },
        update: async (id, data) => { const i = Number(String(id).slice(1)); store[i] = keep(data); return { id, data: store[i] } },
      }
    } },
    hooks: { on: (n, f) => (api.hooks[n] = f), filter: (n, f) => (api.filters[n] = f) },
    routes: { get: (p, cap, f) => (api.routes[p] = f) },
  }
  api.records = records
  api.snaps = []
  api.scanCreated = []
  api.scan = scanStore || []
  api.scanWrites = 0
  api.scanCalls = 0
  return api
}

const PAGE = `<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'self'; frame-src 'none'"></head><body><iframe src="https://www.youtube.com/embed/x"></iframe></body></html>`

test('bundle passes the sandbox literal scan', () => {
  const src = readFileSync(join(ROOT, 'dist/server/index.js'), 'utf8')
  for (const lit of ["'node:", '"node:', "'bun:", '"bun:', 'require(', 'process.binding', 'globalThis.process.env']) assert.ok(!src.includes(lit), lit)
  assert.ok(!/^\s*import\s/m.test(src))
})

test('bundle exports only activate', async () => {
  assert.deepEqual(Object.keys(await freshMod()), ['activate'])
})

test('generated plugin.json contains service settings', () => {
  const m = JSON.parse(readFileSync(join(ROOT, 'dist/plugin.json'), 'utf8'))
  assert.equal(m.id, 'instatic.consent')
  assert.ok(m.settings.find((s) => s.id === 'svc_youtube'))
})

test('filter processes pages and archives a version once per fingerprint', async () => {
  const mod = await freshMod()
  const api = mockApi({ enabled: true, svc_youtube: true })
  mod.activate(api)
  assert.equal(api.hooks['publish.before'], undefined)
  const out = await api.filters['publish.html'](PAGE, { slug: 'index' })
  assert.match(out, /data-cc-embed/)
  assert.match(out, /"revision":1/)
  await api.filters['publish.html'](PAGE, { slug: 'kontakt' })
  assert.equal(api.records.length, 1)
  const route = await api.routes['/versions']()
  assert.equal(route.versions[0].revision, 1)
})

test('changed settings create revision 2 on next page', async () => {
  const mod = await freshMod()
  const settings = { enabled: true, svc_youtube: true }
  const api = mockApi(settings)
  mod.activate(api)
  await api.filters['publish.html'](PAGE, { slug: 'index' })
  settings.svc_vimeo = true
  const out = await api.filters['publish.html'](PAGE, { slug: 'index' })
  assert.match(out, /"revision":2/)
  assert.equal(api.records.length, 2)
})

test('concurrent publish.html calls create exactly one version', async () => {
  const mod = await freshMod()
  const api = mockApi({ enabled: true, svc_youtube: true })
  mod.activate(api)
  const outs = await Promise.all(Array.from({ length: 6 }, (_, i) => api.filters['publish.html'](PAGE, { slug: 'p' + i })))
  assert.equal(api.records.length, 1)
  for (const o of outs) assert.match(o, /"revision":1/)
})

test('fresh state with matching stored version reuses its revision', async () => {
  const settings = { enabled: true, svc_youtube: true }
  const seed = mockApi(settings)
  ;(await freshMod()).activate(seed)
  await seed.filters['publish.html'](PAGE, { slug: 'index' })
  const stored = { ...seed.records[0], revision: 7 }
  const mod = await freshMod()
  const api = mockApi(settings, [stored])
  mod.activate(api)
  const out = await api.filters['publish.html'](PAGE, { slug: 'index' })
  assert.match(out, /"revision":7/)
  assert.equal(api.records.length, 1)
})

test('storage failure publishes a normal blocked page with config, no safe mode', async () => {
  const mod = await freshMod()
  const api = mockApi({ enabled: true, svc_youtube: true })
  api.cms.storage.collection = () => { throw new Error('storage down') }
  mod.activate(api)
  for (const slug of ['index', 'kontakt']) {
    const out = await api.filters['publish.html'](PAGE, { slug })
    assert.ok(!out.includes('data-cc-error'))
    assert.match(out, /<script type="application\/json" id="cc-config">/)
    assert.match(out, /data-cc-embed data-cc-done data-service="youtube"/)
    assert.ok(!/<iframe/.test(out))
    assert.match(out, /"revision":0/)
  }
  assert.equal(api.logs.filter((l) => /version archive unavailable.*storage down/.test(l)).length, 1)
})

test('storage failure after a successful sync keeps the last known revision', async () => {
  const mod = await freshMod()
  const settings = { enabled: true, svc_youtube: true }
  const api = mockApi(settings)
  mod.activate(api)
  await api.filters['publish.html'](PAGE, { slug: 'index' })
  api.cms.storage.collection = () => ({ list: async () => { throw new Error('storage down') } })
  settings.svc_vimeo = true
  const out = await api.filters['publish.html'](PAGE, { slug: 'index' })
  assert.match(out, /"revision":1/)
  assert.ok(!out.includes('data-cc-error'))
  assert.match(out, /id="cc-config"/)
  assert.ok(!/<iframe/.test(out))
})

test('if the page cannot be processed, iframes are still neutralised', async () => {
  const mod = await freshMod()
  const api = mockApi({ enabled: true, svc_youtube: true })
  api.cms.settings.getAll = () => { throw new Error('settings broken') }
  mod.activate(api)
  const out = await api.filters['publish.html'](PAGE, { slug: 'index' })
  assert.ok(out.includes('<html data-cc-error'))
  assert.ok(out.includes('<iframe data-cc-src="https://www.youtube.com/embed/x">'))
  assert.ok(!/ src="https:/.test(out))
  assert.ok(!/id="cc-config"/.test(out))
  assert.ok(api.logs.some((l) => /settings broken/.test(l)))
})

test('publish scan: rows written once, second identical publish writes nothing', async () => {
  const mod = await freshMod()
  const api = mockApi({ enabled: true, svc_youtube: true })
  mod.activate(api)
  const page = '<html><head><meta http-equiv="Content-Security-Policy" content="script-src \'self\'; frame-src \'none\'"></head><body><iframe src="https://www.youtube.com/embed/a"></iframe><img src="https://img.example.com/a.png"></body></html>'
  const out = await api.filters['publish.html'](page, { slug: 'home' })
  assert.ok(out.includes('data-cc-embed'))
  // 1.2.1: two host rows plus the summary row
  assert.equal(api.scan.length, 3)
  const writes = api.scanWrites
  await api.filters['publish.html'](page, { slug: 'home' })
  assert.equal(api.scanWrites, writes)
})

test('publish scan failure never affects the page', async () => {
  const mod = await freshMod()
  const api = mockApi({ enabled: true, svc_youtube: true })
  api.failScan = true // scan collection list/create throw
  mod.activate(api)
  const out = await api.filters['publish.html']('<html><head></head><body><iframe src="https://www.youtube.com/embed/a"></iframe></body></html>', { slug: 'home' })
  assert.ok(out.includes('data-cc-embed') && !/<iframe[^>]+src="https:\/\/www\.youtube/.test(out))
  assert.ok(api.logs.some((l) => l.includes('scan list unavailable')))
})

test('scan disabled: no scan storage access', async () => {
  const mod = await freshMod()
  const api = mockApi({ enabled: true, svc_youtube: true, scanEnabled: false })
  mod.activate(api)
  await api.filters['publish.html']('<html><head></head><body><img src="https://img.example.com/a.png"></body></html>', { slug: 'home' })
  assert.equal(api.scan.length, 0)
})

test('manifest declares scan resource, admin pages and permission', () => {
  const m = JSON.parse(readFileSync(join(ROOT, 'dist/plugin.json'), 'utf8'))
  assert.ok(m.permissions.includes('admin.navigation'))
  assert.ok(m.resources.some((r) => r.id === 'scan'))
  assert.deepEqual(m.adminPages.map((p) => p.content.resource), ['scan', 'versions'])
  // lastSeen only advances when a row is written: it is the time of the last change
  assert.equal(m.resources.find((r) => r.id === 'scan').fields.find((f) => f.id === 'lastSeen').label, 'Last changed')
})

test('after a restart, unchanged pages do not rewrite stored scan rows', async () => {
  const settings = { enabled: true, svc_youtube: true }
  const page = '<html><head></head><body><iframe src="https://www.youtube.com/embed/a"></iframe><img src="https://img.example.com/a.png"></body></html>'
  const first = mockApi(settings)
  ;(await freshMod()).activate(first)
  await first.filters['publish.html'](page, { slug: 'home' })
  // 1.2.1: two host rows plus the summary row; the summary is not rewritten either
  assert.equal(first.scan.length, 3)
  const second = mockApi(settings, [], first.scan)
  ;(await freshMod()).activate(second)
  await second.filters['publish.html'](page, { slug: 'home' })
  assert.equal(second.scanWrites, 0)
  assert.equal(second.scan.length, 3)
})

// Since the final fixes at most 25 storage calls run per filter call; the remaining
// stale deletions are drained by later calls.
test('more than 1000 stale scan rows are all deleted, paging with limit 1000', async () => {
  const stale = Array.from({ length: 2300 }, (_, i) => ({ id: 'old' + i, data: { host: 'h' + i + '.example.com', pages: 'home', kinds: 'image', generation: 99999 } }))
  const api = mockApi({ enabled: true, svc_youtube: true }, [], stale)
  ;(await freshMod()).activate(api)
  const left = () => api.scan.filter((r) => r.data.host !== 'Zusammenfassung').length
  for (let i = 0; i < 100 && left(); i++) {
    api.scanCalls = 0
    await api.filters['publish.html']('<html><head></head><body><p>x</p></body></html>', { slug: 'home' })
    assert.ok(api.scanCalls <= 25, 'calls: ' + api.scanCalls)
  }
  assert.equal(left(), 0)
  // paging uses a stable data-field order (the host default created_at desc has ties)
  assert.ok(api.scanListQueries.length >= 3)
  for (const q of api.scanListQueries) assert.deepEqual(q.orderBy, { host: 'asc', lastSeen: 'asc' })
  // 1.2.1: once the queue is drained, the summary row is written (page without findings)
  await api.filters['publish.html']('<html><head></head><body><p>x</p></body></html>', { slug: 'home' })
  assert.deepEqual(api.scan.map((r) => r.data.pages), ['1 Seite geprüft · 0 fremde Server im HTML'])
  assert.equal(api.logs.filter((l) => l.includes('scan list unavailable')).length, 0)
})

// ---- final fixes: deadline and storage budget of the publish scan ----

const SCAN_PAGE = `<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'self'; frame-src 'none'"></head><body><iframe src="https://www.youtube.com/embed/a"></iframe><img src="https://img.example.com/a.png"></body></html>`
const checkPage = (out) => {
  assert.match(out, /data-cc-embed data-cc-done data-service="youtube"/)
  assert.ok(!/<iframe/.test(out))
  assert.match(out, /id="cc-config"/)
}

test('reset with 300 stale rows: at most 25 storage calls per filter call, queue drains on later calls', async () => {
  const stale = Array.from({ length: 300 }, (_, i) => ({ id: 'old' + i, data: { host: 'h' + i + '.example.com', pages: 'home', kinds: 'image', generation: 0 } }))
  const api = mockApi({ enabled: true, svc_youtube: true, scanReset: 1 }, [], stale)
  ;(await freshMod()).activate(api)
  checkPage(await api.filters['publish.html'](SCAN_PAGE, { slug: 'home' }))
  assert.ok(api.scanCalls <= 25, 'calls: ' + api.scanCalls)
  assert.ok(api.scan.length > 2)
  let calls = 1
  // 1.2.1: the summary row is written last, after the queue has drained
  while (api.scan.some((r) => r.data.generation === 0) || api.scan.length < 3) {
    api.scanCalls = 0
    checkPage(await api.filters['publish.html'](SCAN_PAGE, { slug: 'home' }))
    assert.ok(api.scanCalls <= 25, 'calls: ' + api.scanCalls)
    assert.ok(++calls < 30, 'queue does not drain')
  }
  assert.deepEqual(api.scan.map((r) => r.data.host).sort(), ['Zusammenfassung', 'img.example.com', 'www.youtube.com'])
  assert.equal(api.scan[api.scan.length - 1].data.host, 'Zusammenfassung')
  // drained: an unchanged page causes no further storage calls
  api.scanCalls = 0
  await api.filters['publish.html'](SCAN_PAGE, { slug: 'home' })
  assert.equal(api.scanCalls, 0)
})

test('slow scan storage: the filter returns within 3 s with the transformed page', async () => {
  const stale = Array.from({ length: 300 }, (_, i) => ({ id: 'old' + i, data: { host: 'h' + i + '.example.com', pages: 'home', kinds: 'image', generation: 0 } }))
  const api = mockApi({ enabled: true, svc_youtube: true, scanReset: 1 }, [], stale)
  api.scanDelay = 200
  ;(await freshMod()).activate(api)
  const t = Date.now()
  checkPage(await api.filters['publish.html'](SCAN_PAGE, { slug: 'home' }))
  assert.ok(Date.now() - t < 3000, 'took ' + (Date.now() - t))
  assert.ok(api.scanCalls > 0 && api.scanCalls <= 14, 'calls: ' + api.scanCalls)
})

test('the scan is skipped when the filter is already 1.5 s old', async () => {
  const api = mockApi({ enabled: true, svc_youtube: true })
  api.versionsDelay = 1600
  ;(await freshMod()).activate(api)
  checkPage(await api.filters['publish.html'](SCAN_PAGE, { slug: 'home' }))
  assert.equal(api.scanCalls, 0)
  api.versionsDelay = 0
  await api.filters['publish.html'](SCAN_PAGE, { slug: 'home' })
  // 1.2.1: two host rows plus the summary row, which reports the skipped scan
  assert.equal(api.scan.length, 3)
  const sum = api.scan.find((r) => r.data.host === 'Zusammenfassung').data
  assert.equal(sum.status, 'error')
  assert.equal(sum.hint, 'Scan übersprungen (Zeitbudget)')
})

test('config errors are logged whenever they change, also for the scan host lists', async () => {
  const settings = { enabled: true, svc_youtube: true, scanOwnHosts: '*.github.io' }
  const api = mockApi(settings)
  ;(await freshMod()).activate(api)
  const errs = () => api.logs.filter((l) => l.startsWith('consent config:'))
  await api.filters['publish.html'](SCAN_PAGE, { slug: 'home' })
  assert.equal(errs().length, 1)
  await api.filters['publish.html'](SCAN_PAGE, { slug: 'home' })
  assert.equal(errs().length, 1)
  settings.scanAllowHosts = 'not a host'
  await api.filters['publish.html'](SCAN_PAGE, { slug: 'home' })
  assert.equal(errs().length, 3)
  assert.ok(errs().some((l) => l.includes('scanAllowHosts')))
})

// ---- 1.2.1: summary row ----

const summaryRows = (api) => api.scan.filter((r) => r.data.host === 'Zusammenfassung')
const IMG_PAGE = (imgs) => `<html><head></head><body>${imgs.map((h) => `<img src="https://${h}/a.png">`).join('')}</body></html>`

test('summary row: created on the first scan and kept on top', async () => {
  const api = mockApi({ enabled: true, svc_youtube: true })
  ;(await freshMod()).activate(api)
  await api.filters['publish.html'](SCAN_PAGE, { slug: 'home' })
  const s = summaryRows(api)
  assert.equal(s.length, 1)
  assert.equal(api.scan[api.scan.length - 1], s[0])
  assert.deepEqual(s[0].data, { host: 'Zusammenfassung', status: 'ok', pages: '1 Seite geprüft · 2 fremde Server im HTML', lastSeen: s[0].data.lastSeen, generation: 0 })
  assert.ok(!Number.isNaN(Date.parse(s[0].data.lastSeen)))
})

test('summary row: unchanged re-render writes nothing, a new host replaces it once', async () => {
  const api = mockApi({ enabled: true, svc_youtube: true })
  ;(await freshMod()).activate(api)
  await api.filters['publish.html'](IMG_PAGE(['a.example.com']), { slug: 'home' })
  const first = summaryRows(api)[0].id
  let w = api.scanWrites
  await api.filters['publish.html'](IMG_PAGE(['a.example.com']), { slug: 'home' })
  assert.equal(api.scanWrites, w)
  // new host: one create for the host, create + delete for the summary
  await api.filters['publish.html'](IMG_PAGE(['a.example.com', 'b.example.com']), { slug: 'home' })
  assert.equal(api.scanWrites - w, 3)
  const s = summaryRows(api)
  assert.equal(s.length, 1)
  assert.notEqual(s[0].id, first)
  assert.equal(api.scan[api.scan.length - 1], s[0])
  assert.equal(s[0].data.pages, '1 Seite geprüft · 2 fremde Server im HTML')
  // a second page without new hosts changes the page count
  w = api.scanWrites
  await api.filters['publish.html'](IMG_PAGE(['a.example.com']), { slug: 'about' })
  assert.equal(summaryRows(api)[0].data.pages, '2 Seiten geprüft · 2 fremde Server im HTML')
  assert.equal(api.scanWrites - w, 3) // row update + summary create + delete
})

test('summary row: same counts within 10 minutes are not rewritten, later they are', async () => {
  const real = Date.now
  let offset = 0
  Date.now = () => real() + offset
  try {
    const api = mockApi({ enabled: true, svc_youtube: true })
    ;(await freshMod()).activate(api)
    await api.filters['publish.html'](IMG_PAGE(['a.example.com']), { slug: 'home' })
    const before = summaryRows(api)[0].data.lastSeen
    // a changed row (new kind on a known host) with the same counts
    let w = api.scanWrites
    await api.filters['publish.html'](IMG_PAGE(['a.example.com']).replace('</body>', '<video src="https://a.example.com/v.mp4"></video></body>'), { slug: 'home' })
    assert.equal(api.scanWrites - w, 1)
    offset = 11 * 60 * 1000
    w = api.scanWrites
    await api.filters['publish.html'](IMG_PAGE(['a.example.com']).replace('</body>', '<link rel="stylesheet" href="https://a.example.com/s.css"></body>'), { slug: 'home' })
    assert.equal(api.scanWrites - w, 3)
    assert.ok(summaryRows(api)[0].data.lastSeen > before)
  } finally { Date.now = real }
})

test('summary row: a failing host row sets status error and hint, never throws', async () => {
  const api = mockApi({ enabled: true, svc_youtube: true })
  api.failHostCreate = true
  ;(await freshMod()).activate(api)
  checkPage(await api.filters['publish.html'](SCAN_PAGE, { slug: 'home' }))
  const s = summaryRows(api)
  assert.equal(s.length, 1)
  assert.equal(s[0].data.status, 'error')
  assert.equal(s[0].data.hint, 'Speicher nicht erreichbar: host row rejected')
  assert.equal(s[0].data.pages, '1 Seite geprüft · 2 fremde Server im HTML')
  // the summary write fails as well: still no exception, the page is unaffected
  api.failScan = true
  checkPage(await api.filters['publish.html'](SCAN_PAGE, { slug: 'about' }))
  // storage back: rows are written, the error stays visible for this publish run
  api.failScan = false
  api.failHostCreate = false
  await api.filters['publish.html'](SCAN_PAGE, { slug: 'home' })
  assert.deepEqual(api.scan.map((r) => r.data.host).sort(), ['Zusammenfassung', 'img.example.com', 'www.youtube.com'])
  assert.equal(summaryRows(api)[0].data.status, 'error')
})

test('summary row: the error is cleared by the next publish run', async () => {
  const real = Date.now
  let offset = 0
  Date.now = () => real() + offset
  try {
    const api = mockApi({ enabled: true, svc_youtube: true })
    api.failHostCreate = true
    ;(await freshMod()).activate(api)
    await api.filters['publish.html'](SCAN_PAGE, { slug: 'home' })
    api.failHostCreate = false
    offset = 2 * 60 * 1000
    await api.filters['publish.html'](SCAN_PAGE, { slug: 'home' })
    const s = summaryRows(api)
    assert.equal(s.length, 1)
    assert.equal(s[0].data.status, 'ok')
    assert.equal(s[0].data.hint, undefined)
  } finally { Date.now = real }
})

// ---- 1.2.1: readable versions list, snapshots in their own resource ----

test('manifest: versions show a summary, snapshots live in version-snapshots without admin page', () => {
  const m = JSON.parse(readFileSync(join(ROOT, 'dist/plugin.json'), 'utf8'))
  const v = m.resources.find((r) => r.id === 'versions')
  assert.deepEqual(v.fields.map((f) => f.id), ['revision', 'createdAt', 'summary', 'fingerprint'])
  const s = m.resources.find((r) => r.id === 'version-snapshots')
  assert.deepEqual(s.fields.map((f) => [f.id, f.type, !!f.required]), [['revision', 'number', true], ['snapshot', 'longtext', false]])
  assert.ok(!m.adminPages.some((p) => p.content.resource === 'version-snapshots'))
})

test('a new revision writes the version with summary and its snapshot', async () => {
  const api = mockApi({ enabled: true, svc_youtube: true, svc_vimeo: true, formality: 'du', layout: 'box', validityMonths: 6 })
  ;(await freshMod()).activate(api)
  await api.filters['publish.html'](PAGE, { slug: 'index' })
  assert.equal(api.records.length, 1)
  assert.equal(api.records[0].summary, 'YouTube, Vimeo an · Text kurz · Du · 6 Monate · Layout kompakt')
  assert.equal(api.records[0].snapshot, undefined)
  assert.equal(api.snaps.length, 1)
  assert.equal(api.snaps[0].revision, 1)
  const snap = JSON.parse(api.snaps[0].snapshot)
  assert.ok(snap.client.services.some((s) => s.id === 'youtube' && s.enabled))
  // the list route has no snapshots, the snapshot route returns one revision
  const list = await api.routes['/versions']()
  assert.equal(list.versions[0].summary, api.records[0].summary)
  assert.ok(!('snapshot' in list.versions[0]))
  const one = await api.routes['/versions/snapshot']({ req: { url: 'http://localhost/api/plugins/instatic.consent/versions/snapshot?revision=1' } })
  assert.deepEqual(Object.keys(one).sort(), ['createdAt', 'fingerprint', 'revision', 'snapshot', 'summary'])
  assert.equal(one.revision, 1)
  assert.equal(one.snapshot, api.snaps[0].snapshot)
  const missing = await api.routes['/versions/snapshot']({ req: { url: 'http://localhost/x?revision=9' } })
  assert.equal(missing.status, 404)
})

test('summary text: no active services, detailed text, Sie, singular month, bar layout', async () => {
  const api = mockApi({ enabled: true, textStyle: 'detailed', layout: 'bar', validityMonths: 1 })
  ;(await freshMod()).activate(api)
  await api.filters['publish.html'](PAGE, { slug: 'index' })
  assert.equal(api.records[0].summary, 'keine Dienste aktiv · Text ausführlich · Sie · 1 Monat · Layout leiste')
})

test('old version records are migrated: snapshot moved, summary derived', async () => {
  const snapshot = JSON.stringify({ client: { layout: 'wide', validityDays: 360, services: [{ id: 'youtube', label: 'YouTube', enabled: true }, { id: 'vimeo', label: 'Vimeo', enabled: false }] }, csp: {}, loaders: [] })
  const old = [
    { revision: 1, fingerprint: 'aaa', createdAt: '2026-01-01T00:00:00.000Z', snapshot },
    { revision: 2, fingerprint: 'bbb', createdAt: '2026-02-01T00:00:00.000Z', snapshot: 'not json' },
  ]
  const api = mockApi({ enabled: true, svc_youtube: true }, old)
  api.snaps.push({ revision: 2, snapshot: 'not json' }) // already moved earlier
  ;(await freshMod()).activate(api)
  const out = await api.filters['publish.html'](PAGE, { slug: 'index' })
  assert.match(out, /"revision":3/)
  assert.equal(api.records[0].summary, '(ältere Version) · YouTube an · 12 Monate · Layout breit')
  assert.equal(api.records[1].summary, '(ältere Version)')
  assert.ok(!('snapshot' in api.records[0]) && !('snapshot' in api.records[1]))
  assert.deepEqual(api.snaps.map((s) => s.revision).sort(), [1, 2, 3])
  const one = await api.routes['/versions/snapshot']({ req: { url: 'http://x/?revision=1' } })
  assert.equal(one.snapshot, snapshot)
  assert.equal(one.summary, api.records[0].summary)
})

test('a failing snapshot store never breaks publishing', async () => {
  const api = mockApi({ enabled: true, svc_youtube: true }, [{ revision: 1, fingerprint: 'aaa', createdAt: 't', snapshot: '{}' }])
  api.failSnaps = true
  ;(await freshMod()).activate(api)
  const out = await api.filters['publish.html'](PAGE, { slug: 'index' })
  assert.match(out, /"revision":2/)
  assert.ok(!out.includes('data-cc-error'))
  assert.equal(api.records.length, 2)
  assert.ok(api.logs.some((l) => l.includes('snapshots down')))
})

// ---- 1.2.1 fix round ----

test('summary row is created at least 2 ms after the last host row (created_at tie)', async () => {
  const api = mockApi({ enabled: true, svc_youtube: true })
  ;(await freshMod()).activate(api)
  await api.filters['publish.html'](SCAN_PAGE, { slug: 'home' })
  const hosts = api.scanCreated.filter(([h]) => h !== 'Zusammenfassung')
  const sum = api.scanCreated.find(([h]) => h === 'Zusammenfassung')
  assert.ok(sum[1] - hosts[hosts.length - 1][1] >= 2, JSON.stringify(api.scanCreated))
})

test('a late re-render of a scanned page is not reported as skipped', async () => {
  const settings = { enabled: true, svc_youtube: true }
  const api = mockApi(settings)
  ;(await freshMod()).activate(api)
  await api.filters['publish.html'](SCAN_PAGE, { slug: 'home' })
  // a settings change makes the version sync slow: the scan of "home" is skipped
  api.versionsDelay = 1600
  settings.svc_vimeo = true
  await api.filters['publish.html'](SCAN_PAGE, { slug: 'home' })
  api.versionsDelay = 0
  await api.filters['publish.html'](SCAN_PAGE, { slug: 'home' })
  const s = summaryRows(api)[0].data
  assert.equal(s.status, 'ok')
  assert.equal(s.hint, undefined)
})

test('summary counts third-party hosts only (no own hosts, no inline snippets)', async () => {
  const api = mockApi({ enabled: true, svc_youtube: true, scanOwnHosts: 'cdn.example.com' })
  ;(await freshMod()).activate(api)
  const page = '<html><head></head><body><img src="https://cdn.example.com/a.png"><img src="https://img.example.org/a.png"><script>window._hjSettings={}</script></body></html>'
  await api.filters['publish.html'](page, { slug: 'home' })
  assert.equal(api.scan.length, 4) // own host, foreign host, inline hint, summary
  assert.equal(summaryRows(api)[0].data.pages, '1 Seite geprüft · 1 fremder Server im HTML')
})

test('a new own-host or inline row (summary text unchanged) still gets the summary recreated after it', async () => {
  const api = mockApi({ enabled: true, svc_youtube: true, scanOwnHosts: 'cdn.example.com' })
  ;(await freshMod()).activate(api)
  await api.filters['publish.html'](SCAN_PAGE, { slug: 'home' })
  const before = summaryRows(api)[0].id
  for (const extra of ['<script>gtag("js", new Date())</script>', '<img src="https://cdn.example.com/a.png">']) {
    const created = api.scan.length
    await api.filters['publish.html'](SCAN_PAGE.replace('</body>', extra + '</body>'), { slug: 'home' })
    assert.equal(api.scan.length, created + 1)
    assert.equal(summaryRows(api).length, 1)
    assert.equal(api.scan[api.scan.length - 1].data.host, 'Zusammenfassung')
  }
  assert.notEqual(summaryRows(api)[0].id, before)
  assert.equal(summaryRows(api)[0].data.pages, '1 Seite geprüft · 2 fremde Server im HTML')
})
