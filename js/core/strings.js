// Alle Afrikaanse teks vir Stapel. Keep every player-facing string here, and its English twin in
// js/core/strings.en.js (same keys and shapes; tests/i18n.test.js checks). js/core/i18n.js swaps the
// tables in place, so code keeps reading S.x as always. Use the typographic ’n (U+2019).

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
  howToShort: 'Speelreëls',           // the menu's bottom row (one line under its icon)
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
    { icon: '🐒', text: 'Soms kom kuier iemand: Blouaap gooi blokke in die see, tensy jou volgende blok Perfek land. Skelm Sakkie steel blokke: tik hom om hom te vang. Hanswors bou vir jou ’n nuwe fondament. Besoekers kos jou nooit ’n hartjie nie.' },
    { icon: '🗓️', text: 'Elke dag is daar een Daaglikse Toring: dieselfde blokke, weer en besoekers vir almal, en jy kry een poging. Oefen soveel jy wil.' },
  ],
  howToGo: 'Kom ons bou!',
  privacyPolicy: 'Privaatheidsbeleid',

  // --- Deel-teks (share text; core/share.js) ---
  shareDailyHead: (n) => `Stapel #${n}`,
  sharePracticeHead: 'Stapel (oefenrondte)',

  // --- Eerste speletjie: leidrade tydens die spel (js/core/coach.js) ---
  firstNudge: 'Nuut? Tik net en speel — ons wys jou hoe.',
  sayingOfDay: 'Spreekwoord van die dag',
  coachTap: 'Tik om te laat val 👆',
  coachMiddle: 'Mik vir die middel — die wit vorm wys waar dit land',
  coachPerfect: 'Perfek! Doen dit weer 🎯',
  coachWater: 'Die water styg — bou vinniger as die vloedlyn 🌊',
  coachLost: '’n Blok in die see kos ’n hartjie ❤️',

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

  // --- Borge (sponsors) ---
  adLabel: 'Advertensie',
  adOpens: 'maak in ’n nuwe oortjie oop',
  advertiseHere: 'Adverteer hier',
  boardFree: 'Jou advertensie hier!',
  boardFreeSub: 'Adverteer op Stapel',
  // results card: how today's tower compares with the other players (never in the WhatsApp text)
  percentileBetter: (n) => `Jy het beter gedoen as ${n}% van spelers vandag`,
  // "Jou Stapelstad": every finished Daaglikse Toring becomes a building in the player's own skyline
  cityTitle: 'Jou Stapelstad',
  cityLine: (n) => (n === 1 ? 'Jou stad se eerste toring staan!' : `Jou stad het nou ${n} torings!`),
  cityStreak: (n) => (n >= 2 ? `${n} dae in ’n ry` : ''),
  cityBest: 'Beste toring',
  cityEmpty: 'Voltooi ’n Daaglikse Toring om jou stad te begin bou.',
  cityAria: (n, days) => `Jou Stapelstad: ${n} torings in die laaste ${days} dae`,
  // friend challenge (?klop=<dm>&d=<date>)
  challengeMenu: (m) => `’n Vriend daag jou uit: klop ${m}! 🚩`,
  challengeLine: (m) => `Klop dié: ${m}`,
  challengeWon: 'Jy het jou vriend geklop! 🎉',
  // tomorrow teaser on the daily results
  tomorrow: 'Môre',
  tomorrowLine: (emoji) => `Môre: ${emoji} — kom terug!`,
  // add to home screen
  installBtn: '📲 Sit Stapel op jou tuisskerm',
  installTipIos: 'Tik Deel ⬆️ en dan “Voeg by tuisskerm”',
  installDismiss: 'Nie nou nie',

  // --- Besoekers (visitors; js/game/visitors.js) ---
  visitors: 'Besoekers',                      // share line: "Weer: 💨 · Besoekers: 🐒🦹✋"
  visitorsToday: 'Besoekers vandag',          // menu, under the weather forecast
  monkeyBack: 'Ek sal terug wees!',          // Blouaap's speech bubble when a Perfek scares him off
  visitorFree: (name) => `${name} se skuld — jy hou jou hartjies ❤️`,   // a visitor knocked blocks into the sea
  thiefCaught: 'Gevang! Jy kry jou blokke terug.',
  thiefStole: (n) => (n === 1 ? 'Skelm Sakkie het 1 blok gesteel!' : `Skelm Sakkie het ${n} blokke gesteel!`),
  thiefEmpty: 'Skelm Sakkie het niks gekry nie!',
  gifts: 'Geskenke',                          // results grid label (🎁 cells)
  // one line on the results card about the day's visitors (never in the share text)
  resThiefCaught: 'Jy het Skelm Sakkie gevang! 👮',
  resThiefStole: (n) => (n === 1 ? 'Skelm Sakkie het 1 blok gesteel 🦹' : `Skelm Sakkie het ${n} blokke gesteel 🦹`),
  resThiefEmpty: 'Skelm Sakkie het met leë hande weggesluip 🦹',
  resMonkeyShooed: 'Jou Perfek het Blouaap weggejaag! 🐒',
  resMonkeyKnocked: (n) => (n === 1 ? 'Blouaap het 1 blok van jou toring afgegooi 🐒' : `Blouaap het ${n} blokke van jou toring afgegooi 🐒`),
  resMonkeyStood: 'Blouaap het gestamp, maar jou toring het bly staan! 🐒',
  resClownGift: (n) => (n > 1 ? `Hanswors het vir jou ${n} blokke gebring 🎁` : 'Hanswors het vir jou ’n geskenkie gebring 🎁'),
  clownFoundation: 'Nuwe fondament! 🧱 Alles daaronder staan vas',   // Hanswors's blocks set as cement
  // first game only: the first visitor of each kind explains itself in its arrival banner (js/core/coach.js)
  coachMonkey: 'Land jou volgende blok Perfek, anders gooi Blouaap jou boonste blok in die see!',
  coachClown: 'Hanswors stapel ekstra blokke op jou toring en sement hulle vas!',
  coachThief: 'Tik vinnig op Skelm Sakkie, anders steel hy jou boonste blokke!',

  // --- Uitdagersreeks (head-to-head; docs/CHALLENGE-SPEC.md) ---
  duel: 'Uitdagersreeks',
  duelSub: 'Kop-aan-kop teen ’n ander speler',
  duelSubShort: 'Kop-aan-kop',            // under the menu button (beside Oefen)
  practiceSubShort: 'Dit tel nie',
  duelIntro: 'Julle bou kop-aan-kop met dieselfde blokke en weer. Wie eerste by ’n 10 m-merk kom, kies ’n straf vir die ander se toring. Eerste tot 50 m wen!',
  duelNick: 'Jou bynaam',
  duelNickHint: 'Wys vir jou teenstander (hoogstens 16 letters)',
  duelNickBad: 'Daardie naam gaan nie werk nie. Probeer ’n ander een.',
  duelNickSaved: 'Bynaam gestoor',
  duelRandom: 'Soek ’n teenstander',
  duelFriend: 'Daag ’n vriend uit',
  duelBot: 'Speel teen die rekenaar',
  duelRecord: (w, l) => `${w === 1 ? '1 oorwinning' : `${w} oorwinnings`} · ${l === 1 ? '1 nederlaag' : `${l} nederlae`}`,
  duelStreak: (n) => `${n} op ’n ry`,
  duelOffline: 'Lewendige wedstryde werk nog nie. Speel solank teen die rekenaar of daag ’n vriend uit met jou rondte.',
  duelSearching: 'Soek ’n teenstander…',
  duelSearchHint: 'Ons soek iemand wat ook nou wil speel.',
  duelNobody: 'Niemand is nou aanlyn nie. Jy speel teen ’n opname van ’n ander speler se wedstryd.',
  duelNobodyBot: 'Niemand is nou aanlyn nie. Jy speel teen Robot Rikus.',
  duelVs: (name) => `Teen ${name}!`,
  duelTheyCelebrate: (name) => `${name} vier!`,
  duelGo: 'Bou!',
  duelCancel: 'Kanselleer',
  duelWaitFriend: 'Wag vir jou vriend…',
  duelWaitHint: 'Stuur die skakel. Sodra jou vriend dit oopmaak, begin julle.',
  duelRoomText: (name, link) => `${name} daag jou uit vir ’n Stapel-wedstryd! Kom bou kop-aan-kop: ${link}`,
  duelPlayLater: 'Speel solank teen die rekenaar',
  duelFriendLater: 'Speel jou rondte teen Robot Rikus. Daarna stuur jy dit vir ’n vriend om te klop.',
  duelJoining: 'Koppel aan die uitdaging…',
  duelRoomGone: 'Hierdie uitdaging is verby of bestaan nie meer nie.',
  duelNoServer: 'Kon nie aan die bediener koppel nie. Probeer later weer.',
  duelBotName: 'Robot Rikus',
  duelSomeone: '’n Vriend',
  duelAttackIn: (name, visitor) => `${name} stuur ${visitor}!`,
  duelAttackOut: (visitor, name, emoji) => `Jy stuur ${visitor} na ${name}! ${emoji}`,
  duelChoose: (m, name) => `Eerste by ${m} m! Kies ’n straf vir ${name}:`,
  duelChooseLabel: 'Kies ’n straf',
  // --- Muntstukke, kragte en rang (1.8; js/core/economy.js) ---
  coinsTotal: (n) => `jy het ${n}`,
  coinsCapped: 'genoeg vir vandag, kom môre weer',
  rankUp: (name) => `Nuwe rang: ${name}!`,
  powerups: 'Kragte',
  powerOn: 'AAN',
  shop: 'Winkel',
  shopPowerups: 'Kragte',
  shopLooks: 'Uitdager-styl',
  shopPowerupsNote: 'Vir Oefen. In die Daaglikse Toring kry almal ’n gratis Fondamentblok by 55 m.',
  shopLooksNote: 'Jou teenstander sien dit in die Uitdagersreeks. Dit maak jou nie sterker nie.',
  inBag: (n) => `In jou sak: ${n}`,
  buy: 'Koop',
  wear: 'Dra',
  wearing: 'Aan',
  preview: 'Wys',
  lockedRank: (rank) => `🔒 ${rank}-rang`,
  lookKinds: { frame: 'Raam', badge: 'Wapen', title: 'Titel', celebration: 'Wen-viering', style: 'Straf-styl' },
  notEnoughCoins: 'Nie genoeg muntstukke nie. Speel nog ’n bietjie!',
  bought: (name) => `${name} gekoop!`,
  powerupSlow: 'Stadige hyskraan: 5 blokke lank 🐢',
  powerupShield: 'Skild aan! Die volgende aap of skelm bons af 🛡️',
  foundationSet: 'Nuwe fondament! 🧱 Alles daaronder staan vas',
  freeFoundation: 'Fondamentblok verdien! Tik 🧱 wanneer jy dit wil gebruik',
  shieldBlocked: (name) => `${name} bons van jou skild af! 🛡️`,
  resMonkeyBlocked: 'Jou skild het Blouaap gekeer! 🛡️',
  resThiefBlocked: 'Jou skild het Skelm Sakkie gekeer! 🛡️',
  rankPointsDelta: (d) => (d >= 0 ? `+${d} punte` : `${d} punte`),
  season: (month, year) => `Seisoen: ${month} ${year}`,
  rankPoints: (n) => (n === 1 ? '1 punt' : `${n} punte`),
  rankToNext: (n, rank) => `Nog ${n === 1 ? '1 punt' : `${n} punte`} tot ${rank}`,
  rankTop: 'Die hoogste rang! Hou dit so.',
  rankHow: (p) => `Wen lewendig: +${p.liveWin} punte (verloor: −${Math.abs(p.liveLoss)}). Teen Robot Rikus of ’n opname: +${p.otherWin} (verloor: −${Math.abs(p.otherLoss)}). Elke maand begin ’n nuwe seisoen: jou punte halveer, en jy hou ’n kenteken vir die beste rang wat jy bereik het.`,
  seasonBadges: 'Seisoenkentekens:',
  seasonReward: (rank, emoji) => `Nuwe seisoen! Jy hou ’n ${rank}-kenteken ${emoji}`,
  changeLook: 'Verander jou styl',
  duelGhostHit: (name, m) => `${name} se toring is ${m} m korter!`,
  duelYou: 'Jy',
  duelLeft: (name) => `${name} het die wedstryd verlaat.`,
  duelConnLost: 'Die verbinding het weggeval. Hierdie wedstryd tel nie.',
  // results
  duelWon: 'Jy het gewen!',
  duelLost: 'Jy het verloor',
  duelWhyGoal: 'Eerste tot 50 m!',
  duelWhyTheyGoal: (name) => `${name} was eerste by 50 m.`,
  duelWhyTheyFell: (name) => `${name} se toring het geval.`,
  duelWhyTheyLeft: (name) => `${name} het die wedstryd verlaat.`,
  duelWhyTheyQuit: (name) => `${name} het opgehou.`,
  duelWhyYouFell: 'Jou toring het eerste geval.',
  duelWhyYouQuit: 'Jy het opgehou.',
  duelAgain: 'Nog ’n wedstryd',
  duelShareHead: 'Stapel Uitdagersreeks ⚔️',
  duelShareLine: (you, name, them, won) => `Ek ${you} · ${name} ${them}: ${won ? 'gewen! 🏆' : 'verloor'}`,
  duelShareInvite: 'Kan jy my klop? Speel teen my rondte:',
  // somebody's run in a link (?teen=)
  duelLinkTitle: (name) => `${name} daag jou uit!`,
  duelLinkSub: (height) => `Bou dieselfde toring kop-aan-kop teen hul rondte (${height}).`,
  duelLinkPlay: 'Aanvaar die uitdaging',
  // --- Taal (1.9; js/core/i18n.js) ---
  language: 'Taal',
  langPick: 'Kies jou taal · Choose your language',
  langNames: { af: 'Afrikaans', en: 'English' },
};

