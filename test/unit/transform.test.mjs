import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildConfig } from '../../server/lib/config.js'
import { transform } from '../../server/lib/transform.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const svc = (s) => buildConfig({ enabled: true, ...s }, { assetBase: '/p/' }).services

test('enabled youtube iframe becomes blocked placeholder with nocookie src', () => {
  const { html, found } = transform('<p>x</p><iframe class="v" src="https://www.youtube.com/embed/abc?rel=0" title="Film" width="560" height="315" allow="autoplay; fullscreen" allowfullscreen></iframe>', svc({ svc_youtube: true }))
  assert.match(html, /<div class="cc-embed v" data-cc-embed data-cc-done data-service="youtube" data-state="blocked"/)
  assert.match(html, /data-src="https:\/\/www\.youtube-nocookie\.com\/embed\/abc\?rel=0"/)
  assert.match(html, /data-title="Film"/)
  assert.match(html, /aspect-ratio:560\/315/)
  assert.match(html, /data-width="560" data-height="315"/)
  assert.ok(!/<iframe/.test(html))
  assert.deepEqual(found, [{ service: 'youtube', kind: 'iframe', url: 'https://www.youtube.com/embed/abc?rel=0', enabled: true }])
})

test('iframe of known but disabled service becomes disabled placeholder', () => {
  const { html } = transform('<iframe src="https://player.vimeo.com/video/1"></iframe>', svc({}))
  assert.match(html, /data-service="vimeo" data-state="disabled"/)
})

test('unknown iframe stays untouched', () => {
  const src = '<iframe src="https://example.org/widget"></iframe>'
  assert.equal(transform(src, svc({})).html, src)
})

test('known external script becomes text/plain with category', () => {
  const { html } = transform('<script async src="https://connect.facebook.net/en_US/fbevents.js"></script>', svc({ 'svc_meta-pixel': true, 'svc_meta-pixel_pixelId': '1234567' }))
  assert.match(html, /<script type="text\/plain" data-category="marketing" data-service="meta-pixel" data-cc-done async src="https:\/\/connect\.facebook\.net\/en_US\/fbevents\.js"><\/script>/)
})

test('inline snippet of disabled service gets a never-activated category', () => {
  const { html, found } = transform("<script>fbq('init','1')</script>", svc({}))
  assert.match(html, /<script type="text\/plain" data-category="cc-disabled" data-service="meta-pixel" data-cc-done>fbq\('init','1'\)<\/script>/)
  assert.equal(found[0].kind, 'inline')
})

test('json and ld+json scripts are never touched', () => {
  const src = '<script type="application/ld+json">{"x":"fbq("}</script><script type="application/json" id="a">{}</script>'
  assert.equal(transform(src, svc({})).html, src)
})

test('transform is idempotent', () => {
  const once = transform('<iframe src="https://www.youtube.com/embed/abc"></iframe><script src="https://connect.facebook.net/x.js"></script>', svc({ svc_youtube: true })).html
  assert.equal(transform(once, svc({ svc_youtube: true })).html, once)
})

test('attribute values are escaped', () => {
  const { html } = transform('<iframe src="https://www.youtube.com/embed/a&quot;b" title="&lt;x&gt;"></iframe>', svc({ svc_youtube: true }))
  assert.ok(!/data-title="<x>"/.test(html))
})

test('protocol-relative and padded URLs are blocked', () => {
  const yt = svc({ svc_youtube: true })
  const r = transform('<iframe src="//www.youtube.com/embed/x"></iframe>', yt)
  assert.match(r.html, /data-src="https:\/\/www\.youtube-nocookie\.com\/embed\/x"/)
  assert.equal(r.found[0].url, 'https://www.youtube.com/embed/x')
  assert.ok(!/<iframe/.test(transform('<iframe src=" https://www.youtube.com/embed/x"></iframe>', yt).html))
  assert.match(transform('<script src="//connect.facebook.net/en_US/fbevents.js"></script>', svc({})).html, /type="text\/plain"/)
})

