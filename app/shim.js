// Stapel as an Android app (Capacitor). build-www.mjs loads this before the game. It talks to the
// native side through Capacitor's bridge (window.Capacitor) directly: the game isn't bundled.
// - The Deel button gets Android's share sheet (the WebView has no navigator.share).
// - The back button takes one step back in the game (js/ui/dom.js goBack) and closes the app on
//   the start screen.
// - The sponsor, privacy and terms pages open on the website, in the browser (always the current text).
// - The daily reminder (local notifications) and challenge links that open in the app (1.10).
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

  // The daily reminder (js/main.js plans it): Android notifications at a time the player chose. Never
  // exact alarms (no special permission), so a reminder may come a few minutes late.
  var LN = 'LocalNotifications';
  window.stapelApp = window.stapelApp || {};
  window.stapelApp.reminders = {
    /** 'granted', 'denied' or 'prompt' */
    permission: function () {
      return cap.nativePromise(LN, 'checkPermissions', {}).then(function (r) { return (r && r.display) || 'prompt'; });
    },
    ask: function () {
      return cap.nativePromise(LN, 'requestPermissions', {}).then(function (r) { return !!r && r.display === 'granted'; });
    },
    /** Replace every planned reminder with `list`: [{ id, at (ms), title, body }]. */
    set: function (list) {
      return cap.nativePromise(LN, 'getPending', {}).then(function (p) {
        var old = ((p && p.notifications) || []).map(function (n) { return { id: n.id }; });
        return old.length ? cap.nativePromise(LN, 'cancel', { notifications: old }) : null;
      }).then(function () {
        if (!list || !list.length) return null;
        return cap.nativePromise(LN, 'schedule', {
          notifications: list.map(function (n) {
            return {
              id: n.id, title: n.title, body: n.body, smallIcon: 'ic_stat_stapel',
              schedule: { at: new Date(n.at).toISOString(), allowWhileIdle: true },
              isExactNotification: false,
            };
          }),
        });
      });
    },
  };

  // Challenge links (AndroidManifest: App Links). One that started the app reloads the game with its
  // ?kamer= / ?teen= (read at start, once per visit); one that comes while the game runs is handed
  // over as 'stapel:link' (no reload: a tower in progress stays).
  function linkQuery(url) {
    try {
      var q = new URL(url).search;
      return /[?&](kamer|teen)=/.test(q) ? q : '';
    } catch (err) {
      return '';
    }
  }
  if (!/[?&](kamer|teen)=/.test(location.search)) {
    cap.nativePromise('App', 'getLaunchUrl', {}).then(function (r) {
      var url = (r && r.url) || '';
      var q = linkQuery(url);
      var seen = null;
      try { seen = sessionStorage.getItem('stapel.launch'); } catch (err) { seen = null; }
      if (!q || seen === url) return;
      try { sessionStorage.setItem('stapel.launch', url); } catch (err) { /* private */ }
      location.replace(location.pathname + q);
    }, function () {});
  }
  cap.addListener('App', 'appUrlOpen', function (e) {
    if (e && e.url && linkQuery(e.url)) window.dispatchEvent(new CustomEvent('stapel:link', { detail: e.url }));
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
