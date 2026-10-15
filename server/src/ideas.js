// (1.15.6) The testers' vote on the three Living Tower ideas (the owner, 15 Oct 2026: "build all three with which one do
// you like most option for the testers. Then at the end of the week we can see who voted for what, their opinion matter").
// A vote is { voter, choice 1-3, name, reason? }: one per phone (a random id the preview page keeps), changeable.
// The votes live in the lobby Durable Object's storage (no D1 table); the owner reads them at /admin/stemme.
// Privacy: only the name, the choice, the reason and the ideas played are kept, and all of it goes after VOTE_DELETE.

import { HttpError, json, readJsonObject } from './http.js';
import { checkOrigin, limit } from './stats.js';
import { cleanNickname } from '../../js/core/duel.js';
import { checkTagline, isAllowedChar, normalizeText } from '../../js/core/nameRules.js';

export const VOTE_CHOICES = [1, 2, 3];
export const REASON_MAX = 200;
export const VOTES_PER_HOUR = 20;     // per address: a changed mind or two, not a script
export const VOTERS_MAX = 400;        // the whole vote (the Family has 24 testers)
/** No new votes from then on (SAST midnight). */
export const VOTE_CLOSE = Date.parse('2026-11-01T00:00:00+02:00');
/** Every vote is deleted from then on (privacy: the reason we keep them is over). */
export const VOTE_DELETE = Date.parse('2026-11-08T00:00:00+02:00');
const VOTER_RE = /^[a-z0-9]{12,32}$/;

/** A reason as the tester typed it, kept to the tagline characters (emoji and brackets become spaces), or null. */
export function cleanReason(raw) {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: true, value: null };
  const kept = [...normalizeText(raw)].map((ch) => (isAllowedChar(ch, 'tagline') ? ch : ' ')).join('').replace(/\s+/g, ' ').trim().slice(0, REASON_MAX).trim();
  if (!kept) return { ok: true, value: null };
  const c = checkTagline(kept, { max: REASON_MAX });
  if (c.ok) return { ok: true, value: c.value };
  // a rude word or a phone number/e-mail: say so; anything else (too short, only symbols) is just no reason
  return c.code === 'tagline_rejected' ? { ok: false } : { ok: true, value: null };
}

/** A posted vote, checked; throws HttpError 400/422 for anything wrong. */
export function validateVote(body) {
  if (!body || typeof body.voter !== 'string' || !VOTER_RE.test(body.voter)) throw new HttpError(400, 'invalid_field', { field: 'voter' });
  if (!VOTE_CHOICES.includes(body.choice)) throw new HttpError(400, 'invalid_field', { field: 'choice' });
  const name = cleanNickname(typeof body.name === 'string' ? body.name : '');
  if (!name) throw new HttpError(400, 'name_rejected');
  const reason = cleanReason(body.reason);
  if (!reason.ok) throw new HttpError(422, 'reason_rejected');
  const played = Array.isArray(body.played) ? [...new Set(body.played.filter((k) => VOTE_CHOICES.includes(k)))].sort() : [];
  return { voter: body.voter, choice: body.choice, name, reason: reason.value, played };
}

/** POST /idees/stem — the game's own pages only, a few an hour per address. */
export async function postVote(request, ctx) {
  checkOrigin(request, ctx.cfg);
  await limit(ctx, request, 'vote', VOTES_PER_HOUR);
  if (ctx.now >= VOTE_CLOSE) throw new HttpError(410, 'vote_closed');
  if (!ctx.lobby) throw new HttpError(503, 'not_configured');
  const vote = validateVote(await readJsonObject(request, 2048));
  const res = await ctx.lobby().fetch(new Request('https://lobby/votes', { method: 'POST', body: JSON.stringify({ ...vote, at: ctx.now }) }));
  if (res.status === 429) throw new HttpError(429, 'rate_limited');
  if (!res.ok) throw new HttpError(503, 'busy');
  return json(200, { ok: true, choice: vote.choice });
}

/** GET /admin/stemme — the counts and every vote (name, choice, reason, when); POST { names } forgets votes (a test, a rude one). */
export async function adminVotes(request, ctx) {
  if (!ctx.lobby) throw new HttpError(503, 'not_configured');
  if (request.method === 'GET') {
    const res = await ctx.lobby().fetch(new Request('https://lobby/votes/list'));
    return json(res.status, await res.json());
  }
  const body = await readJsonObject(request, 2048);
  const res = await ctx.lobby().fetch(new Request('https://lobby/votes/forget', { method: 'POST', body: JSON.stringify({ names: body?.names }) }));
  return json(res.status, await res.json());
}

// ------------------------------------------------------------------------------- inside the lobby
/** The lobby's side: { storage, now } → handlers for /votes, /votes/list, /votes/forget, /votes/prune. */
export function lobbyVotes(storage, now) {
  const read = async () => {
    if (now() >= VOTE_DELETE) {
      if ((await storage.get('votes')) !== undefined) await storage.delete('votes');
      return {};
    }
    return (await storage.get('votes')) || {};
  };
  return {
    async add(request) {
      let v = null;
      try {
        v = await request.json();
      } catch {
        v = null;
      }
      if (!v || typeof v.voter !== 'string' || !VOTER_RE.test(v.voter) || !VOTE_CHOICES.includes(v.choice) || typeof v.name !== 'string') return json(400, { error: 'invalid' });
      const votes = await read();
      const prev = votes[v.voter];
      if (!prev && Object.keys(votes).length >= VOTERS_MAX) return json(429, { error: 'full' });
      const t = Number.isFinite(v.at) ? v.at : now();
      votes[v.voter] = {
        name: v.name,
        choice: v.choice,
        reason: typeof v.reason === 'string' ? v.reason : '',
        played: Array.isArray(v.played) ? v.played : [],
        at: t,
        first: prev ? prev.first : t,
        changed: prev ? (prev.changed || 0) + (prev.choice !== v.choice ? 1 : 0) : 0,
      };
      await storage.put('votes', votes);
      return json(200, { ok: true });
    },
    /** Every vote (oldest first; the phones' ids stay inside) and the count per idea. */
    async list() {
      const votes = Object.values(await read()).sort((a, b) => a.at - b.at);
      const counts = { 1: 0, 2: 0, 3: 0 };
      for (const v of votes) counts[v.choice] += 1;
      return json(200, { counts, total: votes.length, closes: new Date(VOTE_CLOSE).toISOString(), deleted: new Date(VOTE_DELETE).toISOString(), votes });
    },
    async forget(request) {
      let body = null;
      try {
        body = await request.json();
      } catch {
        body = null;
      }
      const names = new Set((Array.isArray(body?.names) ? body.names : []).filter((n) => typeof n === 'string' && n).slice(0, 20));
      if (!names.size) return json(400, { error: 'names_expected' });
      const votes = await read();
      let removed = 0;
      for (const [k, v] of Object.entries(votes)) if (names.has(v.name)) { delete votes[k]; removed += 1; }
      if (removed) await storage.put('votes', votes);
      return json(200, { ok: true, removed, left: Object.keys(votes).length });
    },
    /** The daily job: after VOTE_DELETE nothing is left. */
    async prune() {
      await read();
      return json(200, { ok: true });
    },
  };
}
