// admin.html — the owner's sponsor dashboard. Talks to the Worker's /admin/*
// endpoints with the ADMIN_TOKEN as a Bearer token. The token lives only in
// sessionStorage (this tab). Everything from the API is rendered as text.

import { buildMonthlyReport, lastDaysRange, periodLabel, previousMonthRange, thisMonthRange } from './statsReport.js';
import { fmtInt } from '../core/format.js';
import { $, $$, h, apiRequest, apiBase, focusEl, setBusy, safeStore, fmtDate, fmtDateTime, fmtRand, toMs, toDateInput, displayHost, isEmail } from './common.js';

const TOKEN_KEY = 'stapel.admin.token';
const TOKEN_MIN = 32;   // server/src/config.js ADMIN_TOKEN_MIN_LENGTH
const DAY = 86400000;
const session = safeStore('session');

const STATUS_LABELS = {
  pending: 'Wag vir betaling',
  active: 'Aktief',
  cancelling: 'Gekanselleer',
  ended: 'Geëindig',
  abandoned: 'Laat vaar',
};
const TIER_LABELS = { block: 'Blokke', premium: 'Advertensiebord' };
const FILTERS = [
  { id: 'all', label: 'Alles' },
  { id: 'live', label: 'Lewendig' },
  { id: 'pending', label: 'Wag vir betaling' },
  { id: 'attention', label: 'Versteek / nie goedgekeur' },
  { id: 'ended', label: 'Geëindig' },
];

const ERRORS = {
  unauthorized: 'Die admin-sleutel is verkeerd of het verval. Teken weer in.',
  admin_disabled: 'Admin is op die bediener afgeskakel: ADMIN_TOKEN is nie gestel nie (dit moet minstens 32 karakters wees).',
  not_configured: 'Die bediener se D1-databasis is nie gekoppel nie. Kyk na wrangler.toml.',
  not_configured_client: 'SPONSOR_API_URL in js/sponsorConfig.js is nie gestel nie.',
  network: 'Kon nie die API bereik nie. Kyk jou internetverbinding en SPONSOR_API_URL.',
  timeout: 'Die API het te lank gevat om te antwoord. Probeer weer.',
  not_found: 'Hierdie borg bestaan nie (meer) nie. Herlaai die lys.',
  paystack_error: 'Paystack het ’n fout teruggegee. Probeer weer, of kyk in die Paystack-paneelbord.',
  no_subscription: 'Hierdie borg het nie ’n Paystack-intekening nie.',
  cancel_first: 'Hierdie borg betaal nog via Paystack. Kanselleer eers die intekening, anders word hulle steeds gedebiteer.',
  invalid_name: 'Die naam is ongeldig: 2–22 karakters — letters, syfers, spasies en & . - ’ !',
  name_rejected: 'Die naam lyk soos kontakbesonderhede (’n webwerf, e-pos of foonnommer).',
  invalid_tagline: 'Die slagspreuk is ongeldig (2–40 karakters).',
  tagline_rejected: 'Die slagspreuk lyk soos kontakbesonderhede.',
  invalid_url: 'Die webwerf is ongeldig — net gewone https-adresse.',
  invalid_email: 'Die e-posadres is ongeldig.',
  invalid_contact: 'Die kontakpersoon se naam is ongeldig (2–60 letters).',
  invalid_phone: 'Die selfoonnommer is ongeldig.',
  invalid_tier: 'Kies ’n pakket.',
  invalid_field: 'Een van die velde is ongeldig.',
  rate_limited: 'Te veel versoeke. Wag ’n bietjie en probeer weer.',
  server_error: 'Die bediener het ’n fout gehad. Kyk na die logs met: npx wrangler tail',
  bad_response: 'Onverwagte antwoord van die API.',
  invalid_range: 'Kies ’n geldige tydperk: “van” voor “tot”, hoogstens 400 dae.',
};
const FIELD_LABELS = {
  name: 'naam', tagline: 'slagspreuk', url: 'webwerf', email: 'e-pos', contact_name: 'kontakpersoon',
  phone: 'selfoon', paid_until: 'einddatum', notes: 'notas', status: 'status', approved: 'goedgekeur',
  hidden: 'versteek', tier: 'pakket',
};

function errorText(err) {
  const code = err?.code || 'error';
  const field = typeof err?.data?.field === 'string' ? err.data.field : '';
  if (code === 'invalid_field' && FIELD_LABELS[field]) return `Die ${FIELD_LABELS[field]} is ongeldig.`;
  return ERRORS[code] || `Fout: ${code}`;
}

const str = (v) => (v == null ? '' : String(v));
const flag = (v) => v === true || Number(v) === 1;

// ===========================================================================
// State
// ===========================================================================

const st = {
  token: '',
  now: Date.now(),
  sponsors: [],
  payments: [],
  events: [],
  eventsLoaded: false,
  stats: { from: '', to: '', data: null, busy: false },
  filter: 'all',
  query: '',
  tab: 'sponsors',
};

/** API row (snake_case, as stored in D1) -> view model. */
function normSponsor(s) {
  const status = str(s.status);
  const paidUntil = toMs(s.paid_until ?? s.paidUntil);
  const approved = flag(s.approved);
  const hidden = flag(s.hidden);
  const live = typeof s.live === 'boolean'
    ? s.live
    : (status === 'active' || status === 'cancelling') && approved && !hidden && paidUntil != null && paidUntil > st.now;
  return {
    id: str(s.id),
    tier: s.tier === 'premium' ? 'premium' : 'block',
    name: str(s.name),
    tagline: str(s.tagline),
    url: str(s.url),
    contact: str(s.contact_name ?? s.contactName),
    email: str(s.email),
    phone: str(s.phone),
    status,
    approved,
    hidden,
    manual: flag(s.manual),
    subscription: str(s.paystack_subscription),
    paidUntil,
    adminUntil: toMs(s.admin_until),
    createdAt: toMs(s.created_at),
    notes: str(s.notes),
    live,
  };
}

function category(s) {
  if (s.live) return 'live';
  if (s.status === 'pending') return 'pending';
  const lapsed = s.paidUntil == null || s.paidUntil <= st.now;
  if (s.status === 'ended' || s.status === 'abandoned' || lapsed) return 'ended';
  return 'attention';
}

