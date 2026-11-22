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
import { applyBallKick, computeContextualShot, predictBallCrossingX } from '../physics/pitchPhysics';
import {
  computeLeadPassVector,
  evaluatePassLaneClearance,
  findBestPassTarget,
  isCleanTackleAngle,
} from '../game/rules';

export type TeamTransitionMode = 'none' | 'attack' | 'defend';

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
  preferLob?: boolean;
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

  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (p.team !== team || p.role === 'GK' || p.isControlled || p.isSentOff) continue;
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
 * Computes tactical steering and decisions for AI-controlled players:
 * - Goalkeeper: angle cutting, shot anticipation, disciplined sweeper rush, safe open-lane distribution
 * - Offensive AI: passing triangles, forward runs into space, anti-clumping width, lane-checked short/long/lob passes
 * - Defensive AI: pressing, goal-side cover shadow + passing-lane screening, attacker tracking, transition recovery
 */
export function computeAiSteering(
  player: PlayerState,
  allPlayers: PlayerState[],
  ball: BallState,
  formationId: FormationId,
  closestPresserId: string | null,
  coverDefenderId: string | null = null,
  mentality: TacticalMentality = 'balanced',
  transitionMode: TeamTransitionMode = 'none',
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
  // 1. GOALKEEPER AI (Angle cutting, Shot-anticipation dives, Sweeper, Distribution)
  // =========================================================================
  if (player.role === 'GK') {
    const gkBaseX = -attackDir * (HALF_LENGTH - 1.55);

    if (player.hasBall) {
      if (player.gkHoldTimer > 0) {
        return {
          desiredX: gkBaseX,
          desiredZ: Math.max(-2.5, Math.min(2.5, player.position.z * 0.6)),
          sprint: false,
          shouldPass: false,
          shouldShoot: false,
          shouldTackle: false,
          shouldDive: false,
          diveDir: 0,
          passTarget: null,
        };
      }

      // Scan for the safest open teammate (prefer short open outlet; loft upfield if pressed)
      let bestOutlet: PlayerState | null = null;
      let bestOutletScore = -Infinity;
      for (let i = 0; i < allPlayers.length; i++) {
        const mate = allPlayers[i];
        if (mate.team !== player.team || mate.id === player.id) continue;
        const dx = (mate.position.x - player.position.x) * attackDir;
        if (dx < 5 || dx > 48) continue;
        const dist = Math.hypot(mate.position.x - player.position.x, mate.position.z - player.position.z);
        const laneClear = evaluatePassLaneClearance(player, mate, allPlayers);
        if (laneClear < 0.3) continue;
        // Prefer wide fullbacks/midfielders with clear lanes
        const wideBonus = Math.abs(mate.position.z) > 10 ? 0.55 : 0;
        const score = laneClear * 2.4 + wideBonus - Math.abs(dist - 20) * 0.025;
        if (score > bestOutletScore) {
          bestOutletScore = score;
          bestOutlet = mate;
        }
      }

      const outletDist = bestOutlet
        ? Math.hypot(bestOutlet.position.x - player.position.x, bestOutlet.position.z - player.position.z)
        : 32;

      return {
        desiredX: gkBaseX,
        desiredZ: 0,
        sprint: false,
        shouldPass: true,
        shouldShoot: false,
        shouldTackle: false,
        shouldDive: false,
        diveDir: 0,
        passTarget: bestOutlet,
        preferLob: !bestOutlet || outletDist > 22,
      };
    }

    const shotCross = predictBallCrossingX(ball, gkBaseX);
    const ballSpeed = Math.hypot(ball.velocity.x, ball.velocity.z);
    if (
      shotCross &&
      shotCross.time < 0.76 &&
      ballSpeed > 10.5 &&
      Math.abs(shotCross.z) <= GOAL_HALF_WIDTH + 1.15 &&
      shotCross.y <= 2.65
    ) {
      const zDiff = shotCross.z - player.position.z;
      const shouldDive =
        player.diveCooldown <= 0 &&
        Math.abs(zDiff) > 0.65 &&
        shotCross.time < 0.44;

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

    // Disciplined sweeper rush: only come out if loose ball is genuinely inside box and GK can reach it safely
    const distToBall = Math.hypot(ball.position.x - player.position.x, ball.position.z - player.position.z);
    const ballInOwnBox = Math.abs(ball.position.x - ownGoalX) < 13.5 && Math.abs(ball.position.z) < 13.5;
    if (ball.ownerId === null && ballInOwnBox && distToBall < 11 && ballSpeed < 12) {
      let nearestOppToBall = Infinity;
      for (let i = 0; i < allPlayers.length; i++) {
        const opp = allPlayers[i];
        if (opp.team === player.team) continue;
        const d = Math.hypot(opp.position.x - ball.position.x, opp.position.z - ball.position.z);
        if (d < nearestOppToBall) nearestOppToBall = d;
      }
      if (distToBall <= nearestOppToBall + 1.8) {
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
    }

    // Angle-cutting positioning between ball and center of goal
    const distBallFromGoal = Math.hypot(ball.position.x - ownGoalX, ball.position.z);
    const stepOut = Math.min(4.2, Math.max(1.25, 4.7 - distBallFromGoal * 0.06));
    const idealX = ownGoalX + attackDir * stepOut;
    const idealZ = Math.max(
      -GOAL_HALF_WIDTH * 0.84,
      Math.min(GOAL_HALF_WIDTH * 0.84, ball.position.z * (distBallFromGoal < 18 ? 0.44 : 0.34)),
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
  // 2. AI BALL CARRIER (Shoot corners, lane-checked short/long/lob pass, evasion dribble)
  // =========================================================================
  if (player.hasBall) {
    const distToOppGoal = Math.hypot(oppGoalX - player.position.x, 0 - player.position.z);

    if (distToOppGoal < 25 && Math.abs(player.position.z) < 19) {
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
    for (let i = 0; i < allPlayers.length; i++) {
      const other = allPlayers[i];
      if (other.team === player.team) continue;
      const d = Math.hypot(other.position.x - player.position.x, other.position.z - player.position.z);
      if (d < nearestOppDist) {
        nearestOppDist = d;
        nearestOpp = other;
      }
    }

    let bestTarget: PlayerState | null = null;
    let bestPassScore = -Infinity;
    let bestTargetLaneClear = 1;
    for (let i = 0; i < allPlayers.length; i++) {
      const mate = allPlayers[i];
      if (mate.team !== player.team || mate.id === player.id || mate.role === 'GK') continue;
      const dx = mate.position.x - player.position.x;
      const dz = mate.position.z - player.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 5 || dist > 40) continue;

      const forwardProgress = dx * attackDir;
      const laneClear = evaluatePassLaneClearance(player, mate, allPlayers);
      // Allow aerial lob over a blocked ground lane if runner is well ahead
      const canLobOver = dist > 16 && forwardProgress > 8 && laneClear >= 0.08;
      if (laneClear < 0.28 && !canLobOver) continue;

      const counterBonus = transitionMode === 'attack' && forwardProgress > 8 ? 0.85 : 0;
      const score =
        forwardProgress * 0.14 +
        laneClear * 2.1 +
        counterBonus -
        Math.abs(dist - 15) * 0.028;
      if (score > bestPassScore) {
        bestPassScore = score;
        bestTarget = mate;
        bestTargetLaneClear = laneClear;
      }
    }

    if (
      bestTarget &&
      (nearestOppDist < 5.0 ||
        ((bestTarget.position.x - player.position.x) * attackDir > 7.5 && bestPassScore > 2.15))
    ) {
      const targetDist = Math.hypot(
        bestTarget.position.x - player.position.x,
        bestTarget.position.z - player.position.z,
      );
      const preferLob = targetDist > 23 || (targetDist > 16 && bestTargetLaneClear < 0.38);
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
        preferLob,
      };
    }

    // Dribble away from closing defender toward open attacking lane
    let targetZ = player.position.z * 0.74;
    if (nearestOpp && nearestOppDist < 7.5) {
      const awayZ = player.position.z - nearestOpp.position.z;
      targetZ = player.position.z + (awayZ >= 0 ? 4.8 : -4.8);
      targetZ = Math.max(-HALF_WIDTH + 3, Math.min(HALF_WIDTH - 3, targetZ));
    }

    return {
      desiredX: oppGoalX,
      desiredZ: targetZ,
      sprint: distToOppGoal > 15 && nearestOppDist > 4.0,
      shouldPass: false,
      shouldShoot: false,
      shouldTackle: false,
      shouldDive: false,
      diveDir: 0,
      passTarget: null,
    };
  }

  // =========================================================================
  // 3. OFF-BALL AI (Offensive Runs & Passing Support vs Defensive Press/Cover/Lane Screening)
  // =========================================================================
  let owner: PlayerState | null = null;
  if (ball.ownerId) {
    for (let i = 0; i < allPlayers.length; i++) {
      if (allPlayers[i].id === ball.ownerId) {
        owner = allPlayers[i];
        break;
      }
    }
  }
  const teamHasBall = owner?.team === player.team;

  if (teamHasBall && owner) {
    const isAttacker =
      player.role === 'ST' ||
      player.role === 'LW' ||
      player.role === 'RW' ||
      player.role === 'CAM';

    const distToOwner = Math.hypot(
      owner.position.x - player.position.x,
      owner.position.z - player.position.z,
    );

    if (isAttacker) {
      const counterPush = transitionMode === 'attack' ? 5.5 : 0;
      const pushDist = 13.5 + tactics.attackPushMeters + counterPush;

      // Offside-line awareness: keep off-ball AI runs hovering smartly near the 2nd-last defender
      const oppXs: number[] = [];
      for (let i = 0; i < allPlayers.length; i++) {
        const opp = allPlayers[i];
        if (opp.team !== player.team && !opp.isSentOff) oppXs.push(opp.position.x);
      }
      let offsideCapX = attackDir > 0 ? HALF_LENGTH - 5.5 : -HALF_LENGTH + 5.5;
      if (attackDir > 0) {
        oppXs.sort((a, b) => b - a);
        const secondLast = oppXs.length >= 2 ? oppXs[1] : HALF_LENGTH - 5.5;
        offsideCapX = Math.max(0, ball.position.x, secondLast) - 0.65;
      } else {
        oppXs.sort((a, b) => a - b);
        const secondLast = oppXs.length >= 2 ? oppXs[1] : -HALF_LENGTH + 5.5;
        offsideCapX = Math.min(0, ball.position.x, secondLast) + 0.65;
      }

      let runDepth = Math.min(
        HALF_LENGTH - 5.5,
        Math.min(offsideCapX, Math.max(anchor.x, ball.position.x + attackDir * pushDist)),
      );
      if (attackDir < 0) {
        runDepth = Math.max(
          -HALF_LENGTH + 5.5,
          Math.max(offsideCapX, Math.min(anchor.x, ball.position.x + attackDir * pushDist)),
        );
      }

      let runWidth: number;
      if (player.role === 'LW') {
        runWidth = -HALF_WIDTH * 0.62 * tactics.widthScale * attackDir;
      } else if (player.role === 'RW') {
        runWidth = HALF_WIDTH * 0.62 * tactics.widthScale * attackDir;
      } else if (player.role === 'ST') {
        // Striker probes the open central channel away from ball side for diagonal through-balls
        const channelBias = owner.position.z >= 0 ? -4.5 : 4.5;
        runWidth = Math.max(-11, Math.min(11, anchor.z * 0.45 + channelBias));
      } else {
        // CAM drifts into the half-space pocket between lines to offer a forward pass option
        runWidth = Math.max(-15, Math.min(15, owner.position.z * 0.5 + (owner.position.z >= 0 ? -7.5 : 7.5)));
      }

      const clampedX = Math.max(-HALF_LENGTH + 5, Math.min(HALF_LENGTH - 5, runDepth));
      return {
        desiredX: clampedX,
        desiredZ: Math.max(-HALF_WIDTH + 2.5, Math.min(HALF_WIDTH - 2.5, runWidth)),
        sprint: transitionMode === 'attack' || Math.abs(clampedX - player.position.x) > 5.5,
        shouldPass: false,
        shouldShoot: false,
        shouldTackle: false,
        shouldDive: false,
        diveDir: 0,
        passTarget: null,
      };
    }

    // Midfielders create clean passing triangles (~9-13m away, avoiding clumping onto the carrier)
    if ((player.role === 'CM' || player.role === 'CDM') && distToOwner < 28) {
      const forwardOffset = player.role === 'CM' ? 6.5 : -6.0;
      const supportX = Math.max(
        -HALF_LENGTH + 6,
        Math.min(
          HALF_LENGTH - 6,
          owner.position.x + attackDir * (forwardOffset + tactics.attackPushMeters * 0.45),
        ),
      );
      const preferredSign =
        Math.abs(player.position.z - owner.position.z) > 1.5
          ? player.position.z >= owner.position.z
            ? 1
            : -1
          : owner.position.z >= 0
            ? -1
            : 1;
      const supportZ = Math.max(
        -HALF_WIDTH + 3.5,
        Math.min(HALF_WIDTH - 3.5, owner.position.z + preferredSign * 10.5),
      );
      return {
        desiredX: supportX,
        desiredZ: supportZ,
        sprint: Math.hypot(supportX - player.position.x, supportZ - player.position.z) > 8,
        shouldPass: false,
        shouldShoot: false,
        shouldTackle: false,
        shouldDive: false,
        diveDir: 0,
        passTarget: null,
      };
    }

    // Fullbacks & CBs maintain collective structure and keep safe spacing from carrier
    let supportX = Math.max(
      -HALF_LENGTH + 4.5,
      Math.min(HALF_LENGTH - 4.5, anchor.x + attackDir * (6.0 + tactics.attackPushMeters * 0.5)),
    );
    let supportZ = anchor.z;
    if (distToOwner < 7.0) {
      // Anti-clumping: step slightly wide/back to provide a clean outlet instead of crowding carrier
      supportX -= attackDir * 3.5;
      supportZ += player.position.z >= owner.position.z ? 4.0 : -4.0;
    }

    return {
      desiredX: Math.max(-HALF_LENGTH + 4, Math.min(HALF_LENGTH - 4, supportX)),
      desiredZ: Math.max(-HALF_WIDTH + 3, Math.min(HALF_WIDTH - 3, supportZ)),
      sprint: false,
      shouldPass: false,
      shouldShoot: false,
      shouldTackle: false,
      shouldDive: false,
      diveDir: 0,
      passTarget: null,
    };
  }

  // =========================================================================
  // 4. DEFENSIVE AI (Pressing, Goal-Side Cover + Pass-Lane Screening, Recovery)
  // =========================================================================
  if (player.id === closestPresserId) {
    const targetX = ball.position.x + ball.velocity.x * 0.16;
    const targetZ = ball.position.z + ball.velocity.z * 0.16;
    const distToBall = Math.hypot(ball.position.x - player.position.x, ball.position.z - player.position.z);
    const tackleTriggerRange = TACKLE_REACH * (0.92 + tactics.pressIntensity * 0.09);

    const canAttemptTackle =
      owner != null &&
      owner.team !== player.team &&
      distToBall < tackleTriggerRange &&
      player.tackleCooldown <= 0 &&
      isCleanTackleAngle(player, owner, ball);

    return {
      desiredX: Math.max(-HALF_LENGTH + 2, Math.min(HALF_LENGTH - 2, targetX)),
      desiredZ: Math.max(-HALF_WIDTH + 2, Math.min(HALF_WIDTH - 2, targetZ)),
      sprint:
        transitionMode === 'defend' ||
        tactics.pressIntensity >= 0.85 ||
        distToBall < 14,
      shouldPass: false,
      shouldShoot: false,
      shouldTackle: canAttemptTackle,
      shouldDive: false,
      diveDir: 0,
      passTarget: null,
    };
  }

  // Cover defender: goal-side cover + actively screens the most dangerous forward passing lane
  if (coverDefenderId && player.id === coverDefenderId) {
    const toGoalX = ownGoalX - ball.position.x;
    const toGoalZ = 0 - ball.position.z;
    const toGoalLen = Math.hypot(toGoalX, toGoalZ) || 1;
    const coverDist = tactics.pressIntensity > 1.1 ? 5.0 : 6.4;
    let coverX = ball.position.x + (toGoalX / toGoalLen) * coverDist;
    let coverZ = ball.position.z + (toGoalZ / toGoalLen) * coverDist;

    // Look for an opponent forward runner to screen the passing lane toward them
    if (owner && owner.team !== player.team) {
      let bestRunner: PlayerState | null = null;
      let bestThreat = -Infinity;
      for (let i = 0; i < allPlayers.length; i++) {
        const opp = allPlayers[i];
        if (opp.team === player.team || opp.id === owner.id || opp.role === 'GK') continue;
        const dFromBall = Math.hypot(opp.position.x - ball.position.x, opp.position.z - ball.position.z);
        if (dFromBall < 6 || dFromBall > 26) continue;
        // Closer to our own goal = more dangerous
        const goalThreat = -Math.abs(opp.position.x - ownGoalX);
        if (goalThreat > bestThreat) {
          bestThreat = goalThreat;
          bestRunner = opp;
        }
      }
      if (bestRunner) {
        const screenX = ball.position.x * 0.55 + bestRunner.position.x * 0.45;
        const screenZ = ball.position.z * 0.55 + bestRunner.position.z * 0.45;
        coverX = coverX * 0.55 + screenX * 0.45;
        coverZ = coverZ * 0.55 + screenZ * 0.45;
      }
    }

    return {
      desiredX: Math.max(-HALF_LENGTH + 4, Math.min(HALF_LENGTH - 4, coverX)),
      desiredZ: Math.max(-HALF_WIDTH + 3, Math.min(HALF_WIDTH - 3, coverZ)),
      sprint:
        transitionMode === 'defend' ||
        Math.hypot(coverX - player.position.x, coverZ - player.position.z) > 5.5,
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
    let bestMarkDist = 15.5;
    for (let i = 0; i < allPlayers.length; i++) {
      const opp = allPlayers[i];
      if (opp.team === player.team || opp.role === 'GK') continue;
      const d = Math.hypot(opp.position.x - anchor.x, opp.position.z - anchor.z);
      if (d < bestMarkDist) {
        bestMarkDist = d;
        markTarget = opp;
      }
    }

    if (markTarget) {
      // Stay goal-side of dangerous runner, anticipating their velocity slightly
      const predX = markTarget.position.x + markTarget.velocity.x * 0.25;
      const predZ = markTarget.position.z + markTarget.velocity.z * 0.25;
      const markX = predX - attackDir * 2.0;
      const markZ = predZ * 0.9;
      return {
        desiredX: Math.max(-HALF_LENGTH + 3.5, Math.min(HALF_LENGTH - 3.5, markX)),
        desiredZ: Math.max(-HALF_WIDTH + 2.5, Math.min(HALF_WIDTH - 2.5, markZ)),
        sprint:
          transitionMode === 'defend' ||
          Math.hypot(markX - player.position.x, markZ - player.position.z) > 4.8,
        shouldPass: false,
        shouldShoot: false,
        shouldTackle: false,
        shouldDive: false,
        diveDir: 0,
        passTarget: null,
      };
    }
  }

  // Midfielders & attackers recover promptly into defensive block when possession is lost
  const recoveryShift = transitionMode === 'defend' ? -attackDir * 5.0 : 0;
  const recoverX = Math.max(-HALF_LENGTH + 4, Math.min(HALF_LENGTH - 4, anchor.x + recoveryShift));

  return {
    desiredX: recoverX,
    desiredZ: anchor.z,
    sprint: transitionMode === 'defend' && Math.hypot(recoverX - player.position.x, anchor.z - player.position.z) > 6,
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
    const targetZ = cornerSign * (GOAL_HALF_WIDTH * 0.65);
    const shot = computeContextualShot(
      player,
      attackDir * HALF_LENGTH,
      targetZ,
      0.58,
      allPlayers,
      player.actionState === 'sprint',
    );
    applyBallKick(
      ball,
      shot.dirX,
      shot.dirZ,
      shot.horizontalSpeed,
      shot.loftSpeed,
      player,
      shot.sideSpin,
    );
    onSound?.('kick');
    return;
  }

  if (steering.shouldPass && steering.passTarget) {
    const dist = Math.hypot(
      steering.passTarget.position.x - player.position.x,
      steering.passTarget.position.z - player.position.z,
    );
    const isLob = steering.preferLob ?? dist > 23;
    const lead = computeLeadPassVector(player, steering.passTarget, isLob);
    const spreadX = (Math.random() - 0.5) * lead.spreadFactor * dist;
    const spreadZ = (Math.random() - 0.5) * lead.spreadFactor * dist;

    applyBallKick(
      ball,
      lead.dirX + spreadX,
      lead.dirZ + spreadZ,
      lead.speed,
      lead.loft,
      player,
    );
    onSound?.(isLob ? 'kick' : 'pass');
  } else if (steering.shouldPass && player.role === 'GK') {
    applyBallKick(ball, attackDir, (Math.random() - 0.5) * 0.45, 22, 6.4, player);
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

  if (type === 'free_kick' || type === 'indirect_free_kick') {
    const distToGoal = Math.hypot(oppGoalX - ball.position.x, ball.position.z);
    // Law 13: Only a DIRECT free kick may be shot directly on goal; indirect must be passed
    if (type === 'free_kick' && distToGoal < 30) {
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
      const lead = computeLeadPassVector(taker, target, type === 'free_kick');
      return {
        dirX: lead.dirX,
        dirZ: lead.dirZ,
        speed: lead.speed,
        loft: lead.loft,
        sideSpin: 0,
        isShot: false,
      };
    }
    return {
      dirX: attackDir,
      dirZ: ball.position.z > 0 ? -0.35 : 0.35,
      speed: 15.5,
      loft: 1.2,
      sideSpin: 0,
      isShot: false,
    };
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
