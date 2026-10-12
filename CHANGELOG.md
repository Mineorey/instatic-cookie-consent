# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.2.4] - 2026-10-12

### Changed
- No separate plugin homepage in the manifest; the author link points to the maker and the source link to the repository.

## [1.2.3] - 2026-10-12

### Added
- Marketplace metadata: plugin name "Cookie Consent", author FilmOrbit with link, homepage, repository, keywords and a cookie icon.
- The check mode shows the configured category titles of the current language.
- Browser tests read the browser channel from `CC_BROWSER_CHANNEL` (default `msedge`).
- `CONTRIBUTING.md`, this changelog and a GitHub Actions workflow for the tests.

### Changed
- Provider data in the catalog and the recognition hints was verified against the providers' own documentation on 2026-10-12; every entry carries a `Stand/Quelle` comment that names what was checked and what could only be observed.
- Vimeo: current address (10th floor, EU representative), canonical privacy URL, player cookies (`player`, `_cfuvid`, `cf_clearance`, `player_clearance`).
- TikTok: third countries from TikTok's transferee list (no DPF), cookies `_tt_enable_cookie`, `ttcsid_*`, `ttclid`, CSP host `analytics-ipv6.tiktokw.us`.
- Meta Pixel: cookie `_fbc`, host `www.instagram.com` for `/tr/`; the DPF status ("Active – Re-certification under Review") is noted.
- LinkedIn: address as in the imprint, cookies `li_fat_id` and `li_gc`.
- Google Analytics 4, Google Ads and Tag Manager: CSP hosts following Google's CSP guide, limited to what the loaders need (`https://analytics.google.com` without subdomain for GA4; the Ads, `googletagmanager.com` and `pagead2.googlesyndication.com` hosts for Ads). Only the Tag Manager entry opens `frame-src` for `www.googletagmanager.com`, so its iframe is attributed to it; Google Ads cookies `_gcl_aw`, `ar_debug` and purpose "and, where applicable, remarketing".
- Matomo: more documented cookies (`_pk_ref.*`, `_pk_cvar.*`, `_pk_testcookie.*`).
- reCAPTCHA hint: "consent recommended" instead of "required" (Google classes `_GRECAPTCHA` as necessary); hosts include `recaptcha.google.com`. X hint also matches `syndication.twitter.com`.
- A changed provider, cookie or purpose list changes the consent fingerprint of sites that use the service, so those visitors are asked again. YouTube is unchanged.
- The scan list is read in a stable order (`host`, then `lastSeen`) while paging.
- `package.json` declares `engines.node >= 22`; CI tests Node.js 22 and 24.
- Third countries are stored as ISO 3166 codes and named in the visitor's language (banner text, settings dialog, placeholders), with articles where German needs them ("die USA", "die Philippinen"). Custom services may still pass plain names; they are shown as given. The consent fingerprint of existing sites does not change because of this.
- `provider.name` and `provider.address` may be `{ de, en }`; the catalog has English addresses, Matomo's operator text and the TikTok joint controller in both languages.
- Google Analytics is loaded with Google Signals and ad personalisation switched off, so its CSP no longer opens the advertising hosts (`*.google.com`, `*.g.doubleclick.net`, `pagead2.googlesyndication.com`).

### Fixed
- Tag Manager iframes are no longer attributed to GA4 or Google Ads.
- Matomo (self-hosted) no longer links to the vendor's privacy policy, which excludes foreign installations. A service without `provider.privacyUrl` links to the site's own `privacyUrl` in the settings dialog.

### Security
- The fail-safe iframe handling is bounded like the scanner and the transform; an over-long iframe tag is made inert (`src="about:blank" data-cc-unparsed`) instead of being scanned without limit.
- The check mode script is only injected when it comes from the page's own origin.

## [1.2.2] - 2026-10-12

### Added
- A notice when the cookie settings cannot be opened.

### Fixed
- The summary row is recreated after every new host row.
- The summary row counts third-party hosts, avoids `created_at` ties and false skips.
- Script URLs in data attributes (deferred findings) are not judged by the frame-host rule.
- The parent-domain cookie rule only softens real violations of inactive services.

## [1.2.1] - 2026-10-09

### Added
- A summary row on top of the scan list.
- Readable versions list with a summary; snapshots live in their own resource.
- URLs in data attributes are scanned as deferred findings.
- Legacy Google Maps embeds can be loaded with consent.

### Changed
- The pages cell of the scan list shows at most 10 slugs.

### Fixed
- Check mode marks cookies of a parent domain as "to check".

## [1.2.0] - 2026-10-08

### Added
- Publish-time page scanner: lists third-party hosts per page in the admin ("Consent scan"), with recognition hints and suggested custom services.
- Scan settings (own hosts, allowed hosts, reset) and host helpers that reject wildcards on public suffixes and shared hosting.
- Check mode `#cc-scan`: an overlay of the third-party servers, storage entries and blocked loads of a page view. `consent.js` records blocked attempts for it. It is off by default.

### Fixed
- Scan rows are add-only and keep the worst status of a host.
- Scan runs are published within a time and storage budget.
- Scanner and transform parsing is bounded against pathological HTML (at most 4000 attribute items, quoted values up to 16000 characters; first attribute wins).
- Guard blocks frame-host iframes that miss the service patterns.
- The consent moment is taken from a real decision, not from every page load.
- Check mode keeps pre-consent loads red, accepts one-time loads and uses a larger resource timing buffer.

## [1.1.0] - 2026-10-08

### Added
- Wide banner layout with a cookie icon and a "learn more" link.
- Short first-layer banner text with service and provider short names.
- Per-language provider short names.

## [1.0.2] - 2026-10-08

### Fixed
- Placeholders keep clicks to themselves like iframes.

## [1.0.1] - 2026-10-08

### Fixed
- Hidden iframes stay hidden as placeholders.
- The YouTube storage list comes from measurement.

## [1.0.0] - 2026-10-08

### Added
- Service catalog with ten provider templates, consent-gated loaders for analytics and marketing services.
- Publish-time blocking of known iframes and scripts, merged service hosts in the page CSP, injected client config.
- Browser guard, placeholders and consent banner (vendored CookieConsent 3.1.0).
- Version archive, server entry and build script that packs the installable zip.
- Accessibility tests and documentation.

### Fixed
- Fail closed when publishing fails; browser safe mode; banner focus; URL-bound "load once".
- Storage failure no longer triggers safe mode.
- Hardened custom services, CSP hosts, URL settings and real-world markup.
