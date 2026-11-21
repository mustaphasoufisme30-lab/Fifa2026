import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canTriggerSound,
  computeCrowdGainLevels,
  computeEffectiveCrowdIntensity,
  SOUND_COOLDOWNS_MS,
  SoundChannelId,
} from './crowdLogic';

test('canTriggerSound prevents duplicate simultaneous triggers and allows playback after cooldown', () => {
  const history: Partial<Record<SoundChannelId, number>> = {};

  assert.equal(canTriggerSound(history, 'applause', 1000), true);
  assert.equal(canTriggerSound(history, 'applause', 1000), false, 'simultaneous duplicate must be blocked');
  assert.equal(
    canTriggerSound(history, 'applause', 1000 + SOUND_COOLDOWNS_MS.applause - 10),
    false,
    'must remain blocked before cooldown elapses',
  );
  assert.equal(
    canTriggerSound(history, 'applause', 1000 + SOUND_COOLDOWNS_MS.applause),
    true,
    'must re-allow after cooldown elapses',
  );

  // Independent channels do not block each other
  assert.equal(canTriggerSound(history, 'ooh', 1200), true);
  assert.equal(canTriggerSound(history, 'goalCheer', 1200), true);
});

test('computeEffectiveCrowdIntensity boosts on action and decays progressively back to normal ambience', () => {
  const base = 0.36;
  const peak = computeEffectiveCrowdIntensity(base, 0.45, 0, 3.0);
  const mid = computeEffectiveCrowdIntensity(base, 0.45, 1.5, 3.0);
  const settled = computeEffectiveCrowdIntensity(base, 0.45, 3.0, 3.0);

  assert.ok(peak > 0.78, `expected strong peak boost, got ${peak}`);
  assert.ok(mid > base && mid < peak, `expected smooth mid decay, got ${mid}`);
  assert.equal(settled, base, 'must return cleanly to baseline ambience');
  assert.equal(computeEffectiveCrowdIntensity(0, 0.5, 0, 3.0), 0, 'offline/muted base stays silent');
});

test('computeCrowdGainLevels maps zero to silence and scales smoothly with intensity', () => {
  const silent = computeCrowdGainLevels(0);
  const normal = computeCrowdGainLevels(0.35);
  const goal = computeCrowdGainLevels(1.0);

  assert.equal(silent.murmurGain, 0);
  assert.equal(silent.chatterGain, 0);
  assert.ok(normal.murmurGain > 0 && normal.murmurGain < goal.murmurGain);
  assert.ok(normal.chatterFreqHz < goal.chatterFreqHz);
});
