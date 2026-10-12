// Short German summary of a consent configuration for the versions list
// (the full snapshot lives in the version-snapshots resource).
const VERSION_LAYOUT_DE = { wide: 'breit', box: 'kompakt', bar: 'leiste' }
const VERSION_SUMMARY_MAX = 160

function versionServicesText(labels, room) {
  if (!labels.length) return 'keine Dienste aktiv'
  let text = labels.join(', ') + ' an'
  if (text.length <= room) return text
  // too many services: as many labels as fit plus "+N weitere"
  for (let n = labels.length - 1; n >= 1; n--) {
    text = labels.slice(0, n).join(', ') + ` +${labels.length - n} weitere an`
    if (text.length <= room) return text
  }
  return `${labels.length} Dienste an`
}

function versionMonths(n) { return `${n} ${n === 1 ? 'Monat' : 'Monate'}` }

export function versionSummary(cfg) {
  const labels = cfg.services.filter((s) => s.enabled).map((s) => String(s.label))
  const meta = cfg.meta || {}
  const tail = [
    `Text ${meta.textStyle === 'detailed' ? 'ausführlich' : 'kurz'}`,
    meta.formality === 'du' ? 'Du' : 'Sie',
    versionMonths(meta.validityMonths || 12),
    `Layout ${VERSION_LAYOUT_DE[cfg.client.layout] || cfg.client.layout}`,
  ]
  if (!cfg.enabled) tail.unshift('Banner aus')
  const rest = ' · ' + tail.join(' · ')
  return versionServicesText(labels, VERSION_SUMMARY_MAX - rest.length) + rest
}

// Records written before 1.2.1 carry the JSON snapshot instead of a summary:
// derive what the snapshot tells (services, validity, layout).
export function versionSummaryFromSnapshot(snapshot) {
  const out = ['(ältere Version)']
  let c = null
  try { c = JSON.parse(snapshot).client } catch (e) { c = null }
  if (!c || typeof c !== 'object') return out[0]
  if (Array.isArray(c.services)) {
    const labels = c.services.filter((s) => s && s.enabled).map((s) => String(s.label || s.id))
    out.push(versionServicesText(labels, VERSION_SUMMARY_MAX - 60))
  }
  const months = Math.round(Number(c.validityDays) / 30)
  if (months > 0) out.push(versionMonths(months))
  if (VERSION_LAYOUT_DE[c.layout]) out.push(`Layout ${VERSION_LAYOUT_DE[c.layout]}`)
  return out.join(' · ')
}
