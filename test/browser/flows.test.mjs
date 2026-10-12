import { test, before, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { start, state } from './server.mjs'

const PORT = 8790
const HOME = `http://localhost:${PORT}/`
// a host with a dot: the library then writes the cookie with Domain=<host>
const DOTTED = 'consent.example.com'
let srv, browser, ctx, page, external

before(async () => { srv = await start(PORT); browser = await chromium.launch({ channel: process.env.CC_BROWSER_CHANNEL || 'msedge', args: [`--host-resolver-rules=MAP ${DOTTED} 127.0.0.1`] }) })
after(async () => { await browser.close(); srv.close() })
beforeEach(async () => {
  state.settings = { enabled: true, svc_youtube: true, privacyUrl: '/datenschutz', imprintUrl: '/impressum' }
  state.revision = 1
  ctx = await browser.newContext()
  external = []
  await ctx.route('**/*', (route) => {
    const u = new URL(route.request().url())
    if (u.hostname === 'localhost' || u.hostname === DOTTED) return route.continue()
    // the fixture contains a deliberate leak (leak.example.net) for the scanner tests
    if (u.hostname !== 'leak.example.net') external.push(u.hostname)
    return route.abort()
  })
  page = await ctx.newPage()
})
afterEach(async () => { await ctx.close() })

const banner = () => page.locator('#cc-main .cm')
const ccCookie = async () => (await ctx.cookies()).find((c) => c.name === 'cc_cookie')

test('before any decision: banner visible, nothing external, three equal buttons', async () => {
  await page.goto(HOME)
  await banner().waitFor()
  assert.deepEqual(external, [])
  const sizes = await page.$$eval('#cc-main .cm__btn', (bs) => bs.map((b) => { const r = b.getBoundingClientRect(); const c = getComputedStyle(b); return [Math.round(r.height), c.backgroundColor, c.color, c.fontSize] }))
  assert.equal(sizes.length, 3)
  assert.equal(new Set(sizes.map((s) => JSON.stringify(s))).size, 1)
  const widths = await page.$$eval('#cc-main .cm__btn', (bs) => bs.map((b) => b.getBoundingClientRect().width))
  assert.ok(Math.max(...widths) - Math.min(...widths) <= 2, 'button widths differ: ' + widths.join(', '))
  assert.equal(await page.locator('[data-cc-embed][data-service="youtube"]').count(), 1)
})

test('privacy and imprint links in banner are reachable', async () => {
  await page.goto(HOME)
  await banner().waitFor()
  const links = await page.$$eval('#cc-main .cm a', (as) => as.map((a) => a.getAttribute('href')))
  assert.ok(links.includes('/datenschutz') && links.includes('/impressum'))
})

test('reject all: nothing loads, dynamic iframe becomes placeholder', async () => {
  await page.goto(HOME)
  await page.getByRole('button', { name: 'Alle ablehnen' }).click()
  await page.click('#dyn')
  await page.waitForTimeout(300)
  assert.deepEqual(external, [])
  assert.equal(await page.locator('#dyn-target [data-cc-embed]').count(), 1)
  assert.equal(await page.locator('#dyn-target iframe[src^="https"]').count(), 0)
})

test('innerHTML iframe is replaced by a placeholder', async () => {
  await page.goto(HOME)
  await page.getByRole('button', { name: 'Alle ablehnen' }).click()
  await page.click('#inner')
  await page.waitForTimeout(300)
  assert.deepEqual(external, [])
  assert.equal(await page.locator('#inner-target [data-cc-embed]').count(), 1)
})

for (const [id, label] of [['busy-inner', 'innerHTML'], ['busy-adjacent', 'insertAdjacentHTML'], ['busy-ns', 'setAttributeNS'], ['busy-outer', 'outerHTML']]) {
  test(`${label} insert followed by synchronous work sends no request before consent`, async () => {
    for (let i = 0; i < 3; i++) {
      external = []
      await page.goto(HOME)
      await banner().waitFor()
      // click via DOM so the open banner cannot intercept the pointer
      await page.evaluate((sel) => document.getElementById(sel).click(), id)
      await page.waitForTimeout(300)
      assert.deepEqual(external, [], `run ${i + 1}`)
      assert.equal(await page.locator(`#${id}-target [data-cc-embed][data-service="youtube"]`).count(), 1, `run ${i + 1}`)
      assert.equal(await page.locator(`#${id}-target iframe`).count(), 0, `run ${i + 1}`)
    }
  })
}

test('injected placeholders with foreign or script sources never become iframes', async () => {
  const inject = () => page.evaluate(() => {
    const d = document.createElement('div')
    d.id = 'evil'
    d.innerHTML = '<div data-cc-embed data-service="youtube" data-state="blocked" data-src="javascript:alert(1)"></div>' +
      '<div data-cc-embed data-service="youtube" data-state="blocked" data-src="https://evil.example.com/"></div>'
    document.body.appendChild(d)
  })
  const bad = async () => page.locator('iframe[src^="javascript"], iframe[src*="evil.example.com"]').count()
  await page.goto(HOME)
  await inject()
  await page.waitForTimeout(200)
  for (const btn of await page.locator('#evil [data-cc-embed]').getByRole('button').all()) await btn.click()
  await page.getByRole('button', { name: 'Alle ablehnen' }).click()
  const always = page.locator('#evil').getByRole('button', { name: 'YouTube immer erlauben' })
  if (await always.count()) await always.first().click()
  await page.waitForTimeout(200)
  assert.equal(await bad(), 0)
  await page.click('#settings')
  await page.locator('#cc-main .pm').getByRole('button', { name: 'Alle akzeptieren' }).click()
  await page.waitForTimeout(300)
  assert.equal(await bad(), 0)
  await inject()
  await page.waitForTimeout(300)
  assert.equal(await bad(), 0)
  assert.equal(await page.locator('#evil [data-cc-embed][data-state="disabled"]').count(), 4)
  assert.ok(!external.includes('evil.example.com'))
})

test('after consent, innerHTML iframes are rewritten to nocookie', async () => {
  await page.goto(HOME)
  await page.getByRole('button', { name: 'Alle akzeptieren' }).click()
  await page.waitForTimeout(200)
  external = []
  await page.click('#inner')
  await page.waitForTimeout(500)
  assert.equal(await page.locator('#inner-target iframe[src^="https://www.youtube-nocookie.com/embed/ghi"]').count(), 1)
  assert.ok(external.includes('www.youtube-nocookie.com'), external.join(' '))
  assert.ok(!external.includes('www.youtube.com'), external.join(' '))
})

test('without a working library placeholders offer load once only', async () => {
  await ctx.route('**/cookieconsent.umd.js', (route) => route.fulfill({ status: 404, body: '' }))
  await page.goto(HOME)
  await page.waitForTimeout(300)
  const ph = page.locator('[data-cc-embed][data-service="youtube"]').first()
  assert.equal(await ph.getByRole('button', { name: 'Inhalt laden' }).count(), 1)
  assert.equal(await ph.getByRole('button', { name: /immer erlauben/ }).count(), 0)
  assert.deepEqual(external, [])
})

test('protocol-relative and padded iframe URLs are blocked before consent', async () => {
  await page.goto(HOME)
  await banner().waitFor()
  await page.evaluate(() => {
    const f = document.createElement('iframe')
    f.src = '//www.youtube.com/embed/zzz'
    document.body.appendChild(f)
    const g = document.createElement('iframe')
    g.setAttribute('src', '  https://www.youtube.com/embed/yyy ')
    document.body.appendChild(g)
  })
  await page.waitForTimeout(300)
  assert.deepEqual(external, [])
  assert.equal(await page.locator('iframe[src*="youtube"]').count(), 0)
  const srcs = await page.$$eval('[data-cc-embed][data-service="youtube"]', (els) => els.map((e) => e.getAttribute('data-src')))
  // the test page is http:, so '//…' resolves to http:// – blocked, but never
  // loadable (sources must be https), hence no nocookie rewrite for it
  assert.ok(srcs.includes('http://www.youtube.com/embed/zzz'), srcs.join(' '))
  assert.equal(await page.locator('[data-cc-embed][data-src="http://www.youtube.com/embed/zzz"][data-state="disabled"]').count(), 1)
  assert.ok(srcs.includes('https://www.youtube-nocookie.com/embed/yyy'), srcs.join(' '))
})

test('load once loads exactly this video via nocookie', async () => {
  await page.goto(HOME)
  await page.getByRole('button', { name: 'Alle ablehnen' }).click()
  await page.locator('#static-yt, [data-cc-embed][data-service="youtube"]').first().getByRole('button', { name: 'Inhalt laden' }).click()
  await page.waitForTimeout(500)
  assert.deepEqual([...new Set(external)], ['www.youtube-nocookie.com'])
  assert.equal(await page.locator('[data-cc-embed][data-service="youtube"]').count(), 0)
  await page.reload()
  assert.equal(await page.locator('[data-cc-embed][data-service="youtube"]').count(), 1)
})

test('always allow enables all youtube embeds and persists', async () => {
  await page.goto(HOME)
  await page.getByRole('button', { name: 'Alle ablehnen' }).click()
  await page.getByRole('button', { name: 'YouTube immer erlauben' }).first().click()
  await page.waitForTimeout(300)
  assert.equal(await page.locator('iframe[src^="https://www.youtube-nocookie.com/embed/abc"]').count(), 1)
  await page.reload()
  await page.click('#dyn')
  await page.waitForTimeout(300)
  assert.equal(await page.locator('#dyn-target iframe[src^="https://www.youtube-nocookie.com/embed/def"]').count(), 1)
})

test('accept all persists across reload without consentId', async () => {
  await page.goto(HOME)
  await page.getByRole('button', { name: 'Alle akzeptieren' }).click()
  await page.waitForTimeout(300)
  const c = JSON.parse(decodeURIComponent((await ccCookie()).value))
  assert.ok(!('consentId' in c))
  await page.reload()
  await page.waitForTimeout(500)
  assert.equal(await page.locator('#cc-main .cm').count(), 0)
  assert.equal(await page.locator('iframe[src^="https://www.youtube-nocookie.com"]').count(), 1)
})

test('on a dotted host the stored decision stays a single cookie without consentId', async () => {
  const home = `http://${DOTTED}:${PORT}/`
  await page.goto(home)
  await page.getByRole('button', { name: 'Alle akzeptieren' }).click()
  await page.waitForTimeout(300)
  const all = (await ctx.cookies()).filter((c) => c.name === 'cc_cookie')
  assert.equal(all.length, 1)
  assert.ok(!('consentId' in JSON.parse(decodeURIComponent(all[0].value))))
  await page.reload()
  await page.waitForTimeout(500)
  assert.equal(await page.locator('#cc-main .cm').count(), 0)
  assert.equal((await ctx.cookies()).filter((c) => c.name === 'cc_cookie').length, 1)
  assert.equal(await page.locator('iframe[src^="https://www.youtube-nocookie.com"]').count(), 1)
})

test('disabled service shows a placeholder without load button', async () => {
  await page.goto(HOME)
  const vimeo = page.locator('[data-cc-embed][data-service="vimeo"]')
  assert.match(await vimeo.innerText(), /nicht freigegeben/)
  assert.equal(await vimeo.getByRole('button').count(), 0)
})

test('footer link opens preferences; revoking reloads and blocks again', async () => {
  await page.goto(HOME)
  await page.getByRole('button', { name: 'Alle akzeptieren' }).click()
  await page.click('#settings')
  await page.locator('#cc-main .pm').waitFor()
  await Promise.all([page.waitForNavigation(), page.locator('#cc-main .pm').getByRole('button', { name: 'Alle ablehnen' }).click()])
  await page.waitForTimeout(300)
  assert.equal(await page.locator('[data-cc-embed][data-service="youtube"]').count(), 1)
})

test('new revision shows the banner again', async () => {
  await page.goto(HOME)
  await page.getByRole('button', { name: 'Alle akzeptieren' }).click()
  state.revision = 2
  await page.reload()
  await banner().waitFor()
})

test('escape does not count as consent', async () => {
  await page.goto(HOME)
  await banner().waitFor()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  assert.equal(await ccCookie(), undefined)
  assert.deepEqual(external, [])
})

test('banner off: nothing loads, placeholders offer load once only', async () => {
  state.settings.enabled = false
  await page.goto(HOME)
  await page.waitForTimeout(300)
  assert.equal(await page.locator('#cc-main .cm').count(), 0)
  const ph = page.locator('[data-cc-embed][data-service="youtube"]').first()
  assert.equal(await ph.getByRole('button', { name: /immer erlauben/ }).count(), 0)
  assert.deepEqual(external, [])
})

test('detailed first layer names provider and purpose of every active service', async () => {
  state.settings.textStyle = 'detailed'
  state.settings['svc_meta-pixel'] = true
  state.settings['svc_meta-pixel_pixelId'] = '1234567'
  await page.goto(HOME)
  await banner().waitFor()
  const text = await page.locator('#cc-main .cm__desc').innerText()
  assert.ok(text.includes('folgende externe Dienste einsetzen: YouTube (Google Ireland Limited; Zweck: Anzeige eingebetteter Videos); Meta Pixel (Meta Platforms Ireland Limited; Zweck: Messung und Optimierung von Werbekampagnen).'), text)
})

test('english detailed first layer reads naturally', async () => {
  state.settings.textStyle = 'detailed'
  state.settings.language = 'en'
  await page.goto(HOME)
  await banner().waitFor()
  const text = await page.locator('#cc-main .cm__desc').innerText()
  assert.ok(text.includes('the following external services on this website: YouTube (Google Ireland Limited; purpose: displaying embedded videos).'), text)
})

test('banner takes focus when it opens; Tab reaches "learn more", then the three buttons', async () => {
  await page.goto(HOME)
  await banner().waitFor()
  await page.waitForTimeout(300)
  assert.ok(await page.evaluate(() => !!document.activeElement.closest("#cc-main .cm")), await page.evaluate(() => document.activeElement.outerHTML.slice(0, 120)))
  assert.equal(await page.evaluate(() => window.scrollY), 0)
  const order = []
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Tab')
    order.push(await page.evaluate(() => document.activeElement.closest('#cc-main .cm') ? document.activeElement.textContent.trim() : '(outside)'))
  }
  // reading order: the link at the end of the text comes before the buttons
  assert.deepEqual(order, ['Mehr erfahren', 'Alle akzeptieren', 'Alle ablehnen', 'Einstellungen'])
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  assert.ok(await page.evaluate(() => !document.activeElement.closest('#cc-main .cm')))
})

