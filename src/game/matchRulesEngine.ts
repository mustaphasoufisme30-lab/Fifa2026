import {
  BALL_RADIUS,
  GOAL_AREA_LENGTH,
  GOAL_HALF_WIDTH,
  GOAL_HEIGHT,
  HALF_LENGTH,
  HALF_WIDTH,
  PLAYER_RADIUS,
  TACKLE_REACH,
} from '../core/constants';
import {
  BallRestartOrigin,
  BallState,
  CardType,
  FoulRecord,
  FoulType,
  FreeKickKind,
  OffsideRecord,
  PlayerState,
  SetPieceType,
  TeamSide,
  Vec3,
} from '../core/types';
import { isInsidePenaltyArea } from './rules';

export type MatchRuleStateName =
  | 'PLAYING'
  | 'BALL_OUT_SIDE'
  | 'BALL_OUT_ENDLINE'
  | 'THROW_IN'
  | 'GOAL_KICK'
  | 'CORNER_KICK'
  | 'GOAL'
  | 'FOUL'
  | 'FREE_KICK'
  | 'INDIRECT_FREE_KICK'
  | 'PENALTY'
  | 'OFFSIDE';

export interface OutOfBoundsDecision {
  event: 'BALL_OUT_SIDE' | 'BALL_OUT_ENDLINE' | 'GOAL';
  restartType: SetPieceType | 'goal';
  awardedTeam: TeamSide;
  spot: Vec3;
  lastTouchTeam: TeamSide | null;
  lastTouchPlayerId: string | null;
}

export interface OffsidePassSnapshot {
  passId: number;
  passTimestamp: number;
  attackingTeam: TeamSide;
  passerId: string;
  passSource: BallRestartOrigin;
  ballXAtPass: number;
  offsideLineX: number;
  /** Teammates strictly in an offside position at the exact moment of the pass. */
  offsideCandidateIds: string[];
  resolved: boolean;
}

export interface RecentBallRelease {
  playerId: string;
  team: TeamSide;
  releasedAtMs: number;
  position: Vec3;
}

export interface MatchRulesRuntimeState {
  ruleState: MatchRuleStateName;
  eventLocked: boolean;
  nextPassId: number;
  matchElapsedMs: number;
  postRestartGraceMs: number;
  lastFoulTimestampMs: number;
  offsideSnapshot: OffsidePassSnapshot | null;
  recentRelease: RecentBallRelease | null;
  yellowCardsByPlayer: Record<string, number>;
  redCardedPlayerIds: string[];
  lastFoul: FoulRecord | null;
  lastOffside: OffsideRecord | null;
}

/** Offside line margin (meters) to avoid borderline floating-point false calls. */
const OFFSIDE_TOLERANCE_M = 0.22;
/** Window (ms) after releasing a pass/shot where an incoming reckless tackle counts as a late tackle. */
const LATE_TACKLE_WINDOW_MS = 420;
/** Minimum cooldown (ms) between distinct foul calls to guarantee zero duplicate chains. */
const FOUL_MIN_INTERVAL_MS = 650;

export function createMatchRulesState(): MatchRulesRuntimeState {
  return {
    ruleState: 'PLAYING',
    eventLocked: false,
    nextPassId: 1,
    matchElapsedMs: 0,
    postRestartGraceMs: 0,
    lastFoulTimestampMs: -10_000,
    offsideSnapshot: null,
    recentRelease: null,
    yellowCardsByPlayer: {},
    redCardedPlayerIds: [],
    lastFoul: null,
    lastOffside: null,
  };
}

export function resetTransientRuleState(state: MatchRulesRuntimeState): void {
  state.ruleState = 'PLAYING';
  state.eventLocked = false;
  state.offsideSnapshot = null;
  state.recentRelease = null;
  state.postRestartGraceMs = 220;
}

export function stepRuleTimers(state: MatchRulesRuntimeState, dtSeconds: number): void {
  const dtMs = Math.max(0, dtSeconds * 1000);
  state.matchElapsedMs += dtMs;
  if (state.postRestartGraceMs > 0) {
    state.postRestartGraceMs = Math.max(0, state.postRestartGraceMs - dtMs);
  }
  if (
    state.recentRelease &&
    state.matchElapsedMs - state.recentRelease.releasedAtMs > LATE_TACKLE_WINDOW_MS + 120
  ) {
    state.recentRelease = null;
  }
}

