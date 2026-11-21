import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BALL_RADIUS,
  CENTER_CIRCLE_RADIUS,
  HALF_LENGTH,
  PENALTY_SPOT_DIST,
} from '../core/constants';
import { BallState } from '../core/types';
import { FORMATIONS, getFormationTactics, getFormationWorldPosition } from '../formations/formations';
import { TEAMS } from '../teams/teams';
import { ReplayRecorder } from './replayRecorder';
import {
  classifyTackleFoul,
  computeMatchClock,
  computeSetPieceSetup,
  createTeamPlayers,
  isCleanTackleAngle,
  isInsidePenaltyArea,
  resetForKickoff,
  selectSwitchTarget,
} from './rules';
import { MatchEngine } from './matchEngine';
import { InputSnapshot } from '../core/types';

function createIdleInput(overrides: Partial<InputSnapshot> = {}): InputSnapshot {
  return {
    moveX: 0,
    moveZ: 0,
    sprint: false,
    passPressed: false,
    shootHeld: false,
    shootPressed: false,
    shootReleased: false,
    lobPressed: false,
    switchPressed: false,
    tacklePressed: false,
    ...overrides,
  };
}

test('computeMatchClock maps first and second halves to 00:00..90:00', () => {
  const firstMid = computeMatchClock(1, 60, 120);
  assert.equal(firstMid.matchMinutes, 22);
  assert.equal(firstMid.matchSeconds, 30);
  assert.equal(firstMid.phaseTransition, null);

  const halfEnd = computeMatchClock(1, 120, 120);
  assert.equal(halfEnd.matchMinutes, 45);
  assert.equal(halfEnd.phaseTransition, 'halftime');

  const secondMid = computeMatchClock(2, 60, 120);
  assert.equal(secondMid.matchMinutes, 67);
  assert.equal(secondMid.phaseTransition, null);

  const fullEnd = computeMatchClock(2, 120, 120);
  assert.equal(fullEnd.matchMinutes, 90);
  assert.equal(fullEnd.phaseTransition, 'fulltime');
});

test('createTeamPlayers generates 11 players with 1 controlled home striker', () => {
  const home = createTeamPlayers(TEAMS[0], 'home', '4-3-3');
  const away = createTeamPlayers(TEAMS[1], 'away', '4-4-2');

  assert.equal(home.length, 11);
  assert.equal(away.length, 11);
  assert.equal(home.filter((p) => p.isControlled).length, 1);
  assert.equal(away.filter((p) => p.isControlled).length, 0);
  assert.equal(home[0].role, 'GK');
});

test('kickoff anchors keep home team in -X half and away team in +X half', () => {
  const homeSlots = FORMATIONS['4-3-3'].slots;
  for (const slot of homeSlots) {
    const h = getFormationWorldPosition(slot, 'home', 0, 0, true);
    const a = getFormationWorldPosition(slot, 'away', 0, 0, true);
    assert.ok(h.x < 0, `Home slot ${slot.role} should start in negative X half`);
    assert.ok(a.x > 0, `Away slot ${slot.role} should start in positive X half`);
  }
});

test('selectSwitchTarget picks closest outfield teammate to the ball', () => {
  const players = createTeamPlayers(TEAMS[0], 'home', '4-3-3');
  const current = players.find((p) => p.isControlled)!;
  const ball: BallState = {
    position: { x: players[5].position.x + 1, y: BALL_RADIUS, z: players[5].position.z },
    velocity: { x: 0, y: 0, z: 0 },
    spin: { x: 0, y: 0, z: 0 },
    ownerId: null,
    lastTouchTeam: null,
    lastTouchPlayerName: null,
    pickupLockTimer: 0,
  };

  const next = selectSwitchTarget(players, ball, 'home', current.id);
  assert.ok(next !== null);
  assert.equal(next.id, players[5].id);
});

