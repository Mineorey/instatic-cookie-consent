// Default texts. {services}, {servicesShort}, {providers}, {countries},
// {profiling}, {more}, {provider}, {service}, {label} and {purpose} are filled
// in at publish time or at runtime. Texts are templates, not legal advice.
//
// `short` holds the short first layer (textStyle "short") and the parts it
// is built from; buildConfig removes it from the texts sent to the browser.

const CATEGORY_TEXT_DE = {
  media: { title: 'Externe Medien', text: 'Inhalte von Video- und Kartenplattformen, die auf dieser Website eingebettet sind.' },
  statistics: { title: 'Statistik', text: 'Hilft zu verstehen, wie die Website genutzt wird.' },
  marketing: { title: 'Marketing', text: 'Messung und Optimierung von Werbung.' },
}

const SIE = {
  banner: {
    title: 'Datenschutz-Einstellungen',
    description: 'Wir möchten auf dieser Website folgende externe Dienste einsetzen: {services}. Dabei werden personenbezogene Daten wie Ihre IP-Adresse an die Anbieter übermittelt{countries}.{profiling} Sie entscheiden, ob Sie zustimmen. Ihre Auswahl können Sie jederzeit über „Cookie-Einstellungen“ ändern.',
    // one entry of {services}; entries are joined with '; '
    serviceItem: '{label} ({provider}; Zweck: {purpose})',
    acceptAll: 'Alle akzeptieren', rejectAll: 'Alle ablehnen', settings: 'Einstellungen',
    privacy: 'Datenschutzerklärung', imprint: 'Impressum',
  },
  intro: {
    countries: ', teilweise auch in Länder außerhalb der EU ({list})',
    profiling: ' Einige Anbieter nutzen die Daten auch für eigene Zwecke und können sie mit anderen Daten über Sie zusammenführen.',
  },
  prefs: {
    title: 'Cookie-Einstellungen',
    intro: 'Hier legen Sie fest, welche Dienste wir einsetzen dürfen. Ohne Ihre Zustimmung bleiben sie ausgeschaltet.',
    acceptAll: 'Alle akzeptieren', rejectAll: 'Alle ablehnen', save: 'Auswahl speichern', close: 'Schließen',
    serviceCounter: 'Dienst|Dienste',
    necessaryTitle: 'Notwendig',
    necessaryText: 'Speichert nur Ihre Auswahl in diesem Dialog. Dafür ist keine Einwilligung nötig.',
    provider: 'Anbieter', purpose: 'Zweck', countries: 'Übermittlung in Drittländer', cookies: 'Cookies und Speicher',
    privacyPolicy: 'Datenschutzerklärung des Anbieters', none: 'keine',
    moreTitle: 'Weitere Informationen', moreText: 'Details finden Sie in unserer {privacy}.',
    categories: CATEGORY_TEXT_DE,
  },
  embed: {
    text: 'Dieser Inhalt wird von {provider} bereitgestellt. Beim Laden werden Daten wie Ihre IP-Adresse an den Anbieter übermittelt{countries}.',
    countries: ', auch in Länder außerhalb der EU ({list})',
    load: 'Inhalt laden', always: '{service} immer erlauben',
    disabled: 'Dieser externe Inhalt ist auf dieser Website nicht freigegeben.',
    privacy: 'Datenschutzerklärung',
  },
  notice: {
    unavailable: 'Ihr Browser blockiert den Cookie-Dialog dieser Seite. Externe Inhalte wie Videos können Sie trotzdem einzeln über „Inhalt laden“ anzeigen.',
    noServices: 'Diese Seite setzt keine Dienste ein, für die eine Einwilligung nötig ist.',
    safeMode: 'Die Cookie-Einstellungen sind gerade nicht verfügbar. Externe Inhalte bleiben blockiert.',
    close: 'Schließen',
  },
}

