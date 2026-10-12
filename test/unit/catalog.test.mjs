import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CATALOG, CATEGORIES, getService } from '../../server/lib/catalog.js'
import { countryLabel } from '../../server/lib/i18n.js'

const EXPECTED = ['youtube', 'vimeo', 'google-maps', 'ga4', 'matomo', 'meta-pixel', 'linkedin', 'tiktok', 'google-ads', 'gtm']

test('catalog contains all stage-1 services', () => {
  assert.deepEqual(CATALOG.map((s) => s.id).sort(), [...EXPECTED].sort())
})

test('every service is complete and valid', () => {
  for (const s of CATALOG) {
    assert.ok(CATEGORIES.includes(s.category) && s.category !== 'necessary', s.id)
    assert.ok(s.label && s.provider.name && s.provider.address, s.id)
    assert.ok(s.provider.privacyUrl === '' || s.provider.privacyUrl.startsWith('https://'), s.id) // '' = the site's own policy
    assert.ok(s.purpose.de && s.purpose.en, s.id)
    assert.ok(Array.isArray(s.thirdCountries) && Array.isArray(s.cookies), s.id)
    // inline entries are plain substrings, only iframe/script are regexes
    for (const key of ['iframe', 'script']) for (const re of s.match[key] ?? []) new RegExp(re)
    for (const needle of s.match.inline ?? []) assert.ok(typeof needle === 'string' && needle.length > 0, s.id)
    for (const hosts of Object.values(s.csp)) for (const h of hosts) assert.match(h, /^https:\/\/[*a-z0-9.-]+$/, `${s.id} ${h}`)
    for (const p of s.params) { assert.ok(p.id && p.label && p.pattern, s.id); new RegExp(p.pattern) }
    if (s.loader) assert.match(s.loader, /^[a-z0-9-]+\.js$/)
    assert.ok(Object.keys(s.match).length > 0 || s.cspFromParam, `${s.id} has no matcher`)
  }
})

test('youtube rewrite targets nocookie domain', () => {
  const yt = getService('youtube')
  const url = 'https://www.youtube.com/embed/abc123?rel=0'
  assert.equal(url.replace(new RegExp(yt.rewrite.from, 'i'), yt.rewrite.to), 'https://www.youtube-nocookie.com/embed/abc123?rel=0')
})

test('script matchers distinguish GA4, Ads and GTM', () => {
  const m = (id, url) => getService(id).match.script.some((re) => new RegExp(re, 'i').test(url))
  assert.ok(m('ga4', 'https://www.googletagmanager.com/gtag/js?id=G-ABC123'))
  assert.ok(!m('ga4', 'https://www.googletagmanager.com/gtag/js?id=AW-123'))
  assert.ok(m('google-ads', 'https://www.googletagmanager.com/gtag/js?id=AW-123'))
  assert.ok(m('gtm', 'https://www.googletagmanager.com/gtm.js?id=GTM-ABC'))
})

test('GA4 and Google Ads both recognise inline gtag( snippets', () => {
  assert.ok(getService('ga4').match.inline.includes('gtag('))
  assert.ok(getService('google-ads').match.inline.includes('gtag('))
})

test('privacy URL is empty (site fallback) or https, and only the self-hosted service has none', () => {
  for (const s of CATALOG) {
    const u = s.provider.privacyUrl
    assert.ok(u === '' || /^https:\/\//.test(u), s.id)
    if (u === '') assert.equal(s.id, 'matomo', `${s.id} has no privacy URL`)
  }
  assert.equal(getService('matomo').provider.privacyUrl, '')
})

test('countries are known ISO codes and provider texts exist in both languages', () => {
  for (const s of CATALOG) {
    for (const c of s.thirdCountries) {
      assert.ok(/^[A-Z]{2}$/.test(c), s.id + ' ' + c)
      assert.notEqual(countryLabel(c, 'en', 'plain'), c, s.id + ' ' + c + ' has no name')
      assert.notEqual(countryLabel(c, 'de', 'in'), c, s.id + ' ' + c + ' has no name')
    }
    for (const f of [s.provider.name, s.provider.address]) {
      if (typeof f === 'object') assert.ok(f.de && f.en, s.id)
    }
  }
})

test('GA4 does not open the Google advertising hosts', () => {
  const hosts = Object.values(getService('ga4').csp).flat()
  assert.ok(hosts.includes('https://analytics.google.com'))
  for (const h of ['https://*.google.com', 'https://*.g.doubleclick.net', 'https://pagead2.googlesyndication.com']) assert.ok(!hosts.includes(h), h)
  assert.equal(getService('ga4').csp.frame, undefined)
  assert.equal(getService('google-ads').csp.frame.includes('https://www.googletagmanager.com'), false)
  assert.equal(getService('google-ads').csp.script.includes('https://www.google.com'), false)
  assert.ok(!Object.values(getService('google-ads').csp).flat().includes('https://www.google.de'))
})