test('resetForKickoff places ball at center spot and clears ownership', () => {
  const home = createTeamPlayers(TEAMS[0], 'home', '4-3-3');
  const away = createTeamPlayers(TEAMS[1], 'away', '4-4-2');
  const all = [...home, ...away];
  const ball: BallState = {
    position: { x: 32, y: 2, z: -12 },
    velocity: { x: 8, y: 3, z: -2 },
    spin: { x: 1, y: 0, z: 1 },
    ownerId: 'home_9',
    lastTouchTeam: 'home',
    lastTouchPlayerName: 'K. Mbappe',
    pickupLockTimer: 0.2,
  };

  resetForKickoff(all, ball, '4-3-3', '4-4-2', 'home');
  assert.equal(ball.position.x, 0);
  assert.equal(ball.position.z, 0);
  assert.equal(ball.ownerId, null);
  assert.equal(ball.velocity.x, 0);
});

test('isInsidePenaltyArea accurately classifies home and away boxes', () => {
  assert.equal(isInsidePenaltyArea(-HALF_LENGTH + 10, 5, 'home'), true);
  assert.equal(isInsidePenaltyArea(-HALF_LENGTH + 25, 0, 'home'), false);
  assert.equal(isInsidePenaltyArea(HALF_LENGTH - 12, -14, 'away'), true);
  assert.equal(isInsidePenaltyArea(HALF_LENGTH - 12, 24, 'away'), false);
});

test('classifyTackleFoul awards penalty inside box and free_kick outside ONLY on forceful tackle from behind missing ball', () => {
  const home = createTeamPlayers(TEAMS[0], 'home', '4-3-3');
  const away = createTeamPlayers(TEAMS[1], 'away', '4-4-2');
  const victim = home[9];
  const tackler = away[2];

  // Genuine reckless slide tackle from behind inside away penalty box (+X)
  victim.hasBall = true;
  victim.facingAngle = Math.PI / 2; // facing +X
  victim.position = { x: HALF_LENGTH - 10, y: 0, z: 2 };
  tackler.actionState = 'tackle';
  tackler.position = { x: HALF_LENGTH - 10.6, y: 0, z: 2 };
  tackler.velocity = { x: 9.2, y: 0, z: 0 };
  const ballInBox: BallState = {
    position: { x: HALF_LENGTH - 9.2, y: BALL_RADIUS, z: 2 },
    velocity: { x: 0, y: 0, z: 0 },
    spin: { x: 0, y: 0, z: 0 },
    ownerId: victim.id,
    lastTouchTeam: 'home',
    lastTouchPlayerName: victim.name,
    pickupLockTimer: 0,
  };
  assert.equal(classifyTackleFoul(tackler, victim, ballInBox), 'penalty');

  // Genuine reckless slide tackle from behind in midfield => free_kick
  victim.position = { x: 10, y: 0, z: 0 };
  tackler.position = { x: 9.4, y: 0, z: 0 };
  tackler.velocity = { x: 9.0, y: 0, z: 0 };
  ballInBox.position = { x: 10.8, y: BALL_RADIUS, z: 0 };
  assert.equal(classifyTackleFoul(tackler, victim, ballInBox), 'free_kick');

  // Clean steal when tackler genuinely reaches the ball
  tackler.position = { x: 10.7, y: 0, z: 0.2 };
  assert.equal(classifyTackleFoul(tackler, victim, ballInBox), 'clean');
});

