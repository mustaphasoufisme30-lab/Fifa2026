import test from 'node:test';
import assert from 'node:assert/strict';
import { BALL_RADIUS, GOAL_HEIGHT, HALF_LENGTH, HALF_WIDTH } from '../core/constants';
import { BallState, PlayerState } from '../core/types';
import {
  applyBallKick,
  attemptGoalkeeperSave,
  computeShotProfile,
  predictBallCrossingX,
  resolvePlayerCollisions,
  stepBallPhysics,
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
