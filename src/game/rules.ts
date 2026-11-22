import {
  BALL_RADIUS,
  CENTER_CIRCLE_RADIUS,
  GOAL_AREA_LENGTH,
  HALF_LENGTH,
  HALF_WIDTH,
  PENALTY_AREA_LENGTH,
  PENALTY_AREA_WIDTH,
  PENALTY_SPOT_DIST,
  TACKLE_REACH,
} from '../core/constants';
import { FORMATIONS, getFormationWorldPosition } from '../formations/formations';
import {
  BallState,
  FormationId,
  MatchPhase,
  PlayerState,
  SetPieceType,
  TeamConfig,
  TeamSide,
  Vec3,
} from '../core/types';

export interface ClockAdvanceResult {
  matchMinutes: number;
  matchSeconds: number;
  phaseTransition: 'halftime' | 'fulltime' | null;
}

/**
 * Converts elapsed real-time seconds in the current half into football clock (00:00..45:00 / 45:00..90:00).
 */
export function computeMatchClock(
  half: 1 | 2,
  halfElapsedRealSeconds: number,
  halfDurationSeconds: number,
): ClockAdvanceResult {
  const safeDuration = Math.max(10, halfDurationSeconds);
  const progress = Math.min(1, Math.max(0, halfElapsedRealSeconds / safeDuration));
  const totalGameSecondsInHalf = progress * 45 * 60;
  const baseMinutes = half === 1 ? 0 : 45;
  const matchMinutes = baseMinutes + Math.floor(totalGameSecondsInHalf / 60);
  const matchSeconds = Math.floor(totalGameSecondsInHalf % 60);

  let phaseTransition: 'halftime' | 'fulltime' | null = null;
  if (halfElapsedRealSeconds >= safeDuration) {
    phaseTransition = half === 1 ? 'halftime' : 'fulltime';
  }

  return { matchMinutes, matchSeconds, phaseTransition };
}

/**
 * Instantiates 11 PlayerState objects for one team using a formation.
 */
export function createTeamPlayers(
  teamConfig: TeamConfig,
  side: TeamSide,
  formationId: FormationId,
): PlayerState[] {
  const formation = FORMATIONS[formationId] ?? FORMATIONS['4-3-3'];
  const facing = side === 'home' ? Math.PI / 2 : -Math.PI / 2;

  return formation.slots.map((slot, index) => {
    const profile = teamConfig.roster[index] ?? teamConfig.roster[index % teamConfig.roster.length];
    const anchor = getFormationWorldPosition(slot, side, 0, 0, true, formationId);
    return {
      id: `${side}_${index}`,
      name: profile.name,
      number: profile.number,
      team: side,
      role: slot.role,
      slotIndex: index,
      position: { x: anchor.x, y: 0, z: anchor.z },
      velocity: { x: 0, y: 0, z: 0 },
      facingAngle: facing,
      homeAnchor: { x: anchor.x, y: 0, z: anchor.z },
      attributes: { ...profile.attributes },
      appearance: { ...profile.appearance },
      stamina: profile.attributes.staminaMax,
      actionState: 'idle',
      actionTimer: 0,
      tackleCooldown: 0,
      kickCooldown: 0,
      diveCooldown: 0,
      diveDir: 0,
      gkHoldTimer: 0,
      hasBall: false,
      isControlled: side === 'home' && index === 9, // Striker starts controlled
      animPhase: index * 0.7,
    };
  });
}

/**
 * Resets players and ball to kickoff positions for the given kickoff team.
 */
