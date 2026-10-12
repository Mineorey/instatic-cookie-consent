import { hostMatches } from './hosts.js'

// Recognition hints for services outside the catalog. Advice only, not legal advice.
export const HINTS = [
  // Stand: 2026-10-12, Quelle: LG München I, Urteil v. 20.01.2022, 3 O 17493/20 (IP-Weitergabe an Google ohne Einwilligung rechtswidrig),
  // https://www.gesetze-bayern.de/Content/Document/Y-300-Z-GRURRS-B-2022-N-612
  { id: 'google-fonts', name: 'Google Fonts', hosts: ['fonts.googleapis.com', 'fonts.gstatic.com'], inline: [],
    advice: { de: 'Schriften lokal hosten – dann entfällt die Übermittlung an Google.', en: 'Host the fonts locally so no data is sent to Google.' } },
  // Stand: 2026-10-12, Quelle: keine spezifische Entscheidung; analoge Anwendung von LG München I 3 O 17493/20 (Drittserver erhält die IP), allgemeine Empfehlung.
  { id: 'adobe-fonts', name: 'Adobe Fonts', hosts: ['use.typekit.net', 'p.typekit.net'], inline: [],
    advice: { de: 'Schriften lokal hosten oder nur mit Einwilligung laden.', en: 'Host the fonts locally or load them only with consent.' } },
  // Stand: 2026-10-12, Quelle: allgemeine Empfehlung, keine konkrete Aufsichtsquelle verifiziert. Google stuft _GRECAPTCHA als notwendig ein
  // (https://developers.google.com/recaptcha/docs/faq), daher "Einwilligung empfohlen" statt "nötig". Hosts laut Google: www.google.com/recaptcha/,
  // www.gstatic.com/recaptcha/, recaptcha.google.com/recaptcha/; die Einbindung über google.com wird über den Inline-Treffer `grecaptcha` erkannt.
  { id: 'recaptcha', name: 'Google reCAPTCHA', hosts: ['www.recaptcha.net', 'recaptcha.google.com'], inline: ['grecaptcha'],
    advice: { de: 'Einwilligung empfohlen – als eigenen Dienst eintragen.', en: 'Consent recommended – add it as a custom service.' } },
  // Stand: 2026-10-12, Quelle: § 25 Abs. 1 TDDDG, EuGH C-673/17 "Planet49" (01.10.2019). Hotjars eigene Cookie-Seite war nicht abrufbar (HTTP 403);
  // die Cookie-Namen stammen aus Drittquellen und stehen hier nicht.
  { id: 'hotjar', name: 'Hotjar', hosts: ['*.hotjar.com', '*.hotjar.io'], inline: ['_hjSettings'],
    advice: { de: 'Einwilligung nötig (Statistik) – als eigenen Dienst eintragen.', en: 'Requires consent (statistics) – add it as a custom service.' } },
  // Stand: 2026-10-12, Quelle: https://learn.microsoft.com/en-us/clarity/setup-and-installation/consent-mode (ab 2025-10-31 erzwingt Clarity das Einwilligungssignal für EWR, UK, CH).
  { id: 'clarity', name: 'Microsoft Clarity', hosts: ['www.clarity.ms', '*.clarity.ms'], inline: ['clarity.ms/tag'],
    advice: { de: 'Einwilligung nötig (Statistik) – als eigenen Dienst eintragen.', en: 'Requires consent (statistics) – add it as a custom service.' } },
  // Stand: 2026-10-12, Quelle: https://www.cloudflare.com/web-analytics/ (keine Cookies, kein localStorage). Ob § 25 TDDDG greift, ist offen: allgemeine Einschätzung.
  { id: 'cloudflare-insights', name: 'Cloudflare Web Analytics', hosts: ['static.cloudflareinsights.com', 'cloudflareinsights.com'], inline: [],
    advice: { de: 'Ohne Cookies; ob eine Einwilligung nötig ist, ist umstritten – prüfen.', en: 'Cookieless; whether consent is needed is disputed – review.' } },
  // Stand: 2026-10-12, Quelle: allgemeine Empfehlung; analog LG München I 3 O 17493/20 (IP-Übermittlung an Dritte).
  { id: 'public-cdn', name: 'Öffentliches CDN', hosts: ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'unpkg.com', 'code.jquery.com'], inline: [],
    advice: { de: 'Dateien lokal hosten empfohlen (IP-Übermittlung an das CDN).', en: 'Hosting the files locally is recommended (IP address goes to the CDN).' } },
  // Stand: 2026-10-12, Quelle: allgemeine Empfehlung, keine spezifische Quelle (IP und E-Mail-Hash gehen an Automattic).
  { id: 'gravatar', name: 'Gravatar', hosts: ['*.gravatar.com'], inline: [],
    advice: { de: 'Bilder lokal ersetzen oder nur mit Einwilligung laden.', en: 'Replace the images locally or load them only with consent.' } },
  // Stand: 2026-10-12, Quelle: EuGH, Urt. v. 29.07.2019, C-40/17 "Fashion ID" (gemeinsame Verantwortung bei Social-Plugins), § 25 TDDDG.
  { id: 'instagram', name: 'Instagram', hosts: ['*.instagram.com', '*.cdninstagram.com'], inline: ['instgrm'],
    advice: { de: 'Einwilligung nötig – als eigenen Dienst eintragen.', en: 'Requires consent – add it as a custom service.' } },
  // Stand: 2026-10-12, Quelle: EuGH C-40/17 "Fashion ID" wie bei Instagram, § 25 TDDDG. syndication.twitter.com: Hosts der Embeds, beobachtet.
  { id: 'x-twitter', name: 'X (Twitter)', hosts: ['platform.twitter.com', 'syndication.twitter.com', '*.twimg.com', 'x.com', 'twitter.com'], inline: ['twttr'],
    advice: { de: 'Einwilligung nötig – als eigenen Dienst eintragen.', en: 'Requires consent – add it as a custom service.' } },
  // Stand: 2026-10-12, Quelle: allgemeine Empfehlung, keine spezifische Quelle (Embed lädt Drittinhalte und setzt Cookies).
  { id: 'spotify', name: 'Spotify', hosts: ['open.spotify.com'], inline: [],
    advice: { de: 'Einwilligung nötig – als eigenen Dienst eintragen.', en: 'Requires consent – add it as a custom service.' } },
  // Stand: 2026-10-12, Quelle: allgemeine Empfehlung, keine spezifische Quelle (IP geht an die Kachelserver der OSMF).
  { id: 'openstreetmap', name: 'OpenStreetMap', hosts: ['*.tile.openstreetmap.org', 'tile.openstreetmap.org', 'www.openstreetmap.org'], inline: [],
    advice: { de: 'Einwilligung empfohlen (IP-Übermittlung an die Kartenserver).', en: 'Consent recommended (IP address goes to the tile servers).' } },
  // Stand: 2026-10-12, Quelle: allgemeine Empfehlung, keine spezifische Quelle.
  { id: 'calendly', name: 'Calendly', hosts: ['assets.calendly.com', 'calendly.com'], inline: [],
    advice: { de: 'Einwilligung nötig – als eigenen Dienst eintragen.', en: 'Requires consent – add it as a custom service.' } },
]

export function hintForHost(host) {
  if (!host) return null
  return HINTS.find((h) => h.hosts.some((p) => hostMatches(host, p))) || null
}

export function hintForInline(body) {
  const b = String(body || '')
  return HINTS.find((h) => h.inline.some((n) => b.includes(n))) || null
}
