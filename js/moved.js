// Stapel moved to https://stapelspel.pages.dev/ (its old address carried the owner's name). Every page
// loads this first, as a plain script (the pages' security policy allows only the site's own files):
//  - on the old address (anandregroenewald.github.io/Toring/...): go to the same page at the new one, and
//    hand over the player's progress in the link's # (the browser keeps it per address, so it would
//    otherwise stay behind);
//  - on the new address: keep what was handed over wherever nothing is kept yet, then tidy the address.
// Anywhere else (the app, a test on this computer) it does nothing.
(function () {
  var OLD_HOST = 'anandregroenewald.github.io';
  var NEW_SITE = 'https://stapelspel.pages.dev/';
  var KEY_RE = /^stapel\./;
  var SKIP = { 'stapel.sponsors.v1': 1 };   // a cache: the new address fetches its own
  try {
    if (location.hostname === OLD_HOST) {
      var data = {};
      var n = 0;
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (KEY_RE.test(k) && !SKIP[k]) {
            data[k] = localStorage.getItem(k);
            n++;
          }
        }
      } catch (e) {
        n = 0;
      }
      var path = location.pathname.replace(/^\/Toring\/?/, '');
      var hash = n ? '#move=' + encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(data))))) : '';
      location.replace(NEW_SITE + path + location.search + hash);
      return;
    }
    var m = /^#move=([^&]+)/.exec(location.hash);
    if (!m) return;
    // only progress the old address sent (a made-up link can't fill a new player's game)
    if (document.referrer.indexOf('https://' + OLD_HOST + '/') === 0) {
      var got = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1])))));
      for (var key in got) {
        if (Object.prototype.hasOwnProperty.call(got, key) && KEY_RE.test(key) && !SKIP[key]
          && typeof got[key] === 'string' && localStorage.getItem(key) === null) {
          localStorage.setItem(key, got[key]);
        }
      }
    }
    history.replaceState(history.state, '', location.pathname + location.search);
  } catch (e) {
    // no storage, or a broken hand-over: the game starts fresh here, as it would have anyway
  }
})();
