// Daily-puzzle share text (emoji grid) + sharing via the Web Share API, WhatsApp or the
// clipboard. Every browser API is looked up lazily and guarded, so this module
// imports cleanly in node and never throws in odd WebViews.

import { RATING_EMOJI, RATING_EMOJI_HC } from '../config.js';
import { S, WEATHER_INFO } from './strings.js';
import { fmtM, fmtInt } from './format.js';
import { visitorEmoji } from './visitorrules.js';

const GRID_COLS = 10;
const GRID_ROWS = 5;
const END_EMOJI = { flood: '🌊', lives: '💥' };

function gridLines(grid, reason, set = RATING_EMOJI) {
  const cells = [];
  for (const ch of String(grid || '')) {
    const e = set[ch];
    if (e) cells.push(e);
  }
  const max = GRID_COLS * GRID_ROWS;
  const shown = cells.slice(0, max);
  const rows = [];
  for (let k = 0; k < shown.length; k += GRID_COLS) rows.push(shown.slice(k, k + GRID_COLS).join(''));

  let tail = '';
  if (cells.length > max) tail += ` +${cells.length - max}`;
  tail += END_EMOJI[reason] || '';
  if (tail) {
    if (rows.length) rows[rows.length - 1] += tail;
    else rows.push(tail.trim());
  }
  return rows;
}

/**
 * The emoji share text (see SPEC "share.js" for the exact format).
 * `highContrast` swaps the grid to 🟦🟧⬜⬛, which colour-blind friends can tell apart.
 */
export function buildShareText(result, { url, highContrast = false } = {}) {
  const r = result || {};
  const lines = [];
  const height = fmtM(r.heightM || 0);
  const head = r.mode === 'practice' ? S.sharePracticeHead : S.shareDailyHead(r.dayNumber ?? '?');
  lines.push(`${head} 🏗️ ${height}`);

  const stats = [`⭐ ${fmtInt(r.score || 0)}`, `🎯 ${fmtInt(r.perfects || 0)}× ${S.perfects}`];
  if ((r.maxCombo || 0) >= 2) stats.push(`🔥 ${fmtInt(r.maxCombo)}`);
  lines.push(stats.join(' · '));

  lines.push(...gridLines(r.grid, r.reason, highContrast ? RATING_EMOJI_HC : RATING_EMOJI));

  // "Weer: 💨🌧️ · Besoekers: 🐒🦹✋" (either half on its own when the other is empty)
  const weather = (Array.isArray(r.weather) ? r.weather : [])
    .map((t) => WEATHER_INFO[t]?.emoji)
    .filter(Boolean);
  const visitors = visitorEmoji(r.visitors);
  const day = [];
  if (weather.length) day.push(`${S.weatherToday}: ${weather.join('')}`);
  if (visitors) day.push(`${S.visitors}: ${visitors}`);
  if (day.length) lines.push(day.join(' · '));

  lines.push(S.tagline);
  if (url) lines.push(String(url));
  return lines.join('\n');
}

export function whatsappUrl(text) {
  return 'https://wa.me/?text=' + encodeURIComponent(text);
}

// --- Browser plumbing (all guarded) ----------------------------------------------

function legacyCopy(text) {
  const doc = globalThis.document;
  if (!doc || typeof doc.createElement !== 'function' || !doc.body) return false;
  let ta = null;
  const active = doc.activeElement;
  try {
    ta = doc.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    // Off-screen but selectable; 16px avoids the iOS zoom-on-focus.
    ta.style.cssText = 'position:fixed;top:0;left:-9999px;width:1px;height:1px;opacity:0;font-size:16px;';
    doc.body.appendChild(ta);
    ta.focus();
    ta.select();
    if (typeof ta.setSelectionRange === 'function') ta.setSelectionRange(0, text.length);
    return !!doc.execCommand('copy');
  } catch {
    return false;
  } finally {
    try {
      if (ta && ta.parentNode) ta.parentNode.removeChild(ta);
      if (active && typeof active.focus === 'function') active.focus();
    } catch {
      // ignore
    }
  }
}

async function copyText(text) {
  try {
    const clip = globalThis.navigator?.clipboard;
    if (clip && typeof clip.writeText === 'function') {
      await clip.writeText(text);
      return 'copied';
    }
  } catch {
    // Permission denied / insecure context: try the old way.
  }
  return legacyCopy(text) ? 'copied' : 'failed';
}

function openWhatsApp(text) {
  const url = whatsappUrl(text);
  const win = globalThis.window;
  if (win && typeof win.open === 'function') {
    try {
      const w = win.open(url, '_blank');
      if (w) {
        try {
          w.opener = null;
        } catch {
          // cross-origin; harmless
        }
        return 'opened';
      }
    } catch {
      // popup blocked by a throwing WebView
    }
  }
  const loc = globalThis.location;
  if (loc) {
    try {
      loc.href = url;
      return 'opened';
    } catch {
      // fall through
    }
  }
  return 'failed';
}

/**
 * Share `text` through `channel` ('native' | 'whatsapp' | 'copy').
 * Resolves to 'shared' | 'copied' | 'opened' | 'failed' | 'cancelled'; never rejects.
 */
export async function shareResult(text, channel = 'native') {
  try {
    if (channel === 'whatsapp') return openWhatsApp(text);
    if (channel === 'native') {
      const nav = globalThis.navigator;
      if (nav && typeof nav.share === 'function') {
        try {
          await nav.share({ text });
          return 'shared';
        } catch (err) {
          if (err && err.name === 'AbortError') return 'cancelled';
          // NotAllowedError / unsupported payload: fall back to copying.
        }
      }
    }
    return await copyText(text);
  } catch {
    return 'failed';
  }
}