/** Weather display info. Keys match WEATHER_TYPES in config.js. */
export const WEATHER_INFO = {
  wind:    { emoji: '💨', name: 'Wind',        desc: (dir) => (dir < 0 ? 'Die wind waai na links ←' : 'Die wind waai na regs →') },
  gust:    { emoji: '🌪️', name: 'Warrelwind',  desc: () => 'Rukwinde van alle kante!' },
  rain:    { emoji: '🌧️', name: 'Reën',        desc: (dir) => (dir < 0 ? 'Glibberig! Blokke gly na links ←' : 'Glibberig! Blokke gly na regs →') },
  storm:   { emoji: '⛈️', name: 'Donderstorm', desc: () => 'Pasop vir die weerlig!' },
  hail:    { emoji: '🌨️', name: 'Hael',        desc: () => 'Haelkorrels tref jou toring!' },
  fog:     { emoji: '🌫️', name: 'Mis',         desc: () => 'Jy sien skaars waar die blok gaan land…' },
  heat:    { emoji: '☀️', name: 'Hittegolf',   desc: () => 'Die hyskraan jaag!' },
  rainbow: { emoji: '🌈', name: 'Reënboog',    desc: () => 'Dubbele punte vir elke Perfek!' },
};

/** Visitor display info (banner, share line, menu). Keys match VISITOR_TYPES in config.js. */
export const VISITOR_INFO = {
  monkey: { emoji: '🐒', name: 'Blouaap', hint: 'Land ’n Perfek, anders gooi hy blokke af!' },
  clown: { emoji: '🤡', name: 'Hanswors', hint: 'Geskenk: ’n nuwe fondament!' },
  thief: { emoji: '🦹', name: 'Skelm Sakkie', hint: 'Vang hom!' },
};

