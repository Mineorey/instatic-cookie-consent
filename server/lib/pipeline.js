import { transform } from './transform.js'
import { mergeCsp } from './csp.js'
import { injectConfig, injectLoaders } from './inject.js'

export function processPage(html, cfg, revision) {
  const t = transform(html, cfg.services)
  let out = injectLoaders(t.html, cfg.loaders)
  out = injectConfig(out, { ...cfg.client, revision })
  const c = mergeCsp(out, cfg.csp)
  return { html: c.html, found: t.found, cspOk: c.ok }
}

// Marks the page so consent.js runs in safe mode (no banner, every
// cross-origin iframe blocked).
export function markError(html) {
  return html.replace(/<html\b(?![^>]*\sdata-cc-error)/i, () => '<html data-cc-error')
}

// Last resort when the page could not be processed: no config is injected
// (safe mode in the browser) and every iframe with an absolute or
// protocol-relative source has `src` renamed to `data-cc-src`, so it cannot
// start loading before consent.js runs.
// Bounded like the scanner and transform (at most 4000 attribute items,
// quoted values up to 16000 characters), so broken html cannot make it slow.
// A tag that does not fit is made inert instead (fail closed): a leading
// src="about:blank" wins over any later src (first attribute wins).
const FAILSAFE_IFRAME = /<iframe\b(?:((?:"[^"]{0,16000}"|'[^']{0,16000}'|[^>"']){0,4000})>)?/gi
const UNPARSED = ' src="about:blank" data-cc-unparsed'

export function failSafe(html) {
  const out = html.replace(FAILSAFE_IFRAME, (whole, attrs, offset, str) => {
    if (attrs === undefined) return str.startsWith(UNPARSED, offset + 7) ? whole : '<iframe' + UNPARSED
    return '<iframe' + attrs.replace(/([^\s=/>]+)(\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)/g, (m, name, eq, value) => {
      const v = value.replace(/^["']|["']$/g, '').trim()
      return name.toLowerCase() === 'src' && /^(https?:)?\/\//i.test(v) ? 'data-cc-src' + eq + value : m
    }) + '>'
  })
  return markError(out)
}