const billing = (s) => !!s.subscription && s.status === 'active';

// ===========================================================================
// API
// ===========================================================================

async function call(path, opts = {}) {
  try {
    return await apiRequest(path, { timeoutMs: 20000, ...opts, token: st.token });
  } catch (err) {
    if (err.code === 'unauthorized' && st.token) logout(ERRORS.unauthorized);
    throw err;
  }
}

const sponsorPath = (id, action = '') => `admin/sponsors/${encodeURIComponent(id)}${action ? '/' + action : ''}`;

async function loadSponsors() {
  const data = await call('admin/sponsors');
  const list = Array.isArray(data) ? data : Array.isArray(data?.sponsors) ? data.sponsors : null;
  if (!list) throw Object.assign(new Error('bad_response'), { code: 'bad_response' });
  st.now = Number.isFinite(data?.now) ? data.now : Date.now();
  st.sponsors = list.map(normSponsor).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

async function loadPayments() {
  const data = await call('admin/payments', { query: { limit: 1000 } });
  const list = Array.isArray(data) ? data : Array.isArray(data?.payments) ? data.payments : [];
  st.payments = list.map((p) => ({
    reference: str(p.reference),
    sponsorId: str(p.sponsor_id),
    amount: Number(p.amount) || 0,
    currency: str(p.currency || 'ZAR').toUpperCase(),
    paidAt: toMs(p.paid_at),
    source: str(p.source),
  })).sort((a, b) => (b.paidAt || 0) - (a.paidAt || 0));
}

async function loadEvents() {
  const data = await call('admin/events', { query: { limit: 100 } });
  const list = Array.isArray(data) ? data : Array.isArray(data?.events) ? data.events : [];
  st.events = list.map((e) => ({
    id: str(e.id),
    type: str(e.type),
    receivedAt: toMs(e.received_at),
    handled: flag(e.handled),
    sponsorId: str(e.sponsor_id),
    note: str(e.note),
    payload: e.payload ?? null,
  }));
  st.eventsLoaded = true;
}

// ===========================================================================
// Shell: login / logout / tabs / toasts
// ===========================================================================

const els = {};

function showOnly(which) {
  els.noApi.hidden = which !== 'no-api';
  els.login.hidden = which !== 'login';
  els.app.hidden = which !== 'app';
  els.tools.hidden = which !== 'app';
}

function toast(message, { error = false } = {}) {
  const t = h('div', { class: `toast${error ? ' is-err' : ''}`, text: message });
  els.toasts.append(t);
  while (els.toasts.children.length > 3) els.toasts.firstChild.remove();
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 300);
  }, error ? 6000 : 3200);
}

function setAlert(box, message) {
  if (!box) return;
  box.replaceChildren(...(message ? [h('p', { text: message })] : []));
  box.hidden = !message;
}

function logout(message = '') {
  session.remove(TOKEN_KEY);
  st.token = '';
  st.sponsors = [];
  st.payments = [];
  st.events = [];
  st.eventsLoaded = false;
  st.stats = { from: '', to: '', data: null, busy: false };
  // drop rendered contact details from the DOM too
  for (const box of [els.sponsorsBox, els.paymentsBox, els.eventsBox, els.kpis, els.statsBox]) box.replaceChildren();
  for (const d of $$('dialog[open]')) d.close();
  els.token.value = '';
  showOnly('login');
  setAlert(els.loginAlert, message);
  els.token.focus();
}

async function enter(token, { silent = false } = {}) {
  st.token = token;
  setBusy(els.loginBtn, true, 'Teken in…');
  try {
    await Promise.all([loadSponsors(), loadPayments()]);
    session.set(TOKEN_KEY, token);
    els.token.value = '';
    setAlert(els.loginAlert, '');
    showOnly('app');
    renderAll();
    selectTab('sponsors', { focus: false });
    focusEl($('#hoof h1'), { scroll: false });
  } catch (err) {
    if (st.token) {
      st.token = '';
      session.remove(TOKEN_KEY);
    }
    showOnly('login');
    if (!silent || err.code !== 'unauthorized') setAlert(els.loginAlert, errorText(err));
    else setAlert(els.loginAlert, ERRORS.unauthorized);
    focusEl(els.loginAlert.hidden ? els.token : els.loginAlert, { scroll: false });
  } finally {
    setBusy(els.loginBtn, false);
  }
}

async function refresh() {
  setBusy(els.refresh, true, 'Laai…');
  try {
    await Promise.all([loadSponsors(), loadPayments(), st.eventsLoaded ? loadEvents() : null]);
    renderAll();
    toast('Bygewerk');
  } catch (err) {
    if (st.token) toast(errorText(err), { error: true });
  } finally {
    setBusy(els.refresh, false);
  }
}

const TABS = ['sponsors', 'add', 'payments', 'stats', 'events'];

function selectTab(name, { focus = true } = {}) {
  st.tab = name;
  for (const t of TABS) {
    const tab = $(`#t-${t}`);
    const panel = $(`#p-${t}`);
    const on = t === name;
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
    panel.hidden = !on;
  }
  if (focus) $(`#t-${name}`).focus();
  if (name === 'stats' && !st.stats.data && !st.stats.busy) applyPreset('last30');
  if (name === 'events' && !st.eventsLoaded) {
    els.eventsBox.replaceChildren(h('p', { class: 'loading-line', text: 'Laai gebeure…' }));
    loadEvents().then(renderEvents, (err) => {
      els.eventsBox.replaceChildren(h('div', { class: 'alert', role: 'alert' }, h('p', { text: errorText(err) })));
    });
  }
}

function wireTabs() {
  for (const t of TABS) $(`#t-${t}`).addEventListener('click', () => selectTab(t, { focus: false }));
  $('.tabs').addEventListener('keydown', (e) => {
    const i = TABS.indexOf(st.tab);
    let next = null;
    if (e.key === 'ArrowRight') next = TABS[(i + 1) % TABS.length];
    else if (e.key === 'ArrowLeft') next = TABS[(i + TABS.length - 1) % TABS.length];
    else if (e.key === 'Home') next = TABS[0];
    else if (e.key === 'End') next = TABS[TABS.length - 1];
    if (next) {
      e.preventDefault();
      selectTab(next);
    }
  });
}

