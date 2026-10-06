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
  contactEmail: '',
  // Must match the "Weergawe" line in terme.html / privaatheid.html. Bump both
  // together whenever the text changes: the server records which version each
  // sponsor accepted.
  termsVersion: '2026-10-06',
  privacyVersion: '2026-10-06',
  // Shown on adverteer.html. Must match the Paystack plan for the premium tier.
  // (The block tier's price is deliberately never shown on the site.)
  premiumPriceLabel: 'R1 499 per maand',
  blockShare: 1,
  maxNameLen: 22,
  maxTaglineLen: 40,
};

export const salesEnabled = () => !!SPONSOR_API_URL;
