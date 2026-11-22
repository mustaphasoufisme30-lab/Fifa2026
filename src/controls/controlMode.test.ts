import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTROL_MODE_CONFIRM_MS,
  CONTROL_MODE_COOLDOWN_MS,
  createControlModeState,
  stepControlMode,
} from './controlMode';
import { MatchEngine } from '../game/matchEngine';
import { TEAMS } from '../teams/teams';
import { createNeutralInput } from '../multiplayer/roomManager';

test('kickoff immediately assigns ATTACK to kicking team and DEFENSE to defending team', () => {
  const homeState = createControlModeState('DEFENSE');
  const homeRes = stepControlMode(
    homeState,
    {
      phase: 'kickoff',
      localTeam: 'home',
      ballOwnerTeam: null,
      lastTouchTeam: null,
      setPieceTeam: null,
      kickoffTeam: 'home',
    },
    0,
  );
  assert.equal(homeRes.state.mode, 'ATTACK');
  assert.equal(homeRes.changed, true);

  const awayState = createControlModeState('ATTACK');
  const awayRes = stepControlMode(
    awayState,
    {
      phase: 'kickoff',
      localTeam: 'away',
      ballOwnerTeam: null,
      lastTouchTeam: null,
      setPieceTeam: null,
      kickoffTeam: 'home',
    },
    0,
  );
  assert.equal(awayRes.state.mode, 'DEFENSE');
  assert.equal(awayRes.changed, true);
});

test('sustained opponent possession switches ATTACK to DEFENSE after confirmation window', () => {
  let state = createControlModeState('ATTACK');

  // 100ms is below confirmation threshold -> stays ATTACK
  let res = stepControlMode(
    state,
    {
      phase: 'live',
      localTeam: 'home',
      ballOwnerTeam: 'away',
      lastTouchTeam: 'away',
      setPieceTeam: null,
      kickoffTeam: 'home',
    },
    100,
  );
  state = res.state;
  assert.equal(state.mode, 'ATTACK');
  assert.equal(res.changed, false);

  // Another 60ms reaches >= 150ms -> switches cleanly to DEFENSE
  res = stepControlMode(
    state,
    {
      phase: 'live',
      localTeam: 'home',
      ballOwnerTeam: 'away',
      lastTouchTeam: 'away',
      setPieceTeam: null,
      kickoffTeam: 'home',
    },
    60,
  );
  state = res.state;
  assert.equal(state.mode, 'DEFENSE');
  assert.equal(res.changed, true);
});

test('sustained team possession switches DEFENSE to ATTACK and supports online away side', () => {
  let state = createControlModeState('DEFENSE');
  const stepMs = 40;
  let switched = false;

  for (let i = 0; i < 6; i++) {
    const res = stepControlMode(
      state,
      {
        phase: 'live',
        localTeam: 'away',
        ballOwnerTeam: 'away',
        lastTouchTeam: 'away',
        setPieceTeam: null,
        kickoffTeam: 'home',
      },
      stepMs,
    );
    state = res.state;
    if (res.changed) switched = true;
  }

  assert.equal(switched, true);
  assert.equal(state.mode, 'ATTACK');
});

test('loose ball during team passes and shots preserves ATTACK mode without flickering', () => {
  let state = createControlModeState('ATTACK');

  for (let i = 0; i < 20; i++) {
    const res = stepControlMode(
      state,
      {
        phase: 'live',
        localTeam: 'home',
        ballOwnerTeam: null,
        lastTouchTeam: 'home',
        setPieceTeam: null,
        kickoffTeam: 'home',
      },
      50,
    );
    state = res.state;
    assert.equal(state.mode, 'ATTACK');
    assert.equal(res.changed, false);
  }
});

test('brief opponent deflection followed by home recovery never triggers flicker', () => {
  let state = createControlModeState('ATTACK');

  // Shot deflects off away defender for 180ms in flight -> below in-flight threshold (~273ms)
  state = stepControlMode(
    state,
    {
      phase: 'live',
      localTeam: 'home',
      ballOwnerTeam: null,
      lastTouchTeam: 'away',
      setPieceTeam: null,
      kickoffTeam: 'home',
    },
    180,
  ).state;
  assert.equal(state.mode, 'ATTACK');

  // Home recovers rebound -> resets pending immediately and stays ATTACK
  state = stepControlMode(
    state,
    {
      phase: 'live',
      localTeam: 'home',
      ballOwnerTeam: 'home',
      lastTouchTeam: 'home',
      setPieceTeam: null,
      kickoffTeam: 'home',
    },
    50,
  ).state;
  assert.equal(state.mode, 'ATTACK');
  assert.equal(state.pendingMode, null);
});

test('opponent one-touch passing chain cleanly transitions ATTACK to DEFENSE', () => {
  let state = createControlModeState('ATTACK');

  // Opponent controls for 40ms then plays an immediate 240ms pass to a teammate
  state = stepControlMode(
    state,
    {
      phase: 'live',
      localTeam: 'home',
      ballOwnerTeam: 'away',
      lastTouchTeam: 'away',
      setPieceTeam: null,
      kickoffTeam: 'home',
    },
    40,
  ).state;
  assert.equal(state.mode, 'ATTACK');

  const res = stepControlMode(
    state,
    {
      phase: 'live',
      localTeam: 'home',
      ballOwnerTeam: null,
      lastTouchTeam: 'away',
      setPieceTeam: null,
      kickoffTeam: 'home',
    },
    240,
  );
  assert.equal(res.state.mode, 'DEFENSE');
  assert.equal(res.changed, true);
});