test('classifyTackleFoul NEVER triggers false FREE KICK on normal running, dribbling, side/front contact, or non-forceful contact', () => {
  const home = createTeamPlayers(TEAMS[0], 'home', '4-3-3');
  const away = createTeamPlayers(TEAMS[1], 'away', '4-4-2');
  const victim = home[9];
  const defender = away[2];

  victim.hasBall = true;
  victim.facingAngle = Math.PI / 2; // facing +X
  victim.position = { x: 10, y: 0, z: 0 };

  const ball: BallState = {
    position: { x: 10.85, y: BALL_RADIUS, z: 0 },
    velocity: { x: 5, y: 0, z: 0 },
    spin: { x: 0, y: 0, z: 0 },
    ownerId: victim.id,
    lastTouchTeam: 'home',
    lastTouchPlayerName: victim.name,
    pickupLockTimer: 0,
  };

  // 1. Non-tackle states (running, sprinting, dribbling, idle) near carrier -> NEVER foul
  for (const state of ['idle', 'run', 'sprint', 'dribble'] as const) {
    defender.actionState = state;
    defender.position = { x: 9.4, y: 0, z: 0 };
    defender.velocity = { x: 8.5, y: 0, z: 0 };
    assert.equal(classifyTackleFoul(defender, victim, ball), 'none');
  }

  // 2. Active tackle at non-colliding distance (0.85m behind) -> NOT a foul
  defender.actionState = 'tackle';
  defender.position = { x: 9.15, y: 0, z: 0 };
  defender.velocity = { x: 10.0, y: 0, z: 0 };
  assert.notEqual(classifyTackleFoul(defender, victim, ball), 'free_kick');

  // 3. Active tackle from the side (shoulder-to-shoulder) -> NOT a foul
  defender.position = { x: 10.0, y: 0, z: 0.7 };
  defender.velocity = { x: 2.0, y: 0, z: -8.0 };
  assert.notEqual(classifyTackleFoul(defender, victim, ball), 'free_kick');

  // 4. Active tackle from the front -> NOT a foul (clean steal on ball)
  defender.position = { x: 11.4, y: 0, z: 0.1 };
  defender.velocity = { x: -8.0, y: 0, z: 0 };
  assert.equal(classifyTackleFoul(defender, victim, ball), 'clean');

  // 5. Decelerated / low closing speed behind carrier -> NOT a foul
  defender.position = { x: 9.4, y: 0, z: 0 };
  defender.velocity = { x: 2.0, y: 0, z: 0 };
  assert.notEqual(classifyTackleFoul(defender, victim, ball), 'free_kick');

  // 6. AI clean tackle angle guard rejects lunging straight through a dribbler's back
  defender.position = { x: 9.25, y: 0, z: 0 };
  assert.equal(isCleanTackleAngle(defender, victim, ball), false);
  // Front approach has clean tackle angle
  defender.position = { x: 11.7, y: 0, z: 0.1 };
  assert.equal(isCleanTackleAngle(defender, victim, ball), true);
});

test('MatchEngine live dribbling, sprinting, passing, and shooting do not trigger spurious FREE KICK and set-piece restarts return to live', () => {
  const hudSnapshots: Array<{ phase: string; setPieceType: string | null }> = [];
  const engine = new MatchEngine(TEAMS[0], TEAMS[1], '4-3-3', '4-4-2', 120, 'tv', {
    onHudUpdate: (snap) => {
      hudSnapshots.push({
        phase: snap.phase,
        setPieceType: snap.setPieceBanner?.type ?? null,
      });
    },
    onMatchFinished: () => {},
    onCameraTrauma: () => {},
    onSoundEvent: () => {},
  });

  engine.startNewMatch(TEAMS[0], TEAMS[1], '4-3-3', '4-4-2', 120);
  const dt = 1 / 60;

  // Simulate 5 seconds of normal live play: moving forward, dribbling, sprinting, passing
  for (let frame = 0; frame < 300; frame++) {
    const input = createIdleInput({
      moveX: 1,
      moveZ: frame % 90 < 45 ? 0.25 : -0.25,
      sprint: frame >= 60 && frame < 180,
      passPressed: frame === 190,
      shootPressed: frame === 260,
    });
    engine.step(dt, input);
    assert.notEqual(
      engine.setPiece?.type ?? null,
      'free_kick',
      `Unexpected false free_kick at frame ${frame}`,
    );
  }

  assert.equal(engine.stats.homeFouls, 0);
  assert.equal(engine.stats.awayFouls, 0);

  // Verify genuine free-kick restart transitions cleanly back to live play
  const setup = computeSetPieceSetup(
    'free_kick',
    { x: 15, y: BALL_RADIUS, z: 4 },
    'home',
    engine.players,
    engine.ball,
  );
  engine.phase = 'setpiece';
  engine.setPiece = {
    type: 'free_kick',
    team: 'home',
    spot: setup.spot,
    takerId: setup.takerId,
    timer: 1.15,
  };

  engine.step(dt, createIdleInput({ passPressed: true, moveX: 1, moveZ: 0 }));
  assert.equal(engine.phase, 'live');
  assert.equal(engine.setPiece, null);

  // Subsequent normal frames after restart must stay live (no stuck or re-triggered free_kick)
  for (let i = 0; i < 60; i++) {
    engine.step(dt, createIdleInput({ moveX: 1, moveZ: 0 }));
    const activeSetPiece = engine.setPiece as { type: string } | null;
    assert.notEqual(activeSetPiece?.type ?? null, 'free_kick');
  }
});

