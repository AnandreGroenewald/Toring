import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildShareText, shareResult, whatsappUrl } from '../js/core/share.js';

const NB = ' '; // fmtM / fmtInt use non-breaking spaces
const URL = 'https://anandregroenewald.github.io/Toring/';

function result(over = {}) {
  return {
    mode: 'daily',
    dateKey: '2026-10-06',
    dayNumber: 1,
    seed: 'stapel-2026-10-06',
    reason: 'flood',
    score: 1240,
    heightM: 37.46,
    blocksPlaced: 13,
    blocksDropped: 15,
    perfects: 7,
    maxCombo: 4,
    grid: 'PPGPPSPGPPPGSPX',
    weather: ['wind', 'rain', 'rainbow', 'storm'],
    durationMs: 90000,
    ...over,
  };
}

test('daily share text: exact format from the spec', () => {
  const r = result({ grid: 'PPGPPXPGPPPGSPX' });
  assert.equal(
    buildShareText(r, { url: URL }),
    [
      `Stapel #1 🏗️ 37,5${NB}m`,
      `⭐ 1${NB}240 · 🎯 7× Perfek · 🔥 4`,
      '🟩🟩🟨🟩🟩🟥🟩🟨🟩🟩',
      '🟩🟨🟧🟩🟥🌊',
      'Weer: 💨🌧️🌈⛈️',
      'Stapel hoog. Staan sterk.',
      URL,
    ].join('\n'),
  );
});

test('practice header', () => {
  const t = buildShareText(result({ mode: 'practice', dateKey: null, dayNumber: null }), { url: URL });
  assert.equal(t.split('\n')[0], `Stapel (oefen) 🏗️ 37,5${NB}m`);
});

test('decimal comma and rounding', () => {
  assert.equal(buildShareText(result({ heightM: 0 }), { url: URL }).split('\n')[0], `Stapel #1 🏗️ 0,0${NB}m`);
  assert.equal(buildShareText(result({ heightM: 102.04, dayNumber: 365 }), {}).split('\n')[0], `Stapel #365 🏗️ 102,0${NB}m`);
  assert.equal(buildShareText(result({ heightM: 1234.56 }), {}).split('\n')[0], `Stapel #1 🏗️ 1${NB}234,6${NB}m`);
  assert.equal(buildShareText(result({ score: 1234567 }), {}).split('\n')[1].split(' · ')[0], `⭐ 1${NB}234${NB}567`);
});

test('combo part omitted when maxCombo < 2', () => {
  for (const maxCombo of [0, 1]) {
    assert.equal(buildShareText(result({ maxCombo }), { url: URL }).split('\n')[1], `⭐ 1${NB}240 · 🎯 7× Perfek`);
  }
  assert.equal(buildShareText(result({ maxCombo: 2 }), { url: URL }).split('\n')[1], `⭐ 1${NB}240 · 🎯 7× Perfek · 🔥 2`);
  assert.equal(buildShareText(result({ perfects: 0, maxCombo: 0, score: 0 }), {}).split('\n')[1], '⭐ 0 · 🎯 0× Perfek');
});

test('reason suffix: 🌊 flood, 💥 lives, nothing for quit', () => {
  const grid = 'PGS';
  const row = (reason) => buildShareText(result({ grid, reason }), { url: URL }).split('\n')[2];
  assert.equal(row('flood'), '🟩🟨🟧🌊');
  assert.equal(row('lives'), '🟩🟨🟧💥');
  assert.equal(row('quit'), '🟩🟨🟧');
});

