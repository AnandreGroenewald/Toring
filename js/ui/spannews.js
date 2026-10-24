// (1.20) Ons dorp's news, one line each (the town's panel and the menu's button): who built, repaired, rescued, joined
// or left; whose bombs hit you, what yours did; Saturday's place.
import { S } from '../core/strings.js';
import { fmtM } from '../core/format.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** One news item as words; `html`: names escaped (for innerHTML), else plain text. '' for a kind it doesn't know. */
export function spanNewsLine(n, { html = true } = {}) {
  const q = html ? esc : String;
  const who = q(n.who || '');
  if (n.kind === 'built') return S.nwBuilt(who, fmtM(n.gain || 0));
  if (n.kind === 'repaired') return S.nwRepaired(who, fmtM(n.gain || 0));
  if (n.kind === 'bombed') return S.nwBombed(who, fmtM(n.lost || 0), n.people | 0);
  if (n.kind === 'hit') return n.lost > 0 ? S.nwHit(who, q(n.on || ''), fmtM(n.lost)) : S.nwCracked(who, q(n.on || ''));
  if (n.kind === 'rescued') return S.nwRescued(who, n.n | 0);
  if (n.kind === 'joined') return S.nwJoined(who);
  if (n.kind === 'left' || n.kind === 'removed') return S.nwLeft(who);
  if (n.kind === 'saturday') return S.nwSaturday(n.place, n.of);
  return '';
}
