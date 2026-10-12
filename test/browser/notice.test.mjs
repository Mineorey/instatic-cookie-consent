import { test, before, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { start, state } from './server.mjs'

// A browser that blocks cookie notices never loads the banner library. The
// protection still works; the footer link, the direct link and
// InstaticConsent.showPreferences() show a small notice instead.
const PORT = 8795
const HOME = `http://localhost:${PORT}/`
const SIE = 'Ihr Browser blockiert den Cookie-Dialog dieser Seite. Externe Inhalte wie Videos können Sie trotzdem einzeln über „Inhalt laden“ anzeigen.'
const DU = 'Dein Browser blockiert den Cookie-Dialog dieser Seite. Externe Inhalte wie Videos kannst du trotzdem einzeln über „Inhalt laden“ anzeigen.'
const EN = 'Your browser blocks this site\'s cookie dialog. You can still show external content such as videos one at a time with "Load content".'
let srv, browser, ctx, page, external
before(async () => { srv = await start(PORT); browser = await chromium.launch({ channel: process.env.CC_BROWSER_CHANNEL || 'msedge' }) })
after(async () => { await browser.close(); srv.close() })

async function open(viewport, path = '', block = (r) => r.abort()) {
  ctx = await browser.newContext(viewport ? { viewport } : {})
  external = []
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url())
    if (u.hostname === 'localhost') return r.continue()
    if (u.hostname !== 'leak.example.net') external.push(u.hostname)
    return r.abort()
  })
  // routes registered later win: the library block comes last
  await ctx.route('**/cookieconsent.umd.js', block)
  page = await ctx.newPage()
  await page.goto(HOME + path)
  await page.waitForTimeout(300)
}
beforeEach(() => {
  state.settings = { enabled: true, svc_youtube: true, privacyUrl: '/datenschutz', imprintUrl: '/impressum' }
  state.revision = 1
})
afterEach(async () => { await ctx.close() })
const notice = () => page.locator('.cc-notice')
const textIn = () => page.waitForFunction(() => document.querySelector('.cc-notice__text') && document.querySelector('.cc-notice__text').textContent)

test('blocked library: no banner, footer link shows the notice (Sie), nothing external, Inhalt laden works', async () => {
  await open()
  assert.equal(await page.locator('#cc-main .cm').count(), 0)
  assert.equal(await notice().count(), 0)
  await page.click('#settings')
  await notice().waitFor({ state: 'visible' })
  await textIn()
  assert.equal(await notice().locator('.cc-notice__text').innerText(), SIE)
  assert.equal(await notice().getAttribute('role'), 'status')
  assert.equal(await notice().getAttribute('aria-live'), 'polite')
  assert.equal(await notice().locator('button[type="button"]').count(), 1)
  assert.deepEqual(external, [])
  await page.locator('[data-cc-embed][data-service="youtube"]').first().getByRole('button', { name: 'Inhalt laden' }).click()
  await page.waitForTimeout(400)
  assert.deepEqual([...new Set(external)], ['www.youtube-nocookie.com'])
})

test('blocked library: du formality text', async () => {
  state.settings.formality = 'du'
  await open()
  await page.click('#settings')
  await textIn()
  assert.equal(await notice().locator('.cc-notice__text').innerText(), DU)
})

test('blocked library: english text and button', async () => {
  state.settings.language = 'en'
  await open()
  await page.click('#settings')
  await textIn()
  assert.equal(await notice().locator('.cc-notice__text').innerText(), EN)
  assert.equal(await notice().getByRole('button').innerText(), 'Close')
})

test('direct link shows the notice; showPreferences() too; only one at a time; Escape and button close', async () => {
  await open(undefined, '#cookie-einstellungen')
  await notice().waitFor({ state: 'visible' })
  await page.evaluate(() => window.InstaticConsent.showPreferences())
  await page.click('#settings')
  assert.equal(await notice().count(), 1)
  await page.keyboard.press('Escape')
  assert.equal(await notice().count(), 0)
  await page.evaluate(() => window.InstaticConsent.showPreferences())
  await notice().waitFor({ state: 'visible' })
  await notice().getByRole('button', { name: 'Schließen' }).click()
  assert.equal(await notice().count(), 0)
})

test('notice has no WCAG 2.1 AA violations and no horizontal scroll at 375px', async () => {
  await open({ width: 375, height: 800 })
  await page.click('#settings')
  await textIn()
  const r = await page.evaluate(() => { const b = document.querySelector('.cc-notice').getBoundingClientRect(); return { sw: document.scrollingElement.scrollWidth, iw: innerWidth, l: b.left, r: b.right } })
  assert.ok(r.sw <= r.iw, `scrollWidth ${r.sw} > ${r.iw}`)
  assert.ok(r.l >= 0 && r.r <= r.iw, JSON.stringify(r))
  await page.addScriptTag({ url: '/vendor/axe.min.js' })
  const v = await page.evaluate(async () => {
    const res = await window.axe.run({ include: ['.cc-notice'] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })
    return res.violations.map((x) => x.id + ': ' + x.nodes.map((n) => n.target.join(' ')).join(' | '))
  })
  assert.deepEqual(v, [])
})

test('no active services: the notice says so', async () => {
  state.settings = { enabled: true, privacyUrl: '/datenschutz' }
  await open()
  await page.click('#settings')
  await textIn()
  assert.equal(await notice().locator('.cc-notice__text').innerText(), 'Diese Seite setzt keine Dienste ein, für die eine Einwilligung nötig ist.')
})

test('library script 404: the notice appears as well', async () => {
  await open(undefined, '', (r) => r.fulfill({ status: 404, body: '' }))
  await page.click('#settings')
  await notice().waitFor({ state: 'visible' })
  await textIn()
})

test('the notice hides itself after 12 seconds', async () => {
  await open()
  await page.clock.install()
  await page.evaluate(() => window.InstaticConsent.showPreferences())
  await notice().waitFor({ state: 'attached' })
  await page.clock.fastForward(12100)
  assert.equal(await notice().count(), 0)
})
