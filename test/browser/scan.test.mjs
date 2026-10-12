import { test, before, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { start, state } from './server.mjs'

const PORT = 8793
const HOME = `http://localhost:${PORT}/`
// 1.2.1: a dotted subdomain for the parent-domain cookie test; cookieStore
// needs a secure context, so the plain-http test origin is treated as secure
const PARENT = 'consent.example.com'
const SUB = `http://sub.${PARENT}:${PORT}/`
const WWW = `http://www.${PARENT}:${PORT}/`
let srv, browser, ctx, page
before(async () => {
  srv = await start(PORT)
  browser = await chromium.launch({ channel: process.env.CC_BROWSER_CHANNEL || 'msedge', args: [`--host-resolver-rules=MAP *.${PARENT} 127.0.0.1, MAP ${PARENT} 127.0.0.1`, `--unsafely-treat-insecure-origin-as-secure=${SUB.slice(0, -1)},${WWW.slice(0, -1)}`] })
})
after(async () => { await browser.close(); srv.close() })
beforeEach(async () => {
  // the check mode is off by default since 1.2.0 final fixes; these tests switch it on
  state.settings = { enabled: true, svc_youtube: true, privacyUrl: '/datenschutz', imprintUrl: '/impressum', scanBrowser: true }
  state.revision = 1
  ctx = await browser.newContext()
  // external hosts answer with an empty 200 (not 204: an iframe navigation
  // answered with 204 is cancelled and leaves no Resource Timing entry)
  await ctx.route('**/*', (r) => { const h = new URL(r.request().url()).hostname; return h === 'localhost' || h.endsWith(PARENT) ? r.continue() : r.fulfill({ status: 200, contentType: 'text/plain', body: '' }) })
  page = await ctx.newPage()
})
afterEach(async () => { await ctx.close() })

test('scan hooks: blocked log records static placeholders', async () => {
  await page.goto(HOME)
  const n = await page.evaluate(() => window.InstaticConsent._scan.blocked.filter((b) => b.how === 'static').length)
  assert.ok(n >= 1)
})

test('scan browser setting off: no hook object and hash ignored', async () => {
  state.settings.scanBrowser = false
  await page.goto(HOME + '#cc-scan')
  await page.waitForTimeout(300)
  assert.equal(await page.evaluate(() => window.InstaticConsent._scan), undefined)
  assert.equal(await page.locator('#cc-scan').count(), 0)
})

test('consentAt is set when the visitor decides', async () => {
  await page.goto(HOME)
  assert.equal(await page.evaluate(() => window.InstaticConsent._scan.consentAt()), null)
  await page.getByRole('button', { name: 'Alle ablehnen' }).click()
  assert.equal(typeof await page.evaluate(() => window.InstaticConsent._scan.consentAt()), 'number')
})

test('consentAt stays null for a returning visitor (decision from an earlier visit)', async () => {
  await page.goto(HOME)
  await page.getByRole('button', { name: 'Alle akzeptieren' }).click()
  await page.reload()
  await page.waitForTimeout(300)
  assert.equal(await page.evaluate(() => window.InstaticConsent._scan.consentAt()), null)
})

const report = () => page.evaluate(() => window.InstaticConsent._scanReport())

test('#cc-scan opens the panel; unblocked image before consent is a violation', async () => {
  await page.goto(HOME + '#cc-scan')
  await page.locator('#cc-scan').waitFor()
  const r = await report()
  const leak = r.hosts.find((h) => h.host === 'leak.example.net')
  assert.equal(leak.verdict, 'violation')
  assert.ok(r.summary.violations >= 1)
  assert.match(await page.locator('#cc-scan').innerText(), /Verst/)
})

test('after reject all, blocked youtube is listed and not a violation', async () => {
  await page.goto(HOME)
  await page.getByRole('button', { name: 'Alle ablehnen' }).click()
  await page.evaluate(() => { location.hash = '#cc-scan' })
  await page.locator('#cc-scan').waitFor()
  const r = await report()
  assert.ok(!r.hosts.some((h) => /youtube/.test(h.host)))
  assert.ok(r.blocked.some((b) => b.service === 'youtube'))
  assert.equal(r.consent.decided, true)
})

test('allow list turns a host into ok', async () => {
  state.settings.scanAllowHosts = 'leak.example.net'
  await page.goto(HOME + '#cc-scan')
  await page.locator('#cc-scan').waitFor()
  assert.equal((await report()).hosts.find((h) => h.host === 'leak.example.net').verdict, 'ok')
})

test('accepted service loaded after consent is ok; plugin cookie recognised', async () => {
  await page.goto(HOME)
  await page.getByRole('button', { name: 'Alle akzeptieren' }).click()
  await page.waitForTimeout(500)
  await page.reload()
  await page.evaluate(() => { location.hash = '#cc-scan' })
  await page.locator('#cc-scan').waitFor()
  const r = await report()
  const yt = r.hosts.find((h) => h.host === 'www.youtube-nocookie.com')
  assert.ok(yt && yt.status === 'service' && yt.verdict === 'ok')
  assert.ok(r.storage.some((s) => s.name === 'cc_cookie' && s.owner === 'plugin'))
})

test('copy, collapse and close work; axe clean; no horizontal scroll on phones', async () => {
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto(HOME + '#cc-scan')
  await page.locator('#cc-scan').waitFor()
  await page.getByRole('button', { name: 'Ergebnis kopieren' }).click()
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /"hosts"/)
  assert.ok(await page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth))
  await page.addScriptTag({ url: '/vendor/axe.min.js' })
  const v = await page.evaluate(async () => (await window.axe.run('#cc-scan', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })).violations.map((x) => x.id))
  assert.deepEqual(v, [])
  await page.getByRole('button', { name: 'Einklappen' }).click()
  assert.equal(await page.getByRole('button', { name: 'Ausklappen' }).getAttribute('aria-expanded'), 'false')
  await page.getByRole('button', { name: 'Schließen' }).click()
  assert.equal(await page.locator('#cc-scan').count(), 0)
  assert.equal(await page.evaluate(() => location.hash), '')
})

