// Stapel — borgskap-instellings (sponsorship settings).
// This is the ONE file the owner edits to switch the sponsorship sales on.
// Setup guide: server/README.md.

/**
 * Base URL of the deployed Cloudflare Worker, e.g.
 * 'https://stapel-borge.<your-subdomain>.workers.dev'.
 * While this is empty the game shows only the house ad and the manual entries
 * in sponsors.json, and adverteer.html shows a "kom binnekort" page.
 */
export const SPONSOR_API_URL = '';

export const SPONSOR = {
  // Public contact address. Every link or sentence that would show it stays
  // hidden while this is empty.
  contactEmail: 'lekkerlocal.apps@gmail.com',
  // Must match the "Weergawe" line in terme.html / privaatheid.html. Bump both
  // together whenever the text changes: the server records which version each
  // sponsor accepted.
  termsVersion: '2026-10-06',
  privacyVersion: '2026-10-08',
  // Shown on adverteer.html. Must match the Paystack plan for the premium tier.
  // (The block tier's price is deliberately never shown on the site.)
  premiumPriceLabel: 'R1 499 per maand',
  blockShare: 0.4,
  maxNameLen: 22,
  maxTaglineLen: 40,
};

export const salesEnabled = () => !!SPONSOR_API_URL;

/**
 * Live Uitdagersreeks matches and the anonymous player counts with the daily "beter as X%" line run on
 * the same Worker. While this is empty they follow SPONSOR_API_URL; put the Worker's URL here to switch
 * them on before sponsorship sales. Without either, the Uitdagersreeks still works against the computer
 * and with friend challenge links.
 */
export const MATCH_API_URL = 'https://stapel-borge.bonkers-bunch-online.workers.dev';
export const matchApiUrl = () => MATCH_API_URL || SPONSOR_API_URL;