/** Uitdagersreeks punishments (the first to a height mark chooses one). Keys match DUEL.punishments. */
export const PUNISH_INFO = {
  monkey: { emoji: '🐒', name: 'Blouaap', what: 'Gooi blokke af' },
  thief: { emoji: '🦹', name: 'Skelm Sakkie', what: 'Steel blokke' },
  fog: { emoji: '🌫️', name: 'Mis', what: '3 blokke blind' },
  heat: { emoji: '☀️', name: 'Hittegolf', what: 'Hyskraan jaag' },
};
/** Power-ups (js/core/economy.js POWERUPS): Oefen, and the Daily Tower's free Fondamentblok. */
export const POWERUP_INFO = {
  foundation: { emoji: '🧱', name: 'Fondamentblok', what: 'Jou volgende blok is ’n lang sementblok: ’n nuwe fondament' },
  slow: { emoji: '🐢', name: 'Stadige hyskraan', what: 'Die hyskraan swaai stadiger vir 5 blokke' },
  shield: { emoji: '🛡️', name: 'Skild', what: 'Die volgende aap of skelm bons af' },
  heart: { emoji: '❤️', name: 'Ekstra hartjie', what: 'Kry een hartjie terug' },
};

/** Uitdagersreeks looks (js/core/economy.js COSMETICS): what an opponent sees of you. */
export const COSMETIC_INFO = {
  frame: {
    hout: { name: 'Hout' }, see: { name: 'See' }, goud: { name: 'Goud' }, springbok: { name: 'Groen en goud' },
    vuur: { name: 'Vuur' }, diamant: { name: 'Diamant' },
  },
  badge: {
    geen: { name: 'Geen' }, leeu: { name: 'Leeu' }, vuur: { name: 'Vuur' }, rugby: { name: 'Rugby' }, olifant: { name: 'Olifant' },
    arend: { name: 'Visarend' }, kroon: { name: 'Kroon' }, 's-brons': { name: 'Seisoen: Brons' }, 's-silwer': { name: 'Seisoen: Silwer' },
    's-goud': { name: 'Seisoen: Goud' }, 's-platinum': { name: 'Seisoen: Platinum' }, 's-diamant': { name: 'Seisoen: Diamant' },
  },
  title: {
    bouer: { name: 'Bouer' }, hyskraanheld: { name: 'Hyskraanheld' }, perfekmeester: { name: 'Perfek-meester' },
    wolkekrabber: { name: 'Wolkekrabber' }, toringkoning: { name: 'Toringkoning' },
  },
  celebration: {
    konfetti: { name: 'Konfetti' }, vuurwerk: { name: 'Vuurwerk' }, vuvuzela: { name: 'Vuvuzela' }, braai: { name: 'Braai' }, skrum: { name: 'Skrum' },
  },
  style: {
    gewoon: { name: 'Gewoon' }, pet: { name: 'Pet' }, sonbril: { name: 'Sonbril' }, hoed: { name: 'Hoed' }, kroon: { name: 'Kroon' },
  },
};

/** Duel ranks (js/core/economy.js RANKS). */
export const RANK_INFO = {
  brons: { name: 'Brons' }, silwer: { name: 'Silwer' }, goud: { name: 'Goud' }, platinum: { name: 'Platinum' }, diamant: { name: 'Diamant' },
};

/** Added after 🦹 in the share line when the player caught the thief. */
export const CAUGHT_EMOJI = '✋';
/** Added after a visitor the player's Skild (a power-up) kept off. */
export const SHIELD_EMOJI = '🛡️';

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
