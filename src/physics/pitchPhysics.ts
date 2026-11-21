import {
  BALL_AIR_DRAG,
  BALL_BOUNCE_RESTITUTION,
  BALL_RADIUS,
  BALL_STOP_SPEED,
  BALL_TURF_FRICTION,
  GOAL_DEPTH,
  GOAL_HALF_WIDTH,
  GOAL_HEIGHT,
  GOAL_POST_RADIUS,
  GRAVITY,
  HALF_LENGTH,
  HALF_WIDTH,
  PLAYER_RADIUS,
} from '../core/constants';
import { BallState, PlayerState, TeamSide, Vec3 } from '../core/types';

export interface BallStepResult {
  scoredTeam: TeamSide | null;
  outOfBounds: 'sideline' | 'endline_home' | 'endline_away' | null;
  hitPost: boolean;
  bouncedOnTurf: boolean;
}

export interface ShotVelocityParams {
  horizontalSpeed: number;
  loftSpeed: number;
}

export type ShotKind = 'quick' | 'controlled' | 'power' | 'moving' | 'pressured';

export interface ContextualShotResult {
  dirX: number;
  dirZ: number;
  horizontalSpeed: number;
  loftSpeed: number;
  sideSpin: number;
  shotKind: ShotKind;
  accuracyFactor: number; // 0..1 (higher = tighter dispersion)
  pressureLevel: number; // 0..1
}

/**
 * Computes realistic shot speed & loft from player shotPower and 0..1 charge gauge.
 */
export function computeShotProfile(
  shotPower: number,
  charge: number,
  isSprinting: boolean,
): ShotVelocityParams {
  const clamped = Math.max(0, Math.min(1, charge));
  const powerFactor = 0.72 + clamped * 0.42 + (isSprinting ? 0.05 : 0);
  const horizontalSpeed = shotPower * powerFactor;
  const loftSpeed = 2.6 + clamped * 5.2;
  return { horizontalSpeed, loftSpeed };
}

/**
 * Computes realistic contextual shot trajectory factoring in charge duration, body alignment,
 * movement speed, distance to goal, and nearby defensive pressure.
 * Accepts optional deterministic noise in [-1, 1] for unit testing.
 */
