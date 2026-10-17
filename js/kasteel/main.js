// (1.17 3D) Die Kasteelreeks: `kasteel.html` plays a siege (siege.js; `?teen=my` attacks a copy of your own castle);
// `?plan` is your castle and its defence plan (planner.js); `?shot=kasteel|beleg|visier` draws the style pictures. If a
// phone can't show it (no WebGL, an old browser), the loading screen says so kindly and offers the way back to Stapel.
const q = new URLSearchParams(location.search);
// (the Android app's back button while the castle loads, a friend's castle is fetched, or the kind "won't load" card
// shows: one step back to Stapel, never out of the app. The siege and the planner take the button over once they run.)
const home = () => {
  if (history.length > 1 && document.referrer && new URL(document.referrer).origin === location.origin) history.back();
  else location.href = 'index.html';
};
addEventListener('stapel:back', (e) => {
  if (window.__kasteelBack) return;
  e.preventDefault();
  home();
});
const page = q.has('shot') ? import('./shots.js') : q.has('plan') ? import('./planner.js') : import('./siege.js');
page.catch(async (e) => {
  console.error(e);
  let t = { failed: 'Die kasteel wil nie op hierdie toestel laai nie.', retry: 'PROBEER WEER', back: '‹ Stapel' };
  try { t = (await import('./text.js')).T; } catch { /* Afrikaans */ }
  const el = document.getElementById('k-load');
  if (el) el.innerHTML = `<div class="kl-fail"><p>${e?.message === 'castle' ? t.noCastle || t.failed : t.failed}</p><a href="">${t.retry}</a><a href="index.html">${t.back}</a></div>`;
});