test('cooldown suppresses immediate back-and-forth ping-pong after a mode switch', () => {
  let state = createControlModeState('ATTACK');

  // Confirm switch to DEFENSE
  let res = stepControlMode(
    state,
    {
      phase: 'live',
      localTeam: 'home',
      ballOwnerTeam: 'away',
      lastTouchTeam: 'away',
      setPieceTeam: null,
      kickoffTeam: 'home',
    },
    CONTROL_MODE_CONFIRM_MS + 10,
  );
  state = res.state;
  assert.equal(state.mode, 'DEFENSE');

  // Immediately regain ball within cooldown window -> must not flip back instantly
  res = stepControlMode(
    state,
    {
      phase: 'live',
      localTeam: 'home',
      ballOwnerTeam: 'home',
      lastTouchTeam: 'home',
      setPieceTeam: null,
      kickoffTeam: 'home',
    },
    CONTROL_MODE_COOLDOWN_MS - 40,
  );
  state = res.state;
  assert.equal(state.mode, 'DEFENSE');
  assert.equal(res.changed, false);

  // Cooldown expires
  res = stepControlMode(
    state,
    {
      phase: 'live',
      localTeam: 'home',
      ballOwnerTeam: 'home',
      lastTouchTeam: 'home',
      setPieceTeam: null,
      kickoffTeam: 'home',
    },
    50,
  );
  state = res.state;
  assert.equal(state.mode, 'DEFENSE');

  // Sustained possession confirms switch back to ATTACK
  res = stepControlMode(
    state,
    {
      phase: 'live',
      localTeam: 'home',
      ballOwnerTeam: 'home',
      lastTouchTeam: 'home',
      setPieceTeam: null,
      kickoffTeam: 'home',
    },
    CONTROL_MODE_CONFIRM_MS + 10,
  );
  state = res.state;
  assert.equal(state.mode, 'ATTACK');
  assert.equal(res.changed, true);
});

test('set pieces immediately switch to ATTACK for taking team and DEFENSE for defending team', () => {
  const attackingCorner = stepControlMode(
    createControlModeState('DEFENSE'),
    {
      phase: 'setpiece',
      localTeam: 'home',
      ballOwnerTeam: null,
      lastTouchTeam: 'away',
      setPieceTeam: 'home',
      kickoffTeam: 'home',
    },
    0,
  );
  assert.equal(attackingCorner.state.mode, 'ATTACK');
  assert.equal(attackingCorner.changed, true);

  const defendingCorner = stepControlMode(
    createControlModeState('ATTACK'),
    {
      phase: 'setpiece',
      localTeam: 'home',
      ballOwnerTeam: null,
      lastTouchTeam: 'home',
      setPieceTeam: 'away',
      kickoffTeam: 'home',
    },
    0,
  );
  assert.equal(defendingCorner.state.mode, 'DEFENSE');
  assert.equal(defendingCorner.changed, true);
});

test('MatchEngine emits live controlMode updates from real ball ownership (offline & online away side)', () => {
  let latestMode: 'ATTACK' | 'DEFENSE' = 'DEFENSE';
  const engine = new MatchEngine(
    TEAMS[0],
    TEAMS[1],
    '4-3-3',
    '4-3-3',
    120,
    'tv',
    {
      onHudUpdate: (snap) => {
        latestMode = snap.controlMode;
      },
      onMatchFinished: () => {},
      onCameraTrauma: () => {},
    },
  );

  engine.startNewMatch(TEAMS[0], TEAMS[1], '4-3-3', '4-3-3', 120);
  assert.equal(latestMode, 'ATTACK');

  // Give ball to an away player and step real simulation (even if AI passes quickly to a teammate!)
  const awayMid = engine.players.find((p) => p.team === 'away' && p.role !== 'GK');
  assert.ok(awayMid);
  for (const p of engine.players) p.hasBall = false;
  awayMid.hasBall = true;
  engine.ball.ownerId = awayMid.id;
  engine.ball.lastTouchTeam = 'away';
  engine.ball.position.x = awayMid.position.x;
  engine.ball.position.z = awayMid.position.z;

  const neutral = createNeutralInput();
  for (let i = 0; i < 15; i++) {
    engine.step(0.033, neutral);
  }

  assert.equal(latestMode, 'DEFENSE');

  // Online away client perspective: starts in DEFENSE when home kicks off, switches to ATTACK when away holds ball
  let awayMode: 'ATTACK' | 'DEFENSE' = 'ATTACK';
  const onlineAwayEngine = new MatchEngine(
    TEAMS[0],
    TEAMS[1],
    '4-3-3',
    '4-3-3',
    120,
    'tv',
    {
      onHudUpdate: (snap) => {
        awayMode = snap.controlMode;
      },
      onMatchFinished: () => {},
      onCameraTrauma: () => {},
    },
  );
  onlineAwayEngine.startNewMatch(TEAMS[0], TEAMS[1], '4-3-3', '4-3-3', 120, 'balanced', 'balanced', {
    awayHumanControl: true,
    localSide: 'away',
    isOnlineClient: true,
  });
  assert.equal(awayMode, 'DEFENSE');

  const awayOnlineMid = onlineAwayEngine.players.find((p) => p.team === 'away' && p.role !== 'GK');
  assert.ok(awayOnlineMid);
  onlineAwayEngine.ball.ownerId = awayOnlineMid.id;
  onlineAwayEngine.ball.lastTouchTeam = 'away';
  for (let i = 0; i < 10; i++) {
    onlineAwayEngine.stepOnlineInterpolation(0.033);
  }
  assert.equal(awayMode, 'ATTACK');
});
