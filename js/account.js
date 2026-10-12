// Sign in with Google and the saved progress, on the device (1.13; the server side is server/src/account.js,
// the merge js/core/cloudsave.js). Signing in is optional: without it nothing changes. Signed in, this
// device's progress joins the account's, and from then on every sync merges the two ways (what this
// device did since the last sync, and what other devices did), so the phone and the website show the
// same towers, coins, looks and ranks.
// On the website Google's own "Sign in with Google" button gives the sign-in (Google's script loads only
// when the player opens the account sheet); in the Android app Google's sign-in comes from the phone itself
// (app/shim.js, window.stapelApp.google). Either way the game gets an ID token, which the server checks once
// and swaps for a session of its own.
// (1.14, the owner: "it need to keep everything hense the Google sign in") Signing out only ends this device's
// session: the phone keeps all its progress (and the account keeps its copy). Deleting the account deletes the
// account; the phone's own progress stays too. Nothing is ever wiped.
// Nothing here ever gets in the way of the game: offline, a sync simply waits for the next chance.

import { base } from './audience.js';
import { mergeSaves, sameSave, fitSave } from './core/cloudsave.js';
import { safeLocalStorage } from './core/storage.js';

const TEXT = 'text/plain;charset=UTF-8';   // a "simple" request: no CORS preflight (like the leaderboard)
const TIMEOUT_MS = 15000;
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const BACK_SYNC_MS = 20 * 1000;      // coming back to the game syncs when the last sync is older than this
const SOON_MS = 4000;                 // a purchase or a new name syncs this long after (several in a row: once)
const LOCK = 'stapel-account';

/**
 * @param o.store       js/core/storage.js store
 * @param o.bus         the event bus ('account:changed' when this device's progress or the sign-in changed)
 * @param o.apiUrl      the Worker's address (matchApiUrl())
 * @param o.clientId    Google's web client ID (js/config.js AUTH); empty: sign-in is off
 * @param o.storageKey  the store's key (a debug session has its own, so it never mixes with real progress)
 * @param o.today       () => today's date key
 * @param o.canApply    () => false while a tower is being built (a sync waits for it to end)
 */