test('grid: rows of 10, exact multiple, max 5 rows with +N overflow', () => {
  const lines = (grid, reason = 'lives') => buildShareText(result({ grid, reason, weather: [] }), { url: URL }).split('\n');

  const ten = lines('P'.repeat(10), 'quit');
  assert.equal(ten[2], '🟩'.repeat(10));
  assert.equal(ten[3], 'Stapel hoog. Staan sterk.');

  const twenty = lines('G'.repeat(20));
  assert.equal(twenty[2], '🟨'.repeat(10));
  assert.equal(twenty[3], '🟨'.repeat(10) + '💥'); // suffix goes on the last row

  const fifty = lines('P'.repeat(50));
  assert.deepEqual(fifty.slice(2, 7), [...Array(4).fill('🟩'.repeat(10)), '🟩'.repeat(10) + '💥']);
  assert.equal(fifty[7], 'Stapel hoog. Staan sterk.');

  const many = lines('P'.repeat(50) + 'GSXPPPP');
  assert.equal(many.length, 2 + 5 + 2);
  assert.equal(many[6], '🟩'.repeat(10) + ' +7💥');
  const manyQuit = lines('S'.repeat(73), 'quit');
  assert.equal(manyQuit[6], '🟧'.repeat(10) + ' +23');
  const manyFlood = lines('X'.repeat(51), 'flood');
  assert.equal(manyFlood[6], '🟥'.repeat(10) + ' +1🌊');
});

test('empty grid: no grid line for quit, lone suffix otherwise', () => {
  const quit = buildShareText(result({ grid: '', reason: 'quit', weather: [] }), { url: URL }).split('\n');
  assert.deepEqual(quit, [`Stapel #1 🏗️ 37,5${NB}m`, `⭐ 1${NB}240 · 🎯 7× Perfek · 🔥 4`, 'Stapel hoog. Staan sterk.', URL]);
  const flood = buildShareText(result({ grid: '', reason: 'flood', weather: [] }), {}).split('\n');
  assert.equal(flood[2], '🌊');
});

test('weather line: in order, omitted when empty, unknown types skipped', () => {
  const w = (weather) => buildShareText(result({ weather }), { url: URL }).split('\n');
  assert.equal(w(['hail', 'fog', 'heat', 'gust'])[4], 'Weer: 🌨️🌫️☀️🌪️');
  assert.equal(w(['wind', 'tornado', 'rain'])[4], 'Weer: 💨🌧️');
  assert.ok(!w([]).some((l) => l.startsWith('Weer')));
  assert.ok(!w(undefined).some((l) => l.startsWith('Weer')));
  assert.equal(w([]).length, 6);
});

test('url line omitted when not given', () => {
  const lines = buildShareText(result(), {}).split('\n');
  assert.equal(lines[lines.length - 1], 'Stapel hoog. Staan sterk.');
  assert.equal(buildShareText(result()).split('\n').pop(), 'Stapel hoog. Staan sterk.');
});

