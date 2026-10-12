import { hostOf, hostMatches, cspHosts } from './hosts.js'
import { hintForHost, hintForInline } from './hints.js'

// HTML scanner: finds third-party sources in page html and classifies them.
const SCAN_FONT_EXT = /\.(woff2?|ttf|otf|eot)$/i
const SCAN_IMG_EXT = /\.(png|jpe?g|gif|webp|avif|svg)$/i
const SCAN_DATA_URL = /^\s*(?:https?:)?\/\/[^/\s]/i
const SCAN_SKIP_TYPES = new Set(['application/json', 'application/ld+json', 'importmap', 'speculationrules', 'text/template', 'text/x-template', 'text/plain', 'text/html'])

function scanDecode(v) {
  return String(v).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

// Quote-aware attribute parser; the first occurrence of a repeated name wins.
function scanAttrs(s) {
  const out = {}
  const re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g
  let m
  while ((m = re.exec(s))) {
    const k = m[1].toLowerCase()
    if (k in out) continue
    out[k] = scanDecode(m[2] ?? m[3] ?? m[4] ?? '')
  }
  return out
}

// Same matching as the transform: an iframe is blocked by a match.iframe
// pattern, or (pattern-less) on the frame host of an active service; a
// script by a match.script pattern. Among several hits the first enabled
// service wins, otherwise the first one listed. Anything else that only
// shares a host with a service is reported as a host match ('host'): the
// transform does not block it.
// A URL in a data-* attribute ('deferred') is loaded by a site script: only
// the runtime guard can stop it, and the guard only handles iframes. So it
// follows the iframe rule (pattern, frame host of an active service); a
// script pattern hit is only a host match.
function scanPatternHit(url, list, services, reCache) {
  const hits = []
  for (const s of services) {
    for (const re of (s.match && s.match[list]) || []) {
      let rx = reCache.get(re)
      if (rx === undefined) {
        try { rx = new RegExp(re, 'i') } catch (e) { rx = null }
        reCache.set(re, rx)
      }
      if (rx && rx.test(url)) { hits.push(s); break }
    }
  }
  return hits.find((s) => s.enabled) || hits[0] || null
}

function scanServiceFor(host, url, kind, services, reCache) {
  const frameLike = kind === 'iframe' || kind === 'deferred'
  const list = frameLike ? 'iframe' : kind === 'script' ? 'script' : null
  if (list) {
    const hit = scanPatternHit(url, list, services, reCache)
    if (hit) return { svc: hit, match: 'pattern' }
  }
  // a deferred URL that is a script (script pattern, or on an active
  // service's script host) is not built into an iframe: no frame-host rule
  let scriptLike = false
  if (kind === 'deferred') {
    const hit = scanPatternHit(url, 'script', services, reCache)
    if (hit) return { svc: hit, match: 'host' }
    scriptLike = services.some((s) => s.enabled && cspHosts((s.csp && s.csp.script) || []).some((p) => hostMatches(host, p)))
  }
  if (frameLike && !scriptLike && /^https?:\/\//i.test(url)) {
    for (const s of services) {
      if (s.enabled && cspHosts((s.csp && s.csp.frame) || []).some((p) => hostMatches(host, p))) return { svc: s, match: 'frame' }
    }
  }
  for (const s of services) {
    const c = s.csp || {}
    const hosts = cspHosts([...(c.frame || []), ...(c.script || []), ...(c.connect || []), ...(c.img || [])])
    if (hosts.some((p) => hostMatches(host, p))) return { svc: s, match: 'host' }
  }
  return null
}

function scanCssUrls(css) {
  const out = []
  const re = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)|@import\s+(?:"([^"]*)"|'([^']*)')/gi
  let m
  while ((m = re.exec(css))) {
    const u = m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5]
    if (u && u.trim()) out.push(u.trim())
  }
  return out
}

