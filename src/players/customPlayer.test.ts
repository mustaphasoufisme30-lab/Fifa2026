import test from 'node:test';
import assert from 'node:assert/strict';
import { TEAMS } from '../teams/teams';
import {
  applyCustomPlayerToTeam,
  BOOTS_COLOR_SWATCHES,
  computeOverallRating,
  getDefaultCustomPlayer,
  HAIR_COLOR_SWATCHES,
  mapRatingsToAttributes,
  sanitizeCustomPlayerProfile,
  SKIN_TONE_SWATCHES,
} from './customPlayer';
import { extractPaletteFromRgba } from './referenceAdapter';

test('mapRatingsToAttributes maps 60..96 ratings into valid physical ranges', () => {
  const low = mapRatingsToAttributes({
    pace: 60,
    shooting: 60,
    passing: 60,
    dribbling: 60,
    stamina: 65,
  });
  const high = mapRatingsToAttributes({
    pace: 96,
    shooting: 96,
    passing: 96,
    dribbling: 96,
    stamina: 99,
  });

  assert.ok(high.speed > low.speed);
  assert.ok(high.shotPower > low.shotPower);
  assert.equal(low.speed, 6.9);
  assert.equal(high.speed, 8.45);
  assert.equal(low.shotPower, 22);
  assert.equal(high.shotPower, 31.5);
  assert.equal(high.staminaMax, 99);
});

test('computeOverallRating weights striker vs midfielder ratings differently', () => {
  const strikerBuild = {
    pace: 94,
    shooting: 95,
    passing: 65,
    dribbling: 90,
    stamina: 75,
  };
  const stOvr = computeOverallRating(strikerBuild, 'ST');
  const cmOvr = computeOverallRating(strikerBuild, 'CM');
  assert.ok(stOvr > cmOvr, `Expected ST OVR (${stOvr}) > CM OVR (${cmOvr})`);
});

test('sanitizeCustomPlayerProfile clamps invalid numbers, slots, and empty names safely', () => {
  const safe = sanitizeCustomPlayerProfile({
    enabled: true,
    name: '   ',
    number: 188,
    slotIndex: 0, // GK slot not allowed for outfield customizer
    ratings: { pace: 120, shooting: 10, passing: 80, dribbling: 85, stamina: 40 },
  });

  assert.equal(safe.enabled, true);
  assert.equal(safe.name, 'A. Moreau');
  assert.equal(safe.number, 99);
  assert.equal(safe.slotIndex, 9);
  assert.equal(safe.ratings.pace, 96);
  assert.equal(safe.ratings.shooting, 60);
  assert.equal(safe.ratings.stamina, 65);
});

test('applyCustomPlayerToTeam overrides only the selected slot without mutating base team', () => {
  const baseTeam = TEAMS[0];
  const originalName = baseTeam.roster[9].name;
  const originalKit = baseTeam.kit.primary;

  const disabledProfile = { ...getDefaultCustomPlayer(), enabled: false };
  assert.equal(applyCustomPlayerToTeam(baseTeam, disabledProfile), baseTeam);

  const customProfile = {
    ...getDefaultCustomPlayer(),
    enabled: true,
    slotIndex: 9,
    name: 'K. Moreau',
    number: 77,
    appearance: {
      ...getDefaultCustomPlayer().appearance,
      hairStyle: 'mohawk' as const,
      jerseyPattern: 'sash' as const,
      jerseyColorOverride: '#059669',
    },
  };

  const customized = applyCustomPlayerToTeam(baseTeam, customProfile);
  assert.equal(customized.roster.length, 11);
  assert.equal(customized.roster[9].name, 'K. Moreau');
  assert.equal(customized.roster[9].number, 77);
  assert.equal(customized.roster[9].appearance.hairStyle, 'mohawk');
  assert.equal(customized.kit.primary, '#059669');

  // Verify base team was not mutated
  assert.equal(baseTeam.roster[9].name, originalName);
  assert.equal(baseTeam.kit.primary, originalKit);
});

test('extractPaletteFromRgba deterministically extracts valid original palette swatches', () => {
  const w = 16;
  const h = 16;
  const rgba = new Uint8ClampedArray(w * h * 4);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      if (y < 6) {
        // Blonde crown
        rgba[idx] = 205;
        rgba[idx + 1] = 160;
        rgba[idx + 2] = 75;
      } else if (y < 12) {
        // Warm tan center
        rgba[idx] = 185;
        rgba[idx + 1] = 122;
        rgba[idx + 2] = 82;
      } else {
        // Vibrant crimson accent at bottom
        rgba[idx] = 244;
        rgba[idx + 1] = 40;
        rgba[idx + 2] = 80;
      }
      rgba[idx + 3] = 255;
    }
  }

  const result = extractPaletteFromRgba(rgba, w, h);
  assert.ok(SKIN_TONE_SWATCHES.some((s) => s.hex === result.skinTone));
  assert.ok(HAIR_COLOR_SWATCHES.some((s) => s.hex === result.hairColor));
  assert.ok(BOOTS_COLOR_SWATCHES.some((s) => s.hex === result.bootsColor));
  assert.equal(result.hairColor, '#c89b44');
  assert.equal(result.skinTone, '#b97a52');
  assert.equal(result.bootsColor, '#f43f5e');
});