export function computeContextualShot(
  shooter: PlayerState,
  targetGoalX: number,
  aimZ: number,
  charge: number,
  allPlayers: PlayerState[],
  isSprinting: boolean,
  noiseX?: number,
  noiseY?: number,
): ContextualShotResult {
  const clampedCharge = Math.max(0, Math.min(1, charge));
  const rawDirX = targetGoalX - shooter.position.x;
  const rawDirZ = aimZ - shooter.position.z;
  const distToGoal = Math.hypot(rawDirX, rawDirZ) || 1;
  const goalNx = rawDirX / distToGoal;
  const goalNz = rawDirZ / distToGoal;

  // Body orientation alignment toward the target goal (-1 = back to goal, +1 = square to goal)
  const facingX = Math.sin(shooter.facingAngle);
  const facingZ = Math.cos(shooter.facingAngle);
  const bodyAlign = facingX * goalNx + facingZ * goalNz;
  const alignFactor = Math.max(0, Math.min(1, (bodyAlign + 0.25) / 1.25));

  // Shooter movement speed penalty (controlled stationary/jogging shot > full sprint shot)
  const speed = Math.hypot(shooter.velocity.x, shooter.velocity.z);
  const speedRatio = Math.min(1, speed / 9.5);

  // Measure nearby defensive pressure (opponents closing within 3.0m)
  let pressureLevel = 0;
  for (let i = 0; i < allPlayers.length; i++) {
    const opp = allPlayers[i];
    if (opp.team === shooter.team) continue;
    const dx = opp.position.x - shooter.position.x;
    const dz = opp.position.z - shooter.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 3.0) {
      // Defenders in front/side apply stronger pressure than one trailing behind
      const frontDot = d > 0.01 ? (dx / d) * goalNx + (dz / d) * goalNz : 0.5;
      const weight = frontDot > -0.25 ? 1.0 : 0.55;
      const contrib = ((3.0 - d) / 3.0) * weight;
      if (contrib > pressureLevel) pressureLevel = contrib;
    }
  }
  pressureLevel = Math.min(1, pressureLevel);

  // Classify shot type for clear feel differences
  let shotKind: ShotKind = 'controlled';
  if (pressureLevel >= 0.48) {
    shotKind = 'pressured';
  } else if (clampedCharge >= 0.72) {
    shotKind = 'power';
  } else if (clampedCharge <= 0.28) {
    shotKind = 'quick';
  } else if (isSprinting || speed > 6.2) {
    shotKind = 'moving';
  }

  // Speed & loft profile by shot type and body balance
  const baseProfile = computeShotProfile(shooter.attributes.shotPower, clampedCharge, isSprinting);
  const bodyPowerMult = 0.8 + alignFactor * 0.22; // Awkward/back-to-goal strikes lose pace
  let horizontalSpeed = baseProfile.horizontalSpeed * bodyPowerMult;
  let loftSpeed = baseProfile.loftSpeed;

  if (shotKind === 'quick') {
    horizontalSpeed *= 0.94;
    loftSpeed = Math.max(1.6, loftSpeed * 0.72);
  } else if (shotKind === 'power') {
    horizontalSpeed *= 1.06;
    loftSpeed += 0.95;
  } else if (shotKind === 'pressured') {
    horizontalSpeed *= 0.96;
    loftSpeed += pressureLevel * 1.15;
  }

  // Distance adds subtle natural elevation for long-range drives
  if (distToGoal > 22) {
    loftSpeed += Math.min(1.6, (distToGoal - 22) * 0.075);
  }

  // Accuracy factor (never 100% auto-aim laser)
  const overchargePenalty = clampedCharge > 0.78 ? (clampedCharge - 0.78) * 1.35 : 0;
  const distPenalty = Math.max(0, (distToGoal - 14) / 38) * 0.22;
  const accuracyFactor = Math.max(
    0.18,
    Math.min(
      0.95,
      0.92 -
        (1 - alignFactor) * 0.34 -
        speedRatio * 0.16 -
        pressureLevel * 0.28 -
        overchargePenalty -
        distPenalty,
    ),
  );

  // Angular lateral dispersion (radians) and slight vertical variance
  const maxAngleError = (1 - accuracyFactor) * 0.26; // up to ~12° on heavily pressured/off-balance shots
  const rx = noiseX !== undefined ? Math.max(-1, Math.min(1, noiseX)) : (Math.random() - 0.5) * 2;
  const ry = noiseY !== undefined ? Math.max(-1, Math.min(1, noiseY)) : (Math.random() - 0.5) * 2;
  const angleOffset = rx * maxAngleError;
  const cosA = Math.cos(angleOffset);
  const sinA = Math.sin(angleOffset);
  const finalDirX = goalNx * cosA - goalNz * sinA;
  const finalDirZ = goalNx * sinA + goalNz * cosA;

  loftSpeed = Math.max(1.4, loftSpeed + ry * (1 - accuracyFactor) * 1.6);

  const sideSpin =
    Math.abs(aimZ) > 0.35 ? Math.sign(aimZ) * (0.9 + alignFactor * 0.75) : 0;

  return {
    dirX: finalDirX,
    dirZ: finalDirZ,
    horizontalSpeed,
    loftSpeed,
    sideSpin,
    shotKind,
    accuracyFactor,
    pressureLevel,
  };
}

export interface LocomotionStepResult {
  speed: number;
  isTurningHard: boolean;
}

/**
 * Advances a player's velocity and facing angle with realistic acceleration, deceleration,
 * turning radius at sprint speed, and momentum inertia (prevents instant 180° snaps at full pace).
 */
