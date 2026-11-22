import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMERA_HEIGHT_DEFAULT,
  CAMERA_HEIGHT_MAX,
  CAMERA_HEIGHT_MIN,
  clampNumber,
  cycleValue,
  getDefaultGameSettings,
  getDifficultyAiSpeedScale,
  RIVAL_COLOR_PALETTE,
  sanitizeGameSettings,
  USER_COLOR_PALETTE,
  WEATHER_LIGHTING_PRESETS,
  WEATHER_OPTIONS,
} from './settingsConfig';

test('getDefaultGameSettings returns valid defaults matching reference ranges', () => {
  const d = getDefaultGameSettings();
  assert.equal(d.matchLevel, 'amateur');
  assert.equal(d.controlMode, 'manual');
  assert.equal(d.weather, 'clear');
  assert.equal(d.cameraHeight, CAMERA_HEIGHT_DEFAULT);
  assert.equal(d.soundVolume, 100);
  assert.equal(d.effectsEnabled, true);
  assert.equal(d.effectsVolume, 75);
  assert.equal(d.showRadar, true);
  assert.equal(d.showPlayerName, true);
  assert.equal(d.showCircle, true);
  assert.equal(d.viewMode, '3d');
  assert.ok(USER_COLOR_PALETTE.includes(d.userIndicatorColor));
  assert.ok(RIVAL_COLOR_PALETTE.includes(d.rivalIndicatorColor));
});

test('cycleValue wraps forward and backward cleanly', () => {
  const items = ['a', 'b', 'c'] as const;
  assert.equal(cycleValue(items, 'a', 1), 'b');
  assert.equal(cycleValue(items, 'c', 1), 'a');
  assert.equal(cycleValue(items, 'a', -1), 'c');
  assert.equal(cycleValue(items, 'b', -1), 'a');
});

test('clampNumber clamps out-of-range and non-finite inputs', () => {
  assert.equal(clampNumber(50, 14, 34), 34);
  assert.equal(clampNumber(-5, 0, 100), 0);
  assert.equal(clampNumber(Number.NaN, 14, 34), 14);
  assert.equal(clampNumber(24, 14, 34), 24);
});

test('sanitizeGameSettings preserves valid values, clamps ranges, and upgrades legacy saves', () => {
  const legacyPartial = {
    quality: 'high' as const,
    cameraMode: 'close' as const,
    soundEnabled: false,
    showTouchControls: false,
    halfDurationSeconds: 180,
  };
  const upgraded = sanitizeGameSettings(legacyPartial);
  assert.equal(upgraded.quality, 'high');
  assert.equal(upgraded.cameraMode, 'close');
  assert.equal(upgraded.soundEnabled, false);
  assert.equal(upgraded.halfDurationSeconds, 180);
  assert.equal(upgraded.weather, 'clear');
  assert.equal(upgraded.cameraHeight, CAMERA_HEIGHT_DEFAULT);
  assert.equal(upgraded.showRadar, true);

  const corrupted = sanitizeGameSettings({
    cameraHeight: 999,
    soundVolume: -40,
    effectsVolume: 180,
    userIndicatorColor: '#deadbeef',
    rivalIndicatorColor: 'not-a-color',
    halfDurationSeconds: 9999,
    weather: 'tornado' as never,
    viewMode: '4d' as never,
  });
  assert.equal(corrupted.cameraHeight, CAMERA_HEIGHT_MAX);
  assert.equal(corrupted.soundVolume, 0);
  assert.equal(corrupted.effectsVolume, 100);
  assert.equal(corrupted.userIndicatorColor, getDefaultGameSettings().userIndicatorColor);
  assert.equal(corrupted.rivalIndicatorColor, getDefaultGameSettings().rivalIndicatorColor);
  assert.equal(corrupted.halfDurationSeconds, getDefaultGameSettings().halfDurationSeconds);
  assert.equal(corrupted.weather, 'clear');
  assert.equal(corrupted.viewMode, '3d');

  const lowHeight = sanitizeGameSettings({ cameraHeight: 2 });
  assert.equal(lowHeight.cameraHeight, CAMERA_HEIGHT_MIN);
});

test('getDifficultyAiSpeedScale scales monotonically from amateur to world_class', () => {
  const amateur = getDifficultyAiSpeedScale('amateur');
  const pro = getDifficultyAiSpeedScale('pro');
  const worldClass = getDifficultyAiSpeedScale('world_class');
  assert.ok(amateur < pro);
  assert.ok(pro < worldClass);
});

test('every weather option has a complete lighting preset', () => {
  for (const opt of WEATHER_OPTIONS) {
    const preset = WEATHER_LIGHTING_PRESETS[opt.value];
    assert.ok(preset, `Missing lighting preset for ${opt.value}`);
    assert.ok(preset.keyIntensity > 0);
    assert.ok(preset.exposure > 0);
    assert.ok(preset.fogFar > preset.fogNear);
  }
});
