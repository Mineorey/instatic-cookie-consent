import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildConfig, settingsSchema } from '../../server/lib/config.js'
import { joinList, fillBannerText } from '../../server/lib/bannertext.js'

const base = { enabled: true, language: 'auto', formality: 'sie', privacyUrl: '/datenschutz', imprintUrl: '/impressum', validityMonths: 12, forceRenew: 0 }
const opts = { assetBase: '/uploads/plugins/instatic.consent/1.1.0/' }

// The first-layer text as the browser shows it (before escaping and before
// {more} becomes a link).
function banner(settings, lang) {
  const c = buildConfig({ ...base, ...settings }, opts).client
  const t = c.texts[lang].banner
  return { title: t.title, text: fillBannerText(t.description, c.bannerParts[lang]), parts: c.bannerParts[lang], client: c }
}

const yt = { svc_youtube: true }
const ytVimeo = { svc_youtube: true, svc_vimeo: true }
const three = { svc_youtube: true, 'svc_google-maps': true, svc_ga4: true, svc_ga4_measurementId: 'G-ABC123' }
const custom = (patch = {}) => JSON.stringify([{
  id: 'maps-y', label: 'Map Y', category: 'media',
  provider: { name: 'Y Maps GmbH', address: 'Berlin', privacyUrl: 'https://y.example.com/p' },
  purpose: { de: 'Karten', en: 'Maps' }, thirdCountries: [], cookies: [],
  match: { iframe: ['^https://y\\.example\\.com/'] }, ...patch,
}])

test('joinList: "A", "A und B", "A, B und C"', () => {
  assert.equal(joinList([], 'und'), '')
  assert.equal(joinList(['A'], 'und'), 'A')
  assert.equal(joinList(['A', 'B'], 'und'), 'A und B')
  assert.equal(joinList(['A', 'B', 'C'], 'and'), 'A, B and C')
})

test('short text is the default (de-sie, one service)', () => {
  const b = banner(yt, 'de')
  assert.equal(b.title, 'Kurz zu Cookies')
  assert.equal(b.text, 'Wir möchten auf dieser Seite Videos von YouTube einbinden. Dabei werden Daten wie Ihre IP-Adresse an Google übermittelt, auch in die USA. Die Anbieter nutzen die Daten teils auch für eigene Zwecke. Sie können Ihre Wahl jederzeit ändern. {more}')
  assert.equal(b.parts.moreLabel, 'Mehr erfahren')
})

test('short text de-du with two and three services', () => {
  const two = banner({ ...ytVimeo, formality: 'du' }, 'de')
  assert.equal(two.text, 'Wir möchten auf dieser Seite Videos von YouTube und Videos von Vimeo einbinden. Dabei werden Daten wie deine IP-Adresse an Google und Vimeo übermittelt, auch in die USA. Die Anbieter nutzen die Daten teils auch für eigene Zwecke. Du kannst deine Wahl jederzeit ändern. {more}')
  const t3 = banner({ ...three, formality: 'du' }, 'de')
  assert.equal(t3.parts.servicesShort, 'Videos von YouTube, Karten von Google Maps und Google Analytics zur Reichweitenmessung')
  assert.equal(t3.parts.providers, 'Google')
})

test('short text en with one, two and three services', () => {
  const one = banner(yt, 'en')
  assert.equal(one.title, 'A quick word on cookies')
  assert.equal(one.text, 'We would like to embed videos from YouTube on this site. This sends data such as your IP address to Google, including to the USA. Some providers also use the data for their own purposes. You can change your choice at any time. {more}')
  assert.equal(one.parts.moreLabel, 'Learn more')
  assert.equal(banner(ytVimeo, 'en').parts.servicesShort, 'videos from YouTube and videos from Vimeo')
  assert.equal(banner(ytVimeo, 'en').parts.providers, 'Google and Vimeo')
  const t3 = banner({ ...three, 'svc_meta-pixel': true, 'svc_meta-pixel_pixelId': '1234567' }, 'en')
  assert.equal(t3.parts.servicesShort, 'videos from YouTube, maps from Google Maps, Google Analytics for audience measurement and the Meta Pixel for ad measurement')
  assert.equal(t3.parts.providers, 'Google and Meta')
})

