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
  var SITE = 'https://stapelspel.pages.dev/';

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

  // Challenge links (AndroidManifest: App Links): a friend's room (?kamer=), run (?teen=) or daily height
  // (?klop=). One that started the app reloads the game with its query (read at start), once: Android
  // hands the same link again when the app comes back from Recents, so a link opened in the last
  // LAUNCH_ONCE_MS is let go. One that comes while the game runs is handed over as 'stapel:link' (no
  // reload: a tower in progress stays); the starting link, which Capacitor also hands over, isn't.
  var LAUNCH_ONCE_MS = 12 * 60 * 60 * 1000;
  function linkQuery(url) {
    try {
      var q = new URL(url).search;
      return /[?&](kamer|teen|klop)=/.test(q) ? q : '';
    } catch (err) {
      return '';
    }
  }
  var launchUrl = null;
  var launched = cap.nativePromise('App', 'getLaunchUrl', {}).then(function (r) {
    launchUrl = (r && r.url) || null;
    return launchUrl;
  }, function () { return null; });
  if (!/[?&](kamer|teen|klop)=/.test(location.search)) {
    launched.then(function (url) {
      var q = url ? linkQuery(url) : '';
      if (!q) return;
      var seen = null;
      try { seen = JSON.parse(localStorage.getItem('stapel.launch') || 'null'); } catch (err) { seen = null; }
      if (seen && seen.url === url && Date.now() - seen.at < LAUNCH_ONCE_MS) return;
      try { localStorage.setItem('stapel.launch', JSON.stringify({ url: url, at: Date.now() })); } catch (err) { /* private */ }
      location.replace(location.pathname + q);
    });
  }
  cap.addListener('App', 'appUrlOpen', function (e) {
    var url = e && e.url;
    if (!url || !linkQuery(url)) return;
    launched.then(function () {
      if (url === launchUrl) return;   // the starting link: the reload above has it
      window.dispatchEvent(new CustomEvent('stapel:link', { detail: url }));
    });
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
