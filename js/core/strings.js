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
  seeResult: 'Sien jou uitslag',
  nextTower: 'Volgende toring oor',
  practice: 'Oefen',
  practiceSub: 'Soveel as wat jy wil — tel nie',
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
  unfinished: 'Jou vorige poging is nie klaargemaak nie en het getel.',
  newDay: '’n Nuwe toring wag!',

  // --- In die spel (in game) ---
  tapToDrop: 'Tik om te laat val',
  perfect: 'Perfek!',
  perfectCombo: (n) => `Perfek ×${n}!`,
  good: 'Goed',
  skew: 'Skeef',
  lost: 'Oeps!',
  extraLife: 'Ekstra lewe!',
  height: 'Hoogte',
  points: 'Punte',
  lives: 'Lewens',
  next: 'Volgende',
  combo: 'Kombo',
  wobble: 'Wankel',
  waterBelow: (m) => `🌊 Vloed ${m} onder`,
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

  // --- Uitslag (results) ---
  results: 'Uitslag',
  overLives: 'Die toring het geval!',
  overLivesSub: 'Geen lewens oor nie.',
  overFlood: 'Oorstroom!',
  overFloodSub: 'Die water het jou toring ingehaal.',
  overQuit: 'Poging beëindig',
  overQuitSub: 'Jy het opgehou bou.',
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
  bestScore: 'Beste telling',
  totalPerfects: 'Perfekte blokke',
  lastWeek: 'Die afgelope 7 dae',
  noGamesYet: 'Nog geen Daaglikse Torings gebou nie.',

  // --- Hoe speel ek? ---
  howToTitle: 'Hoe speel ek?',
  howToSteps: [
    { icon: '👆', text: 'Tik enige plek op die skerm om die blok van die hyskraan te laat val.' },
    { icon: '🎯', text: 'Land dit reg in die middel vir ’n Perfek! Perfeks na mekaar bou ’n kombo vir ekstra punte — elke 5 gee jou ’n ekstra lewe.' },
    { icon: '🌦️', text: 'Die weer slaan toe terwyl jy bou: wind, reën, weerlig, hael, mis en meer.' },
    { icon: '🌊', text: 'Die water styg. Hou jou toring bo die vloedlyn!' },
    { icon: '❤️', text: 'Jy het drie lewens. Elke blok wat val, kos een.' },
    { icon: '🧱', text: 'Onder in die toring stol die blokke soos sement — bo bly dit wankelrig.' },
    { icon: '📅', text: 'Elke dag is daar een Daaglikse Toring: dieselfde blokke en weer vir almal, en jy kry een poging. Oefen soveel as wat jy wil.' },
  ],
  howToGo: 'Kom ons bou!',
};

/** Weather display info. Keys match WEATHER_TYPES in config.js. */
export const WEATHER_INFO = {
  wind:    { emoji: '💨', name: 'Wind',        desc: (dir) => (dir < 0 ? 'Die wind waai na links ←' : 'Die wind waai na regs →') },
  gust:    { emoji: '🌪️', name: 'Warrelwind',  desc: () => 'Rukwinde van alle kante!' },
  rain:    { emoji: '🌧️', name: 'Reën',        desc: () => 'Glibberige blokke — en die water styg vinniger.' },
  storm:   { emoji: '⛈️', name: 'Donderstorm', desc: () => 'Pasop vir die weerlig!' },
  hail:    { emoji: '🌨️', name: 'Hael',        desc: () => 'Haelkorrels tref jou toring!' },
  fog:     { emoji: '🌫️', name: 'Mis',         desc: () => 'Jy kan nie mooi sien waar dit gaan land nie…' },
  heat:    { emoji: '☀️', name: 'Hittegolf',   desc: () => 'Die hyskraan jaag!' },
  rainbow: { emoji: '🌈', name: 'Reënboog',    desc: () => 'Dubbel bonus vir Perfek — en die water sak!' },
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