/**
 * Records a real ball touch (pass, shot, dribble, deflection, block, save) so
 * out-of-bounds, corner, goal kick, and throw-in awards always reflect the true last touch.
 */
export function recordBallTouch(
  ball: BallState,
  player: PlayerState,
  source: BallRestartOrigin = 'live',
): void {
  ball.lastTouchTeam = player.team;
  ball.lastTouchPlayerId = player.id;
  ball.lastTouchPlayerName = player.name;
  ball.lastTouchSource = source;
}

/**
 * Evaluates whether the ball (either free-moving or carried by a dribbler) has crossed
 * a touchline, endline, or goal line, returning the exact football restart decision based
 * on the true last touching team.
 */
export function evaluateBallBoundaryDecision(ball: BallState): OutOfBoundsDecision | null {
  const bx = ball.position.x;
  const by = ball.position.y;
  const bz = ball.position.z;

  const inGoalMouthZ = Math.abs(bz) < GOAL_HALF_WIDTH - BALL_RADIUS * 0.4;
  const underCrossbar = by < GOAL_HEIGHT - BALL_RADIUS * 0.3;

  // 1. Goal line inside goal frame -> GOAL
  if (inGoalMouthZ && underCrossbar) {
    if (bx > HALF_LENGTH + BALL_RADIUS) {
      return {
        event: 'GOAL',
        restartType: 'goal',
        awardedTeam: 'home',
        spot: { x: HALF_LENGTH, y: by, z: bz },
        lastTouchTeam: ball.lastTouchTeam,
        lastTouchPlayerId: ball.lastTouchPlayerId ?? null,
      };
    }
    if (bx < -HALF_LENGTH - BALL_RADIUS) {
      return {
        event: 'GOAL',
        restartType: 'goal',
        awardedTeam: 'away',
        spot: { x: -HALF_LENGTH, y: by, z: bz },
        lastTouchTeam: ball.lastTouchTeam,
        lastTouchPlayerId: ball.lastTouchPlayerId ?? null,
      };
    }
  }

  // 2. Touchline (sideline) -> BALL_OUT_SIDE -> THROW_IN for opposing team of last touch
  if (Math.abs(bz) > HALF_WIDTH + BALL_RADIUS) {
    const awardedTeam: TeamSide = ball.lastTouchTeam === 'home' ? 'away' : 'home';
    const clampedX = Math.max(-HALF_LENGTH + 1.2, Math.min(HALF_LENGTH - 1.2, bx));
    const exitZ = Math.sign(bz || 1) * (HALF_WIDTH - 0.35);
    return {
      event: 'BALL_OUT_SIDE',
      restartType: 'throw_in',
      awardedTeam,
      spot: { x: clampedX, y: BALL_RADIUS, z: exitZ },
      lastTouchTeam: ball.lastTouchTeam,
      lastTouchPlayerId: ball.lastTouchPlayerId ?? null,
    };
  }

  // 3. Home endline (-X): Home defends -X, Away attacks -X
  if (bx < -HALF_LENGTH - BALL_RADIUS) {
    if (ball.lastTouchTeam === 'home') {
      // Defender (Home) touched last -> CORNER_KICK for Away
      return {
        event: 'BALL_OUT_ENDLINE',
        restartType: 'corner',
        awardedTeam: 'away',
        spot: {
          x: -HALF_LENGTH + 0.6,
          y: BALL_RADIUS,
          z: Math.sign(bz || 1) * (HALF_WIDTH - 0.6),
        },
        lastTouchTeam: ball.lastTouchTeam,
        lastTouchPlayerId: ball.lastTouchPlayerId ?? null,
      };
    }
    // Attacker (Away) touched last -> GOAL_KICK for Home
    return {
      event: 'BALL_OUT_ENDLINE',
      restartType: 'goal_kick',
      awardedTeam: 'home',
      spot: {
        x: -HALF_LENGTH + GOAL_AREA_LENGTH,
        y: BALL_RADIUS,
        z: Math.sign(bz || 1) * 4.5,
      },
      lastTouchTeam: ball.lastTouchTeam,
      lastTouchPlayerId: ball.lastTouchPlayerId ?? null,
    };
  }

  // 4. Away endline (+X): Away defends +X, Home attacks +X
  if (bx > HALF_LENGTH + BALL_RADIUS) {
    if (ball.lastTouchTeam === 'away') {
      // Defender (Away) touched last -> CORNER_KICK for Home
      return {
        event: 'BALL_OUT_ENDLINE',
        restartType: 'corner',
        awardedTeam: 'home',
        spot: {
          x: HALF_LENGTH - 0.6,
          y: BALL_RADIUS,
          z: Math.sign(bz || 1) * (HALF_WIDTH - 0.6),
        },
        lastTouchTeam: ball.lastTouchTeam,
        lastTouchPlayerId: ball.lastTouchPlayerId ?? null,
      };
    }
    // Attacker (Home) touched last -> GOAL_KICK for Away
    return {
      event: 'BALL_OUT_ENDLINE',
      restartType: 'goal_kick',
      awardedTeam: 'away',
      spot: {
        x: HALF_LENGTH - GOAL_AREA_LENGTH,
        y: BALL_RADIUS,
        z: Math.sign(bz || 1) * 4.5,
      },
      lastTouchTeam: ball.lastTouchTeam,
      lastTouchPlayerId: ball.lastTouchPlayerId ?? null,
    };
  }

  return null;
}