export function stepPlayerLocomotion(
  player: PlayerState,
  desiredVx: number,
  desiredVz: number,
  desiredAngle: number | null,
  dt: number,
  isSprinting: boolean,
  hasBall: boolean,
): LocomotionStepResult {
  const curVx = player.velocity.x;
  const curVz = player.velocity.z;
  const curSpeed = Math.hypot(curVx, curVz);
  const desiredSpeed = Math.hypot(desiredVx, desiredVz);

  let isTurningHard = false;
  let effectiveAccel: number;

  if (desiredSpeed < 0.15) {
    // Natural turf deceleration when releasing movement input
    effectiveAccel = 8.2 + (player.attributes.dribbling / 100) * 1.8;
  } else {
    // Alignment between current momentum and desired travel direction
    let moveDot = 1;
    if (curSpeed > 1.2) {
      moveDot = (curVx * desiredVx + curVz * desiredVz) / (curSpeed * desiredSpeed);
    }

    const baseAccel = Math.max(7.5, player.attributes.acceleration * 0.58);
    if (curSpeed > 4.2 && moveDot < 0.25) {
      // High-speed cut or 180° reversal: plant feet & bleed momentum before re-accelerating
      isTurningHard = true;
      const agilityBonus = (player.attributes.dribbling / 100) * 1.6;
      const brakeStrength = moveDot < -0.45 ? 0.46 : 0.62;
      effectiveAccel = (baseAccel * brakeStrength + agilityBonus) * (hasBall ? 0.9 : 1.0);
    } else if (desiredSpeed > curSpeed) {
      effectiveAccel = baseAccel * (isSprinting ? 0.92 : 1.05);
    } else {
      effectiveAccel = baseAccel * 0.88;
    }
  }

  const blend = Math.min(1, effectiveAccel * dt);
  player.velocity.x = curVx + (desiredVx - curVx) * blend;
  player.velocity.z = curVz + (desiredVz - curVz) * blend;

  // Apply gentle turning speed bleed so sprinting around tight corners slows down realistically
  if (isTurningHard && curSpeed > 5.0) {
    const cornerDrag = Math.pow(0.965, dt * 60);
    player.velocity.x *= cornerDrag;
    player.velocity.z *= cornerDrag;
  }

  const newSpeed = Math.hypot(player.velocity.x, player.velocity.z);
  if (desiredAngle !== null) {
    // Turn rate slows down at full sprint speed (wider turning arc) and sharpens when jogging
    const speedNorm = Math.min(1, newSpeed / 10.0);
    const baseTurnRate = hasBall
      ? 10.5 + (player.attributes.dribbling / 100) * 3.5
      : 12.0;
    const speedTurnScale = 1 - speedNorm * (isSprinting ? 0.46 : 0.3);
    const turnRate = Math.max(5.2, baseTurnRate * speedTurnScale);

    let diff = desiredAngle - player.facingAngle;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    player.facingAngle += diff * Math.min(1, turnRate * dt);
  }

  return { speed: newSpeed, isTurningHard };
}

export interface BallReceptionResult {
  outcome: 'control' | 'heavy_touch';
  touchOffsetMeters: number;
  touchDirX: number;
  touchDirZ: number;
  deflectSpeed: number;
}

/**
 * Evaluates a player's first touch when receiving/controlling a loose ball.
 * Accounts for incoming ball speed, bounce height, player sprint speed, orientation, and dribbling skill.
 */