export function createAccount({
  store, bus, apiUrl, clientId = '', storageKey, today, canApply = () => true,
  backend = safeLocalStorage(), fetchImpl = null, native = () => globalThis.stapelApp?.google || null, now = () => Date.now(),
}) {
  const root = base(apiUrl);
  const linkKey = `${storageKey}.cloud`;
  const on = !!(root && /\.apps\.googleusercontent\.com$/.test(clientId || ''));
  // synced: a sync went through since the game started; tried: one finished at all (offline too)
  const state = { busy: false, error: null, later: false, synced: false, tried: false };
  let soonTimer = null;
  let running = null;
  let inflight = null;   // the sync running now

  // --- the link to the account: { token, account, rev, base, at, pending } ----------------------------
  // `base` is the account's save at version `rev` as this device last saw it (null: nothing of this
  // device is in the account yet); `pending` a store whose answer never came ({ push, rev, save }).
  function readLink() {
    try {
      const v = JSON.parse(backend.getItem(linkKey) || 'null');
      return v && typeof v === 'object' ? v : null;
    } catch {
      return null;
    }
  }
  function writeLink(v) {
    try {
      if (v) backend.setItem(linkKey, JSON.stringify(v));
      else backend.removeItem(linkKey);
    } catch {
      // private mode: signed in for this visit only
    }
  }

  async function call(path, body) {
    const f = typeof fetchImpl === 'function' ? fetchImpl : typeof fetch === 'function' ? fetch.bind(globalThis) : null;
    if (!f) return { status: 0, json: null };
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = setTimeout(() => ctl?.abort(), TIMEOUT_MS);
    try {
      const res = await f(`${root}${path}`, {
        method: 'POST', headers: { 'Content-Type': TEXT, Accept: 'application/json' }, body: JSON.stringify(body),
        signal: ctl?.signal, cache: 'no-store', credentials: 'omit',
      });
      let json = null;
      try {
        json = JSON.parse(await res.text());
      } catch {
        json = null;
      }
      return { status: res.status, json };
    } catch {
      return { status: 0, json: null };
    } finally {
      clearTimeout(timer);
    }
  }

  const randomId = () => {
    const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = new Uint8Array(24);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (x) => abc[x % abc.length]).join('');
  };

  /** One sync at a time, also across this site's tabs (they share the progress and the link). */
  function locked(fn) {
    const locks = globalThis.navigator?.locks;
    if (locks?.request) return locks.request(LOCK, fn);
    const p = (running || Promise.resolve()).then(fn, fn);
    running = p.catch(() => {});
    return p;
  }

  const changed = (why) => bus.emit('account:changed', { why });

  /**
   * The server ended this device's session (signed out elsewhere, or too many devices): the progress stays here,
   * and so does a store whose answer never came (signing in to the same account again sends it first).
   */
  function signedOutHere(link) {
    writeLink({ ...link, token: null });
    state.synced = false;
    changed('out');
    return 'out';
  }

  /**
   * Merge the account's save `cloud` ({ rev, save }) into this device and store the result, until the
   * account takes it (another device saving first only means one more merge).
   */
  async function mergeLoop(cloud) {
    for (let tries = 0; tries < 4; tries++) {
      if (!canApply()) {
        state.later = true;
        return 'later';
      }
      let link = readLink();
      if (!link?.token) return 'out';
      const local = store.exportSave();
      const merged = fitSave(mergeSaves(local, cloud.save, link.base, { today: today() }));
      const here = !sameSave(merged, local);
      if (here) store.importSave(merged);
      // from here on this device holds the account's version `cloud` plus its own changes
      link = { ...link, base: cloud.save, rev: cloud.rev, pending: null };
      if (sameSave(merged, cloud.save)) {
        writeLink({ ...link, at: now() });
        state.synced = true;
        if (here) changed('merged');
        return 'same';
      }
      const push = randomId();
      writeLink({ ...link, pending: { push, rev: cloud.rev, save: merged } });
      if (here) changed('merged');
      const put = await call('/account/store', { token: link.token, rev: cloud.rev, save: merged, push });
      link = readLink();
      if (!link?.token) return 'out';
      if (put.status === 200 && put.json?.ok) {
        writeLink({ ...link, base: merged, rev: put.json.rev, pending: null, at: now() });
        state.synced = true;
        return 'saved';
      }
      if (put.status === 409 && put.json) {
        writeLink({ ...link, pending: null });
        cloud = { rev: put.json.rev | 0, save: put.json.save ?? null };
        continue;
      }
      if (put.status === 401) return signedOutHere(link);
      if (put.status === 400 || put.status === 413) {
        // refused for good (fitSave keeps a save far below the limit, so this shouldn't happen): never sent again
        writeLink({ ...link, pending: null });
        state.error = 'refused';
        return 'refused';
      }
      return 'offline';   // the answer never came: `pending` goes again next time (the server knows it if it got it)
    }
    return 'busy';
  }

  /** Bring this device and the account together. Returns 'saved' | 'same' | 'later' | 'offline' | 'refused' | 'out' | 'off'. */
  function sync() {
    if (!on) return Promise.resolve('off');
    clearTimeout(soonTimer);
    const p = locked(run);
    inflight = p;
    p.finally(() => { if (inflight === p) inflight = null; }).catch(() => {});
    return p;
  }

  /** One sync (under the lock). */
  async function run() {
    let link = readLink();
    if (!link?.token) return 'out';
    if (!canApply()) {
      state.later = true;
      return 'later';
    }
    state.later = false;
    state.busy = true;
    changed('busy');
    try {
      // a store whose answer never came goes first: the server says whether it already has it
      if (link.pending) {
        const p = link.pending;
        const r = await call('/account/store', { token: link.token, rev: p.rev, save: p.save, push: p.push });
        link = readLink();
        if (!link?.token) return 'out';
        if (r.status === 200 && r.json?.ok) link = { ...link, base: p.save, rev: r.json.rev, pending: null };
        // it never got there (the server checks its ids again before saying so): the merge below has it
        else if (r.status === 409 || r.status === 400 || r.status === 413) link = { ...link, pending: null };
        else if (r.status === 401) return signedOutHere(link);
        else return (state.error = 'offline');
        writeLink(link);
      }
      const res = await call('/account/load', { token: link.token, ...(Number.isInteger(link.rev) && link.base ? { rev: link.rev } : {}) });
      link = readLink();
      if (!link?.token) return 'out';
      if (res.status === 401) return signedOutHere(link);
      if (res.status !== 200 || !res.json?.ok) return (state.error = 'offline');
      const cloud = res.json.same ? { rev: link.rev, save: link.base } : { rev: res.json.rev | 0, save: res.json.save ?? null };
      const out = await mergeLoop(cloud);
      state.error = out === 'offline' || out === 'refused' ? out : null;
      return out;
    } finally {
      state.busy = false;
      state.tried = true;
      changed('idle');
    }
  }

  /**
   * Is a sync running now, or has none been tried since the game started? A daily tower waits for it (once:
   * offline, the game goes on from what this device has, as it always did).
   */
  function stale() {
    return on && !!readLink()?.token && (!!inflight || (!state.synced && !state.tried));
  }

  /** Wait (at most `ms`) for the sync running now, or start one: the towers played elsewhere come in first. */
  function settle(ms = 3000) {
    if (!stale()) return Promise.resolve();
    const p = inflight || sync();
    return Promise.race([p.catch(() => {}), new Promise((resolve) => setTimeout(resolve, ms))]);
  }

  /** A sync a little later (a purchase, a new name): several changes in a row go as one. */
  function soon() {
    if (!on || !readLink()?.token) return;
    clearTimeout(soonTimer);
    soonTimer = setTimeout(() => { sync(); }, SOON_MS);
  }

  /** The game came back to the front (or a tower ended while a sync waited): sync if it's been a while. */
  function wake() {
    const link = readLink();
    if (!on || !link?.token) return;
    if (state.later || !link.at || now() - link.at >= BACK_SYNC_MS) sync();
  }

  /** Signed in with Google: `idToken` from the button or the phone. Throws Error(code) when it didn't work. */
  async function signInWithToken(idToken) {
    if (!on) throw new Error('not_configured');
    const r = await call('/account/google', { idToken });
    if (r.status !== 200 || !r.json?.ok || !r.json.token) {
      const code = r.status === 0 ? 'offline' : r.json?.error || 'error';
      state.error = code;
      changed('error');
      throw new Error(code);
    }
    const out = await locked(async () => {
      const prev = readLink();
      const gen = typeof r.json.gen === 'string' ? r.json.gen : '';
      const sameGoogle = !!prev?.account && prev.account === r.json.account;
      const sameAccount = sameGoogle && !!gen && prev.gen === gen;
      // the same account as before (this device was signed out by the server, not by the player): carry on from
      // where it was. One deleted and made anew takes this device's progress as new.
      const same = sameAccount && !!prev.base && Number.isInteger(prev.rev) && r.json.rev >= prev.rev;
      // (1.14) a different Google account: nothing is wiped; this device's progress joins that account as new
      // (base null), as a guest's would
      // the account keeps the leaderboard number of its first device (made now if that device has none yet); a
      // device that joins later takes the account's (the merge lists its own, if it had one, under board.past)
      if (!r.json.save?.board?.player) store.getBoardPlayer();
      const pending = sameAccount ? prev.pending || null : null;
      writeLink({ token: r.json.token, account: r.json.account, gen, rev: same ? prev.rev : r.json.rev | 0, base: same ? prev.base : null, at: null, pending });
      state.synced = false;
      state.error = null;
      changed('signed-in');
      // a store whose answer never came must be sorted out first (sync does): else merge what came with the sign-in
      if (pending) return 'sync';
      state.busy = true;
      try {
        const res = await mergeLoop({ rev: r.json.rev | 0, save: r.json.save ?? null });
        if (res === 'offline') state.error = 'offline';
        return res;
      } finally {
        state.busy = false;
        changed('idle');
      }
    });
    return out === 'sync' ? sync() : out;
  }

  /**
   * (1.14) Sign out: the last progress goes to the account first (when it can), then this device's session ends.
   * The phone keeps everything; the link keeps the account's last copy (`base`) and any store still on its way
   * (`pending`), so signing in to the same account again carries on without counting anything twice. Offline it
   * still signs out: what wasn't saved yet stays here and goes with the next sign-in.
   */
  async function signOut() {
    if (readLink()?.token) await sync().catch(() => null);
    // (another tab's sync waits: it must not run on after this)
    await locked(async () => {
      const link = readLink();
      if (link?.token) await call('/account/signout', { token: link.token });
      googleSignOut();
      if (link) writeLink({ ...link, token: null, left: true });
    });
    state.error = null;
    state.synced = false;
    changed('signed-out');
  }

  function googleSignOut() {
    try {
      native()?.signOut?.();
      globalThis.google?.accounts?.id?.disableAutoSelect?.();
    } catch {
      // Google's own sign-out is only a courtesy
    }
  }

  /** Delete the account (its save, every device's session, its leaderboard rows); (1.14) the phone keeps its own progress. */
  async function deleteAccount() {
    const link = readLink();
    if (!link?.token) throw new Error('out');
    const r = await call('/account/delete', { token: link.token });
    if (r.status === 401) {
      signedOutHere(link);
      throw new Error('out');
    }
    if (r.status !== 200 || !r.json?.ok) throw new Error(r.status === 0 ? 'offline' : 'error');
    await locked(async () => {
      googleSignOut();
      writeLink(null);   // (the account is gone: a sign-in later makes a new one, this device's progress joining it)
    });
    state.error = null;
    state.synced = false;
    changed('deleted');
  }

  // --- Google's sign-in --------------------------------------------------------------------------------
  let gis = null;
  let gisReady = false;
  function loadGis() {
    if (globalThis.google?.accounts?.id) return Promise.resolve(globalThis.google.accounts.id);
    gis ||= new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = GIS_SRC;
      s.async = true;
      s.onload = () => (globalThis.google?.accounts?.id ? resolve(globalThis.google.accounts.id) : reject(new Error('offline')));
      s.onerror = () => {
        gis = null;
        s.remove();
        reject(new Error('offline'));
      };
      document.head.append(s);
    });
    return gis;
  }

  /**
   * Google's "Sign in with Google" button in `slot` (the website). `onDone(err)` runs when a sign-in
   * finished (err null) or failed (err.message: the code).
   */
  async function renderButton(slot, { lang = 'af', onDone = () => {} } = {}) {
    const id = await loadGis();
    if (!gisReady) {
      id.initialize({
        client_id: clientId,
        callback: (resp) => {
          signInWithToken(resp?.credential).then((out) => button.onDone(null, out), (err) => button.onDone(err));
        },
        ux_mode: 'popup',
        auto_select: false,
        itp_support: true,
        context: 'signin',
      });
      gisReady = true;
    }
    button.onDone = onDone;
    if (!slot.isConnected) return;
    slot.replaceChildren();
    id.renderButton(slot, {
      type: 'standard', theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', logo_alignment: 'left',
      locale: lang === 'en' ? 'en' : 'af', width: Math.max(200, Math.min(320, slot.clientWidth || 280)),
    });
  }
  const button = { onDone: () => {} };

  /** The phone's own Google sign-in (the Android app). */
  async function signInNative() {
    const g = native();
    if (!g) throw new Error('error');
    let idToken;
    try {
      ({ idToken } = await g.signIn({ clientId }));
    } catch (err) {
      throw new Error(/cancel/i.test(String(err?.message || err)) ? 'canceled' : /no.?account|no.?credential/i.test(String(err?.message || err)) ? 'no_account' : 'error');
    }
    return signInWithToken(idToken);
  }

  return {
    /** Is sign-in possible here at all (a client ID and the server's address)? */
    get on() { return on; },
    /** What the account sheet shows. */
    status() {
      const link = readLink();
      return {
        on,
        signedIn: !!link?.token,
        out: !!(link && !link.token && !link.left),   // the server ended the session (not the player's own sign-out)
        at: link?.at || null,
        busy: state.busy,
        error: state.error,
        native: !!native(),
      };
    },
    sync, soon, wake, stale, settle, signInWithToken, signInNative, renderButton, signOut, deleteAccount,
  };
}