/**
 * Computes the official Law 11 offside line X-coordinate at the exact moment of the pass.
 * Home attacks +X (higher X = deeper into opponent territory).
 * Away attacks -X (lower X = deeper into opponent territory).
 * The offside line is the furthest attacking boundary among:
 * - halfway line (x = 0)
 * - ball X at the moment of the pass
 * - the second-last defending opponent's X (usually last outfield defender when GK is deepest)
 */
export function computeOffsideLineX(
  attackingTeam: TeamSide,
  ballX: number,
  players: PlayerState[],
): number {
  const defendingTeam: TeamSide = attackingTeam === 'home' ? 'away' : 'home';
  const defenderXs: number[] = [];

  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (p.team !== defendingTeam || p.isSentOff) continue;
    defenderXs.push(p.position.x);
  }

  if (attackingTeam === 'home') {
    // Sort descending (closest to +HALF_LENGTH first); index 1 is second-last defender
    defenderXs.sort((a, b) => b - a);
    const secondLastDefX = defenderXs.length >= 2 ? defenderXs[1] : HALF_LENGTH;
    return Math.max(0, ballX, secondLastDefX);
  }

  // Away attacks -X: sort ascending (closest to -HALF_LENGTH first); index 1 is second-last defender
  defenderXs.sort((a, b) => a - b);
  const secondLastDefX = defenderXs.length >= 2 ? defenderXs[1] : -HALF_LENGTH;
  return Math.min(0, ballX, secondLastDefX);
}

/**
 * Checks whether an attacking player is strictly in an offside position at the pass moment.
 */
export function isPlayerInOffsidePosition(
  player: PlayerState,
  attackingTeam: TeamSide,
  offsideLineX: number,
): boolean {
  if (player.team !== attackingTeam || player.isSentOff) return false;
  if (attackingTeam === 'home') {
    // Cannot be offside in own half (x <= 0)
    if (player.position.x <= 0) return false;
    return player.position.x > offsideLineX + OFFSIDE_TOLERANCE_M;
  }
  if (player.position.x >= 0) return false;
  return player.position.x < offsideLineX - OFFSIDE_TOLERANCE_M;
}

/**
 * Captures the moment-of-pass offside snapshot when an attacker plays the ball.
 * Automatically honors FIFA Law 11 exemptions: throw_in, goal_kick, and corner NEVER create offside.
 */
