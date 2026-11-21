import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSpectatorSlots, getCrowdCountForQuality } from './crowdMesh';

test('generateSpectatorSlots produces organized multi-stand spectators with silhouette & color variation', () => {
  const slots = generateSpectatorSlots(1200);
  assert.ok(slots.length > 600, `expected > 600 organized seats, got ${slots.length}`);
  assert.ok(slots.length <= 1200, 'must respect maxCount cap');

  const stands = new Set(slots.map((s) => s.standIndex));
  assert.equal(stands.size, 4, 'spectators should populate North, West, East, and South stands');

  const shirtColors = new Set(slots.map((s) => s.shirtColorHex));
  const skinColors = new Set(slots.map((s) => s.skinColorHex));
  assert.ok(shirtColors.size >= 6, 'crowd should have rich clothing color variation');
  assert.ok(skinColors.size >= 4, 'crowd should have varied head/skin tones');

  // Verify silhouette variation stays within realistic human bounds and sits above pitch level
  for (const s of slots) {
    assert.ok(s.y >= 2.5 && s.y <= 11.5, `unexpected seat height ${s.y}`);
    assert.ok(s.scaleW >= 0.85 && s.scaleW <= 1.15);
    assert.ok(s.scaleH >= 0.85 && s.scaleH <= 1.15);
  }
});

test('getCrowdCountForQuality scales mobile LOD cleanly across low, medium, and high', () => {
  const max = 1320;
  const low = getCrowdCountForQuality('low', max);
  const med = getCrowdCountForQuality('medium', max);
  const high = getCrowdCountForQuality('high', max);

  assert.ok(low > 0 && low < med && med < high && high === max);
});
