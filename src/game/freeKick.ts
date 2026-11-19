import {
  BALL_RADIUS,
  CENTER_CIRCLE_RADIUS,
  GOAL_HALF_WIDTH,
  GRAVITY,
  HALF_LENGTH,
  HALF_WIDTH,
} from '../core/constants';
import { TeamSide, Vec3 } from '../core/types';

export interface FreeKickPlan {
  distanceMeters: number;
  isDirectShotRange: boolean;
  dirX: number;
  dirZ: number;
  perpX: number;
  perpZ: number;
  wallCount: number;
  wallCenter: Vec3;
  wallWidth: number;
  wallPositions: Vec3[];
  goalkeeperPos: Vec3;
  takerPos: Vec3;
  shortSupportPos: Vec3;
}

/**
 * Computes a complete regulation free-kick tactical layout:
 * - Taker positioned behind ball along shot line
 * - 1..4 defender wall at exact 9.15m regulation distance, shifted toward near post
 * - Goalkeeper positioned on the far-post side covering the open corner
 * - Short-pass teammate positioned laterally for quick layoff plays
 */
export function computeFreeKickPlan(spot: Vec3, restartTeam: TeamSide): FreeKickPlan {
  const attackDir = restartTeam === 'home' ? 1 : -1;
  const oppGoalX = attackDir * HALF_LENGTH;

  const dxGoal = oppGoalX - spot.x;
  const dzGoal = 0 - spot.z;
  const distanceMeters = Math.max(1, Math.hypot(dxGoal, dzGoal));
  const dirX = dxGoal / distanceMeters;
  const dirZ = dzGoal / distanceMeters;
  const perpX = -dirZ;
  const perpZ = dirX;

  const isDirectShotRange = distanceMeters <= 35;

  let wallCount = 1;
  if (distanceMeters <= 24 && Math.abs(spot.z) <= 14) {
    wallCount = 4;
  } else if (distanceMeters <= 31) {
    wallCount = 3;
  } else if (distanceMeters <= 36) {
    wallCount = 2;
  }

  // Shift wall slightly toward the near post so GK protects the far post
  const nearPostZ = Math.sign(spot.z || 0) * (GOAL_HALF_WIDTH * 0.52);
  const nearDx = oppGoalX - spot.x;
  const nearDz = nearPostZ - spot.z;
  const nearLen = Math.hypot(nearDx, nearDz) || 1;
  const wallDirX = isDirectShotRange ? nearDx / nearLen : dirX;
  const wallDirZ = isDirectShotRange ? nearDz / nearLen : dirZ;
  const wallPerpX = -wallDirZ;
  const wallPerpZ = wallDirX;

  const wallCenter: Vec3 = {
    x: spot.x + wallDirX * CENTER_CIRCLE_RADIUS,
    y: 0,
    z: spot.z + wallDirZ * CENTER_CIRCLE_RADIUS,
  };

  const spacing = 0.78;
  const wallPositions: Vec3[] = [];
  for (let i = 0; i < wallCount; i++) {
    const lateral = (i - (wallCount - 1) / 2) * spacing;
    wallPositions.push({
      x: wallCenter.x + wallPerpX * lateral,
      y: 0,
      z: wallCenter.z + wallPerpZ * lateral,
    });
  }
  const wallWidth = Math.max(1.2, (wallCount - 1) * spacing + 0.9);

  // Goalkeeper covers the far-post side of the goal
  const gkFarZ = Math.abs(spot.z) < 2.2 ? 0.55 : -Math.sign(spot.z) * 1.35;
  const goalkeeperPos: Vec3 = {
    x: oppGoalX - attackDir * 0.95,
    y: 0,
    z: Math.max(-GOAL_HALF_WIDTH + 0.7, Math.min(GOAL_HALF_WIDTH - 0.7, gkFarZ)),
  };

  // Taker stands 1.55m behind ball for a realistic run-up
  const takerPos: Vec3 = {
    x: Math.max(-HALF_LENGTH + 1, Math.min(HALF_LENGTH - 1, spot.x - dirX * 1.55)),
    y: 0,
    z: Math.max(-HALF_WIDTH + 1, Math.min(HALF_WIDTH - 1, spot.z - dirZ * 1.55)),
  };

  // Short-pass layoff option 4.8m to the inside
  const insideSign = spot.z >= 0 ? -1 : 1;
  const shortSupportPos: Vec3 = {
    x: Math.max(-HALF_LENGTH + 2, Math.min(HALF_LENGTH - 2, spot.x + dirX * 1.6)),
    y: 0,
    z: Math.max(-HALF_WIDTH + 2.5, Math.min(HALF_WIDTH - 2.5, spot.z + insideSign * 4.8)),
  };

  return {
    distanceMeters,
    isDirectShotRange,
    dirX,
    dirZ,
    perpX: wallPerpX,
    perpZ: wallPerpZ,
    wallCount,
    wallCenter,
    wallWidth,
    wallPositions,
    goalkeeperPos,
    takerPos,
    shortSupportPos,
  };
}

