import test from 'node:test';
import assert from 'node:assert/strict';
import { BALL_RADIUS, GOAL_HEIGHT, HALF_LENGTH, HALF_WIDTH, PLAYER_RADIUS } from '../core/constants';
import { BallState, PlayerState } from '../core/types';
import {
  applyBallKick,
  attemptGoalkeeperSave,
  computeContextualShot,
  computeShotProfile,
  evaluateBallReception,
  predictBallCrossingX,
  resolveLooseBallBodyContact,
  resolvePlayerCollisions,
  stepBallPhysics,
  stepPlayerLocomotion,
} from './pitchPhysics';

function makeBall(overrides: Partial<BallState> = {}): BallState {
  return {
    position: { x: 0, y: BALL_RADIUS, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    spin: { x: 0, y: 0, z: 0 },
    ownerId: null,
    lastTouchTeam: null,
    lastTouchPlayerName: null,
    pickupLockTimer: 0,
    ...overrides,
  };
}

function makeDummyPlayer(id: string, x: number, z: number): PlayerState {
  return {
    id,
    name: 'Test Player',
    number: 9,
    team: 'home',
    role: 'ST',
    slotIndex: 9,
    position: { x, y: 0, z },
    velocity: { x: 0, y: 0, z: 0 },
    facingAngle: Math.PI / 2,
    homeAnchor: { x, y: 0, z },
    attributes: {
      speed: 7.5,
      acceleration: 18,
      staminaMax: 100,
      shotPower: 28,
      passing: 85,
      dribbling: 85,
    },
    appearance: {
      skinTone: '#d99e78',
      hairStyle: 'short',
      hairColor: '#1d1815',
      bootsColor: '#f97316',
    },
    stamina: 100,
    actionState: 'idle',
    actionTimer: 0,
    tackleCooldown: 0,
    kickCooldown: 0,
    diveCooldown: 0,
    diveDir: 0,
    gkHoldTimer: 0,
    hasBall: true,
    isControlled: true,
    animPhase: 0,
  };
}

test('ball falls under gravity and bounces off turf', () => {
  const ball = makeBall({
    position: { x: 0, y: 2.0, z: 0 },
    velocity: { x: 5, y: 0, z: 0 },
  });

  let bounced = false;
  for (let i = 0; i < 60; i++) {
    const res = stepBallPhysics(ball, 1 / 60);
    if (res.bouncedOnTurf) bounced = true;
  }

  assert.equal(bounced, true);
  assert.ok(ball.position.y >= BALL_RADIUS - 0.001);
  assert.ok(ball.position.x > 1);
});

test('ball crossing +X goal line inside frame awards goal to home', () => {
  const ball = makeBall({
    position: { x: HALF_LENGTH + 0.15, y: 0.8, z: 0.5 },
    velocity: { x: 18, y: 0, z: 0 },
  });

  const res = stepBallPhysics(ball, 1 / 60);
  assert.equal(res.scoredTeam, 'home');
  assert.equal(res.outOfBounds, null);
});

test('ball crossing -X goal line inside frame awards goal to away', () => {
  const ball = makeBall({
    position: { x: -HALF_LENGTH - 0.15, y: 1.0, z: -1.0 },
    velocity: { x: -20, y: 0, z: 0 },
  });

  const res = stepBallPhysics(ball, 1 / 60);
  assert.equal(res.scoredTeam, 'away');
});

test('ball above crossbar over endline is out of bounds, not a goal', () => {
  const ball = makeBall({
    position: { x: HALF_LENGTH + 0.3, y: GOAL_HEIGHT + 1.0, z: 0 },
    velocity: { x: 14, y: 1, z: 0 },
  });

  const res = stepBallPhysics(ball, 1 / 60);
  assert.equal(res.scoredTeam, null);
  assert.equal(res.outOfBounds, 'endline_away');
});

test('ball crossing touchline triggers sideline out of bounds', () => {
  const ball = makeBall({
    position: { x: 10, y: BALL_RADIUS, z: HALF_WIDTH + 0.25 },
    velocity: { x: 0, y: 0, z: 4 },
  });

  const res = stepBallPhysics(ball, 1 / 60);
  assert.equal(res.outOfBounds, 'sideline');
});

test('applyBallKick releases ownership and sets velocity along direction', () => {
  const player = makeDummyPlayer('p1', 0, 0);
  const ball = makeBall({ ownerId: 'p1' });

  applyBallKick(ball, 1, 0, 22, 4, player);
  assert.equal(ball.ownerId, null);
  assert.equal(player.hasBall, false);
  assert.ok(ball.velocity.x > 21.9);
  assert.equal(ball.velocity.y, 4);
  assert.equal(player.actionState, 'kick');
});

test('resolvePlayerCollisions separates overlapping players', () => {
  const a = makeDummyPlayer('a', 0, 0);
  const b = makeDummyPlayer('b', 0.2, 0);
  resolvePlayerCollisions([a, b]);
  const dist = Math.hypot(b.position.x - a.position.x, b.position.z - a.position.z);
  assert.ok(dist >= 0.89);
});

test('computeShotProfile scales horizontal speed and loft with charge', () => {
  const low = computeShotProfile(28, 0.1, false);
  const high = computeShotProfile(28, 0.95, true);
  assert.ok(high.horizontalSpeed > low.horizontalSpeed);
  assert.ok(high.loftSpeed > low.loftSpeed);
});

test('predictBallCrossingX forecasts goal-bound ball arrival', () => {
  const ball = makeBall({
    position: { x: 32, y: 1.0, z: 1.0 },
    velocity: { x: 20, y: 1.0, z: 2.0 },
  });
  const crossing = predictBallCrossingX(ball, 50.9);
  assert.ok(crossing !== null);
  assert.ok(crossing.time > 0.8 && crossing.time < 1.1);
  assert.ok(crossing.z > 2.5);
});

test('attemptGoalkeeperSave parries hard opponent shots and catches softer shots', () => {
  const gk = makeDummyPlayer('away_0', 51, 0);
  gk.team = 'away';
  gk.role = 'GK';
  gk.hasBall = false;
  gk.isControlled = false;
  gk.actionState = 'dive';

  const hardShot = makeBall({
    position: { x: 50.4, y: 1.4, z: 0.6 },
    velocity: { x: 24, y: 1, z: 1 },
    lastTouchTeam: 'home',
  });
  assert.equal(attemptGoalkeeperSave(gk, hardShot), 'parry');
  assert.ok(hardShot.velocity.x < 0, 'Parry should deflect ball away from goal');

  gk.kickCooldown = 0;
  const softShot = makeBall({
    position: { x: 50.5, y: 1.0, z: 0.3 },
    velocity: { x: 11, y: 0, z: 0 },
    lastTouchTeam: 'home',
  });
  assert.equal(attemptGoalkeeperSave(gk, softShot), 'catch');
});

test('computeContextualShot differentiates quick, power, moving, and pressured shots with realistic accuracy', () => {
  const shooter = makeDummyPlayer('home_9', 36, 0);
  shooter.facingAngle = Math.PI / 2; // square toward +X goal
  shooter.velocity = { x: 0, y: 0, z: 0 };

  const farDefender = makeDummyPlayer('away_2', 10, 0);
  farDefender.team = 'away';

  const quickShot = computeContextualShot(shooter, HALF_LENGTH, 1.0, 0.15, [shooter, farDefender], false, 0, 0);
  const powerShot = computeContextualShot(shooter, HALF_LENGTH, 1.0, 0.85, [shooter, farDefender], false, 0, 0);

  assert.equal(quickShot.shotKind, 'quick');
  assert.equal(powerShot.shotKind, 'power');
  assert.ok(powerShot.horizontalSpeed > quickShot.horizontalSpeed);
  assert.ok(powerShot.loftSpeed > quickShot.loftSpeed);
  assert.ok(quickShot.accuracyFactor > powerShot.accuracyFactor);

  // Moving/sprinting shot has lower accuracy than a composed standing shot
  shooter.velocity = { x: 8.4, y: 0, z: 1.5 };
  const movingShot = computeContextualShot(shooter, HALF_LENGTH, 1.0, 0.45, [shooter, farDefender], true, 0, 0);
  assert.equal(movingShot.shotKind, 'moving');

  // Pressured shot when defender is right in front (< 1.5m)
  const tightDefender = makeDummyPlayer('away_3', 37.2, 0.3);
  tightDefender.team = 'away';
  const pressuredShot = computeContextualShot(shooter, HALF_LENGTH, 1.0, 0.45, [shooter, tightDefender], false, 0, 0);
  assert.equal(pressuredShot.shotKind, 'pressured');
  assert.ok(pressuredShot.pressureLevel >= 0.48);
  assert.ok(pressuredShot.accuracyFactor < quickShot.accuracyFactor);

  // Back-to-goal shot loses accuracy and pace compared to square body alignment
  shooter.velocity = { x: 0, y: 0, z: 0 };
  shooter.facingAngle = -Math.PI / 2;
  const backToGoal = computeContextualShot(shooter, HALF_LENGTH, 0, 0.5, [shooter, farDefender], false, 0, 0);
  assert.ok(backToGoal.accuracyFactor < quickShot.accuracyFactor);
  assert.ok(backToGoal.horizontalSpeed < powerShot.horizontalSpeed);
});

test('stepPlayerLocomotion enforces braking inertia on 180-degree reversal at sprint speed', () => {
  const sprinter = makeDummyPlayer('home_9', 0, 0);
  sprinter.velocity = { x: 8.8, y: 0, z: 0 };
  sprinter.facingAngle = Math.PI / 2;

  // Attempt sudden 180-degree reversal while sprinting
  const res = stepPlayerLocomotion(sprinter, -8.8, 0, -Math.PI / 2, 1 / 60, true, true);
  assert.equal(res.isTurningHard, true);
  assert.ok(sprinter.velocity.x > 5.0, 'Player must brake through inertia instead of snapping instantaneously to -8.8 m/s');
  assert.ok(Math.abs(sprinter.facingAngle - -Math.PI / 2) > 1.0, 'Turning angle should rotate smoothly, not snap 180 deg in 1 frame');
});

test('evaluateBallReception adapts first-touch distance to speed/sprint and triggers heavy_touch on scorching opponent shots', () => {
  const receiver = makeDummyPlayer('home_7', 10, 0);
  receiver.hasBall = false;
  receiver.facingAngle = Math.PI / 2;
  receiver.velocity = { x: 0.5, y: 0, z: 0 };
  receiver.actionState = 'idle';

  const gentlePass = makeBall({
    position: { x: 10.6, y: BALL_RADIUS, z: 0 },
    velocity: { x: -7, y: 0, z: 0 },
    lastTouchTeam: 'home',
  });
  const calmTouch = evaluateBallReception(receiver, gentlePass, 1, 0);
  assert.equal(calmTouch.outcome, 'control');
  assert.ok(calmTouch.touchDirX > 0.9);

  // Sprinting reception pushes the first touch slightly further ahead
  receiver.velocity = { x: 8.6, y: 0, z: 0 };
  receiver.actionState = 'sprint';
  const fastPass = makeBall({
    position: { x: 10.7, y: 0.95, z: 0 },
    velocity: { x: 15, y: 0, z: 0 },
    lastTouchTeam: 'home',
  });
  const sprintTouch = evaluateBallReception(receiver, fastPass, 1, 0);
  assert.equal(sprintTouch.outcome, 'control');
  assert.ok(
    sprintTouch.touchOffsetMeters > calmTouch.touchOffsetMeters,
    `Sprint reception (${sprintTouch.touchOffsetMeters}) should have looser cushion than calm reception (${calmTouch.touchOffsetMeters})`,
  );

  // Very fast awkward opponent strike causes a heavy touch instead of instant magnetic glue
  receiver.facingAngle = -Math.PI / 2;
  const rocketShot = makeBall({
    position: { x: 10.5, y: 1.1, z: 0 },
    velocity: { x: 25, y: 0, z: 0 },
    lastTouchTeam: 'away',
  });
  const heavy = evaluateBallReception(receiver, rocketShot, 0, 1);
  assert.equal(heavy.outcome, 'heavy_touch');
  assert.ok(heavy.deflectSpeed > 0);
});

test('resolveLooseBallBodyContact prevents free ball from clipping through outfield players', () => {
  const blocker = makeDummyPlayer('away_4', 20, 0);
  blocker.team = 'away';
  blocker.hasBall = false;
  blocker.kickCooldown = 0;

  const ball = makeBall({
    position: { x: 19.7, y: 0.5, z: 0 },
    velocity: { x: 18, y: 0, z: 0 },
    lastTouchTeam: 'home',
  });

  const hitPlayer = resolveLooseBallBodyContact(ball, [blocker]);
  assert.equal(hitPlayer?.id, blocker.id);
  const sep = Math.hypot(ball.position.x - blocker.position.x, ball.position.z - blocker.position.z);
  assert.ok(sep >= PLAYER_RADIUS + BALL_RADIUS, 'Ball must be pushed outside player body radius');
  assert.ok(ball.velocity.x < 0, 'Incoming ball hitting front of player must deflect back');
});

