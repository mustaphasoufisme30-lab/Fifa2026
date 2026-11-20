import test from 'node:test';
import assert from 'node:assert/strict';
import {
  blendArticulatedPose,
  createAnimMemory,
  createDefaultPose,
  evaluateTargetPose,
  PlayerAnimSignals,
  resolvePlayerAnimClip,
  shortestAngleDelta,
} from './playerAnimation';

function makeSignals(overrides: Partial<PlayerAnimSignals> = {}): PlayerAnimSignals {
  return {
    speed: 0,
    facingAngle: 0,
    actionState: 'idle',
    actionTimer: 0,
    hasBall: false,
    diveDir: 0,
    team: 'home',
    slotIndex: 9,
    animPhase: 0,
    shotCharge: 0,
    ballSpeed: 0,
    dt: 0.016,
    elapsed: 1.0,
    ...overrides,
  };
}

test('resolvePlayerAnimClip maps speed bands cleanly to idle, walk, run, and sprint', () => {
  const mem = createAnimMemory();
  assert.equal(resolvePlayerAnimClip(makeSignals({ speed: 0 }), mem), 'idle');
  assert.equal(resolvePlayerAnimClip(makeSignals({ speed: 1.4, actionState: 'run' }), mem), 'walk');
  assert.equal(resolvePlayerAnimClip(makeSignals({ speed: 4.5, actionState: 'run' }), mem), 'run');
  assert.equal(resolvePlayerAnimClip(makeSignals({ speed: 7.4, actionState: 'sprint' }), mem), 'sprint');
});

test('resolvePlayerAnimClip detects abrupt braking as stop and rapid rotation as turn', () => {
  const memStop = createAnimMemory();
  resolvePlayerAnimClip(makeSignals({ speed: 6.0, actionState: 'run' }), memStop);
  const stopClip = resolvePlayerAnimClip(makeSignals({ speed: 1.2, actionState: 'run', dt: 0.05 }), memStop);
  assert.equal(stopClip, 'stop');

  const memTurn = createAnimMemory();
  resolvePlayerAnimClip(makeSignals({ speed: 4.0, facingAngle: 0, dt: 0.05 }), memTurn);
  let clip = 'run';
  for (let i = 1; i <= 6; i++) {
    clip = resolvePlayerAnimClip(
      makeSignals({ speed: 4.0, facingAngle: i * 0.45, dt: 0.05 }),
      memTurn,
    );
  }
  assert.equal(clip, 'turn');
});

test('resolvePlayerAnimClip distinguishes pass, shoot, kick, tackle, dive, and celebration', () => {
  const memPass = createAnimMemory();
  assert.equal(
    resolvePlayerAnimClip(makeSignals({ actionState: 'kick', ballSpeed: 13.5 }), memPass),
    'pass',
  );

  const memShoot = createAnimMemory();
  resolvePlayerAnimClip(makeSignals({ actionState: 'run', shotCharge: 0.7 }), memShoot);
  assert.equal(
    resolvePlayerAnimClip(makeSignals({ actionState: 'kick', ballSpeed: 26 }), memShoot),
    'shoot',
  );

  const memKick = createAnimMemory();
  assert.equal(
    resolvePlayerAnimClip(makeSignals({ actionState: 'kick', ballSpeed: 4.0 }), memKick),
    'kick',
  );

  assert.equal(resolvePlayerAnimClip(makeSignals({ actionState: 'tackle' }), createAnimMemory()), 'tackle');
  assert.equal(resolvePlayerAnimClip(makeSignals({ actionState: 'dive', diveDir: 1 }), createAnimMemory()), 'dive');
  assert.equal(
    resolvePlayerAnimClip(makeSignals({ actionState: 'celebrate' }), createAnimMemory()),
    'celebration',
  );
});

test('blendArticulatedPose interpolates smoothly without instant snapping and converges to target', () => {
  const current = createDefaultPose();
  const target = createDefaultPose();
  const mem = createAnimMemory();
  const signals = makeSignals({ actionState: 'celebrate', elapsed: 1.4 });
  evaluateTargetPose('celebration', signals, mem, target);

  // Single 16ms frame should move smoothly part-way, not jump instantaneously
  blendArticulatedPose(current, target, 'celebration', 0.016);
  assert.ok(current.leftShoulderPitch < -0.2);
  assert.ok(current.leftShoulderPitch > target.leftShoulderPitch);

  // After ~0.6s of frames, current should converge close to target
  for (let i = 0; i < 40; i++) {
    blendArticulatedPose(current, target, 'celebration', 0.016);
  }
  assert.ok(Math.abs(current.leftShoulderPitch - target.leftShoulderPitch) < 0.05);
});

test('shortestAngleDelta wraps cleanly across PI boundary', () => {
  const delta = shortestAngleDelta(Math.PI - 0.1, -Math.PI + 0.1);
  assert.ok(Math.abs(delta - 0.2) < 1e-6);
});
