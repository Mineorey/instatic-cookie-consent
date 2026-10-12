# Cookie Consent for Instatic

A free, MIT-licensed **cookie banner and consent manager** for the [Instatic CMS](https://github.com/corebunch/instatic) (plugin id `instatic.consent`). It blocks YouTube, Vimeo, Google Maps, Google Analytics, Google Ads, Google Tag Manager, Meta Pixel, LinkedIn, TikTok and Matomo until visitors consent.

**Deutsch:** Cookie-Banner / Cookie-Hinweis und Consent-Management für Instatic – DSGVO- und TDDDG-orientiert, blockiert Fremddienste bis zur Einwilligung, mit Platzhaltern für Videos und Karten, Scanner und Prüfmodus. Texte auf Deutsch (Sie oder Du) und Englisch.

Made by [FilmOrbit](https://filmorbit.de).

The banner and settings dialog are built on [CookieConsent](https://github.com/orestbida/cookieconsent) by Orest Bida (vendored, v3.1.0). The plugin adds a service catalog, blocking of third-party embeds and scripts at publish time, placeholders for blocked content, a Content-Security-Policy extension and an archive of banner configurations.

## What it does

- Shows a consent banner with three equally weighted first-layer buttons: accept all, reject all, settings. By default the first layer is short: it names every active service in a short phrase that includes its purpose (for example "Google Analytics zur Reichweitenmessung"), the providers, third-country transfers and whether providers also use the data for their own purposes, and ends with a "Mehr erfahren" / "Learn more" link to the settings. The detailed text (service, provider and purpose spelled out) is available as an option. The banner takes keyboard focus when it opens. Without any active service no banner is shown.
- Offers a second layer with the categories necessary, media, statistics and marketing, listing every active service with provider, purpose, cookies and third-country transfers.
- When a page is published, rewrites known third-party iframes and scripts so they do not load before consent, and shows a placeholder box instead ("load content" / "always allow <service>").
- Loads analytics and marketing tags (loaders for the catalog services that need one) only after the matching category was accepted.
- Extends Instatic's Content-Security-Policy for the activated services.
- Archives every distinct banner configuration with a revision number.
- The banner is available in German (formal or informal) and English.
- Scans every published page for third-party hosts and lists them in the admin ("Consent scan"); an optional check mode in the browser shows what a page view actually loaded and stored.

## Requirements

- Instatic with plugin `apiVersion` 1. Tested with Instatic as of October 2026.
- Node.js 22 or newer to build and test the package.

Source, issues and releases: https://github.com/Mineorey/instatic-cookie-consent

## Installation

1. Build the package with `npm run build`. This creates `dist/instatic.consent-1.2.4.zip`.
2. In the Instatic admin, open the plugins area and upload the zip.
3. Approve the requested permissions: `frontend.assets` (banner scripts and styles), `cms.hooks` (page processing on publish), `cms.storage` (version archive and scan list), `cms.routes` (version archive route) and `admin.navigation` (the admin pages "Consent scan" and "Consent versions").
4. Open the plugin settings, enable the services you use and fill in their parameters.
5. Publish the whole site (full publish). Settings take effect only after re-publishing, and the consent revision is computed per page: a partial publish leaves pages with different revisions, which makes the banner reappear for visitors moving between them.

## Settings

| Field | Type | Description |
| --- | --- | --- |
| `enabled` | toggle | Show the banner. When off, services stay blocked and nothing loads. |
| `language` | select | `auto` (page language), `de` or `en`. |
| `formality` | select | German form of address: `sie` or `du`. |
| `privacyUrl` | text | Link to the privacy policy, for example `/privacy`. |
| `imprintUrl` | text | Link to the legal notice, for example `/imprint`. |
| `layout` | select | `wide` (default: centered, buttons beside the text on large screens, stacked on phones), `box` (compact box) or `bar` (full-width bar). |
| `textStyle` | select | `short` (default) or `detailed` (the longer text of version 1.0). The text is part of the banner configuration: switching to `short` (also by updating from 1.0 with default settings) creates a new revision and asks visitors again; `detailed` keeps the 1.0 configuration. |
| `showIcon` | toggle | Show a small decorative cookie graphic before the banner title (default on). |
| `title`, `description` | text, textarea | Custom German banner title and text; they override both text styles. Placeholders in the text: `{services}` (each service with provider and purpose), `{servicesShort}` (short phrases, e.g. "Videos von YouTube und Karten von Google Maps"), `{providers}` (short provider names), `{countries}`, `{profiling}`, `{more}` (the "Mehr erfahren" link to the settings). Empty means default text. |
| `titleEn`, `descriptionEn` | text, textarea | Custom English title and text, same placeholders. |
| `svc_<id>` | toggle | Activate a catalog service. |
| `svc_<id>_<param>` | text | Parameter of a catalog service (see below). |
| `customServices` | textarea | Additional services as JSON (see below). |
| `validityMonths` | number | How long a decision is kept, 1 to 13 months (default 12). |
| `forceRenew` | number | Increase to ask all visitors again. |
| `accentColor`, `textColor`, `backgroundColor` | color | Banner colors. |
| `radius` | text | Corner radius, for example `12px`. |
| `scanEnabled` | toggle | Scan pages when publishing (default on). |
| `scanBrowser` | toggle | Allow the check mode `#cc-scan` (default off). Switch it on only during setup and acceptance testing, then off again: while on, any visitor can open the overlay. |
| `scanOwnHosts` | textarea | Your own hosts, one per line, for example `cdn.example.com` or `*.example.com`. Invalid lines are written to the plugin log. |
| `scanAllowHosts` | textarea | Third-party hosts you have reviewed and that need no consent, one per line (same syntax). |
| `scanReset` | number | Increase to clear the scan list. |

The setting labels in the admin are currently in German.

## Service catalog

| Id | Service | Category | Parameters |
| --- | --- | --- | --- |
| `youtube` | YouTube (rewritten to the no-cookie domain) | media | none |
| `vimeo` | Vimeo | media | none |
| `google-maps` | Google Maps | media | none |
| `ga4` | Google Analytics | statistics | `measurementId` (`G-...`) |
| `matomo` | Matomo (self-hosted) | statistics | `url` (`https://.../`), `siteId` |
| `meta-pixel` | Meta Pixel | marketing | `pixelId` |
| `linkedin` | LinkedIn Insight Tag | marketing | `partnerId` |
| `tiktok` | TikTok Pixel | marketing | `pixelId` |
| `google-ads` | Google Ads Conversion | marketing | `conversionId` (`AW-...`) |
| `gtm` | Google Tag Manager | marketing | `containerId` (`GTM-...`) |

Parameters are validated against a pattern. A service with a missing or invalid parameter is reported as an error and not activated.

## Custom services

Paste a JSON array into `customServices`. Each entry needs an `id` (lowercase letters, digits, hyphens), a `label`, a `category` (`media`, `statistics` or `marketing`), a `provider` with `name` and an `https` `privacyUrl`, matchers in `match` and, optionally, `csp` hosts. For the short banner text, `short` (`de`/`en`) is the phrase used for the service and `provider.short` the provider name (a string or `{ "de": ..., "en": ... }`); without them the `label` and `provider.name` are used. `provider.name` and `provider.address` can also be `{ "de": ..., "en": ... }`. `thirdCountries` takes ISO 3166 country codes (`US`, `CN`, `PH`, ...), shown with the country name in the visitor's language; other values are shown as given.

```json
[
  {
    "id": "maps-example",
    "label": "Example Maps",
    "category": "media",
    "provider": {
      "name": "Example Provider Ltd.",
      "short": "Example",
      "address": "1 Example Street, Example City",
      "privacyUrl": "https://maps.example.com/privacy"
    },
    "purpose": { "de": "Anzeige von Karten", "en": "Displaying maps" },
    "short": { "de": "Karten von Example Maps", "en": "maps from Example Maps" },
    "thirdCountries": [],
    "profiling": false,
    "cookies": [],
    "match": { "iframe": ["^https://maps\\.example\\.com/"] },
    "csp": { "frame": ["https://maps.example.com"] }
  }
]
```

`match` accepts `iframe` and `script` (regular expressions as strings) and `inline` (plain substrings). Invalid entries are reported and skipped; the others keep working.

## Opening the settings

Visitors must be able to change their decision at any time. Add a link whose target ends in `#cookie-settings` or `#cookie-einstellungen`:

```html
<a href="#cookie-settings">Cookie settings</a>
```

A direct link with one of these fragments (for example `/contact#cookie-settings`) opens the settings when the page loads.

From script: `window.InstaticConsent.showPreferences()`.

Without any active service there is nothing to configure: the link then does nothing and a note is written to the browser console.

## Browsers that block cookie notices

Some browsers and blocklists (for example Brave with "Block cookie consent notices") stop the banner library from loading. The plugin respects that choice: it does not rename or hide the library to get around the blocker, and no banner is shown. The protection does not depend on the banner. Third-party content stays blocked, and each placeholder still offers "Load content" for a single load. If a visitor opens the settings anyway (footer link `#cookie-settings` / `#cookie-einstellungen`, a direct link, or `InstaticConsent.showPreferences()`), a small notice explains that the dialog is unavailable instead of doing nothing. It closes with its button or Escape, and after 12 seconds.

## How blocking works

**At publish time.** The plugin processes the rendered HTML. Iframes and scripts matching **any catalog service** are neutralized, whether the service is activated or not: iframes become a placeholder box (source kept in a data attribute), scripts and matching inline scripts become `type="text/plain"`. Services that are not activated get a placeholder without a load button, and their scripts never run. An iframe on the frame host of an activated service (`csp.frame`, for example `www.youtube.com` or `www.google.com`) that does not match the service's patterns also gets a placeholder without a load button: the CSP opens the whole host for the service, so such an iframe must never load (for example a YouTube playlist URL `/embed?listType=…` or reCAPTCHA on `www.google.com` while Google Maps is active). Authored tags of services that have a loader (analytics, marketing) stay in the page as inert `text/plain` scripts; the plugin's own loader runs in the browser after consent.

**In the browser.** `consent.js` runs before page scripts. It restores a blocked element only when the visitor has accepted the matching category or clicked the button in the placeholder. "Load content" allows exactly that service and URL on that element; if a script later sets another source, it is checked again. The same frame-host rule applies at runtime. The runtime guard covers **iframes** inserted or changed by scripts (`src` setter, `setAttribute`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, plus a MutationObserver). Scripts added by other scripts after load are not rewritten; they are stopped by the Content-Security-Policy, which lists only the hosts of activated services.

**Version archive failures.** If the version archive cannot be read or written during publishing, pages are processed normally with the last known revision (0 if none is known yet): the banner works and embeds can be loaded after consent. The configuration is then missing from the archive; the plugin log says so. Publish again once storage works.

**Safe mode.** Blocking fails closed. If a page cannot be processed at all (configuration or transformation fails), the plugin publishes it without consent configuration, marks it with `data-cc-error` and renames the `src` of every iframe with an absolute URL to `data-cc-src`, so it cannot load. `consent.js` then runs in safe mode: no banner, no loaders, nothing can be loaded, and every cross-origin iframe (also those inserted later by scripts) becomes a placeholder. Check the plugin log and publish again once the cause is fixed.

### Limitations

- Iframes inserted via `createContextualFragment`, `document.write`, `<template>` or `DOMParser` plus `appendChild`, `ShadowRoot.innerHTML`, `srcdoc` documents, and `<object>`/`<embed>` elements are caught only by a MutationObserver. A request can escape before the placeholder appears.
- JS-inserted plain `http://` embed URLs are not loaded (https only).
- Iframe and script tags with an attribute value longer than 16000 characters or more than 4000 attribute tokens are not parsed at publish time; they are made inert instead (an iframe gets a leading `src="about:blank"`, a script `type="text/plain"`, marked `data-cc-unparsed`), so they never load.
- The CSP extension rewrites Instatic's CSP meta tag because there is no official API. Re-test it after every Instatic update.
- Settings take effect only after re-publishing. Always run a full publish after changing settings (the revision is computed per page).
- If GA4 is activated **and** the page also contains an authored GA4 tag, GA4 is loaded twice after consent (authored tag plus loader). Remove authored tags of activated loader services. Authored inline snippets are blocked by the page CSP (`script-src 'self'`) anyway.
- Safe mode after the server fallback (page could not be processed): only iframes are neutralized server-side; scripts are not, they are stopped by the page CSP. Iframes with relative sources are left untouched; same-origin iframes written with an absolute URL stay empty. Pages without consent configuration, for example Instatic's editor preview (which does not run publish filters), also run in safe mode, so embeds show a blocked placeholder there.
- Provider data (names, addresses, cookies, third countries, CSP hosts) can go out of date. Every entry in `server/lib/catalog.js` and `server/lib/hints.js` carries a `Stand/Quelle` comment with the date and sources of its last check; verify the data again before you rely on it.
- The CSP hosts of the Google services are limited to what the loaders need. Google Analytics is loaded with Google Signals and ad personalisation switched off (`allow_google_signals: false`, `allow_ad_personalization_signals: false`), so the advertising hosts (`*.google.com`, `*.g.doubleclick.net`, `pagead2.googlesyndication.com`) are not opened. Google Ads conversion tracking only opens the hosts of the `.com` domain; other country domains (for example `www.google.de`) and further Google hosts need a custom service with the extra CSP hosts.
- The stored decision contains no per-user identifier: the library's `consentId` is replaced by a constant and removed.

## Scanner

### Publish scan

When a page is published, the plugin looks at its HTML and records every third-party host it finds (iframes, scripts, stylesheets, images and other embedded resources, plus recognized inline snippets). The result is the admin page **Consent scan**, one row per host with its status, the types found, the pages it appears on, when it was first seen and when the row last changed ("Last changed") and, for unknown iframe or script hosts, a suggested custom service (JSON you can paste into `customServices`). The scan only reads; it never changes blocking or publishing, and an error in the scan or its storage does not affect publishing. Scan settings are not part of the consent fingerprint, so changing them neither creates a new revision nor shows the banner again. Admin pages: **Consent scan** and **Consent versions**.

| Status | Meaning |
| --- | --- |
| `covered` | Matches a pattern of an activated catalog or custom service (iframe, script or inline snippet); it is blocked until consent. |
| `blocked` | Matches a pattern of a service that is not activated, or is an iframe on an activated service's frame host that misses its patterns; it never loads. |
| `unblocked` | The host belongs to a service (it is listed in the service's CSP hosts), but this resource is not matched by any pattern, so the plugin does not block it (for example a static map image from `maps.google.com`, or an image on a self-hosted Matomo host). Review it like `unknown`. |
| `allowed` | Listed in `scanAllowHosts`: reviewed, no consent needed. |
| `own` | Listed in `scanOwnHosts`: your own host. |
| `unknown` | Not covered by anything. Review it: add a service, or list it as allowed or own. |

The **Types** column lists the kinds found for a host, as English ids: `iframe`, `script`, `style`, `font`, `image`, `media`, `preconnect`, `form`, `other`, `inline` and `deferred`. `deferred` is an absolute URL (`https://…` or `//…`) in any `data-…` attribute, for example `<button data-yt="https://www.youtube.com/embed/ID">`: sites often build embeds from such attributes with their own JavaScript. Only the runtime guard can stop those, and it handles iframes only, so a `deferred` URL is `covered`/`blocked` when it matches a service's iframe pattern (or is on an activated service's frame host), and `unblocked` when it only matches a script pattern or a service host. Requests made by external scripts themselves (for example API calls) are not in the HTML; use the check mode for those.

The first row of the list, **Zusammenfassung**, is a summary rather than a host: `Pages` shows how many pages were scanned and how many third-party hosts were found (for example `30 Seiten geprüft · 2 fremde Server im HTML`; own hosts and inline snippets are not counted), `Status` is `ok` or `error`, `Hint` the last error of the current publish run (`Speicher nicht erreichbar: …` when the plugin storage failed, `Scan übersprungen (Zeitbudget)` when a page that had not been scanned before was skipped because of the time budget), `Last changed` when the summary was last written. A publish run ends when no page was published for a minute; the next run starts without the error. The summary is replaced (new row, old row deleted) whenever its numbers or the error change, so it stays on top of the list, otherwise at most every 10 minutes. After a restart of the plugin the page count is derived from the stored page lists and is approximate (pages without third-party resources, and pages hidden behind `+N weitere`, are not counted until they are published again). An empty host list with a summary row means the scan ran and found nothing.

Order: a pattern match (`covered`/`blocked`) comes first, then `own`, `allowed`, `unblocked` and `unknown`. A host found several times gets the worst status: `unknown` > `unblocked` > `blocked` > `covered` > `allowed` > `own`. Statuses only get worse while the services and host lists stay the same; after changing them, publish the whole site (the first scan of a host then sets its status anew), or increase `scanReset` for a clean list.

For hosts that belong to no catalog or custom service the scan adds a recognition hint with advice when it knows the service: Google Fonts, Adobe Fonts, Google reCAPTCHA, Hotjar, Microsoft Clarity, Cloudflare Web Analytics, public CDNs (cdnjs, jsDelivr, unpkg, jQuery), Gravatar, Instagram, X (Twitter), Spotify, OpenStreetMap and Calendly. The hints are advice, not legal advice. Google reCAPTCHA on `www.google.com` or `www.gstatic.com` is recognized by its inline `grecaptcha` code; while Google Maps is active, its iframe on `www.google.com` is blocked as a frame-host iframe (status `blocked`), and other reCAPTCHA resources on Google hosts are listed as `unblocked`.

Host patterns in `scanOwnHosts` and `scanAllowHosts` are one per line: an exact host (`cdn.example.com`) or a subdomain wildcard (`*.example.com`, which also matches `example.com`). Wildcards on public suffixes and shared hosting domains (for example `*.co.uk`, `*.github.io`, `*.amazonaws.com`) are rejected. `scanReset` clears the list: increase the number, then publish again.

Limits:

- The publish scan sees the HTML of the publish step only. Dynamic holes and loop fragments rendered at request time, and content inserted by scripts (also scripts that load later), are visible only in the check mode; only URLs that scripts read from `data-…` attributes are listed (kind `deferred`).
- Third-party cookies set inside iframes cannot be read by the check mode.
- The list only grows: Instatic's page name (slug) is not unique per page (data-row entry templates share one, previews feed the list too), so a render never removes a host or a page. Deleted pages and removed embeds stay listed until the list is reset (`scanReset`).
- The pages column shows at most 10 pages (in sort order), then `+N weitere`, because the admin list stretches every cell of a row to the tallest one. The plugin keeps the full list in memory; after a restart only the 10 stored pages and N are known, and N is approximate (a page that sorts after the tenth stored one is assumed to be one of the hidden pages). Rows written by 1.2.0 with up to 50 pages are shortened once when they are next written.
- Attribute values over 16000 characters and tags with more than 4000 attribute tokens are skipped.
- A host's kinds and pages accumulate over all pages; the status is the worst one found (see above).
- The scan never delays publishing beyond the host's limit: it runs after the page is processed, is skipped when the page took more than 1.5 s already, and writes at most 25 storage operations per page (none after 2.5 s). The rest is written during the next pages, so the list can lag behind by a few pages, and after `scanReset` old rows disappear gradually.

### Check mode

Open any page of the live site with `#cc-scan` appended, for example `https://www.example.com/#cc-scan`, or call `InstaticConsent.scan()` in the browser console. An overlay lists the hosts this page view contacted, the cookies, localStorage and sessionStorage entries, and what the guard blocked. Nothing leaves the browser; the overlay only reads. It is off by default: switch on `scanBrowser` for setup and acceptance testing and off again afterwards. Test with a fresh browser profile and click through the banner to see the state before and after consent. The overlay script is only loaded when it is served from the same origin as the page; if your plugin assets come from another origin, the check mode stays unavailable and a note is written to the browser console.

Traffic light rules:

- Red (violation): a host of a catalog or custom service loaded although its service was not accepted; a service host that loaded before the decision in the same page view; a service's cookie or storage entry present although its service was not accepted (service storage without consent is a violation); an unknown host when the visitor has not decided or has accepted nothing, or when it loaded before the decision in the same page view (it stays red after consent).
- Yellow (to check): an unknown host after consent was given, and storage entries that belong to no known service. Also a cookie set by a parent domain: on `preview.example.com`, cookies of `example.com` (for example `_fbp` from the main site's Meta Pixel) are visible to the page but were not set by it. Where the browser offers the Cookie Store API (Chromium-based browsers such as Chrome and Edge), a cookie that would be a violation keeps its owner but is listed as "to check" with the note „von übergeordneter Domain (example.com) gesetzt – nicht von dieser Seite“ / "set by the parent domain (example.com) – not by this site". This only happens when the cookie's service contacted none of its hosts in this page view and the guard blocked nothing of it; otherwise it stays a violation. `www.example.com` and `example.com` count as the same site, and a cookie that is OK (accepted service) stays OK. Other browsers do not tell the cookie's domain, so the usual rules apply there.
- Green (OK): accepted services (loaded after the decision), content the visitor loaded once with "Inhalt laden" / "Load content", hosts in `scanOwnHosts` or `scanAllowHosts`, and the plugin's own decision cookie.

### Privacy

The scanner sends nothing anywhere. The publish scan stores its list in the plugin's own storage in your Instatic installation; the check mode runs in the visitor's browser tab, keeps nothing and makes no requests to third parties (it only loads its own script, `consent-scan.js`, from your site).

## Proof of consent

Each time the banner configuration changes (services, texts, links, validity), the plugin stores a new revision in its version archive. The **Consent versions** admin page lists revision, date, a short summary and the fingerprint; the summary reads like `YouTube an · Text kurz · Du · 12 Monate · Layout breit` (active services or `keine Dienste aktiv`, text style, form of address, validity, layout). The full configuration snapshot (JSON) is stored per revision in the separate resource `version-snapshots`, which has no admin page.

- `GET /admin/api/cms/plugins/instatic.consent/runtime/versions` lists all revisions (without snapshots).
- `GET /admin/api/cms/plugins/instatic.consent/runtime/versions/snapshot?revision=N` returns `{ revision, fingerprint, createdAt, summary, snapshot }` for one revision (404 if unknown). Instatic matches plugin routes by exact path, so the revision is a query parameter.

Both need the `plugins.read` capability. Revisions stored by versions before 1.2.1 kept the snapshot in the version row; they are migrated when the list is next loaded (on the first publish after the plugin starts or after a configuration change, and via the list route): the snapshot moves to `version-snapshots` and the summary starts with `(ältere Version)` plus what the snapshot tells (active services, validity, layout). Migration errors are logged and never stop publishing. Because the visitor's decision carries no personal identifier, the archive documents which banner version was live at which time, not what an individual visitor chose.

The archive records can be edited and deleted through Instatic's resource UI like any other plugin resource, so they are not tamper-proof. Export them regularly (for example via the route above) and keep the export as proof.

## Legal notice

Not legal advice. The texts are templates. Check the result with your data protection officer before going live.

## Development

```
npm test               # unit tests
npm run test:browser   # builds, then runs browser tests (Microsoft Edge) incl. axe-core accessibility checks
npm run build          # creates dist/instatic.consent-1.2.4.zip
```

## Credits

[CookieConsent](https://github.com/orestbida/cookieconsent) by Orest Bida, MIT license. axe-core (Deque) is used for testing only.

## License

MIT, see `LICENSE`.
