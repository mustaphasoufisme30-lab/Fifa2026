import { GOAL_HALF_WIDTH, HALF_LENGTH, HALF_WIDTH, TACKLE_REACH } from '../core/constants';
import { FORMATIONS, getFormationTactics, getFormationWorldPosition } from '../formations/formations';
import {
  BallState,
  FormationId,
  PlayerState,
  SetPieceType,
  TacticalMentality,
  TeamSide,
} from '../core/types';
import { applyBallKick, predictBallCrossingX } from '../physics/pitchPhysics';
import {
  computeLeadPassVector,
  evaluatePassLaneClearance,
  findBestPassTarget,
} from '../game/rules';

export interface AiSteeringOutput {
  desiredX: number;
  desiredZ: number;
  sprint: boolean;
  shouldPass: boolean;
  shouldShoot: boolean;
  shouldTackle: boolean;
  shouldDive: boolean;
  diveDir: -1 | 0 | 1;
  passTarget: PlayerState | null;
}

export interface TeamDefensiveAssignments {
  presserId: string | null;
  coverId: string | null;
}

/**
 * Assigns primary presser (closest to ball) and cover shadow defender (2nd closest).
 */
export function computeDefensiveAssignments(
  players: PlayerState[],
  ball: BallState,
  team: TeamSide,
): TeamDefensiveAssignments {
  let presserId: string | null = null;
  let coverId: string | null = null;
  let best1 = Infinity;
  let best2 = Infinity;

  for (const p of players) {
    if (p.team !== team || p.role === 'GK' || p.isControlled) continue;
    const d = Math.hypot(p.position.x - ball.position.x, p.position.z - ball.position.z);
    if (d < best1) {
      best2 = best1;
      coverId = presserId;
      best1 = d;
      presserId = p.id;
    } else if (d < best2) {
      best2 = d;
      coverId = p.id;
    }
  }

  return { presserId, coverId };
}

/**
 * Kept for backwards compatibility with existing callers.
 */
export function findClosestPresserId(
  players: PlayerState[],
  ball: BallState,
  team: TeamSide,
): string | null {
  return computeDefensiveAssignments(players, ball, team).presserId;
}

/**
 * Computes tactical Stage 2/3 steering and decisions for AI-controlled players:
 * - Goalkeeper: angle cutting, shot prediction + diving saves, sweeper rush, distribution
 * - Offensive AI: forward runs in behind, width occupation, support triangles, lane-checked passes, corner-aimed shots
 * - Defensive AI: pressing + tackle attempts, goal-side cover shadow, zonal/man marking
 * - Tactical Mentality & Formation modifiers: shifts line depth, press urgency, and attack runs
 */
