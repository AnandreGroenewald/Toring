// Re-runs the date-sensitive suites in several time zones (DST north & south,
// no DST, UTC) so `npm test` alone proves the daily logic is zone-proof.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ZONES = ['Africa/Johannesburg', 'Europe/Amsterdam', 'America/New_York', 'Pacific/Auckland', 'UTC'];
const FILES = ['daily.test.js', 'storage.test.js', 'sequence.test.js', 'share.test.js'].map((f) => join(here, f));

for (const tz of ZONES) {
  test(`suites pass with TZ=${tz}`, { skip: process.env.STAPEL_TZ_CHILD ? 'nested' : false }, () => {
    const env = { ...process.env, TZ: tz, STAPEL_TZ_CHILD: '1' };
    delete env.NODE_TEST_CONTEXT; // otherwise the nested runner reports to us instead of exiting non-zero
    const probe = spawnSync(process.execPath, ['-e', 'process.stdout.write(Intl.DateTimeFormat().resolvedOptions().timeZone)'], { env, encoding: 'utf8' });
    assert.equal(probe.stdout, tz, `node does not know zone ${tz}`);

    const run = spawnSync(process.execPath, ['--test', ...FILES], { env, encoding: 'utf8', timeout: 120000 });
    const failed = (run.stdout || '').split('\n').filter((l) => /^\s*not ok/.test(l));
    assert.equal(run.status, 0, `TZ=${tz} failed:\n${failed.join('\n')}\n${(run.stdout || '').slice(-3000)}${run.stderr || ''}`);
  });
}
