import test from 'node:test';
import assert from 'node:assert/strict';
import { BALL_RADIUS, HALF_LENGTH } from '../core/constants';
import { BallState } from '../core/types';
import { createTeamPlayers } from '../game/rules';
import { TEAMS } from '../teams/teams';
import {
  computeAiSteering,
  computeDefensiveAssignments,
  computeSetPieceAiDecision,
} from './basicAi';

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

test('computeDefensiveAssignments picks closest presser and second closest cover defender', () => {
  const away = createTeamPlayers(TEAMS[1], 'away', '4-4-2');
  const ball = makeBall({ position: { x: away[6].position.x + 1, y: BALL_RADIUS, z: away[6].position.z } });

  const assign = computeDefensiveAssignments(away, ball, 'away');
  assert.equal(assign.presserId, away[6].id);
  assert.ok(assign.coverId !== null && assign.coverId !== assign.presserId);
});

test('GK AI dives toward incoming fast shot aimed inside goal', () => {
  const home = createTeamPlayers(TEAMS[0], 'home', '4-3-3');
  const away = createTeamPlayers(TEAMS[1], 'away', '4-4-2');
  const all = [...home, ...away];
  const gk = away[0];
  gk.position = { x: HALF_LENGTH - 1.6, y: 0, z: 0 };

  const ball = makeBall({
    position: { x: HALF_LENGTH - 7.5, y: 1.0, z: 1.2 },
    velocity: { x: 22, y: 0.5, z: 2.0 },
    lastTouchTeam: 'home',
  });

  const steering = computeAiSteering(gk, all, ball, '4-4-2', null, null);
  assert.equal(steering.shouldDive, true);
  assert.equal(steering.diveDir, 1);
});

test('attacking mentality pushes off-ball strikers deeper than defensive mentality', () => {
  const home = createTeamPlayers(TEAMS[0], 'home', '4-3-3');
  const away = createTeamPlayers(TEAMS[1], 'away', '4-4-2');
  const all = [...home, ...away];

  const carrier = home[6];
  carrier.hasBall = true;
  carrier.position = { x: 5, y: 0, z: 0 };
  const ball = makeBall({ ownerId: carrier.id, position: { x: 5, y: BALL_RADIUS, z: 0 } });

  const striker = home[10];
  const defSteering = computeAiSteering(striker, all, ball, '4-3-3', null, null, 'defensive');
  const attSteering = computeAiSteering(striker, all, ball, '4-3-3', null, null, 'attacking');

  assert.ok(
    attSteering.desiredX > defSteering.desiredX,
    `Expected attacking run (${attSteering.desiredX}) > defensive run (${defSteering.desiredX})`,
  );
});

test('computeSetPieceAiDecision shoots on penalty and whips corner into opponent box', () => {
  const home = createTeamPlayers(TEAMS[0], 'home', '4-3-3');
  const away = createTeamPlayers(TEAMS[1], 'away', '4-4-2');
  const all = [...home, ...away];
  const striker = away[9];

  const penBall = makeBall({ position: { x: -(HALF_LENGTH - 11), y: BALL_RADIUS, z: 0 } });
  const penDecision = computeSetPieceAiDecision(striker, 'penalty', penBall, all);
  assert.equal(penDecision.isShot, true);
  assert.ok(penDecision.dirX < 0, 'Away penalty should aim toward -X home goal');

  const cornerBall = makeBall({ position: { x: -HALF_LENGTH + 0.6, y: BALL_RADIUS, z: 33.4 } });
  const cornerDecision = computeSetPieceAiDecision(striker, 'corner', cornerBall, all);
  assert.equal(cornerDecision.isShot, false);
  assert.ok(cornerDecision.loft > 6, 'Corner should loft into penalty box');
});
