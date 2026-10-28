// Sign in with Google and the saved progress (1.13). A player who signs in keeps their progress here, so
// a new phone, a cleared browser, or the app and the website together all show the same towers, coins,
// looks and ranks. Signing in is optional; the game works the same without it.
//   * POST /account/google   { idToken }            -> { token, account, gen, rev, save }   (a new session)
//   * POST /account/load     { token, rev? }        -> { rev, save } (or { rev, same: true })
//   * POST /account/store    { token, rev, save, push } -> { rev }  (409 { rev, save } when another device saved first;
//                                                 the same `push` again answers as the first time for PUSH_DAYS, so a
//                                                 store whose answer was lost is never counted twice)
//   * POST /account/signout  { token }              -> this session ends
//   * POST /account/delete   { token }              -> the account, its save, its sessions and its leaderboard rows go
//                                                 (every leaderboard number the save lists: board.player and board.past)
// Kept: an account number made from the Google account's number with a secret (HMAC; the Google number itself,
// the name, the email and the photo are never kept), the save as the game sent it, when it was made and last
// used. A session is a random token; only its SHA-256 is kept. Bodies are text/plain JSON (no CORS preflight,
// like the leaderboard), and only the game's own pages may call (Origin).
// The game merges two saves itself (js/core/cloudsave.js); here a store only has to build on the version it
// read (`rev`), so two devices can never overwrite each other's progress unseen.

import { HttpError, json, jsonText, readBody } from './http.js';
import { checkOrigin, limit } from './stats.js';
import { hmacHex, sha256Hex, randomHex } from './crypto.js';
import { verifyGoogleIdToken } from './google.js';
import { metre } from './board.js';
import { COSMETIC_KINDS, SKIN_KINDS, DEFAULT_LOOK, DEFAULT_SKIN, TRIBE_IDS, cosmetic, skin } from '../../js/core/economy.js';
import { LAUNCH } from '../../js/config.js';

export const SAVE_MAX_BYTES = 256 * 1024;
export const SESSIONS_MAX = 10;              // devices signed in at once; the longest unused goes first
export const SESSION_DAYS = 400;             // a session unused this long ends (cron)
export const ACCOUNT_DAYS = 730;             // an account unused this long goes, with its save (cron)
const SEEN_EVERY_MS = 6 * 60 * 60 * 1000;    // `seen` is written at most this often (D1's write budget)
const TOKEN_RE = /^[a-f0-9]{64}$/;
const PUSH_RE = /^[a-z0-9]{16,40}$/;
export const PUSH_DAYS = 90;                 // a store's id is remembered this long (a phone offline for weeks still counts once)
const PLAYER_RE = /^[a-z0-9]{12,32}$/;
const PLAYERS_MAX = 9;                       // leaderboard numbers a save may name (its own and up to 8 earlier ones)
const DAY_MS = 24 * 60 * 60 * 1000;

/** A text/plain (or JSON) body holding a JSON object, at most `maxBytes`. Returns { body, size }. */
async function readObject(request, maxBytes) {
  const type = (request.headers.get('Content-Type') || '').toLowerCase();
  if (!type.startsWith('application/json') && !type.startsWith('text/plain')) throw new HttpError(415, 'unsupported_media_type');
  const bytes = await readBody(request, maxBytes);
  let body;
  try {
    body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new HttpError(400, 'bad_request');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'bad_request');
  return { body, size: bytes.byteLength };
}

const ready = (cfg) => !!(cfg.googleClientId && cfg.authSecret);

/** The session behind `token` -> { hash, account } (401 signed_out when there is none). */
async function sessionOf(ctx, token) {
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) throw new HttpError(401, 'signed_out');
  const hash = await sha256Hex(token);
  const row = await ctx.db.prepare('SELECT account, seen FROM account_sessions WHERE hash = ?1').bind(hash).first();
  if (!row) throw new HttpError(401, 'signed_out');
  if (ctx.now - row.seen >= SEEN_EVERY_MS) {
    await ctx.db.batch([
      ctx.db.prepare('UPDATE account_sessions SET seen = ?2 WHERE hash = ?1').bind(hash, ctx.now),
      ctx.db.prepare('UPDATE accounts SET seen = ?2 WHERE id = ?1').bind(row.account, ctx.now),
    ]);
  }
  return { hash, account: row.account };
}