export function capturePassOffsideSnapshot(
  rulesState: MatchRulesRuntimeState,
  passer: PlayerState,
  ball: BallState,
  players: PlayerState[],
  passSource: BallRestartOrigin = 'live',
): OffsidePassSnapshot | null {
  // Record release moment for late-tackle detection
  rulesState.recentRelease = {
    playerId: passer.id,
    team: passer.team,
    releasedAtMs: rulesState.matchElapsedMs,
    position: { ...passer.position },
  };

  // FIFA Law 11: No offside offense directly from a throw-in, goal kick, or corner kick
  if (passSource === 'throw_in' || passSource === 'goal_kick' || passSource === 'corner') {
    rulesState.offsideSnapshot = null;
    return null;
  }

  const offsideLineX = computeOffsideLineX(passer.team, ball.position.x, players);
  const offsideCandidateIds: string[] = [];

  for (let i = 0; i < players.length; i++) {
    const mate = players[i];
    if (mate.team !== passer.team || mate.id === passer.id || mate.isSentOff) continue;
    if (isPlayerInOffsidePosition(mate, passer.team, offsideLineX)) {
      offsideCandidateIds.push(mate.id);
    }
  }

  if (offsideCandidateIds.length === 0) {
    rulesState.offsideSnapshot = null;
    return null;
  }

  const snapshot: OffsidePassSnapshot = {
    passId: rulesState.nextPassId++,
    passTimestamp: rulesState.matchElapsedMs,
    attackingTeam: passer.team,
    passerId: passer.id,
    passSource,
    ballXAtPass: ball.position.x,
    offsideLineX,
    offsideCandidateIds,
    resolved: false,
  };
  rulesState.offsideSnapshot = snapshot;
  return snapshot;
}

/**
 * Checks whether a player who is about to touch/receive the ball commits an active offside offense
 * against the pending pass snapshot.
 * - Passive players who never touch or interfere are NEVER penalized.
 * - If an opponent deliberately plays the ball or an onside teammate touches it, the snapshot clears.
 */
export function evaluateOffsideOnTouch(
  rulesState: MatchRulesRuntimeState,
  touchingPlayer: PlayerState,
): OffsideRecord | null {
  const snap = rulesState.offsideSnapshot;
  if (!snap || snap.resolved || rulesState.eventLocked) {
    return null;
  }

  // Opponent deliberately plays/intercepts the ball -> resets phase of play (no offside)
  if (touchingPlayer.team !== snap.attackingTeam) {
    snap.resolved = true;
    rulesState.offsideSnapshot = null;
    return null;
  }

  // Passer touching own rebound/dribble is never offside
  if (touchingPlayer.id === snap.passerId) {
    snap.resolved = true;
    rulesState.offsideSnapshot = null;
    return null;
  }

  // Only players who WERE in an offside position at passTimestamp trigger offside!
  if (snap.offsideCandidateIds.includes(touchingPlayer.id)) {
    snap.resolved = true;
    const record: OffsideRecord = {
      offsidePlayerId: touchingPlayer.id,
      offsidePlayerName: touchingPlayer.name,
      offsideTeam: touchingPlayer.team,
      offsidePosition: {
        x: Math.max(-HALF_LENGTH + 1.5, Math.min(HALF_LENGTH - 1.5, touchingPlayer.position.x)),
        y: BALL_RADIUS,
        z: Math.max(-HALF_WIDTH + 1.5, Math.min(HALF_WIDTH - 1.5, touchingPlayer.position.z)),
      },
      offsideLineX: snap.offsideLineX,
      passTimestamp: snap.passTimestamp,
    };
    rulesState.offsideSnapshot = null;
    rulesState.lastOffside = record;
    rulesState.ruleState = 'OFFSIDE';
    rulesState.eventLocked = true;
    return record;
  }

  // An ONSIDE teammate cleanly received the pass -> clear snapshot (no offside)
  snap.resolved = true;
  rulesState.offsideSnapshot = null;
  return null;
}

/**
 * Checks if an offside candidate actively interferes with an opponent / challenges for the ball
 * in close proximity while the ball is arriving toward them (even moments before touching it).
 */
export function evaluateOffsideInterference(
  rulesState: MatchRulesRuntimeState,
  ball: BallState,
  players: PlayerState[],
): OffsideRecord | null {
  const snap = rulesState.offsideSnapshot;
  if (!snap || snap.resolved || rulesState.eventLocked || ball.ownerId !== null) {
    return null;
  }

  const ballSpeed = Math.hypot(ball.velocity.x, ball.velocity.z);
  if (ballSpeed < 1.5) return null;

  for (let i = 0; i < snap.offsideCandidateIds.length; i++) {
    const candidateId = snap.offsideCandidateIds[i];
    const candidate = players.find((p) => p.id === candidateId);
    if (!candidate || candidate.isSentOff) continue;

    const dxBall = candidate.position.x - ball.position.x;
    const dzBall = candidate.position.z - ball.position.z;
    const distBall = Math.hypot(dxBall, dzBall);
    if (distBall > 1.65) continue;

    // Ball must actually be traveling toward this offside player
    const towardDot = (ball.velocity.x * dxBall + ball.velocity.z * dzBall) / (ballSpeed * (distBall || 1));
    if (towardDot < 0.45) continue;

    // Must be interfering directly with a nearby defender (within 1.5m)
    const nearbyDefender = players.some(
      (opp) =>
        opp.team !== candidate.team &&
        !opp.isSentOff &&
        Math.hypot(opp.position.x - candidate.position.x, opp.position.z - candidate.position.z) <= 1.5,
    );
    if (!nearbyDefender) continue;

    return evaluateOffsideOnTouch(rulesState, candidate);
  }

  return null;
}

