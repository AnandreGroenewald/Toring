// Sponsor logic: name rules (and that the site and the Worker agree on them), the feed,
// the billboard rotation, the names on the blocks and the browser feed loader.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as rules from '../js/core/nameRules.js';
import * as server from '../server/src/moderation.js';
import {
  sanitizeName, sanitizeTagline, isNameAllowed, isTaglineAllowed, hostnameOf, normalizeFeed, pickPremium,
  createBlockNamer, canNameShape, NAME_CAPABLE_SHAPES, PILLAR_MAX_CHARS, NAME_MAX, TAGLINE_MAX,
} from '../js/core/sponsors.js';
import { loadSponsors, FEED_CACHE_KEY, FEED_CACHE_MAX_AGE_MS } from '../js/sponsorsFeed.js';
import { SHAPE_IDS } from '../js/config.js';
import { createSequence } from '../js/core/sequence.js';
import { addDays } from '../js/core/daily.js';
import { SPONSOR, SPONSOR_API_URL, salesEnabled } from '../js/sponsorConfig.js';

const ROOT = new URL('..', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');

// ---------------------------------------------------------------------------
// Name rules: the site and the Worker must agree on every name
// ---------------------------------------------------------------------------

const ZW = '​';
const RLO = '‮';

// [input, expected code (null = allowed), expected stored value when allowed]
const NAMES = [
  // fine
  ['Smit & Seuns', null, 'Smit & Seuns'],
  ['Kafee Ôkêï', null, 'Kafee Ôkêï'],
  ['Hoërskool Ermelo', null, 'Hoërskool Ermelo'],
  ['7-Eleven', null, '7-Eleven'],
  ['Smith & Co.', null, 'Smith & Co.'],
  ["Bakkery 'n Lekker", null, "Bakkery 'n Lekker"],
  ['Bakkery ʼn Lekker', null, 'Bakkery ’n Lekker'],
  ['Moer en Bout', null, 'Moer en Bout'],
  ['Fokus Fotografie', null, 'Fokus Fotografie'],
  ['Therapist Jan', null, 'Therapist Jan'],
  ['Naaimasjien Nel', null, 'Naaimasjien Nel'],
  ['Cum Laude Kuns', null, 'Cum Laude Kuns'],
  ['Niger Trading', null, 'Niger Trading'],
  ['Test Kitchen', null, 'Test Kitchen'],
  ['Kakkerlak Beheer', null, 'Kakkerlak Beheer'],
  ['Bass Guitars', null, 'Bass Guitars'],
  ['Mr. Smith', null, 'Mr. Smith'],
  // normalised
  ['  Twee   Spasies  ', null, 'Twee Spasies'],
  ['DIE GROOT WINKEL', null, 'Die Groot Winkel'],
  ['BMW SA', null, 'BMW SA'],
  ['Kaap!!!', null, 'Kaap!'],
  [`Ex${ZW}ample`, null, 'Example'],
  ['ＢＡＫＫＥＲＹ', null, 'Bakkery'], // full-width, folded by NFKC
  ['Café Kâree', null, 'Café Kâree'], // decomposed accents
  [`${RLO}Moc.kooB`, null, 'Moc.kooB'], // the override character is dropped, not obeyed
  ['x'.repeat(22), null, 'x'.repeat(22)],
  // wrong shape
  ['', 'invalid_name'],
  [' ', 'invalid_name'],
  ['A', 'invalid_name'],
  ['!!!', 'invalid_name'],
  ['x'.repeat(23), 'invalid_name'],
  ['Ê'.repeat(23), 'invalid_name'],
  ['emoji 😀', 'invalid_name'],
  ['Ѕhit', 'invalid_name'], // Cyrillic Ѕ
  ['Αlpha', 'invalid_name'], // Greek Α
  ['a@b.com', 'invalid_name'],
  ['$h1t', 'invalid_name'],
  ['Kafee <b>', 'invalid_name'],
  ['日本語', 'invalid_name'],
  ['\ud800', 'invalid_name'], // lone surrogate
  // rude, in any disguise
  ['ＳＨＩＴ', 'name_rejected'],
  ['f.u.c.k', 'name_rejected'],
  ['Sh1t Happens', 'name_rejected'],
  [`fu${ZW}ck`, 'name_rejected'],
  [`${RLO}fuck`, 'name_rejected'],
  ['fuuuuck', 'name_rejected'],
  ['niiiiggger', 'name_rejected'],
  ['N1GGER', 'name_rejected'],
  ['Fokken Mooi', 'name_rejected'],
  ['Kak Kafee', 'name_rejected'],
  ['Poes', 'name_rejected'],
  ['Sex Shop', 'name_rejected'],
  ['Hitler Burgers', 'name_rejected'],
  ['Hoer & Seun', 'name_rejected'],
  // reserved
  ['Stapel', 'name_rejected'],
  ['ADMIN', 'name_rejected'],
  ['test', 'name_rejected'],
  ['Paystack Pro', 'name_rejected'],
  ['Sp0rtscard Shop', 'name_rejected'],
  ['Jou advertensie hier', 'name_rejected'],
  ['Stapel Bouers', 'name_rejected'],
  // urls, e-mail-ish, phone numbers
  ['www winkel', 'name_rejected'],
  ['koop.co.za', 'name_rejected'],
  ['https winkel', 'name_rejected'],
  ['082 555 1234', 'name_rejected'],
  ['Bel 0821234567', 'name_rejected'],
  ['1 2 3 4 5 6 7', 'name_rejected'],
];

const TAGLINES = [
  ['', null, null],
  [undefined, null, null],
  ['   ', null, null],
  ['20% afslag, net hier!', null, '20% afslag, net hier!'],
  ['Altyd vars. Net vir jou', null, 'Altyd vars. Net vir jou'],
  ['Goedkoop & vinnig?', null, 'Goedkoop & vinnig?'],
  ['x'.repeat(40), null, 'x'.repeat(40)],
  ['x'.repeat(41), 'invalid_tagline'],
  ['a', 'invalid_tagline'],
  ['😀 hi', 'invalid_tagline'],
  ['Kom kuier @ ons', 'invalid_tagline'],
  ['Besoek abc.com', 'tagline_rejected'],
  ['Fok die pryse', 'tagline_rejected'],
  [`Be${ZW}sig`, null, 'Besig'],
];

test('the Worker and the site use the very same rule module', () => {
  for (const name of Object.keys(rules)) assert.equal(server[name], rules[name], `server/src/moderation.js must re-export ${name}`);
  assert.equal(server.NAME_MAX, NAME_MAX);
  assert.equal(server.TAGLINE_MAX, TAGLINE_MAX);
  assert.equal(SPONSOR.maxNameLen, NAME_MAX, 'sponsorConfig.js maxNameLen must match the server limit');
  assert.equal(SPONSOR.maxTaglineLen, TAGLINE_MAX, 'sponsorConfig.js maxTaglineLen must match the server limit');
});

test('names: the site and the Worker agree on a corpus of tricky names', () => {
  for (const [raw, code, value] of NAMES) {
    const label = JSON.stringify(raw);
    const s = server.checkName(raw);
    const c = isNameAllowed(raw);
    assert.equal(c.ok, s.ok, `${label}: ok`);
    assert.equal(s.ok, code === null, `${label}: expected ${code ?? 'allowed'}, server said ${s.ok ? 'allowed' : s.code}`);
    if (s.ok) {
      assert.equal(s.value, value, `${label}: stored value`);
      assert.equal(c.value, s.value, `${label}: client value`);
      assert.equal(c.reason, null);
      assert.equal(sanitizeName(raw), s.value, `${label}: sanitizeName = stored value`);
    } else {
      assert.equal(s.code, code, label);
      assert.equal(c.code, s.code, `${label}: code`);
      assert.match(c.reason, /^(too_short|too_long|bad_chars|symbols|contact|reserved|blocked)$/, `${label}: reason`);
    }
  }
});

test('taglines: the site and the Worker agree', () => {
  for (const [raw, code, value] of TAGLINES) {
    const label = JSON.stringify(raw);
    const s = server.checkTagline(raw);
    const c = isTaglineAllowed(raw);
    assert.equal(c.ok, s.ok, label);
    assert.equal(s.ok, code === null, `${label}: server said ${s.ok ? 'allowed' : s.code}`);
    if (s.ok) {
      assert.equal(s.value, value, label);
      assert.equal(c.value, s.value, label);
    } else {
      assert.equal(c.code, code, label);
      assert.equal(s.code, code, label);
    }
  }
});

test('the owner (admin) may skip the word lists but not the character rules', () => {
  assert.equal(isNameAllowed('Stapel', { admin: true }).ok, true);
  assert.equal(server.checkName('Stapel', { admin: true }).ok, true);
  assert.equal(isNameAllowed('Sex Shop', { admin: true }).ok, true);
  assert.equal(isNameAllowed('emoji 😀', { admin: true }).ok, false);
  assert.equal(isNameAllowed('koop.co.za', { admin: true }).ok, false);
  assert.equal(isNameAllowed('x'.repeat(30), { admin: true, max: 40 }).ok, true);
});

test('sanitizeName: what is shown is clean, short and never throws', () => {
  assert.equal(sanitizeName(`${RLO}Bak${ZW}kery\u0007`), 'Bakkery');
  assert.equal(sanitizeName('Pizza 🍕 Palace'), 'Pizza Palace');
  assert.equal(sanitizeName('x'.repeat(100)), 'x'.repeat(22));
  assert.equal(sanitizeName('x'.repeat(100), 8), 'x'.repeat(8));
  assert.equal(sanitizeName('Smit en Seuns, Edms', 12), 'Smit en Seun', 'cut by characters');
  assert.equal(sanitizeName('Een twee drie vier vyf', 9), 'Een twee', 'no dangling space after the cut');
  assert.equal(sanitizeName('DIE GROOT WINKEL'), 'Die Groot Winkel');
  assert.equal(sanitizeName('<script>alert(1)</script>'), 'scriptalert1script');
  assert.equal(sanitizeName('Ê'.repeat(5)), 'ÊÊÊÊÊ');
  assert.equal(sanitizeName('20% off, now'), '20 off now', 'a name has no % or ,');
  assert.equal(sanitizeTagline('20% afslag, net hier!'), '20% afslag, net hier!');
  assert.equal(sanitizeTagline('x'.repeat(100)), 'x'.repeat(40));
  for (const weird of [undefined, null, 0, 12, NaN, {}, [], () => 1, Symbol.iterator, true, '\ud800\ud800', 'x'.repeat(1e6)]) {
    assert.equal(typeof sanitizeName(weird), 'string');
    assert.equal(typeof sanitizeTagline(weird), 'string');
    assert.equal(isNameAllowed(weird).ok, false);
  }
  assert.equal(sanitizeName(undefined, 'abc'), '');
  // idempotent
  for (const [raw] of NAMES) assert.equal(sanitizeName(sanitizeName(raw)), sanitizeName(raw), JSON.stringify(raw));
});

test('hostnameOf shows a plain hostname for https addresses only', () => {
  assert.equal(hostnameOf('https://www.example.co.za/winkel?x=1'), 'example.co.za');
  assert.equal(hostnameOf('https://shop.example.com'), 'shop.example.com');
  for (const bad of ['http://example.com', 'javascript:alert(1)', 'example.com', '', null, undefined, 5]) assert.equal(hostnameOf(bad), '');
});

// ---------------------------------------------------------------------------
// The feed
// ---------------------------------------------------------------------------

const TODAY = '2026-10-06';
const EMPTY = { house: { menu: null }, block: [], premium: [] };

test('sponsors.json is the sportscard.co.za house ad with empty paid lists', () => {
  const json = JSON.parse(read('sponsors.json'));
  assert.deepEqual(json, {
    version: 1,
    house: { menu: { title: 'sportscard.co.za', text: 'Besoek sportscard.co.za', url: 'https://sportscard.co.za', label: 'Advertensie' } },
    block: [],
    premium: [],
  });
  assert.deepEqual(normalizeFeed(json, null, TODAY), {
    house: { menu: { title: 'sportscard.co.za', text: 'Besoek sportscard.co.za', url: 'https://sportscard.co.za/', label: 'Advertensie' } },
    block: [],
    premium: [],
  });
});

test('normalizeFeed never throws and falls back to an empty feed', () => {
  const circular = {};
  circular.block = [circular];
  circular.house = circular;
  const nasty = [undefined, null, 0, 7, 'x', true, [], [1, 2], {}, circular, { block: 'no', premium: 5, house: [] },
    { block: [null, 1, 'a', [], { name: {} }, { name: 5 }, { name: [] }], premium: [null, { name: 'x'.repeat(1e5) }], house: { menu: 5 } },
    { get block() { throw new Error('boom'); } }];
  for (const a of nasty) {
    for (const b of nasty) {
      const f = normalizeFeed(a, b, TODAY);
      assert.ok(Array.isArray(f.block) && Array.isArray(f.premium) && f.house && 'menu' in f.house);
    }
  }
  assert.deepEqual(normalizeFeed(null, null, TODAY), EMPTY);
  assert.deepEqual(normalizeFeed(undefined, undefined, 'not a date'), EMPTY);
  assert.doesNotThrow(() => normalizeFeed({}, {}, undefined));
});

test('normalizeFeed: static entries, "until" is inclusive and bad dates drop the entry', () => {
  const st = {
    block: [
      { name: 'Altyd Hier' },
      { name: 'Tot Vandag', until: TODAY },
      { name: 'Gister Verby', until: addDays(TODAY, -1) },
      { name: 'Volgende Maand', until: addDays(TODAY, 30) },
      { name: 'Slegte Datum', until: '2026-13-45' },
      { name: 'Ander Formaat', until: '6 Oktober 2026' },
      { name: 'Nommer Datum', until: 20261231 },
      { name: 'Leeg Datum', until: '' },
    ],
    premium: [{ id: 'p1', name: 'Groot Bord', tagline: 'Net die beste!', url: 'groot-bord.co.za', until: addDays(TODAY, -1) }],
  };
  const f = normalizeFeed(st, null, TODAY);
  assert.deepEqual(f.block.map((b) => b.name), ['Altyd Hier', 'Tot Vandag', 'Volgende Maand', 'Leeg Datum']);
  assert.deepEqual(f.premium, []);
  assert.deepEqual(normalizeFeed(st, null, addDays(TODAY, 1)).block.map((b) => b.name), ['Altyd Hier', 'Volgende Maand', 'Leeg Datum']);
  assert.ok(f.block.every((b) => /^[A-Za-z0-9_-]{1,80}$/.test(b.id) && Object.keys(b).join() === 'id,name'));
});

test('normalizeFeed: API and static lists are merged, the API wins duplicates', () => {
  const api = {
    updatedAt: 1,
    block: [{ id: 'a1', name: 'Bakkery Bos' }, { id: 'a2', name: 'Kafee Kom' }],
    premium: [{ id: 'pa', name: 'Groot Bord', tagline: null, url: null }],
  };
  const st = {
    block: [{ id: 'm1', name: 'Handgemaak' }, { id: 'm2', name: 'bakkery  bos' }, { id: 'a2', name: 'Anders' }, { name: 'Kafee Kom' }],
    premium: [{ id: 'pm', name: 'Tweede Bord', tagline: 'Kom kuier', url: 'https://tweede.co.za' }],
  };
  const f = normalizeFeed(st, api, TODAY);
  assert.deepEqual(f.block, [{ id: 'a1', name: 'Bakkery Bos' }, { id: 'a2', name: 'Kafee Kom' }, { id: 'm1', name: 'Handgemaak' }]);
  assert.deepEqual(f.premium, [
    { id: 'pa', name: 'Groot Bord', tagline: '', url: '' },
    { id: 'pm', name: 'Tweede Bord', tagline: 'Kom kuier', url: 'https://tweede.co.za/' },
  ]);
  // without an API answer the static list stands alone, and an empty API answer changes nothing static
  assert.deepEqual(normalizeFeed(st, null, TODAY).block.map((b) => b.id), ['m1', 'm2', 'a2', 's-kafeekom']);
  assert.deepEqual(normalizeFeed(st, { block: [], premium: [] }, TODAY), normalizeFeed(st, null, TODAY));
  // only the API
  assert.deepEqual(normalizeFeed(null, api, TODAY).block.map((b) => b.id), ['a1', 'a2']);
});

test('normalizeFeed: everything is sanitised', () => {
  const f = normalizeFeed({ house: { menu: { title: 'Hallo', url: 'javascript:alert(1)' } } }, {
    block: [
      { id: 'x/../y', name: `${RLO}Fris${ZW}se Kos <img src=x onerror=alert(1)>` },
      { id: 'b2', name: 'koop.co.za' }, // contact details are no name
      { id: 'b3', name: '😀' },
      { id: 'b4', name: 'DIE GROOT WINKEL' },
      { id: 'b5', name: 'x'.repeat(500) },
      { id: 'b6', name: 7 },
      'Bakkery',
    ],
    premium: [{ id: 'p1', name: 'Goeie Winkel', tagline: `Kom ${ZW}kuier!! <b>`, url: 'javascript:alert(1)' },
      { id: 'p2', name: 'Tweede Winkel', tagline: 'x', url: 'http://www.Tweede.co.za:8080/' },
      { id: 'p3', name: 'Derde Winkel', url: 'WWW.Derde.CO.ZA/pad?x=1#top' }],
  }, TODAY);
  assert.equal(f.house.menu, null, 'a javascript: link is never a house ad');
  assert.equal(f.block[0].name, 'Frisse Kos img srcx on');
  assert.ok(!/[<>=()]/.test(f.block[0].name));
  assert.match(f.block[0].id, /^s-[a-z0-9]+$/, 'an unusable id is replaced by one made from the name');
  assert.deepEqual(f.block.slice(1).map((b) => b.name), ['Die Groot Winkel', 'x'.repeat(22)]);
  assert.deepEqual(f.premium, [
    { id: 'p1', name: 'Goeie Winkel', tagline: 'Kom kuier! b', url: '' },
    { id: 'p2', name: 'Tweede Winkel', tagline: '', url: '' },
    { id: 'p3', name: 'Derde Winkel', tagline: '', url: 'https://www.derde.co.za/pad?x=1' },
  ]);
  for (const b of f.block) assert.ok(isNameAllowed(b.name, { admin: true }).ok);
});

test('normalizeFeed: house ad only from sponsors.json, label defaults to Advertensie', () => {
  const h = (menu) => normalizeFeed({ house: { menu } }, null, TODAY).house.menu;
  assert.deepEqual(h({ title: 'Sportwinkel', text: 'Kom kyk', url: 'http://sportwinkel.co.za' }), { title: 'Sportwinkel', text: 'Kom kyk', url: 'https://sportwinkel.co.za/', label: 'Advertensie' });
  assert.equal(h({ title: 'Geen url', text: 'x' }), null);
  assert.equal(h({ title: '', text: 'x', url: 'https://x.co.za' }), null);
  assert.equal(h('nope'), null);
  assert.equal(h({ title: 'T'.repeat(300), text: 'x', url: 'https://x.co.za' }).title.length, 60);
  assert.equal(normalizeFeed(null, { house: { menu: { title: 'Indringer', url: 'https://evil.example' } } }, TODAY).house.menu, null);
});

test('normalizeFeed: lists are capped', () => {
  const many = (n) => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, name: `Sponsor ${String.fromCharCode(97 + (i % 26))}${'x'.repeat(i % 7)}${i}` }));
  const f = normalizeFeed(null, { block: many(500), premium: many(100) }, TODAY);
  assert.equal(f.block.length, 200);
  assert.equal(f.premium.length, 20);
});

