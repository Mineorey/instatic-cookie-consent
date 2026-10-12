(function () {
  var s = document.currentScript
  var id = s && s.getAttribute('data-param-conversion-id')
  if (!id) return
  window.dataLayer = window.dataLayer || []
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments) }
  window.gtag('js', new Date())
  window.gtag('config', id)
  var t = document.createElement('script')
  t.async = true
  t.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id)
  document.head.appendChild(t)
})()
