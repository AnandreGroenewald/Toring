// "Sit Stapel op jou tuisskerm": captures the browser's install prompt (Android / Chrome) and, on iOS
// Safari, which has none, offers a tiny tip instead. Every browser API is looked up lazily and guarded
// so this imports cleanly in node and nothing breaks without localStorage.

export const INSTALL_DISMISS_KEY = 'stapel.install.dismissed';

let deferred = null;       // the saved beforeinstallprompt event
let installed = false;     // 'appinstalled' fired this session
const listeners = new Set();

const notify = () => { for (const f of listeners) { try { f(); } catch { /* a listener must not break the others */ } } };

/** Call once at boot: keeps the install prompt for later and tracks a finished install. */
export function initInstall(win = globalThis.window) {
  if (!win || typeof win.addEventListener !== 'function') return;
  win.addEventListener('beforeinstallprompt', (e) => {
    try { e.preventDefault(); } catch { /* ignore */ }
    deferred = e;
    notify();
  });
  win.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    notify();
  });
}

/** Run `fn` whenever the install state changes (the prompt arrives late, or the app got installed). */
export function onInstallChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isStandalone(g = globalThis) {
  try {
    if (g.Capacitor?.isNativePlatform?.()) return true;   // the Android app is installed by definition
    if (g.navigator?.standalone === true) return true;
    return !!g.matchMedia?.('(display-mode: standalone)').matches;
  } catch {
    return false;
  }
}

/** iPhone / iPad Safari (not another browser's shell), where "Add to Home Screen" lives in the Share sheet. */
export function isIosSafari(ua = globalThis.navigator?.userAgent || '', maxTouchPoints = globalThis.navigator?.maxTouchPoints || 0) {
  const s = String(ua);
  const ios = /iPad|iPhone|iPod/.test(s) || (/Macintosh/.test(s) && maxTouchPoints > 1);
  return ios && /Safari\//.test(s) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(s);
}

/** window.localStorage, or null where even touching it throws (blocked site data). */
function localStore() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function readDismissed(storage) {
  try {
    return storage?.getItem(INSTALL_DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissInstall(storage = localStore()) {
  try {
    storage?.setItem(INSTALL_DISMISS_KEY, '1');
  } catch {
    // no storage: it will simply be offered again next visit
  }
}

/**
 * What to offer on the results screen: 'prompt' (a real install button), 'ios' (a tip) or null
 * (installed, dismissed, or nothing to offer). Pure when the inputs are passed in.
 */
export function installMode({
  hasPrompt = !!deferred,
  standalone = isStandalone(),
  ios = isIosSafari(),
  dismissed = readDismissed(localStore()),
  wasInstalled = installed,
} = {}) {
  if (wasInstalled || standalone || dismissed) return null;
  if (hasPrompt) return 'prompt';
  return ios ? 'ios' : null;
}

/** Shows the browser's install dialog. Resolves to 'accepted' | 'dismissed' | 'unavailable'; never rejects. */
export async function promptInstall(storage = localStore()) {
  const ev = deferred;
  if (!ev || typeof ev.prompt !== 'function') return 'unavailable';
  deferred = null;   // a prompt event can only be used once
  try {
    await ev.prompt();
    const choice = await ev.userChoice;
    const outcome = choice && choice.outcome === 'accepted' ? 'accepted' : 'dismissed';
    if (outcome === 'dismissed') dismissInstall(storage);
    notify();
    return outcome;
  } catch {
    notify();
    return 'unavailable';
  }
}
