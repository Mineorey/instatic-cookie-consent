import { hostOf, hostMatches, cspHosts } from './hosts.js'

function parseAttrList(s) {
  const out = []
  const re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g
  let m
  while ((m = re.exec(s))) {
    const v = m[2] ?? m[3] ?? m[4]
    out.push([m[1].toLowerCase(), v === undefined ? null : v])
  }
  return out
}

// A repeated attribute name: the first occurrence wins, as in the browser.
function parseAttrs(s) {
  const out = {}
  for (const [k, v] of parseAttrList(s)) if (!(k in out)) out[k] = v ?? ''
  return out
}

function normUrl(u) {
  const t = String(u).trim()
  return t.startsWith('//') ? 'https:' + t : t
}

const SKIP_TYPES = new Set(['application/json', 'application/ld+json', 'importmap', 'speculationrules', 'text/template', 'text/x-template', 'text/plain', 'text/html'])

function unescapeHtml(v) {
  return v.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

function escHtml(v) {
  return String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function compile(services, kind) {
  const out = []
  for (const s of services) for (const re of (s.match && s.match[kind]) || []) out.push([kind === 'inline' ? re : new RegExp(re, 'i'), s])
  return out
}

// A needle can belong to several services (gtag( is shared by Google
// Analytics and Google Ads): the first enabled service wins, otherwise the
// first one listed. Each tag is rewritten once and marked data-cc-done.
function pick(rules, test) {
  const hits = rules.filter(([re]) => test(re))
  return hits.find(([, s]) => s.enabled) || hits[0] || null
}

function rewrite(s, url) {
  return s.enabled && s.rewrite ? url.replace(new RegExp(s.rewrite.from, 'i'), s.rewrite.to) : url
}

// Frame hosts (csp.frame) of the active services. The CSP opens these hosts
// completely, so an iframe there that misses the service's patterns must not
// stay raw: it becomes a placeholder without a load button.
function frameHostService(services, url) {
  const host = /^https?:\/\//i.test(url) ? hostOf(url) : ''
  if (!host) return null
  for (const s of services) {
    if (!s.enabled) continue
    if (cspHosts((s.csp && s.csp.frame) || []).some((p) => hostMatches(host, p))) return s
  }
  return null
}

// Tag patterns are bounded like the scanner's (at most 4000 attribute items,
// quoted values up to 16000 characters), so broken html cannot make a
// publish run for minutes. A tag outside these bounds is not parsed but made
// inert (fail closed): a leading src="about:blank" (iframe) or
// type="text/plain" (script) wins, because the first occurrence of an
// attribute counts.
const IFRAME_TAG = /<iframe\b(?:((?:"[^"]{0,16000}"|'[^']{0,16000}'|[^>"']){0,4000})>(?:[^<]*<\/iframe>)?)?/gi
const SCRIPT_OPEN = /<script\b(?:((?:"[^"]{0,16000}"|'[^']{0,16000}'|[^>"']){0,4000})>)?/gi
const UNPARSED_IFRAME = ' src="about:blank" data-cc-unparsed'
const UNPARSED_SCRIPT = ' type="text/plain" data-cc-unparsed'

export function transform(html, services) {
  const found = []
  const iframeRules = compile(services, 'iframe')
  const scriptRules = compile(services, 'script')
  const inlineRules = compile(services, 'inline')

  html = html.replace(IFRAME_TAG, (whole, attrStr, offset, str) => {
    if (attrStr === undefined) return str.startsWith(UNPARSED_IFRAME, offset + 7) ? whole : '<iframe' + UNPARSED_IFRAME
    const a = {}
    for (const [k, v] of Object.entries(parseAttrs(attrStr))) a[k] = unescapeHtml(v)
    const src = normUrl(a.src || '')
    const hit = pick(iframeRules, (re) => re.test(src))
    const s = hit ? hit[1] : frameHostService(services, src)
    if (!s) return whole
    // a frame-host iframe without pattern match can never be loaded
    found.push({ service: s.id, kind: 'iframe', url: src, enabled: s.enabled, ...(hit ? {} : { frameHost: true }) })
    const w = parseInt(a.width, 10)
    const h = parseInt(a.height, 10)
    const ratio = w > 0 && h > 0 ? `aspect-ratio:${w}/${h};` : ''
    const style = (a.style ? a.style.replace(/;?\s*$/, ';') : '') + ratio
    return `<div class="cc-embed${a.class ? ' ' + escHtml(a.class) : ''}" data-cc-embed data-cc-done data-service="${escHtml(s.id)}"` +
      ` data-state="${hit && s.enabled ? 'blocked' : 'disabled'}" data-src="${escHtml(hit ? rewrite(s, src) : src)}"` +
      (a.title ? ` data-title="${escHtml(a.title)}"` : '') +
      (a.allow ? ` data-allow="${escHtml(a.allow)}"` : '') +
      ('allowfullscreen' in a ? ' data-allowfullscreen' : '') +
      (a.width ? ` data-width="${escHtml(a.width)}"` : '') +
      (a.height ? ` data-height="${escHtml(a.height)}"` : '') +
      (style ? ` style="${escHtml(style)}"` : '') +
      ('hidden' in a ? ' hidden' : '') + '></div>'
  })

  function scriptTag(whole, attrStr, body) {
    const a = parseAttrs(attrStr)
    if ('data-cc-done' in a) return whole
    const type = (a.type || '').split(';')[0].trim().toLowerCase()
    if (SKIP_TYPES.has(type)) return whole
    let hit = null
    let kind = 'script'
    if (a.src) hit = pick(scriptRules, (re) => re.test(normUrl(unescapeHtml(a.src))))
    else { hit = pick(inlineRules, (needle) => body.includes(needle)); kind = 'inline' }
    if (!hit) return whole
    const s = hit[1]
    found.push({ service: s.id, kind, url: a.src ? normUrl(unescapeHtml(a.src)) : '', enabled: s.enabled })
    const rest = parseAttrList(attrStr).filter(([k]) => k !== 'type')
      .map(([k, v]) => ' ' + k + (v === null ? '' : `="${escHtml(unescapeHtml(v))}"`)).join('')
    const category = s.enabled ? s.category : 'cc-disabled'
    return `<script type="text/plain" data-category="${category}" data-service="${escHtml(s.id)}" data-cc-done${rest}>${body}</script>`
  }

  // Scripts: bounded opening tag, body up to the next </script>, searched
  // linearly (without one, no later script can be closed either).
  const close = /<\/script>/gi
  SCRIPT_OPEN.lastIndex = 0
  let out = ''
  let pos = 0
  let m
  while ((m = SCRIPT_OPEN.exec(html))) {
    const attrStr = m[1]
    if (attrStr === undefined) {
      if (!html.startsWith(UNPARSED_SCRIPT, m.index + 7)) { out += html.slice(pos, m.index) + '<script' + UNPARSED_SCRIPT; pos = SCRIPT_OPEN.lastIndex }
      continue
    }
    close.lastIndex = SCRIPT_OPEN.lastIndex
    const c = close.exec(html)
    if (!c) break
    const body = html.slice(SCRIPT_OPEN.lastIndex, c.index)
    out += html.slice(pos, m.index) + scriptTag(html.slice(m.index, close.lastIndex), attrStr, body)
    pos = close.lastIndex
    SCRIPT_OPEN.lastIndex = close.lastIndex
  }
  html = out + html.slice(pos)

  return { html, found }
}
