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
  const reachRadius = isDiving ? 1.55 : 1.05;
  const maxReachHeight = isDiving ? 2.25 : 2.15;

  if (horizDist > reachRadius || ball.position.y > maxReachHeight) {
    return null;
  }

  const ballSpeed = Math.hypot(ball.velocity.x, ball.velocity.z);
  const attackDir = gk.team === 'home' ? 1 : -1;

  // Hard shots (> 18.5 m/s) parry wide away from goal; softer shots/crosses get caught cleanly
  if (ballSpeed > 18.5 && ball.lastTouchTeam !== gk.team) {
    const deflectZ =
      Math.abs(dz) > 0.12
        ? Math.sign(dz) * 0.75
        : gk.position.z >= 0
          ? 0.7
          : -0.7;
    ball.velocity.x = attackDir * (8.5 + Math.random() * 3.5);
    ball.velocity.z = deflectZ * (9.5 + Math.random() * 3.5);
    ball.velocity.y = 2.8;
    ball.pickupLockTimer = 0.2;
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
