(function () {
  var s = document.currentScript
  var id = s && s.getAttribute('data-param-container-id')
  if (!id) return
  window.dataLayer = window.dataLayer || []
  window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' })
  var t = document.createElement('script')
  t.async = true
  t.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(id)
  document.head.appendChild(t)
})()
