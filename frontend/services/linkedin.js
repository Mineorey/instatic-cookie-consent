(function () {
  var s = document.currentScript
  var id = s && s.getAttribute('data-param-partner-id')
  if (!id) return
  window._linkedin_partner_id = id
  window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || []
  window._linkedin_data_partner_ids.push(id)
  if (!window.lintrk) {
    window.lintrk = function (a, b) { window.lintrk.q.push([a, b]) }
    window.lintrk.q = []
  }
  var t = document.createElement('script')
  t.async = true
  t.src = 'https://snap.licdn.com/li.lms-analytics/insight.min.js'
  document.head.appendChild(t)
})()