// ===========================================================================
// Rendering
// ===========================================================================

function renderAll() {
  renderKpis();
  renderFilters();
  renderSponsors();
  renderPayments();
  if (st.eventsLoaded) renderEvents();
}

function paymentsSince(ms) {
  return st.payments.filter((p) => p.paidAt != null && p.paidAt >= ms && p.currency === 'ZAR').reduce((n, p) => n + p.amount, 0);
}

function renderKpis() {
  const live = st.sponsors.filter((s) => s.live);
  const premium = live.filter((s) => s.tier === 'premium').map((s) => s.name).join(', ');
  const kpi = (value, label) => h('div', { class: 'kpi' }, h('b', { text: value, title: value }), h('span', { text: label }));
  els.kpis.replaceChildren(
    kpi(String(live.filter((s) => s.tier === 'block').length), 'Name op die blokke'),
    kpi(premium || 'Oop', premium ? 'Op die advertensiebord' : 'Advertensiebord'),
    kpi(String(st.sponsors.filter((s) => s.status === 'pending').length), 'Wag vir betaling'),
    kpi(fmtRand(paymentsSince(Date.now() - 30 * DAY)), 'Inkomste, laaste 30 dae'),
  );
}

const chips = new Map();   // filter id -> { button, count }

function renderFilters() {
  if (!chips.size) {
    for (const f of FILTERS) {
      const count = h('span', { class: 'n' });
      const button = h('button', {
        type: 'button',
        class: 'chipbtn',
        onclick: () => {
          st.filter = f.id;
          renderFilters();
          renderSponsors();
        },
      }, f.label, ' ', count);
      chips.set(f.id, { button, count });
      els.filters.insertBefore(button, els.search);
    }
  }
  const counts = { all: st.sponsors.length, live: 0, pending: 0, attention: 0, ended: 0 };
  for (const s of st.sponsors) counts[category(s)]++;
  for (const [id, c] of chips) {
    c.button.setAttribute('aria-pressed', String(st.filter === id));
    c.count.textContent = `(${counts[id]})`;
  }
}

function badge(text, cls) {
  return h('span', { class: `badge ${cls}`, text });
}

function statusBadges(s) {
  const out = [];
  if (s.live) out.push(badge('Lewendig', 'b-live'));
  else if (s.status === 'pending') out.push(badge(STATUS_LABELS.pending, 'b-pending'));
  if (!s.live || s.status !== 'active') {
    if (s.status !== 'pending') out.push(badge(STATUS_LABELS[s.status] || s.status || '?', `b-${s.status}`));
  }
  if ((s.status === 'active' || s.status === 'cancelling') && (s.paidUntil == null || s.paidUntil <= st.now)) out.push(badge('Verval', 'b-lapsed'));
  if (s.hidden) out.push(badge('Versteek', 'b-hidden'));
  if (!s.approved) out.push(badge('Nie goedgekeur', 'b-unapproved'));
  return h('div', { class: 'badges' }, out);
}

function untilCell(s) {
  const parts = [h('span', { class: 'strong', text: s.paidUntil ? fmtDate(s.paidUntil) : '—' })];
  if (s.paidUntil && s.paidUntil > st.now) {
    const days = Math.ceil((s.paidUntil - st.now) / DAY);
    parts.push(h('span', { class: 'muted', text: days === 1 ? 'nog 1 dag' : `nog ${days} dae` }));
  }
  if (s.adminUntil) parts.push(h('span', { class: 'muted', text: `minimum ${fmtDate(s.adminUntil)}` }));
  if (billing(s)) parts.push(h('span', { class: 'muted', text: 'hernu maandeliks' }));
  return h('div', { class: 'cell-stack' }, parts);
}

function contactCell(s) {
  const parts = [];
  if (s.contact) parts.push(h('span', { class: 'strong', text: s.contact }));
  if (s.email) parts.push(isEmail(s.email) ? h('a', { href: `mailto:${s.email}`, text: s.email }) : h('span', { text: s.email }));
  if (s.phone) parts.push(h('span', { text: s.phone }));
  if (!parts.length) parts.push(h('span', { class: 'muted', text: '—' }));
  return h('div', { class: 'cell-stack' }, parts);
}

function nameCell(s) {
  const host = s.url ? displayHost(s.url) : '';
  return h('div', { class: 'cell-stack' },
    h('span', { class: 'strong', text: s.name || '(sonder naam)' }),
    h('div', { class: 'badges' }, badge(TIER_LABELS[s.tier], `b-${s.tier}`), s.manual ? badge('Handmatig', 'b-manual') : null),
    s.tagline ? h('span', { class: 'muted', text: `“${s.tagline}”` }) : null,
    host ? h('span', { class: 'muted', text: host }) : null,
    s.notes ? h('span', { class: 'muted', text: `Nota: ${s.notes.length > 140 ? s.notes.slice(0, 140) + '…' : s.notes}` }) : null,
    s.createdAt ? h('span', { class: 'muted', text: `Geskep ${fmtDate(s.createdAt)}` }) : null,
  );
}

function actionsCell(s) {
  const btn = (act, label, fn, { danger = false } = {}) => h('button', {
    type: 'button',
    class: danger ? 'danger' : null,
    'data-act': act,
    'aria-label': `${label}: ${s.name}`,
    onclick: (e) => fn(s, e.currentTarget),
  }, label);
  return h('div', { class: 'row-actions' },
    btn('approve', s.approved ? 'Keur af' : 'Keur goed', toggleApproved),
    btn('hide', s.hidden ? 'Wys' : 'Versteek', toggleHidden),
    btn('edit', 'Wysig', openEdit),
    s.subscription ? btn('link', 'Bestuurskakel', manageLink) : null,
    billing(s) ? btn('cancel', 'Kanselleer', cancelSub, { danger: true }) : null,
    btn('delete', 'Skrap', removeSponsor, { danger: true }),
  );
}

/** Where focus should return after the table is rebuilt: { id, act } of a row button. */
function focusRef(button) {
  const row = button?.closest?.('tr[data-id]');
  return row ? { id: row.dataset.id, act: button.dataset.act } : null;
}

