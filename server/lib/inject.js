function escAttr(v) {
  return String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function kebab(s) { return s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()) }

export function injectConfig(html, client) {
  html = html.replace(/<script type="application\/json" id="cc-config">[\s\S]*?<\/script>/, () => '')
  const json = JSON.stringify(client).replace(/</g, '\\u003c')
  const tag = `<script type="application/json" id="cc-config">${json}</script>`
  const head = html.match(/<head\b[^>]*>/i)
  if (!head) return html
  // Directly after <meta charset> (which must stay within the first bytes),
  // but always before the first script; otherwise first in <head>.
  const start = head.index + head[0].length
  const end = html.toLowerCase().indexOf('</head>', start)
  const inHead = html.slice(start, end < 0 ? undefined : end)
  const charset = inHead.match(/<meta\b[^>]*\bcharset\s*=[^>]*>/i)
  const script = inHead.search(/<script\b/i)
  const at = charset && (script < 0 || charset.index < script) ? start + charset.index + charset[0].length : start
  return html.slice(0, at) + tag + html.slice(at)
}

// Loader tags are recognised on re-runs by their src under /frontend/services/.
export function injectLoaders(html, loaders) {
  html = html.replace(/<script type="text\/plain" data-category="[^"]*" data-service="[^"]*" data-cc-done src="[^"]*\/frontend\/services\/[^"]*"[^>]*><\/script>/g, () => '')
  const tags = loaders.map((l) =>
    `<script type="text/plain" data-category="${escAttr(l.category)}" data-service="${escAttr(l.id)}" data-cc-done src="${escAttr(l.src)}"` +
    Object.entries(l.params).map(([k, v]) => ` data-param-${kebab(k)}="${escAttr(v)}"`).join('') + '></script>').join('')
  if (!tags) return html
  const i = html.toLowerCase().lastIndexOf('</body>')
  return i < 0 ? html + tags : html.slice(0, i) + tags + html.slice(i)
}
