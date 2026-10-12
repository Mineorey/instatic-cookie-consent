import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildConfig, settingsSchema } from '../../server/lib/config.js'
import { hash53 } from '../../server/lib/hash.js'
import { I18N } from '../../server/lib/i18n.js'
import { CATALOG } from '../../server/lib/catalog.js'

const base = { enabled: true, language: 'auto', formality: 'sie', privacyUrl: '/datenschutz', imprintUrl: '/impressum', validityMonths: 12, forceRenew: 0 }
const opts = { assetBase: '/uploads/plugins/instatic.consent/1.0.0/' }

test('no services enabled → nothing active, no csp additions', () => {
  const c = buildConfig(base, opts)
  assert.equal(c.services.filter((s) => s.enabled).length, 0)
  assert.deepEqual(c.loaders, [])
  assert.deepEqual(Object.values(c.csp).flat(), [])
})

test('youtube enabled → frame hosts, no loader', () => {
  const c = buildConfig({ ...base, svc_youtube: true }, opts)
  assert.ok(c.services.find((s) => s.id === 'youtube').enabled)
  assert.deepEqual(c.csp['frame-src'], ['https://www.youtube-nocookie.com', 'https://www.youtube.com'])
  assert.deepEqual(c.loaders, [])
})

test('meta pixel with valid id → loader with params and csp', () => {
  const c = buildConfig({ ...base, 'svc_meta-pixel': true, 'svc_meta-pixel_pixelId': '1234567890' }, opts)
  assert.deepEqual(c.loaders, [{ id: 'meta-pixel', category: 'marketing', src: opts.assetBase + 'frontend/services/meta-pixel.js', params: { pixelId: '1234567890' } }])
  assert.ok(c.csp['script-src'].includes('https://connect.facebook.net'))
})

test('missing or invalid required param disables the service and reports it', () => {
  for (const v of ['', 'abc']) {
    const c = buildConfig({ ...base, 'svc_meta-pixel': true, 'svc_meta-pixel_pixelId': v }, opts)
    assert.equal(c.services.find((s) => s.id === 'meta-pixel').enabled, false)
    assert.deepEqual(c.loaders, [])
    assert.match(c.errors.join(' '), /meta-pixel/)
    assert.ok(!c.client.services.find((s) => s.id === 'meta-pixel').enabled)
  }
})

test('matomo derives csp and script matcher from url param', () => {
  const c = buildConfig({ ...base, svc_matomo: true, svc_matomo_url: 'https://stats.example.com/', svc_matomo_siteId: '3' }, opts)
  assert.ok(c.csp['script-src'].includes('https://stats.example.com'))
  assert.ok(c.csp['connect-src'].includes('https://stats.example.com'))
  const m = c.services.find((s) => s.id === 'matomo')
  assert.ok(m.match.script.some((re) => new RegExp(re).test('https://stats.example.com/matomo.js')))
})

test('custom services JSON is merged; broken JSON is reported, others keep working', () => {
  const custom = JSON.stringify([{ id: 'maps-x', label: 'Map X', category: 'media', provider: { name: 'X GmbH', address: 'Berlin', privacyUrl: 'https://x.example.com/privacy' }, purpose: { de: 'Karten', en: 'Maps' }, thirdCountries: [], cookies: [], match: { iframe: ['^https://maps\\.x\\.example\\.com/'] }, csp: { frame: ['https://maps.x.example.com'] } }])
  const ok = buildConfig({ ...base, svc_youtube: true, customServices: custom }, opts)
  assert.ok(ok.services.find((s) => s.id === 'maps-x').enabled)
  assert.ok(ok.csp['frame-src'].includes('https://maps.x.example.com'))
  const bad = buildConfig({ ...base, svc_youtube: true, customServices: '[{oops' }, opts)
  assert.ok(bad.services.find((s) => s.id === 'youtube').enabled)
  assert.match(bad.errors.join(' '), /customServices/)
})

