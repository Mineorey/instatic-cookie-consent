import http from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const { buildConfig } = await import(pathToFileURL(join(ROOT, 'server/lib/config.js')).href)
const { processPage, failSafe } = await import(pathToFileURL(join(ROOT, 'server/lib/pipeline.js')).href)

const BASE = '/uploads/plugins/instatic.consent/1.0.0/'
const ASSETS = `<link rel="stylesheet" href="${BASE}frontend/cookieconsent.css"><link rel="stylesheet" href="${BASE}frontend/consent.css"><script src="${BASE}frontend/consent.js"></script><script src="${BASE}frontend/cookieconsent.umd.js" defer></script>`
const TYPES = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8' }

// settings + revision can be swapped by tests between page loads
export const state = { settings: { enabled: true, svc_youtube: true, privacyUrl: '/datenschutz', imprintUrl: '/impressum' }, revision: 1 }

export function start(port) {
  const srv = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0])
    // safe.html: the page could not be processed (server fallback)
    if (url === '/safe.html') {
      const raw = readFileSync(join(ROOT, 'test/fixtures/page.html'), 'utf8').replace('<!--ASSETS-->', ASSETS)
      res.writeHead(200, { 'content-type': TYPES['.html'] })
      return res.end(failSafe(raw))
    }
    // frames.html: iframes on service frame hosts that miss the patterns
    if (url === '/frames.html') {
      const raw = readFileSync(join(ROOT, 'test/fixtures/frames.html'), 'utf8').replace('<!--ASSETS-->', ASSETS)
      res.writeHead(200, { 'content-type': TYPES['.html'] })
      return res.end(processPage(raw, buildConfig(state.settings, { assetBase: BASE }), state.revision).html)
    }
    if (url === '/' || url.endsWith('.html') || url === '/datenschutz' || url === '/impressum') {
      const raw = readFileSync(join(ROOT, 'test/fixtures/page.html'), 'utf8').replace('<!--ASSETS-->', ASSETS)
      const cfg = buildConfig(state.settings, { assetBase: BASE })
      res.writeHead(200, { 'content-type': TYPES['.html'] })
      return res.end(processPage(raw, cfg, state.revision).html)
    }
    let file = null
    if (url.startsWith(BASE)) file = join(ROOT, url.slice(BASE.length))
    else if (url.startsWith('/fixtures/')) file = join(ROOT, 'test', url)
    else if (url.startsWith('/vendor/axe.min.js')) file = join(ROOT, 'node_modules/axe-core/axe.min.js')
    if (!file || !existsSync(file)) { res.writeHead(404); return res.end() }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' })
    res.end(readFileSync(file))
  })
  return new Promise((r) => srv.listen(port, () => r(srv)))
}
