// (1.18 3D) Blokbotsing / Block Clash: `botsing.html` plays a battle against Robot Rikus (game.js). If a phone can't show
// it (no WebGL, an old browser), the loading screen says so kindly and offers the way back to Stapel.
// (the Android app's back button while the battle loads, or on the kind "won't load" card: one step back to Stapel,
// never out of the app; the battle takes the button over once it runs, as the castle does)
addEventListener('stapel:back', (e) => {
  if (window.__botsingBack) return;
  e.preventDefault();
  if (history.length > 1 && document.referrer && new URL(document.referrer).origin === location.origin) history.back();
  else location.href = 'index.html';
});
import('./game.js').catch(async (e) => {
  console.error(e);
  let t = { failed: 'Blokbotsing wil nie op hierdie toestel laai nie.', retry: 'PROBEER WEER', back: '‹ Stapel' };
  try {
    const { LANG } = await import('./text.js');
    if (LANG === 'en') t = { failed: 'Block Clash won’t load on this device.', retry: 'TRY AGAIN', back: '‹ Stapel' };
  } catch { /* Afrikaans */ }
  const el = document.getElementById('k-load');
  if (el) el.innerHTML = `<div class="kl-fail"><p>${t.failed}</p><a href="">${t.retry}</a><a href="index.html">${t.back}</a></div>`;
});
