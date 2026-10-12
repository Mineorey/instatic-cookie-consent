// Host helpers shared by the scanner and the browser check mode config.
const HOST_RE = /^(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+$/
// Public suffixes and shared hosting domains: "*.<suffix>" would match
// every site below it, so such wildcards are rejected.
const HOST_SHARED_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au', 'co.nz', 'co.jp', 'com.br', 'com.tr', 'co.za', 'com.cn',
  'github.io', 'gitlab.io', 'amazonaws.com', 'cloudfront.net', 'herokuapp.com', 'netlify.app', 'vercel.app', 'azurewebsites.net',
  'blogspot.com', 'web.app', 'firebaseapp.com', 'pages.dev', 'workers.dev', 'appspot.com', 'wordpress.com', 'wixsite.com', 'squarespace.com',
])

export function hostOf(url) {
  const t = String(url == null ? '' : url).trim()
  const m = /^(?:https?:)?\/\/([^/?#\s]+)/i.exec(t)
  if (!m) return ''
  return m[1].replace(/^[^@]*@/, '').replace(/:\d+$/, '').toLowerCase()
}

export function parseHostList(raw) {
  const hosts = []
  const invalid = []
  for (const line of String(raw == null ? '' : raw).split(/\r?\n/)) {
    const t = line.trim()
    if (!t) continue
    const h = t.replace(/^[a-z]+:\/\//i, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').toLowerCase()
    const shared = h.startsWith('*.') && HOST_SHARED_SUFFIXES.has(h.slice(2))
    if (HOST_RE.test(h) && !shared) { if (!hosts.includes(h)) hosts.push(h) } else invalid.push(t)
  }
  return { hosts, invalid }
}

export function hostMatches(host, pattern) {
  const h = String(host).toLowerCase()
  const p = String(pattern).toLowerCase()
  if (p.startsWith('*.')) { const base = p.slice(2); return h === base || h.endsWith('.' + base) }
  return h === p
}

export function cspHosts(list) {
  return (list || []).map((x) => String(x).replace(/^https?:\/\//i, '').replace(/:\d+$/, '').toLowerCase())
}
