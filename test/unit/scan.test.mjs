import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertLinear } from './linear.mjs'
import { buildConfig } from '../../server/lib/config.js'
import { scanHtml, classifyFinding, suggestService } from '../../server/lib/scan.js'

const svcs = (s = {}) => buildConfig({ enabled: true, ...s }, { assetBase: '/p/' }).services
const keys = (f) => f.map((x) => `${x.kind}:${x.key}`).sort()

test('collects every loading source and ignores links and relative urls', () => {
  const html = `<html><head>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=X">
    <link rel="preconnect" href="https://fonts.gstatic.com">
    <link rel="preload" as="font" href="https://cdn.example.net/f.woff2">
    <link rel="icon" href="/favicon.png">
    <style>@import url("https://css.example.org/a.css"); .a{background:url('https://img.example.org/bg.jpg')} @font-face{src:url(//fonts.example.org/x.woff2)}</style>
    <script src="//cdn.example.net/lib.js"></script>
  </head><body>
    <IFRAME SRC="https://www.youtube.com/embed/abc"></IFRAME>
    <img src="/local.png" srcset="https://img.example.com/a.jpg 1x, https://img2.example.com/b.jpg 2x">
    <picture><source srcset="https://img3.example.com/c.webp 400w"></picture>
    <video poster="https://media.example.com/p.jpg"><source src="https://media.example.com/v.mp4"></video>
    <div style="background-image:url(https://deco.example.com/d.png)"></div>
    <form action="https://forms.example.com/submit"></form>
    <a href="https://only-a-link.example.com/">x</a>
    <img src="data:image/png;base64,AAAA">
  </body></html>`
  const f = scanHtml(html, svcs())
  assert.deepEqual(keys(f), [
    'font:cdn.example.net', 'font:fonts.example.org', 'form:forms.example.com', 'iframe:www.youtube.com',
    'image:deco.example.com', 'image:img.example.com', 'image:img.example.org', 'image:img2.example.com', 'image:img3.example.com',
    'media:media.example.com', 'media:media.example.com',
    'preconnect:fonts.gstatic.com', 'script:cdn.example.net', 'style:css.example.org', 'style:fonts.googleapis.com',
  ].sort())
  assert.ok(f.every((x) => !x.url.includes('?')))
})

test('assigns catalog services and hints', () => {
  const html = '<iframe src="https://www.youtube.com/embed/x"></iframe><script src="https://www.googletagmanager.com/gtag/js?id=G-1"></script><link rel="stylesheet" href="https://fonts.googleapis.com/css">'
  const f = scanHtml(html, svcs({ svc_youtube: true }))
  const by = Object.fromEntries(f.map((x) => [x.key, x]))
  assert.equal(by['www.youtube.com'].service, 'youtube')
  assert.ok(['ga4', 'google-ads', 'gtm'].includes(by['www.googletagmanager.com'].service))
  assert.equal(by['fonts.googleapis.com'].service, null)
  assert.equal(by['fonts.googleapis.com'].hint, 'google-fonts')
})

test('inline snippets: catalog needle or hint', () => {
  const f = scanHtml('<script>fbq("init","1")</script><script>window._hjSettings={}</script><script type="application/ld+json">{"fbq(":1}</script><script>var a=1</script>', svcs())
  assert.deepEqual(keys(f), ['inline:inline:hotjar', 'inline:inline:meta-pixel'])
})

test('broken html does not throw or invent hosts', () => {
  const html = '<iframe src="https://a.example.com/x" title="a>b"><img src="https://b.example.com/y.png" <script src=https://c.example.com/z.js></script><img srcset=",, ,">'
  const f = scanHtml(html, svcs())
  assert.deepEqual([...new Set(f.map((x) => x.host))].sort(), ['a.example.com', 'b.example.com', 'c.example.com'])
  assert.deepEqual(scanHtml('', svcs()), [])
})

test('deduplicates identical findings', () => {
  const f = scanHtml('<img src="https://i.example.com/a.png"><img src="https://i.example.com/a.png?v=2">', svcs())
  assert.equal(f.length, 1)
})

