import test from 'node:test';
import assert from 'node:assert/strict';
import {
  blendArticulatedPose,
  createAnimMemory,
  createDefaultPose,
  dampFacingAngle,
  evaluateTargetPose,
  PlayerAnimClip,
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

test('resolvePlayerAnimClip triggers receive on fresh ball possession and settles back to idle/run', () => {
  const mem = createAnimMemory();
  resolvePlayerAnimClip(makeSignals({ speed: 1.5, hasBall: false }), mem);
  const clip = resolvePlayerAnimClip(makeSignals({ speed: 1.5, hasBall: true, dt: 0.016 }), mem);
  assert.equal(clip, 'receive');

  // After ~0.35s, receive timer decays cleanly back into locomotion
  let afterClip: PlayerAnimClip = clip;
  for (let i = 0; i < 10; i++) {
    afterClip = resolvePlayerAnimClip(makeSignals({ speed: 1.5, hasBall: true, dt: 0.04 }), mem);
  }
  assert.equal(afterClip, 'walk');
});

test('dampFacingAngle smoothly turns along shortest arc without instant snapping', () => {
  const start = Math.PI - 0.15;
  const target = -Math.PI + 0.15; // 0.30 rad across the PI boundary
  const next = dampFacingAngle(start, target, 14, 0.016);
  const moved = shortestAngleDelta(start, next);
  assert.ok(moved > 0.03 && moved < 0.25);

  let cur = start;
  for (let i = 0; i < 40; i++) {
    cur = dampFacingAngle(cur, target, 14, 0.016);
  }
  assert.ok(Math.abs(shortestAngleDelta(cur, target)) < 0.01);
});

test('evaluateTargetPose applies shot-charge leg wind-up anticipation before kick release', () => {
  const mem = createAnimMemory();
  const neutral = createDefaultPose();
  const wound = createDefaultPose();
  evaluateTargetPose('idle', makeSignals({ shotCharge: 0 }), mem, neutral);
  evaluateTargetPose('idle', makeSignals({ shotCharge: 0.85 }), mem, wound);
  assert.ok(wound.rightHipPitch > neutral.rightHipPitch + 0.25);
  assert.ok(wound.rightKneeFlex > neutral.rightKneeFlex + 0.3);
});

test('resolvePlayerAnimClip detects opponent interception recovery and power-shot reactions', () => {
  const mem = createAnimMemory();
  resolvePlayerAnimClip(
    makeSignals({ team: 'home', hasBall: false, ballLastTouchTeam: 'away' }),
    mem,
  );
  const clip = resolvePlayerAnimClip(
    makeSignals({ team: 'home', hasBall: true, ballLastTouchTeam: 'home', speed: 2.2 }),
    mem,
  );
  assert.equal(clip, 'receive');
  assert.equal(mem.reactionKind, 'intercept');
  assert.ok(mem.reactionTimer > 0.2);

  const shotMem = createAnimMemory();
  resolvePlayerAnimClip(
    makeSignals({ actionState: 'kick', ballSpeed: 26, shotCharge: 0.8 }),
    shotMem,
  );
  assert.equal(shotMem.reactionKind, 'power_shot');
  assert.ok(shotMem.reactionTimer > 0.25);

  const scorerPose = createDefaultPose();
  const teammatePose = createDefaultPose();
  evaluateTargetPose('celebration', makeSignals({ actionState: 'celebrate', isGoalScorer: true }), shotMem, scorerPose);
  evaluateTargetPose('celebration', makeSignals({ actionState: 'celebrate', isGoalScorer: false }), shotMem, teammatePose);
  assert.ok(scorerPose.leftShoulderRoll > teammatePose.leftShoulderRoll + 0.3);
});