// ---------------------------------------------------------------------------
// The billboard
// ---------------------------------------------------------------------------

const P = (id) => ({ id, name: `Bord ${id}`, tagline: '', url: '' });

test('pickPremium: none, one, and a deterministic daily rotation', () => {
  assert.equal(pickPremium([], TODAY), null);
  assert.equal(pickPremium(null, TODAY), null);
  assert.equal(pickPremium(undefined, TODAY), null);
  assert.equal(pickPremium([null, 5, {}], TODAY), null);
  const one = [P('a')];
  for (let d = 0; d < 10; d++) assert.equal(pickPremium(one, addDays(TODAY, d)).id, 'a');

  const three = [P('c'), P('a'), P('b')];
  const seen = [];
  for (let d = 0; d < 30; d++) seen.push(pickPremium(three, addDays(TODAY, d)).id);
  for (const id of ['a', 'b', 'c']) assert.equal(seen.filter((x) => x === id).length, 10, `${id} gets a third of the days`);
  for (let d = 1; d < 30; d++) assert.notEqual(seen[d], seen[d - 1], 'a new sponsor every day');
  assert.deepEqual(seen.slice(0, 3).sort(), ['a', 'b', 'c']);
  assert.deepEqual(seen.slice(0, 3), seen.slice(3, 6), 'a fixed cycle');

  // the order of the input doesn't matter, and the input isn't touched
  const copy = JSON.stringify(three);
  for (const perm of [[0, 1, 2], [2, 1, 0], [1, 2, 0]]) {
    const shuffled = perm.map((i) => three[i]);
    for (let d = 0; d < 6; d++) assert.equal(pickPremium(shuffled, addDays(TODAY, d)).id, seen[d]);
  }
  assert.equal(JSON.stringify(three), copy);
  // dates before the game's first day still work, and a broken date doesn't throw
  assert.ok(pickPremium(three, '2020-01-01'));
  assert.ok(pickPremium(three, 'nonsense'));
  assert.ok(pickPremium(three, undefined));
});