test('every catalog service has short phrases and the listed provider short names', () => {
  const all = { ...three, svc_vimeo: true, svc_matomo: true, svc_matomo_url: 'https://stats.example.com/', svc_matomo_siteId: '1',
    'svc_meta-pixel': true, 'svc_meta-pixel_pixelId': '1234567', svc_linkedin: true, svc_linkedin_partnerId: '1234',
    svc_tiktok: true, svc_tiktok_pixelId: 'ABCDEFGHIJ12', 'svc_google-ads': true, 'svc_google-ads_conversionId': 'AW-1', svc_gtm: true, svc_gtm_containerId: 'GTM-AB12' }
  const c = buildConfig({ ...base, ...all }, opts)
  assert.equal(c.errors.length, 0, c.errors.join())
  assert.equal(c.client.bannerParts.de.servicesShort, 'Videos von YouTube, Videos von Vimeo, Karten von Google Maps, Google Analytics zur Reichweitenmessung, Matomo zur Reichweitenmessung, das Meta-Pixel zur Werbemessung, das LinkedIn Insight Tag zur Werbemessung, das TikTok-Pixel zur Werbemessung, Google Ads zur Werbemessung und den Google Tag Manager')
  assert.match(c.client.bannerParts.de.providers, /^Google, Vimeo, .*Meta, LinkedIn und TikTok$/)
  assert.match(c.client.bannerParts.en.servicesShort, /Google Tag Manager$/)
})

test('custom service: short phrase from JSON, fallback to label; provider short fallback to name', () => {
  const fallback = banner({ customServices: custom() }, 'de')
  assert.equal(fallback.parts.servicesShort, 'Map Y')
  assert.equal(fallback.parts.providers, 'Y Maps GmbH')
  const own = banner({ customServices: custom({ short: { de: 'Karten von Y', en: 'maps from Y' }, provider: { name: 'Y Maps GmbH', short: 'Y', privacyUrl: 'https://y.example.com/p' } }) }, 'en')
  assert.equal(own.parts.servicesShort, 'maps from Y')
  assert.equal(own.parts.providers, 'Y')
})

test('countries and profiling only when an active service needs them', () => {
  const none = banner({ customServices: custom() }, 'de')
  assert.equal(none.parts.countries, '')
  assert.equal(none.parts.profiling, '')
  assert.equal(none.text, 'Wir möchten auf dieser Seite Map Y einbinden. Dabei werden Daten wie Ihre IP-Adresse an Y Maps GmbH übermittelt. Sie können Ihre Wahl jederzeit ändern. {more}')
  const other = banner({ customServices: custom({ thirdCountries: ['Kanada'], profiling: true }) }, 'de')
  assert.equal(other.parts.countries, ', auch in Kanada')
  assert.equal(other.parts.profiling, ' Die Anbieter nutzen die Daten teils auch für eigene Zwecke.')
  const both = banner({ svc_youtube: true, customServices: custom({ thirdCountries: ['Kanada'] }) }, 'en')
  assert.equal(both.parts.countries, ', including to the USA and Kanada')
})

test('custom label is passed on unescaped (the browser escapes it)', () => {
  const b = banner({ customServices: custom({ label: 'Map <b>Y</b>' }) }, 'de')
  assert.equal(b.parts.servicesShort, 'Map <b>Y</b>')
})