test('hash open keeps focus where it was; InstaticConsent.scan() focuses the panel and reopens it', async () => {
  await page.goto(HOME)
  await page.getByRole('button', { name: 'Alle ablehnen' }).click()
  await page.evaluate(() => { location.hash = '#cc-scan' })
  await page.locator('#cc-scan').waitFor()
  assert.equal(await page.evaluate(() => document.getElementById('cc-scan').contains(document.activeElement)), false)
  await page.getByRole('button', { name: 'Schließen' }).click()
  await page.evaluate(() => window.InstaticConsent.scan())
  await page.locator('#cc-scan').waitFor()
  assert.equal(await page.evaluate(() => document.activeElement.className), 'cc-scan__title')
  await page.keyboard.press('Tab')
  assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Neu prüfen')
})

const summaryLine = () => page.locator('#cc-scan .cc-scan__summary').innerText()

test('summary uses singular and plural; service storage without consent is a violation', async () => {
  await page.goto(HOME + '#cc-scan')
  await page.locator('#cc-scan').waitFor()
  assert.match(await summaryLine(), /^1 Verstoß · /)
  // a catalog YouTube cookie although YouTube is not accepted
  await page.evaluate(() => { document.cookie = 'YSC=1; Path=/' })
  await page.getByRole('button', { name: 'Neu prüfen' }).click()
  assert.match(await summaryLine(), /^2 Verstöße · /)
  const ysc = (await report()).storage.find((s) => s.name === 'YSC')
  assert.equal(ysc.owner, 'service:youtube')
  assert.equal(ysc.verdict, 'violation')
  assert.match(await page.locator('#cc-scan .cc-scan__list--violation').innerText(), /YSC \(cookie\) – ohne Einwilligung gespeichert/)
})

test('English summary: singular and plural', async () => {
  await page.goto(HOME)
  await page.evaluate(() => { document.documentElement.lang = 'en'; location.hash = '#cc-scan' })
  await page.locator('#cc-scan').waitFor()
  assert.match(await summaryLine(), /^1 violation · \d+ to check · /)
  await page.evaluate(() => { document.cookie = 'YSC=1; Path=/' })
  await page.getByRole('button', { name: 'Check again' }).click()
  assert.match(await summaryLine(), /^2 violations · /)
  assert.match(await page.locator('#cc-scan .cc-scan__list--violation').innerText(), /stored without consent/)
})