// ---------------------------------------------------------------------------
// Names on the blocks
// ---------------------------------------------------------------------------

const SEED = 'stapel-2026-10-06';
const S = (id, name) => ({ id, name });
const SIX = [S('s1', 'Bakkery Bos'), S('s2', 'Kafee Kom'), S('s3', 'Smit & Seuns'), S('s4', 'Garage'), S('s5', 'Pizza'), S('s6', 'Optiek Oos')];

function run(sponsors, seed, count, { resolver = true } = {}) {
  const seq = createSequence(seed);
  const namer = createBlockNamer(sponsors, seed, resolver ? (i) => seq.block(i) : undefined);
  const out = [];
  for (let i = 0; i < count; i++) {
    const spec = seq.block(i);
    out.push({ spec, name: namer(spec) });
  }
  return out;
}

test('name-capable shapes cover every shape except the cube and the pillar', () => {
  assert.deepEqual([...NAME_CAPABLE_SHAPES].sort(), SHAPE_IDS.filter((s) => s !== 'cube' && s !== 'pillar').sort());
  assert.ok(canNameShape('plank', 'Een Baie Lang Naam Hier'));
  assert.ok(!canNameShape('cube', 'A1'));
  assert.ok(canNameShape('pillar', 'x'.repeat(PILLAR_MAX_CHARS)));
  assert.ok(!canNameShape('pillar', 'x'.repeat(PILLAR_MAX_CHARS + 1)));
  assert.ok(!canNameShape('nonsense', 'Naam'));
});