test('whatsappUrl encodes everything', () => {
  const text = buildShareText(result(), { url: URL });
  const u = whatsappUrl(text);
  assert.ok(u.startsWith('https://wa.me/?text='));
  const enc = u.slice('https://wa.me/?text='.length);
  assert.equal(decodeURIComponent(enc), text);
  assert.ok(!/[\s#&?\n]/.test(enc), 'no raw spaces, newlines, # & ?');
  assert.ok(enc.includes('%0A'));
  assert.equal(whatsappUrl('a b&c#d\ne'), 'https://wa.me/?text=a%20b%26c%23d%0Ae');
  assert.equal(new globalThis.URL(u).searchParams.get('text'), text);
});

// --- shareResult with mocked browser globals ---------------------------------------

const saved = {};
for (const k of ['navigator', 'window', 'document', 'location']) saved[k] = Object.getOwnPropertyDescriptor(globalThis, k);

function mock(name, value) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

afterEach(() => {
  for (const [k, d] of Object.entries(saved)) {
    if (d) Object.defineProperty(globalThis, k, d);
    else delete globalThis[k];
  }
});

function fakeDocument({ execOk = true } = {}) {
  const doc = {
    copied: null,
    body: {
      children: [],
      appendChild(el) {
        this.children.push(el);
        el.parentNode = this;
      },
      removeChild(el) {
        this.children = this.children.filter((c) => c !== el);
        el.parentNode = null;
      },
    },
    activeElement: null,
    createElement() {
      return {
        style: {},
        value: '',
        setAttribute() {},
        focus() {},
        select() {},
        setSelectionRange() {},
      };
    },
    execCommand(cmd) {
      if (cmd !== 'copy') return false;
      if (!execOk) throw new Error('not allowed');
      doc.copied = doc.body.children[0]?.value ?? null;
      return true;
    },
  };
  return doc;
}

test('shareResult in plain node: never throws', async () => {
  mock('navigator', undefined);
  mock('window', undefined);
  mock('document', undefined);
  mock('location', undefined);
  assert.equal(await shareResult('x', 'native'), 'failed');
  assert.equal(await shareResult('x', 'copy'), 'failed');
  assert.equal(await shareResult('x', 'whatsapp'), 'failed');
});

test('native: navigator.share success / AbortError / other error falls back to copy', async () => {
  let shared = null;
  let copied = null;
  mock('navigator', {
    share: async (data) => {
      shared = data;
    },
    clipboard: { writeText: async (t) => void (copied = t) },
  });
  assert.equal(await shareResult('hallo', 'native'), 'shared');
  assert.deepEqual(shared, { text: 'hallo' });

  mock('navigator', {
    share: async () => {
      throw Object.assign(new Error('cancel'), { name: 'AbortError' });
    },
  });
  assert.equal(await shareResult('hallo', 'native'), 'cancelled');

  mock('navigator', {
    share: async () => {
      throw Object.assign(new Error('nope'), { name: 'NotAllowedError' });
    },
    clipboard: { writeText: async (t) => void (copied = t) },
  });
  assert.equal(await shareResult('val terug', 'native'), 'copied');
  assert.equal(copied, 'val terug');

  // No Web Share API at all => copy.
  mock('navigator', { clipboard: { writeText: async (t) => void (copied = t) } });
  assert.equal(await shareResult('geen share', 'native'), 'copied');
  assert.equal(copied, 'geen share');
});

test('copy: clipboard API, then execCommand fallback, then failed', async () => {
  let copied = null;
  mock('navigator', { clipboard: { writeText: async (t) => void (copied = t) } });
  assert.equal(await shareResult('een', 'copy'), 'copied');
  assert.equal(copied, 'een');

  const doc = fakeDocument();
  mock('document', doc);
  mock('navigator', {
    clipboard: {
      writeText: async () => {
        throw new Error('denied');
      },
    },
  });
  assert.equal(await shareResult('twee', 'copy'), 'copied');
  assert.equal(doc.copied, 'twee');
  assert.equal(doc.body.children.length, 0, 'textarea removed');

  mock('navigator', {});
  const doc2 = fakeDocument();
  mock('document', doc2);
  assert.equal(await shareResult('drie', 'copy'), 'copied');
  assert.equal(doc2.copied, 'drie');

  mock('document', fakeDocument({ execOk: false }));
  assert.equal(await shareResult('vier', 'copy'), 'failed');
});

test('whatsapp: window.open, falling back to location.href', async () => {
  const opened = [];
  mock('window', { open: (url, target) => (opened.push([url, target]), {}) });
  assert.equal(await shareResult('Stapel #1', 'whatsapp'), 'opened');
  assert.deepEqual(opened, [[whatsappUrl('Stapel #1'), '_blank']]);

  const loc = { href: 'https://x/' };
  mock('window', { open: () => null }); // popup blocked
  mock('location', loc);
  assert.equal(await shareResult('Stapel #2', 'whatsapp'), 'opened');
  assert.equal(loc.href, whatsappUrl('Stapel #2'));

  mock('window', {
    open: () => {
      throw new Error('blocked');
    },
  });
  const loc2 = { href: '' };
  mock('location', loc2);
  assert.equal(await shareResult('drie', 'whatsapp'), 'opened');
  assert.equal(loc2.href, whatsappUrl('drie'));
});

test('unknown channel copies', async () => {
  let copied = null;
  mock('navigator', { clipboard: { writeText: async (t) => void (copied = t) } });
  assert.equal(await shareResult('x', 'pigeon'), 'copied');
  assert.equal(copied, 'x');
});