test('greater-than inside attribute values does not cut the tag', () => {
  const r = transform('<iframe title="a>b" src="https://www.youtube.com/embed/x"></iframe>', svc({ svc_youtube: true }))
  assert.match(r.html, /data-title="a&gt;b"/)
  assert.ok(!/<iframe/.test(r.html))
  assert.match(transform('<script data-x="a>b" src="https://connect.facebook.net/x.js"></script>', svc({})).html, /type="text\/plain"/)
})

test('any executable script type is checked, non-executable ones skipped', () => {
  for (const t of ['application/javascript', 'text/javascript; charset=utf-8', 'text/ecmascript', 'module']) {
    assert.match(transform(`<script type="${t}" src="https://connect.facebook.net/x.js"></script>`, svc({})).html, /type="text\/plain"/, t)
  }
  const src = '<script type="application/json">{}</script><script type="importmap">{}</script>'
  assert.equal(transform(src, svc({})).html, src)
})

test('unclosed iframe does not swallow later content', () => {
  const r = transform('<iframe src="https://www.youtube.com/embed/a"><p>keep</p><iframe src="https://www.youtube.com/embed/b"></iframe>', svc({ svc_youtube: true }))
  assert.match(r.html, /<p>keep<\/p>/)
  assert.equal(r.found.length, 2)
})

test('only a real type attribute is stripped', () => {
  const { html } = transform('<script data-type="x" type="text/javascript" src="https://connect.facebook.net/x.js"></script>', svc({}))
  assert.match(html, /data-type="x"/)
  assert.ok(!/ type="text\/javascript"/.test(html))
})

test('attribute values are escaped exactly once', () => {
  const { html } = transform('<iframe src="https://www.youtube.com/embed/x" title="Tom &amp; Jerry" class="a&amp;b" style="--x:&quot;y&quot;" allow="autoplay &amp; more"></iframe>', svc({ svc_youtube: true }))
  assert.match(html, /data-title="Tom &amp; Jerry"/)
  assert.match(html, /class="cc-embed a&amp;b"/)
  assert.match(html, /style="--x:&quot;y&quot;;"/)
  assert.match(html, /data-allow="autoplay &amp; more"/)
  assert.ok(!html.includes('&amp;amp;'))
})

test('gtag( snippets go to the first enabled of GA4 / Google Ads, once', () => {
  const snippet = "<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());</script>"
  const ga = { svc_ga4: true, svc_ga4_measurementId: 'G-ABC123' }
  const ads = { 'svc_google-ads': true, 'svc_google-ads_conversionId': 'AW-123' }
  const none = transform(snippet, svc({}))
  assert.match(none.html, /data-category="cc-disabled" data-service="ga4"/)
  assert.equal(none.found.length, 1)
  assert.match(transform(snippet, svc(ads)).html, /data-category="marketing" data-service="google-ads"/)
  const both = transform(snippet, svc({ ...ga, ...ads }))
  assert.match(both.html, /data-category="statistics" data-service="ga4"/)
  assert.equal((both.html.match(/<script/g) || []).length, 1)
  assert.equal(transform(both.html, svc({ ...ga, ...ads })).html, both.html)
})

test('hidden iframes stay hidden as placeholders', () => {
  const { html } = transform('<iframe hidden src="https://www.youtube.com/embed/x"></iframe>', svc({ svc_youtube: true }))
  assert.match(html, /data-cc-embed[^>]* hidden>/)
})

// ---- final fixes 1.2.0: bounded tag parsing, first attribute wins, frame hosts ----

test('bounded tag parsing keeps the output of valid markup unchanged (golden file from the unbounded version)', () => {
  const page = readFileSync(join(ROOT, 'test/fixtures/page.html'), 'utf8')
  const golden = readFileSync(join(ROOT, 'test/fixtures/page.transformed.html'), 'utf8')
  assert.equal(transform(page, svc({ svc_youtube: true })).html, golden)
})

