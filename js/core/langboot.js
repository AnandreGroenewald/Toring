// The first thing main.js imports: sets the language before any other module reads a string (some
// keep text from when they load). The choice lives in its own key, `<store key>.lang`, like the
// wallet, so a tab still on an older version can never drop it (js/core/storage.js getLang/setLang).
// `?lang=en` or `?lang=af` previews a language for one visit without saving it.

import { STORAGE_KEY } from '../config.js';
import { S } from './strings.js';
import { setLanguage, isLang } from './i18n.js';

function choose() {
  let saved = null;
  let preview = null;
  try {
    const q = new URLSearchParams(location.search);
    preview = isLang(q.get('lang')) ? q.get('lang') : null;
    const key = `${q.get('debug') === '1' ? `${STORAGE_KEY}.debug` : STORAGE_KEY}.lang`;
    const v = localStorage.getItem(key);
    saved = isLang(v) ? v : null;
  } catch {
    // no storage (private mode, sandbox): Afrikaans, and the picker asks
  }
  return { saved, preview };
}

const { saved, preview } = choose();
/** The language saved by the player, or null when nobody has chosen yet (main.js then asks once). */
export const SAVED_LANG = saved;
/** A one-visit preview from the address (`?lang=en`), or null. */
export const PREVIEW_LANG = preview;
setLanguage(preview || saved || 'af');

// the page's own words, shown before the game draws
try {
  const splash = document.querySelector('.splash-msg');
  if (splash) splash.textContent = S.loading;
  const rotate = document.querySelector('#rotate p');
  if (rotate) rotate.textContent = S.rotate;
  document.title = `${S.title} — ${S.tagline}`;
} catch {
  // no document (tests)
}