export function computeAiSteering(
  player: PlayerState,
  allPlayers: PlayerState[],
  ball: BallState,
  formationId: FormationId,
  closestPresserId: string | null,
  coverDefenderId: string | null = null,
  mentality: TacticalMentality = 'balanced',
): AiSteeringOutput {
  const formation = FORMATIONS[formationId] ?? FORMATIONS['4-3-3'];
  const tactics = getFormationTactics(formationId, mentality);
  const slot = formation.slots[player.slotIndex] ?? formation.slots[0];
  const anchor = getFormationWorldPosition(
    slot,
    player.team,
    ball.position.x,
    ball.position.z,
    false,
    formationId,
    mentality,
  );

  const attackDir = player.team === 'home' ? 1 : -1;
  const oppGoalX = attackDir * HALF_LENGTH;
  const ownGoalX = -attackDir * HALF_LENGTH;

  // =========================================================================
  // 1. GOALKEEPER AI (Angle cutting, Shot-anticipation dives, Sweeper, Clear)
  // =========================================================================
  if (player.role === 'GK') {
    const gkBaseX = -attackDir * (HALF_LENGTH - 1.6);

    if (player.hasBall) {
      if (player.gkHoldTimer > 0) {
        return {
          desiredX: gkBaseX,
          desiredZ: 0,
          sprint: false,
          shouldPass: false,
          shouldShoot: false,
          shouldTackle: false,
          shouldDive: false,
          diveDir: 0,
          passTarget: null,
        };
      }
      const wideSide = player.position.z >= 0 ? -0.45 : 0.45;
      const target = findBestPassTarget(player, allPlayers, attackDir, wideSide);
      return {
        desiredX: gkBaseX,
        desiredZ: 0,
        sprint: false,
        shouldPass: true,
        shouldShoot: false,
        shouldTackle: false,
        shouldDive: false,
        diveDir: 0,
        passTarget: target,
      };
    }

    const shotCross = predictBallCrossingX(ball, gkBaseX);
    const ballSpeed = Math.hypot(ball.velocity.x, ball.velocity.z);
    if (
      shotCross &&
      shotCross.time < 0.72 &&
      ballSpeed > 11 &&
      Math.abs(shotCross.z) <= GOAL_HALF_WIDTH + 1.1 &&
      shotCross.y <= 2.6
    ) {
      const zDiff = shotCross.z - player.position.z;
      const shouldDive =
        player.diveCooldown <= 0 &&
        Math.abs(zDiff) > 0.7 &&
        shotCross.time < 0.42;

      return {
        desiredX: gkBaseX,
        desiredZ: Math.max(-GOAL_HALF_WIDTH, Math.min(GOAL_HALF_WIDTH, shotCross.z)),
        sprint: true,
        shouldPass: false,
        shouldShoot: false,
        shouldTackle: false,
        shouldDive,
        diveDir: shouldDive ? (zDiff >= 0 ? 1 : -1) : 0,
        passTarget: null,
      };
    }

    const distToBall = Math.hypot(ball.position.x - player.position.x, ball.position.z - player.position.z);
    const ballInOwnBox = Math.abs(ball.position.x - ownGoalX) < 13.5 && Math.abs(ball.position.z) < 13;
    if (ball.ownerId === null && ballInOwnBox && distToBall < 11) {
      return {
        desiredX: ball.position.x,
        desiredZ: ball.position.z,
        sprint: true,
        shouldPass: false,
        shouldShoot: false,
        shouldTackle: false,
        shouldDive: false,
        diveDir: 0,
        passTarget: null,
      };
    }

    const distBallFromGoal = Math.hypot(ball.position.x - ownGoalX, ball.position.z);
    const stepOut = Math.min(3.8, Math.max(1.2, 4.4 - distBallFromGoal * 0.055));
    const idealX = ownGoalX + attackDir * stepOut;
    const idealZ = Math.max(
      -GOAL_HALF_WIDTH * 0.82,
      Math.min(GOAL_HALF_WIDTH * 0.82, ball.position.z * 0.38),
    );

    return {
      desiredX: idealX,
      desiredZ: idealZ,
      sprint: distBallFromGoal < 22,
      shouldPass: false,
      shouldShoot: false,
      shouldTackle: false,
      shouldDive: false,
      diveDir: 0,
      passTarget: null,
    };
  }

  // =========================================================================
  // 2. AI BALL CARRIER (Shoot corners, lane-checked pass, evasion dribble)
  // =========================================================================
  if (player.hasBall) {
    const distToOppGoal = Math.hypot(oppGoalX - player.position.x, 0 - player.position.z);

    if (distToOppGoal < 26 && Math.abs(player.position.z) < 20) {
      return {
        desiredX: oppGoalX,
        desiredZ: 0,
        sprint: true,
        shouldPass: false,
        shouldShoot: true,
        shouldTackle: false,
        shouldDive: false,
        diveDir: 0,
        passTarget: null,
      };
    }

    let nearestOppDist = Infinity;
    let nearestOpp: PlayerState | null = null;
    for (const other of allPlayers) {
      if (other.team === player.team) continue;
      const d = Math.hypot(other.position.x - player.position.x, other.position.z - player.position.z);
      if (d < nearestOppDist) {
        nearestOppDist = d;
        nearestOpp = other;
      }
    }

    let bestTarget: PlayerState | null = null;
    let bestPassScore = -Infinity;
    for (const mate of allPlayers) {
      if (mate.team !== player.team || mate.id === player.id || mate.role === 'GK') continue;
      const dx = mate.position.x - player.position.x;
      const dz = mate.position.z - player.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 4 || dist > 38) continue;

      const forwardProgress = dx * attackDir;
      const laneClear = evaluatePassLaneClearance(player, mate, allPlayers);
      if (laneClear < 0.25) continue;

      const score = forwardProgress * 0.14 + laneClear * 2.0 - Math.abs(dist - 16) * 0.03;
      if (score > bestPassScore) {
        bestPassScore = score;
        bestTarget = mate;
      }
    }

    if (
      bestTarget &&
      (nearestOppDist < 5.2 ||
        ((bestTarget.position.x - player.position.x) * attackDir > 8 && bestPassScore > 2.2))
    ) {
      return {
        desiredX: bestTarget.position.x,
        desiredZ: bestTarget.position.z,
        sprint: false,
        shouldPass: true,
        shouldShoot: false,
        shouldTackle: false,
        shouldDive: false,
        diveDir: 0,
        passTarget: bestTarget,
      };
    }

    let targetZ = player.position.z * 0.72;
    if (nearestOpp && nearestOppDist < 7.5) {
      const awayZ = player.position.z - nearestOpp.position.z;
      targetZ = player.position.z + (awayZ >= 0 ? 4.5 : -4.5);
      targetZ = Math.max(-HALF_WIDTH + 3, Math.min(HALF_WIDTH - 3, targetZ));
    }

    return {
      desiredX: oppGoalX,
      desiredZ: targetZ,
      sprint: distToOppGoal > 16 && nearestOppDist > 4.2,
      shouldPass: false,
      shouldShoot: false,
      shouldTackle: false,
      shouldDive: false,
      diveDir: 0,
      passTarget: null,
    };
  }

  // =========================================================================
  // 3. OFF-BALL AI (Offensive Runs & Support vs Defensive Press/Cover/Mark)
  // =========================================================================
  const owner = ball.ownerId ? allPlayers.find((p) => p.id === ball.ownerId) : null;
  const teamHasBall = owner?.team === player.team;

  if (teamHasBall && owner) {
    const isAttacker =
      player.role === 'ST' ||
      player.role === 'LW' ||
      player.role === 'RW' ||
      player.role === 'CAM';

    if (isAttacker) {
      const pushDist = 14 + tactics.attackPushMeters;
      const runDepth = Math.min(
        HALF_LENGTH - 5.5,
        Math.max(anchor.x, ball.position.x + attackDir * pushDist),
      );
      const runWidth =
        player.role === 'LW'
          ? -HALF_WIDTH * 0.58 * tactics.widthScale * attackDir
          : player.role === 'RW'
            ? HALF_WIDTH * 0.58 * tactics.widthScale * attackDir
            : anchor.z;

      const clampedX = Math.max(-HALF_LENGTH + 5, Math.min(HALF_LENGTH - 5, runDepth));
      return {
        desiredX: clampedX,
        desiredZ: Math.max(-HALF_WIDTH + 2.5, Math.min(HALF_WIDTH - 2.5, runWidth)),
        sprint: Math.abs(clampedX - player.position.x) > 5,
        shouldPass: false,
        shouldShoot: false,
        shouldTackle: false,
        shouldDive: false,
        diveDir: 0,
        passTarget: null,
      };
    }

    const distToOwner = Math.hypot(owner.position.x - player.position.x, owner.position.z - player.position.z);
    if ((player.role === 'CM' || player.role === 'CDM') && distToOwner < 26) {
      const supportX = Math.max(
        -HALF_LENGTH + 6,
        Math.min(
          HALF_LENGTH - 6,
          owner.position.x + attackDir * ((player.role === 'CM' ? 4 : -6) + tactics.attackPushMeters * 0.4),
        ),
      );
      const laneOffset = player.position.z >= owner.position.z ? 9.5 : -9.5;
      const supportZ = Math.max(-HALF_WIDTH + 3, Math.min(HALF_WIDTH - 3, owner.position.z + laneOffset));
      return {
        desiredX: supportX,
        desiredZ: supportZ,
        sprint: false,
        shouldPass: false,
        shouldShoot: false,
        shouldTackle: false,
        shouldDive: false,
        diveDir: 0,
        passTarget: null,
      };
    }

    return {
      desiredX: Math.max(
        -HALF_LENGTH + 4,
        Math.min(HALF_LENGTH - 4, anchor.x + attackDir * (6.5 + tactics.attackPushMeters * 0.5)),
      ),
      desiredZ: anchor.z,
      sprint: false,
      shouldPass: false,
      shouldShoot: false,
      shouldTackle: false,
      shouldDive: false,
      diveDir: 0,
      passTarget: null,
    };
  }

  if (player.id === closestPresserId) {
    const targetX = ball.position.x + ball.velocity.x * 0.16;
    const targetZ = ball.position.z + ball.velocity.z * 0.16;
    const distToBall = Math.hypot(ball.position.x - player.position.x, ball.position.z - player.position.z);
    const tackleTriggerRange = TACKLE_REACH * (0.94 + tactics.pressIntensity * 0.1);

    const canAttemptTackle =
      owner != null &&
      owner.team !== player.team &&
      distToBall < tackleTriggerRange &&
      player.tackleCooldown <= 0;

    return {
      desiredX: Math.max(-HALF_LENGTH + 2, Math.min(HALF_LENGTH - 2, targetX)),
      desiredZ: Math.max(-HALF_WIDTH + 2, Math.min(HALF_WIDTH - 2, targetZ)),
      sprint: tactics.pressIntensity >= 0.85 || distToBall < 14,
      shouldPass: false,
      shouldShoot: false,
      shouldTackle: canAttemptTackle,
      shouldDive: false,
      diveDir: 0,
      passTarget: null,
    };
  }

  if (coverDefenderId && player.id === coverDefenderId) {
    const toGoalX = ownGoalX - ball.position.x;
    const toGoalZ = 0 - ball.position.z;
    const toGoalLen = Math.hypot(toGoalX, toGoalZ) || 1;
    const coverDist = tactics.pressIntensity > 1.1 ? 5.2 : 6.6;
    const coverX = ball.position.x + (toGoalX / toGoalLen) * coverDist;
    const coverZ = ball.position.z + (toGoalZ / toGoalLen) * coverDist;

    return {
      desiredX: Math.max(-HALF_LENGTH + 4, Math.min(HALF_LENGTH - 4, coverX)),
      desiredZ: Math.max(-HALF_WIDTH + 3, Math.min(HALF_WIDTH - 3, coverZ)),
      sprint: Math.hypot(coverX - player.position.x, coverZ - player.position.z) > 6,
      shouldPass: false,
      shouldShoot: false,
      shouldTackle: false,
      shouldDive: false,
      diveDir: 0,
      passTarget: null,
    };
  }

  const isDefender =
    player.role === 'CB' ||
    player.role === 'LB' ||
    player.role === 'RB' ||
    player.role === 'CDM';

  if (isDefender) {
    let markTarget: PlayerState | null = null;
    let bestMarkDist = 14.5;
    for (const opp of allPlayers) {
      if (opp.team === player.team || opp.role === 'GK') continue;
      const d = Math.hypot(opp.position.x - anchor.x, opp.position.z - anchor.z);
      if (d < bestMarkDist) {
        bestMarkDist = d;
        markTarget = opp;
      }
    }

    if (markTarget) {
      const markX = markTarget.position.x - attackDir * 2.1;
      const markZ = markTarget.position.z * 0.92;
      return {
        desiredX: Math.max(-HALF_LENGTH + 3.5, Math.min(HALF_LENGTH - 3.5, markX)),
        desiredZ: Math.max(-HALF_WIDTH + 2.5, Math.min(HALF_WIDTH - 2.5, markZ)),
        sprint: Math.hypot(markX - player.position.x, markZ - player.position.z) > 5,
        shouldPass: false,
        shouldShoot: false,
        shouldTackle: false,
        shouldDive: false,
        diveDir: 0,
        passTarget: null,
      };
    }
  }

  return {
    desiredX: anchor.x,
    desiredZ: anchor.z,
    sprint: false,
    shouldPass: false,
    shouldShoot: false,
    shouldTackle: false,
    shouldDive: false,
    diveDir: 0,
    passTarget: null,
  };
}

