(function () {
  var s = document.currentScript
  var url = s && s.getAttribute('data-param-url')
  var site = s && s.getAttribute('data-param-site-id')
  if (!url || !site) return
  var _paq = window._paq = window._paq || []
  _paq.push(['trackPageView'])
  _paq.push(['enableLinkTracking'])
  _paq.push(['setTrackerUrl', url + 'matomo.php'])
  _paq.push(['setSiteId', site])
  var t = document.createElement('script')
  t.async = true
  t.src = url + 'matomo.js'
  document.head.appendChild(t)
})()
