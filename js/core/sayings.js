// Stapel — Afrikaanse spreekwoorde en idiome ("in between" lines). Pure and node-testable.
// Only well-known, genuine sayings; keep the typographic ’n (U+2019), never a straight '.
// pickSaying() is deterministic from a string key (via js/core/rng.js), so every player gets
// the same "Spreekwoord van die dag", and the same result saying for the same daily outcome.

import { createRng } from './rng.js';

export const SAYINGS = {
  // Menu: "Spreekwoord van die dag"
  GENERAL: [
    'Aanhouer wen.',
    'Klein begin, aanhou wen.',
    'Rome is nie in een dag gebou nie.',
    '’n Boer maak ’n plan.',
    'Alle begin is moeilik.',
    'Oefening baar kuns.',
    'Waar daar ’n wil is, is daar ’n weg.',
    'Wie nie waag nie, wen nie.',
    'Moed verloor, alles verloor.',
    'Na reën kom sonskyn.',
    'Moenie die bobbejaan agter die bult gaan haal nie.',
    'Môre is nog ’n dag.',
    'Elke hond kry sy dag.',
    'Hou die blink kant bo.',
    'Agteros kom ook in die kraal.',
    'Wie laaste lag, lag die lekkerste.',
    'Hoe meer haas, hoe minder spoed.',
    'Haastige spoed is selde goed.',
    'Eendrag maak mag.',
    'Een swaeltjie maak nie ’n somer nie.',
    'Die beste stuurlui staan aan wal.',
    'Kyk eers hoe die kat uit die boom klim.',
    'Beter laat as nooit.',
    'Stadig oor die klippe.',
  ],
  // In-game toast at 25 m, 50 m, 75 m, ... (short)
  MILESTONE: [
    'Aanhouer wen!',
    'Klein begin, aanhou wen!',
    'Rome is nie in een dag gebou nie.',
    'So sterk soos ’n os!',
    'Stapel hoog, staan sterk!',
    'Hou die blink kant bo!',
    '’n Boer maak ’n plan!',
    'Klein maar dapper!',
  ],
  // Results: a new best or a tall tower
  RESULT_GREAT: [
    'Dit staan soos ’n paal bo water!',
    'Jy is nie onder ’n kalkoen uitgebroei nie!',
    'So sterk soos ’n os!',
    'Wie laaste lag, lag die lekkerste.',
    'Oefening baar kuns.',
  ],
  // Results: the tower collapsed / no lives left
  RESULT_LIVES: [
    'Gedane sake het geen keer nie.',
    'Dis die laaste strooi wat die kameel se rug breek.',
    'Moed verloor, alles verloor — probeer weer!',
    'Een swaeltjie maak nie ’n somer nie.',
  ],
  // Results: game over very early
  RESULT_EARLY: [
    'Vroeg ryp, vroeg vrot.',
    'Alle begin is moeilik.',
    '’n Halwe eier is beter as ’n leë dop.',
    'Klein begin, aanhou wen.',
  ],
  // Results: the flood got you
  RESULT_FLOOD: [
    'Môre is nog ’n dag.',
    'Na reën kom sonskyn.',
    'Hou die blink kant bo.',
    'Iets is beter as niks.',
  ],
  // Pause screen
  PAUSE: [
    'Stadig oor die klippe.',
    'Moenie die bobbejaan agter die bult gaan haal nie.',
    'Hoe meer haas, hoe minder spoed.',
    'Kyk eers hoe die kat uit die boom klim.',
  ],
};

/** Height (m) at or above which a result counts as a tall tower. */
export const GREAT_HEIGHT_M = 50;
/** Below this height (m) a finished game counts as "very early". */
export const EARLY_HEIGHT_M = 10;
/** A milestone toast every this many metres. */
export const MILESTONE_STEP_M = 25;

/**
 * One saying from `category`, chosen deterministically from the string `key`
 * (the category is mixed in, so the same key gives unrelated picks per category).
 * Unknown category or empty list: ''.
 */
export function pickSaying(category, key) {
  const list = SAYINGS[category];
  if (!list || list.length === 0) return '';
  return createRng(`saying|${category}|${key}`).pick(list);
}

/** "Spreekwoord van die dag": the same line for everyone on the same date. */
export function sayingOfTheDay(dateKey) {
  return pickSaying('GENERAL', dateKey);
}

/** Milestone toast text: "50 m — Aanhouer wen!". Same for everyone on the same daily seed. */
export function milestoneSaying(seed, metres) {
  return pickSaying('MILESTONE', `${seed}|${metres}`);
}

/** Which category a finished game belongs to. */
export function resultCategory({ reason, heightM = 0, isNewBest = false } = {}) {
  if (reason === 'quit') return 'GENERAL';
  if (isNewBest || heightM >= GREAT_HEIGHT_M) return 'RESULT_GREAT';
  if (heightM < EARLY_HEIGHT_M) return 'RESULT_EARLY';
  if (reason === 'flood') return 'RESULT_FLOOD';
  return 'RESULT_LIVES';
}

/** The results-card line: identical for everyone with the same seed and outcome. */
export function resultSaying(result, isNewBest = false) {
  const r = result || {};
  const category = resultCategory({ reason: r.reason, heightM: Number(r.heightM) || 0, isNewBest });
  return pickSaying(category, `${r.seed ?? r.dateKey ?? ''}|${r.reason ?? ''}|${category}`);
}

/** Pause line: not tied to anything, so a different one now and then. */
export function pauseSaying(nowMs = Date.now()) {
  return pickSaying('PAUSE', String(Math.floor(nowMs / 1000)));
}
