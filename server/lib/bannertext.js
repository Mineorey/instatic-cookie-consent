// Parts of the first-layer banner text that depend on the active services.
// All values are plain text; consent.js escapes them before display.
import { countryLabel } from './i18n.js'

// "A", "A und B", "A, B und C"
export function joinList(items, and) {
  if (items.length <= 1) return items.join('')
  return items.slice(0, -1).join(', ') + ' ' + and + ' ' + items[items.length - 1]
}

// Plain placeholder fill; unknown placeholders stay as they are.
export function fillBannerText(tpl, map) {
  return String(tpl).replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(map, k) ? map[k] : m))
}

// provider.short: a string or { de, en }
// provider.name: a string or { de, en }
function providerName(p, lang) {
  return p.name && typeof p.name === 'object' ? (p.name[lang] || p.name.de || '') : p.name
}
function providerShort(p, lang) {
  const s = p.short
  if (s && typeof s === 'object') return s[lang] || providerName(p, lang)
  return s || providerName(p, lang)
}

function uniqueList(values) {
  const out = []
  for (const v of values) if (v && !out.includes(v)) out.push(v)
  return out
}

// set: the I18N text set of one language (with its `short` block),
// lang: 'de' or 'en', textStyle: 'short' or 'detailed'.
export function bannerParts(active, set, lang, textStyle) {
  const S = set.short
  const all = active.flatMap((s) => s.thirdCountries || [])
  const countries = uniqueList(all.map((c) => countryLabel(c, lang, 'plain')))
  const countriesIn = uniqueList(all.map((c) => countryLabel(c, lang, 'in')))
  const profiling = active.some((s) => s.profiling)
  const shortStyle = textStyle === 'short'
  return {
    servicesShort: joinList(active.map((s) => (s.short && s.short[lang]) || s.label), S.and),
    providers: joinList(uniqueList(active.map((s) => providerShort(s.provider, lang))), S.and),
    countries: !countries.length ? ''
      : shortStyle ? fillBannerText(S.countries, { list: joinList(countriesIn, S.and) })
        : fillBannerText(set.intro.countries, { list: countries.join(', ') }),
    profiling: !profiling ? '' : shortStyle ? S.profiling : set.intro.profiling,
    moreLabel: S.more,
  }
}
