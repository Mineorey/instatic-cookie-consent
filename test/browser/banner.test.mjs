import { test, before, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { start, state } from './server.mjs'

const PORT = 8794
const HOME = `http://localhost:${PORT}/`
let srv, browser, ctx, page

before(async () => { srv = await start(PORT); browser = await chromium.launch({ channel: process.env.CC_BROWSER_CHANNEL || 'msedge' }) })
after(async () => { await browser.close(); srv.close() })
beforeEach(() => {
  state.settings = { enabled: true, svc_youtube: true, privacyUrl: '/datenschutz', imprintUrl: '/impressum' }
  state.revision = 1
})
afterEach(async () => { if (ctx) await ctx.close(); ctx = null })

async function open(viewport = { width: 1440, height: 900 }) {
  ctx = await browser.newContext({ viewport })
  await ctx.route('**/*', (r) => (new URL(r.request().url()).hostname === 'localhost' ? r.continue() : r.abort()))
  page = await ctx.newPage()
  await page.goto(HOME)
  await page.locator('#cc-main .cm').waitFor()
  // wait for the show transition
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState === 'finished'))
  await page.waitForTimeout(300)
}

test('default banner: wide layout, short text, cookie icon', async () => {
  await open()
  const cls = await page.locator('#cc-main .cm').getAttribute('class')
  assert.match(cls, /cm--cloud/)
  assert.match(cls, /cm--inline/)
  assert.equal((await page.locator('#cc-main .cm__title').innerText()).trim(), 'Kurz zu Cookies')
  const text = await page.locator('#cc-main .cm__desc').innerText()
  assert.ok(text.startsWith('Wir möchten auf dieser Seite Videos von YouTube einbinden. Dabei werden Daten wie Ihre IP-Adresse an Google übermittelt, auch in die USA.'), text)
  assert.ok(text.trim().endsWith('Mehr erfahren'), text)
  const icon = page.locator('#cc-main .cm__title svg.cc-icon')
  assert.equal(await icon.count(), 1)
  assert.equal(await icon.getAttribute('aria-hidden'), 'true')
  assert.equal(await icon.getAttribute('focusable'), 'false')
  // the dialog keeps the plain title as its name
  assert.equal(await page.getByRole('dialog', { name: 'Kurz zu Cookies' }).count(), 1)
})

test('showIcon off: no icon', async () => {
  state.settings.showIcon = false
  await open()
  assert.equal(await page.locator('#cc-main svg.cc-icon').count(), 0)
  assert.equal((await page.locator('#cc-main .cm__title').innerText()).trim(), 'Kurz zu Cookies')
})

test('layouts box and bar map to the library layouts', async () => {
  for (const [layout, re] of [['box', /cm--box.*cm--wide|cm--wide.*cm--box/], ['bar', /cm--bar/]]) {
    state.settings.layout = layout
    await open()
    assert.match(await page.locator('#cc-main .cm').getAttribute('class'), re, layout)
    await ctx.close(); ctx = null
  }
})

test('"Mehr erfahren" opens the preferences with the mouse', async () => {
  await open()
  await page.locator('#cc-main .cm').getByRole('link', { name: 'Mehr erfahren' }).click()
  await page.locator('#cc-main .pm').waitFor({ state: 'visible' })
  assert.ok(await page.locator('#cc-main .pm').isVisible())
  assert.equal(new URL(page.url()).hash, '')
})

test('"Mehr erfahren" opens the preferences with the keyboard (Enter)', async () => {
  await open()
  await page.keyboard.press('Tab')
  assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), 'Mehr erfahren')
  await page.keyboard.press('Enter')
  await page.locator('#cc-main .pm').waitFor({ state: 'visible' })
  assert.ok(await page.locator('#cc-main .pm').isVisible())
})