export interface FreeKickShotProfile {
  dirX: number;
  dirZ: number;
  horizontalSpeed: number;
  loft: number;
  sideSpin: number;
}

/**
 * Computes a curled, wall-clearing free-kick strike from live aim angle and power charge.
 */
export function computeFreeKickShot(
  spot: Vec3,
  restartTeam: TeamSide,
  aimOffsetRad: number,
  charge: number,
  shotPower: number,
): FreeKickShotProfile {
  const attackDir = restartTeam === 'home' ? 1 : -1;
  const oppGoalX = attackDir * HALF_LENGTH;
  const dxGoal = oppGoalX - spot.x;
  const dzGoal = 0 - spot.z;
  const baseAngle = Math.atan2(dzGoal, dxGoal);
  const clampedAim = Math.max(-0.55, Math.min(0.55, aimOffsetRad));
  const finalAngle = baseAngle + clampedAim;

  const dirX = Math.cos(finalAngle);
  const dirZ = Math.sin(finalAngle);
  const c = Math.max(0.15, Math.min(1, charge));

  // Speed & loft tuned to dip cleanly over a 9.15m wall and drop under the 2.44m crossbar
  const horizontalSpeed = Math.max(17, shotPower * (0.72 + c * 0.36));
  const loft = 4.9 + c * 3.1;

  // Natural curl bending back toward target corner
  const sideSpin = -Math.sign(clampedAim || spot.z || 1) * (1.4 + c * 1.45);

  return {
    dirX,
    dirZ,
    horizontalSpeed,
    loft,
    sideSpin,
  };
}

/**
 * Samples a short 3D preview arc for the free-kick aiming guide.
 */
export function sampleFreeKickTrajectory(
  spot: Vec3,
  shot: FreeKickShotProfile,
  steps = 14,
  totalTime = 0.85,
): Vec3[] {
  const pts: Vec3[] = [];
  let x = spot.x;
  let y = Math.max(BALL_RADIUS, spot.y);
  let z = spot.z;
  let vx = shot.dirX * shot.horizontalSpeed;
  let vy = shot.loft;
  let vz = shot.dirZ * shot.horizontalSpeed;
  const dt = totalTime / steps;

  for (let i = 1; i <= steps; i++) {
    // Magnus curl acceleration matching pitchPhysics.ts
    const magnusAx = -vz * shot.sideSpin * 0.14;
    const magnusAz = vx * shot.sideSpin * 0.14;
    vx += magnusAx * dt;
    vz += magnusAz * dt;
    vy -= GRAVITY * dt;
    x += vx * dt;
    y = Math.max(BALL_RADIUS, y + vy * dt);
    z += vz * dt;
    pts.push({ x, y, z });
  }
  return pts;
}
