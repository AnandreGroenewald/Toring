// (1.18 3D) Blokbotsing: Robot Rikus's turn. He looks at his three cards and runs throws ahead (the same prediction the
// game uses) over several angles and powers, a few each frame so a phone never stalls; then he throws the best one, a
// little off as a person would be (angle and power), or builds when his crown is open or nothing reaches. Each element
// counts for what it does: the explosive and the wave near a crown, the fire into a crowd of blocks.
import { PIN, RIKUS } from './rules.js';

const DEG = Math.PI / 180;
function gauss(rand) {
  const u = Math.max(1e-9, rand());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}
const NEAR_CROWN = { plof: 20, water: 16, gras: 16, vuur: 6 };
const ON_BLOCKS = { plof: 14, vuur: 12, gras: 8, water: 6 };
const POWERS = [1, 0.86, 0.72, 0.58];

/** Is anything resting on a side's crown? (a roof over it) */
function covered(sim, side) {
  const c = sim.crowns[side];
  if (!c.alive) return false;
  const cb = c.body.bounds;
  return sim.live().some((e) => e !== c && !e.flying && e.body.bounds.max.y <= cb.min.y + 6 && e.body.bounds.max.x > cb.min.x + 8 && e.body.bounds.min.x < cb.max.x - 8);
}

/**
 * A planner for Rikus's turn: `step(n)` runs n more predictions (true when done), then `plan()` gives
 * { shape, element, action: 'build', offset } or { shape, element, action: 'throw', theta, power }.
 */
export function createRikusPlanner(sim, me, cards, turnIdx, rand, { sudden = false } = {}) {
  const foe = 1 - me;
  const tasks = [];
  for (let i = 0; i < cards.length; i++) {
    for (let a = PIN.min; a <= PIN.max + 1e-6; a += 3 * DEG) for (const p of POWERS) tasks.push([i, a, p]);
  }
  let k = 0;
  let best = null;
  const crown = sim.crowns[foe];
  return {
    step(n = 24) {
      for (let j = 0; j < n && k < tasks.length; j++, k++) {
        const [i, a, p] = tasks[k];
        const card = cards[i];
        const r = sim.predict(me, card.shape, a, p);
        let score = 0;
        if (r.hit.kind === 'crown' && r.hit.side === foe) score = 100 + (NEAR_CROWN[card.element] || 0) + (crown.hp <= 0 ? 20 : 0);
        else if (r.hit.kind === 'block' && r.hit.side === foe) {
          const d = Math.hypot(r.hit.x - crown.body.position.x, r.hit.y - crown.body.position.y);
          score = Math.max(12, 72 - d / 6) + (ON_BLOCKS[card.element] || 0) + (d < 140 ? (NEAR_CROWN[card.element] || 0) * 0.5 : 0);
        } else if (r.hit.kind === 'stack' && r.hit.side === foe) score = 18;
        if (!best || score > best.score) best = { i, theta: a, power: p, score };
      }
      return k >= tasks.length;
    },
    plan() {
      const myOpen = !covered(sim, me) || sim.crowns[me].hp <= 1;
      const lowerBy = sim.heightM(foe) - sim.heightM(me);
      let buildBias = turnIdx === 0 ? 0.35 : 1 - RIKUS.throwChance;
      if (myOpen && turnIdx > 1) buildBias += 0.1;
      if (lowerBy > 3) buildBias += 0.1;
      if (sudden) buildBias = -1;
      if (best && best.score >= 30 && rand() > buildBias) {
        const sd = (turnIdx < 4 ? RIKUS.aimSd[0] : RIKUS.aimSd[1]) * DEG;
        const theta = Math.min(PIN.max, Math.max(PIN.min, best.theta + gauss(rand) * sd));
        const power = Math.min(1, Math.max(0.3, best.power + gauss(rand) * RIKUS.powerSd));
        return { ...cards[best.i], action: 'throw', theta, power };
      }
      if (sudden) {
        const c = cards.find((x) => x.element === 'plof') || cards[0];
        return { ...c, action: 'throw', theta: 0.8, power: 0.9 };
      }
      // a defence block in front of his crown: water or fire first when it's open
      const order = myOpen ? ['water', 'vuur', 'plof', 'gras'] : ['gras', 'water', 'vuur', 'plof'];
      const c = order.map((el) => cards.find((x) => x.element === el)).find(Boolean) || cards[0];
      return { ...c, action: 'build', offset: gauss(rand) * RIKUS.buildSd };
    },
  };
}
