(function () {
  var s = document.currentScript
  var id = s && s.getAttribute('data-param-measurement-id')
  if (!id) return
  window.dataLayer = window.dataLayer || []
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments) }
  window.gtag('js', new Date())
  // no Google Signals, no ad personalisation: the CSP does not open the hosts they need
  window.gtag('config', id, { allow_google_signals: false, allow_ad_personalization_signals: false })
  var t = document.createElement('script')
  t.async = true
  t.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id)
  document.head.appendChild(t)
})()