test('load once is bound to that URL: a new source on the same element is blocked again', async () => {
  await page.goto(HOME)
  await page.getByRole('button', { name: 'Alle ablehnen' }).click()
  await page.locator('[data-cc-embed][data-service="youtube"]').first().getByRole('button', { name: 'Inhalt laden' }).click()
  await page.waitForTimeout(300)
  assert.equal(await page.locator('iframe[src^="https://www.youtube-nocookie.com/embed/abc"]').count(), 1)
  external = []
  await page.evaluate(() => { document.querySelector('iframe[src*="youtube-nocookie.com/embed/abc"]').src = 'https://www.youtube.com/embed/other' })
  await page.waitForTimeout(300)
  assert.deepEqual(external, [])
  assert.equal(await page.locator('iframe[src*="other"]').count(), 0)
  assert.equal(await page.locator('[data-cc-embed][data-service="youtube"][data-src="https://www.youtube-nocookie.com/embed/other"]').count(), 1)
})

test('no active service: no banner, settings link only logs', async () => {
  state.settings = { enabled: true, privacyUrl: '/datenschutz' }
  const infos = []
  page.on('console', (m) => { if (m.type() === 'info') infos.push(m.text()) })
  await page.goto(HOME)
  await page.waitForTimeout(500)
  assert.equal(await page.locator('#cc-main .cm').count(), 0)
  assert.ok(!(await page.content()).includes('einsetzen: .'))
  await page.click('#settings')
  await page.waitForTimeout(200)
  assert.equal(await page.locator('#cc-main .pm').count(), 0)
  assert.ok(infos.some((t) => /no active services/.test(t)), infos.join(' | '))
  assert.equal(await ccCookie(), undefined)
})

