// (1.15, the owner: "Isnt there a way to do it through a app notification?") GET /daily/config tells a 1.15+ Android app
// the newest version on Google Play (APP_LATEST), so an older app can show "Nuwe weergawe!" with a Play Store button.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './support/harness.js';

test('1.15 GET /daily/config: `app` is the newest Play version when APP_LATEST is set', async () => {
  assert.equal((await createHarness({ APP_LATEST: '1.15.0' }).request('GET', '/daily/config')).json.app, '1.15.0');
});

test('1.15 GET /daily/config: no `app` without APP_LATEST or with a value that is not a version', async () => {
  assert.equal('app' in (await createHarness({}).request('GET', '/daily/config')).json, false);
  for (const bad of ['latest', '1.15', '1.15.0-beta', '<b>1</b>']) {
    assert.equal('app' in (await createHarness({ APP_LATEST: bad }).request('GET', '/daily/config')).json, false, bad);
  }
});