function restoreFocus(ref) {
  if (!ref) return;
  const row = els.sponsorsBox.querySelector(`tr[data-id="${CSS.escape(ref.id)}"]`);
  const target = row?.querySelector(`[data-act="${CSS.escape(ref.act || '')}"]`) || row?.querySelector('button');
  (target || els.panelSponsors).focus();
}

function renderSponsors() {
  const q = st.query.trim().toLowerCase();
  const rows = st.sponsors.filter((s) => {
    if (st.filter !== 'all' && category(s) !== st.filter) return false;
    if (!q) return true;
    return [s.name, s.email, s.contact, s.tagline, s.id].some((v) => v.toLowerCase().includes(q));
  });
  if (!rows.length) {
    els.sponsorsBox.replaceChildren(h('p', { class: 'empty', text: st.sponsors.length ? 'Geen borge pas by hierdie filter nie.' : 'Nog geen borge nie.' }));
    return;
  }
  const td = (label, content, cls) => h('td', { 'data-label': label, class: cls || null }, content);
  const table = h('table', { class: 'dtable' },
    h('caption', { class: 'sr-only', text: 'Borge' }),
    h('thead', null, h('tr', null, ['Borg', 'Status', 'Lewendig tot', 'Kontak', 'Aksies'].map((t) => h('th', { scope: 'col', text: t })))),
    h('tbody', null, rows.map((s) => h('tr', { 'data-id': s.id },
      td('Borg', nameCell(s), 'no-label'),
      td('Status', statusBadges(s)),
      td('Tot', untilCell(s)),
      td('Kontak', contactCell(s)),
      td('Aksies', actionsCell(s), 'no-label'),
    ))),
  );
  els.sponsorsBox.replaceChildren(table);
}

function sponsorName(id) {
  if (!id) return '';
  return st.sponsors.find((s) => s.id === id)?.name || '';
}

function money(p) {
  return p.currency === 'ZAR' ? fmtRand(p.amount) : `${(p.amount / 100).toFixed(2)} ${p.currency}`;
}

function renderPayments() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const summary = h('div', { class: 'kpis' },
    h('div', { class: 'kpi' }, h('b', { text: fmtRand(paymentsSince(Date.now() - 30 * DAY)) }), h('span', { text: 'Laaste 30 dae' })),
    h('div', { class: 'kpi' }, h('b', { text: fmtRand(paymentsSince(monthStart)) }), h('span', { text: 'Hierdie maand' })),
    h('div', { class: 'kpi' }, h('b', { text: fmtRand(paymentsSince(0)) }), h('span', { text: `Totaal (${st.payments.length} betalings)` })),
  );
  if (!st.payments.length) {
    els.paymentsBox.replaceChildren(summary, h('p', { class: 'empty', text: 'Nog geen betalings nie.' }));
    return;
  }
  const td = (label, content, cls) => h('td', { 'data-label': label, class: cls || null }, content);
  const table = h('table', { class: 'dtable' },
    h('caption', { class: 'sr-only', text: 'Betalings' }),
    h('thead', null, h('tr', null, ['Datum', 'Bedrag', 'Borg', 'Verwysing', 'Bron'].map((t) => h('th', { scope: 'col', text: t })))),
    h('tbody', null, st.payments.map((p) => h('tr', null,
      td('Datum', fmtDateTime(p.paidAt)),
      td('Bedrag', money(p), 'num strong'),
      td('Borg', sponsorName(p.sponsorId) || (p.sponsorId ? 'Geskrap' : 'Nie gekoppel nie'), p.sponsorId && sponsorName(p.sponsorId) ? null : 'muted'),
      td('Verwysing', h('span', { class: 'mono', text: p.reference })),
      td('Bron', p.source || '—', 'muted'),
    ))),
  );
  els.paymentsBox.replaceChildren(summary, table);
}

function renderEvents() {
  if (!st.events.length) {
    els.eventsBox.replaceChildren(h('p', { class: 'empty', text: 'Nog geen webhook-gebeure nie.' }));
    return;
  }
  const td = (label, content, cls) => h('td', { 'data-label': label, class: cls || null }, content);
  const rows = st.events.map((e) => {
    const pre = h('pre', { class: 'payload', hidden: true });
    const toggle = e.payload == null ? h('span', { class: 'muted', text: '—' }) : h('button', {
      type: 'button',
      'aria-expanded': 'false',
      onclick: (ev) => {
        const open = pre.hidden;
        if (open && !pre.textContent) {
          let text;
          try {
            text = typeof e.payload === 'string' ? e.payload : JSON.stringify(e.payload, null, 2);
          } catch {
            text = String(e.payload);
          }
          pre.textContent = text.length > 20000 ? text.slice(0, 20000) + '\n…' : text;
        }
        pre.hidden = !open;
        ev.currentTarget.setAttribute('aria-expanded', String(open));
        ev.currentTarget.textContent = open ? 'Versteek data' : 'Wys data';
      },
    }, 'Wys data');
    return h('tr', null,
      td('Tyd', fmtDateTime(e.receivedAt)),
      td('Tipe', h('span', { class: 'strong', text: e.type || '?' })),
      td('Hanteer', e.handled ? badge('Ja', 'b-live') : badge('Nee', 'b-pending')),
      td('Borg', sponsorName(e.sponsorId) || '—', sponsorName(e.sponsorId) ? null : 'muted'),
      td('Nota', e.note || '—', 'muted'),
      td('Data', h('div', { class: 'row-actions' }, toggle, pre)),
    );
  });
  els.eventsBox.replaceChildren(h('table', { class: 'dtable' },
    h('caption', { class: 'sr-only', text: 'Webhook-gebeure' }),
    h('thead', null, h('tr', null, ['Tyd', 'Tipe', 'Hanteer', 'Borg', 'Nota', 'Data'].map((t) => h('th', { scope: 'col', text: t })))),
    h('tbody', null, rows),
  ));
}

// ===========================================================================
// Statistiek: anonymous audience counts (GET /admin/stats) and the monthly report
// ===========================================================================

const PRESETS = [
  { id: 'last30', label: 'Laaste 30 dae', range: (today) => lastDaysRange(today, 30) },
  { id: 'month', label: 'Hierdie maand', range: (today) => thisMonthRange(today) },
  { id: 'prev', label: 'Vorige maand', range: (today) => previousMonthRange(today) },
];