/** The account's save as the answer's text: {"ok":true,"rev":N,"save":<as kept>} (no parsing of the kept save). */
function saveAnswer(status, row, extra = '') {
  const rev = Number.isInteger(row?.rev) ? row.rev : 0;
  const save = typeof row?.save === 'string' && row.save ? row.save : 'null';
  return jsonText(status, `{"ok":${status === 200},"rev":${rev}${extra},"save":${save}}`);
}

/** A save the game sent, checked: an object of the game's save version, back as text to keep. */
function cleanSave(save) {
  if (!save || typeof save !== 'object' || Array.isArray(save)) throw new HttpError(400, 'invalid_field', { field: 'save' });
  if (save.v !== 1) throw new HttpError(400, 'invalid_field', { field: 'save.v' });
  return JSON.stringify(save);
}

/**
 * (1.15) A store never loses a bought look or skin. An older game cleans its copy against its own (shorter) shop
 * list, so what it doesn't know yet is gone from the copy it sends and it wears the standard one instead. So:
 *   - every shop id the kept save owned stays owned in the new one (known ids only; nothing is removed);
 *   - when the new copy wears the standard one and doesn't own what the kept save wore (an older game dropped it),
 *     the kept save's choice stays on. A game that owns the item and wears the standard one chose it: that stays.
 * (1.16) The same for the Living Tower's tribes (the first is free, each other one 1000 coins): a 1.15 game leaves
 * `tribes` out of its copy altogether. Every tribe the kept save owned stays owned; the new copy's worn tribe stays
 * when it owns it, else the kept save's.
 * (1.23) The public launch: a save made from the launch on (it carries LAUNCH.id) over one from the testing weeks (without
 * it) is the account starting again, so nothing of the testing weeks' comes back.
 */
export function keepOwned(save, kept) {
  if (save?.launch === LAUNCH.id && kept?.launch !== LAUNCH.id) return save;
  const e = save?.econ;
  const k = kept?.econ;
  const obj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  if (!obj(e) || !obj(k)) return save;
  const has = (lists, kind, id) => Array.isArray(lists?.[kind]) && lists[kind].includes(id);
  // what the new copy owned and wore as it came (before anything is added back)
  const sentOwned = { looks: structuredClone(obj(e.owned) ? e.owned : {}), skins: structuredClone(obj(e.skins?.owned) ? e.skins.owned : {}) };
  const keep = (into, from, kinds, known) => {
    if (!obj(from)) return;
    for (const kind of kinds) {
      const ids = (Array.isArray(from[kind]) ? from[kind] : []).filter((id) => typeof id === 'string' && known(kind, id));
      if (!ids.length) continue;
      const now = Array.isArray(into[kind]) ? into[kind] : (into[kind] = []);
      for (const id of ids) if (!now.includes(id)) now.push(id);
    }
  };
  const keepWorn = (wear, keptWear, keptOwned, owned, kinds, unset, known) => {
    if (!obj(keptWear)) return;
    for (const kind of kinds) {
      const id = keptWear[kind];
      if (typeof id !== 'string' || id === unset[kind] || !known(kind, id) || !has(keptOwned, kind, id)) continue;
      if ((wear[kind] === undefined || wear[kind] === unset[kind]) && !has(owned, kind, id)) wear[kind] = id;
    }
  };
  if (k.owned && (e.owned === undefined || obj(e.owned))) {
    keep((e.owned ??= {}), k.owned, COSMETIC_KINDS, cosmetic);
    if (e.look === undefined || obj(e.look)) keepWorn((e.look ??= {}), k.look, k.owned, sentOwned.looks, COSMETIC_KINDS, DEFAULT_LOOK, cosmetic);
  }
  const ks = k.skins;
  if (obj(ks) && ks.owned && (e.skins === undefined || obj(e.skins))) {
    e.skins ??= {};
    if (e.skins.owned === undefined || obj(e.skins.owned)) {
      keep((e.skins.owned ??= {}), ks.owned, SKIN_KINDS, skin);
      if (e.skins.wear === undefined || obj(e.skins.wear)) keepWorn((e.skins.wear ??= {}), ks.wear, ks.owned, sentOwned.skins, SKIN_KINDS, DEFAULT_SKIN, skin);
    }
  }
  const kt = k.tribes;
  const keptTribes = obj(kt) && Array.isArray(kt.owned) ? TRIBE_IDS.filter((id) => kt.owned.includes(id)) : [];
  if (keptTribes.length && (e.tribes === undefined || obj(e.tribes))) {
    e.tribes ??= {};
    const sent = Array.isArray(e.tribes.owned) ? e.tribes.owned.filter((id) => TRIBE_IDS.includes(id)) : [];
    const owned = Array.isArray(e.tribes.owned) ? e.tribes.owned : (e.tribes.owned = []);
    for (const id of keptTribes) if (!owned.includes(id)) owned.push(id);
    if (!sent.includes(e.tribes.wear)) e.tribes.wear = keptTribes.includes(kt.wear) ? kt.wear : keptTribes[0];
  }
  return save;
}

