document.getElementById('dyn').addEventListener('click', function () {
  var f = document.createElement('iframe')
  f.src = this.getAttribute('data-yt')
  f.title = 'Dynamisch'
  document.getElementById('dyn-target').appendChild(f)
})
document.getElementById('inner').addEventListener('click', function () {
  document.getElementById('inner-target').innerHTML = '<iframe src="https://www.youtube.com/embed/ghi"></iframe>'
})

// Insert, then keep the main thread busy: a guard that only reacts in a
// MutationObserver callback would let the request escape meanwhile.
function busy(ms) { var t = Date.now(); while (Date.now() - t < ms) { /* spin */ } }
document.getElementById('busy-inner').addEventListener('click', function () {
  document.getElementById('busy-inner-target').innerHTML = '<iframe src="https://www.youtube.com/embed/b1"></iframe>'
  busy(50)
})
document.getElementById('busy-adjacent').addEventListener('click', function () {
  document.getElementById('busy-adjacent-target').insertAdjacentHTML('beforeend', '<iframe src="https://www.youtube.com/embed/b2"></iframe>')
  busy(50)
})
document.getElementById('busy-ns').addEventListener('click', function () {
  var f = document.createElement('iframe')
  document.getElementById('busy-ns-target').appendChild(f)
  f.setAttributeNS(null, 'src', 'https://www.youtube.com/embed/b3')
  busy(50)
})
document.getElementById('busy-outer').addEventListener('click', function () {
  document.getElementById('outer-slot').outerHTML = '<iframe src="https://www.youtube.com/embed/b4"></iframe>'
  busy(50)
})
