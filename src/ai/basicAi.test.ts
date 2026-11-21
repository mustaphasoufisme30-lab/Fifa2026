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

test('offensive midfielders form spaced passing triangles instead of clumping onto the ball carrier', () => {
  const home = createTeamPlayers(TEAMS[0], 'home', '4-3-3');
  const away = createTeamPlayers(TEAMS[1], 'away', '4-4-2');
  const all = [...home, ...away];

  const carrier = home[5]; // midfielder or defender with ball
  carrier.hasBall = true;
  carrier.position = { x: 0, y: 0, z: 2 };
  const ball = makeBall({ ownerId: carrier.id, position: { x: 0, y: BALL_RADIUS, z: 2 } });

  const cm = home.find((p) => (p.role === 'CM' || p.role === 'CDM') && p.id !== carrier.id)!;
  cm.position = { x: 1.5, y: 0, z: 3.0 }; // starts right next to carrier

  const steering = computeAiSteering(cm, all, ball, '4-3-3', null, null, 'balanced', 'attack');
  const spacingFromCarrier = Math.hypot(
    steering.desiredX - carrier.position.x,
    steering.desiredZ - carrier.position.z,
  );
  assert.ok(
    spacingFromCarrier >= 7.5,
    `Midfielder support triangle should maintain clean spacing (got ${spacingFromCarrier.toFixed(2)}m)`,
  );
});

test('defensive cover defender screens forward passing lane and turnover transition pulls block back', () => {
  const home = createTeamPlayers(TEAMS[0], 'home', '4-3-3');
  const away = createTeamPlayers(TEAMS[1], 'away', '4-4-2');
  const all = [...home, ...away];

  // Home midfielder carries ball; home striker threatens on +Z wing
  const carrier = home[6];
  carrier.hasBall = true;
  carrier.position = { x: 10, y: 0, z: -2 };
  const threatRunner = home[9];
  threatRunner.position = { x: 28, y: 0, z: 12 };
  const ball = makeBall({ ownerId: carrier.id, position: { x: 10, y: BALL_RADIUS, z: -2 } });

  const coverDef = away[5];
  const neutralCover = computeAiSteering(coverDef, all, ball, '4-4-2', away[6].id, coverDef.id, 'balanced', 'none');
  // Cover defender should shift toward +Z (screening lane to threatRunner) and stay goal-side (> ball.x)
  assert.ok(neutralCover.desiredX > ball.position.x, 'Cover defender must stay goal-side of the ball');
  assert.ok(neutralCover.desiredZ > ball.position.z, 'Cover defender should shade toward dangerous forward runner lane');

  // Transition to 'defend' pulls off-ball away midfielder deeper toward own (+X) goal than 'none'
  const offBallMid = away[7];
  const normalRecovery = computeAiSteering(offBallMid, all, ball, '4-4-2', away[6].id, coverDef.id, 'balanced', 'none');
  const turnoverRecovery = computeAiSteering(offBallMid, all, ball, '4-4-2', away[6].id, coverDef.id, 'balanced', 'defend');
  assert.ok(
    turnoverRecovery.desiredX > normalRecovery.desiredX,
    `Defensive turnover should pull away midfielder deeper toward +X goal (${turnoverRecovery.desiredX} > ${normalRecovery.desiredX})`,
  );
});

test('GK selects safe open teammate outlet after holding ball and only sweeper-rushes when reachable first', () => {
  const home = createTeamPlayers(TEAMS[0], 'home', '4-3-3');
  const away = createTeamPlayers(TEAMS[1], 'away', '4-4-2');
  const all = [...home, ...away];

  const gk = home[0];
  gk.position = { x: -HALF_LENGTH + 2, y: 0, z: 0 };
  gk.hasBall = true;
  gk.gkHoldTimer = 0;

  // Place a clearly open home fullback on the wide flank
  const openFullback = home[1];
  openFullback.position = { x: -HALF_LENGTH + 22, y: 0, z: -20 };
  // Push opponents far away from the fullback lane
  for (const opp of away) {
    opp.position = { x: 15, y: 0, z: 12 };
  }

  const heldBall = makeBall({ ownerId: gk.id, position: { x: gk.position.x, y: 1.0, z: 0 } });
  const distDecision = computeAiSteering(gk, all, heldBall, '4-3-3', null, null);
  assert.equal(distDecision.shouldPass, true);
  assert.ok(distDecision.passTarget !== null, 'GK should pick an open teammate for distribution');

  // Sweeper check: loose ball in box where attacker is right on top of it (closer than GK) -> GK holds line instead of reckless rush
  gk.hasBall = false;
  const looseBall = makeBall({
    position: { x: -HALF_LENGTH + 11.5, y: BALL_RADIUS, z: 0 },
    velocity: { x: -2, y: 0, z: 0 },
  });
  away[9].position = { x: -HALF_LENGTH + 12.2, y: 0, z: 0 }; // attacker 0.7m from ball; GK is 9.5m away
  const holdDecision = computeAiSteering(gk, all, looseBall, '4-3-3', null, null);
  assert.ok(
    holdDecision.desiredX < looseBall.position.x - 3,
    'GK must hold goal angle rather than recklessly rushing out when attacker reaches the ball first',
  );
});

