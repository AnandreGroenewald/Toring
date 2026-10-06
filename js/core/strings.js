// Alle Afrikaanse teks vir Stapel. Keep every player-facing string here.
// Use the typographic ’n (U+2019) for the indefinite article.

export const S = {
  title: 'Stapel',
  tagline: 'Stapel hoog. Staan sterk.',
  loading: 'Laai…',
  rotate: 'Draai jou foon regop om te speel.',

  // --- Tuisskerm (menu) ---
  daily: 'Daaglikse Toring',
  dailyN: (n) => `Daaglikse Toring #${n}`,
  playToday: 'Bou vandag se toring',
  doneToday: 'Klaar vir vandag!',
  seeResult: 'Kyk na jou uitslag',
  nextTower: 'Volgende toring oor',
  practice: 'Oefen',
  practiceSub: 'Speel soveel jy wil — dit tel nie',
  howTo: 'Hoe speel ek?',
  stats: 'Statistiek',
  settings: 'Instellings',
  sound: 'Klank',
  vibration: 'Vibrasie',
  on: 'Aan',
  off: 'Af',
  close: 'Maak toe',
  back: 'Terug',
  forecast: 'Vandag se weervoorspelling',
  sameForAll: 'Dieselfde blokke en weer vir almal. Een poging.',
  unfinished: 'Jou vorige poging is onderbreek, maar dit tel soos dit was.',
  newDay: '’n Nuwe toring wag!',

  // --- In die spel (in game) ---
  tapToDrop: 'Tik om te laat val',
  perfect: 'Perfek!',
  perfectCombo: (n) => `Perfek ×${n}!`,
  good: 'Goed',
  skew: 'Skeef',
  lost: 'Oeps!',
  extraLife: '’n Lewe terug!',
  height: 'Hoogte',
  points: 'Punte',
  lives: 'Lewens',
  next: 'Volgende',
  combo: 'Kombo',
  wobble: 'Wankel',
  waterBelow: (m) => `🌊 Vloedlyn ${m} onder`,
  waterRising: 'Die water styg!',
  waterDanger: 'Bou vinniger — die water kom!',
  waterRecede: 'Die water sak!',
  practiceLabel: 'Oefenrondte',
  blocksLeft: (n) => (n === 1 ? 'nog 1 blok' : `nog ${n} blokke`),

  // --- Pouse (pause) ---
  paused: 'Gepouseer',
  resume: 'Speel verder',
  quit: 'Hou op',
  quitWarnDaily: 'As jy nou ophou, tel hierdie poging as jou Daaglikse Toring.',
  pause: 'Pouseer',

  // --- Uitslag (results) ---
  results: 'Uitslag',
  overLives: 'Jou lewens is op!',
  overLivesSub: 'Te veel blokke het in die see geplons.',
  overFlood: 'Oorstroom!',
  overFloodSub: 'Die water het jou toring ingehaal.',
  overQuit: 'Bouwerk gestaak',
  overQuitSub: 'Jy het die hyskraan afgeskakel.',
  blocks: 'Blokke',
  perfects: 'Perfek',
  bestCombo: 'Beste kombo',
  duration: 'Tyd',
  share: 'Deel',
  shareWhatsApp: 'Deel op WhatsApp',
  copy: 'Kopieer',
  copied: 'Gekopieer!',
  copyFailed: 'Kon nie kopieer nie',
  shared: 'Gedeel!',
  home: 'Tuis',
  practiceAgain: 'Oefen weer',
  newRecord: 'Nuwe rekord!',
  weatherToday: 'Weer',

  // --- Statistiek ---
  played: 'Gespeel',
  currentStreak: 'Huidige reeks',
  maxStreak: 'Langste reeks',
  bestHeight: 'Hoogste toring',
  bestScore: 'Meeste punte',
  totalPerfects: 'Perfekte blokke',
  lastWeek: 'Die afgelope 7 dae',
  noGamesYet: 'Nog geen Daaglikse Torings gebou nie.',

  // --- Hoe speel ek? ---
  howToTitle: 'Hoe speel ek?',
  howToSteps: [
    { icon: '👆', text: 'Tik enige plek op die skerm om die blok van die hyskraan te laat val. Die wit vorm op die toring wys waar dit gaan land.' },
    { icon: '🎯', text: 'Laat die blok reg in die middel land vir ’n Perfek! Perfekte landings op ’n ry bou ’n kombo vir ekstra punte.' },
    { icon: '🧱', text: 'Onder in die toring word die blokke hard soos sement — bo bly die toring wankelrig. ’n Perfek laat die blokke daaronder dadelik vassit.' },
    { icon: '🌦️', text: 'Die weer slaan toe terwyl jy bou: wind, reën, weerlig, hael, mis en meer.' },
    { icon: '🌊', text: 'Die water styg. Hou jou toring bo die vloedlyn!' },
    { icon: '❤️', text: 'Jy het vier lewens. Elke keer as blokke in die see beland, kos dit jou een. Elke derde Perfek bring ’n verlore lewe terug.' },
    { icon: '🗓️', text: 'Elke dag is daar een Daaglikse Toring: dieselfde blokke en weer vir almal, en jy kry een poging. Oefen soveel jy wil.' },
  ],
  howToGo: 'Kom ons bou!',

  // --- Deel-teks (share text; core/share.js) ---
  shareDailyHead: (n) => `Stapel #${n}`,
  sharePracticeHead: 'Stapel (oefenrondte)',

  // --- Bygevoeg in 1.0.1 ---
  ghostHint: 'Hier land jou blok',
  clickToDrop: 'Klik of druk spasie om te laat val',
  nextTowerCaption: 'tot die volgende toring',
  newTowerGo: 'Bou die nuwe toring',
  lostCount: 'Verlore',
  notPlayed: 'nie gespeel nie',
  nothingToShare: 'Niks om te deel nie — probeer weer!',
  otherTab: 'Jy bou reeds in ’n ander oortjie.',
  reloadNeeded: 'Die skerm het gevries. Laai die bladsy weer as dit nie regkom nie.',
  highContrast: 'Kontras',
  peek: 'Toring',
  peekBack: 'Uitslag',
  wobbleTitle: 'Wankel',
};