test('createBlockNamer: no sponsors, no names', () => {
  for (const none of [[], null, undefined, 'x', {}, [null, 3, {}, { id: 'a' }, { id: 'b', name: '😀' }]]) {
    const namer = createBlockNamer(none, SEED);
    assert.equal(typeof namer, 'function');
    for (let i = 0; i < 30; i++) assert.equal(namer({ i, shape: 'plank' }), null);
  }
  const namer = createBlockNamer(SIX, SEED);
  assert.equal(namer(null), null);
  assert.equal(namer('plank'), null);
  assert.equal(namer(undefined), null);
});

test('createBlockNamer: deterministic per seed, different order for other seeds', () => {
  const a = run(SIX, SEED, 120).map((x) => x.name);
  const b = run(SIX, SEED, 120).map((x) => x.name);
  assert.deepEqual(a, b);
  assert.equal(a[0] !== null, true, 'the first block is a plank and carries a name');
  const orders = new Set();
  for (let d = 0; d < 12; d++) {
    const names = run(SIX, `stapel-2026-11-${String(d + 1).padStart(2, '0')}`, 40).map((x) => x.name).filter(Boolean);
    orders.add(names.slice(0, 6).join('|'));
  }
  assert.ok(orders.size > 6, 'every day starts its round with a different sponsor order');
  // the feed's own order is irrelevant
  const reversed = run([...SIX].reverse(), SEED, 120).map((x) => x.name);
  assert.deepEqual(reversed, a);
});

