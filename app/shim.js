// Stapel as an Android app (Capacitor). build-www.mjs loads this before the game. It talks to the
// native side through Capacitor's bridge (window.Capacitor) directly: the game isn't bundled.
// - The Deel button gets Android's share sheet (the WebView has no navigator.share).
// - The back button takes one step back in the game (js/ui/dom.js goBack) and closes the app on
//   the start screen.
// - The sponsor, privacy and terms pages open on the website, in the browser (always the current text).
(function () {
  var cap = window.Capacitor;
  if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return;
  var SITE = 'https://anandregroenewald.github.io/Toring/';

  if (typeof navigator.share !== 'function') {
    navigator.share = function (data) {
      data = data || {};
      return cap.nativePromise('Share', 'share', { title: data.title, text: data.text, url: data.url }).then(
        function () {},
        function (err) {
          var e = new Error((err && err.message) || 'Share failed');
          e.name = /cancel/i.test(e.message) ? 'AbortError' : 'NotAllowedError';
          throw e;
        });
    };
  }

  cap.addListener('App', 'backButton', function () {
    var ev = new CustomEvent('stapel:back', { cancelable: true });
    window.dispatchEvent(ev);
    if (!ev.defaultPrevented) cap.nativePromise('App', 'exitApp', {});
  });

  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    var href = a ? a.getAttribute('href') || '' : '';
    if (/^(adverteer|privaatheid|terme)\.html/.test(href)) {
      e.preventDefault();
      window.location.href = SITE + href;
    }
  }, true);
})();