/**
 * Determines whether a foul awards a Direct Free Kick, Indirect Free Kick, or Penalty Kick.
 */
export function resolveFoulRestart(
  foulType: FoulType,
  foulPosition: Vec3,
  foulingTeam: TeamSide,
): { restartType: 'free_kick' | 'indirect_free_kick' | 'penalty'; kickKind: FreeKickKind } {
  // Law 12: Obstruction (impeding without direct contact on ball) -> Indirect Free Kick
  if (foulType === 'obstruction') {
    return { restartType: 'indirect_free_kick', kickKind: 'indirect' };
  }

  // Direct foul committed inside the fouling team's own penalty box -> Penalty Kick
  if (isInsidePenaltyArea(foulPosition.x, foulPosition.z, foulingTeam)) {
    return { restartType: 'penalty', kickKind: 'direct' };
  }

  return { restartType: 'free_kick', kickKind: 'direct' };
}

/**
 * Evaluates whether a foul stopped a promising attack (SPA) or denied a goal-scoring opportunity (DOGSO).
 */
function countDefendersAheadOfVictim(
  victim: PlayerState,
  foulingPlayerId: string,
  players: PlayerState[],
): number {
  const attackDir = victim.team === 'home' ? 1 : -1;
  let ahead = 0;
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (p.team === victim.team || p.id === foulingPlayerId || p.isSentOff) continue;
    if (p.role === 'GK') continue;
    if ((p.position.x - victim.position.x) * attackDir > -0.5) {
      ahead += 1;
    }
  }
  return ahead;
}

/**
 * Evaluates card discipline (none / yellow / red) based on foul type, impact severity,
 * tactical context (promising attack / last man), and accumulated yellow cards.
 * Intentionally avoids giving cards for every routine foul.
 */
export function evaluateFoulCard(
  rulesState: MatchRulesRuntimeState,
  fouler: PlayerState,
  victim: PlayerState,
  foulType: FoulType,
  closingSpeed: number,
  players: PlayerState[],
): { card: CardType; isSecondYellow: boolean } {
  const attackDir = victim.team === 'home' ? 1 : -1;
  const victimInAttackingThird = victim.position.x * attackDir > HALF_LENGTH * 0.34;
  const defendersAhead = countDefendersAheadOfVictim(victim, fouler.id, players);
  const isPromisingAttack = victimInAttackingThird && defendersAhead <= 2;
  const isLastManDogso = victimInAttackingThird && defendersAhead === 0;

  let baseCard: CardType = 'none';

  if (foulType === 'dangerous_tackle') {
    baseCard = closingSpeed >= 9.6 ? 'red' : 'yellow';
  } else if (foulType === 'tackle_from_behind') {
    if (isLastManDogso && !isInsidePenaltyArea(victim.position.x, victim.position.z, fouler.team)) {
      baseCard = 'red';
    } else if (closingSpeed >= 6.8 || isPromisingAttack) {
      baseCard = 'yellow';
    }
  } else if (foulType === 'late_tackle') {
    if (closingSpeed >= 7.2 || isPromisingAttack) {
      baseCard = 'yellow';
    }
  } else if (foulType === 'tripping' || foulType === 'pushing' || foulType === 'obstruction') {
    if (isPromisingAttack) {
      baseCard = 'yellow';
    }
  } else if (foulType === 'handball') {
    if (isPromisingAttack) {
      baseCard = 'yellow';
    }
  }

  // Keep GK from being sent off (cap at yellow) so goal simulation remains playable
  if (fouler.role === 'GK' && baseCard === 'red') {
    baseCard = 'yellow';
  }

  if (baseCard === 'yellow') {
    const prevYellows = rulesState.yellowCardsByPlayer[fouler.id] ?? 0;
    const nextYellows = prevYellows + 1;
    rulesState.yellowCardsByPlayer[fouler.id] = nextYellows;
    if (nextYellows >= 2 && fouler.role !== 'GK') {
      if (!rulesState.redCardedPlayerIds.includes(fouler.id)) {
        rulesState.redCardedPlayerIds.push(fouler.id);
      }
      return { card: 'red', isSecondYellow: true };
    }
    return { card: 'yellow', isSecondYellow: false };
  }

  if (baseCard === 'red') {
    if (!rulesState.redCardedPlayerIds.includes(fouler.id)) {
      rulesState.redCardedPlayerIds.push(fouler.id);
    }
    return { card: 'red', isSecondYellow: false };
  }

  return { card: 'none', isSecondYellow: false };
}