test('createBlockNamer: independent of call order (memoised by block number)', () => {
  const seq = createSequence(SEED);
  const inOrder = run(SIX, SEED, 150).map((x) => x.name);
  const namer = createBlockNamer(SIX, SEED, (i) => seq.block(i));
  const idx = Array.from({ length: 150 }, (_, i) => i);
  // a fixed pseudo-shuffle, then every block twice
  const shuffled = idx.map((i) => (i * 37) % 150);
  assert.equal(new Set(shuffled).size, 150);
  const got = [];
  for (const i of [...shuffled, ...idx.slice().reverse()]) got[i] = namer(seq.block(i));
  assert.deepEqual(got, inOrder);
  for (const i of [5, 0, 149, 5, 77]) assert.equal(namer(seq.block(i)), inOrder[i]);
  // without a resolver, blocks asked for in order give the same answer
  assert.deepEqual(run(SIX, SEED, 150, { resolver: false }).map((x) => x.name), inOrder);
});

test('createBlockNamer: only name-capable shapes, pillars only when the name fits', () => {
  const blocks = run(SIX, SEED, 400);
  const shapesSeen = new Set(blocks.map((b) => b.spec.shape));
  assert.ok(shapesSeen.has('cube') && shapesSeen.has('pillar'), 'the test tower has cubes and pillars');
  for (const { spec, name } of blocks) {
    if (spec.shape === 'cube') assert.equal(name, null);
    else if (spec.shape === 'pillar') assert.ok(name === null || [...name].length <= PILLAR_MAX_CHARS);
    else assert.notEqual(name, null, `${spec.shape} #${spec.i} should be named`);
  }
  assert.ok(blocks.some((b) => b.spec.shape === 'pillar' && b.name), 'short names do go on pillars');
  // when every name is too long for a pillar, no pillar is named
  const longNames = [S('l1', 'Langenaam Wynkelder'), S('l2', 'Die Groot Drukkery')];
  const tower = run(longNames, SEED, 400);
  for (const { spec, name } of tower) if (spec.shape === 'pillar' || spec.shape === 'cube') assert.equal(name, null);
});