async function signInGoogle(request, ctx) {
  await limit(ctx, request, 'signin', ctx.cfg.rate.signInPerHour);
  const { body } = await readObject(request, 8 * 1024);
  let sub;
  try {
    ({ sub } = await verifyGoogleIdToken(body.idToken, { clientId: ctx.cfg.googleClientId, keys: ctx.googleKeys, now: ctx.now }));
  } catch (err) {
    const why = String(err?.message || err);
    if (why.startsWith('google_keys')) {
      ctx.log('error', 'google_keys_failed', { message: why.slice(0, 200) });
      throw new HttpError(503, 'google_unreachable');
    }
    ctx.log('warn', 'signin_refused', { why: why.slice(0, 40) });
    throw new HttpError(401, 'bad_token');
  }
  const id = (await hmacHex(ctx.cfg.authSecret, `google:${sub}`)).slice(0, 40);
  const token = randomHex(32);
  const hash = await sha256Hex(token);
  const db = ctx.db;
  await db.batch([
    db.prepare('INSERT INTO accounts (id, created, seen, rev, gen) VALUES (?1, ?2, ?2, 0, ?3) ON CONFLICT(id) DO UPDATE SET seen = ?2').bind(id, ctx.now, randomHex(8)),
    db.prepare('INSERT INTO account_sessions (hash, account, created, seen) VALUES (?1, ?2, ?3, ?3)').bind(hash, id, ctx.now),
    // SESSIONS_MAX devices at once: the one unused longest is signed out
    db.prepare(`DELETE FROM account_sessions WHERE account = ?1 AND hash NOT IN
      (SELECT hash FROM account_sessions WHERE account = ?1 ORDER BY seen DESC, created DESC LIMIT ?2)`).bind(id, SESSIONS_MAX),
  ]);
  const row = await db.prepare('SELECT rev, save, gen FROM accounts WHERE id = ?1').bind(id).first();
  // `account`: a short reference so the game can tell one account from another (it can't be turned back into
  // anything); `gen`: random, made with the account, so a game can tell it from one deleted and made anew
  const gen = typeof row?.gen === 'string' && /^[a-f0-9]{16}$/.test(row.gen) ? row.gen : '';
  return saveAnswer(200, row, `,"token":"${token}","account":"${id.slice(0, 12)}","gen":"${gen}"`);
}

async function load(request, ctx) {
  await limit(ctx, request, 'account', ctx.cfg.rate.accountPerHour);
  const { body } = await readObject(request, 1024);
  const { account } = await sessionOf(ctx, body.token);
  if (Number.isInteger(body.rev)) {
    const head = await ctx.db.prepare('SELECT rev FROM accounts WHERE id = ?1').bind(account).first();
    if (!head) throw new HttpError(401, 'signed_out');
    if (head.rev === body.rev) return json(200, { ok: true, rev: head.rev, same: true });
  }
  const row = await ctx.db.prepare('SELECT rev, save FROM accounts WHERE id = ?1').bind(account).first();
  if (!row) throw new HttpError(401, 'signed_out');
  return saveAnswer(200, row);
}

