# Contributing

## Setup

Node.js 22 or newer. Then:

```
npm ci
```

## Tests

Unit tests (no browser needed, run everywhere):

```
npm test
```

Browser tests build the package first and drive a real browser with
Playwright. The default is Microsoft Edge, which is preinstalled on Windows and
available for macOS and Linux:

```
npm run test:browser
```

To use another browser, set `CC_BROWSER_CHANNEL` to a Playwright channel
(`chrome`, `chrome-beta`, `msedge`, ...) that is installed on your machine.

```
# macOS / Linux
CC_BROWSER_CHANNEL=chrome npm run test:browser
# Windows (PowerShell)
$env:CC_BROWSER_CHANNEL = 'chrome'; npm run test:browser
```

## Building the package

```
npm run build
```

This writes `dist/plugin.json`, the bundled `dist/server/index.js` and the
installable zip `dist/instatic.consent-<version>.zip`.

## Coding rules

- No external requests, ever: no CDNs, fonts, analytics or update checks. The
  plugin is about avoiding exactly those.
- `server/lib/*.js` is concatenated into one file by `scripts/build.mjs` (see
  its `ORDER` list), so every top-level name in `server/lib` must be unique
  across all files. A new file goes into that list.
- Server code runs in a sandbox: no Node built-ins, no `require`, no `import`
  of anything but the sibling files.
- HTML parsing regexes must be bounded (see `transform.js` and `scan.js`) so
  malformed pages cannot make them slow.
- Every change needs a test. Keep the tests free of names of real sites or
  customers (`test/unit/no-client-refs.test.mjs` enforces this; the test is skipped
  when the private terms file it reads is not present, so it only runs in the
  maintainer's checkout).
- Use Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, ...) and
  update the changelog.
