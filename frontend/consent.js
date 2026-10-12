/*! instatic.consent 1.2.4 | MIT */
// Runs synchronously in <head>, before any other page script: guards iframe
// URLs, renders placeholders and configures the vendored CookieConsent
// library (loaded with `defer`, so it is ready by DOMContentLoaded).
(function () {
  'use strict'
  // Safe mode ("blocked, not open"): when the publish step failed (no or
  // broken #cc-config, or <html data-cc-error>), no banner is shown, nothing
  // can be loaded and every cross-origin iframe becomes a placeholder.
  var FALLBACK = {
    de: { embed: { disabled: 'Dieser externe Inhalt ist derzeit blockiert.' } },
    en: { embed: { disabled: 'This external content is currently blocked.' } },
  }
  var FALLBACK_NOTICES = {
    de: { safeMode: 'Die Cookie-Einstellungen sind gerade nicht verfügbar. Externe Inhalte bleiben blockiert.', close: 'Schließen' },
    en: { safeMode: 'Cookie settings are currently unavailable. External content stays blocked.', close: 'Close' },
  }
  var cfgEl = document.getElementById('cc-config')
  var cfg = null
  try { cfg = cfgEl ? JSON.parse(cfgEl.textContent) : null } catch (e) { cfg = null }
  var cfgOk = !!(cfg && cfg.texts && cfg.texts.de && cfg.texts.de.embed && Array.isArray(cfg.services))
  var safeMode = !cfgOk || document.documentElement.hasAttribute('data-cc-error')
  if (!cfgOk) cfg = { enabled: false, revision: 0, texts: FALLBACK, services: [], style: {} }
  // link targets that open the settings (click and direct link)
  var SETTINGS_HASHES = ['#cookie-einstellungen', '#cookie-settings']
  var VERSION = '1.2.4'
  // banner layouts of the settings -> CookieConsent guiOptions
  var LAYOUTS = {
    wide: { layout: 'cloud inline', position: 'bottom center' },
    box: { layout: 'box wide', position: 'bottom center' },
    bar: { layout: 'bar inline', position: 'bottom' },
  }
  // hand-drawn cookie with a bite; decorative, colours come from consent.css
  var COOKIE_ICON = '<svg class="cc-icon" viewBox="0 0 32 32" width="32" height="32" aria-hidden="true" focusable="false">' +
    '<path class="cc-icon__body" d="M21.7 3.2A14 14 0 1 0 29.7 12.9A6.5 6.5 0 0 1 21.7 3.2Z"/>' +
    '<path class="cc-icon__chip" d="M8.6 10.4c1-.9 2.7-.6 3 .6.4 1.3-.8 2.4-2 2.2-1.3-.1-1.9-1.9-1-2.8z"/>' +
    '<path class="cc-icon__chip" d="M16.2 14.6c.9-.6 2.3-.2 2.4.9.2 1.1-.9 1.9-1.9 1.6-1-.2-1.3-1.8-.5-2.5z"/>' +
    '<path class="cc-icon__chip" d="M8.9 20.3c.8-.8 2.4-.6 2.8.5.4 1.2-.6 2.3-1.8 2.2-1.2-.1-1.8-1.8-1-2.7z"/>' +
    '<path class="cc-icon__chip" d="M18.6 22.4c.9-.5 2.2 0 2.3 1 .1 1-1 1.7-1.9 1.4-.9-.3-1.2-1.8-.4-2.4z"/>' +
    '<path class="cc-icon__chip" d="M23.3 15.9c.6-.4 1.6-.1 1.7.7.1.8-.7 1.3-1.4 1.1-.7-.2-.9-1.3-.3-1.8z"/>' +
    '</svg>'

  var COOKIE = 'cc_cookie'
  // The library only accepts a stored decision that carries a non-empty
  // string `consentId`, and generates a random UUID when none is known. We
  // hand it this fixed value (identical for every visitor, so it identifies
  // nobody) and remove the field from the cookie after every write.
  var ANON_ID = 'anonymous'
  var lang = cfg.language === 'de' || cfg.language === 'en' ? cfg.language : (/^en/i.test(document.documentElement.lang) ? 'en' : 'de')
  var T = cfg.texts[lang] || cfg.texts.de
  var services = cfg.services

  services.forEach(function (s) {
    s._iframe = ((s.match && s.match.iframe) || []).map(function (r) { return new RegExp(r, 'i') })
    s._rewrite = s.rewrite ? { re: new RegExp(s.rewrite.from, 'i'), to: s.rewrite.to } : null
  })

  // ---- check mode (#cc-scan) ----
  // Only with cfg.scan (setting "scanBrowser"): records what the guard
  // blocked, for the check overlay in consent-scan.js. Never changes blocking.
  var scanCfg = cfg.scan && typeof cfg.scan === 'object' ? cfg.scan : null
  // the check mode reads Resource Timing; keep more than the default 250 entries
  if (scanCfg) { try { performance.setResourceTimingBufferSize(1000) } catch (e) {} }
  var SCAN_HASH = '#cc-scan'
  var SCAN_MAX = 200
  var blockedLog = []
  // URLs loaded once via "load content" (no consent), for the check mode
  var allowedOnceLog = []
  var consentAt = null
  function now() { return window.performance && performance.now ? performance.now() : Date.now() }
  function logBlocked(id, url, how) {
    if (!scanCfg) return
    blockedLog.push({ t: now(), service: String(id || ''), url: String(url == null ? '' : url), how: how })
    if (blockedLog.length > SCAN_MAX) blockedLog.shift()
  }
  function logOnce(id, url) {
    if (!scanCfg) return
    allowedOnceLog.push({ service: String(id || ''), url: normalise(url), t: now() })
    if (allowedOnceLog.length > SCAN_MAX) allowedOnceLog.shift()
  }
  function markConsent() { if (consentAt === null) consentAt = now() }

  function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') }
  function fill(t, map) { return String(t).replace(/\{(\w+)\}/g, function (m, k) { return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : m }) }
  function byId(id) { for (var i = 0; i < services.length; i++) if (services[i].id === id) return services[i]; return null }
  // Resolves relative, protocol-relative and padded values the way the
  // browser will, so the `^https?://` catalog patterns cannot be bypassed.
  function normalise(value) {
    var raw = String(value == null ? '' : value)
    try { return new URL(raw, location.href).href } catch (e) { return raw }
  }
  // "*.base" covers base and its subdomains (same rule as the server)
  function hostMatch(host, pattern) {
    var p = String(pattern).toLowerCase()
    if (p.indexOf('*.') === 0) { var base = p.slice(2); return host === base || (host.length > base.length && host.slice(-base.length - 1) === '.' + base) }
    return host === p
  }
  // An active service's frame host is opened by the CSP; an iframe there that
  // misses the service's patterns gets a placeholder without a load button.
  function frameHostService(url) {
    var host = ''
    if (/^https?:/i.test(url)) { try { host = new URL(url).hostname.toLowerCase() } catch (e) { host = '' } }
    if (!host) return null
    for (var i = 0; i < services.length; i++) {
      var s = services[i], fh = s.enabled && Array.isArray(s.frameHosts) ? s.frameHosts : []
      for (var j = 0; j < fh.length; j++) if (hostMatch(host, fh[j])) return s
    }
    return null
  }
  function serviceFor(url) {
    for (var i = 0; i < services.length; i++) for (var j = 0; j < services[i]._iframe.length; j++) if (services[i]._iframe[j].test(url)) return services[i]
    var fs = frameHostService(url)
    if (fs) return fs
    if (safeMode && /^https?:/i.test(url)) {
      var u
      try { u = new URL(url) } catch (e) { u = null }
      if (!u || u.origin !== location.origin) {
        var host = u ? u.host : url.split('/')[2] || url
        return { id: 'unknown', label: host, category: 'media', enabled: false, provider: { name: host }, thirdCountries: [], _iframe: [] }
      }
    }
    return null
  }
  function rewrite(s, url) { return s && s.enabled && s._rewrite ? url.replace(s._rewrite.re, s._rewrite.to) : url }
  // A source may only ever be loaded if it is https and matches the service's
  // own patterns; [data-cc-embed] markup can come from anywhere on the page.
  function validSource(s, url) {
    var n = normalise(url)
    if (!s || !s._iframe || !/^https:/i.test(n)) return false
    for (var i = 0; i < s._iframe.length; i++) if (s._iframe[i].test(n)) return true
    return false
  }

  // ---- stored decision ----
  function readCookie() {
    var m = document.cookie.match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]*)'))
    if (!m) return null
    try { var c = JSON.parse(decodeURIComponent(m[1])); return c && typeof c === 'object' ? c : null } catch (e) { return null }
  }
  // Same attributes as the library writes (it adds Domain=<host> whenever the
  // host contains a dot), so we overwrite its cookie instead of adding a twin.
  function writeCookie(c) {
    var v = COOKIE + '=' + (c ? encodeURIComponent(JSON.stringify(c)) : '')
    if (!c) v += '; expires=Thu, 01 Jan 1970 00:00:00 GMT'
    else if (c.expirationTime) v += '; expires=' + new Date(c.expirationTime).toUTCString()
    v += '; Path=/; SameSite=Lax'
    if (location.hostname.indexOf('.') >= 0) v += '; Domain=' + location.hostname
    if (location.protocol === 'https:') v += '; Secure'
    document.cookie = v
  }
  function primeConsentId() {
    var c = readCookie() || {}
    c.consentId = ANON_ID
    writeCookie(c)
  }
  function stripConsentId() {
    var c = readCookie()
    if (!c || !('consentId' in c)) return
    delete c.consentId
    writeCookie(Object.keys(c).length ? c : null)
  }

  // libStarted: run() has read the stored decision, so the library may be
  // asked about it. libOk: run() finished without failing, so its UI works.
  var libStarted = false, libOk = false
  function libReady() { return libStarted && !!window.CookieConsent }
  function accepted(s) {
    if (safeMode || !s || !s.enabled || !cfg.enabled) return false
    if (libReady()) return CookieConsent.validConsent() && CookieConsent.acceptedService(s.id, s.category)
    var c = readCookie()
    return !!(c && c.revision === cfg.revision && c.services && Array.isArray(c.services[s.category]) && c.services[s.category].indexOf(s.id) >= 0)
  }

  // ---- iframe guard ----
  var desc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src')
  var nativeSetAttr = Element.prototype.setAttribute
  // "Load content" (and a consent-based load) allows exactly one service and
  // URL on that element; any other source has to pass the checks again.
  function allowFor(s, url) { return { service: s.id, url: normalise(url) } }
  function isAllowed(el, s, url) { var a = el.__ccAllow; return !!(a && a.service === s.id && a.url === url) }
  function guardSet(el, value, how) {
    var url = normalise(value)
    var s = serviceFor(url)
    if (!s) { desc.set.call(el, value); return }
    var ok = validSource(s, url)
    if (ok && (isAllowed(el, s, url) || accepted(s))) { desc.set.call(el, rewrite(s, url)); return }
    el.__ccAllow = null
    nativeSetAttr.call(el, 'data-cc-src', ok ? rewrite(s, url) : url)
    nativeSetAttr.call(el, 'data-cc-service', s.id)
    desc.set.call(el, 'about:blank')
    logBlocked(s.id, url, how)
    // already in the page (e.g. a script changes the src of a loaded embed):
    // show the placeholder right away, the MutationObserver will not fire
    if (el.isConnected && el.parentNode) placeholderFromIframe(el, s, ok)
  }
  Object.defineProperty(HTMLIFrameElement.prototype, 'src', {
    configurable: true, enumerable: desc.enumerable,
    get: function () { return desc.get.call(this) },
    set: function (v) { guardSet(this, v, 'src') },
  })
  Element.prototype.setAttribute = function (name, value) {
    if (this instanceof HTMLIFrameElement && String(name).toLowerCase() === 'src') { guardSet(this, value, 'attr'); return }
    return nativeSetAttr.apply(this, arguments)
  }
  var nativeSetAttrNS = Element.prototype.setAttributeNS
  Element.prototype.setAttributeNS = function (ns, name, value) {
    if (this instanceof HTMLIFrameElement && !ns && String(name).toLowerCase() === 'src') { guardSet(this, value, 'attr'); return }
    return nativeSetAttrNS.apply(this, arguments)
  }

  // HTML-string insertion: the parser creates the iframes, so the setters
  // above never run. Scan the inserted nodes synchronously, before control
  // returns to the caller (a MutationObserver would only run afterwards).
  function scanChildren(parent, from, to) {
    var n = from
    while (n && n !== to) { var next = n.nextSibling; scan(n, 'html'); n = next }
  }
  function mayHoldFrame(v) { return /<\s*iframe/i.test(String(v)) }
  function wrapHtmlSetter(prop, after) {
    var d = Object.getOwnPropertyDescriptor(Element.prototype, prop)
    if (!d || !d.set) return
    Object.defineProperty(Element.prototype, prop, {
      configurable: true, enumerable: d.enumerable,
      get: function () { return d.get.call(this) },
      set: function (v) {
        if (!mayHoldFrame(v)) { d.set.call(this, v); return }
        after.call(this, function (el) { d.set.call(el, v) })
      },
    })
  }
  wrapHtmlSetter('innerHTML', function (write) {
    write(this)
    scanChildren(this, this.firstChild, null)
  })
  wrapHtmlSetter('outerHTML', function (write) {
    var parent = this.parentNode, before = this.previousSibling, after = this.nextSibling
    write(this)
    if (parent) scanChildren(parent, before ? before.nextSibling : parent.firstChild, after)
  })
  var nativeInsertAdjacentHTML = Element.prototype.insertAdjacentHTML
  Element.prototype.insertAdjacentHTML = function (where, html) {
    if (!mayHoldFrame(html)) return nativeInsertAdjacentHTML.apply(this, arguments)
    var pos = String(where).toLowerCase()
    var parent = pos === 'afterbegin' || pos === 'beforeend' ? this : this.parentNode
    var start, end
    if (pos === 'beforebegin') { start = this.previousSibling; end = this }
    else if (pos === 'afterbegin') { start = null; end = this.firstChild }
    else if (pos === 'beforeend') { start = this.lastChild; end = null }
    else { start = this; end = this.nextSibling }
    var r = nativeInsertAdjacentHTML.apply(this, arguments)
    if (parent) scanChildren(parent, start ? start.nextSibling : parent.firstChild, end)
    return r
  }

  // ---- placeholders ----
  // provider name/address: a string or { de, en }
  function loc(v) { return v && typeof v === 'object' ? (v[lang] || v.de || '') : (v || '') }
  // country names in the visitor's language (the server resolves the ISO codes)
  function countryList(s) { return (s.countryLabels && s.countryLabels[lang]) || s.thirdCountries || [] }
  function countriesText(s, tpl) { var l = countryList(s); return l.length ? fill(tpl, { list: l.join(', ') }) : '' }

  function renderPlaceholder(box, s) {
    if (box.__ccRendered) return
    box.__ccRendered = true
    box.classList.add('cc-embed')
    box.setAttribute('role', 'group')
    box.setAttribute('aria-label', String(s.label))
    // never wider than the authored embed (width attribute in px)
    var w = box.getAttribute('data-width')
    if (w && /^\d+$/.test(w) && !box.style.maxWidth) box.style.maxWidth = w + 'px'
    var disabled = safeMode || !s.enabled || box.getAttribute('data-state') === 'disabled'
    var html = '<div class="cc-embed__inner"><p class="cc-embed__title">' + esc(s.label) + '</p>'
    if (disabled) {
      html += '<p class="cc-embed__text">' + esc(safeMode ? (FALLBACK[lang] || FALLBACK.de).embed.disabled : T.embed.disabled) + '</p>'
    } else {
      html += '<p class="cc-embed__text">' + esc(fill(T.embed.text, { provider: loc(s.provider.name), countries: countriesText(s, T.embed.countries) })) + '</p>'
      html += '<div class="cc-embed__actions"><button type="button" class="cc-embed__btn" data-cc-load>' + esc(T.embed.load) + '</button>'
      if (cfg.enabled && libOk) html += '<button type="button" class="cc-embed__btn" data-cc-always>' + esc(fill(T.embed.always, { service: s.label })) + '</button>'
      html += '</div>'
      if (cfg.privacyUrl) html += '<p class="cc-embed__links"><a href="' + esc(cfg.privacyUrl) + '">' + esc(T.embed.privacy) + '</a></p>'
    }
    box.innerHTML = html + '</div>'
    // Like an iframe, a placeholder keeps its clicks to itself: page handlers
    // such as "close the overlay on any click" must not see them.
    if (!box.__ccShield) { box.__ccShield = true; box.addEventListener('click', function (e) { e.stopPropagation() }) }
  }

  function disableBox(box, s) {
    nativeSetAttr.call(box, 'data-state', 'disabled')
    box.__ccRendered = false
    renderPlaceholder(box, s)
  }

  function placeholderFromIframe(f, s, ok) {
    var box = document.createElement('div')
    nativeSetAttr.call(box, 'data-cc-embed', '')
    nativeSetAttr.call(box, 'data-service', s.id)
    nativeSetAttr.call(box, 'data-state', s.enabled && ok ? 'blocked' : 'disabled')
    nativeSetAttr.call(box, 'data-src', f.getAttribute('data-cc-src') || '')
    if (f.getAttribute('width')) nativeSetAttr.call(box, 'data-width', f.getAttribute('width'))
    if (f.getAttribute('height')) nativeSetAttr.call(box, 'data-height', f.getAttribute('height'))
    if (f.className) box.className = f.className
    if (f.getAttribute('style')) box.setAttribute('style', f.getAttribute('style'))
    var w = parseInt(f.getAttribute('width'), 10), h = parseInt(f.getAttribute('height'), 10)
    if (w > 0 && h > 0) box.style.aspectRatio = w + '/' + h
    box.__ccFrame = f
    box.__ccLogged = true
    f.parentNode.replaceChild(box, f)
    renderPlaceholder(box, s)
    return box
  }

  // once: "load content" clicked (no consent), recorded for the check mode
  function loadBox(box, once) {
    var s = byId(box.getAttribute('data-service'))
    if (safeMode || !s || !s.enabled || !box.parentNode) return
    var url = normalise(box.getAttribute('data-src') || '')
    if (!validSource(s, url)) { disableBox(box, s); return }
    var f = box.__ccFrame || document.createElement('iframe')
    if (!box.__ccFrame) {
      if (box.getAttribute('data-title')) f.title = box.getAttribute('data-title')
      if (box.getAttribute('data-allow')) f.setAttribute('allow', box.getAttribute('data-allow'))
      if (box.hasAttribute('data-allowfullscreen')) f.setAttribute('allowfullscreen', '')
      // restore the authored size; without it the aspect-ratio style alone
      // stretches the frame to the full container width
      if (box.getAttribute('data-width')) f.setAttribute('width', box.getAttribute('data-width'))
      if (box.getAttribute('data-height')) f.setAttribute('height', box.getAttribute('data-height'))
      var cls = box.className.replace(/\bcc-embed\b/, '').trim()
      if (cls) f.className = cls
      if (box.getAttribute('style')) f.setAttribute('style', box.getAttribute('style'))
    }
    f.removeAttribute('data-cc-src')
    f.removeAttribute('data-cc-service')
    f.__ccAllow = allowFor(s, rewrite(s, url))
    if (once) logOnce(s.id, rewrite(s, url))
    f.src = rewrite(s, url)
    box.parentNode.replaceChild(f, box)
  }

  function loadAll(serviceId) {
    var boxes = document.querySelectorAll('[data-cc-embed][data-state="blocked"]')
    for (var i = 0; i < boxes.length; i++) if (boxes[i].getAttribute('data-service') === serviceId) loadBox(boxes[i])
  }

  function scan(root, how) {
    if (!root || root.nodeType !== 1) return
    var nodes = [root].concat(Array.prototype.slice.call(root.querySelectorAll('iframe,[data-cc-embed]')))
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i]
      if (n.hasAttribute('data-cc-embed')) {
        var sv = byId(n.getAttribute('data-service'))
        if (!sv) continue
        if (n.getAttribute('data-state') === 'disabled') renderPlaceholder(n, sv)
        else if (!validSource(sv, n.getAttribute('data-src') || '')) disableBox(n, sv)
        else if (accepted(sv)) loadBox(n)
        else renderPlaceholder(n, sv)
      } else if (n.tagName === 'IFRAME' && !n.__ccAllow && n.parentNode) {
        var url = normalise(n.getAttribute('data-cc-src') || n.getAttribute('src') || '')
        var s = serviceFor(url)
        if (!s) continue
        var ok = validSource(s, url)
        if (ok && accepted(s)) {
          var target = rewrite(s, url)
          if (n.hasAttribute('data-cc-src')) { n.removeAttribute('data-cc-src'); n.removeAttribute('data-cc-service'); n.__ccAllow = allowFor(s, target); desc.set.call(n, target) }
          else if (target !== url) { n.__ccAllow = allowFor(s, target); desc.set.call(n, target) } // e.g. youtube.com -> youtube-nocookie.com
          continue
        }
        if (!n.hasAttribute('data-cc-src')) { nativeSetAttr.call(n, 'data-cc-src', ok ? rewrite(s, url) : url); desc.set.call(n, 'about:blank'); logBlocked(s.id, url, how || 'observer') }
        placeholderFromIframe(n, s, ok)
      }
    }
  }

  new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) for (var j = 0; j < muts[i].addedNodes.length; j++) scan(muts[i].addedNodes[j], 'observer')
  }).observe(document.documentElement, { childList: true, subtree: true })

  document.addEventListener('click', function (e) {
    var t = e.target
    if (!t || !t.closest) return
    // Consent moment for the check mode: the library runs the services'
    // onAccept (which loads them) before onFirstConsent, so a first decision
    // is taken from the click on a decision button itself.
    if (scanCfg && consentAt === null) {
      var decide = t.closest('#cc-main [data-role="all"],#cc-main [data-role="necessary"],#cc-main [data-role="save"],[data-cc-always]')
      if (decide && !scanState().decided) markConsent()
    }
    var btn = t.closest('[data-cc-load],[data-cc-always]')
    var box = btn && btn.closest('[data-cc-embed]')
    if (box) {
      var s = byId(box.getAttribute('data-service'))
      if (safeMode || !s || !s.enabled) return
      if (btn.hasAttribute('data-cc-always') && libOk) {
        var prefs = CookieConsent.getUserPreferences()
        var list = ((prefs.acceptedServices || {})[s.category] || []).slice()
        if (list.indexOf(s.id) < 0) list.push(s.id)
        CookieConsent.acceptService(list, s.category)
        CookieConsent.hide()
        loadAll(s.id)
      } else {
        loadBox(box, true)
      }
      return
    }
    var a = t.closest(SETTINGS_HASHES.map(function (h) { return 'a[href$="' + h + '"]' }).join(','))
    if (a && libOk) { e.preventDefault(); CookieConsent.showPreferences() }
    else if (a) noSettings()
  }, true)

  // ---- banner ----
  function cookieMatchers(s) {
    return (s.cookies || []).filter(function (n) { return n.indexOf('localStorage') !== 0 }).map(function (n) {
      return { name: n.indexOf('*') >= 0 ? new RegExp('^' + n.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$') : n }
    })
  }

  function serviceDetails(s) {
    var P = T.prefs
    var cookies = s.cookies || []
    var countries = countryList(s)
    // self-hosted services have no vendor policy: the site's own one applies
    var privacy = s.provider.privacyUrl || cfg.privacyUrl
    return '<span class="cc-svc"><strong>' + esc(s.label) + '</strong><br>' +
      esc(P.provider) + ': ' + esc(loc(s.provider.name)) + (loc(s.provider.address) ? ', ' + esc(loc(s.provider.address)) : '') + '<br>' +
      esc(P.purpose) + ': ' + esc((s.purpose && (s.purpose[lang] || s.purpose.de)) || '') + '<br>' +
      esc(P.countries) + ': ' + esc(countries.length ? countries.join(', ') : P.none) + '<br>' +
      esc(P.cookies) + ': ' + esc(cookies.length ? cookies.join(', ') : P.none) +
      (privacy ? '<br><a href="' + esc(privacy) + '" target="_blank" rel="noopener">' + esc(P.privacyPolicy) + '</a>' : '') + '</span>'
  }

  function applyStyle() {
    var st = cfg.style || {}
    var root = document.documentElement.style
    if (document.body) root.setProperty('--cc-font-family', getComputedStyle(document.body).fontFamily)
    if (st.accent) { root.setProperty('--cc-btn-primary-bg', st.accent); root.setProperty('--cc-btn-primary-border-color', st.accent); root.setProperty('--cc-toggle-on-bg', st.accent) }
    if (st.text) { root.setProperty('--cc-primary-color', st.text); root.setProperty('--cc-secondary-color', st.text) }
    if (st.background) root.setProperty('--cc-bg', st.background)
    if (st.radius) { root.setProperty('--cc-modal-border-radius', st.radius); root.setProperty('--cc-btn-border-radius', st.radius) }
  }

  var activeServices = services.filter(function (s) { return s.enabled })

  // Settings were asked for but cannot be shown (script blocked or missing,
  // safe mode, banner off, no services): log it and show a small notice.
  function noSettings() {
    var reason = safeMode ? 'safe mode (publish error), no consent settings available'
      : !activeServices.length ? 'no active services, nothing to configure' : 'consent settings are not available'
    if (window.console && console.info) console.info('instatic.consent: ' + reason)
    try { showNotice(safeMode || !cfg.enabled ? 'safeMode' : !activeServices.length ? 'noServices' : 'unavailable') } catch (e) {}
  }

  var noticeEl = null, noticeTimer = 0
  function closeNotice() {
    clearTimeout(noticeTimer)
    document.removeEventListener('keydown', noticeKey, true)
    if (noticeEl && noticeEl.parentNode) noticeEl.parentNode.removeChild(noticeEl)
    noticeEl = null
  }
  function noticeKey(e) { if (e.key === 'Escape' || e.key === 'Esc') closeNotice() }
  function showNotice(kind) {
    if (!document.body) return
    closeNotice()
    var N = (cfg.notices && (cfg.notices[lang] || cfg.notices.de)) || FALLBACK_NOTICES[lang] || FALLBACK_NOTICES.de
    var F = FALLBACK_NOTICES[lang] || FALLBACK_NOTICES.de
    var text = N[kind] || F[kind] || F.safeMode
    applyStyle()
    var box = document.createElement('div')
    box.className = 'cc-notice'
    box.setAttribute('role', 'status')
    box.setAttribute('aria-live', 'polite')
    var p = document.createElement('p')
    p.className = 'cc-notice__text'
    var btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'cc-notice__btn'
    btn.textContent = N.close || F.close
    btn.addEventListener('click', closeNotice)
    box.appendChild(p)
    box.appendChild(btn)
    document.body.appendChild(box)
    noticeEl = box
    // text is set after insertion so the live region announces it
    setTimeout(function () { p.textContent = text }, 30)
    document.addEventListener('keydown', noticeKey, true)
    noticeTimer = setTimeout(closeNotice, 12000)
  }

  // Direct link to the settings, e.g. /page#cookie-einstellungen.
  function openFromHash() {
    if (SETTINGS_HASHES.indexOf(location.hash) < 0) return
    if (libOk) CookieConsent.showPreferences()
    else noSettings()
  }

  // The banner is focused when it opens (aria-modal requires it), without
  // scrolling the page. On close, focus goes back to where it was (or to the
  // document), never stays on the hidden dialog.
  var focusBefore = null
  function modalName(p) { return p && typeof p === 'object' ? p.modalName : p }
  function focusBanner(p) {
    if (modalName(p) !== 'consentModal') return
    var a = document.activeElement
    focusBefore = a && a !== document.body && !a.closest('#cc-main') ? a : null
    var tries = 0
    // the dialog becomes focusable only once its show transition has started
    ;(function attempt() {
      var d = document.querySelector('#cc-main .cm')
      if (!d || d.contains(document.activeElement)) return
      if (!d.hasAttribute('tabindex')) nativeSetAttr.call(d, 'tabindex', '-1')
      try { d.focus({ preventScroll: true }) } catch (e) { d.focus() }
      if (!d.contains(document.activeElement) && tries++ < 20) setTimeout(attempt, 25)
    })()
  }
  function releaseBanner(p) {
    if (modalName(p) !== 'consentModal') return
    var d = document.querySelector('#cc-main .cm')
    var a = document.activeElement
    if (!d || !a || !d.contains(a)) return
    if (focusBefore && focusBefore.isConnected) { try { focusBefore.focus({ preventScroll: true }) } catch (e) { focusBefore.focus() } }
    if (d.contains(document.activeElement)) document.activeElement.blur()
    focusBefore = null
  }

  function serviceItem(s) {
    var purpose = (s.purpose && (s.purpose[lang] || s.purpose.de)) || ''
    // English purposes are catalog sentence-case; inside the sentence they read lower-case
    if (lang === 'en' && /^[A-Z][a-z]/.test(purpose)) purpose = purpose.charAt(0).toLowerCase() + purpose.slice(1)
    var tpl = purpose && T.banner.serviceItem ? T.banner.serviceItem : '{label} ({provider})'
    return fill(tpl, { label: s.label, provider: loc(s.provider.name), purpose: purpose })
  }

  // Server placeholders present when the page has been parsed (those the
  // guard created itself are already in the log).
  function logStatic() {
    if (!scanCfg) return
    var boxes = document.querySelectorAll('[data-cc-embed][data-state="blocked"],[data-cc-embed][data-state="disabled"]')
    for (var i = 0; i < boxes.length; i++) {
      if (boxes[i].__ccLogged) continue
      boxes[i].__ccLogged = true
      logBlocked(boxes[i].getAttribute('data-service'), boxes[i].getAttribute('data-src') || '', 'static')
    }
  }

  // Loads consent-scan.js once, after DOMContentLoaded; a missing file only
  // fails that request.
  var scanLoaded = false, domReady = false, scanWanted = false
  function loadScan() {
    if (!scanCfg || scanLoaded || !scanCfg.src) return
    if (!domReady) { scanWanted = true; return }
    scanLoaded = true
    // only a script from the page's own origin is injected
    var sameOrigin = false
    try { sameOrigin = new URL(String(scanCfg.src), location.href).origin === location.origin } catch (e) {}
    if (!sameOrigin) { if (window.console && console.info) console.info('instatic.consent: check mode script not loaded (not from this origin)'); return }
    var el = document.createElement('script')
    el.src = String(scanCfg.src)
    el.async = true
    el.onerror = function () { if (window.console && console.info) console.info('instatic.consent: check mode script not available') }
    ;(document.head || document.documentElement).appendChild(el)
  }

  // configured category titles of the current language (plain text), for the
  // check mode; empty when the texts do not carry them
  function categoryTitles() {
    var out = {}
    var cats = T && T.prefs && T.prefs.categories
    if (cats && typeof cats === 'object') {
      for (var k in cats) {
        if (Object.prototype.hasOwnProperty.call(cats, k) && cats[k] && typeof cats[k].title === 'string' && cats[k].title) out[k] = cats[k].title
      }
    }
    return out
  }

  function scanState() {
    var c = readCookie()
    var ok = !!(c && Array.isArray(c.categories))
    return {
      decided: ok && c.revision === cfg.revision,
      revision: c && c.revision != null ? c.revision : null,
      categories: ok ? c.categories.slice() : [],
      services: c && c.services && typeof c.services === 'object' ? c.services : {},
      date: (c && (c.lastConsentTimestamp || c.consentTimestamp)) || null,
    }
  }

  function start() {
    domReady = true
    try { logStatic() } catch (e) {}
    // Safe mode, banner switched off or no active service: no dialog, only
    // placeholders (an empty banner would ask for consent to nothing).
    if (safeMode || !cfg.enabled || !activeServices.length || !window.CookieConsent || typeof CookieConsent.run !== 'function') {
      scan(document.body)
      openFromHash()
      return
    }
    var active = activeServices
    var cats = { necessary: { enabled: true, readOnly: true } }
    var sections = [{ description: esc(T.prefs.intro) }, { title: esc(T.prefs.necessaryTitle), description: esc(T.prefs.necessaryText), linkedCategory: 'necessary' }]
    ;['media', 'statistics', 'marketing'].forEach(function (cat) {
      var list = active.filter(function (s) { return s.category === cat })
      if (!list.length) return
      var svc = {}
      list.forEach(function (s) { svc[s.id] = { label: esc(s.label), onAccept: function () { loadAll(s.id) } } })
      cats[cat] = { services: svc, autoClear: { cookies: [].concat.apply([], list.map(cookieMatchers)) } }
      sections.push({ title: esc(T.prefs.categories[cat].title), description: esc(T.prefs.categories[cat].text) + list.map(serviceDetails).join(''), linkedCategory: cat })
    })
    var privacyLink = cfg.privacyUrl ? '<a href="' + esc(cfg.privacyUrl) + '">' + esc(T.banner.privacy) + '</a>' : ''
    var links = []
    if (privacyLink) links.push(privacyLink)
    if (cfg.imprintUrl) links.push('<a href="' + esc(cfg.imprintUrl) + '">' + esc(T.banner.imprint) + '</a>')
    if (privacyLink) sections.push({ title: esc(T.prefs.moreTitle), description: fill(esc(T.prefs.moreText), { privacy: privacyLink }) })

    // service-dependent parts come from the publish step (plain text)
    var parts = (cfg.bannerParts && cfg.bannerParts[lang]) || {}
    var moreHash = lang === 'en' ? '#cookie-settings' : '#cookie-einstellungen'
    var bannerText = fill(esc(T.banner.description), {
      services: esc(active.map(serviceItem).join('; ')),
      servicesShort: esc(parts.servicesShort || ''),
      providers: esc(parts.providers || ''),
      countries: esc(parts.countries || ''),
      profiling: esc(parts.profiling || ''),
      // handled by the settings-link click handler above
      more: parts.moreLabel ? '<a href="' + moreHash + '" class="cc-more" aria-haspopup="dialog">' + esc(parts.moreLabel) + '</a>' : '',
    })
    var layout = LAYOUTS[cfg.layout] || LAYOUTS.wide

    applyStyle()

    var translation = {}
    translation[lang] = {
      consentModal: {
        title: (cfg.showIcon !== false ? COOKIE_ICON : '') + esc(T.banner.title), description: bannerText,
        acceptAllBtn: esc(T.banner.acceptAll), acceptNecessaryBtn: esc(T.banner.rejectAll), showPreferencesBtn: esc(T.banner.settings),
        footer: links.join(''),
      },
      preferencesModal: {
        title: esc(T.prefs.title), acceptAllBtn: esc(T.prefs.acceptAll), acceptNecessaryBtn: esc(T.prefs.rejectAll),
        savePreferencesBtn: esc(T.prefs.save), closeIconLabel: String(T.prefs.close), serviceCounterLabel: String(T.prefs.serviceCounter),
        sections: sections,
      },
    }

    primeConsentId()
    libStarted = true
    var pending
    // run() reads the cookie synchronously before its first await, so the
    // fixed id can be removed again right after the call returns; finally
    // makes sure that happens (and the page is scanned) even if run() throws.
    try {
      pending = CookieConsent.run({
        revision: cfg.revision, mode: 'opt-in', autoShow: true, autoClearCookies: true, manageScriptTags: true,
        // The library hides itself from navigator.webdriver/bot user agents;
        // blocking does not depend on it, so keep the dialog for everyone.
        hideFromBots: false,
        cookie: { name: COOKIE, expiresAfterDays: cfg.validityDays, sameSite: 'Lax' },
        guiOptions: {
          consentModal: { layout: layout.layout, position: layout.position, equalWeightButtons: true, flipButtons: false },
          preferencesModal: { layout: 'box', equalWeightButtons: true, flipButtons: false },
        },
        categories: cats,
        language: { default: lang, translations: translation },
        onModalShow: focusBanner,
        onModalHide: releaseBanner,
        onFirstConsent: function () { markConsent() },
        onConsent: function () { stripConsentId(); scan(document.body) },
        onChange: function (p) {
          markConsent()
          stripConsentId()
          var revoked = false
          var changed = (p && p.changedServices) || {}
          Object.keys(changed).forEach(function (cat) {
            (changed[cat] || []).forEach(function (id) { if (!CookieConsent.acceptedService(id, cat)) revoked = true })
          })
          if (revoked || ((p && p.changedCategories) || []).some(function (c) { return !CookieConsent.acceptedCategory(c) })) location.reload()
          else scan(document.body)
        },
      })
    } catch (e) {
      libStarted = false
    } finally {
      stripConsentId()
      scan(document.body)
    }
    if (pending && typeof pending.then === 'function') {
      pending.then(function (r) { if (r !== false) { libOk = true; rerenderPlaceholders(); openFromHash() } }, function () {})
    }
  }

  // Placeholders drawn before the library was ready get their
  // "always allow" button now.
  function rerenderPlaceholders() {
    var boxes = document.querySelectorAll('[data-cc-embed][data-state="blocked"]')
    for (var i = 0; i < boxes.length; i++) {
      var s = byId(boxes[i].getAttribute('data-service'))
      if (s && boxes[i].__ccRendered) { boxes[i].__ccRendered = false; renderPlaceholder(boxes[i], s) }
    }
  }

  window.InstaticConsent = { version: VERSION, showPreferences: function () { if (libOk) CookieConsent.showPreferences(); else noSettings() }, scan: loadScan }
  if (scanCfg) {
    window.InstaticConsent._scan = {
      services: services,
      own: scanCfg.own || [], allow: scanCfg.allow || [], hints: scanCfg.hints || [],
      blocked: blockedLog,
      allowedOnce: allowedOnceLog,
      consentAt: function () { return consentAt },
      state: scanState,
      accepted: function (id) { return accepted(byId(id)) },
      safeMode: safeMode, revision: cfg.revision,
      categoryTitles: categoryTitles(),
    }
    if (location.hash === SCAN_HASH) scanWanted = true
    window.addEventListener('hashchange', function () { if (location.hash === SCAN_HASH) loadScan() })
  }
  function ready() {
    try { start() } finally { if (scanWanted) { scanWanted = false; loadScan() } }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready()
})()
