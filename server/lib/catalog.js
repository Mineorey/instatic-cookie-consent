// Service templates. Regular expressions are strings so the list can be
// shipped to the browser as JSON. Provider data must be checked against the
// providers' current documentation before each release.
// thirdCountries are ISO 3166 alpha-2 codes; i18n.js has the names per language.
// provider.name and provider.address are strings or { de, en }.
// An empty provider.privacyUrl means "the site operator's own policy": the
// browser then falls back to the configured privacyUrl (see matomo).
// Inline entries are plain substrings; iframe/script entries are regex strings.
// `short` is the noun phrase for the short first-layer text, provider.short
// the provider name used there (fallbacks: label, provider.name).

export const CATEGORIES = ['necessary', 'media', 'statistics', 'marketing']

const GOOGLE = {
  name: 'Google Ireland Limited', short: 'Google',
  address: { de: 'Gordon House, Barrow Street, Dublin 4, Irland', en: 'Gordon House, Barrow Street, Dublin 4, Ireland' },
  privacyUrl: 'https://policies.google.com/privacy',
}

export const CATALOG = [
  // Stand: 2026-10-12, Quelle: https://policies.google.com/privacy?hl=en (Name, Anschrift, Datenschutz-URL bestätigt),
  // https://policies.google.com/privacy/frameworks?hl=en und DPF-Liste (Google LLC aktiv; Drittland USA),
  // https://policies.google.com/technologies/cookies?hl=en (YSC, VISITOR_INFO1_LIVE, __Secure-YNID, __Secure-ROLLOUT_TOKEN dokumentiert).
  // VISITOR_PRIVACY_METADATA, localStorage und IndexedDB sind von Google nicht dokumentiert, nur beobachtet.
  // Speicher gemessen 2026-10-08 in Edge vor der Wiedergabe: youtube-nocookie.com setzt keine Cookies,
  // aber localStorage und IndexedDB; das youtube.com-Embed setzt die fünf Cookies auf .youtube.com.
  {
    id: 'youtube', label: 'YouTube', category: 'media', provider: GOOGLE,
    short: { de: 'Videos von YouTube', en: 'videos from YouTube' },
    purpose: { de: 'Anzeige eingebetteter Videos', en: 'Displaying embedded videos' },
    thirdCountries: ['US'], profiling: true,
    cookies: ['YSC', 'VISITOR_INFO1_LIVE', 'VISITOR_PRIVACY_METADATA', '__Secure-YNID', '__Secure-ROLLOUT_TOKEN', 'localStorage: yt-*, ytidb::*', 'IndexedDB: YtIdbMeta, LogsDatabaseV2'],
    csp: { frame: ['https://www.youtube-nocookie.com', 'https://www.youtube.com'] },
    match: { iframe: ['^https?://(www\\.)?youtube(-nocookie)?\\.com/embed/'] },
    rewrite: { from: '^https?://(www\\.)?youtube\\.com/embed/', to: 'https://www.youtube-nocookie.com/embed/' },
    params: [], loader: null,
  },
  // Stand: 2026-10-12, Quelle: https://vimeo.com/legal/privacy/policy (Policy vom 2026-10-07: Name, Anschrift 10th Floor,
  // EU-Vertreter Bending Spoons S.p.A.; DPF und SCCs), DPF-Liste (Vimeo.com, Inc. aktiv),
  // https://help.vimeo.com/hc/en-us/articles/26080940921361-Vimeo-Player-Cookies (vuid, player, _cfuvid, cf_clearance, player_clearance),
  // https://developers.cloudflare.com/fundamentals/reference/policies-compliances/cloudflare-cookies/ (__cf_bm; Vimeo schreibt "_cf_bm").
  {
    id: 'vimeo', label: 'Vimeo', category: 'media',
    short: { de: 'Videos von Vimeo', en: 'videos from Vimeo' },
    provider: { name: 'Vimeo.com, Inc.', short: 'Vimeo', address: { de: '330 West 34th Street, 10th Floor, New York, NY 10001, USA (EU-Vertreter: Bending Spoons S.p.A., Via Nino Bonnet 10, 20154 Mailand, Italien)', en: '330 West 34th Street, 10th Floor, New York, NY 10001, USA (EU representative: Bending Spoons S.p.A., Via Nino Bonnet 10, 20154 Milan, Italy)' }, privacyUrl: 'https://vimeo.com/legal/privacy/policy' },
    purpose: { de: 'Anzeige eingebetteter Videos', en: 'Displaying embedded videos' },
    thirdCountries: ['US'], profiling: true, cookies: ['vuid', 'player', '__cf_bm', '_cfuvid', 'cf_clearance', 'player_clearance'],
    csp: { frame: ['https://player.vimeo.com'] },
    match: { iframe: ['^https?://player\\.vimeo\\.com/video/'] },
    params: [], loader: null,
  },
  // Stand: 2026-10-12, Quelle: https://policies.google.com/privacy?hl=en (Name, Anschrift), DPF-Liste (Google LLC aktiv),
  // https://policies.google.com/technologies/cookies?hl=en und https://business.safety.google/adscookies/ (NID, AEC).
  // NID und AEC sind von Google als allgemeine Google-Cookies dokumentiert; die Zuordnung zum Maps-Embed ist beobachtet, nicht dokumentiert.
  {
    id: 'google-maps', label: 'Google Maps', category: 'media', provider: GOOGLE,
    short: { de: 'Karten von Google Maps', en: 'maps from Google Maps' },
    purpose: { de: 'Anzeige eingebetteter Karten', en: 'Displaying embedded maps' },
    thirdCountries: ['US'], profiling: true, cookies: ['NID', 'AEC'],
    csp: { frame: ['https://www.google.com', 'https://maps.google.com'] },
    match: { iframe: ['^https?://(www\\.)?google\\.[a-z.]+/maps/embed', '^https?://maps\\.google\\.[a-z.]+/', '^https?://(www\\.)?google\\.[a-z.]+/maps\\?.*output=embed'] },
    params: [], loader: null,
  },
  // Stand: 2026-10-12, Quelle: https://policies.google.com/privacy?hl=en (Name, Anschrift), DPF-Liste (Google LLC aktiv),
  // https://support.google.com/analytics/answer/11397207?hl=en (_ga, _ga_<container-id>),
  // https://analytics.google.com ohne Subdomain: im gtag.js beobachtet (/g/collect); *.analytics.google.com deckt die Apex-Domain nicht ab.
  // Bewusst nicht enthalten: die Hosts für Google Signals und Werbefunktionen (*.google.com, *.g.doubleclick.net, pagead2.googlesyndication.com)
  // aus https://developers.google.com/tag-platform/security/guides/csp; ga4.js schaltet diese Funktionen ab (allow_google_signals: false).
  // Auch kein frame-src: der googletagmanager.com-Frame gehört zum Tag Manager.
  {
    id: 'ga4', label: 'Google Analytics', category: 'statistics', provider: GOOGLE,
    short: { de: 'Google Analytics zur Reichweitenmessung', en: 'Google Analytics for audience measurement' },
    purpose: { de: 'Statistische Auswertung der Websitenutzung', en: 'Statistical analysis of website usage' },
    thirdCountries: ['US'], profiling: true, cookies: ['_ga', '_ga_*'],
    csp: {
      script: ['https://www.googletagmanager.com'],
      connect: ['https://*.google-analytics.com', 'https://analytics.google.com', 'https://*.analytics.google.com', 'https://*.googletagmanager.com'],
      img: ['https://*.google-analytics.com', 'https://*.googletagmanager.com'],
    },
    match: { script: ['^https?://www\\.googletagmanager\\.com/gtag/js\\?id=G-'], inline: ['gtag('] },
    params: [{ id: 'measurementId', label: 'Mess-ID (G-…)', pattern: '^G-[A-Z0-9]+$' }],
    loader: 'ga4.js',
  },
  // Stand: 2026-10-12, Quelle: https://matomo.org/privacy-policy/ (gilt nur für matomo.org, schließt fremde Installationen aus; deshalb
  // kein Datenschutz-Link des Herstellers: privacyUrl bleibt leer, der Browser nimmt die Datenschutzerklärung der Website),
  // https://matomo.org/faq/general/faq_146/ (_pk_id, _pk_ses, _pk_ref, _pk_cvar, _pk_testcookie dokumentiert).
  // Anbieter ist der Betreiber der eigenen Installation; Drittland-Angaben hängen vom Hosting ab (leer bei Hosting im EWR).
  {
    id: 'matomo', label: 'Matomo', category: 'statistics',
    short: { de: 'Matomo zur Reichweitenmessung', en: 'Matomo for audience measurement' },
    provider: { name: { de: 'Betreiber dieser Website (eigene Matomo-Installation)', en: 'Operator of this website (own Matomo installation)' }, short: { de: 'uns', en: 'us' }, address: { de: 'siehe Impressum', en: 'see legal notice' }, privacyUrl: '' },
    purpose: { de: 'Statistische Auswertung der Websitenutzung', en: 'Statistical analysis of website usage' },
    thirdCountries: [], profiling: false, cookies: ['_pk_id.*', '_pk_ses.*', '_pk_ref.*', '_pk_cvar.*', '_pk_testcookie.*'],
    csp: {}, match: { inline: ['_paq'] }, cspFromParam: 'url',
    params: [
      { id: 'url', label: 'Matomo-URL (https://…/)', pattern: '^https://[^\\s"<>]+/$' },
      { id: 'siteId', label: 'Site-ID', pattern: '^[0-9]+$' },
    ],
    loader: 'matomo.js',
  },
  // Stand: 2026-10-12, Quelle: https://www.facebook.com/privacy/policy/ (Policy Effective 2026-07-23: Meta Platforms Ireland Limited, Merrion Road, Dublin 4, D04 X2K5),
  // https://www.facebook.com/privacy/policies/cookies/?subpage=subpage.4-AdvertisingRecommendationsInsightsAndMeasurement und
  // https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/fbp-and-fbc (_fbp, _fbc, fr),
  // https://developers.facebook.com/docs/meta-pixel/get-started (connect.facebook.net, www.facebook.com/tr).
  // DPF-Status am 2026-10-12: "Active – Re-certification under Review" (Meta Platforms, Inc., nur Non-HR, keine UK-Extension); vor jedem Release erneut prüfen.
  // https://www.instagram.com/tr/ steht in fbevents.js (beobachtet, nicht dokumentiert).
  {
    id: 'meta-pixel', label: 'Meta Pixel', category: 'marketing',
    short: { de: 'das Meta-Pixel zur Werbemessung', en: 'the Meta Pixel for ad measurement' },
    provider: { name: 'Meta Platforms Ireland Limited', short: 'Meta', address: { de: 'Merrion Road, Dublin 4, D04 X2K5, Irland', en: 'Merrion Road, Dublin 4, D04 X2K5, Ireland' }, privacyUrl: 'https://www.facebook.com/privacy/policy/' },
    purpose: { de: 'Messung und Optimierung von Werbekampagnen', en: 'Measuring and optimising advertising campaigns' },
    thirdCountries: ['US'], profiling: true, cookies: ['_fbp', '_fbc', 'fr'],
    csp: {
      script: ['https://connect.facebook.net'],
      connect: ['https://www.facebook.com', 'https://connect.facebook.net', 'https://www.instagram.com'],
      img: ['https://www.facebook.com', 'https://www.instagram.com'],
    },
    match: { script: ['^https?://connect\\.facebook\\.net/'], inline: ['fbq('] },
    params: [{ id: 'pixelId', label: 'Pixel-ID', pattern: '^[0-9]{6,20}$' }],
    loader: 'meta-pixel.js',
  },
  // Stand: 2026-10-12, Quelle: https://www.linkedin.com/legal/privacy-policy (Effective 2025-11-03: LinkedIn Ireland Unlimited Company),
  // https://www.linkedin.com/legal/impressum (Anschrift: Wilton Place, Dublin 2), DPF-Liste (LinkedIn Corporation aktiv),
  // https://www.linkedin.com/legal/l/cookie-table (Stand 2026-08-26: li_fat_id, li_sugr, bcookie, lidc, UserMatchHistory, AnalyticsSyncHistory, li_gc).
  // Nicht verifizierbar: eine offizielle LinkedIn-CSP-Hostliste (Hosts aus dem Tag-Code beobachtet: snap.licdn.com, px.ads.linkedin.com)
  // und ob sich LinkedIn Ireland ausdrücklich auf DPF oder SCCs stützt (Regionalhinweis nicht abrufbar, HTTP 400).
  {
    id: 'linkedin', label: 'LinkedIn Insight Tag', category: 'marketing',
    short: { de: 'das LinkedIn Insight Tag zur Werbemessung', en: 'the LinkedIn Insight Tag for ad measurement' },
    provider: { name: 'LinkedIn Ireland Unlimited Company', short: 'LinkedIn', address: { de: 'Wilton Place, Dublin 2, Irland', en: 'Wilton Place, Dublin 2, Ireland' }, privacyUrl: 'https://www.linkedin.com/legal/privacy-policy' },
    purpose: { de: 'Messung und Optimierung von Werbekampagnen', en: 'Measuring and optimising advertising campaigns' },
    thirdCountries: ['US'], profiling: true, cookies: ['li_fat_id', 'li_sugr', 'li_gc', 'bcookie', 'lidc', 'UserMatchHistory', 'AnalyticsSyncHistory'],
    csp: { script: ['https://snap.licdn.com'], connect: ['https://px.ads.linkedin.com'], img: ['https://px.ads.linkedin.com'] },
    match: { script: ['^https?://snap\\.licdn\\.com/'], inline: ['_linkedin_partner_id'] },
    params: [{ id: 'partnerId', label: 'Partner-ID', pattern: '^[0-9]{3,12}$' }],
    loader: 'linkedin.js',
  },
  // Stand: 2026-10-12, Quelle: https://www.tiktok.com/legal/page/eea/privacy-policy/en (Stand 2025-11-30: TikTok Technology Limited, gemeinsam
  // verantwortlich mit TikTok Information Technologies UK Limited), https://www.tiktok.com/legal/page/eea/transferee-countries/en (Drittländer),
  // DPF-Liste (TikTok/ByteDance nicht gelistet, kein DPF), https://ads.tiktok.com/help/article/using-cookies-with-tiktok-pixel (_ttp, ttcsid, ttclid).
  // _tt_enable_cookie ist nicht dokumentiert, nur im Pixel-Code beobachtet; analytics-ipv6.tiktokw.us ebenfalls aus dem Pixel-Code (beobachtet).
  // Drittländer ohne das Vereinigte Königreich (Angemessenheitsbeschluss), als ISO-Codes.
  {
    id: 'tiktok', label: 'TikTok Pixel', category: 'marketing',
    short: { de: 'das TikTok-Pixel zur Werbemessung', en: 'the TikTok Pixel for ad measurement' },
    provider: { name: { de: 'TikTok Technology Limited (gemeinsam verantwortlich mit TikTok Information Technologies UK Limited)', en: 'TikTok Technology Limited (jointly responsible with TikTok Information Technologies UK Limited)' }, short: 'TikTok', address: { de: '10 Earlsfort Terrace, Dublin, D02 T380, Irland', en: '10 Earlsfort Terrace, Dublin, D02 T380, Ireland' }, privacyUrl: 'https://www.tiktok.com/legal/page/eea/privacy-policy/de' },
    purpose: { de: 'Messung und Optimierung von Werbekampagnen', en: 'Measuring and optimising advertising campaigns' },
    thirdCountries: ['US', 'MY', 'SG', 'CA', 'IL', 'JP', 'KR', 'AU', 'BR', 'CN', 'PH'], profiling: true, cookies: ['_ttp', '_tt_enable_cookie', 'ttcsid', 'ttcsid_*', 'ttclid'],
    csp: { script: ['https://analytics.tiktok.com'], connect: ['https://analytics.tiktok.com', 'https://analytics-ipv6.tiktokw.us'], img: ['https://analytics.tiktok.com'] },
    match: { script: ['^https?://analytics\\.tiktok\\.com/'], inline: ['ttq.'] },
    params: [{ id: 'pixelId', label: 'Pixel-ID', pattern: '^[A-Z0-9]{10,30}$' }],
    loader: 'tiktok.js',
  },
  // Stand: 2026-10-12, Quelle: https://policies.google.com/privacy?hl=en (Name, Anschrift), DPF-Liste (Google LLC aktiv),
  // https://business.safety.google/adscookies/ und https://policies.google.com/technologies/cookies?hl=en (_gcl_au, _gcl_aw, IDE, test_cookie, ar_debug),
  // https://developers.google.com/tag-platform/security/guides/csp (CSP-Hosts Conversion/Remarketing). Bewusst nicht enthalten: script-src www.google.com,
  // www.google.<TLD> je Länderendung (weitere Hosts brauchen einen eigenen Dienst) und frame-src www.googletagmanager.com (gehört zum Tag Manager).
  // td.doubleclick.net steht nicht in Googles Liste, ist aber für das Remarketing-iframe beobachtet und bleibt deshalb.
  {
    id: 'google-ads', label: 'Google Ads Conversion', category: 'marketing', provider: GOOGLE,
    short: { de: 'Google Ads zur Werbemessung', en: 'Google Ads for ad measurement' },
    purpose: { de: 'Messung von Werbeerfolgen (Conversions) und ggf. Remarketing', en: 'Measuring advertising conversions and, where applicable, remarketing' },
    thirdCountries: ['US'], profiling: true, cookies: ['_gcl_au', '_gcl_aw', 'IDE', 'test_cookie', 'ar_debug'],
    csp: {
      script: ['https://www.googletagmanager.com', 'https://www.googleadservices.com', 'https://googleads.g.doubleclick.net'],
      connect: ['https://www.google.com', 'https://googleads.g.doubleclick.net', 'https://www.googletagmanager.com', 'https://www.googleadservices.com', 'https://pagead2.googlesyndication.com', 'https://ad.doubleclick.net'],
      img: ['https://googleads.g.doubleclick.net', 'https://www.google.com', 'https://www.googletagmanager.com', 'https://www.googleadservices.com', 'https://pagead2.googlesyndication.com'],
      frame: ['https://td.doubleclick.net'],
    },
    match: { script: ['^https?://www\\.googletagmanager\\.com/gtag/js\\?id=AW-', '^https?://www\\.googleadservices\\.com/'], inline: ['gtag('] },
    params: [{ id: 'conversionId', label: 'Conversion-ID (AW-…)', pattern: '^AW-[0-9]+$' }],
    loader: 'google-ads.js',
  },
  // Stand: 2026-10-12, Quelle: https://policies.google.com/privacy?hl=en (Name, Anschrift), DPF-Liste (Google LLC aktiv),
  // https://developers.google.com/tag-platform/security/guides/csp (CSP-Hosts: www.googletagmanager.com, www.google.com).
  // Cookies: keine eigenen; die Aussage stammt aus einer Drittquelle (https://www.cookieyes.com/blog/google-tag-manager-cookies/),
  // Google bestätigt sie nicht ausdrücklich. Die geladenen Tags setzen ihre eigenen Cookies.
  {
    id: 'gtm', label: 'Google Tag Manager', category: 'marketing', provider: GOOGLE,
    short: { de: 'den Google Tag Manager', en: 'Google Tag Manager' },
    purpose: { de: 'Laden weiterer Analyse- und Marketing-Tags', en: 'Loading further analytics and marketing tags' },
    thirdCountries: ['US'], profiling: true, cookies: [],
    csp: {
      script: ['https://www.googletagmanager.com'],
      img: ['https://www.googletagmanager.com'],
      connect: ['https://*.google-analytics.com', 'https://*.googletagmanager.com', 'https://www.google.com'],
      frame: ['https://www.googletagmanager.com'],
    },
    match: { script: ['^https?://www\\.googletagmanager\\.com/gtm\\.js'], inline: ['googletagmanager.com/gtm.js'] },
    params: [{ id: 'containerId', label: 'Container-ID (GTM-…)', pattern: '^GTM-[A-Z0-9]+$' }],
    loader: 'gtm.js',
  },
]

export function getService(id) {
  return CATALOG.find((s) => s.id === id) || null
}
