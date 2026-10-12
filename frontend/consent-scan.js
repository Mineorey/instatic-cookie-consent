/*! instatic.consent 1.2.4 | MIT */
// Check mode (#cc-scan): an overlay that lists which third-party servers this
// page view contacted, what is stored in the browser and what the guard
// blocked. Loaded on demand by consent.js; it only reads, never changes
// blocking, and makes no requests of its own.
(function () {
  'use strict'
  var IC = window.InstaticConsent
  if (!IC || !IC._scan || IC._scanReport) return
  var S = IC._scan
  var HASH = '#cc-scan'
  var EN = /^en/i.test(document.documentElement.lang || '')
  var L = EN ? {
    title: 'Consent check', violation: 'violation', violations: 'violations', checks: 'to check', ok: 'OK',
    undecided: 'No decision yet', rejected: 'Everything rejected', acceptedPrefix: 'Accepted: ',
    revision: 'Revision', storedRevision: 'stored decision: revision', safeMode: 'Safe mode: the publish step failed, everything stays blocked.',
    hViolations: 'Violations', noViolations: 'No violations found.',
    whyNoConsent: 'loaded without consent', whyStored: 'stored without consent', whyBefore: 'loaded before consent',
    hHosts: 'Third-party servers', noHosts: 'No third-party server contacted.',
    colHost: 'Server', colTypes: 'Type', colStatus: 'Status', colHint: 'Note',
    stOwn: 'own server', stAllowed: 'allowed', stUnknown: 'unknown',
    hStorage: 'Storage', noStorage: 'Nothing stored.', ownerPlugin: 'consent plugin', ownerUnknown: 'unknown',
    storageNote: 'Cookies inside embedded third-party content are not visible from here.',
    parentDomain: function (d) { return 'set by the parent domain (' + d + ') – not by this site' },
    hBlocked: 'Blocked', noBlocked: 'Nothing blocked.',
    rescan: 'Check again', copy: 'Copy result', copied: 'Result copied.', copyFailed: 'Copying is not possible here – the result is selected below.',
    collapse: 'Collapse', expand: 'Expand', close: 'Close', result: 'Result',
    cats: { media: 'External media', statistics: 'Statistics', marketing: 'Marketing' },
  } : {
    title: 'Consent-Prüfung', violation: 'Verstoß', violations: 'Verstöße', checks: 'prüfen', ok: 'in Ordnung',
    undecided: 'Noch keine Entscheidung', rejected: 'Alles abgelehnt', acceptedPrefix: 'Zugestimmt: ',
    revision: 'Revision', storedRevision: 'gespeicherte Entscheidung: Revision', safeMode: 'Sicherheitsmodus: Veröffentlichung fehlerhaft, alles bleibt blockiert.',
    hViolations: 'Verstöße', noViolations: 'Keine Verstöße gefunden.',
    whyNoConsent: 'ohne Einwilligung geladen', whyStored: 'ohne Einwilligung gespeichert', whyBefore: 'vor der Einwilligung geladen',
    hHosts: 'Fremd-Server', noHosts: 'Kein Fremd-Server kontaktiert.',
    colHost: 'Server', colTypes: 'Art', colStatus: 'Status', colHint: 'Hinweis',
    stOwn: 'eigener Server', stAllowed: 'freigegeben', stUnknown: 'unbekannt',
    hStorage: 'Speicher', noStorage: 'Nichts gespeichert.', ownerPlugin: 'Consent-Plugin', ownerUnknown: 'unbekannt',
    storageNote: 'Cookies in eingebetteten Drittanbieter-Inhalten sind von hier aus nicht sichtbar.',
    parentDomain: function (d) { return 'von übergeordneter Domain (' + d + ') gesetzt – nicht von dieser Seite' },
    hBlocked: 'Blockiert', noBlocked: 'Nichts blockiert.',
    rescan: 'Neu prüfen', copy: 'Ergebnis kopieren', copied: 'Ergebnis kopiert.', copyFailed: 'Kopieren ist hier nicht möglich – das Ergebnis ist unten markiert.',
    collapse: 'Einklappen', expand: 'Ausklappen', close: 'Schließen', result: 'Ergebnis',
    cats: { media: 'Externe Medien', statistics: 'Statistik', marketing: 'Marketing' },
  }

  function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') }
  function list(v) { return Array.isArray(v) ? v : [] }
  // same rule as the server's hostMatches: "*.base" covers base and subdomains
  function scanHostMatches(host, pattern) {
    var h = String(host).toLowerCase()
    var p = String(pattern).toLowerCase()
    if (p.indexOf('*.') === 0) { var base = p.slice(2); return h === base || (h.length > base.length && h.slice(-base.length - 1) === '.' + base) }
    return h === p
  }
  function anyHost(host, patterns) { var l = list(patterns); for (var i = 0; i < l.length; i++) if (scanHostMatches(host, l[i])) return true; return false }
  function serviceById(id) { var l = list(S.services); for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null }
  function serviceForHost(host) { var l = list(S.services); for (var i = 0; i < l.length; i++) if (anyHost(host, l[i].hosts)) return l[i]; return null }
  function hintForHost(host) { var l = list(S.hints); for (var i = 0; i < l.length; i++) if (anyHost(host, l[i].hosts)) return l[i]; return null }
  function isAccepted(id) { try { return !!S.accepted(id) } catch (e) { return false } }
  function anyAccepted() { var l = list(S.services); for (var i = 0; i < l.length; i++) if (isAccepted(l[i].id)) return true; return false }
  function nameRe(pattern) {
    var p = String(pattern).replace(/^\s+|\s+$/g, '')
    return new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$')
  }

  // ---- collected resources (kept while the panel is open) ----
  var seen = {}
  function addEntry(e) {
    if (!e || !e.name || seen[e.name + '|' + e.startTime]) return
    seen[e.name + '|' + e.startTime] = e
  }
  function collect() {
    try { var l = performance.getEntriesByType('resource'); for (var i = 0; i < l.length; i++) addEntry(l[i]) } catch (e) {}
  }

  // a request for a URL the visitor loaded once via "load content"
  function loadedOnce(e) {
    var l = list(S.allowedOnce)
    for (var i = 0; i < l.length; i++) if (l[i].url === e.name && e.startTime + 1 >= l[i].t) return true
    return false
  }

  function hostRows() {
    var own = location.hostname.toLowerCase()
    var map = {}, order = []
    Object.keys(seen).forEach(function (k) {
      var e = seen[k], u
      try { u = new URL(e.name) } catch (x) { return }
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return
      var host = u.host.toLowerCase().replace(/:\d+$/, '')
      if (!host || host === own) return
      var r = map[host]
      if (!r) { r = map[host] = { host: host, count: 0, types: [], first: e.startTime, other: 0, firstOther: Infinity }; order.push(host) }
      r.count++
      var t = e.initiatorType || 'other'
      if (r.types.indexOf(t) < 0) r.types.push(t)
      if (e.startTime < r.first) r.first = e.startTime
      // requests not covered by a "load content" click
      if (!loadedOnce(e)) { r.other++; if (e.startTime < r.firstOther) r.firstOther = e.startTime }
    })
    return order.map(function (h) { return map[h] })
  }

  function classify(r, st, someAccepted, at) {
    var row = { host: r.host, count: r.count, types: r.types, first: Math.round(r.first), status: 'unknown', service: null, hint: null, verdict: 'check', why: null }
    if (anyHost(r.host, S.own)) { row.status = 'own'; row.verdict = 'ok'; return row }
    if (anyHost(r.host, S.allow)) { row.status = 'allowed'; row.verdict = 'ok'; return row }
    var s = serviceForHost(r.host)
    if (s) {
      row.status = 'service'
      row.service = s.id
      // every request of this host came from a "load content" click
      if (r.other === 0) { row.verdict = 'ok'; row.why = 'once'; return row }
      if (!isAccepted(s.id)) { row.verdict = 'violation'; row.why = 'noConsent' }
      else if (at !== null && r.firstOther < at) { row.verdict = 'violation'; row.why = 'before' }
      else row.verdict = 'ok'
      return row
    }
    var h = hintForHost(r.host)
    if (h) row.hint = { name: String(h.name || ''), advice: String((h.advice && (h.advice[EN ? 'en' : 'de'] || h.advice.de)) || '') }
    // loaded before the decision in this page view: stays red after consent
    var before = at !== null && r.first < at
    if (!st.decided || !someAccepted || before) { row.verdict = 'violation'; row.why = before ? 'before' : 'noConsent' }
    return row
  }

  function storageOwner(kind, name) {
    if (kind === 'cookie' && name === 'cc_cookie') return 'plugin'
    var l = list(S.services)
    for (var i = 0; i < l.length; i++) {
      var c = list(l[i].cookies)
      for (var j = 0; j < c.length; j++) {
        var entry = String(c[j])
        var m = /^localStorage:(.*)$/i.exec(entry)
        if (kind === 'cookie') {
          if (m || /^IndexedDB:/i.test(entry)) continue
          if (nameRe(entry).test(name)) return 'service:' + l[i].id
        } else if (m) {
          var keys = m[1].split(',')
          for (var k = 0; k < keys.length; k++) if (keys[k].replace(/\s+/g, '') && nameRe(keys[k]).test(name)) return 'service:' + l[i].id
        }
      }
    }
    return 'unknown'
  }

  function storageRows() {
    var rows = []
    String(document.cookie || '').split(';').forEach(function (part) {
      var name = part.split('=')[0].replace(/^\s+|\s+$/g, '')
      if (name) rows.push({ kind: 'cookie', name: name })
    })
    ;['localStorage', 'sessionStorage'].forEach(function (kind) {
      try {
        var st = window[kind]
        for (var i = 0; i < st.length; i++) rows.push({ kind: kind, name: String(st.key(i)) })
      } catch (e) {}
    })
    rows.forEach(function (r) {
      r.owner = storageOwner(r.kind, r.name)
      r.verdict = r.owner === 'unknown' ? 'check' : 'ok'
      // a service's storage without consent for that service
      if (r.owner.indexOf('service:') === 0 && !isAccepted(r.owner.slice(8))) { r.verdict = 'violation'; r.why = 'stored' }
      // set by a parent domain (e.g. the main site of a preview subdomain):
      // only a violation is softened, and only when the service shows no
      // sign of activity in this page view
      if (r.verdict !== 'violation' || r.kind !== 'cookie') return
      var pd = parentDomainOf(r.name)
      if (pd && !serviceActiveHere(r.owner.slice(8))) { r.verdict = 'check'; r.why = 'parentDomain'; r.domain = pd; r.note = L.parentDomain(pd) }
    })
    return rows
  }

  // the service contacted one of its hosts in this page view (Resource
  // Timing) or the guard blocked one of its embeds
  function serviceActiveHere(id) {
    var s = serviceById(id)
    if (!s) return true
    var b = list(S.blocked)
    for (var i = 0; i < b.length; i++) if (b[i] && b[i].service === id) return true
    var active = false
    Object.keys(seen).forEach(function (k) {
      var u
      try { u = new URL(seen[k].name) } catch (x) { return }
      if (anyHost(u.hostname.toLowerCase(), s.hosts)) active = true
    })
    return active
  }

  // Cookie domains from the Cookie Store API (Chromium); document.cookie has
  // no domain. name -> list of domains (null: host-only cookie).
  var cookieDomains = null
  function refreshCookies(cb) {
    var done = false, t = null
    function finish() { if (done) return; done = true; if (t) clearTimeout(t); cb() }
    // no answer: forget old domain info rather than judge with stale data
    function fail() { if (done) return; cookieDomains = null; finish() }
    var cs = window.cookieStore
    if (!cs || typeof cs.getAll !== 'function') { cookieDomains = null; finish(); return }
    t = setTimeout(fail, 500)
    try {
      cs.getAll().then(function (l) {
        if (done) return
        var map = {}
        list(l).forEach(function (c) {
          if (!c || !c.name) return
          ;(map[c.name] = map[c.name] || []).push(c.domain ? String(c.domain).replace(/^\./, '').toLowerCase() : null)
        })
        cookieDomains = map
        finish()
      }, fail)
    } catch (e) { fail() }
  }
  // the parent domain when every cookie of this name comes from one; with a
  // host cookie of the same name (or no domain info) today's rules apply.
  // www.example.com and example.com count as the same site.
  function parentDomainOf(name) {
    var l = cookieDomains && Object.prototype.hasOwnProperty.call(cookieDomains, name) ? cookieDomains[name] : null
    if (!l || !l.length) return null
    var own = location.hostname.toLowerCase(), bare = own.replace(/^www\./, ''), d = null
    for (var i = 0; i < l.length; i++) { if (!l[i] || l[i] === own || l[i] === bare) return null; d = l[i] }
    return d
  }

  function buildReport() {
    collect()
    var st
    try { st = S.state() } catch (e) { st = { decided: false, revision: null, categories: [], services: {}, date: null } }
    var at = null
    try { at = S.consentAt() } catch (e) { at = null }
    var someAccepted = anyAccepted()
    var hosts = hostRows().map(function (r) { return classify(r, st, someAccepted, at) })
    var storage = storageRows()
    var summary = { violations: 0, checks: 0, ok: 0 }
    hosts.concat(storage).forEach(function (x) {
      if (x.verdict === 'violation') summary.violations++
      else if (x.verdict === 'check') summary.checks++
      else summary.ok++
    })
    return {
      at: new Date().toISOString(), url: location.href, revision: S.revision, safeMode: !!S.safeMode,
      consent: st, hosts: hosts, storage: storage,
      blocked: list(S.blocked).slice(), summary: summary,
    }
  }

  // ---- texts ----
  function violationsText(n) { return n + ' ' + (n === 1 ? L.violation : L.violations) }
  function summaryText(s) { return violationsText(s.violations) + ' · ' + s.checks + ' ' + L.checks + ' · ' + s.ok + ' ' + L.ok }
  // hosts and storage entries with verdict 'violation', for the Verstöße list
  function violationItems(r) {
    return r.hosts.filter(function (h) { return h.verdict === 'violation' }).map(function (h) { return { name: h.host, why: h.why } })
      .concat(r.storage.filter(function (x) { return x.verdict === 'violation' }).map(function (x) { return { name: x.name + ' (' + x.kind + ')', why: x.why } }))
  }
  function consentText(r) {
    if (!r.consent.decided) return L.undecided
    var groups = {}, cats = []
    list(S.services).forEach(function (s) {
      if (!isAccepted(s.id)) return
      if (!groups[s.category]) { groups[s.category] = []; cats.push(s.category) }
      groups[s.category].push(s.label)
    })
    if (!cats.length) return L.rejected
    return L.acceptedPrefix + cats.map(function (c) { return ((S.categoryTitles && S.categoryTitles[c]) || L.cats[c] || c) + ' (' + groups[c].join(', ') + ')' }).join('; ')
  }
  function revisionText(r) {
    var t = L.revision + ' ' + r.revision
    if (r.consent.revision !== null && r.consent.revision !== undefined && r.consent.revision !== r.revision) t += ' (' + L.storedRevision + ' ' + r.consent.revision + ')'
    return t
  }
  function whyText(w) { return w === 'before' ? L.whyBefore : w === 'stored' ? L.whyStored : L.whyNoConsent }
  function statusText(h) {
    if (h.status === 'own') return L.stOwn
    if (h.status === 'allowed') return L.stAllowed
    if (h.status === 'service') { var s = serviceById(h.service); return s ? s.label : h.service }
    return L.stUnknown
  }
  function ownerText(o) {
    if (o === 'plugin') return L.ownerPlugin
    if (o.indexOf('service:') === 0) { var s = serviceById(o.slice(8)); return s ? s.label : o.slice(8) }
    return L.ownerUnknown
  }
  function serviceLabel(id) { var s = serviceById(id); return s ? s.label : id }
  function short(u) { u = String(u); return u.length > 80 ? u.slice(0, 79) + '…' : u }

  function plainText(r) {
    var out = [L.title + ' – ' + r.url, summaryText(r.summary), consentText(r) + ' · ' + revisionText(r)]
    if (r.safeMode) out.push(L.safeMode)
    var v = violationItems(r)
    out.push('', L.hViolations + ':')
    if (!v.length) out.push('  ' + L.noViolations)
    v.forEach(function (x) { out.push('  ' + x.name + ' – ' + whyText(x.why)) })
    out.push('', L.hHosts + ':')
    if (!r.hosts.length) out.push('  ' + L.noHosts)
    r.hosts.forEach(function (h) { out.push('  ' + h.host + ' (' + h.types.join(', ') + ') – ' + statusText(h) + (h.hint ? ' – ' + h.hint.advice : '')) })
    out.push('', L.hStorage + ':')
    if (!r.storage.length) out.push('  ' + L.noStorage)
    r.storage.forEach(function (s) { out.push('  ' + s.kind + ' ' + s.name + ' – ' + ownerText(s.owner) + (s.note ? ' – ' + s.note : '')) })
    out.push('', L.hBlocked + ':')
    if (!r.blocked.length) out.push('  ' + L.noBlocked)
    r.blocked.forEach(function (b) { out.push('  ' + serviceLabel(b.service) + ' – ' + short(b.url) + ' (' + b.how + ')') })
    return out.join('\n')
  }

  // ---- panel ----
  var panel = null, observer = null, timer = null, current = null

  function headHtml(r) {
    var s = r.summary
    return '<p class="cc-scan__summary">' +
      '<span class="cc-scan__n cc-scan__n--violation">' + esc(violationsText(s.violations)) + '</span> · ' +
      '<span class="cc-scan__n cc-scan__n--check">' + esc(s.checks + ' ' + L.checks) + '</span> · ' +
      '<span class="cc-scan__n cc-scan__n--ok">' + esc(s.ok + ' ' + L.ok) + '</span></p>' +
      '<p class="cc-scan__consent">' + esc(consentText(r)) + ' · ' + esc(revisionText(r)) + '</p>' +
      (r.safeMode ? '<p class="cc-scan__consent">' + esc(L.safeMode) + '</p>' : '')
  }

  function bodyHtml(r) {
    var v = violationItems(r)
    var html = '<h3>' + esc(L.hViolations) + '</h3>'
    html += v.length ? '<ul class="cc-scan__list cc-scan__list--violation">' + v.map(function (x) {
      return '<li><span class="cc-scan__host">' + esc(x.name) + '</span> – ' + esc(whyText(x.why)) + '</li>'
    }).join('') + '</ul>' : '<p>' + esc(L.noViolations) + '</p>'

    html += '<h3>' + esc(L.hHosts) + '</h3>'
    html += r.hosts.length ? '<table class="cc-scan__table"><thead><tr>' +
      '<th scope="col">' + esc(L.colHost) + '</th><th scope="col">' + esc(L.colTypes) + '</th><th scope="col">' + esc(L.colStatus) + '</th><th scope="col">' + esc(L.colHint) + '</th>' +
      '</tr></thead><tbody>' + r.hosts.map(function (h) {
        return '<tr class="cc-scan__row--' + esc(h.verdict) + '"><td class="cc-scan__host">' + esc(h.host) + '</td><td>' + esc(h.types.join(', ')) +
          '</td><td class="cc-scan__v--' + esc(h.verdict) + '">' + esc(statusText(h)) + '</td><td>' + esc(h.hint ? h.hint.name + ': ' + h.hint.advice : '') + '</td></tr>'
      }).join('') + '</tbody></table>' : '<p>' + esc(L.noHosts) + '</p>'

    html += '<h3>' + esc(L.hStorage) + '</h3>'
    html += r.storage.length ? '<ul class="cc-scan__list">' + r.storage.map(function (s) {
      return '<li><span class="cc-scan__host">' + esc(s.name) + '</span> (' + esc(s.kind) + ') – <span class="cc-scan__v--' + esc(s.verdict) + '">' + esc(ownerText(s.owner)) + '</span>' + (s.note ? ' – ' + esc(s.note) : '') + '</li>'
    }).join('') + '</ul>' : '<p>' + esc(L.noStorage) + '</p>'
    html += '<p class="cc-scan__note">' + esc(L.storageNote) + '</p>'

    html += '<h3>' + esc(L.hBlocked) + '</h3>'
    html += r.blocked.length ? '<ul class="cc-scan__list">' + r.blocked.map(function (b) {
      return '<li>' + esc(serviceLabel(b.service)) + ' – <span class="cc-scan__host">' + esc(short(b.url)) + '</span> (' + esc(b.how) + ')</li>'
    }).join('') + '</ul>' : '<p>' + esc(L.noBlocked) + '</p>'
    return html
  }

  function renderNow() {
    if (!panel) return
    current = buildReport()
    panel.querySelector('.cc-scan__head-info').innerHTML = headHtml(current)
    panel.querySelector('.cc-scan__content').innerHTML = bodyHtml(current)
  }
  // renders at once with the last known cookie domains, then again once the
  // Cookie Store has answered (at most 500 ms later)
  function render() {
    renderNow()
    refreshCookies(renderNow)
  }
  function later() { if (timer) clearTimeout(timer); timer = setTimeout(function () { timer = null; render() }, 250) }

  function setStatus(t) { var el = panel && panel.querySelector('.cc-scan__status'); if (el) el.textContent = t }

  // synchronous (keeps the click's clipboard permission): uses the cookie
  // domains of the last render, which is what the panel shows
  function copy() {
    if (!panel) return
    renderNow()
    var r = current || buildReport()
    var text = plainText(r) + '\n\n' + JSON.stringify(r, null, 2)
    function fallback() {
      if (!panel) return
      var box = panel.querySelector('.cc-scan__copy')
      box.innerHTML = '<textarea readonly rows="8" aria-label="' + esc(L.result) + '"></textarea>'
      var ta = box.firstChild
      ta.value = text
      box.hidden = false
      setStatus(L.copyFailed)
      try { ta.focus(); ta.select() } catch (e) {}
    }
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) { fallback(); return }
      navigator.clipboard.writeText(text).then(function () { setStatus(L.copied) }, fallback)
    } catch (e) { fallback() }
  }

  function toggle(btn) {
    var body = panel.querySelector('.cc-scan__body')
    var open = btn.getAttribute('aria-expanded') !== 'true'
    btn.setAttribute('aria-expanded', open ? 'true' : 'false')
    btn.textContent = open ? L.collapse : L.expand
    body.hidden = !open
  }

  function close() {
    if (!panel) return
    if (observer) { try { observer.disconnect() } catch (e) {} observer = null }
    if (timer) { clearTimeout(timer); timer = null }
    var hadFocus = panel.contains(document.activeElement)
    panel.parentNode.removeChild(panel)
    panel = null
    current = null
    seen = {}
    try { history.replaceState(null, '', location.pathname + location.search) } catch (e) {}
    if (hadFocus && document.activeElement && document.activeElement !== document.body && document.activeElement.blur) document.activeElement.blur()
  }

  function open(focus) {
    if (panel) { render(); if (focus) focusHead(); return }
    panel = document.createElement('section')
    panel.id = 'cc-scan'
    panel.className = 'cc-scan'
    panel.setAttribute('role', 'region')
    panel.setAttribute('aria-label', L.title)
    panel.innerHTML =
      '<div class="cc-scan__head"><h2 class="cc-scan__title" tabindex="-1">' + esc(L.title) + '</h2><div class="cc-scan__head-info"></div></div>' +
      '<div class="cc-scan__actions">' +
        '<button type="button" data-cc-scan="rescan">' + esc(L.rescan) + '</button>' +
        '<button type="button" data-cc-scan="copy">' + esc(L.copy) + '</button>' +
        '<button type="button" data-cc-scan="toggle" aria-expanded="true" aria-controls="cc-scan-body">' + esc(L.collapse) + '</button>' +
        '<button type="button" data-cc-scan="close">' + esc(L.close) + '</button>' +
      '</div>' +
      '<p class="cc-scan__status" role="status"></p>' +
      '<div class="cc-scan__body" id="cc-scan-body"><div class="cc-scan__copy" hidden></div><div class="cc-scan__content"></div></div>'
    panel.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('[data-cc-scan]') : null
      if (!b) return
      var a = b.getAttribute('data-cc-scan')
      if (a === 'rescan') { setStatus(''); render() }
      else if (a === 'copy') copy()
      else if (a === 'toggle') toggle(b)
      else if (a === 'close') close()
    })
    ;(document.body || document.documentElement).appendChild(panel)
    render()
    try {
      observer = new PerformanceObserver(function (l) { var es = l.getEntries(); for (var i = 0; i < es.length; i++) addEntry(es[i]); later() })
      observer.observe({ type: 'resource', buffered: true })
    } catch (e) { observer = null }
    if (focus) focusHead()
  }

  function focusHead() {
    var h = panel && panel.querySelector('.cc-scan__title')
    if (!h) return
    try { h.focus({ preventScroll: true }) } catch (e) { h.focus() }
  }

  // always fresh: Resource Timing entries can arrive after the last render
  // (a Promise since 1.2.1: built after the Cookie Store has answered)
  IC._scanReport = function () { return new Promise(function (resolve) { refreshCookies(function () { resolve(buildReport()) }) }) }
  // InstaticConsent.scan(): open (or refresh) the panel and move focus to it
  IC.scan = function () { open(true) }
  window.addEventListener('hashchange', function () { if (location.hash === HASH) open(false) })
  open(location.hash !== HASH)
})()
