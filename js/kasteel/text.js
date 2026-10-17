// (1.17 3D) Die Kasteelreeks: every word on its screens, in Afrikaans and English. The language is Stapel's own choice
// (`stapel.v1.lang`, or `?lang=` for one visit); Afrikaans when nobody has chosen.
import { setNumberStyle, fmtM, dayName } from '../core/format.js';

let lang = 'af';
try {
  const q = new URLSearchParams(location.search).get('lang');
  const v = q || localStorage.getItem('stapel.v1.lang');
  if (v === 'en' || v === 'af') lang = v;
} catch { /* Afrikaans */ }
export const LANG = lang;

/** Stapel's own Instellings (its 'stapel.v1' record, read only): sound, vibration, and less motion (the phone's wish by default). */
export const PREFS = (() => {
  let v = {};
  try { v = JSON.parse(localStorage.getItem('stapel.v1') || '{}')?.settings || {}; } catch { /* the defaults */ }
  const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return { sound: v.sound !== false, vibration: v.vibration !== false, reducedMotion: typeof v.reducedMotion === 'boolean' ? v.reducedMotion : calm };
})();
setNumberStyle(lang);   // (Stapel's own: "37,5 m" in Afrikaans, "37.5 m" in English, and the day names to match)
export { fmtM, dayName };