export function evaluateBallReception(
  player: PlayerState,
  ball: BallState,
  inputDirX = 0,
  inputDirZ = 0,
): BallReceptionResult {
  const ballSpeed = Math.hypot(ball.velocity.x, ball.velocity.z);
  const playerSpeed = Math.hypot(player.velocity.x, player.velocity.z);
  const isSprinting = player.actionState === 'sprint' || playerSpeed > 7.4;

  // Preferred cushion direction: movement input > current velocity > facing direction
  const inLen = Math.hypot(inputDirX, inputDirZ);
  let touchDirX: number;
  let touchDirZ: number;
  if (inLen > 0.18) {
    touchDirX = inputDirX / inLen;
    touchDirZ = inputDirZ / inLen;
  } else if (playerSpeed > 1.2) {
    touchDirX = player.velocity.x / playerSpeed;
    touchDirZ = player.velocity.z / playerSpeed;
  } else {
    touchDirX = Math.sin(player.facingAngle);
    touchDirZ = Math.cos(player.facingAngle);
  }

  // Measure how cleanly the player faces/aligns with the incoming ball
  const facingX = Math.sin(player.facingAngle);
  const facingZ = Math.cos(player.facingAngle);
  let incomingAlign = 0.5;
  if (ballSpeed > 1.5) {
    // Ideal trap is receiving from front (ball velocity opposite facing) or running smoothly along ball path
    const ballNx = ball.velocity.x / ballSpeed;
    const ballNz = ball.velocity.z / ballSpeed;
    const facingBall = -(ballNx * facingX + ballNz * facingZ);
    const runningWithBall = ballNx * touchDirX + ballNz * touchDirZ;
    incomingAlign = Math.max(facingBall, runningWithBall * 0.9);
  }

  const skillFactor = Math.max(0.5, Math.min(1.1, player.attributes.dribbling / 85));
  const heightDifficulty = Math.max(0, (ball.position.y - 0.55) * 0.45);
  const speedDifficulty = Math.max(0, (ballSpeed - 9.5) / 14);
  const sprintDifficulty = isSprinting ? 0.28 : playerSpeed > 4.5 ? 0.12 : 0;
  const alignPenalty = incomingAlign < 0 ? Math.abs(incomingAlign) * 0.26 : 0;

  const difficulty = (speedDifficulty + heightDifficulty + sprintDifficulty + alignPenalty) / skillFactor;

  // Very hard, awkward incoming balls bounce off the first touch instead of sticking magically
  if (ballSpeed > 19.5 && difficulty > 0.92 && ball.lastTouchTeam !== player.team) {
    const deflectSpeed = Math.min(9.5, ballSpeed * 0.34);
    return {
      outcome: 'heavy_touch',
      touchOffsetMeters: 0.95,
      touchDirX,
      touchDirZ,
      deflectSpeed,
    };
  }

  // Variable first-touch cushion distance: tight when slow, pushed slightly further on hard/sprint receptions
  const baseTouch = isSprinting ? 0.92 : 0.68;
  const touchOffsetMeters = Math.min(1.28, baseTouch + difficulty * 0.34);

  return {
    outcome: 'control',
    touchOffsetMeters,
    touchDirX,
    touchDirZ,
    deflectSpeed: 0,
  };
}

/**
 * Prevents free-moving balls from ghosting straight through outfield players' bodies.
 * Returns the blocking player if a physical body deflection occurred, else null.
 */
export function resolveLooseBallBodyContact(
  ball: BallState,
  players: PlayerState[],
): PlayerState | null {
  if (ball.ownerId !== null || ball.position.y > 1.8) return null;

  const minDist = PLAYER_RADIUS + BALL_RADIUS;
  const minDistSq = minDist * minDist;

  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (p.role === 'GK') continue;
    // Let the kicker's own just-struck ball clear their foot cleanly
    if (p.kickCooldown > 0.16) continue;

    const dx = ball.position.x - p.position.x;
    const dz = ball.position.z - p.position.z;
    const distSq = dx * dx + dz * dz;
    if (distSq >= minDistSq || distSq < 1e-6) continue;

    const dist = Math.sqrt(distSq);
    const nx = dx / dist;
    const nz = dz / dist;

    // Push ball outside body radius so it never clips through torso/legs
    ball.position.x = p.position.x + nx * (minDist + 0.03);
    ball.position.z = p.position.z + nz * (minDist + 0.03);

    const vn = ball.velocity.x * nx + ball.velocity.z * nz;
    if (vn < -1.0) {
      // Realistic damped deflection off shins/body
      ball.velocity.x = (ball.velocity.x - 1.45 * vn * nx) * 0.52 + p.velocity.x * 0.25;
      ball.velocity.z = (ball.velocity.z - 1.45 * vn * nz) * 0.52 + p.velocity.z * 0.25;
      ball.velocity.y = Math.max(ball.velocity.y * 0.45, 0.85);
      ball.lastTouchTeam = p.team;
      ball.lastTouchPlayerName = p.name;
      ball.pickupLockTimer = Math.max(ball.pickupLockTimer, 0.12);
      return p;
    }
  }

  return null;
}

/**
 * Predicts where and when a free-moving ball will cross targetX.
 * Returns null if the ball is stationary or moving away from targetX.
 */
export function predictBallCrossingX(
  ball: BallState,
  targetX: number,
): { time: number; z: number; y: number } | null {
  if (ball.ownerId !== null) return null;
  const dx = targetX - ball.position.x;
  if (dx * ball.velocity.x <= 0.5) return null;

  const time = dx / ball.velocity.x;
  if (time < 0 || time > 1.6) return null;

  const predZ = ball.position.z + ball.velocity.z * time;
  const predY = Math.max(
    BALL_RADIUS,
    ball.position.y + ball.velocity.y * time - 0.5 * GRAVITY * time * time,
  );
  return { time, z: predZ, y: predY };
}

