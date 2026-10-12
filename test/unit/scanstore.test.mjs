import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildConfig } from '../../server/lib/config.js'
import { scanHtml } from '../../server/lib/scan.js'
import { applyPageScan, scanRowsFromStorage, scanSummaryData, scanSummaryDue, scanSlugsFromModel, SCAN_SUMMARY_HOST } from '../../server/lib/scanstore.js'

const cfg = buildConfig({ enabled: true, svc_youtube: true }, { assetBase: '/p/' })
const ctx = { services: cfg.services, own: [], allow: ['jobs.example.org'] }
const f = (html) => scanHtml(html, cfg.services)
const A = '<iframe src="https://www.youtube.com/embed/a"></iframe><img src="https://img.example.com/a.png">'

test('first scan creates rows with status', () => {
  const m = new Map()
  const ops = applyPageScan(m, 'home', f(A), ctx, 't1', 0)
  assert.deepEqual(ops.map((o) => o.op), ['create', 'create'])
  const yt = ops.find((o) => o.key === 'www.youtube.com').data
  assert.equal(yt.status, 'covered'); assert.equal(yt.pages, 'home'); assert.equal(yt.kinds, 'iframe'); assert.equal(yt.firstSeen, 't1')
  assert.equal(ops.find((o) => o.key === 'img.example.com').data.status, 'unknown')
})

test('unchanged page writes nothing (lastSeen alone is no change)', () => {
  const m = new Map()
  for (const o of applyPageScan(m, 'home', f(A), ctx, 't1', 0)) if (o.op === 'create') m.get(o.key).id = 'id-' + o.key
  assert.deepEqual(applyPageScan(m, 'home', f(A), ctx, 't2', 0), [])
})

// Since the final fixes rows are add-only (ctx.slug is not unique per page): a host
// dropped from a page keeps its row and page until scanReset.
test('second page adds slug; a host removed from a page stays listed (add-only)', () => {
  const m = new Map()
  for (const o of applyPageScan(m, 'home', f(A), ctx, 't1', 0)) m.get(o.key).id = 'id-' + o.key
  const ops2 = applyPageScan(m, 'about', f('<img src="https://img.example.com/b.png">'), ctx, 't2', 0)
  assert.deepEqual(ops2.map((o) => [o.op, o.key]), [['update', 'img.example.com']])
  assert.equal(ops2[0].data.pages, 'about\nhome')
  assert.deepEqual(applyPageScan(m, 'home', f('<p>no embeds</p>'), ctx, 't3', 0), [])
  assert.equal(m.get('www.youtube.com').data.pages, 'home')
})

test('alternating renders of two rows under one slug converge to zero writes', () => {
  const m = new Map()
  const rowA = f('<iframe src="https://widgets.example.net/a"></iframe><img src="https://img.example.com/a.png">')
  const rowB = f('<img src="https://img.example.com/b.png"><script src="https://jobs.example.org/w.js"></script><video src="https://img.example.com/v.mp4"></video>')
  const run = (fs, t) => { const ops = applyPageScan(m, 'jobs/entry', fs, ctx, t, 0); for (const o of ops) if (o.op === 'create') m.get(o.key).id = 'id-' + o.key; return ops }
  assert.ok(run(rowA, 't1').length > 0)
  assert.ok(run(rowB, 't2').length > 0)
  for (let i = 0; i < 3; i++) { assert.deepEqual(run(rowA, 't' + (3 + 2 * i)), []); assert.deepEqual(run(rowB, 't' + (4 + 2 * i)), []) }
  assert.equal(m.get('img.example.com').data.kinds, 'image,media')
  assert.equal(m.get('widgets.example.net').data.status, 'unknown')
})