const num = (v) => Math.max(0, Math.round(Number(v) || 0));

function normStats(data) {
  if (!data || typeof data !== 'object' || !data.totals) throw Object.assign(new Error('bad_response'), { code: 'bad_response' });
  const day = (d) => ({
    dateKey: str(d.dateKey),
    games: num(d.games),
    gamesDaily: num(d.gamesDaily),
    gamesPractice: num(d.gamesPractice),
    blockShows: num(d.blockShows),
    billboardGames: num(d.billboardGames),
    menuViews: num(d.menuViews),
  });
  return {
    from: str(data.from),
    to: str(data.to),
    totals: day(data.totals),
    days: (Array.isArray(data.days) ? data.days : []).map(day),
    sponsors: (Array.isArray(data.sponsors) ? data.sponsors : []).map((s) => ({
      id: str(s.id),
      name: s.name == null ? '' : str(s.name),
      tier: str(s.tier),
      blockShows: num(s.blockShows),
      billboardGames: num(s.billboardGames),
      blockDays: num(s.blockDays),
      billboardDays: num(s.billboardDays),
    })),
  };
}

async function loadStats(from, to) {
  st.stats.busy = true;
  setBusy(els.statsGo, true, 'Laai…');
  setAlert(els.statsAlert, '');
  try {
    const data = normStats(await call('admin/stats', { query: { from, to } }));
    st.stats.from = from;
    st.stats.to = to;
    st.stats.data = data;
    renderStats();
  } catch (err) {
    if (st.token) {
      setAlert(els.statsAlert, errorText(err));
      els.statsBox.replaceChildren();
    }
  } finally {
    st.stats.busy = false;
    setBusy(els.statsGo, false);
  }
}

function applyPreset(id) {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) return;
  const { from, to } = preset.range(toDateInput(Date.now()));
  els.statsFrom.value = from;
  els.statsTo.value = to;
  st.stats.preset = id;
  renderPresets();
  loadStats(from, to);
}

function renderPresets() {
  els.statsPresets.replaceChildren(...PRESETS.map((p) => h('button', {
    type: 'button',
    class: 'chipbtn',
    'aria-pressed': String(st.stats.preset === p.id),
    onclick: () => applyPreset(p.id),
  }, p.label)));
}

function submitRange(e) {
  e.preventDefault();
  const from = els.statsFrom.value;
  const to = els.statsTo.value;
  if (!from || !to || from > to) {
    setAlert(els.statsAlert, ERRORS.invalid_range);
    return;
  }
  st.stats.preset = '';
  renderPresets();
  loadStats(from, to);
}

/** Copies text; falls back to the old execCommand route. Resolves false when neither worked. */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { 'aria-hidden': 'true', tabindex: '-1', readonly: true });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

async function copyReport(s, button) {
  const { data } = st.stats;
  if (!data) return;
  const text = buildMonthlyReport({
    name: s.name || 'borg',
    tier: s.tier,
    from: data.from,
    to: data.to,
    games: data.totals.games,
    blockShows: s.blockShows,
    billboardGames: s.billboardGames,
    billboardDays: s.billboardDays,
  });
  // the report is also shown below the table, so it can be read, edited and copied by hand
  const preview = $('#stats-report');
  if (preview) {
    preview.value = text;
    $('#stats-report-for').textContent = `Verslag vir ${s.name || 'borg'}`;
    $('#stats-report-box').hidden = false;
  }
  const label = button.querySelector('.btn-label') || button;
  const ok = await copyText(text);
  const old = label.textContent;
  label.textContent = ok ? 'Gekopieer!' : 'Kopieer self';
  toast(ok ? 'Maandverslag gekopieer. Plak dit in ’n e-pos of WhatsApp.' : 'Kon nie outomaties kopieer nie. Kopieer die teks onder die tabelle self.', { error: !ok });
  setTimeout(() => { label.textContent = old; }, 2000);
}

function renderStats() {
  const { data } = st.stats;
  if (!data) {
    els.statsBox.replaceChildren();
    return;
  }
  const t = data.totals;
  const kpi = (value, label) => h('div', { class: 'kpi' }, h('b', { text: value, title: value }), h('span', { text: label }));
  const kpis = h('div', { class: 'kpis' },
    kpi(fmtInt(t.games), `Speletjies klaargespeel (${fmtInt(t.gamesDaily)} daagliks, ${fmtInt(t.gamesPractice)} oefen)`),
    kpi(fmtInt(t.blockShows), 'Name op blokke gewys'),
    kpi(fmtInt(t.billboardGames), 'Speletjies met ’n advertensiebord'),
    kpi(fmtInt(t.menuViews), 'Spyskaart-advertensie gesien'),
  );
  const td = (label, content, cls) => h('td', { 'data-label': label, class: cls || null }, content);
  const numCell = (label, n, cls = '') => td(label, fmtInt(n), `num ${cls}`.trim());

  const period = h('p', { class: 'hint stats-period', text: `Tydperk: ${periodLabel(data.from, data.to)}` });

  const perDay = data.days.length
    ? h('table', { class: 'dtable' },
      h('caption', { class: 'stats-caption', text: 'Per dag' }),
      h('thead', null, h('tr', null, ['Datum', 'Speletjies', 'Daagliks', 'Oefen', 'Name gewys', 'Advertensiebord', 'Spyskaart'].map((c) => h('th', { scope: 'col', text: c })))),
      h('tbody', null,
        data.days.map((d) => h('tr', null,
          td('Datum', d.dateKey, 'strong'),
          numCell('Speletjies', d.games, 'strong'),
          numCell('Daagliks', d.gamesDaily),
          numCell('Oefen', d.gamesPractice),
          numCell('Name gewys', d.blockShows),
          numCell('Advertensiebord', d.billboardGames),
          numCell('Spyskaart', d.menuViews),
        ))),
      h('tfoot', null, h('tr', null,
        td('Datum', 'Totaal', 'strong'),
        numCell('Speletjies', t.games, 'strong'),
        numCell('Daagliks', t.gamesDaily),
        numCell('Oefen', t.gamesPractice),
        numCell('Name gewys', t.blockShows),
        numCell('Advertensiebord', t.billboardGames),
        numCell('Spyskaart', t.menuViews),
      )))
    : h('p', { class: 'empty', text: 'Geen speletjies getel in hierdie tydperk nie.' });

  const perSponsor = data.sponsors.length
    ? h('table', { class: 'dtable' },
      h('caption', { class: 'stats-caption', text: 'Per borg' }),
      h('thead', null, h('tr', null, ['Borg', 'Pakket', 'Name gewys', 'Dae met name', 'Bord: speletjies', 'Bord: dae', 'Verslag'].map((c) => h('th', { scope: 'col', text: c })))),
      h('tbody', null, data.sponsors.map((s) => h('tr', null,
        td('Borg', s.name || 'Geskrap', s.name ? 'strong' : 'muted'),
        td('Pakket', TIER_LABELS[s.tier] || '—', 'muted'),
        numCell('Name gewys', s.blockShows),
        numCell('Dae met name', s.blockDays),
        numCell('Bord: speletjies', s.billboardGames),
        numCell('Bord: dae', s.billboardDays),
        td('Verslag', h('div', { class: 'row-actions' }, h('button', {
          type: 'button',
          class: 'report-btn',
          onclick: (ev) => copyReport(s, ev.currentTarget),
        }, h('span', { class: 'btn-label', text: 'Kopieer maandverslag' })))),
      ))))
    : h('p', { class: 'empty', text: 'Geen borg se naam of advertensiebord is in hierdie tydperk getel nie.' });

  const report = h('div', { class: 'report-box', id: 'stats-report-box', hidden: true },
    h('h3', { id: 'stats-report-for', class: 'stats-caption' }),
    h('textarea', { class: 'input report-text', id: 'stats-report', rows: '12', 'aria-labelledby': 'stats-report-for' }),
    h('p', { class: 'hint', text: 'Jy kan die teks hier nog wysig voordat jy dit stuur. Die getalle is net voltooide speletjies; ’n speler wat die blad toemaak voor die einde, tel nie.' }));

  els.statsBox.replaceChildren(period, kpis, perDay, perSponsor, report);
}