test('english short text with "Learn more"', async () => {
  state.settings.language = 'en'
  await open()
  assert.equal((await page.locator('#cc-main .cm__title').innerText()).trim(), 'A quick word on cookies')
  const text = await page.locator('#cc-main .cm__desc').innerText()
  assert.ok(text.startsWith('We would like to embed videos from YouTube on this site.'), text)
  await page.locator('#cc-main .cm').getByRole('link', { name: 'Learn more' }).click()
  await page.locator('#cc-main .pm').waitFor({ state: 'visible' })
})

test('custom service label is shown as text, not markup', async () => {
  state.settings.customServices = JSON.stringify([{ id: 'maps-y', label: 'Map <b id="inj">Y</b>', category: 'media', provider: { name: 'Y <i>GmbH</i>', privacyUrl: 'https://y.example.com/p' }, match: { iframe: ['^https://y\\.example\\.com/'] } }])
  await open()
  const text = await page.locator('#cc-main .cm__desc').innerText()
  assert.ok(text.includes('Map <b id="inj">Y</b>'), text)
  assert.ok(text.includes('Y <i>GmbH</i>'), text)
  assert.equal(await page.locator('#inj').count(), 0)
})

for (const width of [320, 375, 768, 1024, 1440]) {
  test(`${width}px: no horizontal overflow, all three buttons inside the viewport`, async () => {
    await open({ width, height: width < 700 ? 800 : 900 })
    const r = await page.evaluate(() => ({
      sw: document.scrollingElement.scrollWidth, iw: innerWidth, ih: innerHeight,
      btns: [...document.querySelectorAll('#cc-main .cm__btn')].map((b) => { const x = b.getBoundingClientRect(); return { l: x.left, r: x.right, t: x.top, b: x.bottom, w: x.width } }),
    }))
    assert.ok(r.sw <= r.iw, `scrollWidth ${r.sw} > ${r.iw}`)
    assert.equal(r.btns.length, 3)
    for (const b of r.btns) assert.ok(b.l >= 0 && b.r <= r.iw && b.t >= 0 && b.b <= r.ih, JSON.stringify(b))
    const ws = r.btns.map((b) => b.w)
    assert.ok(Math.max(...ws) - Math.min(...ws) <= 2, 'button widths differ: ' + ws.join(', '))
  })
}

test('self-hosted service without vendor policy links to the site privacy page', async () => {
  state.settings = { ...state.settings, svc_matomo: true, svc_matomo_url: 'https://stats.example.com/', svc_matomo_siteId: '3' }
  await open()
  await page.getByRole('button', { name: 'Einstellungen' }).click()
  await page.locator('#cc-main .pm').waitFor()
  const svc = page.locator('#cc-main .cc-svc', { hasText: 'Matomo' })
  assert.equal(await svc.count(), 1)
  const href = await svc.locator('a').getAttribute('href')
  assert.equal(href, '/datenschutz')
  const youtube = await page.locator('#cc-main .cc-svc', { hasText: 'YouTube' }).locator('a').getAttribute('href')
  assert.equal(youtube, 'https://policies.google.com/privacy')
})

test('english visitors see English country names and provider data in the settings dialog', async () => {
  state.settings = { ...state.settings, language: 'en', svc_tiktok: true, svc_tiktok_pixelId: 'ABCDEFGHIJ12', svc_matomo: true, svc_matomo_url: 'https://stats.example.com/', svc_matomo_siteId: '3' }
  await open()
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.locator('#cc-main .pm').waitFor()
  const tiktok = await page.locator('#cc-main .cc-svc', { hasText: 'TikTok' }).innerText()
  assert.match(tiktok, /Philippines/)
  assert.match(tiktok, /jointly responsible/)
  assert.ok(!/Singapur|Kanada|Philippinen/.test(tiktok), tiktok)
  const matomo = await page.locator('#cc-main .cc-svc', { hasText: 'Matomo' }).innerText()
  assert.match(matomo, /Operator of this website/)
  assert.match(matomo, /see legal notice/)
})