test('row status: worst status of all findings wins', () => {
  const both = buildConfig({ enabled: true, svc_youtube: true, 'svc_google-maps': true }, { assetBase: '/p/' }).services
  const c2 = { services: both, own: [], allow: [] }
  const m = new Map()
  // covered iframe and an unblocked image on the same host: unblocked wins regardless of order
  const ops = applyPageScan(m, 'home', scanHtml('<iframe src="https://maps.google.com/maps?q=x"></iframe><img src="https://maps.google.com/maps/api/staticmap">', both), c2, 't', 0)
  assert.equal(ops[0].data.status, 'unblocked')
  assert.equal(ops[0].data.service, 'google-maps')
  const m2 = new Map()
  applyPageScan(m2, 'a', scanHtml('<img src="https://maps.google.com/maps/api/staticmap">', both), c2, 't', 0)
  for (const v of m2.values()) v.id = 'x'
  // a later page with only the covered iframe does not turn the row green
  const ops2 = applyPageScan(m2, 'b', scanHtml('<iframe src="https://maps.google.com/maps?q=x"></iframe>', both), c2, 't2', 0)
  assert.deepEqual(ops2.map((o) => o.data.status), ['unblocked'])
  assert.equal(m2.get('maps.google.com').data.status, 'unblocked')
  assert.equal(m2.get('maps.google.com').data.kinds, 'iframe,image')
})

test('a changed classification context replaces the status on the next render', () => {
  const m = new Map()
  const c1 = { ...ctx, sig: 1 }
  for (const o of applyPageScan(m, 'home', f('<img src="https://img.example.com/a.png">'), c1, 't1', 0)) m.get(o.key).id = 'x'
  assert.equal(m.get('img.example.com').data.status, 'unknown')
  // same context: allow-listing alone (without a new sig) cannot improve it
  assert.deepEqual(applyPageScan(m, 'home', f('<img src="https://img.example.com/a.png">'), { ...c1, allow: ['img.example.com'] }, 't2', 0), [])
  const c2 = { ...ctx, allow: ['img.example.com'], sig: 2 }
  const ops = applyPageScan(m, 'home', f('<img src="https://img.example.com/a.png">'), c2, 't3', 0)
  assert.equal(ops[0].data.status, 'allowed')
  assert.equal(ops[0].data.lastSeen, 't3')
})

test('unknown iframe gets a suggestion, allow list changes status', () => {
  const m = new Map()
  const ops = applyPageScan(m, 'jobs', f('<iframe src="https://widgets.example.net/x"></iframe><script src="https://jobs.example.org/w.js"></script>'), ctx, 't', 0)
  const w = ops.find((o) => o.key === 'widgets.example.net').data
  assert.equal(w.status, 'unknown'); assert.match(w.suggestion, /"id": "widgets-example-net"/)
  const j = ops.find((o) => o.key === 'jobs.example.org').data
  assert.equal(j.status, 'allowed'); assert.equal(j.suggestion, '')
})

// 1.2.1: the admin list stretches every cell to the tallest one, so the
// pages cell is capped at 10 (was 50).
test('pages list is capped at 10 with a remainder line', () => {
  const m = new Map()
  let last
  for (let i = 0; i < 15; i++) for (const o of applyPageScan(m, 'p' + String(i).padStart(2, '0'), f('<img src="https://img.example.com/a.png">'), ctx, 't', 0)) { if (o.op === 'create') m.get(o.key).id = 'x'; last = o }
  const lines = last.data.pages.split('\n')
  assert.equal(lines.length, 11); assert.equal(lines[10], '+5 weitere')
  assert.equal(m.get('img.example.com').pageList.length, 15)
})

test('after a restart the hidden page count is kept (approximately)', () => {
  const pages = ['p00', 'p01', 'p02', 'p03', 'p04', 'p05', 'p06', 'p07', 'p08', 'p09', '+5 weitere'].join('\n')
  const { model } = scanRowsFromStorage([{ id: 'a', data: { host: 'img.example.com', status: 'unknown', kinds: 'image', pages, firstSeen: 't', lastSeen: 't', generation: 0 } }], 0)
  const img = '<img src="https://img.example.com/a.png">'
  // a visible page and a page that sorts after the visible ones (assumed hidden): no write
  assert.deepEqual(applyPageScan(model, 'p03', f(img), ctx, 't2', 0), [])
  assert.deepEqual(applyPageScan(model, 'p12', f(img), ctx, 't2', 0), [])
  // a page that sorts before the last visible one cannot have been hidden: one more
  const ops = applyPageScan(model, 'a-new', f(img), ctx, 't3', 0)
  assert.equal(ops.length, 1)
  const lines = ops[0].data.pages.split('\n')
  assert.equal(lines[0], 'a-new'); assert.equal(lines[10], '+6 weitere')
})

