import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BALL_RADIUS,
  HALF_LENGTH,
  HALF_WIDTH,
} from '../core/constants';
import {
  BallState,
  InputSnapshot,
  MatchHudSnapshot,
  PlayerRole,
  PlayerState,
  TeamSide,
} from '../core/types';
import {
  capturePassOffsideSnapshot,
  computeOffsideLineX,
  createMatchRulesState,
  evaluateActiveChallenge,
  evaluateBallBoundaryDecision,
  evaluateHandballFoul,
  evaluateIllegalPushFoul,
  evaluateOffsideInterference,
  evaluateOffsideOnTouch,
  recordBallTouch,
  resetTransientRuleState,
  resolveFoulRestart,
  stepRuleTimers,
} from './matchRulesEngine';
import { createTeamPlayers, computeSetPieceSetup } from './rules';
import { MatchEngine } from './matchEngine';
import { TEAMS } from '../teams/teams';
import { resolveLooseBallBodyContact } from '../physics/pitchPhysics';

function makePlayer(
  id: string,
  team: TeamSide,
  x: number,
  z: number,
  overrides: Partial<PlayerState> = {},
): PlayerState {
  const role: PlayerRole = overrides.role ?? 'ST';
  return {
    id,
    slotIndex: 9,
    name: id,
    number: 9,
    team,
    role,
    position: { x, y: 0, z },
    velocity: { x: 0, y: 0, z: 0 },
    facingAngle: team === 'home' ? Math.PI / 2 : -Math.PI / 2,
    homeAnchor: { x, y: 0, z },
    stamina: 100,
    hasBall: false,
    isControlled: false,
    kickCooldown: 0,
    tackleCooldown: 0,
    actionState: 'idle',
    actionTimer: 0,
    animPhase: 0,
    gkHoldTimer: 0,
    diveCooldown: 0,
    diveDir: 0,
    isSentOff: false,
    yellowCards: 0,
    attributes: {
      speed: 7.4,
      acceleration: 16,
      shotPower: 82,
      passing: 80,
      dribbling: 80,
      staminaMax: 100,
    },
    appearance: {
      skinTone: '#d4a373',
      hairColor: '#1f2937',
      hairStyle: 'short',
      bootsColor: '#ffffff',
    },
    ...overrides,
  };
}