test('createBlockNamer: every sponsor gets the same number of names, give or take one, over any prefix', () => {
  const mixes = [SIX, [S('a', 'Een')], [S('a', 'Een'), S('b', 'Twee')], [...SIX, S('s7', 'Langenaam Wynkelder'), S('s8', 'Die Groot Drukkery')]];
  for (const [m, sponsors] of mixes.entries()) {
    for (const seed of [SEED, 'stapel-2026-12-25', 'oefen-42']) {
      const counts = new Map(sponsors.map((s) => [s.name, 0]));
      let named = 0;
      for (const { name } of run(sponsors, seed, 500)) {
        if (!name) continue;
        counts.set(name, counts.get(name) + 1);
        named++;
        const v = [...counts.values()];
        assert.ok(Math.max(...v) - Math.min(...v) <= 1, `mix ${m}, ${seed}: unfair after ${named} names: ${JSON.stringify([...counts])}`);
      }
      assert.ok(named > 300);
    }
  }
});

test('createBlockNamer: messy sponsors are cleaned and a missing index counts up', () => {
  const namer = createBlockNamer([{ id: 'a', name: '  Netjies  ' }, { id: 'a', name: 'Dubbel' }, { id: 'b', name: 'Tweede' }, null], 7);
  const got = [0, 1, 2, 3].map((i) => namer({ i, shape: 'plank' }));
  assert.deepEqual(new Set(got), new Set(['Netjies', 'Tweede']));
  const auto = createBlockNamer(SIX, 7);
  const viaIndex = createBlockNamer(SIX, 7);
  for (let i = 0; i < 6; i++) assert.equal(auto({ shape: 'plank' }), viaIndex({ i, shape: 'plank' }));
  // a resolver that fails doesn't break the namer
  const broken = createBlockNamer(SIX, 7, () => { throw new Error('x'); });
  assert.equal(typeof broken({ i: 3, shape: 'plank' }), 'string');
});

// ---------------------------------------------------------------------------
// The browser loader
// ---------------------------------------------------------------------------

function memStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => void data.set(k, String(v)),
    removeItem: (k) => void data.delete(k),
    data,
  };
}

const json = (body, status = 200) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
const STATIC = { version: 1, house: { menu: { title: 'sportscard.co.za', text: 'Besoek sportscard.co.za', url: 'https://sportscard.co.za', label: 'Advertensie' } }, block: [], premium: [] };
const API = { updatedAt: 5, block: [{ id: 'a1', name: 'Bakkery Bos' }], premium: [{ id: 'p1', name: 'Groot Bord', tagline: 'Kom kuier', url: 'https://groot.co.za' }] };
const API_URL = 'https://stapel-borge.example.workers.dev';