test('service storage after accept all is ok', async () => {
  await page.goto(HOME)
  await page.getByRole('button', { name: 'Alle akzeptieren' }).click()
  await page.waitForTimeout(500)
  await page.reload()
  await page.evaluate(() => { document.cookie = 'YSC=1; Path=/'; location.hash = '#cc-scan' })
  await page.locator('#cc-scan').waitFor()
  const ysc = (await report()).storage.find((s) => s.name === 'YSC')
  assert.equal(ysc.owner, 'service:youtube')
  assert.equal(ysc.verdict, 'ok')
})

test('an unknown host loaded before consent stays a violation after accept all', async () => {
  await page.goto(HOME)
  await page.waitForFunction(() => performance.getEntriesByType('resource').some((e) => e.name.includes('leak.example.net')))
  await page.getByRole('button', { name: 'Alle akzeptieren' }).click()
  await page.evaluate(() => { location.hash = '#cc-scan' })
  await page.locator('#cc-scan').waitFor()
  const r = await report()
  assert.equal(r.consent.decided, true)
  const leak = r.hosts.find((h) => h.host === 'leak.example.net')
  assert.equal(leak.verdict, 'violation')
  assert.equal(leak.why, 'before')
  // the YouTube embed loaded after the decision is fine
  const ytRow = r.hosts.find((h) => h.host === 'www.youtube-nocookie.com')
  assert.equal(ytRow.verdict, 'ok')
})

test('content loaded once via "Inhalt laden" is ok, not a violation', async () => {
  await page.goto(HOME)
  await page.locator('[data-cc-embed][data-service="youtube"]').first().getByRole('button', { name: 'Inhalt laden' }).click()
  await page.waitForFunction(() => performance.getEntriesByType('resource').some((e) => e.name.includes('youtube-nocookie.com')))
  await page.evaluate(() => { location.hash = '#cc-scan' })
  await page.locator('#cc-scan').waitFor()
  const r = await report()
  assert.equal(r.consent.decided, false)
  const yt = r.hosts.find((h) => h.host === 'www.youtube-nocookie.com')
  assert.equal(yt.verdict, 'ok')
  assert.equal(yt.why, 'once')
  assert.equal(await page.evaluate(() => window.InstaticConsent._scan.allowedOnce.length), 1)
})

// ---- 1.2.1: cookies of a parent domain ----

const withPixel = () => { state.settings = { ...state.settings, 'svc_meta-pixel': true, 'svc_meta-pixel_pixelId': '1234567' } }

test('a service cookie set by the parent domain is "check", not a violation', async () => {
  withPixel()
  await ctx.addCookies([{ name: '_fbp', value: '1', domain: '.' + PARENT, path: '/' }])
  await page.goto(SUB + '#cc-scan')
  await page.locator('#cc-scan').waitFor()
  assert.equal(await page.evaluate(() => typeof window.cookieStore), 'object')
  const r = await report()
  const fbp = r.storage.find((s) => s.name === '_fbp')
  assert.equal(fbp.owner, 'service:meta-pixel')
  assert.equal(fbp.verdict, 'check')
  assert.equal(fbp.why, 'parentDomain')
  assert.equal(r.storage.filter((s) => s.verdict === 'violation').length, 0)
  await page.getByRole('button', { name: 'Neu prüfen' }).click()
  await page.waitForFunction(() => /übergeordneter Domain/.test(document.querySelector('#cc-scan').innerText))
  const text = await page.locator('#cc-scan').innerText()
  assert.ok(text.includes(`von übergeordneter Domain (${PARENT}) gesetzt – nicht von dieser Seite`))
  assert.ok(!/_fbp \(cookie\) – ohne Einwilligung/.test(await page.locator('#cc-scan .cc-scan__list--violation').innerText()))
})

test('the same cookie set by this host stays a violation', async () => {
  withPixel()
  await ctx.addCookies([{ name: '_fbp', value: '1', url: SUB }])
  await page.goto(SUB + '#cc-scan')
  await page.locator('#cc-scan').waitFor()
  const fbp = (await report()).storage.find((s) => s.name === '_fbp')
  assert.equal(fbp.verdict, 'violation')
  assert.equal(fbp.why, 'stored')
})

// ---- 1.2.1 fix round: the parent-domain rule never hides a real violation ----

