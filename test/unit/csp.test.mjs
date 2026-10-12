import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeCsp } from '../../server/lib/csp.js'

const page = (c) => `<head><meta http-equiv="Content-Security-Policy" content="${c}"></head>`
const get = (html) => html.match(/content="([^"]*)"/)[1]

test('adds hosts to existing directive and keeps hashes', () => {
  const { html, ok } = mergeCsp(page("default-src 'self'; script-src 'self' 'sha256-abc='; frame-src 'none'"), { 'script-src': ['https://connect.facebook.net'], 'frame-src': ['https://www.youtube-nocookie.com'], 'connect-src': [], 'img-src': [] })
  assert.ok(ok)
  assert.match(get(html), /script-src 'self' 'sha256-abc=' https:\/\/connect\.facebook\.net/)
  assert.match(get(html), /frame-src https:\/\/www\.youtube-nocookie\.com/)
  assert.ok(!/frame-src 'none'/.test(get(html)))
})

test('missing directive inherits default-src before adding hosts', () => {
  const { html } = mergeCsp(page("default-src 'self'; script-src 'self'"), { 'connect-src': ['https://www.facebook.com'], 'script-src': [], 'frame-src': [], 'img-src': [] })
  assert.match(get(html), /connect-src 'self' https:\/\/www\.facebook\.com/)
})

test('no duplicates and nothing changes without additions', () => {
  const src = page("default-src 'self'; frame-src https://www.youtube.com")
  const { html } = mergeCsp(src, { 'frame-src': ['https://www.youtube.com'], 'script-src': [], 'connect-src': [], 'img-src': [] })
  assert.equal((get(html).match(/youtube/g) || []).length, 1)
})

test('page without csp meta stays unchanged and reports ok=false', () => {
  const { html, ok } = mergeCsp('<head></head>', { 'script-src': ['https://x.example.com'], 'frame-src': [], 'connect-src': [], 'img-src': [] })
  assert.equal(html, '<head></head>')
  assert.equal(ok, false)
})

test('empty additions report ok=true even without meta', () => {
  assert.equal(mergeCsp('<head></head>', { 'script-src': [], 'frame-src': [], 'connect-src': [], 'img-src': [] }).ok, true)
})

test('real-world Instatic CSP meta with single quotes in content', () => {
  const realMeta = `<head><meta http-equiv="Content-Security-Policy" content="connect-src 'self' https://jobs.example.com; default-src 'self'; frame-src https://www.youtube-nocookie.com https://www.youtube.com; img-src 'self' data: https:; media-src 'self' data: https:; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:;"></head>`
  const { html, ok } = mergeCsp(realMeta, { 'script-src': ['https://cdn.example.com'], 'frame-src': [], 'connect-src': [], 'img-src': [] })
  assert.ok(ok)
  assert.match(get(html), /script-src 'self' https:\/\/cdn\.example\.com/)
})

test('dollar patterns in the policy are kept literally', () => {
  const { html } = mergeCsp(page("default-src 'self'; script-src 'self' 'sha256-a$&b$1='"), { 'script-src': ['https://connect.facebook.net'] })
  assert.match(get(html), /script-src 'self' 'sha256-a\$&b\$1=' https:\/\/connect\.facebook\.net/)
})
