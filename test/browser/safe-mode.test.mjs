import { test, before, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { start, state } from './server.mjs'

// Safe mode: the publish step failed, so nothing may load and no consent
// can be given; every cross-origin iframe is a placeholder.
const PORT = 8793
let srv, browser, ctx, page, external, infos

before(async () => { srv = await start(PORT); browser = await chromium.launch({ channel: process.env.CC_BROWSER_CHANNEL || 'msedge' }) })
after(async () => { await browser.close(); srv.close() })
beforeEach(async () => {
  state.settings = { enabled: true, svc_youtube: true, privacyUrl: '/datenschutz', imprintUrl: '/impressum' }
  state.revision = 1
  ctx = await browser.newContext()
  external = []
  await ctx.route('**/*', (route) => {
    const u = new URL(route.request().url())
    if (u.hostname === 'localhost') return route.continue()
    // the fixture contains a deliberate leak (leak.example.net) for the scanner tests
    if (u.hostname !== 'leak.example.net') external.push(u.hostname)
    return route.abort()
  })
  page = await ctx.newPage()
  infos = []
  page.on('console', (m) => { if (m.type() === 'info') infos.push(m.text()) })
})
afterEach(async () => { await ctx.close() })

for (const path of ['/safe.html']) {
  test(`${path}: no banner, every embed blocked, script-inserted iframes stay blocked`, async () => {
    await page.goto(`http://localhost:${PORT}${path}`)
    await page.waitForTimeout(500)
    assert.equal(await page.locator('#cc-main .cm').count(), 0)
    assert.equal(await page.locator('iframe').count(), 0)
    assert.equal(await page.locator('[data-cc-embed]').count(), 2)
    assert.equal(await page.locator('[data-cc-embed]').getByRole('button').count(), 0)
    assert.match(await page.locator('[data-cc-embed]').first().innerText(), /derzeit blockiert/)
    await page.click('#dyn')
    await page.click('#inner')
    await page.evaluate(() => document.getElementById('busy-ns').click())
    await page.waitForTimeout(300)
    for (const id of ['dyn-target', 'inner-target', 'busy-ns-target']) {
      assert.equal(await page.locator(`#${id} [data-cc-embed]`).count(), 1, id)
      assert.equal(await page.locator(`#${id} iframe`).count(), 0, id)
    }
    // an iframe from an unknown provider is blocked as well
    await page.evaluate(() => { const f = document.createElement('iframe'); f.id = 'other'; f.src = 'https://widgets.example.org/x'; document.body.appendChild(f) })
    await page.waitForTimeout(200)
    assert.equal(await page.locator('iframe[src*="example.org"]').count(), 0)
    assert.deepEqual(external, [])
    await page.click('#settings')
    await page.waitForTimeout(100)
    assert.equal(await page.locator('#cc-main .pm').count(), 0)
    assert.ok(infos.some((t) => /safe mode/.test(t)), infos.join(' | '))
  })
}

test('/safe.html has no consent config and is marked as an error page', async () => {
  await page.goto(`http://localhost:${PORT}/safe.html`)
  assert.equal(await page.locator('#cc-config').count(), 0)
  assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-cc-error')), true)
})