const AF = {
  series: 'DIE KASTEELREEKS',
  castleOf: (n) => `${n} se kasteel`,
  rikus: 'Robot Rikus',
  rikusCastle: 'Robot Rikus se kasteel',
  rikusIn: 'Robot Rikus se kasteel',
  myTest: 'Jou kasteel (toets)',
  myIn: 'jou kasteel',
  mine: 'Jou kasteel',
  towers: 'torings', perfects: 'Perfeks', defenders: 'verdedigers',
  legend: ['Perfek = graniet', 'Goed = sandsteen', 'Skeef = hout'],
  goals: ['Breek die hek', 'Helfte plat', 'Hul vlag val'],
  attack: 'VAL AAN',
  testNoLoot: 'TOETS · GEEN BUIT',
  yourCastleLink: 'Jou kasteel ›',
  back: '‹ Stapel',
  cards: { swaard: 'Swaard', spies: 'Spies', boog: 'Boog', ridder: 'Ridder', ram: 'Stormram', treb: 'Trebuchet' },
  aimN: (n) => `MIK · ${n}`,
  reload: 'LAAI…',
  wind: '1 m/s ≈ 1 kol',
  range: 'AFSTAND', power: 'KRAG', throw: 'GOOI',
  aimHint: 'Sleep om te mik · hou GOOI om die arm te span · los by die wit streep',
  pickHint: 'Kies ’n kaart en tik op die veld',
  fieldHint: 'Tik op die blou veld om hulle te stuur',
  fromField: 'Stuur hulle van die blou veld af',
  thirty: '30 sekondes oor!',
  gate: 'DIE HEK IS OOP!', half: 'HELFTE PLAT!', flag: 'HUL VLAG VAL!',
  won: 'OORWINNING!', lost: 'TERUGGESLAAN',
  endLine: (d, n, l) => `${d}% van ${n} plat · ${l} ${l === 1 ? 'soldaat' : 'soldate'} verloor`,
  again: 'WEER', done: 'KLAAR', share: 'SPOG',
  capped: 'Vandag se munte is op (die dag se perk, soos by Oefen). Die trofeë tel steeds.',
  brag: (d, s, n) => `Ek het ${n} ${d}% platgeslaan in Stapel se Kasteelreeks (${'★'.repeat(s)}${'☆'.repeat(3 - s)}). Kan jy beter?`,
  // the planner
  yourCastle: 'Jou kasteel',
  standHere: (n) => `${n} van jou Daaglikse Torings staan hier${n < 5 ? ' · speel nog om te bou' : ''}`,
  playToBuild: 'Speel die Daaglikse Toring: elke dag se toring word ’n toring van jou kasteel',
  planLine: 'Beplan jou verdediging: dit veg vir jou terwyl jy weg is.',
  attackRikus: 'Val Robot Rikus aan ›',
  keep: 'HOOF-TORING', budget: 'BEGROTING',
  dayTower: (n) => `Dag ${n} se toring`,
  starterTower: (n) => `Toring ${n}`,
  placeHint: (p) => `Tik ’n goue kring om ’n ${p.toLowerCase()} te plaas`,
  idleHint: 'Kies wat jy wil plaas · tik iets wat staan om dit weg te vat',
  tooDear: 'Te duur: haal eers iets weg',
  budgetUp: (n) => `+${n} vir jou Daaglikse Torings`,
  saved: 'Bêre! Jou kasteel veg nou so vir jou.',
  pickFirst: 'Kies eers onder wat jy wil plaas',
  unsaved: 'Nog nie gebêre nie: tik BÊRE om dit te hou (of terug weer om te los)',
  save: 'BÊRE', test: 'TOETS DIT', prev: 'Vorige', next: 'Volgende',
  pieces: { boog: 'Boogskutter', spies: 'Spiesman', ridder: 'Ridder', olie: 'Kookolie', ballista: 'Ballista', pieke: 'Pieke' },
  toBuild: 'Nog te bou',
  loading: 'Die kasteel word gebou…',
  failed: 'Die kasteel wil nie op hierdie toestel laai nie. Probeer weer, of speel solank Stapel.',
  retry: 'PROBEER WEER',
  // the first siege's help
  help1: 'Kies ’n kaart onder, en tik dan op die blou veld: jou soldate marsjeer op die kasteel af.',
  help2: 'Tik Trebuchet om self te mik.',
  help3: 'Sit die kruis op ’n toring. Hou GOOI en los wanneer die naald by die wit streep is.',
  gotIt: 'Reg so',
  resume: 'GAAN VOORT', quit: 'HOU OP',
  // friends (1.17: their castles, kept by the server; Jou dorp's neighbours)
  invite: 'Nooi',
  inviteText: (link) => `🏰 Bou jou kasteel uit jou Daaglikse Torings en val myne aan in Stapel! As jy durf 😈\n${link}`,
  bragFriend: (d, s) => `Ek het jou kasteel ${d}% platgeslaan in Stapel se Kasteelreeks (${'★'.repeat(s)}${'☆'.repeat(3 - s)}). Wraak? 😈`,
  attacked: (n, d, s) => `${n} het jou kasteel aangeval: ${d}% · ${'★'.repeat(s)}${'☆'.repeat(3 - s)}`,
  held: (n) => `${n} kon nie deur jou verdediging kom nie 🛡️`,
  wraak: 'WRAAK ›',
  more: (n) => `+${n} meer`,
  noCastle: 'Kon nie hul kasteel kry nie. Is jy aanlyn?',
};
const EN = {
  series: 'THE CASTLE SERIES',
  castleOf: (n) => `${n}’s castle`,
  rikus: 'Robot Rikus',
  rikusCastle: 'Robot Rikus’s castle',
  rikusIn: 'Robot Rikus’s castle',
  myTest: 'Your castle (test)',
  myIn: 'your castle',
  mine: 'Your castle',
  towers: 'towers', perfects: 'Perfects', defenders: 'defenders',
  legend: ['Perfect = granite', 'Good = sandstone', 'Skew = timber'],
  goals: ['Break the gate', 'Half of it down', 'Their flag falls'],
  attack: 'ATTACK',
  testNoLoot: 'TEST · NO LOOT',
  yourCastleLink: 'Your castle ›',
  back: '‹ Stapel',
  cards: { swaard: 'Swords', spies: 'Spears', boog: 'Bows', ridder: 'Knights', ram: 'Ram', treb: 'Trebuchet' },
  aimN: (n) => `AIM · ${n}`,
  reload: 'RELOAD…',
  wind: '1 m/s ≈ 1 dot',
  range: 'RANGE', power: 'POWER', throw: 'THROW',
  aimHint: 'Drag to aim · hold THROW to pull the arm · let go at the white mark',
  pickHint: 'Pick a card, then tap the field',
  fieldHint: 'Tap the blue field to send them',
  fromField: 'Send them from the blue field',
  thirty: '30 seconds left!',
  gate: 'THE GATE IS OPEN!', half: 'HALF OF IT DOWN!', flag: 'THEIR FLAG FALLS!',
  won: 'VICTORY!', lost: 'DRIVEN BACK',
  endLine: (d, n, l) => `${d}% of ${n} down · ${l} ${l === 1 ? 'soldier' : 'soldiers'} lost`,
  again: 'AGAIN', done: 'DONE', share: 'BRAG',
  capped: 'Today’s coins are used up (the day’s limit, as in Practice). The trophies still count.',
  brag: (d, s, n) => `I knocked down ${d}% of ${n} in Stapel’s Castle Series (${'★'.repeat(s)}${'☆'.repeat(3 - s)}). Can you do better?`,
  yourCastle: 'Your castle',
  standHere: (n) => `${n} of your Daily Towers stand here${n < 5 ? ' · play more to build' : ''}`,
  playToBuild: 'Play the Daily Tower: each day’s tower becomes a tower of your castle',
  planLine: 'Plan your defence: it fights for you while you’re away.',
  attackRikus: 'Attack Robot Rikus ›',
  keep: 'KEEP', budget: 'BUDGET',
  dayTower: (n) => `Day ${n}’s tower`,
  starterTower: (n) => `Tower ${n}`,
  placeHint: (p) => `Tap a gold ring to place ${/^[aeio]/i.test(p) ? 'an' : 'a'} ${p.toLowerCase()}`,
  idleHint: 'Pick what to place · tap something standing to take it away',
  tooDear: 'Too dear: take something away first',
  budgetUp: (n) => `+${n} for your Daily Towers`,
  saved: 'Saved! Your castle now fights like this for you.',
  pickFirst: 'First pick what to place, below',
  unsaved: 'Not saved yet: tap SAVE to keep it (or back again to leave it)',
  save: 'SAVE', test: 'TEST IT', prev: 'Previous', next: 'Next',
  pieces: { boog: 'Archer', spies: 'Spearman', ridder: 'Knight', olie: 'Boiling oil', ballista: 'Ballista', pieke: 'Spikes' },
  toBuild: 'Still to build',
  loading: 'Building the castle…',
  failed: 'The castle won’t load on this device. Try again, or play Stapel for now.',
  retry: 'TRY AGAIN',
  help1: 'Pick a card below, then tap the blue field: your soldiers march on the castle.',
  help2: 'Tap Trebuchet to aim it yourself.',
  help3: 'Put the cross on a tower. Hold THROW and let go when the needle reaches the white mark.',
  gotIt: 'Got it',
  resume: 'CONTINUE', quit: 'QUIT',
  invite: 'Invite',
  inviteText: (link) => `🏰 Build your castle from your Daily Towers and attack mine in Stapel! If you dare 😈\n${link}`,
  bragFriend: (d, s) => `I knocked down ${d}% of your castle in Stapel’s Castle Series (${'★'.repeat(s)}${'☆'.repeat(3 - s)}). Revenge? 😈`,
  attacked: (n, d, s) => `${n} attacked your castle: ${d}% · ${'★'.repeat(s)}${'☆'.repeat(3 - s)}`,
  held: (n) => `${n} couldn’t get through your defence 🛡️`,
  wraak: 'REVENGE ›',
  more: (n) => `+${n} more`,
  noCastle: 'Couldn’t fetch their castle. Are you online?',
};
export const T = lang === 'en' ? EN : AF;

/** One step back: where the player came from (the castle's other screen, or Stapel), else Stapel itself. */
export function goBack() {
  if (history.length > 1 && document.referrer && new URL(document.referrer).origin === location.origin) history.back();
  else location.href = 'index.html';
}