/**
 * Checks if a goalkeeper intercepts/saves an incoming free ball.
 * Returns 'catch' | 'parry' | null.
 */
export function attemptGoalkeeperSave(
  gk: PlayerState,
  ball: BallState,
): 'catch' | 'parry' | null {
  if (ball.ownerId !== null || ball.pickupLockTimer > 0) return null;
  if (gk.kickCooldown > 0) return null;

  const dx = ball.position.x - gk.position.x;
  const dz = ball.position.z - gk.position.z;
  const horizDist = Math.hypot(dx, dz);

  const isDiving = gk.actionState === 'dive';
  const reachRadius = isDiving ? 1.58 : 1.05;
  const maxReachHeight = isDiving ? 2.28 : 2.15;

  if (horizDist > reachRadius || ball.position.y > maxReachHeight) {
    return null;
  }

  const ballSpeed = Math.hypot(ball.velocity.x, ball.velocity.z);
  const attackDir = gk.team === 'home' ? 1 : -1;

  // Hard shots (> 18.5 m/s) or outstretched full-stretch dives (> 14.5 m/s) parry wide away from danger
  const isHardSave =
    ball.lastTouchTeam !== gk.team &&
    (ballSpeed > 18.5 || (isDiving && ballSpeed > 14.5 && horizDist > 0.9));

  if (isHardSave) {
    const deflectZ =
      Math.abs(dz) > 0.12
        ? Math.sign(dz) * 0.82
        : gk.position.z >= 0
          ? 0.78
          : -0.78;
    ball.velocity.x = attackDir * (8.5 + Math.random() * 3.5);
    ball.velocity.z = deflectZ * (10.0 + Math.random() * 3.5);
    ball.velocity.y = 2.8;
    ball.pickupLockTimer = 0.22;
    ball.lastTouchTeam = gk.team;
    ball.lastTouchPlayerName = gk.name;
    gk.kickCooldown = 0.35;
    return 'parry';
  }

  return 'catch';
}

/**
 * Advances ball physics by dt seconds (handles free flight, gravity, bounce,
 * goal post/crossbar collisions, net damping, and goal-line / out-of-bounds detection).
 */