test('on www.<site>, a cookie of the bare domain is this site: stays a violation', async () => {
  withPixel()
  await ctx.addCookies([{ name: '_fbp', value: '1', domain: '.' + PARENT, path: '/' }])
  await page.goto(WWW + '#cc-scan')
  await page.locator('#cc-scan').waitFor()
  assert.equal(await page.evaluate(() => typeof window.cookieStore), 'object')
  const fbp = (await report()).storage.find((s) => s.name === '_fbp')
  assert.equal(fbp.verdict, 'violation')
  assert.equal(fbp.why, 'stored')
})

test('an accepted service cookie on the parent domain stays ok', async () => {
  withPixel()
  await page.goto(SUB)
  await page.getByRole('button', { name: 'Alle akzeptieren' }).click()
  await page.waitForTimeout(300)
  await ctx.addCookies([{ name: '_fbp', value: '1', domain: '.' + PARENT, path: '/' }])
  await page.evaluate(() => { location.hash = '#cc-scan' })
  await page.locator('#cc-scan').waitFor()
  const fbp = (await report()).storage.find((s) => s.name === '_fbp')
  assert.equal(fbp.verdict, 'ok')
  assert.equal(fbp.why, undefined)
})

test('parent-domain cookie stays a violation when the service was active in this view', async () => {
  withPixel()
  await ctx.addCookies([{ name: '_fbp', value: '1', domain: '.' + PARENT, path: '/' }])
  await page.goto(SUB)
  // a request to a Meta host in this page view (fulfilled empty by the route)
  await page.evaluate(() => new Promise((r) => { const i = new Image(); i.onload = i.onerror = r; i.src = 'https://www.facebook.com/tr?id=1' }))
  await page.evaluate(() => { location.hash = '#cc-scan' })
  await page.locator('#cc-scan').waitFor()
  const fbp = (await report()).storage.find((s) => s.name === '_fbp')
  assert.equal(fbp.verdict, 'violation')
})

test('when the Cookie Store fails, old domain info is dropped (usual rules)', async () => {
  withPixel()
  await ctx.addCookies([{ name: '_fbp', value: '1', domain: '.' + PARENT, path: '/' }])
  await page.goto(SUB + '#cc-scan')
  await page.locator('#cc-scan').waitFor()
  assert.equal((await report()).storage.find((s) => s.name === '_fbp').verdict, 'check')
  await page.evaluate(() => { window.cookieStore.getAll = () => Promise.reject(new Error('x')) })
  assert.equal((await report()).storage.find((s) => s.name === '_fbp').verdict, 'violation')
})

// ---- release prep: category titles and same-origin loading ----
test('_scan exposes the configured category titles and the consent line uses them', async () => {
  await page.goto(HOME)
  const titles = await page.evaluate(() => window.InstaticConsent._scan.categoryTitles)
  assert.ok(titles && typeof titles.media === 'string' && titles.media.length > 0)
  await page.getByRole('button', { name: 'Alle akzeptieren' }).click()
  // a title that differs from the built-in map proves the line reads the configured one
  await page.evaluate(() => { window.InstaticConsent._scan.categoryTitles.media = 'Konfigurierter Titel' })
  await page.evaluate(() => { location.hash = '#cc-scan' })
  await page.locator('#cc-scan').waitFor()
  assert.match(await page.locator('.cc-scan__consent').innerText(), /Konfigurierter Titel \(/)
})

test('the check mode script is only injected from the page origin', async () => {
  const requested = []
  const logs = []
  page.on('console', (m) => { if (m.type() === 'info') logs.push(m.text()) })
  // point the check mode script at a foreign origin
  await page.route(HOME, async (route) => {
    const res = await route.fetch()
    const body = (await res.text()).replace(/"src":"[^"]*consent-scan\.js"/, '"src":"http://foreign.example/consent-scan.js"')
    await route.fulfill({ response: res, body })
  })
  page.on('request', (r) => { if (r.url().includes('consent-scan.js')) requested.push(r.url()) })
  await page.goto(HOME + '#cc-scan')
  await page.waitForTimeout(500)
  assert.deepEqual(requested, [])
  assert.equal(await page.locator('#cc-scan').count(), 0)
  assert.ok(logs.some((l) => l.includes('check mode script not loaded')))
})
