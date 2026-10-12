import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildConfig } from '../../server/lib/config.js'
import { processPage, failSafe, markError } from '../../server/lib/pipeline.js'

const PAGE = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; frame-src 'none'; script-src 'self'"><script src="/a.js"></script></head><body><iframe src="https://www.youtube.com/embed/x"></iframe></body></html>`
const cfg = (s) => buildConfig({ enabled: true, ...s }, { assetBase: '/up/instatic.consent/1.0.0/' })

test('config block follows <meta charset> and contains revision', () => {
  const { html } = processPage(PAGE, cfg({ svc_youtube: true }), 4)
  const head = html.slice(html.indexOf('<head>'))
  assert.ok(head.startsWith('<head><meta charset="utf-8"><script type="application/json" id="cc-config">'))
  const json = JSON.parse(html.match(/id="cc-config">([\s\S]*?)<\/script>/)[1])
  assert.equal(json.revision, 4)
})

test('config json cannot break out of the script tag', () => {
  const { html } = processPage(PAGE, cfg({ svc_youtube: true, title: '</script><b>x' }), 1)
  const block = html.match(/id="cc-config">([\s\S]*?)<\/script>/)[1]
  assert.ok(!block.includes('</script'))
  assert.equal(JSON.parse(block).texts.de.banner.title, '</script><b>x')
})

test('loaders are injected blocked before </body> with params', () => {
  const { html } = processPage(PAGE, cfg({ 'svc_meta-pixel': true, 'svc_meta-pixel_pixelId': '1234567' }), 1)
  assert.match(html, /<script type="text\/plain" data-category="marketing" data-service="meta-pixel" data-cc-done src="\/up\/instatic\.consent\/1\.0\.0\/frontend\/services\/meta-pixel\.js" data-param-pixel-id="1234567"><\/script><\/body>/)
})

test('full pipeline: placeholder, csp, idempotent', () => {
  const c = cfg({ svc_youtube: true })
  const once = processPage(PAGE, c, 1)
  assert.match(once.html, /data-cc-embed/)
  assert.match(once.html, /frame-src https:\/\/www\.youtube-nocookie\.com https:\/\/www\.youtube\.com/)
  assert.ok(once.cspOk)
  assert.equal(processPage(once.html, c, 1).html, once.html)
})

test('config block is first in head without <meta charset> or when a script comes first', () => {
  const c = cfg({ svc_youtube: true })
  const plain = processPage('<html><head><title>x</title></head><body></body></html>', c, 1).html
  assert.ok(plain.startsWith('<html><head><script type="application/json" id="cc-config">'))
  const late = processPage('<html><head><script src="/a.js"></script><meta charset="utf-8"></head><body></body></html>', c, 1).html
  assert.ok(late.startsWith('<html><head><script type="application/json" id="cc-config">'))
  assert.equal(processPage(late, c, 1).html, late)
})

test('failSafe neutralises absolute iframe sources and marks the page', () => {
  const src = '<!doctype html><html lang="de"><head></head><body>' +
    '<iframe title="a src=//x" src="https://www.youtube.com/embed/x" allowfullscreen></iframe>' +
    "<iframe src='//player.vimeo.com/video/1'></iframe><iframe src=\"/local.html\"></iframe></body></html>"
  const out = failSafe(src)
  assert.match(out, /^<!doctype html><html data-cc-error lang="de">/)
  assert.ok(out.includes('title="a src=//x" data-cc-src="https://www.youtube.com/embed/x" allowfullscreen>'))
  assert.ok(out.includes("<iframe data-cc-src='//player.vimeo.com/video/1'>"))
  assert.ok(out.includes('<iframe src="/local.html">'))
  assert.ok(!/id="cc-config"/.test(out))
  assert.equal(failSafe(out), out)
})

test('markError is idempotent', () => {
  const once = markError('<html lang="en"><head></head></html>')
  assert.equal(once, '<html data-cc-error lang="en"><head></head></html>')
  assert.equal(markError(once), once)
})

test('failSafe stays fast on pathological html and fails closed on over-long tags', () => {
  const t0 = Date.now()
  const bad = failSafe('<iframe src=x '.repeat(90000))
  assert.ok(Date.now() - t0 < 3000, `took ${Date.now() - t0} ms`)
  assert.ok(bad.startsWith('<iframe src="about:blank" data-cc-unparsed'))
  // an over-long tag with an absolute src: the leading about:blank wins
  const long = failSafe('<iframe ' + 'a="b" '.repeat(5000) + 'src="https://evil.example/x"></iframe><iframe src="https://ok.example/y"></iframe>')
  assert.ok(long.startsWith('<iframe src="about:blank" data-cc-unparsed a="b"'))
  assert.ok(long.includes('<iframe data-cc-src="https://ok.example/y">'))
  assert.equal(failSafe(long), long)
})
