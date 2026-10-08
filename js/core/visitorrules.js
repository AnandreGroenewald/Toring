// What visitors may do to a tower and how a visit is remembered, as pure rules (unit
// tested). js/game/visitors.js draws the visitors and GameScene applies these rules to
// the physics. Pure: importable in node.

import { VISITOR, VISITOR_TYPES, RATING } from '../config.js';
import { S, VISITOR_INFO, CAUGHT_EMOJI, SHIELD_EMOJI } from './strings.js';

/** A block a visitor may touch: on the tower and able to move (never cement, never one still in the air). */
export const movable = (b) => !!b && !b.destroyed && (b.state === 'landed' || b.state === 'settled');

/** The top `n` movable blocks, highest first (the monkey's shove). */
export function topMovable(blocks, n) {
  const out = [];
  for (const b of blocks || []) if (movable(b)) out.push(b);
  out.sort((a, b) => a.top - b.top);
  return out.slice(0, Math.max(0, Math.floor(n) || 0));
}

/** Skelm Sakkie's loot: the top movable blocks, at most VISITOR.thiefMax (4) of them. */
export function thiefLoot(blocks, max = VISITOR.thiefMax) {
  return topMovable(blocks, Math.min(Math.floor(max) || 0, VISITOR.thiefMax));
}

/**
 * Does a visitor take the blame for this lost block (so it costs no heart, the combo is
 * kept and its grid cell stays as it was)? Yes for the clown's gift, for a block that was
 * in the air when a visitor changed the tower under it (`shielded`), for a block the monkey
 * knocked loose that hasn't come to rest since (sim ms before its `knockedUntil`), and for
 * any tower block lost while a visitor's push is still settling (sim ms before `graceUntil`).
 */
export function visitorFree(block, { now = 0, graceUntil = -Infinity, wasFalling = false } = {}) {
  if (!block) return false;
  if (block.gift || block.shielded || now < (block.knockedUntil || 0)) return true;
  return !wasFalling && now < graceUntil;
}

/**
 * The result grid: one cell per dropped block (null/undefined = still in the air, left
 * out) with a 🎁 cell for each of the clown's gifts where it joined the tower. `gifts`
 * holds, per gift, how many blocks had been dropped when it arrived.
 */
export function gridWithGifts(cells, gifts = []) {
  const list = [...(gifts || [])].filter(Number.isFinite).sort((a, b) => a - b);
  let out = '';
  let g = 0;
  for (let k = 0; k < cells.length; k++) {
    while (g < list.length && list[g] <= k) {
      out += RATING.GIFT;
      g++;
    }
    if (cells[k]) out += cells[k];
  }
  for (; g < list.length; g++) out += RATING.GIFT;
  return out;
}

// How a visit ended: 'came' = the tower ended while the visitor was still there.
const OUTCOMES = {
  monkey: ['came', 'shooed', 'shoved', 'blocked'],   // n = blocks it knocked into the sea; blocked = the player's Skild
  clown: ['came', 'gift'],                // n = blocks he brought
  thief: ['came', 'caught', 'stole', 'blocked'],     // n = blocks he took
};
const MAX_VISITS = 40;

/** A stored visit record cleaned up, or null. */
export function cleanVisit(v) {
  if (!v || typeof v !== 'object' || !VISITOR_TYPES.includes(v.type)) return null;
  const outcome = OUTCOMES[v.type].includes(v.outcome) ? v.outcome : 'came';
  const n = Number.isFinite(v.n) ? Math.min(99, Math.max(0, Math.round(v.n))) : 0;
  return { type: v.type, outcome, n };
}

export function cleanVisits(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const v of list) {
    const c = cleanVisit(v);
    if (c) out.push(c);
    if (out.length >= MAX_VISITS) break;
  }
  return out;
}

/** "🐒🦹✋🤡": the visitors in order of arrival, ✋ after a thief the player caught. */
export function visitorEmoji(visits) {
  let out = '';
  for (const v of cleanVisits(visits)) {
    out += VISITOR_INFO[v.type].emoji;
    if (v.type === 'thief' && v.outcome === 'caught') out += CAUGHT_EMOJI;
    if (v.outcome === 'blocked') out += SHIELD_EMOJI;
  }
  return out;
}

/** One line for the results card about the most memorable visit (thief, then monkey, then clown), or ''. */
export function visitorResultLine(visits) {
  const list = cleanVisits(visits);
  const thief = list.find((v) => v.type === 'thief' && v.outcome !== 'came');
  if (thief) {
    if (thief.outcome === 'caught') return S.resThiefCaught;
    if (thief.outcome === 'blocked') return S.resThiefBlocked;
    return thief.n > 0 ? S.resThiefStole(thief.n) : S.resThiefEmpty;
  }
  const monkeys = list.filter((v) => v.type === 'monkey');
  const knocked = monkeys.reduce((sum, v) => sum + (v.outcome === 'shoved' ? v.n : 0), 0);
  if (knocked > 0) return S.resMonkeyKnocked(knocked);
  if (monkeys.some((v) => v.outcome === 'shoved')) return S.resMonkeyStood;
  if (monkeys.some((v) => v.outcome === 'shooed')) return S.resMonkeyShooed;
  if (monkeys.some((v) => v.outcome === 'blocked')) return S.resMonkeyBlocked;
  const gifts = list.filter((v) => v.type === 'clown' && v.outcome === 'gift');
  if (gifts.length) return S.resClownGift(gifts.reduce((sum, v) => sum + Math.max(1, v.n), 0));
  return '';
}