export function resetForKickoff(
  players: PlayerState[],
  ball: BallState,
  homeFormation: FormationId,
  awayFormation: FormationId,
  kickoffTeam: TeamSide,
): void {
  ball.position = { x: 0, y: BALL_RADIUS, z: 0 };
  ball.velocity = { x: 0, y: 0, z: 0 };
  ball.spin = { x: 0, y: 0, z: 0 };
  ball.ownerId = null;
  ball.pickupLockTimer = 0;

  const homeSlots = FORMATIONS[homeFormation].slots;
  const awaySlots = FORMATIONS[awayFormation].slots;

  let controlledAssigned = false;

  for (const p of players) {
    const formationId = p.team === 'home' ? homeFormation : awayFormation;
    const slots = p.team === 'home' ? homeSlots : awaySlots;
    const slot = slots[p.slotIndex] ?? slots[0];
    const pos = getFormationWorldPosition(slot, p.team, 0, 0, true, formationId);

    // Put the kickoff striker near the center spot
    if (p.team === kickoffTeam && p.slotIndex === 9) {
      pos.x = kickoffTeam === 'home' ? -0.9 : 0.9;
      pos.z = 0;
    }

    p.position.x = pos.x;
    p.position.y = 0;
    p.position.z = pos.z;
    p.homeAnchor.x = pos.x;
    p.homeAnchor.y = 0;
    p.homeAnchor.z = pos.z;
    p.velocity.x = 0;
    p.velocity.y = 0;
    p.velocity.z = 0;
    p.facingAngle = p.team === 'home' ? Math.PI / 2 : -Math.PI / 2;
    p.hasBall = false;
    p.actionState = 'idle';
    p.actionTimer = 0;
    p.diveDir = 0;
    p.gkHoldTimer = 0;

    if (p.team === 'home') {
      p.isControlled = p.slotIndex === 9;
      if (p.isControlled) controlledAssigned = true;
    } else {
      p.isControlled = false;
    }
  }

  if (!controlledAssigned) {
    const firstHome = players.find((p) => p.team === 'home' && p.role !== 'GK');
    if (firstHome) firstHome.isControlled = true;
  }
}

/**
 * Finds the best teammate to switch user control to (closest outfield teammate to ball, excluding current).
 */
export function selectSwitchTarget(
  players: PlayerState[],
  ball: BallState,
  team: TeamSide,
  currentControlledId: string | null,
): PlayerState | null {
  let best: PlayerState | null = null;
  let bestScore = Infinity;

  for (const p of players) {
    if (p.team !== team || p.role === 'GK' || p.id === currentControlledId || p.isSentOff) continue;
    const dx = p.position.x - ball.position.x;
    const dz = p.position.z - ball.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < bestScore) {
      bestScore = dist;
      best = p;
    }
  }

  return best;
}

/**
 * Measures how clear a passing lane is (0 = directly blocked by opponent, 1 = completely open).
 */
export function evaluatePassLaneClearance(
  passer: PlayerState,
  receiver: PlayerState,
  allPlayers: PlayerState[],
): number {
  const abx = receiver.position.x - passer.position.x;
  const abz = receiver.position.z - passer.position.z;
  const abLenSq = abx * abx + abz * abz;
  if (abLenSq < 1e-4) return 0;

  let minPerpDist = Infinity;
  for (const opp of allPlayers) {
    if (opp.team === passer.team) continue;
    const apx = opp.position.x - passer.position.x;
    const apz = opp.position.z - passer.position.z;
    const t = Math.max(0, Math.min(1, (apx * abx + apz * abz) / abLenSq));
    if (t < 0.08 || t > 0.95) continue;
    const projX = passer.position.x + abx * t;
    const projZ = passer.position.z + abz * t;
    const d = Math.hypot(opp.position.x - projX, opp.position.z - projZ);
    if (d < minPerpDist) minPerpDist = d;
  }

  return Math.max(0, Math.min(1, (minPerpDist - 0.8) / 3.5));
}

export type PassKind = 'short' | 'long' | 'lob';

export interface LeadPassVector {
  dirX: number;
  dirZ: number;
  speed: number;
  loft: number;
  passKind: PassKind;
  spreadFactor: number; // higher = slightly lower accuracy on long/off-balance passes
}

/**
 * Computes a lead-pass vector clearly differentiating:
 * - Short ground pass (<= 15m): crisp, accurate, low pace & low loft
 * - Long driven pass (> 15m): stronger power, longer lead, slightly higher trajectory & spread
 * - Lobbed pass (isLob): true aerial arc designed to clear defenders
 * Also accounts for passer orientation, speed, and distance.
 */
