import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hostOf, parseHostList, hostMatches, cspHosts } from '../../server/lib/hosts.js'
import { HINTS, hintForHost, hintForInline } from '../../server/lib/hints.js'

test('hostOf handles absolute, protocol-relative, relative and junk', () => {
  assert.equal(hostOf('https://WWW.Example.com:8443/a?b'), 'www.example.com')
  assert.equal(hostOf('//cdn.example.com/x.js'), 'cdn.example.com')
  assert.equal(hostOf(' https://a.example.com '), 'a.example.com')
  assert.equal(hostOf('/local.png'), '')
  assert.equal(hostOf('data:image/png;base64,xx'), '')
  assert.equal(hostOf('javascript:alert(1)'), '')
  assert.equal(hostOf(''), '')
})

test('parseHostList normalises lines and reports junk', () => {
  const r = parseHostList(' https://jobs.example.com/api/offers \n*.example.org\n\n  cdn.example.net:443 \n*\nnot a host\nlocalhost')
  assert.deepEqual(r.hosts, ['jobs.example.com', '*.example.org', 'cdn.example.net'])
  assert.deepEqual(r.invalid, ['*', 'not a host', 'localhost'])
  assert.deepEqual(parseHostList(undefined), { hosts: [], invalid: [] })
})

test('hostMatches supports exact and wildcard', () => {
  assert.ok(hostMatches('a.example.com', '*.example.com'))
  assert.ok(hostMatches('example.com', '*.example.com'))
  assert.ok(!hostMatches('badexample.com', '*.example.com'))
  assert.ok(hostMatches('example.com', 'example.com'))
  assert.ok(!hostMatches('a.example.com', 'example.com'))
})

test('cspHosts strips scheme and port', () => {
  assert.deepEqual(cspHosts(['https://*.google-analytics.com', 'https://www.youtube.com:443']), ['*.google-analytics.com', 'www.youtube.com'])
})

test('hints are well formed and found by host and inline signature', () => {
  for (const h of HINTS) {
    assert.match(h.id, /^[a-z0-9-]+$/)
    assert.ok(h.name && h.advice.de && h.advice.en)
    assert.ok(Array.isArray(h.hosts) && Array.isArray(h.inline))
  }
  assert.equal(hintForHost('fonts.gstatic.com').id, 'google-fonts')
  assert.equal(hintForHost('a.tile.openstreetmap.org').id, 'openstreetmap')
  assert.equal(hintForHost('www.example.com'), null)
  assert.equal(hintForInline('window._hjSettings={hjid:1}').id, 'hotjar')
  assert.equal(hintForInline('var x = 1'), null)
})

test('parseHostList rejects wildcards on public suffixes and shared hosting', () => {
  const r = parseHostList('*.co.uk\n*.github.io\n*.amazonaws.com\n*.squarespace.com\n*.com\n*.\nsite.github.io\n*.shop.co.uk\n*.example.com')
  assert.deepEqual(r.hosts, ['site.github.io', '*.shop.co.uk', '*.example.com'])
  assert.deepEqual(r.invalid, ['*.co.uk', '*.github.io', '*.amazonaws.com', '*.squarespace.com', '*.com', '*.'])
})