/** A fake network: routes by URL. Handlers may return a Response, throw, or return a pending promise. */
function net(routes) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    for (const [part, handler] of Object.entries(routes)) {
      if (url.endsWith(part)) return typeof handler === 'function' ? handler(url, init) : handler.clone();
    }
    return json({}, 404);
  };
  return { fetchImpl, calls };
}

const stored = (st) => JSON.parse(st.getItem(FEED_CACHE_KEY));

test('loadSponsors without a backend: only sponsors.json is read', async () => {
  const st = memStorage();
  const { fetchImpl, calls } = net({ 'sponsors.json': json(STATIC) });
  const feed = await loadSponsors({ apiUrl: '', fetchImpl, storage: st });
  assert.equal(feed.house.menu.title, 'sportscard.co.za');
  assert.deepEqual([feed.block, feed.premium], [[], []]);
  assert.deepEqual(calls.map((c) => c.url), ['sponsors.json']);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(stored(st).api, null);
  assert.equal(stored(st).static.house.menu.title, 'sportscard.co.za');
});

test('loadSponsors with a backend: merges the API and caches both answers', async () => {
  const st = memStorage();
  const { fetchImpl, calls } = net({ 'sponsors.json': json(STATIC), '/sponsors': json(API) });
  const feed = await loadSponsors({ apiUrl: `${API_URL}/`, fetchImpl, storage: st });
  assert.deepEqual(feed.block, [{ id: 'a1', name: 'Bakkery Bos' }]);
  assert.deepEqual(feed.premium, [{ id: 'p1', name: 'Groot Bord', tagline: 'Kom kuier', url: 'https://groot.co.za/' }]);
  assert.ok(calls.some((c) => c.url === `${API_URL}/sponsors`), 'no double slash');
  assert.equal(calls.find((c) => c.url.endsWith('/sponsors')).init.credentials, 'omit');
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(stored(st).api, API);
});

test('loadSponsors: a dead or broken API falls back to the cache, then to nothing', async () => {
  const cached = { v: 1, savedAt: 1_000, static: STATIC, api: API };
  const now = () => 1_000 + 3_600_000; // an hour old: not fresh enough to skip the network
  for (const bad of [json({}, 500), json('<html>nope</html>'), json('[]'), () => { throw new TypeError('offline'); }, json('x'.repeat(300_000))]) {
    const st = memStorage({ [FEED_CACHE_KEY]: JSON.stringify(cached) });
    const { fetchImpl } = net({ 'sponsors.json': json(STATIC), '/sponsors': bad });
    const feed = await loadSponsors({ apiUrl: API_URL, fetchImpl, storage: st, now });
    assert.deepEqual(feed.block, [{ id: 'a1', name: 'Bakkery Bos' }], 'cached sponsors are used');
    assert.equal(feed.house.menu.title, 'sportscard.co.za');
  }
  const st = memStorage();
  const { fetchImpl } = net({ 'sponsors.json': json(STATIC), '/sponsors': json({}, 503) });
  const feed = await loadSponsors({ apiUrl: API_URL, fetchImpl, storage: st });
  assert.deepEqual([feed.block, feed.premium], [[], []]);
  assert.equal(feed.house.menu.title, 'sportscard.co.za', 'the house ad still shows');
  assert.equal(st.getItem(FEED_CACHE_KEY) !== null, true, 'the static answer is cached');
});

test('loadSponsors: offline with no cache gives an empty feed; an old cached API answer is ignored', async () => {
  const down = () => { throw new TypeError('offline'); };
  const { fetchImpl } = net({ 'sponsors.json': down, '/sponsors': down });
  assert.deepEqual(await loadSponsors({ apiUrl: API_URL, fetchImpl, storage: memStorage() }), EMPTY);
  assert.deepEqual(await loadSponsors({ apiUrl: API_URL, fetchImpl: undefined, storage: memStorage() }).then((f) => f.block), []);

  const old = { v: 1, savedAt: 1_000, static: STATIC, api: API };
  const st = memStorage({ [FEED_CACHE_KEY]: JSON.stringify(old) });
  const feed = await loadSponsors({ apiUrl: API_URL, fetchImpl, storage: st, now: () => 1_000 + FEED_CACHE_MAX_AGE_MS + 1 });
  assert.deepEqual(feed.block, [], 'week-old sponsor list is stale');
  assert.equal(feed.house.menu.title, 'sportscard.co.za', 'but the house ad from the cache is fine');
});

test('loadSponsors: never waits longer than timeoutMs for a slow API; the cache is refreshed afterwards', async () => {
  let release;
  const slow = new Promise((resolve) => { release = () => resolve(json(API)); });
  const st = memStorage();
  const updates = [];
  const { fetchImpl } = net({ 'sponsors.json': json(STATIC), '/sponsors': () => slow });
  const t0 = Date.now();
  const feed = await loadSponsors({ apiUrl: API_URL, fetchImpl, storage: st, timeoutMs: 40, onUpdate: (f) => updates.push(f) });
  assert.ok(Date.now() - t0 < 1000);
  assert.deepEqual(feed.block, []);
  assert.equal(feed.house.menu.title, 'sportscard.co.za');
  release();
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(stored(st).api, API, 'the late answer reaches the cache for the next start');
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0].block, [{ id: 'a1', name: 'Bakkery Bos' }]);
});