function makeBall(overrides: Partial<BallState> = {}): BallState {
  return {
    position: { x: 0, y: BALL_RADIUS, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    spin: { x: 0, y: 0, z: 0 },
    ownerId: null,
    lastTouchTeam: null,
    lastTouchPlayerId: null,
    lastTouchPlayerName: null,
    lastTouchSource: 'live',
    pickupLockTimer: 0,
    ...overrides,
  };
}

function makeIdleInput(overrides: Partial<InputSnapshot> = {}): InputSnapshot {
  return {
    moveX: 0,
    moveZ: 0,
    sprint: false,
    passPressed: false,
    lobPressed: false,
    shootHeld: false,
    shootPressed: false,
    shootReleased: false,
    tacklePressed: false,
    switchPressed: false,
    ...overrides,
  };
}

function createTestEngine(onHud?: (snap: MatchHudSnapshot) => void): MatchEngine {
  return new MatchEngine(
    TEAMS[0],
    TEAMS[1],
    '4-3-3',
    '4-4-2',
    90,
    'tv',
    {
      onHudUpdate: onHud ?? (() => {}),
      onCameraTrauma: () => {},
      onMatchFinished: () => {},
    },
  );
}

function startTestMatch(
  engine: MatchEngine,
  options?: { awayHumanControl?: boolean; localSide?: TeamSide; isOnlineClient?: boolean },
): void {
  engine.startNewMatch(
    TEAMS[0],
    TEAMS[1],
    '4-3-3',
    '4-4-2',
    90,
    'balanced',
    'balanced',
    options,
  );
}

// ============================================================================
// 1. THROW-IN & OUT-OF-BOUNDS (INCLUDING DEFLECTION LAST TOUCH)
// ============================================================================

test('Out of bounds side: Team A kicks out -> BALL_OUT_SIDE -> THROW_IN Team B at exit spot', () => {
  const ball = makeBall({
    position: { x: 14.5, y: BALL_RADIUS, z: HALF_WIDTH + 0.5 },
    lastTouchTeam: 'home',
    lastTouchPlayerId: 'home-9',
  });
  const decision = evaluateBallBoundaryDecision(ball);
  assert.ok(decision);
  assert.equal(decision.event, 'BALL_OUT_SIDE');
  assert.equal(decision.restartType, 'throw_in');
  assert.equal(decision.awardedTeam, 'away');
  assert.ok(Math.abs(decision.spot.x - 14.5) < 0.01);
  assert.ok(decision.spot.z > HALF_WIDTH - 1);
});

test('Out of bounds side: Team B kicks out -> THROW_IN Team A', () => {
  const ball = makeBall({
    position: { x: -18, y: BALL_RADIUS, z: -(HALF_WIDTH + 0.4) },
    lastTouchTeam: 'away',
    lastTouchPlayerId: 'away-7',
  });
  const decision = evaluateBallBoundaryDecision(ball);
  assert.ok(decision);
  assert.equal(decision.event, 'BALL_OUT_SIDE');
  assert.equal(decision.restartType, 'throw_in');
  assert.equal(decision.awardedTeam, 'home');
});

test('Deflection last touch: Team A passes -> deflects off Team B -> exits sideline -> THROW_IN Team A', () => {
  const passerA = makePlayer('home-8', 'home', 5, 10, { role: 'CM' });
  const defenderB = makePlayer('away-4', 'away', 8, HALF_WIDTH - 1.5, { role: 'CB' });
  const ball = makeBall({
    position: { x: 8.0, y: 0.4, z: HALF_WIDTH - 1.85 },
    velocity: { x: 0.5, y: 0, z: 12 },
  });
  // Team A kicks the ball first
  recordBallTouch(ball, passerA, 'live');
  assert.equal(ball.lastTouchTeam, 'home');

  // Ball hits Team B defender body on its way out
  const blocker = resolveLooseBallBodyContact(ball, [passerA, defenderB]);
  assert.equal(blocker?.id, 'away-4');
  assert.equal(ball.lastTouchTeam, 'away');
  assert.equal(ball.lastTouchPlayerId, 'away-4');

  // Ball crosses sideline -> awarded to Team A (opposite of last touch Team B!)
  ball.position.z = HALF_WIDTH + 0.6;
  const decision = evaluateBallBoundaryDecision(ball);
  assert.ok(decision);
  assert.equal(decision.event, 'BALL_OUT_SIDE');
  assert.equal(decision.restartType, 'throw_in');
  assert.equal(decision.awardedTeam, 'home');
});

test('Dribbler carrying ball over touchline triggers THROW_IN for opposing team in MatchEngine', () => {
  const engine = createTestEngine();
  startTestMatch(engine);
  engine.phase = 'live';
  const carrier = engine.players.find((p) => p.team === 'home' && p.role !== 'GK')!;
  for (const p of engine.players) p.hasBall = false;
  carrier.hasBall = true;
  carrier.isControlled = true;
  carrier.position.x = 12;
  carrier.position.z = HALF_WIDTH + 0.4;
  engine.ball.ownerId = carrier.id;
  engine.ball.lastTouchTeam = 'home';
  engine.ball.position.x = 12;
  engine.ball.position.z = HALF_WIDTH + 0.5;

  engine.step(0.016, makeIdleInput({ moveZ: 1 }));
  assert.equal(engine.phase, 'setpiece');
  assert.equal(engine.setPiece?.type, 'throw_in');
  assert.equal(engine.setPiece?.team, 'away');
  assert.equal(engine.rulesState.ruleState, 'THROW_IN');
});

// ============================================================================
// 2. GOAL LINE EXITS: GOAL KICK, CORNER KICK, AND GOAL
// ============================================================================

test('Endline exit: Attacker last touch -> GOAL_KICK; Defender last touch -> CORNER_KICK; Goal mouth -> GOAL', () => {
  // Home attacks +X, misses wide -> Goal kick for Away
  const attackerOut = makeBall({
    position: { x: HALF_LENGTH + 0.5, y: 0.4, z: 12 },
    lastTouchTeam: 'home',
  });
  const gkDecision = evaluateBallBoundaryDecision(attackerOut);
  assert.ok(gkDecision);
  assert.equal(gkDecision.event, 'BALL_OUT_ENDLINE');
  assert.equal(gkDecision.restartType, 'goal_kick');
  assert.equal(gkDecision.awardedTeam, 'away');

  // Away defender clears over +X endline -> Corner kick for Home
  const defenderOut = makeBall({
    position: { x: HALF_LENGTH + 0.5, y: 0.4, z: -14 },
    lastTouchTeam: 'away',
  });
  const cornerDecision = evaluateBallBoundaryDecision(defenderOut);
  assert.ok(cornerDecision);
  assert.equal(cornerDecision.event, 'BALL_OUT_ENDLINE');
  assert.equal(cornerDecision.restartType, 'corner');
  assert.equal(cornerDecision.awardedTeam, 'home');

  // Inside goal frame at +X -> GOAL for Home
  const goalBall = makeBall({
    position: { x: HALF_LENGTH + 0.4, y: 1.0, z: 0.5 },
    lastTouchTeam: 'home',
  });
  const goalDecision = evaluateBallBoundaryDecision(goalBall);
  assert.ok(goalDecision);
  assert.equal(goalDecision.event, 'GOAL');
  assert.equal(goalDecision.restartType, 'goal');
  assert.equal(goalDecision.awardedTeam, 'home');
});

// ============================================================================
// 3. FOUL SYSTEM: LEGAL PLAY vs ALL 7 REAL FOUL TYPES + CARDS
// ============================================================================

test('Clean ball-first tackle returns clean and ZERO fouls', () => {
  const rules = createMatchRulesState();
  const carrier = makePlayer('home-9', 'home', 10, 0, { hasBall: true });
  const tackler = makePlayer('away-5', 'away', 11.4, 0, {
    role: 'CB',
    actionState: 'tackle',
    velocity: { x: -8, y: 0, z: 0 },
  });
  const ball = makeBall({
    ownerId: carrier.id,
    position: { x: 10.8, y: BALL_RADIUS, z: 0 },
    lastTouchTeam: 'home',
  });
  const res = evaluateActiveChallenge(rules, tackler, ball, [carrier, tackler]);
  assert.equal(res.outcome, 'clean');
  assert.equal(res.foul, undefined);
  assert.equal(rules.eventLocked, false);
});

test('Normal gameplay (run, sprint, dribble, pass, shoot, slight contact) produces ZERO false fouls', () => {
  const engine = createTestEngine();
  startTestMatch(engine);
  engine.phase = 'live';

  // Simulate 240 frames (4 full seconds) of active running, sprinting, dribbling, and passing
  for (let i = 0; i < 240; i++) {
    const input = makeIdleInput({
      moveX: i < 120 ? 1 : -0.6,
      moveZ: Math.sin(i * 0.08) * 0.6,
      sprint: i % 3 === 0,
      passPressed: i === 60 || i === 140,
      shootPressed: i === 200,
    });
    engine.step(1 / 60, input);
    assert.notEqual(
      engine.setPiece?.reason,
      'foul',
      `Unexpected false foul at frame ${i}: ${engine.setPiece?.foul?.foulType}`,
    );
  }
  assert.equal(engine.stats.homeFouls, 0);
  assert.equal(engine.stats.awayFouls, 0);
});

test('Tackle from behind produces tackle_from_behind foul with complete FoulRecord metadata', () => {
  const rules = createMatchRulesState();
  rules.matchElapsedMs = 15_000;
  const carrier = makePlayer('home-9', 'home', 10, 0, {
    hasBall: true,
    facingAngle: Math.PI / 2,
  });
  const tackler = makePlayer('away-4', 'away', 9.35, 0, {
    role: 'CB',
    actionState: 'tackle',
    velocity: { x: 7.5, y: 0, z: 0 },
  });
  const ball = makeBall({
    ownerId: carrier.id,
    position: { x: 10.9, y: BALL_RADIUS, z: 0 },
    lastTouchTeam: 'home',
  });
  const extraDef = makePlayer('away-2', 'away', 25, 0, { role: 'CB' });
  const res = evaluateActiveChallenge(rules, tackler, ball, [carrier, tackler, extraDef]);
  assert.equal(res.outcome, 'foul');
  assert.ok(res.foul);
  assert.equal(res.foul.foulType, 'tackle_from_behind');
  assert.equal(res.foul.foulingPlayerId, 'away-4');
  assert.equal(res.foul.foulingTeamId, 'away');
  assert.equal(res.foul.fouledPlayerId, 'home-9');
  assert.equal(res.foul.fouledTeamId, 'home');
  assert.equal(res.foul.restartType, 'free_kick');
  assert.equal(res.foul.kickKind, 'direct');
  assert.equal(res.foul.timestamp, 15_000);
  assert.equal(res.foul.card, 'yellow');
  assert.equal(rules.eventLocked, true);
});

test('Dangerous tackle triggers red card and sends outfielder off the pitch', () => {
  const rules = createMatchRulesState();
  rules.matchElapsedMs = 20_000;
  const carrier = makePlayer('home-10', 'home', 12, 2, {
    hasBall: true,
    facingAngle: Math.PI / 2,
  });
  const tackler = makePlayer('away-6', 'away', 11.4, 2, {
    role: 'CM',
    actionState: 'tackle',
    velocity: { x: 10.5, y: 0, z: 0 },
  });
  const ball = makeBall({
    ownerId: carrier.id,
    position: { x: 13.0, y: BALL_RADIUS, z: 2 },
    lastTouchTeam: 'home',
  });
  const res = evaluateActiveChallenge(rules, tackler, ball, [carrier, tackler]);
  assert.equal(res.outcome, 'foul');
  assert.equal(res.foul?.foulType, 'dangerous_tackle');
  assert.equal(res.foul?.card, 'red');
  assert.equal(tackler.isSentOff, true);
  assert.ok(Math.abs(tackler.position.z) > HALF_WIDTH);
});

test('Late tackle after pass release produces late_tackle foul', () => {
  const rules = createMatchRulesState();
  rules.matchElapsedMs = 30_000;
  const passer = makePlayer('home-8', 'home', 5, 0, { role: 'CM' });
  const tackler = makePlayer('away-5', 'away', 4.35, 0, {
    role: 'CB',
    actionState: 'tackle',
    velocity: { x: 7.4, y: 0, z: 0 },
  });
  const ball = makeBall({
    ownerId: null,
    position: { x: 12, y: BALL_RADIUS, z: 0 },
    lastTouchTeam: 'home',
  });
  capturePassOffsideSnapshot(rules, passer, ball, [passer, tackler], 'live');
  stepRuleTimers(rules, 0.2); // 200ms after release (inside 420ms late-tackle window)

  const res = evaluateActiveChallenge(rules, tackler, ball, [passer, tackler]);
  assert.equal(res.outcome, 'foul');
  assert.equal(res.foul?.foulType, 'late_tackle');
  assert.equal(res.foul?.fouledPlayerId, 'home-8');
});

test('Off-ball obstruction awards indirect_free_kick', () => {
  const rules = createMatchRulesState();
  rules.matchElapsedMs = 35_000;
  const runner = makePlayer('home-11', 'home', 10, 4, { role: 'LW' });
  const blocker = makePlayer('away-3', 'away', 9.35, 4, {
    role: 'RB',
    actionState: 'tackle',
    velocity: { x: 6.4, y: 0, z: 0 },
  });
  const ball = makeBall({
    ownerId: null,
    position: { x: 20, y: BALL_RADIUS, z: -8 },
    lastTouchTeam: 'home',
  });
  const res = evaluateActiveChallenge(rules, blocker, ball, [runner, blocker]);
  assert.equal(res.outcome, 'foul');
  assert.equal(res.foul?.foulType, 'obstruction');
  assert.equal(res.foul?.restartType, 'indirect_free_kick');
  assert.equal(res.foul?.kickKind, 'indirect');
});

test('Illegal forceful push from behind produces pushing foul; normal slight contact does not', () => {
  const rules = createMatchRulesState();
  rules.matchElapsedMs = 40_000;
  const carrier = makePlayer('home-9', 'home', 10, 0, {
    hasBall: true,
    facingAngle: Math.PI / 2,
    velocity: { x: 1.5, y: 0, z: 0 },
  });
  const ball = makeBall({
    ownerId: carrier.id,
    position: { x: 11.1, y: BALL_RADIUS, z: 0 },
    lastTouchTeam: 'home',
  });

  // Gentle jogging contact -> NO foul
  const gentleDef = makePlayer('away-5', 'away', 9.4, 0, {
    role: 'CB',
    actionState: 'run',
    velocity: { x: 4.0, y: 0, z: 0 },
  });
  assert.equal(
    evaluateIllegalPushFoul(rules, gentleDef, carrier, ball, [carrier, gentleDef]),
    null,
  );

  // Full sprint slam straight into back far from ball -> pushing foul
  const violentDef = makePlayer('away-5', 'away', 9.45, 0, {
    role: 'CB',
    actionState: 'sprint',
    velocity: { x: 8.5, y: 0, z: 0 },
  });
  const pushFoul = evaluateIllegalPushFoul(rules, violentDef, carrier, ball, [carrier, violentDef]);
  assert.ok(pushFoul);
  assert.equal(pushFoul.foulType, 'pushing');
  assert.equal(pushFoul.card, 'none'); // Routine midfield push does not auto-card
});

test('Handball foul inside defending box awards penalty; GK inside own box is legal', () => {
  const rules = createMatchRulesState();
  rules.matchElapsedMs = 45_000;
  const shooter = makePlayer('home-9', 'home', 28, 0);
  const gk = makePlayer('away-gk', 'away', HALF_LENGTH - 5, 0, { role: 'GK' });
  const def = makePlayer('away-4', 'away', HALF_LENGTH - 8, 2, { role: 'CB' });
  const ball = makeBall({
    position: { x: HALF_LENGTH - 8, y: 1.35, z: 2 },
    velocity: { x: 18, y: 0, z: 0 },
    lastTouchTeam: 'home',
    lastTouchPlayerId: shooter.id,
  });

  // GK inside own box -> legal
  assert.equal(evaluateHandballFoul(rules, gk, ball, [shooter, gk, def], true), null);

  // Outfield defender outstretched arm inside own penalty area -> handball -> penalty!
  const hb = evaluateHandballFoul(rules, def, ball, [shooter, gk, def], true);
  assert.ok(hb);
  assert.equal(hb.foulType, 'handball');
  assert.equal(hb.restartType, 'penalty');
  assert.ok(Math.abs(hb.foulPosition.x - def.position.x) < 0.01);
});

test('Direct foul inside defending penalty area resolves to penalty; second yellow sends player off', () => {
  const insideBox = resolveFoulRestart('tripping', { x: HALF_LENGTH - 10, y: BALL_RADIUS, z: 2 }, 'away');
  assert.equal(insideBox.restartType, 'penalty');

  // Verify 2nd yellow card turns into red card
  const rules = createMatchRulesState();
  rules.matchElapsedMs = 10_000;
  const carrier = makePlayer('home-9', 'home', 26, 0, { hasBall: true, facingAngle: Math.PI / 2 });
  const fouler = makePlayer('away-4', 'away', 25.4, 0, {
    role: 'CB',
    actionState: 'tackle',
    velocity: { x: 7.4, y: 0, z: 0 },
  });
  const ball = makeBall({ ownerId: carrier.id, position: { x: 27.0, y: BALL_RADIUS, z: 0 } });
  const extraDef = makePlayer('away-2', 'away', 32, 0, { role: 'CB' });

  const first = evaluateActiveChallenge(rules, fouler, ball, [carrier, fouler, extraDef]);
  assert.equal(first.foul?.card, 'yellow');
  assert.equal(fouler.isSentOff, false);

  // Resume play, advance time, commit second yellowable tackle
  resetTransientRuleState(rules);
  rules.postRestartGraceMs = 0;
  rules.matchElapsedMs = 25_000;
  const second = evaluateActiveChallenge(rules, fouler, ball, [carrier, fouler, extraDef]);
  assert.equal(second.foul?.card, 'red');
  assert.equal(second.foul?.isSecondYellow, true);
  assert.equal(fouler.isSentOff, true);
});

// ============================================================================
// 4. OFFSIDE SYSTEM (ALL 6 FIFA LAW 11 SCENARIOS)
// ============================================================================

test('Offside Case 1: Attacker behind last defender does NOT participate -> NO offside', () => {
  const rules = createMatchRulesState();
  const passer = makePlayer('home-8', 'home', 10, 0, { role: 'CM' });
  const offsideStriker = makePlayer('home-9', 'home', 35, 6, { role: 'ST' });
  const onsideWinger = makePlayer('home-11', 'home', 20, -10, { role: 'LW' });
  const awayGk = makePlayer('away-gk', 'away', HALF_LENGTH - 3, 0, { role: 'GK' });
  const awayDef = makePlayer('away-4', 'away', 25, 0, { role: 'CB' });
  const ball = makeBall({ position: { x: 10, y: BALL_RADIUS, z: 0 }, velocity: { x: 10, y: 0, z: -8 } });

  const players = [passer, offsideStriker, onsideWinger, awayGk, awayDef];
  const snap = capturePassOffsideSnapshot(rules, passer, ball, players, 'live');
  assert.ok(snap);
  assert.deepEqual(snap.offsideCandidateIds, ['home-9']);

  // Onside winger receives instead; offside striker stays passive -> NO offside
  assert.equal(evaluateOffsideInterference(rules, ball, players), null);
  assert.equal(evaluateOffsideOnTouch(rules, onsideWinger), null);
  assert.equal(rules.offsideSnapshot, null);
  assert.equal(rules.eventLocked, false);
});

test('Offside Case 2: Attacker ONSIDE at pass moment runs behind defender after pass -> NO offside', () => {
  const rules = createMatchRulesState();
  const passer = makePlayer('home-8', 'home', 10, 0, { role: 'CM' });
  const striker = makePlayer('home-9', 'home', 23, 2, { role: 'ST' }); // Behind 2nd-last defender (x=25)
  const awayGk = makePlayer('away-gk', 'away', HALF_LENGTH - 3, 0, { role: 'GK' });
  const awayDef = makePlayer('away-4', 'away', 25, 0, { role: 'CB' });
  const ball = makeBall({ position: { x: 10, y: BALL_RADIUS, z: 0 } });

  const players = [passer, striker, awayGk, awayDef];
  const line = computeOffsideLineX('home', ball.position.x, players);
  assert.equal(line, 25);

  const snap = capturePassOffsideSnapshot(rules, passer, ball, players, 'live');
  assert.equal(snap, null);

  // Striker sprints past defender AFTER pass was made -> legal!
  striker.position.x = 34;
  assert.equal(evaluateOffsideOnTouch(rules, striker), null);
});

test('Offside Case 3: Attacker in offside position at pass moment receives pass -> OFFSIDE -> INDIRECT_FREE_KICK', () => {
  const engine = createTestEngine();
  startTestMatch(engine);
  engine.phase = 'live';

  // Position players cleanly for an unmistakable home offside
  for (const p of engine.players) {
    p.hasBall = false;
    p.kickCooldown = 0;
    if (p.team === 'away' && p.role !== 'GK') {
      p.position.x = 18;
      p.position.z = 12;
    }
  }
  const awayGk = engine.players.find((p) => p.team === 'away' && p.role === 'GK')!;
  awayGk.position.x = HALF_LENGTH - 2.5;
  awayGk.position.z = 0;

  const passer = engine.players.find((p) => p.team === 'home' && p.role === 'CM')!;
  const offsideStriker = engine.players.find((p) => p.team === 'home' && p.role === 'ST')!;
  passer.position.x = 12;
  passer.position.z = 0;
  offsideStriker.position.x = 30;
  offsideStriker.position.z = 0;

  engine.ball.ownerId = null;
  engine.ball.position.x = 12;
  engine.ball.position.y = BALL_RADIUS;
  engine.ball.position.z = 0;
  engine.ball.lastTouchTeam = 'home';

  // Capture moment-of-pass snapshot while striker is at x=30 (past line x=18)
  const snap = capturePassOffsideSnapshot(engine.rulesState, passer, engine.ball, engine.players, 'live');
  assert.ok(snap);
  assert.ok(snap.offsideCandidateIds.includes(offsideStriker.id));

  // Ball arrives right at the offside striker's feet
  engine.ball.position.x = 29.8;
  engine.ball.position.z = 0;
  engine.ball.velocity.x = 8;
  engine.ball.velocity.z = 0;
  engine.ball.pickupLockTimer = 0;

  engine.step(0.016, makeIdleInput());
  assert.equal(engine.phase, 'setpiece');
  assert.equal(engine.setPiece?.type, 'indirect_free_kick');
  assert.equal(engine.setPiece?.team, 'away');
  assert.equal(engine.setPiece?.reason, 'offside');
  assert.equal(engine.setPiece?.kickKind, 'indirect');
  assert.equal(engine.stats.homeOffsides, 1);
});

test('Offside Cases 4, 5, 6: Direct ball from THROW_IN, CORNER, or GOAL_KICK NEVER triggers offside', () => {
  const passer = makePlayer('home-2', 'home', 20, HALF_WIDTH - 0.5, { role: 'RB' });
  const deepStriker = makePlayer('home-9', 'home', 42, 4, { role: 'ST' });
  const awayGk = makePlayer('away-gk', 'away', HALF_LENGTH - 2.5, 0, { role: 'GK' });
  const awayDef = makePlayer('away-4', 'away', 28, 0, { role: 'CB' });
  const ball = makeBall({ position: { x: 20, y: BALL_RADIUS, z: HALF_WIDTH - 0.5 } });
  const players = [passer, deepStriker, awayGk, awayDef];

  for (const exemptSource of ['throw_in', 'corner', 'goal_kick'] as const) {
    const rules = createMatchRulesState();
    const snap = capturePassOffsideSnapshot(rules, passer, ball, players, exemptSource);
    assert.equal(snap, null, `Expected no offside snapshot for ${exemptSource}`);
    assert.equal(evaluateOffsideOnTouch(rules, deepStriker), null);
  }
});

test('Player in own half is never offside even if ahead of defenders', () => {
  const rules = createMatchRulesState();
  const passer = makePlayer('home-6', 'home', -20, 0, { role: 'CM' });
  const mateInOwnHalf = makePlayer('home-9', 'home', -4, 0, { role: 'ST' });
  const awayGk = makePlayer('away-gk', 'away', HALF_LENGTH - 3, 0, { role: 'GK' });
  const awayDef = makePlayer('away-4', 'away', -10, 0, { role: 'CB' });
  const ball = makeBall({ position: { x: -20, y: BALL_RADIUS, z: 0 } });

  const snap = capturePassOffsideSnapshot(rules, passer, ball, [passer, mateInOwnHalf, awayGk, awayDef], 'live');
  assert.equal(snap, null);
});

// ============================================================================
// 5. EVENT LOCK & FULL RESTART -> PLAYING TRANSITIONS
// ============================================================================

test('Single-event lock prevents duplicate chains and every restart cleanly returns to PLAYING', () => {
  const engine = createTestEngine();
  startTestMatch(engine);

  const restartTypes = ['throw_in', 'goal_kick', 'corner', 'free_kick', 'indirect_free_kick', 'penalty'] as const;
  for (const rType of restartTypes) {
    const setup = computeSetPieceSetup(
      rType,
      { x: rType === 'throw_in' ? 10 : 18, y: BALL_RADIUS, z: rType === 'throw_in' ? HALF_WIDTH - 0.35 : 4 },
      'home',
      engine.players,
      engine.ball,
    );
    engine.phase = 'setpiece';
    engine.rulesState.eventLocked = true;
    engine.setPiece = {
      type: rType,
      team: 'home',
      spot: setup.spot,
      takerId: setup.takerId,
      timer: 1.0,
      kickKind: rType === 'indirect_free_kick' ? 'indirect' : 'direct',
      reason: rType === 'indirect_free_kick' ? 'offside' : 'out_of_bounds',
    };

    // Human presses pass to execute restart
    engine.step(0.016, makeIdleInput({ passPressed: true }));
    assert.equal(engine.phase, 'live', `${rType} must return to live phase`);
    assert.equal(engine.setPiece, null, `${rType} must clear setPiece`);
    assert.equal(engine.rulesState.eventLocked, false, `${rType} must unlock event lock`);
    assert.equal(engine.rulesState.ruleState, 'PLAYING', `${rType} must return ruleState to PLAYING`);
  }
});

// ============================================================================
// 6. MULTIPLAYER 1v1 SYNCHRONIZATION OF FOULS, CARDS & OFFSIDE
// ============================================================================

test('Authoritative host MatchEngine synchronizes foul, card, and offside set pieces identically to away client', () => {
  const hostHudHistory: MatchHudSnapshot[] = [];
  const awayHudHistory: MatchHudSnapshot[] = [];

  const host = createTestEngine((h) => hostHudHistory.push(h));
  const awayClient = createTestEngine((h) => awayHudHistory.push(h));

  startTestMatch(host, { awayHumanControl: true, localSide: 'home', isOnlineClient: false });
  startTestMatch(awayClient, { awayHumanControl: true, localSide: 'away', isOnlineClient: true });
  host.phase = 'live';

  // Trigger an authoritative offside indirect free kick on host
  for (const p of host.players) {
    p.hasBall = false;
    if (p.team === 'away' && p.role !== 'GK') {
      p.position.x = 16;
      p.position.z = 10;
    }
  }
  const awayGk = host.players.find((p) => p.team === 'away' && p.role === 'GK')!;
  awayGk.position.x = HALF_LENGTH - 2.5;
  const passer = host.players.find((p) => p.team === 'home' && p.role === 'CM')!;
  const striker = host.players.find((p) => p.team === 'home' && p.role === 'ST')!;
  passer.position.x = 10;
  passer.position.z = 0;
  striker.position.x = 28;
  striker.position.z = 0;
  host.ball.ownerId = null;
  host.ball.position.x = 10;
  host.ball.position.z = 0;
  host.ball.lastTouchTeam = 'home';

  capturePassOffsideSnapshot(host.rulesState, passer, host.ball, host.players, 'live');
  host.ball.position.x = 27.9;
  host.ball.velocity.x = 7;
  host.ball.pickupLockTimer = 0;
  host.step(0.016, makeIdleInput(), makeIdleInput());

  assert.equal(host.phase, 'setpiece');
  assert.equal(host.setPiece?.reason, 'offside');
  assert.equal(host.setPiece?.type, 'indirect_free_kick');

  // Broadcast snapshot from authoritative host -> remote away client
  const netSnapshot = host.getOnlineSnapshot(42, []);
  awayClient.applyOnlineSnapshot(netSnapshot, 'away');

  assert.equal(awayClient.phase, host.phase);
  assert.equal(awayClient.setPiece?.type, 'indirect_free_kick');
  assert.equal(awayClient.setPiece?.reason, 'offside');
  assert.equal(awayClient.setPiece?.team, 'away');
  assert.equal(awayClient.stats.homeOffsides, 1);

  const lastAwayHud = awayHudHistory[awayHudHistory.length - 1];
  assert.ok(lastAwayHud?.setPieceBanner);
  assert.equal(lastAwayHud.setPieceBanner.reason, 'offside');
  assert.equal(lastAwayHud.setPieceBanner.type, 'indirect_free_kick');
});

test('Throw-in setup positions attacking teammates nearby for realistic short throw-in options', () => {
  const players = createTeamPlayers(TEAMS[0], 'home', '4-3-3').concat(
    createTeamPlayers(TEAMS[1], 'away', '4-4-2'),
  );
  const ball = makeBall();
  const setup = computeSetPieceSetup(
    'throw_in',
    { x: 12, y: BALL_RADIUS, z: HALF_WIDTH - 0.35 },
    'home',
    players,
    ball,
  );
  const taker = players.find((p) => p.id === setup.takerId)!;
  assert.ok(taker);
  const nearbyReceivers = players.filter(
    (p) =>
      p.team === 'home' &&
      p.id !== taker.id &&
      p.role !== 'GK' &&
      Math.hypot(p.position.x - setup.spot.x, p.position.z - setup.spot.z) <= 13.5,
  );
  assert.ok(nearbyReceivers.length >= 2, 'Expected at least 2 nearby teammates positioned to receive throw-in');
});