test('classifyFinding covers all states', () => {
  const services = svcs({ svc_youtube: true })
  const ctx = { services, own: ['*.example.com'], allow: ['jobs.example.org'] }
  const mk = (o) => ({ key: o.host || 'inline:x', host: '', kind: 'image', url: '', service: null, hint: null, ...o })
  // since the final fixes a finding is covered/blocked only with match 'pattern' (or 'frame'); a bare service is a host match
  assert.equal(classifyFinding(mk({ host: 'www.youtube.com', service: 'youtube', match: 'pattern' }), ctx), 'covered')
  assert.equal(classifyFinding(mk({ host: 'player.vimeo.com', service: 'vimeo', match: 'pattern' }), ctx), 'blocked')
  assert.equal(classifyFinding(mk({ host: 'www.youtube.com', service: 'youtube', match: 'frame' }), ctx), 'blocked')
  assert.equal(classifyFinding(mk({ host: 'www.youtube.com', service: 'youtube', match: 'host' }), ctx), 'unblocked')
  assert.equal(classifyFinding(mk({ host: 'www.youtube.com', service: 'youtube' }), ctx), 'unblocked')
  assert.equal(classifyFinding(mk({ host: 'cdn.example.com' }), ctx), 'own')
  assert.equal(classifyFinding(mk({ host: 'jobs.example.org' }), ctx), 'allowed')
  assert.equal(classifyFinding(mk({ host: 'other.example.net' }), ctx), 'unknown')
  assert.equal(classifyFinding(mk({ kind: 'inline', hint: 'hotjar' }), ctx), 'unknown')
})

test('suggested custom service is accepted by buildConfig', () => {
  const json = suggestService('widgets.example.net', 'iframe')
  const parsed = JSON.parse(json)
  parsed[0].provider.name = 'Example Ltd'
  const cfg = buildConfig({ enabled: true, customServices: JSON.stringify(parsed) }, { assetBase: '/p/' })
  assert.deepEqual(cfg.errors, [])
  const s = cfg.services.find((x) => x.id === 'widgets-example-net')
  assert.ok(s && s.enabled)
  assert.ok(new RegExp(s.match.iframe[0], 'i').test('https://widgets.example.net/embed/1'))
})

test('pathological broken html stays fast and does not throw', () => {
  const inputs = [
    ['<a ', 65000],
    ['<img src=x ', 90000],
    ['<style>', 30000],
    ['<script>', 30000],
  ]
  const s = svcs()
  for (const [unit, n] of inputs) {
    assert.doesNotThrow(() => scanHtml(unit.repeat(n), s))
    assertLinear(`scan ${unit}`, (k) => unit.repeat(n * k), (html) => scanHtml(html, s))
  }
  assert.doesNotThrow(() => scanHtml('<!-- ' + '<img src="https://z.example.com/a.png">', s))
})

test('long attribute values (inline styles, srcset) are still scanned', () => {
  const f = scanHtml('<img src="https://a.example.com/x.png" style="' + 'x'.repeat(12000) + '">', svcs())
  assert.deepEqual(f.map((x) => x.host), ['a.example.com'])
})

test('covered/blocked only where the transform blocks; host-only matches are unblocked', () => {
  const services = svcs({ svc_youtube: true, 'svc_google-maps': true })
  const ctx = { services, own: [], allow: [] }
  const html = [
    '<iframe src="https://www.youtube.com/embed/abc"></iframe>',
    '<iframe src="https://www.youtube.com/embed?listType=playlist&amp;list=x"></iframe>',
    '<iframe src="//www.google.com/recaptcha/api2/anchor"></iframe>',
    '<img src="https://maps.google.com/maps/api/staticmap?center=x">',
    '<script src="https://www.google.com/recaptcha/api.js"></script>',
  ].join('')
  const f = scanHtml(html, services)
  const st = (kind, url) => { const x = f.find((y) => y.kind === kind && y.url === url); return [x.service, x.match, classifyFinding(x, ctx)] }
  assert.deepEqual(st('iframe', 'https://www.youtube.com/embed/abc'), ['youtube', 'pattern', 'covered'])
  assert.deepEqual(st('iframe', 'https://www.youtube.com/embed'), ['youtube', 'frame', 'blocked'])
  assert.deepEqual(st('iframe', 'https://www.google.com/recaptcha/api2/anchor'), ['google-maps', 'frame', 'blocked'])
  assert.deepEqual(st('image', 'https://maps.google.com/maps/api/staticmap'), ['google-maps', 'host', 'unblocked'])
  assert.deepEqual(st('script', 'https://www.google.com/recaptcha/api.js'), ['google-maps', 'host', 'unblocked'])
  // without Maps active the recaptcha iframe is not blocked by the transform: no frame match
  const g = scanHtml('<iframe src="https://www.google.com/recaptcha/api2/anchor"></iframe>', svcs({ svc_youtube: true }))
  assert.deepEqual([g[0].service, g[0].match, classifyFinding(g[0], { services: svcs({ svc_youtube: true }) })], ['google-maps', 'host', 'unblocked'])
  // self-hosted Matomo: the site's logo on the Matomo host is not blocked
  const mt = svcs({ svc_matomo: true, svc_matomo_url: 'https://stats.example.com/', svc_matomo_siteId: '1' })
  const lg = scanHtml('<img src="https://stats.example.com/logo.png"><script src="https://stats.example.com/matomo.js"></script>', mt)
  assert.deepEqual(lg.map((x) => [x.kind, classifyFinding(x, { services: mt })]), [['image', 'unblocked'], ['script', 'covered']])
  // own wins over a host-only match
  assert.equal(classifyFinding(lg[0], { services: mt, own: ['stats.example.com'] }), 'own')
})