// ===========================================================================
// Dialogs
// ===========================================================================

function openDialog(dlg, returnFocus) {
  dlg._returnFocus = returnFocus || document.activeElement;
  if (typeof dlg.showModal === 'function') dlg.showModal();
  else dlg.setAttribute('open', '');
}

function closeDialog(dlg) {
  if (dlg.open) dlg.close();
}

function wireDialog(dlg) {
  dlg.addEventListener('close', () => {
    const back = dlg._returnFocus;
    dlg._returnFocus = null;
    if (back && back.isConnected) back.focus();
  });
  // click on the backdrop closes (the dialog element itself is the backdrop hit target)
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg && !dlg.dataset.busy) dlg.close('cancel');
  });
}

/**
 * Asks before a destructive action. Resolves false, or { option } where option
 * is the state of the optional checkbox.
 */
function confirmDialog({ title, body = [], yes = 'Ja', danger = true, option = null, trigger = null }) {
  const dlg = els.dlgConfirm;
  $('#confirm-title').textContent = title;
  const box = $('#confirm-body');
  const kids = body.filter(Boolean).map((b) => (typeof b === 'string' ? h('p', { class: 'dlg-p', text: b }) : b));
  let opt = null;
  if (option) {
    opt = h('input', { type: 'checkbox', id: 'confirm-opt' });
    kids.push(h('label', { class: 'check' }, opt, h('span', { text: option.label })));
  }
  box.replaceChildren(...kids);
  const yesBtn = $('#confirm-yes');
  yesBtn.querySelector('.btn-label').textContent = yes;
  yesBtn.classList.toggle('btn-red', danger);
  yesBtn.classList.toggle('btn-green', !danger);
  return new Promise((resolve) => {
    let result = false;
    const onYes = () => {
      result = { option: !!opt?.checked };
      dlg.close('ok');
    };
    const onNo = () => dlg.close('cancel');
    const onClose = () => {
      yesBtn.removeEventListener('click', onYes);
      $('#confirm-no').removeEventListener('click', onNo);
      dlg.removeEventListener('close', onClose);
      resolve(result);
    };
    yesBtn.addEventListener('click', onYes);
    $('#confirm-no').addEventListener('click', onNo);
    dlg.addEventListener('close', onClose);
    openDialog(dlg, trigger);
    $('#confirm-no').focus();   // the safe choice is the default
  });
}

// ===========================================================================
// Row actions
// ===========================================================================

function replaceSponsor(raw) {
  if (!raw || typeof raw !== 'object') return false;
  const s = normSponsor(raw);
  const i = st.sponsors.findIndex((x) => x.id === s.id);
  if (i < 0) return false;
  st.sponsors[i] = s;
  return true;
}

async function afterChange(data, message, ref = null) {
  if (!replaceSponsor(data?.sponsor)) await loadSponsors();
  renderAll();
  restoreFocus(ref);
  if (message) toast(message);
}

async function withButton(button, busyLabel, fn) {
  if (button) setBusy(button, true, busyLabel);
  try {
    return await fn();
  } catch (err) {
    if (st.token) toast(errorText(err), { error: true });
    return undefined;
  } finally {
    if (button && button.isConnected) setBusy(button, false);
  }
}

function toggleApproved(s, button) {
  const ref = focusRef(button);
  return withButton(button, '…', async () => {
    const data = await call(sponsorPath(s.id), { method: 'PATCH', body: { approved: !s.approved } });
    await afterChange(data, s.approved ? `“${s.name}” is nie meer goedgekeur nie` : `“${s.name}” is goedgekeur`, ref);
  });
}

function toggleHidden(s, button) {
  const ref = focusRef(button);
  return withButton(button, '…', async () => {
    const data = await call(sponsorPath(s.id), { method: 'PATCH', body: { hidden: !s.hidden } });
    await afterChange(data, s.hidden ? `“${s.name}” word weer gewys` : `“${s.name}” is versteek`, ref);
  });
}

