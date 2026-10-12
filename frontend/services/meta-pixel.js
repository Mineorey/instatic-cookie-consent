(function () {
  var s = document.currentScript
  var id = s && s.getAttribute('data-param-pixel-id')
  if (!id || window.fbq) return
  var n = window.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments) }
  if (!window._fbq) window._fbq = n
  n.push = n; n.loaded = true; n.version = '2.0'; n.queue = []
  var t = document.createElement('script')
  t.async = true
  t.src = 'https://connect.facebook.net/en_US/fbevents.js'
  document.head.appendChild(t)
  n('init', id)
  n('track', 'PageView')
})()
