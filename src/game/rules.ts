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
    if (p.team !== team || p.role === 'GK' || p.id === currentControlledId) continue;
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

/**
 * Computes a lead-pass vector anticipating receiver movement, modulated by passer accuracy.
 */
export function computeLeadPassVector(
  passer: PlayerState,
  receiver: PlayerState,
  isLob: boolean,
): { dirX: number; dirZ: number; speed: number; loft: number } {
  const rawDx = receiver.position.x - passer.position.x;
  const rawDz = receiver.position.z - passer.position.z;
  const rawDist = Math.hypot(rawDx, rawDz);

  const estSpeed = isLob
    ? Math.min(25, Math.max(15, rawDist * 0.92))
    : Math.min(22, Math.max(11, rawDist * 0.98));

  const travelTime = Math.min(1.1, rawDist / estSpeed);
  const leadX = receiver.position.x + receiver.velocity.x * travelTime * 0.58;
  const leadZ = receiver.position.z + receiver.velocity.z * travelTime * 0.58;

  return {
    dirX: leadX - passer.position.x,
    dirZ: leadZ - passer.position.z,
    speed: estSpeed,
    loft: isLob ? Math.min(8.5, 4.8 + rawDist * 0.1) : 0.55,
  };
}

/**
 * Finds the best teammate to pass toward given an aim direction, factoring in lane clearance.
 */
export function findBestPassTarget(
  passer: PlayerState,
  players: PlayerState[],
  aimX: number,
  aimZ: number,
): PlayerState | null {
  const aimLen = Math.hypot(aimX, aimZ);
  const dirX = aimLen > 0.15 ? aimX / aimLen : Math.sin(passer.facingAngle);
  const dirZ = aimLen > 0.15 ? aimZ / aimLen : Math.cos(passer.facingAngle);

  let best: PlayerState | null = null;
  let bestScore = -Infinity;

  for (const p of players) {
    if (p.team !== passer.team || p.id === passer.id) continue;
    const dx = p.position.x - passer.position.x;
    const dz = p.position.z - passer.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 2.2 || dist > 48) continue;

    const dot = (dx / dist) * dirX + (dz / dist) * dirZ;
    if (dot < 0.12) continue;

    const laneClear = evaluatePassLaneClearance(passer, p, players);
    const distPenalty = Math.abs(dist - 16) * 0.015;
    const score = dot * 2.1 + laneClear * 0.85 - distPenalty;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }

  return best;
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
 * Evaluates a slide-tackle challenge against an opponent ball carrier:
 * - Clean steal if tackler reaches ball closer/sooner than carrier body
 * - Foul ('penalty' inside defending box, 'free_kick' outside) if heavy late collision without winning ball
 */
export function classifyTackleFoul(
  tackler: PlayerState,
  victim: PlayerState,
  ball: BallState,
): TackleOutcome {
  if (!victim.hasBall || victim.team === tackler.team) return 'none';

  const distToVictim = Math.hypot(
    victim.position.x - tackler.position.x,
    victim.position.z - tackler.position.z,
  );
  if (distToVictim > TACKLE_REACH) return 'none';

  const distToBall = Math.hypot(
    ball.position.x - tackler.position.x,
    ball.position.z - tackler.position.z,
  );

  // Heavy late body contact from behind/side without reaching the ball cleanly
  if (distToVictim < 0.98 && distToBall > distToVictim * 1.15) {
    return isInsidePenaltyArea(victim.position.x, victim.position.z, tackler.team)
      ? 'penalty'
      : 'free_kick';
  }

  return 'clean';
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

  // Pick appropriate taker
  let taker: PlayerState | null = null;
  if (type === 'goal_kick') {
    taker = players.find((p) => p.team === restartTeam && p.role === 'GK') ?? null;
  } else if (type === 'penalty') {
    taker =
      players.find((p) => p.team === restartTeam && p.slotIndex === 9) ??
      players.find((p) => p.team === restartTeam && p.role !== 'GK') ??
      null;
  } else if (type === 'corner') {
    taker =
      players.find((p) => p.team === restartTeam && (p.role === 'LW' || p.role === 'RW')) ??
      players.find((p) => p.team === restartTeam && p.role !== 'GK') ??
      null;
  } else {
    let bestDist = Infinity;
    for (const p of players) {
      if (p.team !== restartTeam || p.role === 'GK') continue;
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
    ball.lastTouchPlayerName = taker.name;
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
  } else if (type === 'free_kick') {
    const distToGoal = Math.hypot(oppGoalX - spot.x, 0 - spot.z);
    const dirX = (oppGoalX - spot.x) / (distToGoal || 1);
    const dirZ = (0 - spot.z) / (distToGoal || 1);
    const perpX = -dirZ;
    const perpZ = dirX;

    // Select up to 3 defending outfielders closest to spot for the 9.15m wall
    const defenders = players
      .filter((p) => p.team !== restartTeam && p.role !== 'GK')
      .sort(
        (a, b) =>
          Math.hypot(a.position.x - spot.x, a.position.z - spot.z) -
          Math.hypot(b.position.x - spot.x, b.position.z - spot.z),
      );

    const wallCount = distToGoal < 35 ? 3 : 1;
    const wallIds = new Set(defenders.slice(0, wallCount).map((d) => d.id));
    let wallIndex = 0;

    for (const p of players) {
      if (taker && p.id === taker.id) continue;
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
      if (taker && p.id === taker.id) continue;
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
