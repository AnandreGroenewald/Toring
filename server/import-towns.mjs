#!/usr/bin/env node
// (1.18) The carry-over: the towns, raids and castles played on the home match server (matchhost.mjs keeps them in
// ~/Library/Application Support/Stapel home/dorp.json) into the Worker's TownHall, so nothing built at home is lost
// when Jou dorp goes online (the owner, 16 Oct 2026: "I need to make sure I carry it over"). Towns the Worker already
// has stay as they are (a second run changes nothing) unless --overwrite.
//
//   node import-towns.mjs                       a dry run: reads the file, checks it, says what would go over (and
//                                               lists the towns that were played, by name)
//   STAPEL_ADMIN_TOKEN=... node import-towns.mjs --send [--api <url>] [--file <path>] [--overwrite] [--only ID,ID]
// --only: just these towns (their ids, as the dry run lists them) with their castles. The home server also kept the
// test towns of the night's checks ("Bouer 123", "Anna", "Jan", "Claude"...): carry over only the real ones.
//
// The token is the Worker's ADMIN_TOKEN (the owner's Keychain: "Stapel admin token"); pass it straight in, e.g.
//   STAPEL_ADMIN_TOKEN=$(security find-generic-password -s 'Stapel admin token' -w) node import-towns.mjs --send
// It is never printed.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const file = opt('--file', join(homedir(), 'Library/Application Support/Stapel home/dorp.json'));
const api = opt('--api', 'https://stapel-borge.bonkers-bunch-online.workers.dev').replace(/\/+$/, '');
const send = args.includes('--send');
const overwrite = args.includes('--overwrite');
const CHUNK = 100;   // records a call (the Worker takes up to 200)
const KEY_RE = /^(dorp|kasteel|raid):[A-HJ-NP-Z2-9]+$/;

let data;
try {
  data = JSON.parse(readFileSync(file, 'utf8'));
} catch (err) {
  console.error(`Can't read ${file}: ${err.message}`);
  process.exit(1);
}
const only = opt('--only', '') ? new Set(opt('--only', '').split(',').map((x) => x.trim().toUpperCase()).filter(Boolean)) : null;
const entries = Object.entries(data && typeof data === 'object' ? data : {}).filter(([k]) => KEY_RE.test(k))
  .filter(([k]) => !only || (!k.startsWith('raid:') && only.has(k.split(':')[1])));
const kinds = entries.reduce((n, [k]) => ({ ...n, [k.split(':')[0]]: (n[k.split(':')[0]] || 0) + 1 }), {});
const played = entries.filter(([k, v]) => k.startsWith('dorp:') && (v.seq > 0 || v.people > 0)).length;
console.log(`${file}: ${kinds.dorp || 0} towns (${played} played), ${kinds.kasteel || 0} castles, ${kinds.raid || 0} raids${only ? ` (only ${[...only].join(', ')})` : ''}.`);
for (const [k, v] of entries) {
  if (k.startsWith('dorp:') && (v.seq > 0 || v.people > 0)) console.log(`  ${k.slice(5)}  ${String(v.name || '').padEnd(14)} ${v.people | 0} people, made ${new Date(v.made || 0).toISOString().slice(0, 16).replace('T', ' ')}`);
}
if (!send) {
  console.log(`Dry run: nothing sent. Add --send to put them on ${api}.`);
  process.exit(0);
}
const token = process.env.STAPEL_ADMIN_TOKEN || '';
if (token.length < 32) {
  console.error('Set STAPEL_ADMIN_TOKEN (the Worker\'s ADMIN_TOKEN) first.');
  process.exit(1);
}
let added = 0;
let skipped = 0;
const bad = [];
for (let i = 0; i < entries.length; i += CHUNK) {
  const res = await fetch(`${api}/admin/dorp/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ data: Object.fromEntries(entries.slice(i, i + CHUNK)), overwrite }),
  });
  const r = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`Stopped at record ${i}: ${res.status} ${r.error || ''}`);
    process.exit(1);
  }
  added += r.added | 0;
  skipped += r.skipped | 0;
  bad.push(...(r.bad || []));
}
const count = await (await fetch(`${api}/admin/dorp`, { headers: { Authorization: `Bearer ${token}` } })).json().catch(() => ({}));
console.log(`Added ${added}, already there ${skipped}${bad.length ? `, not taken ${bad.length} (${bad.slice(0, 5).join(', ')})` : ''}.`);
console.log(`The Worker now keeps ${count.towns ?? '?'} towns, ${count.castles ?? '?'} castles, ${count.raids ?? '?'} raids.`);
