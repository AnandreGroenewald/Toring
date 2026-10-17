// (1.17) Die Kasteelreeks with friends, on the phone: your castle goes to the server (server/src/kasteel.js) for your
// neighbours to attack while you're away; their castles come from it; a siege's result goes back as their news. Who you
// are and who your friends are is Jou dorp's (js/dorp.js: the same id, secret key and neighbours, made by a friend's
// link). Nothing here throws: without the server (or offline) the castle simply plays against Robot Rikus.
import { MATCH_API_URL } from '../sponsorConfig.js';
import { createDorpClient } from '../dorp.js';
import { isTownId } from '../core/dorp.js';
import { castleSnapshot, readStore, STORE_KEY } from './plan.js';

const TIMEOUT_MS = 8000;
const DORP_KEY = 'stapel.v1.dorp';

export function createCastleNet({ api = MATCH_API_URL, fetchImpl = globalThis.fetch?.bind(globalThis) } = {}) {
  const dorp = createDorpClient({ api });   // (makes this phone's id and key once, as Jou dorp does)
  let on = null;
  const me = () => {
    try {
      const d = JSON.parse(localStorage.getItem(DORP_KEY) || 'null');
      return d && isTownId(d.id) && typeof d.key === 'string' ? { id: d.id, key: d.key } : null;
    } catch {
      return null;
    }
  };
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
  /** Signed calls: a town the server doesn't know yet is made first (Jou dorp's sync), then asked again. */
  async function signed(path, body) {
    let who = me();
    if (!who) return { ok: false, status: 0 };
    let r = await call(path, { ...who, ...body });
    if (r.status === 404 && r.error === 'town') {
      await dorp.sync({});
      who = me();
      r = await call(path, { ...who, ...body });
    }
    return r;
  }

  return {
    get id() { return me()?.id || null; },
    /** Does the server keep castles? Its front door says so (`kasteel`). */
    async ping() {
      if (on !== null) return on;
      const r = await call('/');
      on = !!(r.ok && r.kasteel);
      return on;
    },
    /** Your castle to the server, when it changed since the last time (a cheap no-op otherwise). */
    async upload() {
      if (!(await this.ping())) return false;
      const snap = castleSnapshot();
      if (!snap) return false;
      const sum = String(JSON.stringify(snap).split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7));
      if (readStore().up === sum) return true;
      const r = await signed('/kasteel/save', { castle: snap });
      if (r.ok) {
        try { localStorage.setItem(STORE_KEY, JSON.stringify({ ...readStore(), up: sum })); } catch { /* sent again next time */ }
      }
      return !!r.ok;
    },
    /** Your castle's news (who attacked it, how) and your neighbours with castles: { ok, news, newsN, seenN, friends }. */
    async home(seen = null) {
      if (!(await this.ping())) return { ok: false };
      return signed('/kasteel/home', Number.isInteger(seen) ? { seen } : {});
    },
    /** A friend's castle to attack: { ok, id, name, castle, at }. */
    castle: (id) => (isTownId(id) ? call(`/kasteel/c/${id}`) : Promise.resolve({ ok: false, status: 400 })),
    /** A siege of a friend's castle: news for them. */
    siege: (target, stars, destroyed) => (isTownId(target) ? signed('/kasteel/siege', { target, stars, destroyed }) : Promise.resolve({ ok: false })),
  };
}