const SHORT_SIE = {
  title: 'Kurz zu Cookies',
  description: 'Wir möchten auf dieser Seite {servicesShort} einbinden. Dabei werden Daten wie Ihre IP-Adresse an {providers} übermittelt{countries}.{profiling} Sie können Ihre Wahl jederzeit ändern. {more}',
  countries: ', auch in {list}',
  profiling: ' Die Anbieter nutzen die Daten teils auch für eigene Zwecke.',
  and: 'und',
  more: 'Mehr erfahren',
}
SIE.short = SHORT_SIE

const DU = {
  ...SIE,
  notice: {
    unavailable: 'Dein Browser blockiert den Cookie-Dialog dieser Seite. Externe Inhalte wie Videos kannst du trotzdem einzeln über „Inhalt laden“ anzeigen.',
    noServices: 'Diese Seite setzt keine Dienste ein, für die eine Einwilligung nötig ist.',
    safeMode: 'Die Cookie-Einstellungen sind gerade nicht verfügbar. Externe Inhalte bleiben blockiert.',
    close: 'Schließen',
  },
  banner: {
    ...SIE.banner,
    description: 'Wir möchten auf dieser Website folgende externe Dienste einsetzen: {services}. Dabei werden personenbezogene Daten wie deine IP-Adresse an die Anbieter übermittelt{countries}.{profiling} Du entscheidest, ob du zustimmst. Deine Auswahl kannst du jederzeit über „Cookie-Einstellungen“ ändern.',
  },
  intro: {
    ...SIE.intro,
    profiling: ' Einige Anbieter nutzen die Daten auch für eigene Zwecke und können sie mit anderen Daten über dich zusammenführen.',
  },
  prefs: {
    ...SIE.prefs,
    intro: 'Hier legst du fest, welche Dienste wir einsetzen dürfen. Ohne deine Zustimmung bleiben sie ausgeschaltet.',
    necessaryText: 'Speichert nur deine Auswahl in diesem Dialog. Dafür ist keine Einwilligung nötig.',
    moreText: 'Details findest du in unserer {privacy}.',
  },
  embed: {
    ...SIE.embed,
    text: 'Dieser Inhalt wird von {provider} bereitgestellt. Beim Laden werden Daten wie deine IP-Adresse an den Anbieter übermittelt{countries}.',
  },
  short: {
    ...SHORT_SIE,
    description: 'Wir möchten auf dieser Seite {servicesShort} einbinden. Dabei werden Daten wie deine IP-Adresse an {providers} übermittelt{countries}.{profiling} Du kannst deine Wahl jederzeit ändern. {more}',
  },
}

const EN = {
  banner: {
    title: 'Privacy settings',
    description: 'We would like to use the following external services on this website: {services}. This transfers personal data such as your IP address to the providers{countries}.{profiling} It is your choice whether to agree. You can change your selection at any time via “Cookie settings”.',
    serviceItem: '{label} ({provider}; purpose: {purpose})',
    acceptAll: 'Accept all', rejectAll: 'Reject all', settings: 'Settings',
    privacy: 'Privacy policy', imprint: 'Legal notice',
  },
  intro: {
    countries: ', partly to countries outside the EU ({list})',
    profiling: ' Some providers also use the data for their own purposes and may combine it with other data about you.',
  },
  prefs: {
    title: 'Cookie settings',
    intro: 'Choose which services we may use. Without your consent they stay switched off.',
    acceptAll: 'Accept all', rejectAll: 'Reject all', save: 'Save selection', close: 'Close',
    serviceCounter: 'service|services',
    necessaryTitle: 'Necessary',
    necessaryText: 'Only stores your choice in this dialog. No consent is required for this.',
    provider: 'Provider', purpose: 'Purpose', countries: 'Transfer to third countries', cookies: 'Cookies and storage',
    privacyPolicy: 'Provider privacy policy', none: 'none',
    moreTitle: 'More information', moreText: 'See our {privacy} for details.',
    categories: {
      media: { title: 'External media', text: 'Content from video and map platforms embedded on this website.' },
      statistics: { title: 'Statistics', text: 'Helps us understand how the website is used.' },
      marketing: { title: 'Marketing', text: 'Measuring and optimising advertising.' },
    },
  },
  embed: {
    text: 'This content is provided by {provider}. Loading it transfers data such as your IP address to the provider{countries}.',
    countries: ', including to countries outside the EU ({list})',
    load: 'Load content', always: 'Always allow {service}',
    disabled: 'This external content is not enabled on this website.',
    privacy: 'Privacy policy',
  },
  notice: {
    unavailable: 'Your browser blocks this site\'s cookie dialog. You can still show external content such as videos one at a time with "Load content".',
    noServices: 'This site uses no services that need consent.',
    safeMode: 'Cookie settings are currently unavailable. External content stays blocked.',
    close: 'Close',
  },
  short: {
    title: 'A quick word on cookies',
    description: 'We would like to embed {servicesShort} on this site. This sends data such as your IP address to {providers}{countries}.{profiling} You can change your choice at any time. {more}',
    countries: ', including to {list}',
    profiling: ' Some providers also use the data for their own purposes.',
    and: 'and',
    more: 'Learn more',
  },
}

