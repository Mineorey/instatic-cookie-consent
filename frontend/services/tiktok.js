(function () {
  var s = document.currentScript
  var id = s && s.getAttribute('data-param-pixel-id')
  if (!id) return
  window.TiktokAnalyticsObject = 'ttq'
  var ttq = window.ttq = window.ttq || []
  ttq.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie', 'holdConsent', 'revokeConsent', 'grantConsent']
  ttq.setAndDefer = function (o, m) { o[m] = function () { o.push([m].concat(Array.prototype.slice.call(arguments, 0))) } }
  for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i])
  ttq.instance = function (n) {
    var inst = (ttq._i && ttq._i[n]) || []
    for (var k = 0; k < ttq.methods.length; k++) ttq.setAndDefer(inst, ttq.methods[k])
    return inst
  }
  ttq.load = function (n, opts) {
    var url = 'https://analytics.tiktok.com/i18n/pixel/events.js'
    ttq._i = ttq._i || {}; ttq._i[n] = []; ttq._i[n]._u = url
    ttq._t = ttq._t || {}; ttq._t[n] = +new Date()
    ttq._o = ttq._o || {}; ttq._o[n] = opts || {}
    var t = document.createElement('script')
    t.async = true
    t.src = url + '?sdkid=' + encodeURIComponent(n) + '&lib=ttq'
    document.head.appendChild(t)
  }
  ttq.load(id)
  ttq.page()
})()