test('pathological broken html stays fast in the transform', () => {
  for (const html of ['<iframe src=x '.repeat(90000), '<script '.repeat(90000), '<script>'.repeat(30000), '<iframe a="'.repeat(60000)]) {
    const t = Date.now()
    transform(html, svc({ svc_youtube: true }))
    assert.ok(Date.now() - t < 1500, `too slow: ${html.slice(0, 14)}`)
  }
})

test('tags beyond the parse bounds are made inert, never left loadable', () => {
  const long = 'x'.repeat(17000)
  const f = transform(`<iframe style="${long}" src="https://www.youtube.com/embed/a"></iframe>`, svc({ svc_youtube: true })).html
  assert.ok(f.startsWith('<iframe src="about:blank" data-cc-unparsed style='))
  const s = transform(`<script data-x="${long}" src="https://connect.facebook.net/x.js"></script>`, svc({})).html
  assert.ok(s.startsWith('<script type="text/plain" data-cc-unparsed data-x='))
  assert.equal(transform(f, svc({ svc_youtube: true })).html, f)
  assert.equal(transform(s, svc({})).html, s)
})

test('duplicate attributes: the first occurrence wins', () => {
  const r = transform('<iframe src="https://www.youtube.com/embed/a" src="https://x.example.com"></iframe>', svc({ svc_youtube: true }))
  assert.match(r.html, /data-service="youtube" data-state="blocked" data-src="https:\/\/www\.youtube-nocookie\.com\/embed\/a"/)
  assert.ok(!/<iframe/.test(r.html))
  assert.equal(transform('<iframe src="https://x.example.com" src="https://www.youtube.com/embed/a"></iframe>', svc({ svc_youtube: true })).html,
    '<iframe src="https://x.example.com" src="https://www.youtube.com/embed/a"></iframe>')
})

test('iframe on an active service frame host without pattern match becomes a disabled placeholder', () => {
  const both = svc({ svc_youtube: true, 'svc_google-maps': true })
  const pl = transform('<iframe src="https://www.youtube.com/embed?listType=playlist&amp;list=x"></iframe>', both)
  assert.match(pl.html, /data-service="youtube" data-state="disabled" data-src="https:\/\/www\.youtube\.com\/embed\?listType=playlist&amp;list=x"/)
  assert.ok(!/<iframe/.test(pl.html))
  assert.equal(pl.found[0].frameHost, true)
  const rc = transform('<iframe src="https://www.google.com/recaptcha/api2/anchor?k=1"></iframe>', both)
  assert.match(rc.html, /data-service="google-maps" data-state="disabled"/)
  // regular embeds unchanged
  assert.match(transform('<iframe src="https://www.youtube.com/embed/abc"></iframe>', both).html, /data-service="youtube" data-state="blocked" data-src="https:\/\/www\.youtube-nocookie\.com\/embed\/abc"/)
  // only active services open their frame hosts in the CSP
  const raw = '<iframe src="https://www.google.com/recaptcha/api2/anchor"></iframe>'
  assert.equal(transform(raw, svc({ svc_youtube: true })).html, raw)
})

test('legacy Google Maps embed (maps?q=…&output=embed) is a consentable Maps placeholder', () => {
  const { html } = transform('<iframe src="https://www.google.com/maps?q=Example&output=embed"></iframe>', svc({ 'svc_google-maps': true }))
  assert.match(html, /data-service="google-maps" data-state="blocked"/)
})

test('a Tag Manager iframe belongs to GTM even when GA4 and Google Ads are active as well', () => {
  const all = svc({ svc_ga4: true, svc_ga4_measurementId: 'G-ABC123', 'svc_google-ads': true, 'svc_google-ads_conversionId': 'AW-123', svc_gtm: true, svc_gtm_containerId: 'GTM-ABC123' })
  const r = transform('<iframe src="https://www.googletagmanager.com/ns.html?id=GTM-ABC123" height="0" width="0"></iframe>', all)
  assert.match(r.html, /data-service="gtm"/)
  assert.equal(r.found[0].service, 'gtm')
})