test('inline and script hits use the transform choice: first enabled service', () => {
  const services = svcs({ 'svc_google-ads': true, 'svc_google-ads_conversionId': 'AW-123' })
  const f = scanHtml("<script>gtag('js',new Date())</script>", services)
  assert.equal(f[0].service, 'google-ads')
  assert.equal(classifyFinding(f[0], { services }), 'covered')
})

// ---- 1.2.1: URLs in data-* attributes (embeds built by site scripts) ----

test('data-* URLs are deferred findings classified by the iframe rule', () => {
  const services = svcs({ svc_youtube: true })
  const ctx = { services, own: [], allow: [] }
  const f = scanHtml('<button data-yt="https://www.youtube.com/embed/abc">Video</button>', services)
  assert.equal(f.length, 1)
  assert.equal(f[0].kind, 'deferred')
  assert.equal(f[0].service, 'youtube')
  assert.equal(classifyFinding(f[0], ctx), 'covered')
  // the same embed with YouTube disabled stays blocked by the guard
  const off = svcs()
  const g = scanHtml('<button data-yt="https://www.youtube.com/embed/abc">', off)
  assert.equal(classifyFinding(g[0], { services: off }), 'blocked')
})

test('data-* URLs: unknown hosts, script patterns and non-URLs', () => {
  const services = svcs({ svc_youtube: true, 'svc_meta-pixel': true, 'svc_meta-pixel_pixelId': '1234567' })
  const ctx = { services, own: [], allow: [] }
  const f = scanHtml([
    '<div data-src="https://cdn.example.net/x.js"></div>',
    '<div data-x="/local" data-y="not a url" data-yt-modal="abc" data-z="  //img.example.org/a.png  "></div>',
    '<div data-lib="https://connect.facebook.net/en_US/fbevents.js"></div>',
    '<a data-href="mailto:x@example.com" data-e="javascript:alert(1)"></a>',
  ].join(''), services)
  const by = Object.fromEntries(f.map((x) => [x.host, x]))
  assert.deepEqual(Object.keys(by).sort(), ['cdn.example.net', 'connect.facebook.net', 'img.example.org'])
  assert.ok(f.every((x) => x.kind === 'deferred'))
  assert.equal(classifyFinding(by['cdn.example.net'], ctx), 'unknown')
  // a script built at runtime from a data attribute is not stopped by the guard
  assert.equal(by['connect.facebook.net'].service, 'meta-pixel')
  assert.equal(classifyFinding(by['connect.facebook.net'], ctx), 'unblocked')
})

test('data-* URLs: frame host of an active service is blocked, entities are decoded', () => {
  const services = svcs({ svc_youtube: true })
  const f = scanHtml('<div data-player="https://www.youtube.com/embed?list=a&amp;b=1"></div>', services)
  assert.equal(f[0].kind, 'deferred')
  assert.equal(f[0].match, 'frame')
  assert.equal(classifyFinding(f[0], { services }), 'blocked')
})

// 1.2.1 fix round: a deferred script URL is never treated as a frame-host iframe
test('data-* GTM/GA4 script URLs are unblocked, not frame-host blocked', () => {
  const services = svcs({ svc_gtm: true, svc_gtm_containerId: 'GTM-X1', svc_ga4: true, svc_ga4_measurementId: 'G-X1' })
  const ctx = { services, own: [], allow: [] }
  const f = scanHtml('<div data-src="https://www.googletagmanager.com/gtm.js?id=GTM-X"></div><div data-src="https://www.googletagmanager.com/gtag/js?id=G-X"></div><div data-u="https://www.googletagmanager.com/other.js"></div>', services)
  assert.equal(f.length, 3)
  for (const x of f) {
    assert.equal(x.kind, 'deferred')
    assert.equal(x.match, 'host', x.url)
    assert.equal(classifyFinding(x, ctx), 'unblocked')
  }
})
