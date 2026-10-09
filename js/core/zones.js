// Height zones (1.12; the owner: "after 50 meter it needs to show a different picture than after 100
// meter then 200 meter etc."). The background changes as a tower climbs (js/scenes/BgScene.js draws
// each zone's scenery) and the first time a tower reaches a zone it gets a banner (GameScene). Names
// and lines live in js/core/strings.js (S.zoneTitle / S.zoneSub). Pure: importable in node.

export const ZONES = Object.freeze([
  Object.freeze({ from: 0, id: 'baai', emoji: '🏝️' }),      // Table Bay: the mountain, the city, gulls
  Object.freeze({ from: 50, id: 'wolke', emoji: '☁️' }),    // above the clouds: a sea of clouds, balloons, paragliders
  Object.freeze({ from: 100, id: 'lug', emoji: '✈️' }),     // high in the sky: aeroplanes and their trails, a helicopter
  Object.freeze({ from: 200, id: 'rand', emoji: '🌍' }),    // the edge of space: the Earth's curve, the first stars, a satellite
  Object.freeze({ from: 300, id: 'ruimte', emoji: '🚀' }),  // space: a black sky, a big moon, rockets
  Object.freeze({ from: 500, id: 'sterre', emoji: '🌌' }),  // among the stars: the Milky Way, shooting stars, a UFO
]);

/** The zone (index into ZONES) a height in metres is in. */
export function zoneAt(m) {
  const h = Number(m) || 0;
  let k = 0;
  while (k + 1 < ZONES.length && h >= ZONES[k + 1].from) k++;
  return k;
}