export function scanHtml(html, services) {
  const found = []
  const seen = new Set()
  try {
    const src = String(html == null ? '' : html)
    const list = services || []
    const reCache = new Map()
    const add = (kind, raw) => {
      const t = String(raw || '').trim()
      const abs = t.startsWith('//') ? 'https:' + t : t
      const host = hostOf(abs)
      if (!host) return
      const mm = /^https?:\/\/[^/?#]+[^?#]*/i.exec(abs)
      const url = (mm ? mm[0] : abs).slice(0, 200)
      const dk = host + '|' + kind + '|' + url
      if (seen.has(dk)) return
      seen.add(dk)
      const hit = scanServiceFor(host, abs, kind, list, reCache)
      const hint = hit ? null : hintForHost(host)
      found.push({ key: host, host, kind, url, service: hit ? hit.svc.id : null, match: hit ? hit.match : null, hint: hint ? hint.id : null })
    }
    const addSrcset = (v) => {
      for (const c of String(v || '').split(',')) { const u = c.trim().split(/\s+/)[0]; if (u) add('image', u) }
    }
    const addCss = (css) => {
      for (const u of scanCssUrls(css)) {
        const p = u.replace(/[?#].*$/, '')
        add(SCAN_FONT_EXT.test(p) ? 'font' : SCAN_IMG_EXT.test(p) ? 'image' : 'style', u)
      }
    }

    // <picture>/<video>/<audio> open and close positions, to find a <source>'s parent
    const containers = []
    const cre = /<(\/?)(picture|video|audio)\b/gi
    let m
    while ((m = cre.exec(src))) containers.push([m.index, m[1] === '/', m[2].toLowerCase()])
    let cIdx = 0
    let cParent = ''
    const parentAt = (idx) => {
      while (cIdx < containers.length && containers[cIdx][0] < idx) { cParent = containers[cIdx][1] ? '' : containers[cIdx][2]; cIdx++ }
      return cParent
    }

    const re = /<([a-z][a-z0-9-]*)\b((?:"[^"]{0,16000}"|'[^']{0,16000}'|[^>"']){0,4000})>/gi
    while ((m = re.exec(src))) {
      const tag = m[1].toLowerCase()
      const a = scanAttrs(m[2])
      if (a.style) addCss(a.style)
      // absolute URLs in data-* attributes: embeds and widgets built by site scripts
      for (const k in a) if (k.startsWith('data-') && SCAN_DATA_URL.test(a[k])) add('deferred', a[k])
      if (tag === 'iframe') add('iframe', a.src)
      else if (tag === 'img') { add('image', a.src); addSrcset(a.srcset) }
      else if (tag === 'video') { add('media', a.src); add('media', a.poster) }
      else if (tag === 'audio' || tag === 'track') add('media', a.src)
      else if (tag === 'source') {
        const parent = parentAt(m.index)
        addSrcset(a.srcset)
        add(parent === 'picture' ? 'image' : 'media', a.src)
      } else if (tag === 'link') {
        const rel = (a.rel || '').toLowerCase().split(/\s+/)
        if (rel.includes('stylesheet')) add('style', a.href)
        else if (rel.includes('icon') || rel.includes('apple-touch-icon')) add('image', a.href)
        else if (rel.includes('preload') && (a.as || '').toLowerCase() === 'font') add('font', a.href)
        else if (['preconnect', 'dns-prefetch', 'preload', 'prefetch', 'modulepreload'].some((r) => rel.includes(r))) add('preconnect', a.href)
      } else if (tag === 'embed') add('other', a.src)
      else if (tag === 'object') add('other', a.data)
      else if (tag === 'form') add('form', a.action)
    }

    const lower = src.toLowerCase()
    const sre = /<style\b[^>]{0,4000}>/gi
    while ((m = sre.exec(src))) {
      const end = lower.indexOf('</style', sre.lastIndex)
      if (end < 0) break
      addCss(src.slice(sre.lastIndex, end))
      sre.lastIndex = end
    }

    const needles = []
    for (const s of list) for (const n of (s.match && s.match.inline) || []) needles.push([n, s])
    const scre = /<script\b((?:"[^"]{0,16000}"|'[^']{0,16000}'|[^>"']){0,4000})>/gi
    while ((m = scre.exec(src))) {
      const bodyStart = scre.lastIndex
      const end = lower.indexOf('</script', bodyStart)
      if (end < 0) break
      const body = src.slice(bodyStart, end)
      scre.lastIndex = end
      const a = scanAttrs(m[1])
      if (a.src) { add('script', a.src); continue }
      const type = (a.type || '').split(';')[0].trim().toLowerCase()
      if (SCAN_SKIP_TYPES.has(type)) continue
      // same choice as the transform: first enabled service among the hits
      const hits = needles.filter(([n]) => body.includes(n))
      const hit = hits.find(([, s]) => s.enabled) || hits[0]
      let f = null
      if (hit) f = { key: 'inline:' + hit[1].id, host: '', kind: 'inline', url: '', service: hit[1].id, match: 'pattern', hint: null }
      else {
        const h = hintForInline(body)
        if (h) f = { key: 'inline:' + h.id, host: '', kind: 'inline', url: '', service: null, match: null, hint: h.id }
      }
      if (!f || seen.has(f.key + '|inline|')) continue
      seen.add(f.key + '|inline|')
      found.push(f)
    }
  } catch (e) { /* return what was collected so far */ }
  return found
}

// Order: blocked by the transform (pattern: covered/blocked; frame host:
// blocked) -> own -> allowed -> host of a service, not blocked (unblocked)
// -> unknown. A finding without a match type counts as a host match, never
// as blocked.
export function classifyFinding(f, ctx) {
  if (f.service && f.match === 'pattern') {
    const s = (ctx.services || []).find((x) => x.id === f.service)
    return s && s.enabled ? 'covered' : 'blocked'
  }
  if (f.service && f.match === 'frame') return 'blocked'
  if (!f.host) return 'unknown'
  if ((ctx.own || []).some((p) => hostMatches(f.host, p))) return 'own'
  if ((ctx.allow || []).some((p) => hostMatches(f.host, p))) return 'allowed'
  return f.service ? 'unblocked' : 'unknown'
}

// Severity of a row status: the worst status of a host wins.
export const SCAN_STATUS_RANK = { own: 0, allowed: 1, covered: 2, blocked: 3, unblocked: 4, unknown: 5 }

export function suggestService(host, kind) {
  const id = host.replace(/^www\./, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'service'
  const re = '^https?://' + host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/'
  const svc = {
    id, label: host, category: kind === 'iframe' ? 'media' : 'marketing',
    provider: { name: 'ANBIETER EINTRAGEN', address: '', privacyUrl: 'https://' + host + '/' },
    purpose: { de: 'ZWECK EINTRAGEN', en: 'PURPOSE' }, thirdCountries: [], profiling: false, cookies: [],
    match: kind === 'iframe' ? { iframe: [re] } : { script: [re] },
    csp: kind === 'iframe' ? { frame: ['https://' + host] } : { script: ['https://' + host] },
  }
  return JSON.stringify([svc], null, 2)
}