test('custom service with invalid shape is rejected', () => {
  const c = buildConfig({ ...base, customServices: JSON.stringify([{ id: 'x' }]) }, opts)
  assert.ok(!c.services.find((s) => s.id === 'x'))
  assert.match(c.errors.join(' '), /x/)
})

test('fingerprint changes with services, texts and forceRenew, not with unrelated settings', () => {
  const f = (s) => buildConfig({ ...base, ...s }, opts).fingerprint
  const a = f({ svc_youtube: true })
  assert.equal(a, f({ svc_youtube: true }))
  assert.notEqual(a, f({ svc_youtube: true, svc_vimeo: true }))
  assert.notEqual(a, f({ svc_youtube: true, forceRenew: 1 }))
  assert.notEqual(a, f({ svc_youtube: true, title: 'Neu' }))
  assert.equal(a, f({ svc_youtube: true, accentColor: '#ff0000' }))
})

test('client config carries texts for de and en and all services for the iframe guard', () => {
  const c = buildConfig({ ...base, formality: 'du', svc_youtube: true }, opts)
  assert.ok(c.client.texts.de.banner.rejectAll && c.client.texts.en.banner.rejectAll)
  assert.match(c.client.texts.de.embed.text, /deine|dein|Dir|dich/i)
  assert.equal(c.client.services.length, 10)
  assert.equal(c.client.validityDays, 360)
})

test('settings schema has a toggle and param fields per service, labels <= 80 chars', () => {
  const s = settingsSchema()
  assert.ok(s.find((x) => x.id === 'svc_youtube' && x.type === 'toggle'))
  assert.ok(s.find((x) => x.id === 'svc_meta-pixel_pixelId' && x.type === 'text'))
  for (const x of s) { assert.ok(x.label.length <= 80, x.id); assert.match(x.id, /^[a-zA-Z_][a-zA-Z0-9_-]*$/) }
})

test('hash53 is deterministic', () => {
  assert.equal(hash53('abc'), hash53('abc'))
  assert.notEqual(hash53('abc'), hash53('abd'))
})

const customBase = { id: 'maps-y', label: 'Map Y', category: 'media', provider: { name: 'Y', address: 'B', privacyUrl: 'https://y.example.com/p' }, purpose: { de: 'a', en: 'b' }, thirdCountries: [], cookies: [], match: { iframe: ['^https://y\.example\.com/'] }, csp: { frame: ['https://y.example.com'] } }
const withCustom = (patch) => buildConfig({ ...base, svc_youtube: true, customServices: JSON.stringify([{ ...customBase, ...patch }]) }, opts)

test('custom service with uncompilable matcher is rejected, others keep working', () => {
  const c = withCustom({ match: { iframe: ['['] } })
  assert.ok(!c.services.find((s) => s.id === 'maps-y'))
  assert.match(c.errors.join(' '), /maps-y/)
  assert.ok(c.services.find((s) => s.id === 'youtube').enabled)
  assert.ok(!withCustom({ match: { inline: [''] } }).services.find((s) => s.id === 'maps-y'))
  assert.ok(withCustom({ match: { inline: ['fbq('] } }).services.find((s) => s.id === 'maps-y'))
})

test('custom service with invalid csp host is rejected', () => {
  const c = withCustom({ csp: { frame: ['https://x.example.com; script-src *'] } })
  assert.ok(!c.services.find((s) => s.id === 'maps-y'))
  assert.match(c.errors.join(' '), /maps-y/)
  assert.deepEqual(c.csp['frame-src'], ['https://www.youtube-nocookie.com', 'https://www.youtube.com'])
})

test('matomo with unsafe origin is disabled with error', () => {
  const c = buildConfig({ ...base, svc_matomo: true, svc_matomo_url: "https://st'ats.example.com/", svc_matomo_siteId: '3' }, opts)
  assert.equal(c.services.find((s) => s.id === 'matomo').enabled, false)
  assert.match(c.errors.join(' '), /matomo/)
  assert.deepEqual(c.csp['script-src'], [])
})

