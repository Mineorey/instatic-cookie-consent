import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

// The forbidden terms live outside the package, in a `forbidden-terms.txt`
// in a sibling folder of the package (one case-insensitive regular expression
// per line; the folder is found by looking, so its name is not spelled here
// either). Without that file (e.g. in a public clone) the check is skipped.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const PARENT = join(ROOT, '..')
const TERMS = readdirSync(PARENT).map((n) => join(PARENT, n, 'forbidden-terms.txt')).find((p) => existsSync(p))
const SKIP = new Set(['node_modules', 'dist', '.git'])
const TEXT = new Set(['.js', '.mjs', '.json', '.md', '.css', '.html', '.txt'])

function* files(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* files(p)
    else if (TEXT.has(extname(name).toLowerCase())) yield p
  }
}

const terms = TERMS
  ? readFileSync(TERMS, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => new RegExp(l, 'i'))
  : null

test('package contains no client-specific references', { skip: terms ? false : 'no forbidden-terms.txt in a sibling folder of the package' }, () => {
  assert.ok(terms.length > 0, 'forbidden-terms.txt is empty')
  const hits = []
  for (const f of files(ROOT)) {
    const text = readFileSync(f, 'utf8')
    for (const re of terms) if (re.test(text)) hits.push(`${f}: ${re}`)
  }
  assert.deepEqual(hits, [])
})