test('detailed text style keeps the previous texts and fingerprint', () => {
  const b = banner({ ...yt, textStyle: 'detailed' }, 'de')
  assert.equal(b.title, 'Datenschutz-Einstellungen')
  assert.match(b.text, /folgende externe Dienste einsetzen: \{services\}\. Dabei werden personenbezogene Daten wie Ihre IP-Adresse an die Anbieter übermittelt, teilweise auch in Länder außerhalb der EU \(USA\)\. Einige Anbieter/)
  // values computed with 1.0.2: upgrading with textStyle "detailed" asks nobody again
  assert.equal(buildConfig({ ...base, ...yt, textStyle: 'detailed' }, opts).fingerprint, '2b0nw51f5kv')
  assert.equal(buildConfig({ ...base, formality: 'du', svc_youtube: true, 'svc_meta-pixel': true, 'svc_meta-pixel_pixelId': '1234567', textStyle: 'detailed' }, opts).fingerprint, '2afibz5xp5l') // Meta cookies _fbc added in 1.2.3 (YouTube-only value above is unchanged)
  assert.notEqual(buildConfig({ ...base, ...yt }, opts).fingerprint, '2b0nw51f5kv')
})

test('custom title and description override the short text; new placeholders work there', () => {
  const b = banner({ ...ytVimeo, title: 'Hallo', description: '{servicesShort} von {providers}. {more}' }, 'de')
  assert.equal(b.title, 'Hallo')
  assert.equal(b.text, 'Videos von YouTube und Videos von Vimeo von Google und Vimeo. {more}')
})

test('layout and icon settings reach the client config, not the fingerprint', () => {
  const c = (s) => buildConfig({ ...base, ...yt, ...s }, opts)
  assert.equal(c({}).client.layout, 'wide')
  assert.equal(c({ layout: 'bar' }).client.layout, 'bar')
  assert.equal(c({ layout: 'box' }).client.layout, 'box')
  assert.equal(c({ layout: 'nonsense' }).client.layout, 'wide')
  assert.equal(c({}).client.showIcon, true)
  assert.equal(c({ showIcon: false }).client.showIcon, false)
  assert.equal(c({}).fingerprint, c({ layout: 'bar', showIcon: false }).fingerprint)
})

test('settings schema has layout, textStyle and showIcon with defaults', () => {
  const s = settingsSchema()
  const f = (id) => s.find((x) => x.id === id)
  assert.equal(f('layout').type, 'select')
  assert.equal(f('layout').default, 'wide')
  assert.deepEqual(f('layout').options.map((o) => o.value), ['wide', 'box', 'bar'])
  assert.equal(f('textStyle').type, 'select')
  assert.equal(f('textStyle').default, 'short')
  assert.deepEqual(f('textStyle').options.map((o) => o.value), ['short', 'detailed'])
  assert.equal(f('showIcon').type, 'toggle')
  assert.equal(f('showIcon').default, true)
  assert.match(f('description').description, /\{servicesShort\}.*\{providers\}.*\{more\}/)
})

const matomo = { svc_matomo: true, svc_matomo_url: 'https://stats.example.com/', svc_matomo_siteId: '1' }

test('matomo: provider short name per language ("uns" / "us")', () => {
  assert.equal(banner({ ...matomo }, 'de').text, 'Wir möchten auf dieser Seite Matomo zur Reichweitenmessung einbinden. Dabei werden Daten wie Ihre IP-Adresse an uns übermittelt. Sie können Ihre Wahl jederzeit ändern. {more}')
  assert.equal(banner({ ...matomo, formality: 'du' }, 'de').text, 'Wir möchten auf dieser Seite Matomo zur Reichweitenmessung einbinden. Dabei werden Daten wie deine IP-Adresse an uns übermittelt. Du kannst deine Wahl jederzeit ändern. {more}')
  assert.equal(banner({ ...matomo }, 'en').text, 'We would like to embed Matomo for audience measurement on this site. This sends data such as your IP address to us. You can change your choice at any time. {more}')
  for (const formality of ['sie', 'du']) assert.equal(banner({ ...matomo, svc_youtube: true, formality }, 'de').parts.providers, 'Google und uns')
  assert.equal(banner({ ...matomo, svc_youtube: true }, 'en').parts.providers, 'Google and us')
})