async function manageLink(s, button) {
  await withButton(button, '…', async () => {
    const data = await call(sponsorPath(s.id, 'manage-link'), { method: 'POST' });
    const link = str(data?.link || data?.url);
    let safe = '';
    try {
      const u = new URL(link);
      if (u.protocol === 'https:') safe = u.href;
    } catch {
      safe = '';
    }
    if (!safe) throw Object.assign(new Error('bad_response'), { code: 'bad_response' });
    $('#link-intro').textContent = `Stuur hierdie skakel vir ${s.contact || s.name}${s.email ? ` (${s.email})` : ''}. Daar kan hulle hul kaart opdateer of die intekening kanselleer.`;
    $('#link-url').value = safe;
    openDialog(els.dlgLink, button);
    $('#link-url').select();
  });
}

async function cancelSub(s, button) {
  const stillPaid = s.paidUntil && s.paidUntil > st.now;
  const answer = await confirmDialog({
    title: `Kanselleer “${s.name}” se intekening?`,
    body: [
      'Paystack sal hulle nie weer debiteer nie. Dit kan nie ontdoen word nie — hulle sal weer moet inteken.',
      stillPaid ? `Hul naam bly in die spel tot ${fmtDate(s.paidUntil)}, want daarvoor het hulle reeds betaal.` : null,
    ],
    yes: 'Kanselleer intekening',
    option: { label: 'Beëindig dadelik — bv. by ’n oortreding van die voorwaardes (die naam verdwyn nou)' },
    trigger: button,
  });
  if (!answer) return;
  const ref = { ...focusRef(button), act: 'edit' };   // the cancel button itself disappears
  await withButton(button, 'Kanselleer…', async () => {
    const data = await call(sponsorPath(s.id, 'cancel'), { method: 'POST', body: { immediate: answer.option } });
    await afterChange(data, `“${s.name}” se intekening is gekanselleer`, ref);
  });
}

async function removeSponsor(s, button) {
  const answer = await confirmDialog({
    title: `Skrap “${s.name}”?`,
    body: [
      'Dit verwyder die borg en hul kontakbesonderhede permanent. Betalingsrekords bly vir jou boeke.',
      billing(s) ? 'Let wel: hierdie borg het nog ’n aktiewe Paystack-intekening. Kanselleer dit eers, anders word hulle steeds elke maand gedebiteer.' : null,
    ],
    yes: 'Skrap permanent',
    trigger: button,
  });
  if (!answer) return;
  await withButton(button, 'Skrap…', async () => {
    try {
      await call(sponsorPath(s.id), { method: 'DELETE' });
    } catch (err) {
      if (err.code !== 'cancel_first') throw err;
      const force = await confirmDialog({
        title: 'Hulle betaal nog',
        body: [ERRORS.cancel_first, 'Wil jy die borg tog skrap? Die Paystack-intekening loop dan voort totdat jy dit in die Paystack-paneelbord kanselleer.'],
        yes: 'Skrap tog',
      });
      if (!force) return;
      await call(sponsorPath(s.id), { method: 'DELETE', query: { force: 1 } });
    }
    st.sponsors = st.sponsors.filter((x) => x.id !== s.id);
    renderAll();
    toast(`“${s.name}” is geskrap`);
    els.panelSponsors.focus();
  });
}

// --- edit dialog -----------------------------------------------------------

let editing = null;
let editingRef = null;

function openEdit(s, button) {
  editing = s;
  editingRef = focusRef(button);
  $('#edit-sub').textContent = `${TIER_LABELS[s.tier]} · ${STATUS_LABELS[s.status] || s.status} · id ${s.id}`;
  $('#e-premium').hidden = s.tier !== 'premium';
  $('#e-name').value = s.name;
  $('#e-tagline').value = s.tagline;
  $('#e-url').value = s.url;
  $('#e-contact').value = s.contact;
  $('#e-email').value = s.email;
  $('#e-phone').value = s.phone;
  $('#e-status').value = STATUS_LABELS[s.status] ? s.status : 'active';
  $('#e-until').value = toDateInput(s.adminUntil);
  $('#e-approved').checked = s.approved;
  $('#e-hidden').checked = s.hidden;
  $('#e-notes').value = s.notes;
  setAlert($('#edit-alert'), '');
  for (const el of $$('#edit-form [aria-invalid]')) el.removeAttribute('aria-invalid');
  openDialog(els.dlgEdit, button);
  $('#e-name').focus();
}

function editDiff(s) {
  const out = {};
  const text = (id, key, current) => {
    const v = $(id).value.trim();
    if (v !== current) out[key] = v;
  };
  text('#e-name', 'name', s.name);
  if (s.tier === 'premium') {
    text('#e-tagline', 'tagline', s.tagline);
    text('#e-url', 'url', s.url);
  }
  text('#e-contact', 'contact_name', s.contact);
  text('#e-email', 'email', s.email);
  text('#e-phone', 'phone', s.phone);
  text('#e-notes', 'notes', s.notes);
  const status = $('#e-status').value;
  if (status !== s.status) out.status = status;
  const until = $('#e-until').value;
  if (until !== toDateInput(s.adminUntil)) out.paid_until = until || null;
  if ($('#e-approved').checked !== s.approved) out.approved = $('#e-approved').checked;
  if ($('#e-hidden').checked !== s.hidden) out.hidden = $('#e-hidden').checked;
  return out;
}

const EDIT_FIELD_IDS = {
  name: '#e-name', tagline: '#e-tagline', url: '#e-url', contact_name: '#e-contact', email: '#e-email',
  phone: '#e-phone', status: '#e-status', paid_until: '#e-until', notes: '#e-notes',
};

async function saveEdit(e) {
  e.preventDefault();
  const s = editing;
  if (!s) return;
  const diff = editDiff(s);
  if (!Object.keys(diff).length) {
    closeDialog(els.dlgEdit);
    return;
  }
  const save = $('#edit-save');
  els.dlgEdit.dataset.busy = '1';
  setBusy(save, true, 'Stoor…');
  try {
    const data = await call(sponsorPath(s.id), { method: 'PATCH', body: diff });
    delete els.dlgEdit.dataset.busy;
    closeDialog(els.dlgEdit);
    await afterChange(data, 'Gestoor', editingRef);
  } catch (err) {
    if (!st.token) return;
    setAlert($('#edit-alert'), errorText(err));
    const field = EDIT_FIELD_IDS[err?.data?.field] || (err.code === 'invalid_name' || err.code === 'name_rejected' ? '#e-name' : null);
    if (field) {
      $(field).setAttribute('aria-invalid', 'true');
      $(field).focus();
    } else {
      focusEl($('#edit-alert'), { scroll: false });
    }
  } finally {
    delete els.dlgEdit.dataset.busy;
    setBusy(save, false);
  }
}