export function executeAiBallAction(
  player: PlayerState,
  ball: BallState,
  steering: AiSteeringOutput,
  allPlayers: PlayerState[] = [],
  onSound?: (kind: 'kick' | 'pass') => void,
): void {
  const attackDir = player.team === 'home' ? 1 : -1;

  if (steering.shouldShoot) {
    const oppGk = allPlayers.find((p) => p.team !== player.team && p.role === 'GK');
    const gkZ = oppGk?.position.z ?? 0;
    const cornerSign = gkZ >= 0 ? -1 : 1;
    const targetZ = cornerSign * (GOAL_HALF_WIDTH * 0.65) + (Math.random() - 0.5) * 0.9;
    const dirX = attackDir * HALF_LENGTH - player.position.x;
    const dirZ = targetZ - player.position.z;
    const sideSpin = cornerSign * 1.4;
    applyBallKick(ball, dirX, dirZ, player.attributes.shotPower * 0.96, 4.1, player, sideSpin);
    onSound?.('kick');
    return;
  }

  if (steering.shouldPass && steering.passTarget) {
    const dist = Math.hypot(
      steering.passTarget.position.x - player.position.x,
      steering.passTarget.position.z - player.position.z,
    );
    const isLob = dist > 23;
    const lead = computeLeadPassVector(player, steering.passTarget, isLob);
    const inaccuracy = ((100 - player.attributes.passing) / 100) * 0.08;
    const spreadX = (Math.random() - 0.5) * inaccuracy * dist;
    const spreadZ = (Math.random() - 0.5) * inaccuracy * dist;

    applyBallKick(
      ball,
      lead.dirX + spreadX,
      lead.dirZ + spreadZ,
      lead.speed,
      lead.loft,
      player,
    );
    onSound?.('pass');
  } else if (steering.shouldPass && player.role === 'GK') {
    applyBallKick(ball, attackDir, (Math.random() - 0.5) * 0.5, 22, 6.4, player);
    onSound?.('kick');
  }
}