/** Weather display info. Keys match WEATHER_TYPES in config.js. */
export const WEATHER_INFO = {
  wind:    { emoji: '💨', name: 'Wind',        desc: (dir) => (dir < 0 ? 'Die wind waai na links ←' : 'Die wind waai na regs →') },
  gust:    { emoji: '🌪️', name: 'Warrelwind',  desc: () => 'Rukwinde van alle kante!' },
  rain:    { emoji: '🌧️', name: 'Reën',        desc: () => 'Glibberig! En die water styg vinniger.' },
  storm:   { emoji: '⛈️', name: 'Donderstorm', desc: () => 'Pasop vir die weerlig!' },
  hail:    { emoji: '🌨️', name: 'Hael',        desc: () => 'Haelkorrels tref jou toring!' },
  fog:     { emoji: '🌫️', name: 'Mis',         desc: () => 'Jy sien skaars waar die blok gaan land…' },
  heat:    { emoji: '☀️', name: 'Hittegolf',   desc: () => 'Die hyskraan jaag!' },
  rainbow: { emoji: '🌈', name: 'Reënboog',    desc: () => 'Dubbele punte vir elke Perfek!' },
};

/** Afrikaans names for the block shapes (for the HUD "next" preview / how-to). */
export const SHAPE_NAMES = {
  plank: 'Plank',
  slab: 'Blad',
  brick: 'Baksteen',
  crate: 'Krat',
  cube: 'Blokkie',
  pillar: 'Pilaar',
  wedge: 'Wig',
  arch: 'Boog',
  L: 'L-stuk',
  J: 'J-stuk',
  T: 'T-stuk',
};