// Third countries are stored as ISO 3166 alpha-2 codes. Per code: the plain
// name (lists) and the form after "in" with the article (running text:
// "auch in die USA", "including to the USA"). Unknown values are shown as given.
const COUNTRIES = {
  US: ['USA', 'die USA', 'USA', 'the USA'],
  GB: ['Vereinigtes Königreich', 'das Vereinigte Königreich', 'United Kingdom', 'the United Kingdom'],
  CH: ['Schweiz', 'die Schweiz', 'Switzerland', 'Switzerland'],
  CA: ['Kanada', 'Kanada', 'Canada', 'Canada'],
  MX: ['Mexiko', 'Mexiko', 'Mexico', 'Mexico'],
  BR: ['Brasilien', 'Brasilien', 'Brazil', 'Brazil'],
  AU: ['Australien', 'Australien', 'Australia', 'Australia'],
  NZ: ['Neuseeland', 'Neuseeland', 'New Zealand', 'New Zealand'],
  JP: ['Japan', 'Japan', 'Japan', 'Japan'],
  KR: ['Südkorea', 'Südkorea', 'South Korea', 'South Korea'],
  CN: ['China', 'China', 'China', 'China'],
  HK: ['Hongkong', 'Hongkong', 'Hong Kong', 'Hong Kong'],
  IN: ['Indien', 'Indien', 'India', 'India'],
  SG: ['Singapur', 'Singapur', 'Singapore', 'Singapore'],
  MY: ['Malaysia', 'Malaysia', 'Malaysia', 'Malaysia'],
  PH: ['Philippinen', 'die Philippinen', 'Philippines', 'the Philippines'],
  ID: ['Indonesien', 'Indonesien', 'Indonesia', 'Indonesia'],
  TH: ['Thailand', 'Thailand', 'Thailand', 'Thailand'],
  VN: ['Vietnam', 'Vietnam', 'Vietnam', 'Vietnam'],
  IL: ['Israel', 'Israel', 'Israel', 'Israel'],
  AE: ['Vereinigte Arabische Emirate', 'die Vereinigten Arabischen Emirate', 'United Arab Emirates', 'the United Arab Emirates'],
  TR: ['Türkei', 'die Türkei', 'Turkey', 'Turkey'],
  ZA: ['Südafrika', 'Südafrika', 'South Africa', 'South Africa'],
  RU: ['Russland', 'Russland', 'Russia', 'Russia'],
  UA: ['Ukraine', 'die Ukraine', 'Ukraine', 'Ukraine'],
}
// the name "USA" was the stored value before codes were introduced
const COUNTRY_ALIASES = { USA: 'US' }

// style: 'plain' (lists) or 'in' (running text after "in"/"to"); lang: 'de' or 'en'
export function countryLabel(value, lang, style) {
  const v = String(value)
  const key = Object.prototype.hasOwnProperty.call(COUNTRY_ALIASES, v) ? COUNTRY_ALIASES[v] : v
  if (!Object.prototype.hasOwnProperty.call(COUNTRIES, key)) return v
  const row = COUNTRIES[key]
  return row[(lang === 'en' ? 2 : 0) + (style === 'in' ? 1 : 0)]
}

export const I18N = { 'de-sie': SIE, 'de-du': DU, en: EN }