test('validityMonths is clamped to 1..13', () => {
  const d = (v) => buildConfig({ ...base, validityMonths: v }, opts).client.validityDays
  assert.equal(d(99), 390)
  assert.equal(d(0), 360)
  assert.equal(d('x'), 360)
  assert.equal(d(2.7), 60)
})

test('privacy and imprint urls are restricted to safe schemes', () => {
  const c = buildConfig({ ...base, privacyUrl: 'javascript:alert(1)', imprintUrl: '//evil.example.com' }, opts)
  assert.equal(c.client.privacyUrl, '')
  assert.equal(c.client.imprintUrl, '')
  assert.equal(c.errors.length, 2)
  const ok = buildConfig({ ...base, privacyUrl: 'https://example.com/p' }, opts)
  assert.equal(ok.client.privacyUrl, 'https://example.com/p')
  assert.equal(ok.client.imprintUrl, '/impressum')
})

test('custom service text fields are coerced to strings', () => {
  const c = withCustom({ purpose: { de: 1, en: 2 }, cookies: [7], thirdCountries: [8] })
  const s = c.services.find((x) => x.id === 'maps-y')
  assert.deepEqual(s.cookies, ['7'])
  assert.deepEqual(s.thirdCountries, ['8'])
  assert.equal(s.purpose.de, '1')
})

test('csp hosts allow "*" only as a leading label before at least two labels', () => {
  const ok = (h) => !!withCustom({ csp: { frame: [h] } }).services.find((s) => s.id === 'maps-y')
  assert.ok(ok('https://*.example.com'))
  assert.ok(ok('https://maps.example.com:8443'))
  for (const h of ['https://*', 'https://*.com', 'https://a.*.example.com', 'https://*example.com', 'https://example.*']) assert.ok(!ok(h), h)
})

test('every default text set names purposes per service on the first layer', () => {
  for (const set of Object.values(I18N)) {
    assert.match(set.banner.description, /\{services\}/)
    assert.match(set.banner.serviceItem, /\{label\}/)
    assert.match(set.banner.serviceItem, /\{provider\}/)
    assert.match(set.banner.serviceItem, /\{purpose\}/)
  }
  const c = buildConfig({ ...base, formality: 'du', svc_youtube: true }, opts)
  assert.equal(c.client.texts.de.banner.serviceItem, '{label} ({provider}; Zweck: {purpose})')
  assert.equal(c.client.texts.en.banner.serviceItem, '{label} ({provider}; purpose: {purpose})')
})

test('scan settings: defaults, parsing, client block, not fingerprinted', () => {
  const base = { enabled: true, svc_youtube: true }
  // the check mode is off by default (public sites); it is switched on explicitly here
  assert.equal(buildConfig(base, { assetBase: '/p/' }).scan.browser, false)
  assert.equal(buildConfig(base, { assetBase: '/p/' }).client.scan, null)
  const a = buildConfig({ ...base, scanBrowser: true }, { assetBase: '/p/' })
  assert.deepEqual(a.scan, { enabled: true, browser: true, own: [], allow: [], invalid: [], generation: 0 })
  assert.equal(a.client.scan.src, '/p/frontend/consent-scan.js')
  assert.ok(a.client.scan.hints.some((h) => h.id === 'google-fonts'))
  assert.deepEqual(a.client.services.find((s) => s.id === 'youtube').hosts.sort(), ['www.youtube-nocookie.com', 'www.youtube.com'])
  const b = buildConfig({ ...base, scanEnabled: false, scanBrowser: false, scanOwnHosts: 'https://cdn.example.com/x\n*', scanAllowHosts: 'jobs.example.org', scanReset: 3 }, { assetBase: '/p/' })
  assert.equal(b.fingerprint, a.fingerprint)
  assert.deepEqual(b.scan, { enabled: false, browser: false, own: ['cdn.example.com'], allow: ['jobs.example.org'], invalid: ['*'], generation: 3 })
  assert.equal(b.client.scan, null)
  assert.ok(b.errors.some((e) => e.startsWith('scanOwnHosts')))
})