export interface ChallengeEvaluationResult {
  outcome: 'none' | 'clean' | 'foul';
  foul?: FoulRecord;
}

/**
 * Evaluates an active defensive tackle challenge against an opponent carrier OR a player
 * who just released the ball (late tackle), enforcing strict CONTACT + ILLEGAL ACTION + CONTEXT.
 * Guaranteed NEVER to flag normal running, sprinting, dribbling, passing, or clean tackles.
 */
export function evaluateActiveChallenge(
  rulesState: MatchRulesRuntimeState,
  tackler: PlayerState,
  ball: BallState,
  players: PlayerState[],
): ChallengeEvaluationResult {
  if (
    rulesState.eventLocked ||
    rulesState.postRestartGraceMs > 0 ||
    tackler.actionState !== 'tackle' ||
    tackler.isSentOff
  ) {
    return { outcome: 'none' };
  }

  const canCallFoulNow =
    rulesState.matchElapsedMs - rulesState.lastFoulTimestampMs >= FOUL_MIN_INTERVAL_MS;

  // Case A: Ball is currently owned by an opponent
  if (ball.ownerId !== null) {
    const victim = players.find((p) => p.id === ball.ownerId);
    if (!victim || victim.team === tackler.team || victim.isSentOff) {
      return { outcome: 'none' };
    }

    const dxToVictim = victim.position.x - tackler.position.x;
    const dzToVictim = victim.position.z - tackler.position.z;
    const distToVictim = Math.hypot(dxToVictim, dzToVictim);
    const distToBall = Math.hypot(
      ball.position.x - tackler.position.x,
      ball.position.z - tackler.position.z,
    );

    if (distToVictim > TACKLE_REACH && distToBall > TACKLE_REACH) {
      return { outcome: 'none' };
    }

    // Clean ball-first win -> always legal
    if (distToBall <= 1.05 && distToBall <= distToVictim + 0.25) {
      return { outcome: 'clean' };
    }

    // Strict foul check: direct body contact + clearly missed ball + forceful lunge
    if (
      canCallFoulNow &&
      distToVictim <= 0.82 &&
      distToBall > 1.12 &&
      distToBall > distToVictim * 1.35
    ) {
      const invDist = distToVictim > 0.001 ? 1 / distToVictim : 1;
      const toVictimX = dxToVictim * invDist;
      const toVictimZ = dzToVictim * invDist;
      const closingSpeed = tackler.velocity.x * toVictimX + tackler.velocity.z * toVictimZ;

      const victimFwdX = Math.sin(victim.facingAngle);
      const victimFwdZ = Math.cos(victim.facingAngle);
      const behindDot = -toVictimX * victimFwdX + -toVictimZ * victimFwdZ;

      let foulType: FoulType | null = null;
      if (closingSpeed >= 9.6 && distToVictim <= 0.72) {
        foulType = 'dangerous_tackle';
      } else if (behindDot < -0.35 && closingSpeed >= 4.5) {
        foulType = 'tackle_from_behind';
      } else if (closingSpeed >= 6.8 && distToVictim <= 0.68 && distToBall > 1.35) {
        foulType = 'tripping';
      }

      if (foulType !== null) {
        return {
          outcome: 'foul',
          foul: commitFoulRecord(
            rulesState,
            tackler,
            victim,
            foulType,
            closingSpeed,
            players,
          ),
        };
      }
    }

    if (distToBall <= TACKLE_REACH * 0.88) {
      return { outcome: 'clean' };
    }

    return { outcome: 'none' };
  }

  // Case B: Ball was JUST released (late tackle on passer/shooter) or off-ball reckless trip
  if (!canCallFoulNow) return { outcome: 'none' };

  const distToBall = Math.hypot(
    ball.position.x - tackler.position.x,
    ball.position.z - tackler.position.z,
  );
  // If tackler is genuinely playing the loose ball right in front of them, it's not a foul
  if (distToBall <= TACKLE_REACH) {
    return { outcome: 'none' };
  }

  const release = rulesState.recentRelease;
  const isRecentRelease =
    release !== null &&
    release.team !== tackler.team &&
    rulesState.matchElapsedMs - release.releasedAtMs <= LATE_TACKLE_WINDOW_MS;

  for (let i = 0; i < players.length; i++) {
    const opp = players[i];
    if (opp.team === tackler.team || opp.isSentOff) continue;

    const dx = opp.position.x - tackler.position.x;
    const dz = opp.position.z - tackler.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.76) continue;

    const invDist = dist > 0.001 ? 1 / dist : 1;
    const closingSpeed = tackler.velocity.x * (dx * invDist) + tackler.velocity.z * (dz * invDist);
    if (closingSpeed < 5.6) continue;

    let foulType: FoulType;
    if (closingSpeed >= 9.8 && dist <= 0.68) {
      foulType = 'dangerous_tackle';
    } else if (isRecentRelease && release && opp.id === release.playerId) {
      foulType = 'late_tackle';
    } else if (distToBall > 3.2) {
      foulType = 'obstruction';
    } else {
      foulType = 'tripping';
    }

    return {
      outcome: 'foul',
      foul: commitFoulRecord(rulesState, tackler, opp, foulType, closingSpeed, players),
    };
  }

  return { outcome: 'none' };
}

