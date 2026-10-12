const META = /<meta\s+http-equiv=["']Content-Security-Policy["']\s+content="([^"]*)"\s*\/?>/i

export function mergeCsp(html, additions) {
  const wanted = Object.entries(additions).filter(([, hosts]) => hosts && hosts.length)
  if (!wanted.length) return { html, ok: true }
  const m = html.match(META)
  if (!m) return { html, ok: false }
  const dirs = new Map()
  for (const part of m[1].split(';')) {
    const tokens = part.trim().split(/\s+/).filter(Boolean)
    if (tokens.length) dirs.set(tokens[0].toLowerCase(), tokens.slice(1))
  }
  const fallback = dirs.get('default-src') || ["'self'"]
  for (const [name, hosts] of wanted) {
    let values = dirs.has(name) ? dirs.get(name) : [...fallback]
    values = values.filter((v) => v !== "'none'")
    for (const h of hosts) if (!values.includes(h)) values.push(h)
    dirs.set(name, values)
  }
  const content = [...dirs].map(([k, v]) => [k, ...v].join(' ')).join('; ') + ';'
  return { html: html.replace(m[0], () => `<meta http-equiv="Content-Security-Policy" content="${content}">`), ok: true }
}
