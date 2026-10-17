// (1.18 3D) Blokbotsing: Robot Rikus's turn. He looks at his three blocks, runs every throw ahead (the same prediction the
// dotted arc uses), and either throws the best one at your crown (a little off, as a person would be) or builds when his
// crown is open or nothing reaches. His build lands near the middle, sometimes a Perfek.
import { AIM, RIKUS, STACK, sideX } from './rules.js';

const DEG = Math.PI / 180;
function gauss(rand) {
  const u = Math.max(1e-9, rand());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}
const THROW_BONUS = { crate: 14, cube: 10, wedge: 6, pillar: 4, plank: 0 };
const BUILD_ORDER = ['plank', 'cube', 'pillar', 'wedge', 'crate'];

/** Is anything resting on a side's crown? (a roof over it) */
function covered(sim, side) {
  const c = sim.crowns[side];
  if (!c.alive) return false;
  const cb = c.body.bounds;
  return sim.live().some((e) => e !== c && !e.flying && e.body.bounds.max.y <= cb.min.y + 6 && e.body.bounds.max.x > cb.min.x + 8 && e.body.bounds.min.x < cb.max.x - 8);
}

/**
 * Rikus's plan for this turn: { shape, action: 'build', offset } (px from his stack's middle) or
 * { shape, action: 'throw', theta } (radians, already including his aiming error).
 */
export function rikusPlan(sim, cards, turnIdx, rand) {
  const me = 1;
  const foe = 0;
  const foeCrown = sim.crowns[foe];
  let best = null;
  for (const shape of cards) {
    for (let a = AIM.min; a <= AIM.max + 1e-6; a += 1 * DEG) {
      const p = sim.predict(me, shape, a);
      let score = 0;
      if (p.hit.kind === 'crown' && p.hit.side === foe) score = 100;
      else if (p.hit.kind === 'block' && p.hit.side === foe) {
        const d = Math.hypot(p.hit.x - foeCrown.body.position.x, p.hit.y - foeCrown.body.position.y);
        score = Math.max(10, 70 - d / 6);
      } else if (p.hit.kind === 'block' || p.hit.kind === 'stack') {
        score = Math.abs(p.hit.x - sideX(foe)) < STACK.w ? 20 : 0;
      }
      if (score > 0) score += THROW_BONUS[shape] || 0;
      if (!best || score > best.score) best = { shape, theta: a, score };
    }
  }
  const myOpen = !covered(sim, me);
  const lowerBy = sim.heightM(foe) - sim.heightM(me);
  let buildBias = turnIdx === 0 ? 0.35 : 1 - RIKUS.throwChance;
  if (myOpen && turnIdx > 1) buildBias += 0.12;
  if (lowerBy > 3) buildBias += 0.12;
  if (best && best.score >= 30 && rand() > buildBias) {
    const sd = (turnIdx < 4 ? RIKUS.aimSd[0] : RIKUS.aimSd[1]) * DEG;
    const theta = Math.min(AIM.max, Math.max(AIM.min, best.theta + gauss(rand) * sd));
    return { shape: best.shape, action: 'throw', theta, aimedAt: best.theta };
  }
  const shape = (myOpen ? ['plank', 'cube', 'wedge'] : BUILD_ORDER).find((s) => cards.includes(s)) || cards[0];
  return { shape, action: 'build', offset: gauss(rand) * RIKUS.buildSd };
}
