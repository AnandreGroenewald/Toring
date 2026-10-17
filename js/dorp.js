// (1.16) Jou dorp: Steel en Wraak on the phone (the rules and the owner's words: js/core/dorp.js; the server:
// server/src/dorp.js). This keeps the town's id and secret key (made once, on this phone), the games' reports until
// the server has them (each once: `seq`), the day's wall, and the server's last word (town, news, neighbours), and asks
// the server for everything else. Nothing here throws: without the server the town simply waits.

import { isTownId, isTownKey, newTownId, newTownKey, isRaidId, isDayKey, markOf, DORP, RIKUS_ID } from './core/dorp.js';
import { safeLocalStorage } from './core/storage.js';

const KEY = 'stapel.v1.dorp';
const TIMEOUT_MS = 8000;

const blank = () => ({ v: 1, id: null, key: null, seq: 0, gains: [], wallDay: null, last: null, shownN: 0 });

export function createDorpClient({ api = '', storage = safeLocalStorage(), fetchImpl = globalThis.fetch?.bind(globalThis) } = {}) {
  let d = blank();
  const load = () => {
    let raw = null;
    try {
      raw = JSON.parse(storage?.getItem(KEY) || 'null');
    } catch {
      raw = null;
    }
    if (raw && typeof raw === 'object' && isTownId(raw.id) && isTownKey(raw.key)) {
      d = { ...blank(), ...raw };
      if (!Array.isArray(d.gains)) d.gains = [];
      return;
    }
    // (nothing kept yet; or a phone that won't keep it: the town made on this visit stays, with its waiting reports)
    if (isTownId(d.id) && isTownKey(d.key)) return;
    d = blank();
    d.id = newTownId();
    d.key = newTownKey();
    save();
  };
  const save = () => {
    try { storage?.setItem(KEY, JSON.stringify(d)); } catch { /* private mode: this visit only */ }
  };
  load();
  let on = null;   // does the server know the towns? (null: not asked yet)

  async function call(path, body = null) {
    if (!api || typeof fetchImpl !== 'function') return { ok: false, status: 0 };
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), TIMEOUT_MS) : null;
    try {
      const res = await fetchImpl(`${api}${path}`, body
        ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'omit', cache: 'no-store', signal: ctl?.signal }
        : { credentials: 'omit', cache: 'no-store', signal: ctl?.signal });
      const json = await res.json().catch(() => ({}));
      return { ...(json && typeof json === 'object' ? json : {}), ok: res.ok, status: res.status };
    } catch {
      return { ok: false, status: 0 };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** The server's word on a town (sync/raid answers): kept, and the reports it has counted dropped. */
  function took(r) {
    if (!r?.town) return;
    load();
    const seq = r.town.seq | 0;
    if (seq > d.seq) {
      // (a record brought back from an older backup: the server has counted further than this phone remembers, so the
      // reports waiting here were made after that and were skipped as counted. They carry on after the server's number)
      d.gains.forEach((g, i) => { g.seq = seq + 1 + i; });
      d.seq = seq + d.gains.length;
    }
    d.gains = d.gains.filter((g) => g.seq > seq);
    d.last = { ...(d.last || {}), town: r.town, ...(r.news ? { news: r.news } : {}), ...(r.bure ? { bure: r.bure } : {}), at: Date.now() };
    save();
  }

  return {
    get id() { return d.id; },
    get on() { return on; },
    /** The last word from the server ({ town, news, bure, at }) or null; `pending`: people not yet sent. */
    view() {
      load();
      const pending = d.gains.reduce((s, g) => ({ people: s.people + g.people, raids: s.raids + g.raids, walls: s.walls + g.walls, gold: s.gold + (g.gold | 0) }), { people: 0, raids: 0, walls: 0, gold: 0 });
      return { id: d.id, last: d.last, pending, shownN: d.shownN | 0 };
    },
    /** Does the server know the towns? Its front door says so (`dorp`): an older Worker's says nothing (no 404). */
    async ping() {
      const r = await call('/');
      on = !!(r.ok && r.dorp);
      return on;
    },
    /**
     * A finished game's gifts to the town: its people, the strooptogte it earned, and (the first tower of `dayKey`) a
     * wall. Kept until the server has them.
     */
    queue({ people = 0, raids = 0, gold = 0, dayKey = null } = {}) {
      load();
      const walls = dayKey && d.wallDay !== dayKey ? 1 : 0;
      if (walls) d.wallDay = dayKey;
      const g = { seq: d.seq + 1, people: Math.max(0, people | 0), raids: Math.max(0, raids | 0), walls, gold: Math.max(0, gold | 0) };
      if (!g.people && !g.raids && !g.walls && !g.gold) {
        save();
        return null;
      }
      d.seq = g.seq;
      d.gains.push(g);
      if (d.gains.length > DORP.gainsMax) d.gains.splice(0, d.gains.length - DORP.gainsMax);
      save();
      return g;
    },
    /**
     * Sends the reports and fetches the town, its news and the neighbours ({ ok, town, news, bure, tourists }).
     * `collect`: today's date key, on a visit to the town (the landmarks' tourists come once a day).
     */
    async sync({ name = null, tribe = null, seen = null, collect = null } = {}) {
      load();
      const r = await call('/dorp/sync', { id: d.id, key: d.key, name, tribe, gains: d.gains, ...(Number.isInteger(seen) ? { seen } : {}), ...(isDayKey(collect) ? { collect } : {}) });
      if (r.ok) {
        on = true;
        took(r);
      }
      return r;
    },
    /** A strooptog on `target` (a Wraak with `wraak`: the raid it avenges; `hit`: the tap's aim, 'P' | 'G' | 'S'). */
    async raid(target, wraak = null, hit = 'G') {
      load();
      if (target !== RIKUS_ID && !isTownId(target)) return { ok: false, status: 400 };
      const r = await call('/dorp/raid', { id: d.id, key: d.key, target, hit, ...(isRaidId(wraak) ? { wraak } : {}) });
      if (r.town) took({ town: r.town });
      return r;
    },
    /** A landmark bought (the coins are this phone's own; the caller has taken them). */
    async buyMark(mark) {
      load();
      if (!markOf(mark)) return { ok: false, status: 400 };
      const r = await call('/dorp/mark', { id: d.id, key: d.key, mark });
      if (r.town) took({ town: r.town });
      return r;
    },
    /** Neighbours with town `id` (a friend's link). */
    async buur(id) {
      load();
      if (!isTownId(id) || id === d.id) return { ok: false, status: 400 };
      return call('/dorp/buur', { id: d.id, key: d.key, buur: id });
    },
    raidInfo: (raidId) => (isRaidId(raidId) ? call(`/dorp/raid/${raidId}`) : Promise.resolve({ ok: false, status: 400 })),
    townInfo: (id) => (isTownId(id) ? call(`/dorp/town/${id}`) : Promise.resolve({ ok: false, status: 400 })),
    /** The news up to number `n` has been shown on this phone (the server hears it with the next sync). */
    markShown(n) {
      load();
      if (Number.isInteger(n) && n > (d.shownN | 0)) {
        d.shownN = n;
        save();
      }
    },
  };
}