// --- manual add ------------------------------------------------------------

async function addSponsor(e) {
  e.preventDefault();
  const alert = $('#add-alert');
  setAlert(alert, '');
  for (const el of $$('#add-form [aria-invalid]')) el.removeAttribute('aria-invalid');
  const tier = $('#a-tier').value === 'premium' ? 'premium' : 'block';
  const name = $('#a-name').value.trim();
  const until = $('#a-until').value;
  const missing = [];
  if (!name) missing.push(['#a-name', 'Tik die naam in.']);
  if (!until) missing.push(['#a-until', 'Kies tot wanneer die borg lewendig is.']);
  const email = $('#a-email').value.trim();
  if (email && !isEmail(email)) missing.push(['#a-email', ERRORS.invalid_email]);
  if (missing.length) {
    for (const [id] of missing) $(id).setAttribute('aria-invalid', 'true');
    setAlert(alert, missing.map((m) => m[1]).join(' '));
    $(missing[0][0]).focus();
    return;
  }
  const body = { tier, name, paid_until: until, approved: $('#a-approved').checked };
  const opt = (id, key) => {
    const v = $(id).value.trim();
    if (v) body[key] = v;
  };
  if (tier === 'premium') {
    opt('#a-tagline', 'tagline');
    opt('#a-url', 'url');
  }
  opt('#a-contact', 'contact_name');
  opt('#a-email', 'email');
  opt('#a-notes', 'notes');
  const btn = $('#add-btn');
  setBusy(btn, true, 'Voeg by…');
  try {
    const data = await call('admin/sponsors', { method: 'POST', body });
    if (data?.sponsor) st.sponsors.unshift(normSponsor(data.sponsor));
    else await loadSponsors();
    $('#add-form').reset();
    $('#a-premium').hidden = true;
    renderAll();
    toast(`“${name}” is bygevoeg`);
    selectTab('sponsors');
  } catch (err) {
    if (!st.token) return;
    setAlert(alert, errorText(err));
    const map = { name: '#a-name', tagline: '#a-tagline', url: '#a-url', email: '#a-email', contact_name: '#a-contact', paid_until: '#a-until', notes: '#a-notes', tier: '#a-tier' };
    const field = map[err?.data?.field];
    if (field) $(field).setAttribute('aria-invalid', 'true');
    focusEl(alert, { scroll: true });
  } finally {
    setBusy(btn, false);
  }
}

// ===========================================================================
// Boot
// ===========================================================================

async function copyLink() {
  const input = $('#link-url');
  const label = $('#link-copy .btn-label');
  let ok = false;
  try {
    await navigator.clipboard.writeText(input.value);
    ok = true;
  } catch {
    input.select();
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
  }
  label.textContent = ok ? 'Gekopieer!' : 'Kies en kopieer';
  setTimeout(() => { label.textContent = 'Kopieer'; }, 2000);
}

function init() {
  Object.assign(els, {
    noApi: $('#no-api'),
    login: $('#login'),
    app: $('#app'),
    tools: $('#tools'),
    refresh: $('#refresh'),
    loginAlert: $('#login-alert'),
    loginBtn: $('#login-btn'),
    token: $('#token'),
    kpis: $('#kpis'),
    filters: $('#filters'),
    search: $('#search'),
    sponsorsBox: $('#sponsors-box'),
    paymentsBox: $('#payments-box'),
    eventsBox: $('#events-box'),
    statsBox: $('#stats-box'),
    statsPresets: $('#stats-presets'),
    statsFrom: $('#s-from'),
    statsTo: $('#s-to'),
    statsGo: $('#stats-go'),
    statsAlert: $('#stats-alert'),
    panelSponsors: $('#p-sponsors'),
    toasts: $('#toasts'),
    dlgEdit: $('#dlg-edit'),
    dlgConfirm: $('#dlg-confirm'),
    dlgLink: $('#dlg-link'),
  });

  if (!apiBase()) {
    showOnly('no-api');
    return;
  }

  wireTabs();
  renderPresets();
  $('#stats-form').addEventListener('submit', submitRange);
  for (const d of [els.dlgEdit, els.dlgConfirm, els.dlgLink]) wireDialog(d);
  $('#login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const token = els.token.value.trim();
    if (token.length < TOKEN_MIN) {
      setAlert(els.loginAlert, `Die admin-sleutel is minstens ${TOKEN_MIN} karakters lank.`);
      els.token.setAttribute('aria-invalid', 'true');
      els.token.focus();
      return;
    }
    els.token.removeAttribute('aria-invalid');
    enter(token);
  });
  els.refresh.addEventListener('click', refresh);
  $('#logout').addEventListener('click', () => logout('Jy is uitgeteken.'));
  els.search.addEventListener('input', () => {
    st.query = els.search.value;
    renderSponsors();
  });
  $('#edit-form').addEventListener('submit', saveEdit);
  $('#edit-cancel').addEventListener('click', () => closeDialog(els.dlgEdit));
  $('#e-until-clear').addEventListener('click', () => {
    $('#e-until').value = '';
    $('#e-until').focus();
  });
  els.dlgEdit.addEventListener('cancel', (e) => {
    if (els.dlgEdit.dataset.busy) e.preventDefault();
  });
  $('#link-copy').addEventListener('click', copyLink);
  $('#link-close').addEventListener('click', () => closeDialog(els.dlgLink));
  $('#add-form').addEventListener('submit', addSponsor);
  $('#a-tier').addEventListener('change', () => {
    $('#a-premium').hidden = $('#a-tier').value !== 'premium';
  });

  const saved = session.get(TOKEN_KEY);
  if (typeof saved === 'string' && saved.length >= TOKEN_MIN) {
    enter(saved, { silent: true });
  } else {
    showOnly('login');
    els.token.focus();
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