export function stepBallPhysics(ball: BallState, dt: number): BallStepResult {
  const result: BallStepResult = {
    scoredTeam: null,
    outOfBounds: null,
    hitPost: false,
    bouncedOnTurf: false,
  };

  if (ball.pickupLockTimer > 0) {
    ball.pickupLockTimer = Math.max(0, ball.pickupLockTimer - dt);
  }

  // If currently carried by a dribbler, physics are driven by the carrier
  if (ball.ownerId !== null) {
    return result;
  }

  // Integrate gravity when airborne or rising
  if (ball.position.y > BALL_RADIUS + 0.002 || ball.velocity.y > 0.01) {
    ball.velocity.y -= GRAVITY * dt;
  }

  // Slight Magnus spin swerve on airborne curved shots
  if (ball.position.y > BALL_RADIUS + 0.08) {
    ball.velocity.z += ball.spin.y * 0.35 * dt;
  }

  // Integrate position
  ball.position.x += ball.velocity.x * dt;
  ball.position.y += ball.velocity.y * dt;
  ball.position.z += ball.velocity.z * dt;

  // Ground collision & bounce
  if (ball.position.y <= BALL_RADIUS) {
    ball.position.y = BALL_RADIUS;
    if (ball.velocity.y < -1.1) {
      ball.velocity.y = -ball.velocity.y * BALL_BOUNCE_RESTITUTION;
      result.bouncedOnTurf = true;
    } else {
      ball.velocity.y = 0;
    }

    // Turf rolling friction (frame-rate independent)
    const frictionFactor = Math.pow(BALL_TURF_FRICTION, dt * 60);
    ball.velocity.x *= frictionFactor;
    ball.velocity.z *= frictionFactor;
    ball.spin.x *= frictionFactor;
    ball.spin.y *= frictionFactor;
    ball.spin.z *= frictionFactor;
  } else {
    // Air drag
    const dragFactor = Math.pow(BALL_AIR_DRAG, dt * 60);
    ball.velocity.x *= dragFactor;
    ball.velocity.z *= dragFactor;
  }

  // Snap tiny residual roll to zero
  const horizSpeedSq = ball.velocity.x * ball.velocity.x + ball.velocity.z * ball.velocity.z;
  if (ball.position.y <= BALL_RADIUS + 0.005 && ball.velocity.y === 0 && horizSpeedSq < BALL_STOP_SPEED * BALL_STOP_SPEED) {
    ball.velocity.x = 0;
    ball.velocity.z = 0;
    ball.spin.x = 0;
    ball.spin.y = 0;
    ball.spin.z = 0;
  }

  // Goal posts & crossbar collision check (both ends: -HALF_LENGTH and +HALF_LENGTH)
  for (const goalSign of [-1, 1] as const) {
    const goalX = goalSign * HALF_LENGTH;

    // Two vertical posts at z = ±GOAL_HALF_WIDTH
    if (ball.position.y <= GOAL_HEIGHT + BALL_RADIUS) {
      for (const zSign of [-1, 1] as const) {
        const postZ = zSign * GOAL_HALF_WIDTH;
        const dx = ball.position.x - goalX;
        const dz = ball.position.z - postZ;
        const minDist = BALL_RADIUS + GOAL_POST_RADIUS;
        const distSq = dx * dx + dz * dz;
        if (distSq < minDist * minDist && distSq > 1e-6) {
          const dist = Math.sqrt(distSq);
          const nx = dx / dist;
          const nz = dz / dist;
          ball.position.x = goalX + nx * minDist;
          ball.position.z = postZ + nz * minDist;
          const vn = ball.velocity.x * nx + ball.velocity.z * nz;
          if (vn < 0) {
            ball.velocity.x -= 1.75 * vn * nx;
            ball.velocity.z -= 1.75 * vn * nz;
            result.hitPost = true;
          }
        }
      }
    }

    // Horizontal crossbar at (goalX, GOAL_HEIGHT) spanning -GOAL_HALF_WIDTH..+GOAL_HALF_WIDTH
    if (Math.abs(ball.position.z) <= GOAL_HALF_WIDTH + BALL_RADIUS) {
      const dx = ball.position.x - goalX;
      const dy = ball.position.y - GOAL_HEIGHT;
      const minDist = BALL_RADIUS + GOAL_POST_RADIUS;
      const distSq = dx * dx + dy * dy;
      if (distSq < minDist * minDist && distSq > 1e-6) {
        const dist = Math.sqrt(distSq);
        const nx = dx / dist;
        const ny = dy / dist;
        ball.position.x = goalX + nx * minDist;
        ball.position.y = GOAL_HEIGHT + ny * minDist;
        const vn = ball.velocity.x * nx + ball.velocity.y * ny;
        if (vn < 0) {
          ball.velocity.x -= 1.75 * vn * nx;
          ball.velocity.y -= 1.75 * vn * ny;
          result.hitPost = true;
        }
      }
    }
  }

  // Goal detection (ball center completely over the goal line inside the goal frame)
  const inGoalMouthZ = Math.abs(ball.position.z) < GOAL_HALF_WIDTH - BALL_RADIUS * 0.4;
  const underCrossbar = ball.position.y < GOAL_HEIGHT - BALL_RADIUS * 0.3;

  if (inGoalMouthZ && underCrossbar) {
    if (ball.position.x > HALF_LENGTH + BALL_RADIUS) {
      // Scored in Away goal (+X) => Home scores!
      result.scoredTeam = 'home';
      // Net containment inside +X goal cage
      const maxNetX = HALF_LENGTH + GOAL_DEPTH - BALL_RADIUS;
      if (ball.position.x > maxNetX) {
        ball.position.x = maxNetX;
        ball.velocity.x *= -0.25;
        ball.velocity.z *= 0.4;
      }
      if (Math.abs(ball.position.z) > GOAL_HALF_WIDTH - BALL_RADIUS) {
        ball.position.z = Math.sign(ball.position.z) * (GOAL_HALF_WIDTH - BALL_RADIUS);
        ball.velocity.z *= -0.25;
      }
      if (ball.position.y > GOAL_HEIGHT - BALL_RADIUS) {
        ball.position.y = GOAL_HEIGHT - BALL_RADIUS;
        ball.velocity.y *= -0.25;
      }
      return result;
    }

    if (ball.position.x < -HALF_LENGTH - BALL_RADIUS) {
      // Scored in Home goal (-X) => Away scores!
      result.scoredTeam = 'away';
      const minNetX = -HALF_LENGTH - GOAL_DEPTH + BALL_RADIUS;
      if (ball.position.x < minNetX) {
        ball.position.x = minNetX;
        ball.velocity.x *= -0.25;
        ball.velocity.z *= 0.4;
      }
      if (Math.abs(ball.position.z) > GOAL_HALF_WIDTH - BALL_RADIUS) {
        ball.position.z = Math.sign(ball.position.z) * (GOAL_HALF_WIDTH - BALL_RADIUS);
        ball.velocity.z *= -0.25;
      }
      if (ball.position.y > GOAL_HEIGHT - BALL_RADIUS) {
        ball.position.y = GOAL_HEIGHT - BALL_RADIUS;
        ball.velocity.y *= -0.25;
      }
      return result;
    }
  }

  // Out-of-bounds checks (sidelines & endlines outside goal mouth)
  if (Math.abs(ball.position.z) > HALF_WIDTH + BALL_RADIUS) {
    result.outOfBounds = 'sideline';
  } else if (ball.position.x < -HALF_LENGTH - BALL_RADIUS) {
    result.outOfBounds = 'endline_home';
  } else if (ball.position.x > HALF_LENGTH + BALL_RADIUS) {
    result.outOfBounds = 'endline_away';
  }

  return result;
}