/** The version a store with this `push` id made, or null when the account never took it. */
async function pushed(ctx, account, push) {
  const row = await ctx.db.prepare('SELECT rev FROM account_pushes WHERE account = ?1 AND push = ?2').bind(account, push).first();
  return Number.isInteger(row?.rev) ? row.rev : null;
}

async function store(request, ctx) {
  await limit(ctx, request, 'account', ctx.cfg.rate.accountPerHour);
  const { body } = await readObject(request, SAVE_MAX_BYTES + 1024);
  const { account } = await sessionOf(ctx, body.token);
  // (1.14) saves per account and hour (config.js accountStoresPerHour): the game hears 429 and saves again later
  if (!ctx.rate.allow(`store:${account}`, ctx.cfg.rate.accountStoresPerHour, ctx.now)) throw new HttpError(429, 'rate_limited');
  if (!Number.isInteger(body.rev) || body.rev < 0) throw new HttpError(400, 'invalid_field', { field: 'rev' });
  if (typeof body.push !== 'string' || !PUSH_RE.test(body.push)) throw new HttpError(400, 'invalid_field', { field: 'push' });
  let text = cleanSave(body.save);
  if (text.length > SAVE_MAX_BYTES) throw new HttpError(413, 'payload_too_large');
  // sent again (the game never heard the answer): it was kept the first time
  const before = await pushed(ctx, account, body.push);
  if (before !== null) return json(200, { ok: true, rev: before, again: true });
  // (1.15) built on the kept save: what it owned stays owned and on (keepOwned; an older game drops looks it doesn't know)
  const kept = await ctx.db.prepare('SELECT rev, save FROM accounts WHERE id = ?1').bind(account).first();
  let old = null;
  if (kept && typeof kept.save === 'string') {
    try {
      old = JSON.parse(kept.save);
    } catch {
      old = null;
    }
  }
  // (1.23) once the account keeps a save from the public launch on (LAUNCH.id), a copy without the mark (an older game's,
  // with the testing weeks' progress) is refused for good: an older game drops a store the server answers 400 to, and the
  // launch save stays as it is (whatever the rev)
  if (old?.launch === LAUNCH.id && body.save.launch !== LAUNCH.id) throw new HttpError(400, 'invalid_field', { field: 'save.launch' });
  if (kept && kept.rev === body.rev && old) {
    const merged = JSON.stringify(keepOwned(body.save, old));
    if (merged.length <= SAVE_MAX_BYTES) text = merged;
  }
  // only on top of the version the game read: otherwise it gets the newer one back to merge with. The store and
  // its id are kept together, in one batch: the id only when this very store went in (the row carries it).
  await ctx.db.batch([
    ctx.db.prepare('UPDATE accounts SET save = ?3, rev = rev + 1, saved = ?4, seen = ?4, last_push = ?5 WHERE id = ?1 AND rev = ?2')
      .bind(account, body.rev, text, ctx.now, body.push),
    ctx.db.prepare(`INSERT OR IGNORE INTO account_pushes (account, push, rev, at)
      SELECT ?1, ?2, ?3, ?4 WHERE EXISTS (SELECT 1 FROM accounts WHERE id = ?1 AND rev = ?3 AND last_push = ?2)`)
      .bind(account, body.push, body.rev + 1, ctx.now),
  ]);
  const now = await pushed(ctx, account, body.push);   // ours, or the same store sent twice at once that got there first
  if (now !== null) return json(200, { ok: true, rev: now, ...(now !== body.rev + 1 ? { again: true } : {}) });
  const row = await ctx.db.prepare('SELECT rev, save FROM accounts WHERE id = ?1').bind(account).first();
  if (!row) throw new HttpError(401, 'signed_out');
  return saveAnswer(409, row, ',"error":"conflict"');
}