test('rows of another generation are stale', () => {
  const { model, stale } = scanRowsFromStorage([{ id: 'a', data: { host: 'x.example.com', pages: 'home', generation: 0, kinds: 'image' } }, { id: 'b', data: { host: 'y.example.com', pages: 'home', generation: 2, kinds: 'image' } }], 2)
  assert.deepEqual(stale, ['a']); assert.deepEqual([...model.keys()], ['y.example.com'])
  assert.deepEqual(model.get('y.example.com').pageList, ['home'])
})

// ---- 1.2.1: summary row ----

test('summary row data: counts, status and hint', () => {
  const ok = scanSummaryData(30, 2, '', 3, '2026-10-09T10:00:00.000Z')
  assert.equal(SCAN_SUMMARY_HOST, 'Zusammenfassung')
  assert.deepEqual(ok, { host: 'Zusammenfassung', status: 'ok', kinds: '', pages: '30 Seiten geprüft · 2 fremde Server im HTML', service: '', hint: '', suggestion: '', firstSeen: '', lastSeen: '2026-10-09T10:00:00.000Z', generation: 3 })
  const err = scanSummaryData(1, 1, 'Speicher nicht erreichbar: down', 0, 't')
  assert.equal(err.pages, '1 Seite geprüft · 1 fremder Server im HTML')
  assert.equal(err.status, 'error'); assert.equal(err.hint, 'Speicher nicht erreichbar: down')
  assert.ok(scanSummaryData(1, 1, 'x'.repeat(1000), 0, 't').hint.length <= 200)
})

test('summary throttle: same counts within 10 minutes write nothing', () => {
  const t0 = Date.parse('2026-10-09T10:00:00.000Z')
  // stored as the host returns it: empty strings dropped
  const stored = { host: 'Zusammenfassung', status: 'ok', pages: '2 Seiten geprüft · 1 fremder Server im HTML', lastSeen: new Date(t0).toISOString(), generation: 0 }
  const at = (ms, slugs = 2, rows = 1, error = '') => scanSummaryDue(stored, scanSummaryData(slugs, rows, error, 0, new Date(ms).toISOString()), ms)
  assert.equal(scanSummaryDue(null, scanSummaryData(0, 0, '', 0, 't'), t0), true)
  assert.equal(at(t0 + 60000), false)
  assert.equal(at(t0 + 9 * 60000), false)
  assert.equal(at(t0 + 10 * 60000), true)
  assert.equal(at(t0 + 60000, 3), true)
  assert.equal(at(t0 + 60000, 2, 2), true)
  assert.equal(at(t0 + 60000, 2, 1, 'Scan übersprungen (Zeitbudget)'), true)
})

test('the summary row is not part of the host model; old summaries are stale', () => {
  const recs = [
    { id: 'h', data: { host: 'img.example.com', status: 'unknown', kinds: 'image', pages: 'home\nabout', generation: 1 } },
    { id: 's1', data: { host: 'Zusammenfassung', status: 'ok', pages: '1 Seite geprüft · 1 fremder Server im HTML', lastSeen: '2026-10-09T10:00:00.000Z', generation: 1 } },
    { id: 's2', data: { host: 'Zusammenfassung', status: 'ok', pages: '2 Seiten geprüft · 1 fremder Server im HTML', lastSeen: '2026-10-09T11:00:00.000Z', generation: 1 } },
    { id: 's0', data: { host: 'Zusammenfassung', status: 'ok', pages: 'x', lastSeen: '2026-10-09T12:00:00.000Z', generation: 0 } },
  ]
  const { model, stale, summary } = scanRowsFromStorage(recs, 1)
  assert.deepEqual([...model.keys()], ['img.example.com'])
  assert.equal(summary.id, 's2')
  assert.equal(summary.data.hint, '')
  assert.deepEqual(stale.sort(), ['s0', 's1'])
  // slugs after a restart: union of the stored page lists
  assert.deepEqual([...scanSlugsFromModel(model)].sort(), ['about', 'home'])
})
