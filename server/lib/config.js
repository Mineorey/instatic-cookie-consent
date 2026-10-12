import { CATALOG, CATEGORIES } from './catalog.js'
import { I18N, countryLabel } from './i18n.js'
import { hash53 } from './hash.js'
import { bannerParts } from './bannertext.js'
import { parseHostList, cspHosts } from './hosts.js'
import { HINTS } from './hints.js'

const LAYOUTS = ['wide', 'box', 'bar']
const DIRECTIVES = { script: 'script-src', frame: 'frame-src', connect: 'connect-src', img: 'img-src' }

function str(v) { return typeof v === 'string' ? v.trim() : '' }
function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

// A '*' is only allowed as the leading label and must be followed by at
// least two labels (https://*.example.com, not https://* or https://*.com).
const CSP_HOST = /^https:\/\/(?:\*\.[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+|[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*)(?::\d+)?$/

function regexOk(x) {
  if (typeof x !== 'string') return false
  try { new RegExp(x); return true } catch (e) { return false }
}

function matchersOk(m) {
  if (!m || typeof m !== 'object') return false
  const lists = ['iframe', 'script', 'inline'].filter((k) => m[k] !== undefined)
  if (!lists.length || !lists.every((k) => Array.isArray(m[k]))) return false
  return (m.iframe || []).every(regexOk) && (m.script || []).every(regexOk) &&
    (m.inline || []).every((x) => typeof x === 'string' && x !== '')
}

function cspOk(csp) {
  if (csp === undefined) return true
  if (!csp || typeof csp !== 'object') return false
  return Object.values(csp).every((hosts) => Array.isArray(hosts) && hosts.every((h) => typeof h === 'string' && CSP_HOST.test(h)))
}

function safeUrl(v) {
  const u = str(v)
  return (/^\/(?!\/)/.test(u) || /^https?:\/\//.test(u)) ? u : null
}

// provider.name / provider.address: a string or { de, en } (one language may be missing)
function readLoc(v) {
  if (typeof v === 'string') return v
  if (v && typeof v === 'object' && (str(v.de) || str(v.en))) return { de: str(v.de) || str(v.en), en: str(v.en) || str(v.de) }
  return ''
}
function locOk(v) { return typeof v === 'string' || (!!v && typeof v === 'object' && (typeof v.de === 'string' || typeof v.en === 'string')) }
// the German value: what the fingerprint of a service has always been made of
function locDe(v) { return v && typeof v === 'object' ? v.de : v }

// provider.short of a custom service: a string or { de, en }
function readProviderShort(v) {
  if (str(v)) return { short: str(v) }
  if (v && typeof v === 'object' && (str(v.de) || str(v.en))) return { short: { de: str(v.de), en: str(v.en) } }
  return {}
}

function validCustom(s) {
  return s && typeof s.id === 'string' && /^[a-z0-9-]{2,40}$/.test(s.id) &&
    typeof s.label === 'string' && CATEGORIES.includes(s.category) && s.category !== 'necessary' &&
    s.provider && locOk(s.provider.name) && (s.provider.address === undefined || locOk(s.provider.address)) && /^https:\/\//.test(s.provider.privacyUrl || '') &&
    matchersOk(s.match) && cspOk(s.csp)
}

function readCustom(raw, errors) {
  if (!str(raw)) return []
  let list
  try { list = JSON.parse(raw) } catch (e) { errors.push('customServices: kein gültiges JSON'); return [] }
  if (!Array.isArray(list)) { errors.push('customServices: muss ein Array sein'); return [] }
  const out = []
  for (const s of list) {
    if (!validCustom(s)) { errors.push(`customServices: Eintrag ${s && s.id ? s.id : '?'} unvollständig`); continue }
    out.push({
      id: s.id, label: String(s.label), category: s.category,
      provider: { name: readLoc(s.provider.name), ...readProviderShort(s.provider.short), address: readLoc(s.provider.address), privacyUrl: String(s.provider.privacyUrl) },
      ...(s.short && typeof s.short === 'object' ? { short: { de: str(s.short.de), en: str(s.short.en) } } : {}),
      purpose: { de: String((s.purpose && s.purpose.de) || ''), en: String((s.purpose && s.purpose.en) || '') },
      thirdCountries: Array.isArray(s.thirdCountries) ? s.thirdCountries.map(String) : [],
      profiling: !!s.profiling, cookies: Array.isArray(s.cookies) ? s.cookies.map(String) : [],
      csp: s.csp || {}, match: s.match, params: [], loader: null, custom: true,
    })
  }
  return out
}

export function buildConfig(settings, { assetBase }) {
  const errors = []
  const services = []
  for (const def of CATALOG) {
    let enabled = settings['svc_' + def.id] === true
    const params = {}
    for (const p of def.params) {
      const v = str(settings[`svc_${def.id}_${p.id}`])
      params[p.id] = v
      if (enabled && !new RegExp(p.pattern).test(v)) {
        errors.push(`${def.id}: Parameter ${p.id} fehlt oder ist ungültig`)
        enabled = false
      }
    }
    const svc = { ...def, match: { ...def.match }, csp: { ...def.csp }, enabled, params }
    if (def.cspFromParam && enabled) {
      const url = params[def.cspFromParam]
      const origin = url.replace(/^(https:\/\/[^/]+).*$/, '$1')
      if (CSP_HOST.test(origin)) {
        svc.csp = { script: [origin], connect: [origin], img: [origin] }
        svc.match.script = ['^' + escapeRegex(url)]
      } else {
        errors.push(`${def.id}: Parameter ${def.cspFromParam} ergibt keinen gültigen Host`)
        svc.enabled = false
      }
    }
    services.push(svc)
  }
  for (const c of readCustom(settings.customServices, errors)) {
    if (services.some((s) => s.id === c.id)) { errors.push(`customServices: ${c.id} existiert bereits`); continue }
    services.push({ ...c, enabled: true, params: {} })
  }

  const active = services.filter((s) => s.enabled)
  const csp = { 'script-src': [], 'frame-src': [], 'connect-src': [], 'img-src': [] }
  for (const s of active) {
    for (const [k, hosts] of Object.entries(s.csp || {})) {
      const d = DIRECTIVES[k]
      for (const h of hosts || []) if (d && !csp[d].includes(h)) csp[d].push(h)
    }
  }
  const loaders = active.filter((s) => s.loader).map((s) => ({ id: s.id, category: s.category, src: assetBase + 'frontend/services/' + s.loader, params: s.params }))

  const formality = settings.formality === 'du' ? 'de-du' : 'de-sie'
  const textStyle = settings.textStyle === 'detailed' ? 'detailed' : 'short'
  const parts = {}
  const texts = {}
  // notice texts stay outside `texts`: those are fingerprinted, and new texts must not trigger a new revision
  const notices = {}
  for (const [lang, set, title, desc] of [['de', I18N[formality], settings.title, settings.description], ['en', I18N.en, settings.titleEn, settings.descriptionEn]]) {
    const t = JSON.parse(JSON.stringify(set))
    delete t.short
    notices[lang] = t.notice
    delete t.notice
    if (textStyle === 'short') { t.banner.title = set.short.title; t.banner.description = set.short.description }
    if (str(title)) t.banner.title = str(title)
    if (str(desc)) t.banner.description = str(desc)
    texts[lang] = t
    parts[lang] = bannerParts(active, set, lang, textStyle)
  }
  const { de, en } = texts
  // short parts only count for the fingerprint where a text uses them, so the
  // detailed default keeps the fingerprint of earlier versions
  const usesParts = textStyle === 'short' || [de, en].some((t) => /\{(servicesShort|providers|more)\}/.test(t.banner.description))

  const vm = Number(settings.validityMonths)
  const validityMonths = vm > 0 ? Math.min(13, Math.max(1, Math.floor(vm))) : 12
  const urls = {}
  for (const k of ['privacyUrl', 'imprintUrl']) {
    const raw = str(settings[k])
    urls[k] = raw ? safeUrl(raw) : ''
    if (urls[k] === null) { errors.push(`${k}: nur /pfad, https:// oder http:// erlaubt`); urls[k] = '' }
  }
  const client = {
    enabled: settings.enabled !== false,
    language: ['de', 'en'].includes(settings.language) ? settings.language : 'auto',
    validityDays: validityMonths * 30,
    privacyUrl: urls.privacyUrl, imprintUrl: urls.imprintUrl,
    layout: LAYOUTS.includes(settings.layout) ? settings.layout : 'wide',
    showIcon: settings.showIcon !== false,
    style: {
      accent: str(settings.accentColor), text: str(settings.textColor),
      background: str(settings.backgroundColor), radius: str(settings.radius),
    },
    texts: { de, en },
    notices,
    bannerParts: parts,
    services: services.map((s) => ({
      id: s.id, label: s.label, category: s.category, enabled: s.enabled,
      provider: s.provider, purpose: s.purpose, thirdCountries: s.thirdCountries,
      countryLabels: { de: s.thirdCountries.map((c) => countryLabel(c, 'de', 'plain')), en: s.thirdCountries.map((c) => countryLabel(c, 'en', 'plain')) },
      profiling: !!s.profiling, cookies: s.cookies,
      match: { iframe: s.match.iframe || [] }, rewrite: s.rewrite || null,
      hosts: [...new Set(cspHosts(Object.values(s.csp || {}).flat()))],
      // the CSP opens these hosts: the guard blocks iframes there that miss the patterns
      frameHosts: s.enabled ? [...new Set(cspHosts((s.csp && s.csp.frame) || []))] : [],
    })),
  }
  const fingerprint = hash53(JSON.stringify({
    services: active.map((s) => [s.id, s.category, s.params, { ...s.provider, name: locDe(s.provider.name), address: locDe(s.provider.address), short: undefined }, s.purpose, s.thirdCountries.map((c) => (c === 'US' ? 'USA' : c)), s.cookies]),
    texts: client.texts, bannerParts: usesParts ? parts : undefined, privacyUrl: client.privacyUrl, imprintUrl: client.imprintUrl,
    validityMonths, forceRenew: Number(settings.forceRenew) || 0,
  }))
  const own = parseHostList(settings.scanOwnHosts)
  const allow = parseHostList(settings.scanAllowHosts)
  for (const line of own.invalid) errors.push(`scanOwnHosts: ungültige Zeile „${line}“`)
  for (const line of allow.invalid) errors.push(`scanAllowHosts: ungültige Zeile „${line}“`)
  const scan = {
    enabled: settings.scanEnabled !== false,
    // check mode only on request: it exposes the page's third-party list to any visitor
    browser: settings.scanBrowser === true,
    own: own.hosts, allow: allow.hosts, invalid: [...own.invalid, ...allow.invalid],
    generation: Number.isFinite(Number(settings.scanReset)) ? Math.max(0, Math.floor(Number(settings.scanReset))) : 0,
  }
  client.scan = scan.browser
    ? { own: scan.own, allow: scan.allow, src: assetBase + 'frontend/consent-scan.js', hints: HINTS.map((h) => ({ id: h.id, name: h.name, hosts: h.hosts, advice: h.advice })) }
    : null
  // display only (version summary), not part of the fingerprint
  const meta = { textStyle, formality: formality === 'de-du' ? 'du' : 'sie', validityMonths }
  return { enabled: client.enabled, fingerprint, services, loaders, csp, client, errors, scan, meta }
}

export function settingsSchema() {
  const s = [
    { id: 'enabled', type: 'toggle', label: 'Banner anzeigen', default: true, description: 'Aus: Dienste bleiben trotzdem blockiert, es lädt nichts.' },
    { id: 'language', type: 'select', label: 'Sprache', default: 'auto', options: [{ label: 'Automatisch (Seitensprache)', value: 'auto' }, { label: 'Deutsch', value: 'de' }, { label: 'English', value: 'en' }] },
    { id: 'formality', type: 'select', label: 'Anrede (Deutsch)', default: 'sie', options: [{ label: 'Sie', value: 'sie' }, { label: 'Du', value: 'du' }] },
    { id: 'privacyUrl', type: 'text', label: 'Link Datenschutzerklärung', description: 'z. B. /datenschutz' },
    { id: 'imprintUrl', type: 'text', label: 'Link Impressum', description: 'z. B. /impressum' },
    { id: 'layout', type: 'select', label: 'Banner-Layout', default: 'wide', options: [{ label: 'Breit, mittig', value: 'wide' }, { label: 'Kompakt', value: 'box' }, { label: 'Leiste, volle Breite', value: 'bar' }] },
    { id: 'textStyle', type: 'select', label: 'Banner-Text', default: 'short', options: [{ label: 'Kurz', value: 'short' }, { label: 'Ausführlich', value: 'detailed' }] },
    { id: 'showIcon', type: 'toggle', label: 'Keks-Grafik anzeigen', default: true },
    { id: 'title', type: 'text', label: 'Eigener Banner-Titel (Deutsch, optional)' },
    { id: 'description', type: 'textarea', rows: 4, label: 'Eigener Banner-Text (Deutsch, optional)', description: 'Platzhalter: {services} (Dienste mit Anbieter und Zweck), {servicesShort} (Kurzform), {providers}, {countries}, {profiling}, {more} (Link „Mehr erfahren“). Leer = Standardtext.' },
    { id: 'titleEn', type: 'text', label: 'Eigener Banner-Titel (Englisch, optional)' },
    { id: 'descriptionEn', type: 'textarea', rows: 4, label: 'Eigener Banner-Text (Englisch, optional)' },
  ]
  for (const def of CATALOG) {
    s.push({ id: 'svc_' + def.id, type: 'toggle', label: `${def.label} aktivieren`, default: false, description: def.purpose.de })
    for (const p of def.params) s.push({ id: `svc_${def.id}_${p.id}`, type: 'text', label: `${def.label}: ${p.label}` })
  }
  s.push(
    { id: 'customServices', type: 'textarea', rows: 8, label: 'Eigene Dienste (JSON, optional)', default: '', description: 'Array im Katalogformat, siehe README.' },
    { id: 'validityMonths', type: 'number', label: 'Gültigkeit der Auswahl (Monate)', default: 12, min: 1, max: 13 },
    { id: 'forceRenew', type: 'number', label: 'Neue Abfrage erzwingen (Zahl erhöhen)', default: 0, min: 0 },
    { id: 'accentColor', type: 'color', label: 'Akzentfarbe (Schaltflächen)' },
    { id: 'textColor', type: 'color', label: 'Textfarbe' },
    { id: 'backgroundColor', type: 'color', label: 'Hintergrundfarbe' },
    { id: 'radius', type: 'text', label: 'Eckenradius (z. B. 12px)' },
    { id: 'scanEnabled', type: 'toggle', label: 'Scan beim Veröffentlichen', default: true, description: 'Listet fremde Adressen jeder Seite unter „Consent-Scan“.' },
    { id: 'scanBrowser', type: 'toggle', label: 'Prüfmodus #cc-scan erlauben', default: false, description: 'Seitenadresse mit #cc-scan öffnen: zeigt, was der Browser geladen und gespeichert hat. Nur für Einrichtung und Abnahme einschalten.' },
    { id: 'scanOwnHosts', type: 'textarea', rows: 3, label: 'Eigene Hosts (einer pro Zeile)', default: '', description: 'z. B. cdn.example.com oder *.example.com' },
    { id: 'scanAllowHosts', type: 'textarea', rows: 3, label: 'Geprüfte Hosts ohne Einwilligung', default: '', description: 'Fremde Hosts, die geprüft sind und keine Einwilligung brauchen (einer pro Zeile).' },
    { id: 'scanReset', type: 'number', label: 'Scan-Liste leeren (Zahl erhöhen)', default: 0, min: 0 },
  )
  return s
}