test('custom service provider.short accepts { de, en }', () => {
  const s = { customServices: custom({ provider: { name: 'Y Maps GmbH', short: { de: 'Y-Karten', en: 'Y Maps' }, privacyUrl: 'https://y.example.com/p' } }) }
  assert.equal(banner(s, 'de').parts.providers, 'Y-Karten')
  assert.equal(banner(s, 'en').parts.providers, 'Y Maps')
})

test('country names like "constructor" are printed literally', () => {
  const b = banner({ customServices: custom({ thirdCountries: ['constructor', 'toString', 'USA'] }) }, 'de')
  assert.equal(b.parts.countries, ', auch in constructor, toString und die USA')
})

const tiktok = { svc_tiktok: true, 'svc_tiktok_pixelId': 'ABCDEFGHIJ12' }

test('third countries are named in the visitor language, with articles where needed', () => {
  const de = banner({ ...tiktok, svc_youtube: true }, 'de')
  assert.match(de.parts.countries, /^, auch in die USA, Malaysia, Singapur, Kanada, Israel, Japan, Südkorea, Australien, Brasilien, China und die Philippinen$/)
  const en = banner({ ...tiktok, svc_youtube: true }, 'en')
  assert.match(en.parts.countries, /^, including to the USA, Malaysia, Singapore, Canada, Israel, Japan, South Korea, Australia, Brazil, China and the Philippines$/)
  assert.ok(!/Singapur|Kanada|Südkorea/.test(en.parts.countries))
})

test('detailed text lists plain country names per language', () => {
  assert.match(banner({ ...tiktok, textStyle: 'detailed' }, 'en').text, /\(USA, Malaysia, Singapore, Canada/)
  assert.match(banner({ ...tiktok, textStyle: 'detailed' }, 'de').text, /\(USA, Malaysia, Singapur, Kanada/)
})

test('legacy country names of custom services keep working next to codes', () => {
  assert.equal(banner({ customServices: custom({ thirdCountries: ['USA', 'US', 'Kanada'] }) }, 'en').parts.countries, ', including to the USA and Kanada')
  assert.equal(banner({ customServices: custom({ thirdCountries: ['PH'] }) }, 'de').parts.countries, ', auch in die Philippinen')
})

test('client services carry country labels and localised provider data', () => {
  const c = buildConfig({ ...base, ...tiktok, svc_matomo: true, svc_matomo_url: 'https://stats.example.com/', svc_matomo_siteId: '3' }, opts).client
  const t = c.services.find((s) => s.id === 'tiktok')
  assert.deepEqual(t.thirdCountries.slice(0, 2), ['US', 'MY'])
  assert.ok(t.countryLabels.en.includes('Philippines') && t.countryLabels.de.includes('Philippinen'))
  assert.match(t.provider.name.de, /gemeinsam verantwortlich/)
  assert.match(t.provider.name.en, /jointly responsible/)
  const m = c.services.find((s) => s.id === 'matomo')
  assert.equal(m.provider.name.en, 'Operator of this website (own Matomo installation)')
  assert.equal(m.provider.address.en, 'see legal notice')
})

test('custom services accept { de, en } for provider name and address', () => {
  const s = JSON.stringify([{ id: 'maps-z', label: 'Z', category: 'media',
    provider: { name: { de: 'Z GmbH', en: 'Z Ltd' }, address: { de: 'Berlin, Deutschland', en: 'Berlin, Germany' }, privacyUrl: 'https://z.example.com/p' },
    purpose: { de: 'a', en: 'b' }, match: { iframe: ['^https://z\\.example\\.com/'] } }])
  const r = buildConfig({ ...base, customServices: s }, opts)
  assert.deepEqual(r.errors, [])
  assert.deepEqual(r.client.services.find((x) => x.id === 'maps-z').provider.address, { de: 'Berlin, Deutschland', en: 'Berlin, Germany' })
  assert.equal(banner({ customServices: s }, 'en').parts.providers, 'Z Ltd')
})