export function computeLeadPassVector(
  passer: PlayerState,
  receiver: PlayerState,
  isLob: boolean,
): LeadPassVector {
  const rawDx = receiver.position.x - passer.position.x;
  const rawDz = receiver.position.z - passer.position.z;
  const rawDist = Math.hypot(rawDx, rawDz) || 1;

  const passKind: PassKind = isLob ? 'lob' : rawDist <= 15 ? 'short' : 'long';

  // Passer body alignment toward target (passing 180° behind reduces pace & precision)
  const facingX = Math.sin(passer.facingAngle);
  const facingZ = Math.cos(passer.facingAngle);
  const alignDot = (rawDx / rawDist) * facingX + (rawDz / rawDist) * facingZ;
  const alignFactor = Math.max(0.76, Math.min(1.04, 0.88 + alignDot * 0.16));

  const passerSpeed = Math.hypot(passer.velocity.x, passer.velocity.z);
  const speedPenalty = Math.min(1, passerSpeed / 10) * 0.032;

  let estSpeed: number;
  let loft: number;
  let leadFactor: number;
  let baseSpread: number;

  if (passKind === 'lob') {
    estSpeed = Math.min(24.5, Math.max(14.5, 11.5 + rawDist * 0.42)) * alignFactor;
    // Calibrated aerial arc to clear defenders (> 2.3m apex on medium/long lobs)
    loft = Math.min(9.4, Math.max(5.8, 5.2 + rawDist * 0.135));
    leadFactor = 0.64;
    baseSpread = 0.068;
  } else if (passKind === 'short') {
    estSpeed = Math.min(17.5, Math.max(11.5, 9.8 + rawDist * 0.52)) * alignFactor;
    loft = 0.28 + Math.min(0.18, rawDist * 0.01);
    leadFactor = 0.44;
    baseSpread = 0.024;
  } else {
    estSpeed = Math.min(24.2, Math.max(17.8, 12.2 + rawDist * 0.36)) * alignFactor;
    loft = 0.78 + Math.min(0.75, (rawDist - 15) * 0.032);
    leadFactor = 0.62;
    baseSpread = 0.052;
  }

  const travelTime = Math.min(1.15, rawDist / Math.max(8, estSpeed));
  const leadX = receiver.position.x + receiver.velocity.x * travelTime * leadFactor;
  const leadZ = receiver.position.z + receiver.velocity.z * travelTime * leadFactor;

  const skillError = ((100 - passer.attributes.passing) / 100) * 0.055;
  const offAxisError = alignDot < 0.15 ? (0.15 - alignDot) * 0.045 : 0;
  const spreadFactor = baseSpread + skillError + speedPenalty + offAxisError;

  return {
    dirX: leadX - passer.position.x,
    dirZ: leadZ - passer.position.z,
    speed: estSpeed,
    loft,
    passKind,
    spreadFactor,
  };
}

/**
 * Finds the best teammate to pass toward given joystick/aim direction, passer orientation,
 * target distance, lane clearance, and teammate velocity.
 */
export function findBestPassTarget(
  passer: PlayerState,
  players: PlayerState[],
  aimX: number,
  aimZ: number,
  isLob = false,
): PlayerState | null {
  const aimLen = Math.hypot(aimX, aimZ);
  const facingX = Math.sin(passer.facingAngle);
  const facingZ = Math.cos(passer.facingAngle);

  // Blend joystick input strongly with subtle facing continuity
  let dirX = facingX;
  let dirZ = facingZ;
  if (aimLen > 0.15) {
    const nx = aimX / aimLen;
    const nz = aimZ / aimLen;
    dirX = nx * 0.88 + facingX * 0.12;
    dirZ = nz * 0.88 + facingZ * 0.12;
    const dLen = Math.hypot(dirX, dirZ) || 1;
    dirX /= dLen;
    dirZ /= dLen;
  }

  let best: PlayerState | null = null;
  let bestScore = -Infinity;
  const idealDist = isLob ? 24 : 14;
  const maxDist = isLob ? 54 : 46;

  for (const p of players) {
    if (p.team !== passer.team || p.id === passer.id || p.isSentOff) continue;
    const dx = p.position.x - passer.position.x;
    const dz = p.position.z - passer.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < (isLob ? 6.5 : 2.2) || dist > maxDist) continue;

    const dot = (dx / dist) * dirX + (dz / dist) * dirZ;
    if (dot < 0.16) continue;

    const laneClear = evaluatePassLaneClearance(passer, p, players);
    // Lobbed passes care less about ground-lane blockage since they travel overhead
    const laneWeight = isLob ? 0.3 : 0.95;
    const distPenalty = Math.abs(dist - idealDist) * 0.016;
    const score = dot * 2.25 + laneClear * laneWeight - distPenalty;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }

  return best;
}

export type InterceptionOutcome = 'none' | 'intercept' | 'block';