/**
 * Applies a directional kick impulse to the ball (releasing ownership).
 */
export function applyBallKick(
  ball: BallState,
  dirX: number,
  dirZ: number,
  horizontalSpeed: number,
  loftSpeed: number,
  kicker: PlayerState,
  sideSpin = 0,
): void {
  const len = Math.hypot(dirX, dirZ) || 1;
  const nx = dirX / len;
  const nz = dirZ / len;

  ball.ownerId = null;
  ball.pickupLockTimer = 0.22;
  ball.lastTouchTeam = kicker.team;
  ball.lastTouchPlayerName = kicker.name;

  ball.position.x = kicker.position.x + nx * (PLAYER_RADIUS + BALL_RADIUS + 0.15);
  ball.position.z = kicker.position.z + nz * (PLAYER_RADIUS + BALL_RADIUS + 0.15);
  ball.position.y = Math.max(BALL_RADIUS, ball.position.y);

  ball.velocity.x = nx * horizontalSpeed;
  ball.velocity.y = loftSpeed;
  ball.velocity.z = nz * horizontalSpeed;

  ball.spin.x = -nz * horizontalSpeed * 0.4;
  ball.spin.y = sideSpin;
  ball.spin.z = nx * horizontalSpeed * 0.4;

  kicker.hasBall = false;
  kicker.actionState = 'kick';
  kicker.actionTimer = 0.25;
  kicker.kickCooldown = 0.35;
}

/**
 * Resolves soft pairwise separation between players so 22 players never overlap.
 */
export function resolvePlayerCollisions(players: PlayerState[]): void {
  const minDist = PLAYER_RADIUS * 2;
  const minDistSq = minDist * minDist;

  for (let i = 0; i < players.length; i++) {
    const a = players[i];
    for (let j = i + 1; j < players.length; j++) {
      const b = players[j];
      const dx = b.position.x - a.position.x;
      const dz = b.position.z - a.position.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < minDistSq && distSq > 1e-6) {
        const dist = Math.sqrt(distSq);
        const overlap = (minDist - dist) * 0.5;
        const nx = dx / dist;
        const nz = dz / dist;
        a.position.x -= nx * overlap;
        a.position.z -= nz * overlap;
        b.position.x += nx * overlap;
        b.position.z += nz * overlap;
      }
    }
  }
}

/**
 * Clamps a player inside the pitch + technical run-off margin.
 */
export function clampPlayerToArena(pos: Vec3): void {
  const maxX = HALF_LENGTH + 3.2;
  const maxZ = HALF_WIDTH + 2.8;
  if (pos.x < -maxX) pos.x = -maxX;
  else if (pos.x > maxX) pos.x = maxX;
  if (pos.z < -maxZ) pos.z = -maxZ;
  else if (pos.z > maxZ) pos.z = maxZ;
}