/**
 * Evaluates illegal forceful pushing from behind against a ball carrier when a defender
 * rams straight into the carrier's back at extreme differential speed with no play on the ball.
 * Strictly bounded so normal running, sprinting, shoulder-to-shoulder, and dribbling NEVER trigger.
 */
export function evaluateIllegalPushFoul(
  rulesState: MatchRulesRuntimeState,
  defender: PlayerState,
  victim: PlayerState,
  ball: BallState,
  players: PlayerState[],
): FoulRecord | null {
  if (
    rulesState.eventLocked ||
    rulesState.postRestartGraceMs > 0 ||
    defender.isSentOff ||
    victim.isSentOff ||
    defender.team === victim.team ||
    !victim.hasBall
  ) {
    return null;
  }

  if (rulesState.matchElapsedMs - rulesState.lastFoulTimestampMs < FOUL_MIN_INTERVAL_MS) {
    return null;
  }

  // Only an active aggressive pressing/sprinting shove directly into the back, far from ball
  if (defender.actionState !== 'sprint') return null;

  const dx = victim.position.x - defender.position.x;
  const dz = victim.position.z - defender.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist > PLAYER_RADIUS * 1.45) return null; // tighter than 0.66m hard body slam

  const distToBall = Math.hypot(
    ball.position.x - defender.position.x,
    ball.position.z - defender.position.z,
  );
  if (distToBall <= 1.28) return null;

  const invDist = dist > 0.001 ? 1 / dist : 1;
  const toVictimX = dx * invDist;
  const toVictimZ = dz * invDist;

  // Must be directly from behind the victim
  const victimFwdX = Math.sin(victim.facingAngle);
  const victimFwdZ = Math.cos(victim.facingAngle);
  const behindDot = -toVictimX * victimFwdX + -toVictimZ * victimFwdZ;
  if (behindDot > -0.72) return null;

  // Must have a severe relative closing impact (>= 4.8 m/s faster than victim along collision axis)
  const relClosing =
    (defender.velocity.x - victim.velocity.x) * toVictimX +
    (defender.velocity.z - victim.velocity.z) * toVictimZ;
  if (relClosing < 4.8) return null;

  return commitFoulRecord(rulesState, defender, victim, 'pushing', relClosing + 2.5, players);
}

/**
 * Evaluates rare deliberate/unnatural-silhouette handball when a fast airborne ball at arm height
 * strikes an outfield defender blocking a shot/cross away from their body.
 * Never triggers on ground balls, dribbling, normal chest/head blocks, or goalkeepers inside box.
 */