/**
 * Evaluates whether a non-GK outfield defender can realistically intercept or block
 * a free-moving opponent pass/shot based on real position, height, facing angle, and ball speed.
 * Eliminates magnetic interceptions when a ball passes fast behind a defender or out of reach.
 */
export function evaluateInterception(
  defender: PlayerState,
  ball: BallState,
): InterceptionOutcome {
  if (ball.ownerId !== null || defender.role === 'GK' || defender.kickCooldown > 0) {
    return 'none';
  }
  if (ball.lastTouchTeam === defender.team) return 'none';

  const dx = ball.position.x - defender.position.x;
  const dz = ball.position.z - defender.position.z;
  const horizDist = Math.hypot(dx, dz);

  const isTackling = defender.actionState === 'tackle';
  const maxReach = isTackling ? 1.22 : 0.86;
  if (horizDist > maxReach || ball.position.y > 1.92) {
    return 'none';
  }

  const ballSpeed = Math.hypot(ball.velocity.x, ball.velocity.z);

  // High aerial ball (1.35m..1.92m): chest/head block deflection, never magnetic foot control
  if (ball.position.y > 1.35) {
    return horizDist <= 0.72 ? 'block' : 'none';
  }

  // Slow/rolling loose ball within physical foot reach -> clean interception
  if (ballSpeed < 10.5) {
    return 'intercept';
  }

  // Fast pass/shot: must be reasonably oriented toward the ball or actively lunging
  const facingX = Math.sin(defender.facingAngle);
  const facingZ = Math.cos(defender.facingAngle);
  const toBallDot = horizDist > 0.01 ? (dx / horizDist) * facingX + (dz / horizDist) * facingZ : 1;

  if (!isTackling && toBallDot < -0.15 && horizDist > 0.56) {
    // Ball whizzed behind defender's back -> cannot magically vacuum-intercept
    return 'none';
  }

  // Very fast shot (> 17.5 m/s) hitting a defender -> physical block/deflection rather than instant glue
  if (ballSpeed > 17.5) {
    return horizDist <= (isTackling ? 1.05 : 0.74) ? 'block' : 'none';
  }

  return 'intercept';
}

export function getRestartPositionForOutOfBounds(
  outType: 'sideline' | 'endline_home' | 'endline_away',
  ballX: number,
  ballZ: number,
  lastTouchTeam: TeamSide | null,
): { x: number; z: number; restartTeam: TeamSide; isCorner: boolean; type: SetPieceType } {
  const clampedX = Math.max(-HALF_LENGTH + 1, Math.min(HALF_LENGTH - 1, ballX));
  const clampedZ = Math.sign(ballZ || 1) * 33.4;

  if (outType === 'sideline') {
    const restartTeam: TeamSide = lastTouchTeam === 'home' ? 'away' : 'home';
    return { x: clampedX, z: clampedZ, restartTeam, isCorner: false, type: 'throw_in' };
  }

  if (outType === 'endline_home') {
    // Ball exited Home endline (-X)
    if (lastTouchTeam === 'home') {
      // Corner for Away
      return {
        x: -HALF_LENGTH + 0.6,
        z: Math.sign(ballZ || 1) * 33.4,
        restartTeam: 'away',
        isCorner: true,
        type: 'corner',
      };
    }
    // Goal kick for Home
    return {
      x: -HALF_LENGTH + GOAL_AREA_LENGTH,
      z: Math.sign(ballZ || 1) * 4.5,
      restartTeam: 'home',
      isCorner: false,
      type: 'goal_kick',
    };
  }

  // Ball exited Away endline (+X)
  if (lastTouchTeam === 'away') {
    // Corner for Home
    return {
      x: HALF_LENGTH - 0.6,
      z: Math.sign(ballZ || 1) * 33.4,
      restartTeam: 'home',
      isCorner: true,
      type: 'corner',
    };
  }
  // Goal kick for Away
  return {
    x: HALF_LENGTH - GOAL_AREA_LENGTH,
    z: Math.sign(ballZ || 1) * 4.5,
    restartTeam: 'away',
    isCorner: false,
    type: 'goal_kick',
  };
}

/**
 * Checks whether a world coordinate lies inside the defending team's regulation 16.5m x 40.32m penalty box.
 */