test('settings schema stays within 50 entries and has the scan fields', () => {
  const s = settingsSchema()
  assert.ok(s.length <= 50)
  for (const id of ['scanEnabled', 'scanBrowser', 'scanOwnHosts', 'scanAllowHosts', 'scanReset']) assert.ok(s.some((x) => x.id === id), id)
  assert.equal(s.find((x) => x.id === 'scanBrowser').default, false)
})

test('client services carry the frame hosts of active services only', () => {
  const c = buildConfig({ enabled: true, svc_youtube: true }, { assetBase: '/p/' })
  assert.deepEqual(c.client.services.find((s) => s.id === 'youtube').frameHosts.sort(), ['www.youtube-nocookie.com', 'www.youtube.com'])
  assert.deepEqual(c.client.services.find((s) => s.id === 'google-maps').frameHosts, [])
})

test('1.2.2: notice texts are sent outside texts and leave the fingerprint unchanged', () => {
  const c = buildConfig({}, opts)
  // values computed with 1.2.1 (HEAD 9f322c0): the new texts must not trigger a new revision
  assert.equal(c.fingerprint, '23zdcblf7vf')
  assert.equal(buildConfig({ svc_youtube: true, formality: 'du', textStyle: 'detailed' }, opts).fingerprint, 'ha3dhhchel')
  assert.equal(buildConfig({ svc_youtube: true, language: 'en' }, opts).fingerprint, '6i05it7fsi')
  assert.equal(c.client.texts.de.notice, undefined)
  assert.equal(c.client.texts.en.notice, undefined)
  for (const k of ['unavailable', 'noServices', 'safeMode', 'close']) {
    assert.ok(c.client.notices.de[k], k)
    assert.ok(c.client.notices.en[k], k)
  }
  assert.match(c.client.notices.de.unavailable, /^Ihr Browser blockiert/)
  assert.match(buildConfig({ formality: 'du' }, opts).client.notices.de.unavailable, /^Dein Browser blockiert/)
})

test('every catalog CSP host passes the CSP host rule with all services enabled', () => {
  const params = {
    svc_ga4_measurementId: 'G-ABC123', svc_matomo_url: 'https://stats.example.com/', svc_matomo_siteId: '3',
    'svc_meta-pixel_pixelId': '1234567890', svc_linkedin_partnerId: '123456', svc_tiktok_pixelId: 'ABCDEFGHIJ12',
    'svc_google-ads_conversionId': 'AW-123456', svc_gtm_containerId: 'GTM-ABC123',
  }
  const settings = { ...base, ...params }
  for (const s of CATALOG) settings['svc_' + s.id] = true
  const c = buildConfig(settings, opts)
  assert.deepEqual(c.errors, [])
  assert.ok(c.services.every((s) => s.enabled), 'all services enabled')
  // the same rule the custom services must pass
  const RULE = /^https:\/\/(?:\*\.[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+|[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*)(?::\d+)?$/
  for (const s of CATALOG) for (const hosts of Object.values(s.csp)) for (const h of hosts) assert.match(h, RULE, `${s.id} ${h}`)
  for (const hosts of Object.values(c.csp)) assert.ok(hosts.length > 0)
  assert.ok(c.csp['connect-src'].includes('https://analytics.google.com'))
  assert.ok(c.csp['connect-src'].includes('https://analytics-ipv6.tiktokw.us'))
})

test('a catalog service without a vendor privacy URL still produces a valid client entry', () => {
  const c = buildConfig({ ...base, svc_matomo: true, svc_matomo_url: 'https://stats.example.com/', svc_matomo_siteId: '3' }, opts)
  assert.deepEqual(c.errors, [])
  const m = c.client.services.find((s) => s.id === 'matomo')
  assert.equal(m.provider.privacyUrl, '')
  assert.equal(c.client.privacyUrl, '/datenschutz')
})