export function evaluateHandballFoul(
  rulesState: MatchRulesRuntimeState,
  blocker: PlayerState,
  ball: BallState,
  players: PlayerState[],
  isArmExtended: boolean,
): FoulRecord | null {
  if (
    rulesState.eventLocked ||
    rulesState.postRestartGraceMs > 0 ||
    blocker.isSentOff ||
    !isArmExtended
  ) {
    return null;
  }
  if (rulesState.matchElapsedMs - rulesState.lastFoulTimestampMs < FOUL_MIN_INTERVAL_MS) {
    return null;
  }

  // Goalkeeper using hands inside own penalty box is completely legal
  if (blocker.role === 'GK' && isInsidePenaltyArea(blocker.position.x, blocker.position.z, blocker.team)) {
    return null;
  }

  // Must be an airborne opponent strike at outstretched arm height (1.18m..1.52m)
  if (ball.lastTouchTeam === null || ball.lastTouchTeam === blocker.team) return null;
  if (ball.position.y < 1.18 || ball.position.y > 1.52) return null;

  const ballSpeed = Math.hypot(ball.velocity.x, ball.velocity.z);
  if (ballSpeed < 12.5) return null;

  const nearestOpponent =
    players.find((p) => p.team !== blocker.team && p.id === ball.lastTouchPlayerId) ??
    players.find((p) => p.team !== blocker.team && !p.isSentOff) ??
    blocker;

  return commitFoulRecord(
    rulesState,
    blocker,
    nearestOpponent,
    'handball',
    ballSpeed * 0.4,
    players,
    blocker.position,
  );
}

/**
 * Creates, records, and locks a FoulRecord with full attribution, restart type, and card decision.
 */
export function commitFoulRecord(
  rulesState: MatchRulesRuntimeState,
  fouler: PlayerState,
  victim: PlayerState,
  foulType: FoulType,
  impactSpeed: number,
  players: PlayerState[],
  overridePosition?: Vec3,
): FoulRecord {
  const posSource = overridePosition ?? victim.position;
  const foulPosition: Vec3 = {
    x: Math.max(-HALF_LENGTH + 1.0, Math.min(HALF_LENGTH - 1.0, posSource.x)),
    y: BALL_RADIUS,
    z: Math.max(-HALF_WIDTH + 1.0, Math.min(HALF_WIDTH - 1.0, posSource.z)),
  };

  const { restartType, kickKind } = resolveFoulRestart(foulType, foulPosition, fouler.team);
  const { card, isSecondYellow } = evaluateFoulCard(
    rulesState,
    fouler,
    victim,
    foulType,
    impactSpeed,
    players,
  );

  const record: FoulRecord = {
    foulingPlayerId: fouler.id,
    foulingPlayerName: fouler.name,
    foulingTeamId: fouler.team,
    fouledPlayerId: victim.id,
    fouledPlayerName: victim.name,
    fouledTeamId: victim.team,
    foulType,
    foulPosition,
    timestamp: Math.round(rulesState.matchElapsedMs),
    restartType,
    kickKind,
    card,
    isSecondYellow,
  };

  rulesState.lastFoul = record;
  rulesState.lastFoulTimestampMs = rulesState.matchElapsedMs;
  rulesState.offsideSnapshot = null;
  rulesState.ruleState = 'FOUL';
  rulesState.eventLocked = true;

  // Apply card status directly onto player state
  fouler.yellowCards = rulesState.yellowCardsByPlayer[fouler.id] ?? 0;
  if (card === 'red') {
    fouler.isSentOff = true;
    fouler.hasBall = false;
    fouler.isControlled = false;
    fouler.velocity.x = 0;
    fouler.velocity.z = 0;
    fouler.actionState = 'idle';
    // Move sent-off player off the touchline so they no longer interfere in play
    fouler.position.x = 0;
    fouler.position.z = fouler.team === 'home' ? -HALF_WIDTH - 2.6 : HALF_WIDTH + 2.6;
  }

  return record;
}

export function formatFoulTypeLabel(foulType: FoulType): string {
  switch (foulType) {
    case 'tripping':
      return 'Tripping';
    case 'pushing':
      return 'Pushing';
    case 'late_tackle':
      return 'Late Tackle';
    case 'tackle_from_behind':
      return 'Tackle From Behind';
    case 'obstruction':
      return 'Obstruction';
    case 'dangerous_tackle':
      return 'Dangerous Tackle';
    case 'handball':
      return 'Handball';
  }
}