export function isInsidePenaltyArea(
  x: number,
  z: number,
  defendingTeam: TeamSide,
): boolean {
  const halfBoxW = PENALTY_AREA_WIDTH / 2;
  if (Math.abs(z) > halfBoxW) return false;
  if (defendingTeam === 'home') {
    return x >= -HALF_LENGTH - 0.5 && x <= -HALF_LENGTH + PENALTY_AREA_LENGTH;
  }
  return x <= HALF_LENGTH + 0.5 && x >= HALF_LENGTH - PENALTY_AREA_LENGTH;
}

export type TackleOutcome = 'none' | 'clean' | 'free_kick' | 'penalty';

/**
 * Determines whether an AI defender has a clean, disciplined angle to attempt a slide tackle
 * without lunging recklessly straight through the back of a dribbling ball carrier.
 */
export function isCleanTackleAngle(
  tackler: PlayerState,
  victim: PlayerState,
  ball: BallState,
): boolean {
  const distToBall = Math.hypot(
    ball.position.x - tackler.position.x,
    ball.position.z - tackler.position.z,
  );
  if (distToBall > TACKLE_REACH) return false;

  const dxToVictim = victim.position.x - tackler.position.x;
  const dzToVictim = victim.position.z - tackler.position.z;
  const distToVictim = Math.hypot(dxToVictim, dzToVictim);

  // Do not initiate an AI slide tackle from behind when the carrier's body blocks access to the ball
  if (distToVictim > 0.001) {
    const victimFwdX = Math.sin(victim.facingAngle);
    const victimFwdZ = Math.cos(victim.facingAngle);
    const fromVictimX = -dxToVictim / distToVictim;
    const fromVictimZ = -dzToVictim / distToVictim;
    const behindDot = fromVictimX * victimFwdX + fromVictimZ * victimFwdZ;

    if (behindDot < -0.2 && distToBall > distToVictim * 1.15) {
      return false;
    }
  }

  return true;
}

/**
 * Evaluates an active slide-tackle challenge against an opponent ball carrier:
 * - Returns 'none' if tackler is not executing an active tackle or is out of reach
 * - Clean steal if tackler genuinely reaches the ball
 * - Foul ('penalty' inside defending box, 'free_kick' outside) ONLY on a forceful collision
 *   from behind the ball carrier that clearly misses the ball
 */
export function classifyTackleFoul(
  tackler: PlayerState,
  victim: PlayerState,
  ball: BallState,
): TackleOutcome {
  if (!victim.hasBall || victim.team === tackler.team) return 'none';
  if (tackler.actionState !== 'tackle') return 'none';

  const dxToVictim = victim.position.x - tackler.position.x;
  const dzToVictim = victim.position.z - tackler.position.z;
  const distToVictim = Math.hypot(dxToVictim, dzToVictim);
  const distToBall = Math.hypot(
    ball.position.x - tackler.position.x,
    ball.position.z - tackler.position.z,
  );

  if (distToVictim > TACKLE_REACH && distToBall > TACKLE_REACH) return 'none';

  // Clean ball-first dispossession when tackler reaches the ball cleanly
  if (distToBall <= 1.05 && distToBall <= distToVictim + 0.25) {
    return 'clean';
  }

  // Genuine foul requires ALL of:
  // 1. Direct body impact (<= 0.78m, tighter than 2 * PLAYER_RADIUS = 0.90m)
  // 2. Clearly missed the ball (> 1.15m away and much farther than the carrier's body)
  // 3. Reckless approach from behind the ball carrier (behindDot < -0.35)
  // 4. Forceful lunge closing speed into the carrier (>= 4.5 m/s)
  if (distToVictim <= 0.78 && distToBall > 1.15 && distToBall > distToVictim * 1.45) {
    const victimFwdX = Math.sin(victim.facingAngle);
    const victimFwdZ = Math.cos(victim.facingAngle);
    const invDist = distToVictim > 0.001 ? 1 / distToVictim : 1;
    const fromVictimX = -dxToVictim * invDist;
    const fromVictimZ = -dzToVictim * invDist;
    const behindDot = fromVictimX * victimFwdX + fromVictimZ * victimFwdZ;

    const toVictimX = dxToVictim * invDist;
    const toVictimZ = dzToVictim * invDist;
    const closingSpeed = tackler.velocity.x * toVictimX + tackler.velocity.z * toVictimZ;

    if (behindDot < -0.35 && closingSpeed >= 4.5) {
      return isInsidePenaltyArea(victim.position.x, victim.position.z, tackler.team)
        ? 'penalty'
        : 'free_kick';
    }
  }

  // Clean steal only if the tackler actually reaches the ball within tackle reach
  if (distToBall <= TACKLE_REACH * 0.88) {
    return 'clean';
  }

  return 'none';
}

