// First-game coaching: which short hint belongs to which real moment, shown once each, in the
// player's very first game only. Pure logic (no Phaser): the scene says what happened, this says
// what (if anything) to tell the player. Hints are text only; they never touch the game itself,
// so the first daily stays exactly as fair as every other one.
import { S } from './strings.js';
import { COACH } from '../config.js';

/**
 * @param {boolean} enabled  true only for a player who has not finished a first game yet
 * @returns {{ enabled: boolean, tap(fine: boolean): string|null, landing(rating: string): {id:string,text:string}|null,
 *   water(): {id:string,text:string}|null, lost(): {id:string,text:string}|null }}
 */
export function createCoach(enabled) {
  const on = !!enabled;
  const shown = new Set();
  const once = (id, text) => {
    if (!on || shown.has(id)) return null;
    shown.add(id);
    return { id, text };
  };
  return {
    enabled: on,
    /** The text over the sea before the first drop (on a phone with the pointing hand). */
    tap(fine) {
      if (fine) return S.clickToDrop;
      return on ? S.coachTap : S.tapToDrop;
    },
    /** After the first block has been rated. */
    landing(rating) {
      return once('land', rating === 'P' ? S.coachPerfect : S.coachMiddle);
    },
    /** The first time the water starts to rise. */
    water() {
      return once('water', S.coachWater);
    },
    /** The first time a block in the sea really costs a heart. */
    lost() {
      return once('lost', S.coachLost);
    },
  };
}

/** A first game counts as "learned" once it got this far (a quick quit leaves the hints for next time). */
export function tutorialDone(blocksDropped) {
  return Number(blocksDropped) >= COACH.minBlocks;
}
