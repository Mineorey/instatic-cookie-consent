import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { start, state } from './server.mjs'

let srv, browser
before(async () => { srv = await start(8792); browser = await chromium.launch({ channel: process.env.CC_BROWSER_CHANNEL || 'msedge' }) })
after(async () => { await browser.close(); srv.close() })

async function axe(page, include) {
  // Contrast is measured on the final state: wait until show/hide transitions have finished.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState === 'finished'))
  await page.addScriptTag({ url: '/vendor/axe.min.js' })
  return page.evaluate(async (inc) => {
    const r = await window.axe.run({ include: [inc] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })
    return r.violations.map((v) => `${v.id}: ${v.nodes.length} ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)
  }, include)
}

async function open(bypass, viewport) {
  state.settings = { enabled: true, svc_youtube: true, 'svc_meta-pixel': true, 'svc_meta-pixel_pixelId': '1234567', privacyUrl: '/datenschutz', imprintUrl: '/impressum' }
  state.revision = 1
  const ctx = await browser.newContext({ bypassCSP: bypass, ...(viewport ? { viewport } : {}) })
  await ctx.route('**/*', (r) => (new URL(r.request().url()).hostname === 'localhost' ? r.continue() : r.abort()))
  const page = await ctx.newPage()
  await page.goto('http://localhost:8792/')
  await page.locator('#cc-main .cm').waitFor()
  return { ctx, page }
}

test('banner has no WCAG 2.1 AA violations', async () => {
  const { ctx, page } = await open(true)
  assert.deepEqual(await axe(page, '#cc-main'), [])
  await ctx.close()
})

for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 800 }]) {
  test(`default banner (wide, short text, icon) at ${viewport.width}px has no WCAG 2.1 AA violations`, async () => {
    const { ctx, page } = await open(true, viewport)
    assert.match(await page.locator('#cc-main .cm').getAttribute('class'), /cm--cloud/)
    assert.equal(await page.locator('#cc-main .cm svg.cc-icon').count(), 1)
    assert.equal(await page.locator('#cc-main .cm .cc-more').count(), 1)
    assert.deepEqual(await axe(page, '#cc-main'), [])
    await ctx.close()
  })
}

test('preferences dialog has no WCAG 2.1 AA violations', async () => {
  const { ctx, page } = await open(true)
  await page.getByRole('button', { name: 'Einstellungen' }).click()
  await page.locator('#cc-main .pm').waitFor()
  assert.deepEqual(await axe(page, '#cc-main'), [])
  await ctx.close()
})

test('placeholders have no WCAG 2.1 AA violations', async () => {
  const { ctx, page } = await open(true)
  await page.getByRole('button', { name: 'Alle ablehnen' }).click()
  assert.deepEqual(await axe(page, '[data-cc-embed]'), [])
  await ctx.close()
})

test('keyboard reaches all three banner buttons with visible focus', async () => {
  const { ctx, page } = await open(false)
  const seen = []
  for (let i = 0; i < 40 && seen.length < 3; i++) {
    await page.keyboard.press('Tab')
    const info = await page.evaluate(() => {
      const a = document.activeElement; const c = getComputedStyle(a)
      return { t: a.textContent.trim(), inBanner: !!a.closest('#cc-main .cm'), focusVisible: a.matches(':focus-visible'), focus: (c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0) || c.boxShadow !== 'none' }
    })
    if (info.inBanner && /akzeptieren|ablehnen|Einstellungen/.test(info.t) && !seen.includes(info.t)) { seen.push(info.t); assert.ok(info.focusVisible, `${info.t} :focus-visible`); assert.ok(info.focus, `${info.t} focus indicator`) }
  }
  assert.equal(seen.length, 3)
  await ctx.close()
})
