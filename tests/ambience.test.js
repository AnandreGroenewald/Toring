// The beach ambience API must clamp its input and never throw, also where there is no WebAudio (node).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audio, SOUND_NAMES } from '../js/audio.js';

test('audio.setAmbience clamps to 0..1 and ignores junk without WebAudio', () => {
  for (const [input, want] of [[0.4, 0.4], [7, 1], [-3, 0], [NaN, 0], [undefined, 0], ['x', 0], [null, 0]]) {
    assert.doesNotThrow(() => audio.setAmbience(input));
    assert.equal(audio.ambience, want);
  }
  assert.doesNotThrow(() => { audio.suspend(); audio.setAmbience(1); audio.resume(); audio.setEnabled(false); audio.setEnabled(true); });
  audio.setAmbience(0);
});

test('the seagull sound exists', () => {
  assert.ok(SOUND_NAMES.includes('gull'));
});
