import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { start, state } from './server.mjs'

let srv, browser
before(async () => { srv = await start(8791); browser = await chromium.launch({ channel: process.env.CC_BROWSER_CHANNEL || 'msedge' }) })
after(async () => { await browser.close(); srv.close() })

const ALL = {
  enabled: true, privacyUrl: '/datenschutz',
  svc_ga4: true, svc_ga4_measurementId: 'G-TEST123',
  'svc_google-ads': true, 'svc_google-ads_conversionId': 'AW-123456',
  svc_gtm: true, svc_gtm_containerId: 'GTM-TEST1',
  'svc_meta-pixel': true, 'svc_meta-pixel_pixelId': '1234567890',
  svc_linkedin: true, svc_linkedin_partnerId: '123456',
  svc_tiktok: true, svc_tiktok_pixelId: 'ABCDEFGHIJ1234',
  svc_matomo: true, svc_matomo_url: 'https://stats.example.com/', svc_matomo_siteId: '1',
}
const EXPECT = [
  'https://www.googletagmanager.com/gtag/js?id=G-TEST123',
  'https://www.googletagmanager.com/gtag/js?id=AW-123456',
  'https://www.googletagmanager.com/gtm.js?id=GTM-TEST1',
  'https://connect.facebook.net/en_US/fbevents.js',
  'https://snap.licdn.com/li.lms-analytics/insight.min.js',
  'https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=ABCDEFGHIJ1234&lib=ttq',
  'https://stats.example.com/matomo.js',
]

async function run(click) {
  state.settings = ALL
  state.revision = 1
  const ctx = await browser.newContext()
  const urls = new Set()
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url())
    if (u.hostname === 'localhost') return r.continue()
    // the fixture contains a deliberate leak (leak.example.net) for the scanner tests
    if (u.hostname !== 'leak.example.net') urls.add(u.href)
    return r.abort()
  })
  const page = await ctx.newPage()
  await page.goto('http://localhost:8791/')
  await page.locator('#cc-main .cm').waitFor()
  if (click) await page.getByRole('button', { name: click }).click()
  let globals = null
  if (click === 'Alle akzeptieren') {
    const deadline = Date.now() + 5000
    while (Date.now() < deadline && !EXPECT.every((u) => urls.has(u))) await page.waitForTimeout(100)
    globals = await page.evaluate(() => ({
      fbq: typeof window.fbq === 'function',
      ttq: Array.isArray(window.ttq),
      lintrk: typeof window.lintrk === 'function',
      paq: Array.isArray(window._paq),
      dataLayer: Array.isArray(window.dataLayer),
    }))
  } else {
    await page.waitForTimeout(1000)
  }
  await ctx.close()
  return { urls, globals }
}

test('nothing loads before consent', async () => {
  const { urls } = await run(null)
  assert.deepEqual([...urls], [])
})

test('reject all keeps every loader blocked', async () => {
  const { urls } = await run('Alle ablehnen')
  assert.deepEqual([...urls], [])
})

test('accept all starts every loader with its own request and stubs', async () => {
  const { urls, globals } = await run('Alle akzeptieren')
  for (const u of EXPECT) assert.ok(urls.has(u), u)
  assert.deepEqual(globals, { fbq: true, ttq: true, lintrk: true, paq: true, dataLayer: true })
})