/**
 * Positions players and ball realistically for all 5 set-piece types:
 * throw_in, goal_kick, corner, free_kick (with defensive wall), and penalty.
 */
export function computeSetPieceSetup(
  type: SetPieceType,
  rawSpot: Vec3,
  restartTeam: TeamSide,
  players: PlayerState[],
  ball: BallState,
): { takerId: string | null; spot: Vec3 } {
  const attackDir = restartTeam === 'home' ? 1 : -1;
  const oppGoalX = attackDir * HALF_LENGTH;
  const ownGoalX = -attackDir * HALF_LENGTH;

  let spot: Vec3 = {
    x: Math.max(-HALF_LENGTH + 0.5, Math.min(HALF_LENGTH - 0.5, rawSpot.x)),
    y: BALL_RADIUS,
    z: Math.max(-HALF_WIDTH + 0.4, Math.min(HALF_WIDTH - 0.4, rawSpot.z)),
  };

  if (type === 'penalty') {
    spot = {
      x: attackDir * (HALF_LENGTH - PENALTY_SPOT_DIST),
      y: BALL_RADIUS,
      z: 0,
    };
  } else if (type === 'throw_in') {
    spot = {
      x: Math.max(-HALF_LENGTH + 1.2, Math.min(HALF_LENGTH - 1.2, rawSpot.x)),
      y: BALL_RADIUS,
      z: Math.sign(rawSpot.z || 1) * (HALF_WIDTH - 0.35),
    };
  }

  ball.position = { ...spot };
  ball.velocity = { x: 0, y: 0, z: 0 };
  ball.spin = { x: 0, y: 0, z: 0 };
  ball.ownerId = null;
  ball.pickupLockTimer = 0.08;
  ball.lastTouchTeam = restartTeam;

  for (const p of players) {
    p.hasBall = false;
    p.velocity.x = 0;
    p.velocity.z = 0;
    p.actionState = 'idle';
    p.actionTimer = 0;
    p.diveDir = 0;
  }

  // Pick appropriate taker (excluding any sent-off players)
  let taker: PlayerState | null = null;
  if (type === 'goal_kick') {
    taker = players.find((p) => p.team === restartTeam && p.role === 'GK' && !p.isSentOff) ?? null;
  } else if (type === 'penalty') {
    taker =
      players.find((p) => p.team === restartTeam && p.slotIndex === 9 && !p.isSentOff) ??
      players.find((p) => p.team === restartTeam && p.role !== 'GK' && !p.isSentOff) ??
      null;
  } else if (type === 'corner') {
    taker =
      players.find(
        (p) => p.team === restartTeam && (p.role === 'LW' || p.role === 'RW') && !p.isSentOff,
      ) ??
      players.find((p) => p.team === restartTeam && p.role !== 'GK' && !p.isSentOff) ??
      null;
  } else {
    let bestDist = Infinity;
    for (const p of players) {
      if (p.team !== restartTeam || p.role === 'GK' || p.isSentOff) continue;
      const d = Math.hypot(p.position.x - spot.x, p.position.z - spot.z);
      if (d < bestDist) {
        bestDist = d;
        taker = p;
      }
    }
  }

  // Position taker behind ball facing target
  if (taker) {
    if (type === 'throw_in') {
      const zSign = spot.z >= 0 ? 1 : -1;
      taker.position.x = spot.x;
      taker.position.z = spot.z + zSign * 0.75;
      taker.facingAngle = Math.atan2(attackDir * 0.25, -zSign);
    } else if (type === 'penalty') {
      taker.position.x = spot.x - attackDir * 1.75;
      taker.position.z = 0;
      taker.facingAngle = Math.atan2(attackDir, 0);
    } else if (type === 'corner') {
      const zSign = spot.z >= 0 ? 1 : -1;
      taker.position.x = spot.x + attackDir * 0.65;
      taker.position.z = spot.z + zSign * 0.65;
      taker.facingAngle = Math.atan2(-attackDir, -zSign);
    } else {
      const toGoalX = oppGoalX - spot.x;
      const toGoalZ = 0 - spot.z;
      const len = Math.hypot(toGoalX, toGoalZ) || 1;
      taker.position.x = spot.x - (toGoalX / len) * 0.9;
      taker.position.z = spot.z - (toGoalZ / len) * 0.9;
      taker.facingAngle = Math.atan2(toGoalX, toGoalZ);
    }
    ball.lastTouchPlayerId = taker.id;
    ball.lastTouchPlayerName = taker.name;
    ball.lastTouchSource = type;
  }

  // Position remaining 21 players tactically by set-piece type
  if (type === 'penalty') {
    const boxEdgeX = oppGoalX - attackDir * (PENALTY_AREA_LENGTH + 1.8);
    let idx = 0;
    for (const p of players) {
      if (taker && p.id === taker.id) continue;
      if (p.team !== restartTeam && p.role === 'GK') {
        p.position.x = oppGoalX - attackDir * 0.45;
        p.position.z = 0;
        p.facingAngle = Math.atan2(-attackDir, 0);
      } else if (p.team === restartTeam && p.role === 'GK') {
        p.position.x = ownGoalX + attackDir * 2.0;
        p.position.z = 0;
        p.facingAngle = Math.atan2(attackDir, 0);
      } else {
        const laneZ = ((idx % 6) - 2.5) * 4.2;
        const depthOffset = p.team === restartTeam ? -1.5 : -3.2;
        p.position.x = boxEdgeX + attackDir * depthOffset;
        p.position.z = laneZ;
        p.facingAngle = Math.atan2(oppGoalX - p.position.x, -p.position.z);
        idx++;
      }
    }
  } else if (type === 'corner') {
    let atkCount = 0;
    let defCount = 0;
    for (const p of players) {
      if (taker && p.id === taker.id) continue;
      if (p.team !== restartTeam && p.role === 'GK') {
        p.position.x = oppGoalX - attackDir * 1.1;
        p.position.z = Math.sign(spot.z || 1) * 0.8;
        p.facingAngle = Math.atan2(-attackDir, spot.z);
      } else if (p.team === restartTeam && p.role === 'GK') {
        p.position.x = ownGoalX + attackDir * 3.5;
        p.position.z = 0;
      } else if (p.team === restartTeam) {
        if (atkCount < 5) {
          p.position.x = oppGoalX - attackDir * (6.5 + (atkCount % 3) * 2.4);
          p.position.z = (atkCount - 2) * 3.1;
          p.facingAngle = Math.atan2(attackDir, 0);
          atkCount++;
        } else {
          p.position.x = oppGoalX - attackDir * 24;
          p.position.z = (atkCount - 6) * 8;
          atkCount++;
        }
      } else {
        if (defCount < 6) {
          p.position.x = oppGoalX - attackDir * (4.8 + (defCount % 3) * 2.2);
          p.position.z = (defCount - 2.5) * 2.7;
          p.facingAngle = Math.atan2(-attackDir, spot.z - p.position.z);
        } else {
          p.position.x = oppGoalX - attackDir * 18;
          p.position.z = (defCount - 6.5) * 7;
        }
        defCount++;
      }
    }
  } else if (type === 'free_kick' || type === 'indirect_free_kick') {
    const distToGoal = Math.hypot(oppGoalX - spot.x, 0 - spot.z);
    const dirX = (oppGoalX - spot.x) / (distToGoal || 1);
    const dirZ = (0 - spot.z) / (distToGoal || 1);
    const perpX = -dirZ;
    const perpZ = dirX;

    // Select up to 3 defending outfielders closest to spot for the 9.15m wall
    const defenders = players
      .filter((p) => p.team !== restartTeam && p.role !== 'GK' && !p.isSentOff)
      .sort(
        (a, b) =>
          Math.hypot(a.position.x - spot.x, a.position.z - spot.z) -
          Math.hypot(b.position.x - spot.x, b.position.z - spot.z),
      );

    const wallCount = type === 'free_kick' && distToGoal < 35 ? 3 : 1;
    const wallIds = new Set(defenders.slice(0, wallCount).map((d) => d.id));
    let wallIndex = 0;

    for (const p of players) {
      if (p.isSentOff || (taker && p.id === taker.id)) continue;
      if (wallIds.has(p.id)) {
        const lateral = (wallIndex - (wallCount - 1) / 2) * 0.95;
        p.position.x = spot.x + dirX * CENTER_CIRCLE_RADIUS + perpX * lateral;
        p.position.z = spot.z + dirZ * CENTER_CIRCLE_RADIUS + perpZ * lateral;
        p.facingAngle = Math.atan2(spot.x - p.position.x, spot.z - p.position.z);
        wallIndex++;
      } else if (p.team !== restartTeam && p.role !== 'GK') {
        const d = Math.hypot(p.position.x - spot.x, p.position.z - spot.z);
        if (d < CENTER_CIRCLE_RADIUS + 0.5) {
          const pushX = (p.position.x - spot.x) / (d || 1);
          const pushZ = (p.position.z - spot.z) / (d || 1);
          p.position.x = spot.x + pushX * (CENTER_CIRCLE_RADIUS + 1.2);
          p.position.z = spot.z + pushZ * (CENTER_CIRCLE_RADIUS + 1.2);
        }
      }
    }
  } else {
    // Throw-in or Goal kick: clear nearby opponents outside minimum legal buffer
    const minBuffer = type === 'goal_kick' ? 13 : 3.5;
    for (const p of players) {
      if (p.isSentOff || (taker && p.id === taker.id)) continue;
      if (p.team !== restartTeam && p.role !== 'GK') {
        const d = Math.hypot(p.position.x - spot.x, p.position.z - spot.z);
        if (d < minBuffer) {
          const nx = d > 0.1 ? (p.position.x - spot.x) / d : -attackDir;
          const nz = d > 0.1 ? (p.position.z - spot.z) / d : -Math.sign(spot.z || 1);
          p.position.x = spot.x + nx * minBuffer;
          p.position.z = Math.max(-HALF_WIDTH + 2, Math.min(HALF_WIDTH - 2, spot.z + nz * minBuffer));
        }
      }
    }

    // On a throw-in, bring two nearest attacking outfield teammates into realistic receiving pockets
    if (type === 'throw_in') {
      const zSign = spot.z >= 0 ? 1 : -1;
      const mates = players
        .filter((p) => p.team === restartTeam && p.role !== 'GK' && !p.isSentOff && p.id !== taker?.id)
        .sort(
          (a, b) =>
            Math.hypot(a.position.x - spot.x, a.position.z - spot.z) -
            Math.hypot(b.position.x - spot.x, b.position.z - spot.z),
        );
      if (mates[0]) {
        mates[0].position.x = Math.max(-HALF_LENGTH + 3, Math.min(HALF_LENGTH - 3, spot.x + attackDir * 5.2));
        mates[0].position.z = spot.z - zSign * 5.8;
        mates[0].facingAngle = Math.atan2(spot.x - mates[0].position.x, spot.z - mates[0].position.z);
      }
      if (mates[1]) {
        mates[1].position.x = Math.max(-HALF_LENGTH + 3, Math.min(HALF_LENGTH - 3, spot.x - attackDir * 4.5));
        mates[1].position.z = spot.z - zSign * 7.8;
        mates[1].facingAngle = Math.atan2(spot.x - mates[1].position.x, spot.z - mates[1].position.z);
      }
    }
  }

  // Keep any sent-off players parked cleanly off the touchline
  for (const p of players) {
    if (p.isSentOff) {
      p.position.x = 0;
      p.position.z = p.team === 'home' ? -HALF_WIDTH - 2.6 : HALF_WIDTH + 2.6;
      p.isControlled = false;
    }
  }

  // Set user controlled player cleanly
  for (const p of players) {
    if (p.team !== 'home') {
      p.isControlled = false;
      continue;
    }
    if (restartTeam === 'home') {
      p.isControlled = taker ? p.id === taker.id : p.slotIndex === 9;
    } else if (type === 'penalty') {
      // User controls Home GK to try saving Away penalty!
      p.isControlled = p.role === 'GK';
    } else {
      p.isControlled = false;
    }
  }

  if (restartTeam === 'away' && type !== 'penalty') {
    const closestHome = selectSwitchTarget(players, ball, 'home', null);
    if (closestHome) closestHome.isControlled = true;
  }

  return { takerId: taker?.id ?? null, spot };
}

export function isMatchLivePhase(phase: MatchPhase): boolean {
  return phase === 'live' || phase === 'kickoff' || phase === 'setpiece';
}