async function signOut(request, ctx) {
  await limit(ctx, request, 'account', ctx.cfg.rate.accountPerHour);
  const { body } = await readObject(request, 1024);
  if (typeof body.token === 'string' && TOKEN_RE.test(body.token)) {
    await ctx.db.prepare('DELETE FROM account_sessions WHERE hash = ?1').bind(await sha256Hex(body.token)).run();
  }
  return json(200, { ok: true });
}

/** The account goes for good: its save, every session, and its rows on the leaderboard (the day's counts follow). */
async function remove(request, ctx) {
  await limit(ctx, request, 'account', ctx.cfg.rate.accountPerHour);
  const { body } = await readObject(request, 1024);
  const { account } = await sessionOf(ctx, body.token);
  const db = ctx.db;
  const row = await db.prepare('SELECT save FROM accounts WHERE id = ?1').bind(account).first();
  // the account's leaderboard numbers: the one it uses, and those its devices used before they joined it
  const players = new Set();
  try {
    const b = JSON.parse(row?.save || 'null')?.board;
    for (const p of [b?.player, ...(Array.isArray(b?.past) ? b.past : [])]) {
      if (typeof p === 'string' && PLAYER_RE.test(p) && players.size < PLAYERS_MAX) players.add(p);
    }
  } catch {
    players.clear();
  }
  const steps = [];
  let boardRows = 0;
  for (const player of players) {
    const rows = await db.prepare('SELECT date_key, height_dm FROM daily_board WHERE player = ?1').bind(player).all();
    for (const e of rows.results || []) {
      boardRows++;
      steps.push(
        db.prepare('DELETE FROM daily_board WHERE date_key = ?1 AND player = ?2').bind(e.date_key, player),
        db.prepare('UPDATE daily_board_days SET players = MAX(players - 1, 0) WHERE date_key = ?1').bind(e.date_key),
        db.prepare('UPDATE daily_board_hist SET n = MAX(n - 1, 0) WHERE date_key = ?1 AND metre = ?2').bind(e.date_key, metre(e.height_dm)),
      );
    }
  }
  steps.push(
    db.prepare('DELETE FROM account_pushes WHERE account = ?1').bind(account),
    db.prepare('DELETE FROM account_sessions WHERE account = ?1').bind(account),
    db.prepare('DELETE FROM accounts WHERE id = ?1').bind(account),
  );
  await db.batch(steps);
  ctx.log('info', 'account_deleted', { boardRows });
  return json(200, { ok: true, boardRows });
}

/** /account/... (POST only). */
export async function routeAccount(request, path, ctx) {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' }, { Allow: 'POST' });
  checkOrigin(request, ctx.cfg);
  if (!ready(ctx.cfg)) throw new HttpError(503, 'not_configured');
  if (path === '/account/google') return signInGoogle(request, ctx);
  if (path === '/account/load') return load(request, ctx);
  if (path === '/account/store') return store(request, ctx);
  if (path === '/account/signout') return signOut(request, ctx);
  if (path === '/account/delete') return remove(request, ctx);
  throw new HttpError(404, 'not_found');
}

/** Retention (cron): sessions unused for SESSION_DAYS end; accounts unused for ACCOUNT_DAYS go with their save. */
export async function pruneAccounts(db, now) {
  const old = now - ACCOUNT_DAYS * DAY_MS;
  const r = await db.batch([
    db.prepare('DELETE FROM account_sessions WHERE seen < ?1').bind(now - SESSION_DAYS * DAY_MS),
    db.prepare('DELETE FROM account_sessions WHERE account IN (SELECT id FROM accounts WHERE seen < ?1)').bind(old),
    db.prepare('DELETE FROM account_pushes WHERE at < ?1 OR account IN (SELECT id FROM accounts WHERE seen < ?2)').bind(now - PUSH_DAYS * DAY_MS, old),
    db.prepare('DELETE FROM accounts WHERE seen < ?1').bind(old),
  ]);
  return { sessionsEnded: (r[0]?.meta?.changes ?? 0) + (r[1]?.meta?.changes ?? 0), accountsDropped: r[3]?.meta?.changes ?? 0 };
}