export interface SetPieceKickDecision {
  dirX: number;
  dirZ: number;
  speed: number;
  loft: number;
  sideSpin: number;
  isShot: boolean;
}

/**
 * Computes realistic AI set-piece execution for penalty, free_kick, corner, goal_kick, and throw_in.
 */
export function computeSetPieceAiDecision(
  taker: PlayerState,
  type: SetPieceType,
  ball: BallState,
  allPlayers: PlayerState[],
): SetPieceKickDecision {
  const attackDir = taker.team === 'home' ? 1 : -1;
  const oppGoalX = attackDir * HALF_LENGTH;

  if (type === 'penalty') {
    const oppGk = allPlayers.find((p) => p.team !== taker.team && p.role === 'GK');
    const cornerSign = (oppGk?.position.z ?? 0) >= 0 ? -1 : 1;
    const targetZ = cornerSign * (GOAL_HALF_WIDTH * 0.72);
    return {
      dirX: oppGoalX - ball.position.x,
      dirZ: targetZ - ball.position.z,
      speed: taker.attributes.shotPower * 1.04,
      loft: 3.1,
      sideSpin: cornerSign * 1.1,
      isShot: true,
    };
  }

  if (type === 'free_kick') {
    const distToGoal = Math.hypot(oppGoalX - ball.position.x, ball.position.z);
    if (distToGoal < 30) {
      const cornerSign = ball.position.z >= 0 ? -1 : 1;
      const targetZ = cornerSign * (GOAL_HALF_WIDTH * 0.65);
      return {
        dirX: oppGoalX - ball.position.x,
        dirZ: targetZ - ball.position.z,
        speed: taker.attributes.shotPower * 0.96,
        loft: 5.4,
        sideSpin: cornerSign * 2.1,
        isShot: true,
      };
    }
    const target = findBestPassTarget(taker, allPlayers, attackDir, 0);
    if (target) {
      const lead = computeLeadPassVector(taker, target, true);
      return {
        dirX: lead.dirX,
        dirZ: lead.dirZ,
        speed: lead.speed,
        loft: lead.loft,
        sideSpin: 0,
        isShot: false,
      };
    }
  }

  if (type === 'corner') {
    const boxTargetX = oppGoalX - attackDir * 9.5;
    const boxTargetZ = -Math.sign(ball.position.z || 1) * 2.2;
    return {
      dirX: boxTargetX - ball.position.x,
      dirZ: boxTargetZ - ball.position.z,
      speed: 19.5,
      loft: 7.4,
      sideSpin: Math.sign(ball.position.z || 1) * 1.6,
      isShot: false,
    };
  }

  if (type === 'goal_kick') {
    const target = findBestPassTarget(taker, allPlayers, attackDir, (Math.random() - 0.5) * 0.6);
    if (target) {
      const lead = computeLeadPassVector(taker, target, true);
      return {
        dirX: lead.dirX,
        dirZ: lead.dirZ,
        speed: Math.max(18, lead.speed),
        loft: 6.2,
        sideSpin: 0,
        isShot: false,
      };
    }
    return {
      dirX: attackDir,
      dirZ: (Math.random() - 0.5) * 0.3,
      speed: 23,
      loft: 6.8,
      sideSpin: 0,
      isShot: false,
    };
  }

  // Throw-in
  const inboundsDirZ = -Math.sign(ball.position.z || 1);
  const target = findBestPassTarget(taker, allPlayers, attackDir * 0.5, inboundsDirZ);
  if (target) {
    const lead = computeLeadPassVector(taker, target, false);
    return {
      dirX: lead.dirX,
      dirZ: lead.dirZ,
      speed: Math.min(16, Math.max(11, lead.speed)),
      loft: 3.2,
      sideSpin: 0,
      isShot: false,
    };
  }

  return {
    dirX: attackDir * 0.5,
    dirZ: inboundsDirZ,
    speed: 13,
    loft: 3.4,
    sideSpin: 0,
    isShot: false,
  };
}