test('loadSponsors: a cache from the last few minutes starts the game at once and is refreshed in the background', async () => {
  let release;
  const slow = new Promise((resolve) => { release = () => resolve(json({ ...API, block: [{ id: 'z9', name: 'Nuwe Borg' }] })); });
  const st = memStorage({ [FEED_CACHE_KEY]: JSON.stringify({ v: 1, savedAt: 5_000, static: STATIC, api: API }) });
  const updates = [];
  const { fetchImpl } = net({ 'sponsors.json': json(STATIC), '/sponsors': () => slow });
  const feed = await loadSponsors({ apiUrl: API_URL, fetchImpl, storage: st, timeoutMs: 60_000, now: () => 6_000, onUpdate: (f) => updates.push(f) });
  assert.deepEqual(feed.block, [{ id: 'a1', name: 'Bakkery Bos' }], 'cached answer, no 60 s wait');
  release();
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(updates[0].block, [{ id: 'z9', name: 'Nuwe Borg' }]);
  assert.equal(stored(st).api.block[0].id, 'z9');
});

test('loadSponsors survives a hostile environment', async () => {
  const throwingStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } };
  const { fetchImpl } = net({ 'sponsors.json': json(STATIC), '/sponsors': json(API) });
  const feed = await loadSponsors({ apiUrl: API_URL, fetchImpl, storage: throwingStorage });
  assert.equal(feed.block.length, 1);
  assert.equal((await loadSponsors({ apiUrl: API_URL, fetchImpl, storage: null })).block.length, 1);
  const thrower = { onUpdate: () => { throw new Error('callback bug'); } };
  assert.equal((await loadSponsors({ apiUrl: API_URL, fetchImpl, storage: memStorage(), ...thrower })).block.length, 1);
  const garbage = memStorage({ [FEED_CACHE_KEY]: '{not json' });
  assert.equal((await loadSponsors({ apiUrl: API_URL, fetchImpl, storage: garbage })).block.length, 1);
  const wrongShape = memStorage({ [FEED_CACHE_KEY]: JSON.stringify([1, 2]) });
  assert.equal((await loadSponsors({ apiUrl: API_URL, fetchImpl, storage: wrongShape })).block.length, 1);
  assert.deepEqual(await loadSponsors({ apiUrl: 12, staticUrl: null, timeoutMs: 'soon', fetchImpl: () => { throw new Error('x'); }, storage: null }), EMPTY);
});

// ---------------------------------------------------------------------------
// Config and the files the pages need
// ---------------------------------------------------------------------------

test('sponsorConfig: sales stay off until an API address is set', () => {
  assert.equal(salesEnabled(), !!SPONSOR_API_URL);
  assert.equal(typeof SPONSOR.contactEmail, 'string');
  assert.match(SPONSOR.termsVersion, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(SPONSOR.privacyVersion, /^\d{4}-\d{2}-\d{2}$/);
});

test('the legal pages carry the versions the sign-up form sends', () => {
  const version = (html) => /Weergawe:?\s*(?:<[^>]+>\s*)*(\d{4}-\d{2}-\d{2})/.exec(html)?.[1];
  assert.equal(version(read('terme.html')), SPONSOR.termsVersion);
  assert.equal(version(read('privaatheid.html')), SPONSOR.privacyVersion);
});

test('the legal pages are templates: banner, yellow placeholders, linked from the sign-up page', () => {
  const adverteer = read('adverteer.html');
  for (const page of ['terme.html', 'privaatheid.html']) {
    const html = read(page);
    assert.match(html, /Sjabloon — moet deur die eienaar voltooi en nagegaan word/, `${page}: template banner`);
    assert.match(html, /<link rel="stylesheet" href="css\/style\.css">\s*<link rel="stylesheet" href="css\/pages\.css">/);
    const bare = html.replace(/<span class="ph">\[\[[^\]]+\]\]<\/span>/g, '');
    assert.ok(!bare.includes('[['), `${page}: every [[placeholder]] is wrapped in <span class="ph">`);
    assert.ok((html.match(/class="ph"/g) || []).length >= 8, `${page}: has placeholders`);
    assert.match(adverteer, new RegExp(`<footer[\\s\\S]*href="${page.replace('.', '\\.')}"`), `adverteer.html footer links to ${page}`);
    for (const id of html.matchAll(/href="#(\w+)"/g)) assert.ok(html.includes(`id="${id[1]}"`), `${page}: #${id[1]} exists`);
  }
});

test('adverteer.js only uses names that js/core/sponsors.js exports', async () => {
  const mod = await import('../js/core/sponsors.js');
  const src = read('js/pages/adverteer.js');
  for (const m of src.matchAll(/\bmoderation\.(?!js\b)(\w+)/g)) assert.equal(typeof mod[m[1]], 'function', `moderation.${m[1]}`);
});