test('direct link with #cookie-einstellungen opens the settings', async () => {
  await page.goto(HOME + '#cookie-einstellungen')
  await page.locator('#cc-main .pm').waitFor()
  assert.ok(await page.locator('#cc-main .pm').isVisible())
})

test('clicks inside a placeholder do not reach the page (overlay that closes on click stays open)', async () => {
  await page.goto(HOME)
  await page.getByRole('button', { name: 'Alle ablehnen' }).click()
  await page.evaluate(() => {
    const overlay = document.createElement('div')
    overlay.id = 'ov'
    overlay.addEventListener('click', () => overlay.remove())
    const f = document.createElement('iframe')
    f.src = 'https://www.youtube.com/embed/modal'
    overlay.appendChild(f)
    document.body.appendChild(overlay)
  })
  await page.locator('#ov [data-cc-embed]').getByRole('button', { name: 'Inhalt laden' }).click()
  await page.waitForTimeout(300)
  assert.equal(await page.locator('#ov').count(), 1)
  assert.equal(await page.locator('#ov iframe[src="https://www.youtube-nocookie.com/embed/modal"]').count(), 1)
})

test('iframes on an active service frame host that miss its patterns stay disabled, also after consent', async () => {
  state.settings = { ...state.settings, 'svc_google-maps': true }
  await page.goto(`http://localhost:${PORT}/frames.html`)
  await banner().waitFor()
  const disabled = () => page.locator('[data-cc-embed][data-state="disabled"]')
  assert.equal(await page.locator('[data-cc-embed][data-service="youtube"][data-state="disabled"]').count(), 1)
  assert.equal(await page.locator('[data-cc-embed][data-service="google-maps"][data-state="disabled"]').count(), 1)
  assert.equal(await disabled().getByRole('button').count(), 0)
  assert.equal(await page.locator('[data-cc-embed][data-state="blocked"]').getByRole('button', { name: 'Inhalt laden' }).count(), 1)
  // runtime insertion: src property, setAttribute, setAttributeNS, innerHTML
  await page.evaluate(() => {
    const dyn = document.getElementById('dyn')
    const a = document.createElement('iframe'); a.src = 'https://www.youtube.com/embed?listType=playlist&list=y'; dyn.appendChild(a)
    const b = document.createElement('iframe'); dyn.appendChild(b); b.setAttribute('src', 'https://www.google.com/recaptcha/api2/bframe')
    const c = document.createElement('iframe'); dyn.appendChild(c); c.setAttributeNS(null, 'src', 'https://www.google.com/recaptcha/api2/anchor?k=2')
    dyn.insertAdjacentHTML('beforeend', '<div><iframe src="https://www.youtube.com/embed?listType=search&list=z"></iframe></div>')
    const d = document.createElement('div'); dyn.appendChild(d); d.innerHTML = '<iframe src="//www.google.com/recaptcha/api2/anchor"></iframe>'
  })
  await page.waitForTimeout(300)
  assert.equal(await page.locator('#dyn [data-cc-embed][data-state="disabled"]').count(), 5)
  assert.equal(await page.locator('#dyn iframe[src^="http"]').count(), 0)
  assert.deepEqual(external, [])
  await page.getByRole('button', { name: 'Alle akzeptieren' }).click()
  await page.waitForTimeout(500)
  assert.equal(await disabled().count(), 7)
  assert.equal(await page.locator('iframe[src*="google.com"], iframe[src*="www.youtube.com"]').count(), 0)
  assert.deepEqual([...new Set(external)], ['www.youtube-nocookie.com'])
})