test('TEAMS contains only real European and African clubs with no fictional club names', () => {
  const fictionalNames = [
    'Aurelia FC',
    'Nordic United',
    'Valoria Athletic',
    'Metro Rovers',
    'Solaris Sporting',
    'Ironport City',
    'Verde Atlético',
    'Caspian SC',
  ];
  const names = TEAMS.map((t) => t.name);
  for (const fake of fictionalNames) {
    assert.equal(names.includes(fake), false, `Fictional club ${fake} must be removed`);
  }

  const european = TEAMS.filter((t) => t.region === 'europe');
  const african = TEAMS.filter((t) => t.region === 'africa');
  assert.ok(european.length >= 10, 'Expected real European clubs');
  assert.ok(african.length >= 8, 'Expected real African clubs');
  assert.ok(names.includes('Real Madrid'));
  assert.ok(names.includes('FC Barcelona'));
  assert.ok(names.includes('Al Ahly'));
  assert.ok(names.includes('Wydad AC'));
});

test('computeSetPieceSetup enforces penalty spot, GK line, and 9.15m free-kick wall', () => {
  const home = createTeamPlayers(TEAMS[0], 'home', '4-3-3');
  const away = createTeamPlayers(TEAMS[1], 'away', '4-4-2');
  const all = [...home, ...away];
  const ball: BallState = {
    position: { x: 0, y: BALL_RADIUS, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    spin: { x: 0, y: 0, z: 0 },
    ownerId: null,
    lastTouchTeam: null,
    lastTouchPlayerName: null,
    pickupLockTimer: 0,
  };

  const pen = computeSetPieceSetup('penalty', { x: 40, y: 0, z: 4 }, 'home', all, ball);
  assert.equal(pen.spot.x, HALF_LENGTH - PENALTY_SPOT_DIST);
  assert.equal(pen.spot.z, 0);
  const awayGk = away[0];
  assert.ok(awayGk.position.x > HALF_LENGTH - 1);

  const fkSpot = { x: 26, y: BALL_RADIUS, z: 4 };
  computeSetPieceSetup('free_kick', fkSpot, 'home', all, ball);
  for (const opp of away) {
    if (opp.role === 'GK') continue;
    const dist = Math.hypot(opp.position.x - fkSpot.x, opp.position.z - fkSpot.z);
    assert.ok(
      dist >= CENTER_CIRCLE_RADIUS - 0.15,
      `Opponent ${opp.id} at ${dist.toFixed(2)}m must be >= 9.15m from free kick spot`,
    );
  }
});

test('getFormationTactics reflects mentality and formation differences', () => {
  const att = getFormationTactics('4-3-3', 'attacking');
  const def = getFormationTactics('4-4-2', 'defensive');
  assert.ok(att.pressIntensity > def.pressIntensity);
  assert.ok(att.lineDepthBias > def.lineDepthBias);
});

test('ReplayRecorder captures and interpolates slow-motion goal clips', () => {
  const home = createTeamPlayers(TEAMS[0], 'home', '4-3-3');
  const away = createTeamPlayers(TEAMS[1], 'away', '4-4-2');
  const all = [...home, ...away];
  const ball: BallState = {
    position: { x: 10, y: BALL_RADIUS, z: 0 },
    velocity: { x: 12, y: 0, z: 0 },
    spin: { x: 0, y: 0, z: 0 },
    ownerId: null,
    lastTouchTeam: null,
    lastTouchPlayerName: null,
    pickupLockTimer: 0,
  };

  const recorder = new ReplayRecorder();
  for (let i = 0; i < 15; i++) {
    ball.position.x = 10 + i * 2;
    recorder.record(ball, all, 1 / 30);
  }
  recorder.freezeClip();
  assert.ok(recorder.getClipLength() >= 10);

  const midSample = recorder.sampleAtProgress(0.5);
  assert.ok(midSample !== null);
  assert.ok(midSample.ballPos.x > 12 && midSample.ballPos.x < 38);
});
