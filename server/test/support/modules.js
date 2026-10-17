// The Worker's modules for Miniflare: src/worker.js and everything it imports, followed through the relative imports
// (the server shares the game's rules: js/core/*.js, js/kasteel/rules.js, ...). Listing them by hand went stale: a
// module missing from the list stops workerd, and the smoke test then skipped itself without a word.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const IMPORT_RE = /(?:^|[\s;])(?:import|export)\s*(?:[^'"]*?\sfrom\s*)?['"](\.{1,2}\/[^'"]+)['"]/g;

/** The worker's module files (absolute paths), the entry first. */
export function workerModules(entry = resolve(repoRoot, 'server/src/worker.js')) {
  const seen = new Set();
  const order = [];
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    order.push(file);
    const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const m of text.matchAll(IMPORT_RE)) walk(resolve(dirname(file), m[1]));
  };
  walk(entry);
  return order;
}
