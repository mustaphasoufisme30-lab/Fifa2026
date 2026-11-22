// server.ts
import express from "express";
import { getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";

// src/core/constants.ts
var PITCH_LENGTH = 105;
var PITCH_WIDTH = 68;
var HALF_LENGTH = PITCH_LENGTH / 2;
var HALF_WIDTH = PITCH_WIDTH / 2;
var GOAL_WIDTH = 7.32;
var GOAL_HALF_WIDTH = GOAL_WIDTH / 2;
var GOAL_HEIGHT = 2.44;
var GOAL_DEPTH = 2.2;
var GOAL_POST_RADIUS = 0.065;
var PENALTY_AREA_LENGTH = 16.5;
var PENALTY_AREA_WIDTH = 40.32;
var GOAL_AREA_LENGTH = 5.5;
var PENALTY_SPOT_DIST = 11;
var CENTER_CIRCLE_RADIUS = 9.15;
var BALL_RADIUS = 0.22;
var PLAYER_RADIUS = 0.45;
var GRAVITY = 19.6;
var BALL_BOUNCE_RESTITUTION = 0.58;
var BALL_TURF_FRICTION = 0.985;
var BALL_AIR_DRAG = 0.996;
var BALL_STOP_SPEED = 0.12;
var DRIBBLE_CONTROL_RADIUS = 1.15;
var DRIBBLE_OFFSET_DIST = 0.72;
var TACKLE_REACH = 1.65;

// src/formations/formations.ts
var MENTALITY_MODIFIERS = {
  defensive: {
    label: "Defensive",
    depthOffset: -0.14,
    pressMult: 0.78,
    attackPush: -4.5
  },
  balanced: {
    label: "Balanced",
    depthOffset: 0,
    pressMult: 1,
    attackPush: 0
  },
  attacking: {
    label: "Attacking",
    depthOffset: 0.14,
    pressMult: 1.24,
    attackPush: 5.5
  }
};
var FORMATIONS = {
  "4-3-3": {
    id: "4-3-3",
    label: "4-3-3 Attack",
    description: "Wide wingers stretching the pitch with a balanced 3-man midfield.",
    tactics: {
      lineDepthBias: 0.05,
      widthScale: 1.06,
      pressIntensity: 1.12,
      attackPushMeters: 3
    },
    slots: [
      { role: "GK", nx: -0.94, nz: 0 },
      { role: "LB", nx: -0.62, nz: -0.66 },
      { role: "CB", nx: -0.68, nz: -0.24 },
      { role: "CB", nx: -0.68, nz: 0.24 },
      { role: "RB", nx: -0.62, nz: 0.66 },
      { role: "CDM", nx: -0.38, nz: 0 },
      { role: "CM", nx: -0.22, nz: -0.42 },
      { role: "CM", nx: -0.22, nz: 0.42 },
      { role: "LW", nx: -0.06, nz: -0.68 },
      { role: "ST", nx: -0.04, nz: 0 },
      { role: "RW", nx: -0.06, nz: 0.68 }
    ]
  },
  "4-4-2": {
    id: "4-4-2",
    label: "4-4-2 Classic",
    description: "Compact two-bank defensive shape with a strike partnership up top.",
    tactics: {
      lineDepthBias: -0.05,
      widthScale: 0.92,
      pressIntensity: 0.92,
      attackPushMeters: 0
    },
    slots: [
      { role: "GK", nx: -0.94, nz: 0 },
      { role: "LB", nx: -0.64, nz: -0.66 },
      { role: "CB", nx: -0.7, nz: -0.24 },
      { role: "CB", nx: -0.7, nz: 0.24 },
      { role: "RB", nx: -0.64, nz: 0.66 },
      { role: "LW", nx: -0.32, nz: -0.68 },
      { role: "CM", nx: -0.36, nz: -0.22 },
      { role: "CM", nx: -0.36, nz: 0.22 },
      { role: "RW", nx: -0.32, nz: 0.68 },
      { role: "ST", nx: -0.06, nz: -0.22 },
      { role: "ST", nx: -0.06, nz: 0.22 }
    ]
  },
  "4-2-3-1": {
    id: "4-2-3-1",
    label: "4-2-3-1 Control",
    description: "Double pivot shielding the defense behind a creative playmaker.",
    tactics: {
      lineDepthBias: 0,
      widthScale: 0.98,
      pressIntensity: 1,
      attackPushMeters: 1.5
    },
    slots: [
      { role: "GK", nx: -0.94, nz: 0 },
      { role: "LB", nx: -0.64, nz: -0.66 },
      { role: "CB", nx: -0.7, nz: -0.24 },
      { role: "CB", nx: -0.7, nz: 0.24 },
      { role: "RB", nx: -0.64, nz: 0.66 },
      { role: "CDM", nx: -0.44, nz: -0.26 },
      { role: "CDM", nx: -0.44, nz: 0.26 },
      { role: "LW", nx: -0.18, nz: -0.64 },
      { role: "CAM", nx: -0.18, nz: 0 },
      { role: "RW", nx: -0.18, nz: 0.64 },
      { role: "ST", nx: -0.04, nz: 0 }
    ]
  },
  "3-5-2": {
    id: "3-5-2",
    label: "3-5-2 Wingbacks",
    description: "Three central defenders with high-energy wingbacks dominating flanks.",
    tactics: {
      lineDepthBias: 0.03,
      widthScale: 1.12,
      pressIntensity: 1.08,
      attackPushMeters: 2.5
    },
    slots: [
      { role: "GK", nx: -0.94, nz: 0 },
      { role: "CB", nx: -0.7, nz: -0.44 },
      { role: "CB", nx: -0.72, nz: 0 },
      { role: "CB", nx: -0.7, nz: 0.44 },
      { role: "LB", nx: -0.34, nz: -0.76 },
      { role: "CDM", nx: -0.42, nz: 0 },
      { role: "CM", nx: -0.26, nz: -0.34 },
      { role: "CM", nx: -0.26, nz: 0.34 },
      { role: "RB", nx: -0.34, nz: 0.76 },
      { role: "ST", nx: -0.05, nz: -0.22 },
      { role: "ST", nx: -0.05, nz: 0.22 }
    ]
  }
};
var FORMATION_LIST = Object.values(FORMATIONS);
function getFormationTactics(formationId, mentality = "balanced") {
  const base = (FORMATIONS[formationId] ?? FORMATIONS["4-3-3"]).tactics;
  const mod = MENTALITY_MODIFIERS[mentality] ?? MENTALITY_MODIFIERS.balanced;
  return {
    lineDepthBias: base.lineDepthBias + mod.depthOffset,
    widthScale: base.widthScale,
    pressIntensity: base.pressIntensity * mod.pressMult,
    attackPushMeters: base.attackPushMeters + mod.attackPush
  };
}
function getFormationWorldPosition(slot, side, ballX = 0, ballZ = 0, forKickoff = false, formationId = "4-3-3", mentality = "balanced") {
  const dir = side === "home" ? 1 : -1;
  const tactics = getFormationTactics(formationId, mentality);
  const depthAdjust = forKickoff || slot.role === "GK" ? 0 : tactics.lineDepthBias;
  const widthAdjust = forKickoff || slot.role === "GK" ? 1 : tactics.widthScale;
  let baseX = (slot.nx + depthAdjust) * HALF_LENGTH * dir;
  let baseZ = slot.nz * widthAdjust * (HALF_WIDTH * 0.88) * dir;
  if (forKickoff) {
    if (side === "home") {
      baseX = Math.min(baseX, -1.8);
    } else {
      baseX = Math.max(baseX, 1.8);
    }
    return { x: baseX, y: 0, z: baseZ };
  }
  if (slot.role !== "GK") {
    const shiftX = ballX * 0.42;
    const shiftZ = ballZ * 0.24;
    baseX = Math.max(-HALF_LENGTH + 3.5, Math.min(HALF_LENGTH - 3.5, baseX + shiftX));
    baseZ = Math.max(-HALF_WIDTH + 2.5, Math.min(HALF_WIDTH - 2.5, baseZ + shiftZ));
  }
  return { x: baseX, y: 0, z: baseZ };
}

// src/physics/pitchPhysics.ts
function computeShotProfile(shotPower, charge, isSprinting) {
  const clamped = Math.max(0, Math.min(1, charge));
  const powerFactor = 0.72 + clamped * 0.42 + (isSprinting ? 0.05 : 0);
  const horizontalSpeed = shotPower * powerFactor;
  const loftSpeed = 2.6 + clamped * 5.2;
  return { horizontalSpeed, loftSpeed };
}
function computeContextualShot(shooter, targetGoalX, aimZ, charge, allPlayers, isSprinting, noiseX, noiseY) {
  const clampedCharge = Math.max(0, Math.min(1, charge));
  const rawDirX = targetGoalX - shooter.position.x;
  const rawDirZ = aimZ - shooter.position.z;
  const distToGoal = Math.hypot(rawDirX, rawDirZ) || 1;
  const goalNx = rawDirX / distToGoal;
  const goalNz = rawDirZ / distToGoal;
  const facingX = Math.sin(shooter.facingAngle);
  const facingZ = Math.cos(shooter.facingAngle);
  const bodyAlign = facingX * goalNx + facingZ * goalNz;
  const alignFactor = Math.max(0, Math.min(1, (bodyAlign + 0.25) / 1.25));
  const speed = Math.hypot(shooter.velocity.x, shooter.velocity.z);
  const speedRatio = Math.min(1, speed / 9.5);
  let pressureLevel = 0;
  for (let i = 0; i < allPlayers.length; i++) {
    const opp = allPlayers[i];
    if (opp.team === shooter.team) continue;
    const dx = opp.position.x - shooter.position.x;
    const dz = opp.position.z - shooter.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 3) {
      const frontDot = d > 0.01 ? dx / d * goalNx + dz / d * goalNz : 0.5;
      const weight = frontDot > -0.25 ? 1 : 0.55;
      const contrib = (3 - d) / 3 * weight;
      if (contrib > pressureLevel) pressureLevel = contrib;
    }
  }
  pressureLevel = Math.min(1, pressureLevel);
  let shotKind = "controlled";
  if (pressureLevel >= 0.48) {
    shotKind = "pressured";
  } else if (clampedCharge >= 0.72) {
    shotKind = "power";
  } else if (clampedCharge <= 0.28) {
    shotKind = "quick";
  } else if (isSprinting || speed > 6.2) {
    shotKind = "moving";
  }
  const baseProfile = computeShotProfile(shooter.attributes.shotPower, clampedCharge, isSprinting);
  const bodyPowerMult = 0.8 + alignFactor * 0.22;
  let horizontalSpeed = baseProfile.horizontalSpeed * bodyPowerMult;
  let loftSpeed = baseProfile.loftSpeed;
  if (shotKind === "quick") {
    horizontalSpeed *= 0.94;
    loftSpeed = Math.max(1.6, loftSpeed * 0.72);
  } else if (shotKind === "power") {
    horizontalSpeed *= 1.06;
    loftSpeed += 0.95;
  } else if (shotKind === "pressured") {
    horizontalSpeed *= 0.96;
    loftSpeed += pressureLevel * 1.15;
  }
  if (distToGoal > 22) {
    loftSpeed += Math.min(1.6, (distToGoal - 22) * 0.075);
  }
  const overchargePenalty = clampedCharge > 0.78 ? (clampedCharge - 0.78) * 1.35 : 0;
  const distPenalty = Math.max(0, (distToGoal - 14) / 38) * 0.22;
  const accuracyFactor = Math.max(
    0.18,
    Math.min(
      0.95,
      0.92 - (1 - alignFactor) * 0.34 - speedRatio * 0.16 - pressureLevel * 0.28 - overchargePenalty - distPenalty
    )
  );
  const maxAngleError = (1 - accuracyFactor) * 0.26;
  const rx = noiseX !== void 0 ? Math.max(-1, Math.min(1, noiseX)) : (Math.random() - 0.5) * 2;
  const ry = noiseY !== void 0 ? Math.max(-1, Math.min(1, noiseY)) : (Math.random() - 0.5) * 2;
  const angleOffset = rx * maxAngleError;
  const cosA = Math.cos(angleOffset);
  const sinA = Math.sin(angleOffset);
  const finalDirX = goalNx * cosA - goalNz * sinA;
  const finalDirZ = goalNx * sinA + goalNz * cosA;
  loftSpeed = Math.max(1.4, loftSpeed + ry * (1 - accuracyFactor) * 1.6);
  const sideSpin = Math.abs(aimZ) > 0.35 ? Math.sign(aimZ) * (0.9 + alignFactor * 0.75) : 0;
  return {
    dirX: finalDirX,
    dirZ: finalDirZ,
    horizontalSpeed,
    loftSpeed,
    sideSpin,
    shotKind,
    accuracyFactor,
    pressureLevel
  };
}
function stepPlayerLocomotion(player, desiredVx, desiredVz, desiredAngle, dt, isSprinting, hasBall) {
  const curVx = player.velocity.x;
  const curVz = player.velocity.z;
  const curSpeed = Math.hypot(curVx, curVz);
  const desiredSpeed = Math.hypot(desiredVx, desiredVz);
  let isTurningHard = false;
  let effectiveAccel;
  if (desiredSpeed < 0.15) {
    effectiveAccel = 8.2 + player.attributes.dribbling / 100 * 1.8;
  } else {
    let moveDot = 1;
    if (curSpeed > 1.2) {
      moveDot = (curVx * desiredVx + curVz * desiredVz) / (curSpeed * desiredSpeed);
    }
    const baseAccel = Math.max(7.5, player.attributes.acceleration * 0.58);
    if (curSpeed > 4.2 && moveDot < 0.25) {
      isTurningHard = true;
      const agilityBonus = player.attributes.dribbling / 100 * 1.6;
      const brakeStrength = moveDot < -0.45 ? 0.46 : 0.62;
      effectiveAccel = (baseAccel * brakeStrength + agilityBonus) * (hasBall ? 0.9 : 1);
    } else if (desiredSpeed > curSpeed) {
      effectiveAccel = baseAccel * (isSprinting ? 0.92 : 1.05);
    } else {
      effectiveAccel = baseAccel * 0.88;
    }
  }
  const blend = Math.min(1, effectiveAccel * dt);
  player.velocity.x = curVx + (desiredVx - curVx) * blend;
  player.velocity.z = curVz + (desiredVz - curVz) * blend;
  if (isTurningHard && curSpeed > 5) {
    const cornerDrag = Math.pow(0.965, dt * 60);
    player.velocity.x *= cornerDrag;
    player.velocity.z *= cornerDrag;
  }
  const newSpeed = Math.hypot(player.velocity.x, player.velocity.z);
  if (desiredAngle !== null) {
    const speedNorm = Math.min(1, newSpeed / 10);
    const baseTurnRate = hasBall ? 10.5 + player.attributes.dribbling / 100 * 3.5 : 12;
    const speedTurnScale = 1 - speedNorm * (isSprinting ? 0.46 : 0.3);
    const turnRate = Math.max(5.2, baseTurnRate * speedTurnScale);
    let diff = desiredAngle - player.facingAngle;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    player.facingAngle += diff * Math.min(1, turnRate * dt);
  }
  return { speed: newSpeed, isTurningHard };
}
function evaluateBallReception(player, ball, inputDirX = 0, inputDirZ = 0) {
  const ballSpeed = Math.hypot(ball.velocity.x, ball.velocity.z);
  const playerSpeed = Math.hypot(player.velocity.x, player.velocity.z);
  const isSprinting = player.actionState === "sprint" || playerSpeed > 7.4;
  const inLen = Math.hypot(inputDirX, inputDirZ);
  let touchDirX;
  let touchDirZ;
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
  const facingX = Math.sin(player.facingAngle);
  const facingZ = Math.cos(player.facingAngle);
  let incomingAlign = 0.5;
  if (ballSpeed > 1.5) {
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
  if (ballSpeed > 19.5 && difficulty > 0.92 && ball.lastTouchTeam !== player.team) {
    const deflectSpeed = Math.min(9.5, ballSpeed * 0.34);
    return {
      outcome: "heavy_touch",
      touchOffsetMeters: 0.95,
      touchDirX,
      touchDirZ,
      deflectSpeed
    };
  }
  const baseTouch = isSprinting ? 0.92 : 0.68;
  const touchOffsetMeters = Math.min(1.28, baseTouch + difficulty * 0.34);
  return {
    outcome: "control",
    touchOffsetMeters,
    touchDirX,
    touchDirZ,
    deflectSpeed: 0
  };
}
function resolveLooseBallBodyContact(ball, players) {
  if (ball.ownerId !== null || ball.position.y > 1.8) return null;
  const minDist = PLAYER_RADIUS + BALL_RADIUS;
  const minDistSq = minDist * minDist;
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (p.role === "GK") continue;
    if (p.kickCooldown > 0.16) continue;
    const dx = ball.position.x - p.position.x;
    const dz = ball.position.z - p.position.z;
    const distSq = dx * dx + dz * dz;
    if (distSq >= minDistSq || distSq < 1e-6) continue;
    const dist = Math.sqrt(distSq);
    const nx = dx / dist;
    const nz = dz / dist;
    ball.position.x = p.position.x + nx * (minDist + 0.03);
    ball.position.z = p.position.z + nz * (minDist + 0.03);
    const vn = ball.velocity.x * nx + ball.velocity.z * nz;
    if (vn < -1) {
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
function predictBallCrossingX(ball, targetX) {
  if (ball.ownerId !== null) return null;
  const dx = targetX - ball.position.x;
  if (dx * ball.velocity.x <= 0.5) return null;
  const time = dx / ball.velocity.x;
  if (time < 0 || time > 1.6) return null;
  const predZ = ball.position.z + ball.velocity.z * time;
  const predY = Math.max(
    BALL_RADIUS,
    ball.position.y + ball.velocity.y * time - 0.5 * GRAVITY * time * time
  );
  return { time, z: predZ, y: predY };
}
function attemptGoalkeeperSave(gk, ball) {
  if (ball.ownerId !== null || ball.pickupLockTimer > 0) return null;
  if (gk.kickCooldown > 0) return null;
  const dx = ball.position.x - gk.position.x;
  const dz = ball.position.z - gk.position.z;
  const horizDist = Math.hypot(dx, dz);
  const isDiving = gk.actionState === "dive";
  const reachRadius = isDiving ? 1.58 : 1.05;
  const maxReachHeight = isDiving ? 2.28 : 2.15;
  if (horizDist > reachRadius || ball.position.y > maxReachHeight) {
    return null;
  }
  const ballSpeed = Math.hypot(ball.velocity.x, ball.velocity.z);
  const attackDir = gk.team === "home" ? 1 : -1;
  const isHardSave = ball.lastTouchTeam !== gk.team && (ballSpeed > 18.5 || isDiving && ballSpeed > 14.5 && horizDist > 0.9);
  if (isHardSave) {
    const deflectZ = Math.abs(dz) > 0.12 ? Math.sign(dz) * 0.82 : gk.position.z >= 0 ? 0.78 : -0.78;
    ball.velocity.x = attackDir * (8.5 + Math.random() * 3.5);
    ball.velocity.z = deflectZ * (10 + Math.random() * 3.5);
    ball.velocity.y = 2.8;
    ball.pickupLockTimer = 0.22;
    ball.lastTouchTeam = gk.team;
    ball.lastTouchPlayerName = gk.name;
    gk.kickCooldown = 0.35;
    return "parry";
  }
  return "catch";
}
function stepBallPhysics(ball, dt) {
  const result = {
    scoredTeam: null,
    outOfBounds: null,
    hitPost: false,
    bouncedOnTurf: false
  };
  if (ball.pickupLockTimer > 0) {
    ball.pickupLockTimer = Math.max(0, ball.pickupLockTimer - dt);
  }
  if (ball.ownerId !== null) {
    return result;
  }
  if (ball.position.y > BALL_RADIUS + 2e-3 || ball.velocity.y > 0.01) {
    ball.velocity.y -= GRAVITY * dt;
  }
  if (ball.position.y > BALL_RADIUS + 0.08) {
    ball.velocity.z += ball.spin.y * 0.35 * dt;
  }
  ball.position.x += ball.velocity.x * dt;
  ball.position.y += ball.velocity.y * dt;
  ball.position.z += ball.velocity.z * dt;
  if (ball.position.y <= BALL_RADIUS) {
    ball.position.y = BALL_RADIUS;
    if (ball.velocity.y < -1.1) {
      ball.velocity.y = -ball.velocity.y * BALL_BOUNCE_RESTITUTION;
      result.bouncedOnTurf = true;
    } else {
      ball.velocity.y = 0;
    }
    const frictionFactor = Math.pow(BALL_TURF_FRICTION, dt * 60);
    ball.velocity.x *= frictionFactor;
    ball.velocity.z *= frictionFactor;
    ball.spin.x *= frictionFactor;
    ball.spin.y *= frictionFactor;
    ball.spin.z *= frictionFactor;
  } else {
    const dragFactor = Math.pow(BALL_AIR_DRAG, dt * 60);
    ball.velocity.x *= dragFactor;
    ball.velocity.z *= dragFactor;
  }
  const horizSpeedSq = ball.velocity.x * ball.velocity.x + ball.velocity.z * ball.velocity.z;
  if (ball.position.y <= BALL_RADIUS + 5e-3 && ball.velocity.y === 0 && horizSpeedSq < BALL_STOP_SPEED * BALL_STOP_SPEED) {
    ball.velocity.x = 0;
    ball.velocity.z = 0;
    ball.spin.x = 0;
    ball.spin.y = 0;
    ball.spin.z = 0;
  }
  for (const goalSign of [-1, 1]) {
    const goalX = goalSign * HALF_LENGTH;
    if (ball.position.y <= GOAL_HEIGHT + BALL_RADIUS) {
      for (const zSign of [-1, 1]) {
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
  const inGoalMouthZ = Math.abs(ball.position.z) < GOAL_HALF_WIDTH - BALL_RADIUS * 0.4;
  const underCrossbar = ball.position.y < GOAL_HEIGHT - BALL_RADIUS * 0.3;
  if (inGoalMouthZ && underCrossbar) {
    if (ball.position.x > HALF_LENGTH + BALL_RADIUS) {
      result.scoredTeam = "home";
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
      result.scoredTeam = "away";
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
  if (Math.abs(ball.position.z) > HALF_WIDTH + BALL_RADIUS) {
    result.outOfBounds = "sideline";
  } else if (ball.position.x < -HALF_LENGTH - BALL_RADIUS) {
    result.outOfBounds = "endline_home";
  } else if (ball.position.x > HALF_LENGTH + BALL_RADIUS) {
    result.outOfBounds = "endline_away";
  }
  return result;
}
function applyBallKick(ball, dirX, dirZ, horizontalSpeed, loftSpeed, kicker, sideSpin = 0) {
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
  kicker.actionState = "kick";
  kicker.actionTimer = 0.25;
  kicker.kickCooldown = 0.35;
}
function resolvePlayerCollisions(players) {
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
function clampPlayerToArena(pos) {
  const maxX = HALF_LENGTH + 3.2;
  const maxZ = HALF_WIDTH + 2.8;
  if (pos.x < -maxX) pos.x = -maxX;
  else if (pos.x > maxX) pos.x = maxX;
  if (pos.z < -maxZ) pos.z = -maxZ;
  else if (pos.z > maxZ) pos.z = maxZ;
}

// src/game/rules.ts
function computeMatchClock(half, halfElapsedRealSeconds, halfDurationSeconds) {
  const safeDuration = Math.max(10, halfDurationSeconds);
  const progress = Math.min(1, Math.max(0, halfElapsedRealSeconds / safeDuration));
  const totalGameSecondsInHalf = progress * 45 * 60;
  const baseMinutes = half === 1 ? 0 : 45;
  const matchMinutes = baseMinutes + Math.floor(totalGameSecondsInHalf / 60);
  const matchSeconds = Math.floor(totalGameSecondsInHalf % 60);
  let phaseTransition = null;
  if (halfElapsedRealSeconds >= safeDuration) {
    phaseTransition = half === 1 ? "halftime" : "fulltime";
  }
  return { matchMinutes, matchSeconds, phaseTransition };
}
function createTeamPlayers(teamConfig, side, formationId) {
  const formation = FORMATIONS[formationId] ?? FORMATIONS["4-3-3"];
  const facing = side === "home" ? Math.PI / 2 : -Math.PI / 2;
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
      actionState: "idle",
      actionTimer: 0,
      tackleCooldown: 0,
      kickCooldown: 0,
      diveCooldown: 0,
      diveDir: 0,
      gkHoldTimer: 0,
      hasBall: false,
      isControlled: side === "home" && index === 9,
      // Striker starts controlled
      animPhase: index * 0.7
    };
  });
}
function resetForKickoff(players, ball, homeFormation, awayFormation, kickoffTeam) {
  ball.position = { x: 0, y: BALL_RADIUS, z: 0 };
  ball.velocity = { x: 0, y: 0, z: 0 };
  ball.spin = { x: 0, y: 0, z: 0 };
  ball.ownerId = null;
  ball.pickupLockTimer = 0;
  const homeSlots = FORMATIONS[homeFormation].slots;
  const awaySlots = FORMATIONS[awayFormation].slots;
  let controlledAssigned = false;
  for (const p of players) {
    const formationId = p.team === "home" ? homeFormation : awayFormation;
    const slots = p.team === "home" ? homeSlots : awaySlots;
    const slot = slots[p.slotIndex] ?? slots[0];
    const pos = getFormationWorldPosition(slot, p.team, 0, 0, true, formationId);
    if (p.team === kickoffTeam && p.slotIndex === 9) {
      pos.x = kickoffTeam === "home" ? -0.9 : 0.9;
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
    p.facingAngle = p.team === "home" ? Math.PI / 2 : -Math.PI / 2;
    p.hasBall = false;
    p.actionState = "idle";
    p.actionTimer = 0;
    p.diveDir = 0;
    p.gkHoldTimer = 0;
    if (p.team === "home") {
      p.isControlled = p.slotIndex === 9;
      if (p.isControlled) controlledAssigned = true;
    } else {
      p.isControlled = false;
    }
  }
  if (!controlledAssigned) {
    const firstHome = players.find((p) => p.team === "home" && p.role !== "GK");
    if (firstHome) firstHome.isControlled = true;
  }
}
function selectSwitchTarget(players, ball, team, currentControlledId) {
  let best = null;
  let bestScore = Infinity;
  for (const p of players) {
    if (p.team !== team || p.role === "GK" || p.id === currentControlledId) continue;
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
function evaluatePassLaneClearance(passer, receiver, allPlayers) {
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
function computeLeadPassVector(passer, receiver, isLob) {
  const rawDx = receiver.position.x - passer.position.x;
  const rawDz = receiver.position.z - passer.position.z;
  const rawDist = Math.hypot(rawDx, rawDz) || 1;
  const passKind = isLob ? "lob" : rawDist <= 15 ? "short" : "long";
  const facingX = Math.sin(passer.facingAngle);
  const facingZ = Math.cos(passer.facingAngle);
  const alignDot = rawDx / rawDist * facingX + rawDz / rawDist * facingZ;
  const alignFactor = Math.max(0.76, Math.min(1.04, 0.88 + alignDot * 0.16));
  const passerSpeed = Math.hypot(passer.velocity.x, passer.velocity.z);
  const speedPenalty = Math.min(1, passerSpeed / 10) * 0.032;
  let estSpeed;
  let loft;
  let leadFactor;
  let baseSpread;
  if (passKind === "lob") {
    estSpeed = Math.min(24.5, Math.max(14.5, 11.5 + rawDist * 0.42)) * alignFactor;
    loft = Math.min(9.4, Math.max(5.8, 5.2 + rawDist * 0.135));
    leadFactor = 0.64;
    baseSpread = 0.068;
  } else if (passKind === "short") {
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
  const skillError = (100 - passer.attributes.passing) / 100 * 0.055;
  const offAxisError = alignDot < 0.15 ? (0.15 - alignDot) * 0.045 : 0;
  const spreadFactor = baseSpread + skillError + speedPenalty + offAxisError;
  return {
    dirX: leadX - passer.position.x,
    dirZ: leadZ - passer.position.z,
    speed: estSpeed,
    loft,
    passKind,
    spreadFactor
  };
}
function findBestPassTarget(passer, players, aimX, aimZ, isLob = false) {
  const aimLen = Math.hypot(aimX, aimZ);
  const facingX = Math.sin(passer.facingAngle);
  const facingZ = Math.cos(passer.facingAngle);
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
  let best = null;
  let bestScore = -Infinity;
  const idealDist = isLob ? 24 : 14;
  const maxDist = isLob ? 54 : 46;
  for (const p of players) {
    if (p.team !== passer.team || p.id === passer.id) continue;
    const dx = p.position.x - passer.position.x;
    const dz = p.position.z - passer.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < (isLob ? 6.5 : 2.2) || dist > maxDist) continue;
    const dot = dx / dist * dirX + dz / dist * dirZ;
    if (dot < 0.16) continue;
    const laneClear = evaluatePassLaneClearance(passer, p, players);
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
function evaluateInterception(defender, ball) {
  if (ball.ownerId !== null || defender.role === "GK" || defender.kickCooldown > 0) {
    return "none";
  }
  if (ball.lastTouchTeam === defender.team) return "none";
  const dx = ball.position.x - defender.position.x;
  const dz = ball.position.z - defender.position.z;
  const horizDist = Math.hypot(dx, dz);
  const isTackling = defender.actionState === "tackle";
  const maxReach = isTackling ? 1.22 : 0.86;
  if (horizDist > maxReach || ball.position.y > 1.92) {
    return "none";
  }
  const ballSpeed = Math.hypot(ball.velocity.x, ball.velocity.z);
  if (ball.position.y > 1.35) {
    return horizDist <= 0.72 ? "block" : "none";
  }
  if (ballSpeed < 10.5) {
    return "intercept";
  }
  const facingX = Math.sin(defender.facingAngle);
  const facingZ = Math.cos(defender.facingAngle);
  const toBallDot = horizDist > 0.01 ? dx / horizDist * facingX + dz / horizDist * facingZ : 1;
  if (!isTackling && toBallDot < -0.15 && horizDist > 0.56) {
    return "none";
  }
  if (ballSpeed > 17.5) {
    return horizDist <= (isTackling ? 1.05 : 0.74) ? "block" : "none";
  }
  return "intercept";
}
function getRestartPositionForOutOfBounds(outType, ballX, ballZ, lastTouchTeam) {
  const clampedX = Math.max(-HALF_LENGTH + 1, Math.min(HALF_LENGTH - 1, ballX));
  const clampedZ = Math.sign(ballZ || 1) * 33.4;
  if (outType === "sideline") {
    const restartTeam = lastTouchTeam === "home" ? "away" : "home";
    return { x: clampedX, z: clampedZ, restartTeam, isCorner: false, type: "throw_in" };
  }
  if (outType === "endline_home") {
    if (lastTouchTeam === "home") {
      return {
        x: -HALF_LENGTH + 0.6,
        z: Math.sign(ballZ || 1) * 33.4,
        restartTeam: "away",
        isCorner: true,
        type: "corner"
      };
    }
    return {
      x: -HALF_LENGTH + GOAL_AREA_LENGTH,
      z: Math.sign(ballZ || 1) * 4.5,
      restartTeam: "home",
      isCorner: false,
      type: "goal_kick"
    };
  }
  if (lastTouchTeam === "away") {
    return {
      x: HALF_LENGTH - 0.6,
      z: Math.sign(ballZ || 1) * 33.4,
      restartTeam: "home",
      isCorner: true,
      type: "corner"
    };
  }
  return {
    x: HALF_LENGTH - GOAL_AREA_LENGTH,
    z: Math.sign(ballZ || 1) * 4.5,
    restartTeam: "away",
    isCorner: false,
    type: "goal_kick"
  };
}
function isInsidePenaltyArea(x, z, defendingTeam) {
  const halfBoxW = PENALTY_AREA_WIDTH / 2;
  if (Math.abs(z) > halfBoxW) return false;
  if (defendingTeam === "home") {
    return x >= -HALF_LENGTH - 0.5 && x <= -HALF_LENGTH + PENALTY_AREA_LENGTH;
  }
  return x <= HALF_LENGTH + 0.5 && x >= HALF_LENGTH - PENALTY_AREA_LENGTH;
}
function isCleanTackleAngle(tackler, victim, ball) {
  const distToBall = Math.hypot(
    ball.position.x - tackler.position.x,
    ball.position.z - tackler.position.z
  );
  if (distToBall > TACKLE_REACH) return false;
  const dxToVictim = victim.position.x - tackler.position.x;
  const dzToVictim = victim.position.z - tackler.position.z;
  const distToVictim = Math.hypot(dxToVictim, dzToVictim);
  if (distToVictim > 1e-3) {
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
function classifyTackleFoul(tackler, victim, ball) {
  if (!victim.hasBall || victim.team === tackler.team) return "none";
  if (tackler.actionState !== "tackle") return "none";
  const dxToVictim = victim.position.x - tackler.position.x;
  const dzToVictim = victim.position.z - tackler.position.z;
  const distToVictim = Math.hypot(dxToVictim, dzToVictim);
  const distToBall = Math.hypot(
    ball.position.x - tackler.position.x,
    ball.position.z - tackler.position.z
  );
  if (distToVictim > TACKLE_REACH && distToBall > TACKLE_REACH) return "none";
  if (distToBall <= 1.05 && distToBall <= distToVictim + 0.25) {
    return "clean";
  }
  if (distToVictim <= 0.78 && distToBall > 1.15 && distToBall > distToVictim * 1.45) {
    const victimFwdX = Math.sin(victim.facingAngle);
    const victimFwdZ = Math.cos(victim.facingAngle);
    const invDist = distToVictim > 1e-3 ? 1 / distToVictim : 1;
    const fromVictimX = -dxToVictim * invDist;
    const fromVictimZ = -dzToVictim * invDist;
    const behindDot = fromVictimX * victimFwdX + fromVictimZ * victimFwdZ;
    const toVictimX = dxToVictim * invDist;
    const toVictimZ = dzToVictim * invDist;
    const closingSpeed = tackler.velocity.x * toVictimX + tackler.velocity.z * toVictimZ;
    if (behindDot < -0.35 && closingSpeed >= 4.5) {
      return isInsidePenaltyArea(victim.position.x, victim.position.z, tackler.team) ? "penalty" : "free_kick";
    }
  }
  if (distToBall <= TACKLE_REACH * 0.88) {
    return "clean";
  }
  return "none";
}
function computeSetPieceSetup(type, rawSpot, restartTeam, players, ball) {
  const attackDir = restartTeam === "home" ? 1 : -1;
  const oppGoalX = attackDir * HALF_LENGTH;
  const ownGoalX = -attackDir * HALF_LENGTH;
  let spot = {
    x: Math.max(-HALF_LENGTH + 0.5, Math.min(HALF_LENGTH - 0.5, rawSpot.x)),
    y: BALL_RADIUS,
    z: Math.max(-HALF_WIDTH + 0.4, Math.min(HALF_WIDTH - 0.4, rawSpot.z))
  };
  if (type === "penalty") {
    spot = {
      x: attackDir * (HALF_LENGTH - PENALTY_SPOT_DIST),
      y: BALL_RADIUS,
      z: 0
    };
  } else if (type === "throw_in") {
    spot = {
      x: Math.max(-HALF_LENGTH + 1.2, Math.min(HALF_LENGTH - 1.2, rawSpot.x)),
      y: BALL_RADIUS,
      z: Math.sign(rawSpot.z || 1) * (HALF_WIDTH - 0.35)
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
    p.actionState = "idle";
    p.actionTimer = 0;
    p.diveDir = 0;
  }
  let taker = null;
  if (type === "goal_kick") {
    taker = players.find((p) => p.team === restartTeam && p.role === "GK") ?? null;
  } else if (type === "penalty") {
    taker = players.find((p) => p.team === restartTeam && p.slotIndex === 9) ?? players.find((p) => p.team === restartTeam && p.role !== "GK") ?? null;
  } else if (type === "corner") {
    taker = players.find((p) => p.team === restartTeam && (p.role === "LW" || p.role === "RW")) ?? players.find((p) => p.team === restartTeam && p.role !== "GK") ?? null;
  } else {
    let bestDist = Infinity;
    for (const p of players) {
      if (p.team !== restartTeam || p.role === "GK") continue;
      const d = Math.hypot(p.position.x - spot.x, p.position.z - spot.z);
      if (d < bestDist) {
        bestDist = d;
        taker = p;
      }
    }
  }
  if (taker) {
    if (type === "throw_in") {
      const zSign = spot.z >= 0 ? 1 : -1;
      taker.position.x = spot.x;
      taker.position.z = spot.z + zSign * 0.75;
      taker.facingAngle = Math.atan2(attackDir * 0.25, -zSign);
    } else if (type === "penalty") {
      taker.position.x = spot.x - attackDir * 1.75;
      taker.position.z = 0;
      taker.facingAngle = Math.atan2(attackDir, 0);
    } else if (type === "corner") {
      const zSign = spot.z >= 0 ? 1 : -1;
      taker.position.x = spot.x + attackDir * 0.65;
      taker.position.z = spot.z + zSign * 0.65;
      taker.facingAngle = Math.atan2(-attackDir, -zSign);
    } else {
      const toGoalX = oppGoalX - spot.x;
      const toGoalZ = 0 - spot.z;
      const len = Math.hypot(toGoalX, toGoalZ) || 1;
      taker.position.x = spot.x - toGoalX / len * 0.9;
      taker.position.z = spot.z - toGoalZ / len * 0.9;
      taker.facingAngle = Math.atan2(toGoalX, toGoalZ);
    }
    ball.lastTouchPlayerName = taker.name;
  }
  if (type === "penalty") {
    const boxEdgeX = oppGoalX - attackDir * (PENALTY_AREA_LENGTH + 1.8);
    let idx = 0;
    for (const p of players) {
      if (taker && p.id === taker.id) continue;
      if (p.team !== restartTeam && p.role === "GK") {
        p.position.x = oppGoalX - attackDir * 0.45;
        p.position.z = 0;
        p.facingAngle = Math.atan2(-attackDir, 0);
      } else if (p.team === restartTeam && p.role === "GK") {
        p.position.x = ownGoalX + attackDir * 2;
        p.position.z = 0;
        p.facingAngle = Math.atan2(attackDir, 0);
      } else {
        const laneZ = (idx % 6 - 2.5) * 4.2;
        const depthOffset = p.team === restartTeam ? -1.5 : -3.2;
        p.position.x = boxEdgeX + attackDir * depthOffset;
        p.position.z = laneZ;
        p.facingAngle = Math.atan2(oppGoalX - p.position.x, -p.position.z);
        idx++;
      }
    }
  } else if (type === "corner") {
    let atkCount = 0;
    let defCount = 0;
    for (const p of players) {
      if (taker && p.id === taker.id) continue;
      if (p.team !== restartTeam && p.role === "GK") {
        p.position.x = oppGoalX - attackDir * 1.1;
        p.position.z = Math.sign(spot.z || 1) * 0.8;
        p.facingAngle = Math.atan2(-attackDir, spot.z);
      } else if (p.team === restartTeam && p.role === "GK") {
        p.position.x = ownGoalX + attackDir * 3.5;
        p.position.z = 0;
      } else if (p.team === restartTeam) {
        if (atkCount < 5) {
          p.position.x = oppGoalX - attackDir * (6.5 + atkCount % 3 * 2.4);
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
          p.position.x = oppGoalX - attackDir * (4.8 + defCount % 3 * 2.2);
          p.position.z = (defCount - 2.5) * 2.7;
          p.facingAngle = Math.atan2(-attackDir, spot.z - p.position.z);
        } else {
          p.position.x = oppGoalX - attackDir * 18;
          p.position.z = (defCount - 6.5) * 7;
        }
        defCount++;
      }
    }
  } else if (type === "free_kick") {
    const distToGoal = Math.hypot(oppGoalX - spot.x, 0 - spot.z);
    const dirX = (oppGoalX - spot.x) / (distToGoal || 1);
    const dirZ = (0 - spot.z) / (distToGoal || 1);
    const perpX = -dirZ;
    const perpZ = dirX;
    const defenders = players.filter((p) => p.team !== restartTeam && p.role !== "GK").sort(
      (a, b) => Math.hypot(a.position.x - spot.x, a.position.z - spot.z) - Math.hypot(b.position.x - spot.x, b.position.z - spot.z)
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
      } else if (p.team !== restartTeam && p.role !== "GK") {
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
    const minBuffer = type === "goal_kick" ? 13 : 3.5;
    for (const p of players) {
      if (taker && p.id === taker.id) continue;
      if (p.team !== restartTeam && p.role !== "GK") {
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
  for (const p of players) {
    if (p.team !== "home") {
      p.isControlled = false;
      continue;
    }
    if (restartTeam === "home") {
      p.isControlled = taker ? p.id === taker.id : p.slotIndex === 9;
    } else if (type === "penalty") {
      p.isControlled = p.role === "GK";
    } else {
      p.isControlled = false;
    }
  }
  if (restartTeam === "away" && type !== "penalty") {
    const closestHome = selectSwitchTarget(players, ball, "home", null);
    if (closestHome) closestHome.isControlled = true;
  }
  return { takerId: taker?.id ?? null, spot };
}

// src/ai/basicAi.ts
function computeDefensiveAssignments(players, ball, team) {
  let presserId = null;
  let coverId = null;
  let best1 = Infinity;
  let best2 = Infinity;
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (p.team !== team || p.role === "GK" || p.isControlled) continue;
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
function computeAiSteering(player, allPlayers, ball, formationId, closestPresserId, coverDefenderId = null, mentality = "balanced", transitionMode = "none") {
  const formation = FORMATIONS[formationId] ?? FORMATIONS["4-3-3"];
  const tactics = getFormationTactics(formationId, mentality);
  const slot = formation.slots[player.slotIndex] ?? formation.slots[0];
  const anchor = getFormationWorldPosition(
    slot,
    player.team,
    ball.position.x,
    ball.position.z,
    false,
    formationId,
    mentality
  );
  const attackDir = player.team === "home" ? 1 : -1;
  const oppGoalX = attackDir * HALF_LENGTH;
  const ownGoalX = -attackDir * HALF_LENGTH;
  if (player.role === "GK") {
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
          passTarget: null
        };
      }
      let bestOutlet = null;
      let bestOutletScore = -Infinity;
      for (let i = 0; i < allPlayers.length; i++) {
        const mate = allPlayers[i];
        if (mate.team !== player.team || mate.id === player.id) continue;
        const dx = (mate.position.x - player.position.x) * attackDir;
        if (dx < 5 || dx > 48) continue;
        const dist = Math.hypot(mate.position.x - player.position.x, mate.position.z - player.position.z);
        const laneClear = evaluatePassLaneClearance(player, mate, allPlayers);
        if (laneClear < 0.3) continue;
        const wideBonus = Math.abs(mate.position.z) > 10 ? 0.55 : 0;
        const score = laneClear * 2.4 + wideBonus - Math.abs(dist - 20) * 0.025;
        if (score > bestOutletScore) {
          bestOutletScore = score;
          bestOutlet = mate;
        }
      }
      const outletDist = bestOutlet ? Math.hypot(bestOutlet.position.x - player.position.x, bestOutlet.position.z - player.position.z) : 32;
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
        preferLob: !bestOutlet || outletDist > 22
      };
    }
    const shotCross = predictBallCrossingX(ball, gkBaseX);
    const ballSpeed = Math.hypot(ball.velocity.x, ball.velocity.z);
    if (shotCross && shotCross.time < 0.76 && ballSpeed > 10.5 && Math.abs(shotCross.z) <= GOAL_HALF_WIDTH + 1.15 && shotCross.y <= 2.65) {
      const zDiff = shotCross.z - player.position.z;
      const shouldDive = player.diveCooldown <= 0 && Math.abs(zDiff) > 0.65 && shotCross.time < 0.44;
      return {
        desiredX: gkBaseX,
        desiredZ: Math.max(-GOAL_HALF_WIDTH, Math.min(GOAL_HALF_WIDTH, shotCross.z)),
        sprint: true,
        shouldPass: false,
        shouldShoot: false,
        shouldTackle: false,
        shouldDive,
        diveDir: shouldDive ? zDiff >= 0 ? 1 : -1 : 0,
        passTarget: null
      };
    }
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
          passTarget: null
        };
      }
    }
    const distBallFromGoal = Math.hypot(ball.position.x - ownGoalX, ball.position.z);
    const stepOut = Math.min(4.2, Math.max(1.25, 4.7 - distBallFromGoal * 0.06));
    const idealX = ownGoalX + attackDir * stepOut;
    const idealZ = Math.max(
      -GOAL_HALF_WIDTH * 0.84,
      Math.min(GOAL_HALF_WIDTH * 0.84, ball.position.z * (distBallFromGoal < 18 ? 0.44 : 0.34))
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
      passTarget: null
    };
  }
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
        passTarget: null
      };
    }
    let nearestOppDist = Infinity;
    let nearestOpp = null;
    for (let i = 0; i < allPlayers.length; i++) {
      const other = allPlayers[i];
      if (other.team === player.team) continue;
      const d = Math.hypot(other.position.x - player.position.x, other.position.z - player.position.z);
      if (d < nearestOppDist) {
        nearestOppDist = d;
        nearestOpp = other;
      }
    }
    let bestTarget = null;
    let bestPassScore = -Infinity;
    let bestTargetLaneClear = 1;
    for (let i = 0; i < allPlayers.length; i++) {
      const mate = allPlayers[i];
      if (mate.team !== player.team || mate.id === player.id || mate.role === "GK") continue;
      const dx = mate.position.x - player.position.x;
      const dz = mate.position.z - player.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 5 || dist > 40) continue;
      const forwardProgress = dx * attackDir;
      const laneClear = evaluatePassLaneClearance(player, mate, allPlayers);
      const canLobOver = dist > 16 && forwardProgress > 8 && laneClear >= 0.08;
      if (laneClear < 0.28 && !canLobOver) continue;
      const counterBonus = transitionMode === "attack" && forwardProgress > 8 ? 0.85 : 0;
      const score = forwardProgress * 0.14 + laneClear * 2.1 + counterBonus - Math.abs(dist - 15) * 0.028;
      if (score > bestPassScore) {
        bestPassScore = score;
        bestTarget = mate;
        bestTargetLaneClear = laneClear;
      }
    }
    if (bestTarget && (nearestOppDist < 5 || (bestTarget.position.x - player.position.x) * attackDir > 7.5 && bestPassScore > 2.15)) {
      const targetDist = Math.hypot(
        bestTarget.position.x - player.position.x,
        bestTarget.position.z - player.position.z
      );
      const preferLob = targetDist > 23 || targetDist > 16 && bestTargetLaneClear < 0.38;
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
        preferLob
      };
    }
    let targetZ = player.position.z * 0.74;
    if (nearestOpp && nearestOppDist < 7.5) {
      const awayZ = player.position.z - nearestOpp.position.z;
      targetZ = player.position.z + (awayZ >= 0 ? 4.8 : -4.8);
      targetZ = Math.max(-HALF_WIDTH + 3, Math.min(HALF_WIDTH - 3, targetZ));
    }
    return {
      desiredX: oppGoalX,
      desiredZ: targetZ,
      sprint: distToOppGoal > 15 && nearestOppDist > 4,
      shouldPass: false,
      shouldShoot: false,
      shouldTackle: false,
      shouldDive: false,
      diveDir: 0,
      passTarget: null
    };
  }
  let owner = null;
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
    const isAttacker = player.role === "ST" || player.role === "LW" || player.role === "RW" || player.role === "CAM";
    const distToOwner = Math.hypot(
      owner.position.x - player.position.x,
      owner.position.z - player.position.z
    );
    if (isAttacker) {
      const counterPush = transitionMode === "attack" ? 5.5 : 0;
      const pushDist = 13.5 + tactics.attackPushMeters + counterPush;
      let runDepth = Math.min(
        HALF_LENGTH - 5.5,
        Math.max(anchor.x, ball.position.x + attackDir * pushDist)
      );
      if (attackDir < 0) {
        runDepth = Math.max(
          -HALF_LENGTH + 5.5,
          Math.min(anchor.x, ball.position.x + attackDir * pushDist)
        );
      }
      let runWidth;
      if (player.role === "LW") {
        runWidth = -HALF_WIDTH * 0.62 * tactics.widthScale * attackDir;
      } else if (player.role === "RW") {
        runWidth = HALF_WIDTH * 0.62 * tactics.widthScale * attackDir;
      } else if (player.role === "ST") {
        const channelBias = owner.position.z >= 0 ? -4.5 : 4.5;
        runWidth = Math.max(-11, Math.min(11, anchor.z * 0.45 + channelBias));
      } else {
        runWidth = Math.max(-15, Math.min(15, owner.position.z * 0.5 + (owner.position.z >= 0 ? -7.5 : 7.5)));
      }
      const clampedX = Math.max(-HALF_LENGTH + 5, Math.min(HALF_LENGTH - 5, runDepth));
      return {
        desiredX: clampedX,
        desiredZ: Math.max(-HALF_WIDTH + 2.5, Math.min(HALF_WIDTH - 2.5, runWidth)),
        sprint: transitionMode === "attack" || Math.abs(clampedX - player.position.x) > 5.5,
        shouldPass: false,
        shouldShoot: false,
        shouldTackle: false,
        shouldDive: false,
        diveDir: 0,
        passTarget: null
      };
    }
    if ((player.role === "CM" || player.role === "CDM") && distToOwner < 28) {
      const forwardOffset = player.role === "CM" ? 6.5 : -6;
      const supportX2 = Math.max(
        -HALF_LENGTH + 6,
        Math.min(
          HALF_LENGTH - 6,
          owner.position.x + attackDir * (forwardOffset + tactics.attackPushMeters * 0.45)
        )
      );
      const preferredSign = Math.abs(player.position.z - owner.position.z) > 1.5 ? player.position.z >= owner.position.z ? 1 : -1 : owner.position.z >= 0 ? -1 : 1;
      const supportZ2 = Math.max(
        -HALF_WIDTH + 3.5,
        Math.min(HALF_WIDTH - 3.5, owner.position.z + preferredSign * 10.5)
      );
      return {
        desiredX: supportX2,
        desiredZ: supportZ2,
        sprint: Math.hypot(supportX2 - player.position.x, supportZ2 - player.position.z) > 8,
        shouldPass: false,
        shouldShoot: false,
        shouldTackle: false,
        shouldDive: false,
        diveDir: 0,
        passTarget: null
      };
    }
    let supportX = Math.max(
      -HALF_LENGTH + 4.5,
      Math.min(HALF_LENGTH - 4.5, anchor.x + attackDir * (6 + tactics.attackPushMeters * 0.5))
    );
    let supportZ = anchor.z;
    if (distToOwner < 7) {
      supportX -= attackDir * 3.5;
      supportZ += player.position.z >= owner.position.z ? 4 : -4;
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
      passTarget: null
    };
  }
  if (player.id === closestPresserId) {
    const targetX = ball.position.x + ball.velocity.x * 0.16;
    const targetZ = ball.position.z + ball.velocity.z * 0.16;
    const distToBall = Math.hypot(ball.position.x - player.position.x, ball.position.z - player.position.z);
    const tackleTriggerRange = TACKLE_REACH * (0.92 + tactics.pressIntensity * 0.09);
    const canAttemptTackle = owner != null && owner.team !== player.team && distToBall < tackleTriggerRange && player.tackleCooldown <= 0 && isCleanTackleAngle(player, owner, ball);
    return {
      desiredX: Math.max(-HALF_LENGTH + 2, Math.min(HALF_LENGTH - 2, targetX)),
      desiredZ: Math.max(-HALF_WIDTH + 2, Math.min(HALF_WIDTH - 2, targetZ)),
      sprint: transitionMode === "defend" || tactics.pressIntensity >= 0.85 || distToBall < 14,
      shouldPass: false,
      shouldShoot: false,
      shouldTackle: canAttemptTackle,
      shouldDive: false,
      diveDir: 0,
      passTarget: null
    };
  }
  if (coverDefenderId && player.id === coverDefenderId) {
    const toGoalX = ownGoalX - ball.position.x;
    const toGoalZ = 0 - ball.position.z;
    const toGoalLen = Math.hypot(toGoalX, toGoalZ) || 1;
    const coverDist = tactics.pressIntensity > 1.1 ? 5 : 6.4;
    let coverX = ball.position.x + toGoalX / toGoalLen * coverDist;
    let coverZ = ball.position.z + toGoalZ / toGoalLen * coverDist;
    if (owner && owner.team !== player.team) {
      let bestRunner = null;
      let bestThreat = -Infinity;
      for (let i = 0; i < allPlayers.length; i++) {
        const opp = allPlayers[i];
        if (opp.team === player.team || opp.id === owner.id || opp.role === "GK") continue;
        const dFromBall = Math.hypot(opp.position.x - ball.position.x, opp.position.z - ball.position.z);
        if (dFromBall < 6 || dFromBall > 26) continue;
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
      sprint: transitionMode === "defend" || Math.hypot(coverX - player.position.x, coverZ - player.position.z) > 5.5,
      shouldPass: false,
      shouldShoot: false,
      shouldTackle: false,
      shouldDive: false,
      diveDir: 0,
      passTarget: null
    };
  }
  const isDefender = player.role === "CB" || player.role === "LB" || player.role === "RB" || player.role === "CDM";
  if (isDefender) {
    let markTarget = null;
    let bestMarkDist = 15.5;
    for (let i = 0; i < allPlayers.length; i++) {
      const opp = allPlayers[i];
      if (opp.team === player.team || opp.role === "GK") continue;
      const d = Math.hypot(opp.position.x - anchor.x, opp.position.z - anchor.z);
      if (d < bestMarkDist) {
        bestMarkDist = d;
        markTarget = opp;
      }
    }
    if (markTarget) {
      const predX = markTarget.position.x + markTarget.velocity.x * 0.25;
      const predZ = markTarget.position.z + markTarget.velocity.z * 0.25;
      const markX = predX - attackDir * 2;
      const markZ = predZ * 0.9;
      return {
        desiredX: Math.max(-HALF_LENGTH + 3.5, Math.min(HALF_LENGTH - 3.5, markX)),
        desiredZ: Math.max(-HALF_WIDTH + 2.5, Math.min(HALF_WIDTH - 2.5, markZ)),
        sprint: transitionMode === "defend" || Math.hypot(markX - player.position.x, markZ - player.position.z) > 4.8,
        shouldPass: false,
        shouldShoot: false,
        shouldTackle: false,
        shouldDive: false,
        diveDir: 0,
        passTarget: null
      };
    }
  }
  const recoveryShift = transitionMode === "defend" ? -attackDir * 5 : 0;
  const recoverX = Math.max(-HALF_LENGTH + 4, Math.min(HALF_LENGTH - 4, anchor.x + recoveryShift));
  return {
    desiredX: recoverX,
    desiredZ: anchor.z,
    sprint: transitionMode === "defend" && Math.hypot(recoverX - player.position.x, anchor.z - player.position.z) > 6,
    shouldPass: false,
    shouldShoot: false,
    shouldTackle: false,
    shouldDive: false,
    diveDir: 0,
    passTarget: null
  };
}
function executeAiBallAction(player, ball, steering, allPlayers = [], onSound) {
  const attackDir = player.team === "home" ? 1 : -1;
  if (steering.shouldShoot) {
    const oppGk = allPlayers.find((p) => p.team !== player.team && p.role === "GK");
    const gkZ = oppGk?.position.z ?? 0;
    const cornerSign = gkZ >= 0 ? -1 : 1;
    const targetZ = cornerSign * (GOAL_HALF_WIDTH * 0.65);
    const shot = computeContextualShot(
      player,
      attackDir * HALF_LENGTH,
      targetZ,
      0.58,
      allPlayers,
      player.actionState === "sprint"
    );
    applyBallKick(
      ball,
      shot.dirX,
      shot.dirZ,
      shot.horizontalSpeed,
      shot.loftSpeed,
      player,
      shot.sideSpin
    );
    onSound?.("kick");
    return;
  }
  if (steering.shouldPass && steering.passTarget) {
    const dist = Math.hypot(
      steering.passTarget.position.x - player.position.x,
      steering.passTarget.position.z - player.position.z
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
      player
    );
    onSound?.(isLob ? "kick" : "pass");
  } else if (steering.shouldPass && player.role === "GK") {
    applyBallKick(ball, attackDir, (Math.random() - 0.5) * 0.45, 22, 6.4, player);
    onSound?.("kick");
  }
}
function computeSetPieceAiDecision(taker, type, ball, allPlayers) {
  const attackDir = taker.team === "home" ? 1 : -1;
  const oppGoalX = attackDir * HALF_LENGTH;
  if (type === "penalty") {
    const oppGk = allPlayers.find((p) => p.team !== taker.team && p.role === "GK");
    const cornerSign = (oppGk?.position.z ?? 0) >= 0 ? -1 : 1;
    const targetZ = cornerSign * (GOAL_HALF_WIDTH * 0.72);
    return {
      dirX: oppGoalX - ball.position.x,
      dirZ: targetZ - ball.position.z,
      speed: taker.attributes.shotPower * 1.04,
      loft: 3.1,
      sideSpin: cornerSign * 1.1,
      isShot: true
    };
  }
  if (type === "free_kick") {
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
        isShot: true
      };
    }
    const target2 = findBestPassTarget(taker, allPlayers, attackDir, 0);
    if (target2) {
      const lead = computeLeadPassVector(taker, target2, true);
      return {
        dirX: lead.dirX,
        dirZ: lead.dirZ,
        speed: lead.speed,
        loft: lead.loft,
        sideSpin: 0,
        isShot: false
      };
    }
  }
  if (type === "corner") {
    const boxTargetX = oppGoalX - attackDir * 9.5;
    const boxTargetZ = -Math.sign(ball.position.z || 1) * 2.2;
    return {
      dirX: boxTargetX - ball.position.x,
      dirZ: boxTargetZ - ball.position.z,
      speed: 19.5,
      loft: 7.4,
      sideSpin: Math.sign(ball.position.z || 1) * 1.6,
      isShot: false
    };
  }
  if (type === "goal_kick") {
    const target2 = findBestPassTarget(taker, allPlayers, attackDir, (Math.random() - 0.5) * 0.6);
    if (target2) {
      const lead = computeLeadPassVector(taker, target2, true);
      return {
        dirX: lead.dirX,
        dirZ: lead.dirZ,
        speed: Math.max(18, lead.speed),
        loft: 6.2,
        sideSpin: 0,
        isShot: false
      };
    }
    return {
      dirX: attackDir,
      dirZ: (Math.random() - 0.5) * 0.3,
      speed: 23,
      loft: 6.8,
      sideSpin: 0,
      isShot: false
    };
  }
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
      isShot: false
    };
  }
  return {
    dirX: attackDir * 0.5,
    dirZ: inboundsDirZ,
    speed: 13,
    loft: 3.4,
    sideSpin: 0,
    isShot: false
  };
}

// src/audio/crowdLogic.ts
function computeCrowdIntensity(input) {
  if (!input.isOnline) return 0;
  if (input.shellState === "paused") return 0.08;
  if (input.shellState === "title" || input.shellState === "tournament") return 0.22;
  if (input.shellState === "gameover") return 0.42;
  if (input.phase === "goal" || input.isReplaying) {
    return 1;
  }
  if (input.phase === "halftime" || input.phase === "fulltime") {
    return 0.45;
  }
  if (input.phase === "setpiece") {
    return 0.62;
  }
  const absX = Math.abs(input.ballX);
  const dangerRatio = Math.min(1, Math.max(0, (absX - 16) / (HALF_LENGTH - 16)));
  const speedBoost = Math.min(0.15, input.ballSpeed / 28 * 0.15);
  return Math.min(0.9, 0.34 + dangerRatio * 0.42 + speedBoost);
}
function computeCrowdGainLevels(intensity) {
  const clamped = Math.min(1, Math.max(0, intensity));
  return {
    murmurGain: clamped <= 1e-3 ? 0 : 0.032 + clamped * 0.068,
    chatterGain: clamped <= 1e-3 ? 0 : 0.016 + clamped * 0.056,
    chatterFreqHz: 580 + clamped * 440
  };
}
var SOUND_COOLDOWNS_MS = {
  kick: 55,
  tackle: 180,
  whistle: 240,
  postHit: 220,
  netSwish: 300,
  applause: 1500,
  ooh: 1200,
  boo: 1600,
  goalCheer: 2600
};
function canTriggerSound(lastTriggeredMs, channel, nowMs, cooldownOverrideMs) {
  const minGap = cooldownOverrideMs ?? SOUND_COOLDOWNS_MS[channel];
  const prev = lastTriggeredMs[channel];
  if (prev !== void 0 && nowMs - prev < minGap) {
    return false;
  }
  lastTriggeredMs[channel] = nowMs;
  return true;
}
function computeEffectiveCrowdIntensity(baseIntensity, boostPeak, elapsedSinceBoostSec, decayDurationSec) {
  const clampedBase = Math.min(1, Math.max(0, baseIntensity));
  if (clampedBase <= 1e-3) return 0;
  if (boostPeak <= 0 || decayDurationSec <= 0 || elapsedSinceBoostSec >= decayDurationSec) {
    return clampedBase;
  }
  const t = Math.max(0, Math.min(1, elapsedSinceBoostSec / decayDurationSec));
  const remaining = (1 - t) * (1 - t);
  return Math.min(1, clampedBase + boostPeak * remaining);
}

// src/audio/soundEngine.ts
var SoundEngine = class {
  constructor() {
    this.ctx = null;
    this.masterBus = null;
    this.enabled = true;
    this.unlocked = false;
    // Preloaded reusable audio buffers (synthesized once, zero runtime buffer allocations)
    this.crowdBedBuffer = null;
    this.roarBuffer = null;
    this.applauseBuffer = null;
    this.shortNoiseBuffer = null;
    // Continuous stadium spectator ambience nodes
    this.crowdStarted = false;
    this.baseCrowdIntensity = 0.22;
    this.reactionBoostPeak = 0;
    this.reactionBoostStartMs = 0;
    this.reactionBoostDecaySec = 0;
    this.crowdMurmurGain = null;
    this.crowdChatterGain = null;
    this.crowdChatterFilter = null;
    this.crowdMasterGain = null;
    this.crowdNodes = [];
    // Per-channel cooldown timestamps to prevent duplicate simultaneous triggers
    this.lastTriggeredMs = {};
    if (typeof window !== "undefined") {
      const unlock = () => {
        this.unlocked = true;
        const ctx = this.ensureContext();
        if (ctx && ctx.state === "suspended") {
          void ctx.resume().catch(() => void 0);
        }
        if (this.enabled && this.baseCrowdIntensity > 0) {
          this.ensureCrowdAmbience();
          this.applyCrowdLevels();
        }
      };
      window.addEventListener("pointerdown", unlock, { passive: true });
      window.addEventListener("touchstart", unlock, { passive: true });
      window.addEventListener("keydown", unlock, { passive: true });
    }
  }
  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.muteCrowdNow();
    } else if (this.unlocked && this.baseCrowdIntensity > 0) {
      this.ensureCrowdAmbience();
      this.applyCrowdLevels();
    }
  }
  isEnabled() {
    return this.enabled;
  }
  isCrowdActive() {
    return this.crowdStarted && this.enabled && this.baseCrowdIntensity > 1e-3;
  }
  getEffectiveCrowdIntensity() {
    const elapsedSec = Math.max(0, (performance.now() - this.reactionBoostStartMs) / 1e3);
    return computeEffectiveCrowdIntensity(
      this.baseCrowdIntensity,
      this.reactionBoostPeak,
      elapsedSec,
      this.reactionBoostDecaySec
    );
  }
  updateCrowdIntensity(intensity) {
    this.baseCrowdIntensity = Math.min(1, Math.max(0, intensity));
    if (!this.enabled || this.baseCrowdIntensity <= 1e-3) {
      this.muteCrowdNow();
      return;
    }
    if (this.unlocked) {
      this.ensureCrowdAmbience();
      this.applyCrowdLevels();
    }
  }
  triggerAmbienceSwell(boostPeak, decaySec) {
    const nowMs = performance.now();
    const currentEffective = this.getEffectiveCrowdIntensity();
    const desired = Math.min(1, this.baseCrowdIntensity + boostPeak);
    if (desired >= currentEffective - 0.02) {
      this.reactionBoostPeak = boostPeak;
      this.reactionBoostStartMs = nowMs;
      this.reactionBoostDecaySec = decaySec;
      this.applyCrowdLevels();
    }
  }
  ensureContext() {
    if (!this.enabled || !this.unlocked || typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      const master = this.ctx.createGain();
      master.gain.value = 0.92;
      if (typeof this.ctx.createDynamicsCompressor === "function") {
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -12;
        comp.knee.value = 18;
        comp.ratio.value = 4;
        comp.attack.value = 8e-3;
        comp.release.value = 0.18;
        master.connect(comp);
        comp.connect(this.ctx.destination);
      } else {
        master.connect(this.ctx.destination);
      }
      this.masterBus = master;
      this.preloadBuffers(this.ctx);
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume().catch(() => void 0);
    }
    return this.ctx;
  }
  getOutputNode(ctx) {
    return this.masterBus ?? ctx.destination;
  }
  /**
   * Pre-synthesizes all reusable noise/applause/roar AudioBuffers once at audio unlock
   * so gameplay triggers never allocate fresh AudioBuffers per frame or per event.
   */
  preloadBuffers(ctx) {
    if (this.crowdBedBuffer) return;
    const bedSamples = Math.floor(ctx.sampleRate * 4);
    const bedBuf = ctx.createBuffer(2, bedSamples, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = bedBuf.getChannelData(ch);
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      let b3 = 0;
      let b4 = 0;
      let b5 = 0;
      let b6 = 0;
      for (let i = 0; i < bedSamples; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        b3 = 0.8665 * b3 + white * 0.3104856;
        b4 = 0.55 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.016898;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.085;
        b6 = white * 0.115926;
      }
      const fadeSamples = Math.min(2048, Math.floor(bedSamples * 0.05));
      for (let i = 0; i < fadeSamples; i++) {
        const t = i / fadeSamples;
        const tailIdx = bedSamples - fadeSamples + i;
        const blended = data[i] * t + data[tailIdx] * (1 - t);
        data[i] = blended;
        data[tailIdx] = blended;
      }
    }
    this.crowdBedBuffer = bedBuf;
    const roarSamples = Math.floor(ctx.sampleRate * 2.8);
    const roarBuf = ctx.createBuffer(2, roarSamples, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = roarBuf.getChannelData(ch);
      let prev = 0;
      for (let i = 0; i < roarSamples; i++) {
        const w = Math.random() * 2 - 1;
        prev = prev * 0.52 + w * 0.48;
        data[i] = prev * 0.55;
      }
    }
    this.roarBuffer = roarBuf;
    const appSamples = Math.floor(ctx.sampleRate * 1.6);
    const appBuf = ctx.createBuffer(2, appSamples, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = appBuf.getChannelData(ch);
      for (let i = 0; i < appSamples; i++) {
        const tSec = i / ctx.sampleRate;
        const clapMod = 0.55 + 0.25 * Math.sin(tSec * 52 + ch * 1.7) + 0.2 * Math.sin(tSec * 83 + ch * 0.9);
        data[i] = (Math.random() * 2 - 1) * 0.44 * clapMod;
      }
    }
    this.applauseBuffer = appBuf;
    const shortSamples = Math.floor(ctx.sampleRate * 0.3);
    const shortBuf = ctx.createBuffer(1, shortSamples, ctx.sampleRate);
    const shortData = shortBuf.getChannelData(0);
    for (let i = 0; i < shortSamples; i++) {
      shortData[i] = (Math.random() * 2 - 1) * 0.46;
    }
    this.shortNoiseBuffer = shortBuf;
  }
  ensureCrowdAmbience() {
    if (this.crowdStarted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.crowdBedBuffer) return;
    const source = ctx.createBufferSource();
    source.buffer = this.crowdBedBuffer;
    source.loop = true;
    const murmurFilter = ctx.createBiquadFilter();
    murmurFilter.type = "bandpass";
    murmurFilter.frequency.value = 270;
    murmurFilter.Q.value = 0.7;
    const murmurGain = ctx.createGain();
    murmurGain.gain.value = 0;
    const chatterFilter = ctx.createBiquadFilter();
    chatterFilter.type = "bandpass";
    chatterFilter.frequency.value = 720;
    chatterFilter.Q.value = 1.05;
    const chatterGain = ctx.createGain();
    chatterGain.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.19;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 95;
    lfo.connect(lfoGain);
    lfoGain.connect(chatterFilter.frequency);
    const masterGain = ctx.createGain();
    masterGain.gain.value = 1;
    source.connect(murmurFilter);
    murmurFilter.connect(murmurGain);
    murmurGain.connect(masterGain);
    source.connect(chatterFilter);
    chatterFilter.connect(chatterGain);
    chatterGain.connect(masterGain);
    masterGain.connect(this.getOutputNode(ctx));
    source.start();
    lfo.start();
    this.crowdMurmurGain = murmurGain;
    this.crowdChatterGain = chatterGain;
    this.crowdChatterFilter = chatterFilter;
    this.crowdMasterGain = masterGain;
    this.crowdNodes = [
      source,
      lfo,
      murmurFilter,
      chatterFilter,
      murmurGain,
      chatterGain,
      lfoGain,
      masterGain
    ];
    this.crowdStarted = true;
  }
  applyCrowdLevels() {
    if (!this.ctx || !this.crowdStarted || !this.crowdMurmurGain || !this.crowdChatterGain || !this.crowdChatterFilter || !this.crowdMasterGain) {
      return;
    }
    const now = this.ctx.currentTime;
    const effective = this.enabled ? this.getEffectiveCrowdIntensity() : 0;
    const levels = computeCrowdGainLevels(effective);
    this.crowdMasterGain.gain.setTargetAtTime(this.enabled ? 1 : 0, now, 0.15);
    this.crowdMurmurGain.gain.setTargetAtTime(levels.murmurGain, now, 0.28);
    this.crowdChatterGain.gain.setTargetAtTime(levels.chatterGain, now, 0.28);
    this.crowdChatterFilter.frequency.setTargetAtTime(levels.chatterFreqHz, now, 0.35);
  }
  muteCrowdNow() {
    if (!this.ctx || !this.crowdMasterGain) return;
    const now = this.ctx.currentTime;
    this.crowdMasterGain.gain.setTargetAtTime(0, now, 0.08);
  }
  playKick(power = 1) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (!canTriggerSound(this.lastTriggeredMs, "kick", performance.now())) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    const pitchJitter = 0.92 + Math.random() * 0.16;
    osc.frequency.setValueAtTime((135 + power * 35) * pitchJitter, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.11);
    gain.gain.setValueAtTime(Math.min(0.32, 0.16 * power), now);
    gain.gain.exponentialRampToValueAtTime(1e-3, now + 0.13);
    osc.connect(gain);
    gain.connect(this.getOutputNode(ctx));
    osc.start(now);
    osc.stop(now + 0.14);
  }
  playWhistle(pattern = "short") {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (!canTriggerSound(this.lastTriggeredMs, "whistle", performance.now())) return;
    const out = this.getOutputNode(ctx);
    const triggerBlast = (offset, duration) => {
      const now = ctx.currentTime + offset;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      osc1.type = "sine";
      osc2.type = "sine";
      osc1.frequency.setValueAtTime(2880, now);
      osc2.frequency.setValueAtTime(2945, now);
      gain.gain.setValueAtTime(1e-3, now);
      gain.gain.linearRampToValueAtTime(0.09, now + 0.02);
      gain.gain.setValueAtTime(0.085, now + duration - 0.03);
      gain.gain.exponentialRampToValueAtTime(1e-3, now + duration);
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(out);
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + duration + 0.01);
      osc2.stop(now + duration + 0.01);
    };
    if (pattern === "short") {
      triggerBlast(0, 0.22);
    } else if (pattern === "double") {
      triggerBlast(0, 0.16);
      triggerBlast(0.24, 0.28);
    } else {
      triggerBlast(0, 0.55);
    }
  }
  playPostHit() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (!canTriggerSound(this.lastTriggeredMs, "postHit", performance.now())) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(340, now + 0.24);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(1e-3, now + 0.26);
    osc.connect(gain);
    gain.connect(this.getOutputNode(ctx));
    osc.start(now);
    osc.stop(now + 0.28);
  }
  playGoalCheer() {
    const ctx = this.ensureContext();
    if (!ctx || !this.roarBuffer || !this.applauseBuffer) return;
    if (!canTriggerSound(this.lastTriggeredMs, "goalCheer", performance.now())) return;
    this.triggerAmbienceSwell(0.55, 4.5);
    const now = ctx.currentTime;
    const duration = 2.7;
    const out = this.getOutputNode(ctx);
    const roar = ctx.createBufferSource();
    roar.buffer = this.roarBuffer;
    const roarFilter = ctx.createBiquadFilter();
    roarFilter.type = "bandpass";
    roarFilter.frequency.setValueAtTime(520, now);
    roarFilter.frequency.linearRampToValueAtTime(880, now + 0.42);
    roarFilter.frequency.exponentialRampToValueAtTime(560, now + duration);
    roarFilter.Q.setValueAtTime(0.85, now);
    const roarGain = ctx.createGain();
    roarGain.gain.setValueAtTime(1e-3, now);
    roarGain.gain.linearRampToValueAtTime(0.26, now + 0.14);
    roarGain.gain.setValueAtTime(0.22, now + 1.25);
    roarGain.gain.exponentialRampToValueAtTime(1e-3, now + duration);
    roar.connect(roarFilter);
    roarFilter.connect(roarGain);
    roarGain.connect(out);
    roar.start(now);
    roar.stop(now + duration);
    const clap = ctx.createBufferSource();
    clap.buffer = this.applauseBuffer;
    clap.loop = true;
    const clapFilter = ctx.createBiquadFilter();
    clapFilter.type = "bandpass";
    clapFilter.frequency.setValueAtTime(1650, now);
    clapFilter.Q.setValueAtTime(1.05, now);
    const clapGain = ctx.createGain();
    clapGain.gain.setValueAtTime(1e-3, now);
    clapGain.gain.linearRampToValueAtTime(0.13, now + 0.22);
    clapGain.gain.exponentialRampToValueAtTime(1e-3, now + duration);
    clap.connect(clapFilter);
    clapFilter.connect(clapGain);
    clapGain.connect(out);
    clap.start(now);
    clap.stop(now + duration);
  }
  playCrowdReaction(type) {
    const ctx = this.ensureContext();
    if (!ctx || !this.roarBuffer || !this.applauseBuffer) return;
    if (!canTriggerSound(this.lastTriggeredMs, type, performance.now())) return;
    const now = ctx.currentTime;
    const out = this.getOutputNode(ctx);
    const duration = type === "ooh" ? 1.05 : type === "applause" ? 1.25 : 0.85;
    const noise = ctx.createBufferSource();
    noise.buffer = type === "applause" ? this.applauseBuffer : this.roarBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    const gain = ctx.createGain();
    if (type === "ooh") {
      this.triggerAmbienceSwell(0.34, 2.2);
      filter.frequency.setValueAtTime(920, now);
      filter.frequency.exponentialRampToValueAtTime(420, now + duration);
      filter.Q.setValueAtTime(1.6, now);
      gain.gain.setValueAtTime(1e-3, now);
      gain.gain.linearRampToValueAtTime(0.18, now + 0.11);
      gain.gain.exponentialRampToValueAtTime(1e-3, now + duration);
    } else if (type === "applause") {
      this.triggerAmbienceSwell(0.2, 1.8);
      filter.frequency.setValueAtTime(1520, now);
      filter.Q.setValueAtTime(0.82, now);
      gain.gain.setValueAtTime(1e-3, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.14);
      gain.gain.exponentialRampToValueAtTime(1e-3, now + duration);
    } else {
      filter.frequency.setValueAtTime(340, now);
      filter.frequency.linearRampToValueAtTime(280, now + duration);
      filter.Q.setValueAtTime(2, now);
      gain.gain.setValueAtTime(1e-3, now);
      gain.gain.linearRampToValueAtTime(0.13, now + 0.12);
      gain.gain.exponentialRampToValueAtTime(1e-3, now + duration);
    }
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    noise.start(now, 0, duration);
    noise.stop(now + duration);
  }
  playNetSwish() {
    const ctx = this.ensureContext();
    if (!ctx || !this.shortNoiseBuffer) return;
    if (!canTriggerSound(this.lastTriggeredMs, "netSwish", performance.now())) return;
    const now = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = this.shortNoiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.setValueAtTime(1400, now);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(1e-3, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(1e-3, now + 0.22);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.getOutputNode(ctx));
    noise.start(now, 0, 0.24);
    noise.stop(now + 0.24);
  }
  playTackle() {
    const ctx = this.ensureContext();
    if (!ctx || !this.shortNoiseBuffer) return;
    if (!canTriggerSound(this.lastTriggeredMs, "tackle", performance.now())) return;
    const now = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = this.shortNoiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(420, now);
    filter.Q.setValueAtTime(0.9, now);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(1e-3, now);
    gain.gain.linearRampToValueAtTime(0.11, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(1e-3, now + 0.17);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.getOutputNode(ctx));
    noise.start(now, 0, 0.18);
    noise.stop(now + 0.18);
  }
  dispose() {
    for (const node of this.crowdNodes) {
      try {
        node.disconnect();
      } catch {
      }
    }
    this.crowdNodes = [];
    this.crowdStarted = false;
  }
};
var soundEngine = new SoundEngine();

// src/controls/controlMode.ts
var CONTROL_MODE_CONFIRM_MS = 150;
var CONTROL_MODE_INFLIGHT_WEIGHT = 0.55;
var CONTROL_MODE_COOLDOWN_MS = 280;
function createControlModeState(initialMode = "ATTACK") {
  return {
    mode: initialMode,
    pendingMode: null,
    pendingElapsedMs: 0,
    cooldownRemainingMs: 0
  };
}
function resolveImmediateControlMode(input) {
  if (input.phase === "kickoff") {
    return input.kickoffTeam === input.localTeam ? "ATTACK" : "DEFENSE";
  }
  if (input.phase === "setpiece" && input.setPieceTeam !== null) {
    return input.setPieceTeam === input.localTeam ? "ATTACK" : "DEFENSE";
  }
  return null;
}
function stepControlMode(prev, input, dtMs, confirmWindowMs = CONTROL_MODE_CONFIRM_MS, cooldownMs = CONTROL_MODE_COOLDOWN_MS) {
  const safeDtMs = Math.max(0, dtMs);
  const nextCooldown = Math.max(0, prev.cooldownRemainingMs - safeDtMs);
  const immediateMode = resolveImmediateControlMode(input);
  if (immediateMode !== null) {
    const changed = immediateMode !== prev.mode;
    return {
      state: {
        mode: immediateMode,
        pendingMode: null,
        pendingElapsedMs: 0,
        cooldownRemainingMs: 0
      },
      changed
    };
  }
  if (input.phase !== "live") {
    return {
      state: {
        mode: prev.mode,
        pendingMode: null,
        pendingElapsedMs: 0,
        cooldownRemainingMs: nextCooldown
      },
      changed: false
    };
  }
  const observedTeam = input.ballOwnerTeam ?? input.lastTouchTeam;
  if (observedTeam === null) {
    return {
      state: {
        mode: prev.mode,
        pendingMode: null,
        pendingElapsedMs: 0,
        cooldownRemainingMs: nextCooldown
      },
      changed: false
    };
  }
  const desiredMode = observedTeam === input.localTeam ? "ATTACK" : "DEFENSE";
  if (desiredMode === prev.mode) {
    return {
      state: {
        mode: prev.mode,
        pendingMode: null,
        pendingElapsedMs: 0,
        cooldownRemainingMs: nextCooldown
      },
      changed: false
    };
  }
  if (nextCooldown > 0) {
    return {
      state: {
        mode: prev.mode,
        pendingMode: desiredMode,
        pendingElapsedMs: 0,
        cooldownRemainingMs: nextCooldown
      },
      changed: false
    };
  }
  const weight = input.ballOwnerTeam !== null ? 1 : CONTROL_MODE_INFLIGHT_WEIGHT;
  const weightedDtMs = safeDtMs * weight;
  const accumulatedMs = prev.pendingMode === desiredMode ? prev.pendingElapsedMs + weightedDtMs : weightedDtMs;
  if (accumulatedMs >= confirmWindowMs) {
    return {
      state: {
        mode: desiredMode,
        pendingMode: null,
        pendingElapsedMs: 0,
        cooldownRemainingMs: cooldownMs
      },
      changed: true
    };
  }
  return {
    state: {
      mode: prev.mode,
      pendingMode: desiredMode,
      pendingElapsedMs: accumulatedMs,
      cooldownRemainingMs: 0
    },
    changed: false
  };
}

// src/game/replayRecorder.ts
var MAX_REPLAY_FRAMES = 108;
var SAMPLE_INTERVAL = 1 / 30;
var ReplayRecorder = class {
  constructor() {
    this.frames = [];
    this.clipFrames = [];
    this.sampleAccumulator = 0;
  }
  clear() {
    this.frames = [];
    this.clipFrames = [];
    this.sampleAccumulator = 0;
  }
  record(ball, players, dt) {
    this.sampleAccumulator += dt;
    if (this.sampleAccumulator < SAMPLE_INTERVAL) return;
    this.sampleAccumulator -= SAMPLE_INTERVAL;
    this.frames.push({
      ballPos: { ...ball.position },
      ballVel: { ...ball.velocity },
      ballSpin: { ...ball.spin },
      players: players.map((p) => ({
        id: p.id,
        x: p.position.x,
        y: p.position.y,
        z: p.position.z,
        facingAngle: p.facingAngle,
        actionState: p.actionState,
        diveDir: p.diveDir,
        animPhase: p.animPhase
      }))
    });
    if (this.frames.length > MAX_REPLAY_FRAMES) {
      this.frames.shift();
    }
  }
  freezeClip() {
    this.clipFrames = this.frames.map((f) => ({
      ballPos: { ...f.ballPos },
      ballVel: { ...f.ballVel },
      ballSpin: { ...f.ballSpin },
      players: f.players.map((p) => ({ ...p }))
    }));
  }
  getClipLength() {
    return this.clipFrames.length;
  }
  /**
   * Samples an interpolated frame along the frozen goal clip at progress [0..1].
   */
  sampleAtProgress(progress) {
    const len = this.clipFrames.length;
    if (len === 0) return null;
    if (len === 1) return this.clipFrames[0];
    const clamped = Math.max(0, Math.min(1, progress));
    const exactIndex = clamped * (len - 1);
    const idx0 = Math.floor(exactIndex);
    const idx1 = Math.min(len - 1, idx0 + 1);
    const alpha = exactIndex - idx0;
    const f0 = this.clipFrames[idx0];
    const f1 = this.clipFrames[idx1];
    return {
      ballPos: {
        x: f0.ballPos.x + (f1.ballPos.x - f0.ballPos.x) * alpha,
        y: f0.ballPos.y + (f1.ballPos.y - f0.ballPos.y) * alpha,
        z: f0.ballPos.z + (f1.ballPos.z - f0.ballPos.z) * alpha
      },
      ballVel: {
        x: f0.ballVel.x + (f1.ballVel.x - f0.ballVel.x) * alpha,
        y: f0.ballVel.y + (f1.ballVel.y - f0.ballVel.y) * alpha,
        z: f0.ballVel.z + (f1.ballVel.z - f0.ballVel.z) * alpha
      },
      ballSpin: { ...f0.ballSpin },
      players: f0.players.map((p0, i) => {
        const p1 = f1.players[i] ?? p0;
        return {
          id: p0.id,
          x: p0.x + (p1.x - p0.x) * alpha,
          y: p0.y + (p1.y - p0.y) * alpha,
          z: p0.z + (p1.z - p0.z) * alpha,
          facingAngle: lerpAngleShort(p0.facingAngle, p1.facingAngle, alpha),
          actionState: alpha < 0.5 ? p0.actionState : p1.actionState,
          diveDir: alpha < 0.5 ? p0.diveDir : p1.diveDir,
          animPhase: p0.animPhase + (p1.animPhase - p0.animPhase) * alpha
        };
      })
    };
  }
};
function lerpAngleShort(a, b, t) {
  let diff = b - a;
  while (diff < -Math.PI) diff += Math.PI * 2;
  while (diff > Math.PI) diff -= Math.PI * 2;
  return a + diff * t;
}

// src/game/matchEngine.ts
var GOAL_IMPACT_DURATION = 0.85;
var GOAL_REPLAY_DURATION = 3.25;
var MatchEngine = class {
  constructor(homeTeam, awayTeam, homeFormation, awayFormation, halfDurationSeconds, cameraMode, callbacks, homeMentality = "balanced", awayMentality = "balanced") {
    this.players = [];
    this.shellState = "title";
    this.phase = "kickoff";
    this.half = 1;
    this.halfElapsedReal = 0;
    this.matchMinutes = 0;
    this.matchSeconds = 0;
    this.cameraMode = "tv";
    /** Online multiplayer configuration */
    this.awayHumanControl = false;
    this.localSide = "home";
    this.isOnlineClient = false;
    this.goalBanner = null;
    this.setPiece = null;
    this.isReplaying = false;
    this.hitstopTimer = 0;
    this.goalCelebrationTimer = 0;
    this.goalTotalElapsed = 0;
    this.halftimeTimer = 0;
    this.kickoffTeam = "home";
    this.hudEmitAccumulator = 0;
    this.shotCharge = 0;
    this.awayShotCharge = 0;
    this.replayRecorder = new ReplayRecorder();
    this.replayPlayerProxies = [];
    // Client-side interpolation targets for online multiplayer
    this.netBallTarget = null;
    this.netPlayerTargets = /* @__PURE__ */ new Map();
    this.hasReceivedNetSnapshot = false;
    // Lightweight AI caching, turnover transition tracking, and GK human reaction timers
    this.aiDecisionCache = /* @__PURE__ */ new Map();
    this.aiTickCounter = 0;
    this.lastPossessionTeam = null;
    this.transitionTimer = 0;
    this.gkDiveReactionTimer = /* @__PURE__ */ new Map();
    this.lastHomeInputDir = { x: 0, z: 0 };
    this.lastAwayInputDir = { x: 0, z: 0 };
    this.controlModeState = createControlModeState("ATTACK");
    this.homeTeam = homeTeam;
    this.awayTeam = awayTeam;
    this.homeFormation = homeFormation;
    this.awayFormation = awayFormation;
    this.homeMentality = homeMentality;
    this.awayMentality = awayMentality;
    this.halfDurationSeconds = halfDurationSeconds;
    this.cameraMode = cameraMode;
    this.callbacks = callbacks;
    this.ball = this.createEmptyBall();
    this.replayBallProxy = this.createEmptyBall();
    this.stats = this.createEmptyStats();
    this.rebuildTeams();
  }
  resolveBallOwnerTeam() {
    if (!this.ball.ownerId) return null;
    const owner = this.players.find((p) => p.id === this.ball.ownerId);
    return owner ? owner.team : null;
  }
  resetControlModeForKickoff() {
    const initialMode = this.kickoffTeam === this.localSide ? "ATTACK" : "DEFENSE";
    this.controlModeState = createControlModeState(initialMode);
  }
  updateControlMode(dtSeconds) {
    const result = stepControlMode(
      this.controlModeState,
      {
        phase: this.phase,
        localTeam: this.localSide,
        ballOwnerTeam: this.resolveBallOwnerTeam(),
        lastTouchTeam: this.ball.lastTouchTeam,
        setPieceTeam: this.setPiece?.team ?? null,
        kickoffTeam: this.kickoffTeam
      },
      dtSeconds * 1e3
    );
    this.controlModeState = result.state;
    return result.changed;
  }
  getShotCharge(side = this.localSide) {
    return side === "away" ? this.awayShotCharge : this.shotCharge;
  }
  emitSound(event) {
    this.callbacks.onSoundEvent?.(event);
    if (this.callbacks.onSoundEvent && typeof window === "undefined") {
      return;
    }
    this.playSoundEventLocally(event);
  }
  playSoundEventLocally(event) {
    switch (event.type) {
      case "kick":
        soundEngine.playKick(event.power);
        break;
      case "whistle":
        soundEngine.playWhistle(event.pattern);
        break;
      case "post":
        soundEngine.playPostHit();
        break;
      case "goal":
        soundEngine.playGoalCheer();
        break;
      case "net":
        soundEngine.playNetSwish();
        break;
      case "tackle":
        soundEngine.playTackle();
        break;
      case "crowd":
        soundEngine.playCrowdReaction(event.reaction);
        break;
    }
  }
  createEmptyBall() {
    return {
      position: { x: 0, y: BALL_RADIUS, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      spin: { x: 0, y: 0, z: 0 },
      ownerId: null,
      lastTouchTeam: null,
      lastTouchPlayerName: null,
      pickupLockTimer: 0
    };
  }
  createEmptyStats() {
    return {
      homeScore: 0,
      awayScore: 0,
      homeShots: 0,
      awayShots: 0,
      homePasses: 0,
      awayPasses: 0,
      homeSaves: 0,
      awaySaves: 0,
      homeCorners: 0,
      awayCorners: 0,
      homeFouls: 0,
      awayFouls: 0,
      homePossessionSeconds: 0,
      awayPossessionSeconds: 0,
      lastScorerName: null,
      lastScorerTeam: null,
      lastGoalMinute: null
    };
  }
  ensureControlledPlayers() {
    const hasHomeControlled = this.players.some((p) => p.team === "home" && p.isControlled);
    if (!hasHomeControlled) {
      const homeStriker = this.players.find((p) => p.team === "home" && p.role === "ST") ?? this.players.find((p) => p.team === "home" && p.role !== "GK");
      if (homeStriker) homeStriker.isControlled = true;
    }
    if (this.awayHumanControl) {
      const hasAwayControlled = this.players.some((p) => p.team === "away" && p.isControlled);
      if (!hasAwayControlled) {
        const awayStriker = this.players.find((p) => p.team === "away" && p.role === "ST") ?? this.players.find((p) => p.team === "away" && p.role !== "GK");
        if (awayStriker) awayStriker.isControlled = true;
      }
    } else {
      for (const p of this.players) {
        if (p.team === "away") p.isControlled = false;
      }
    }
  }
  rebuildTeams() {
    const home = createTeamPlayers(this.homeTeam, "home", this.homeFormation);
    const away = createTeamPlayers(this.awayTeam, "away", this.awayFormation);
    this.players = [...home, ...away];
    this.replayPlayerProxies = this.players.map((p) => ({
      ...p,
      position: { ...p.position },
      velocity: { ...p.velocity },
      homeAnchor: { ...p.homeAnchor },
      attributes: { ...p.attributes },
      appearance: { ...p.appearance }
    }));
    this.shotCharge = 0;
    this.awayShotCharge = 0;
    this.setPiece = null;
    this.isReplaying = false;
    this.netBallTarget = null;
    this.netPlayerTargets.clear();
    this.aiDecisionCache.clear();
    this.gkDiveReactionTimer.clear();
    this.aiTickCounter = 0;
    this.lastPossessionTeam = null;
    this.transitionTimer = 0;
    this.hasReceivedNetSnapshot = false;
    this.replayRecorder.clear();
    resetForKickoff(
      this.players,
      this.ball,
      this.homeFormation,
      this.awayFormation,
      this.kickoffTeam
    );
    this.ensureControlledPlayers();
  }
  startNewMatch(homeTeam, awayTeam, homeFormation, awayFormation, halfDurationSeconds, homeMentality = this.homeMentality, awayMentality = this.awayMentality, options) {
    this.homeTeam = homeTeam;
    this.awayTeam = awayTeam;
    this.homeFormation = homeFormation;
    this.awayFormation = awayFormation;
    this.homeMentality = homeMentality;
    this.awayMentality = awayMentality;
    this.halfDurationSeconds = halfDurationSeconds;
    this.awayHumanControl = options?.awayHumanControl ?? false;
    this.localSide = options?.localSide ?? "home";
    this.isOnlineClient = options?.isOnlineClient ?? false;
    this.half = 1;
    this.halfElapsedReal = 0;
    this.matchMinutes = 0;
    this.matchSeconds = 0;
    this.phase = "live";
    this.shellState = "playing";
    this.kickoffTeam = "home";
    this.goalBanner = null;
    this.setPiece = null;
    this.isReplaying = false;
    this.hitstopTimer = 0;
    this.goalCelebrationTimer = 0;
    this.goalTotalElapsed = 0;
    this.halftimeTimer = 0;
    this.shotCharge = 0;
    this.awayShotCharge = 0;
    this.stats = this.createEmptyStats();
    this.rebuildTeams();
    this.resetControlModeForKickoff();
    if (!this.isOnlineClient) {
      this.emitSound({ type: "whistle", pattern: "short" });
    }
    this.emitHudSnapshot();
  }
  skipReplay() {
    if (this.phase !== "goal" || this.isOnlineClient) return;
    this.finishGoalCelebration();
  }
  finishGoalCelebration() {
    this.goalBanner = null;
    this.isReplaying = false;
    this.phase = "live";
    this.shotCharge = 0;
    this.awayShotCharge = 0;
    this.replayRecorder.clear();
    resetForKickoff(
      this.players,
      this.ball,
      this.homeFormation,
      this.awayFormation,
      this.kickoffTeam
    );
    this.ensureControlledPlayers();
    this.resetControlModeForKickoff();
    this.emitSound({ type: "whistle", pattern: "short" });
    this.emitHudSnapshot();
  }
  getControlledPlayer(side = this.localSide) {
    return this.players.find((p) => p.team === side && p.isControlled) ?? this.players.find((p) => p.isControlled) ?? null;
  }
  /**
   * Produces a compact authoritative snapshot for server-to-client synchronization.
   */
  getOnlineSnapshot(tick, events) {
    const compactPlayers = this.players.map((p) => ({
      id: p.id,
      x: Math.round(p.position.x * 100) / 100,
      y: Math.round(p.position.y * 100) / 100,
      z: Math.round(p.position.z * 100) / 100,
      vx: Math.round(p.velocity.x * 100) / 100,
      vz: Math.round(p.velocity.z * 100) / 100,
      facingAngle: Math.round(p.facingAngle * 1e3) / 1e3,
      stamina: Math.round(p.stamina),
      actionState: p.actionState,
      diveDir: p.diveDir,
      hasBall: p.hasBall,
      isControlled: p.isControlled,
      animPhase: Math.round(p.animPhase * 100) / 100
    }));
    return {
      tick,
      serverTime: Date.now(),
      phase: this.phase,
      half: this.half,
      matchMinutes: this.matchMinutes,
      matchSeconds: this.matchSeconds,
      isReplaying: this.isReplaying,
      homeShotCharge: Math.round(this.shotCharge * 100) / 100,
      awayShotCharge: Math.round(this.awayShotCharge * 100) / 100,
      ball: {
        position: {
          x: Math.round(this.ball.position.x * 100) / 100,
          y: Math.round(this.ball.position.y * 100) / 100,
          z: Math.round(this.ball.position.z * 100) / 100
        },
        velocity: {
          x: Math.round(this.ball.velocity.x * 100) / 100,
          y: Math.round(this.ball.velocity.y * 100) / 100,
          z: Math.round(this.ball.velocity.z * 100) / 100
        },
        spin: {
          x: Math.round(this.ball.spin.x * 100) / 100,
          y: Math.round(this.ball.spin.y * 100) / 100,
          z: Math.round(this.ball.spin.z * 100) / 100
        },
        ownerId: this.ball.ownerId,
        lastTouchTeam: this.ball.lastTouchTeam,
        lastTouchPlayerName: this.ball.lastTouchPlayerName,
        pickupLockTimer: 0
      },
      players: compactPlayers,
      setPiece: this.setPiece ? { ...this.setPiece, spot: { ...this.setPiece.spot } } : null,
      goalBanner: this.goalBanner ? { ...this.goalBanner } : null,
      stats: { ...this.stats },
      events
    };
  }
  /**
   * Applies an authoritative server snapshot on an online client, setting up smooth interpolation.
   */
  applyOnlineSnapshot(snapshot, localSide) {
    this.isOnlineClient = true;
    this.awayHumanControl = true;
    this.localSide = localSide;
    const prevPhase = this.phase;
    this.phase = snapshot.phase;
    this.half = snapshot.half;
    this.matchMinutes = snapshot.matchMinutes;
    this.matchSeconds = snapshot.matchSeconds;
    this.isReplaying = snapshot.isReplaying;
    this.shotCharge = snapshot.homeShotCharge;
    this.awayShotCharge = snapshot.awayShotCharge;
    this.setPiece = snapshot.setPiece;
    this.goalBanner = snapshot.goalBanner;
    this.stats = { ...snapshot.stats };
    const ballJump = Math.hypot(
      snapshot.ball.position.x - this.ball.position.x,
      snapshot.ball.position.z - this.ball.position.z
    );
    const snapImmediate = !this.hasReceivedNetSnapshot || ballJump > 12 || prevPhase !== snapshot.phase && (snapshot.phase === "live" || snapshot.phase === "setpiece");
    this.ball.ownerId = snapshot.ball.ownerId;
    this.ball.lastTouchTeam = snapshot.ball.lastTouchTeam;
    this.ball.lastTouchPlayerName = snapshot.ball.lastTouchPlayerName;
    this.ball.spin = { ...snapshot.ball.spin };
    this.ball.velocity = { ...snapshot.ball.velocity };
    this.netBallTarget = {
      x: snapshot.ball.position.x,
      y: snapshot.ball.position.y,
      z: snapshot.ball.position.z,
      vx: snapshot.ball.velocity.x,
      vy: snapshot.ball.velocity.y,
      vz: snapshot.ball.velocity.z
    };
    if (snapImmediate) {
      this.ball.position = { ...snapshot.ball.position };
    }
    const byId = /* @__PURE__ */ new Map();
    for (const np of snapshot.players) {
      byId.set(np.id, np);
    }
    for (const p of this.players) {
      const np = byId.get(p.id);
      if (!np) continue;
      p.stamina = np.stamina;
      p.actionState = np.actionState;
      p.diveDir = np.diveDir;
      p.hasBall = np.hasBall;
      p.isControlled = np.isControlled;
      p.velocity.x = np.vx;
      p.velocity.z = np.vz;
      p.animPhase = np.animPhase;
      const distJump = Math.hypot(np.x - p.position.x, np.z - p.position.z);
      this.netPlayerTargets.set(p.id, {
        x: np.x,
        y: np.y,
        z: np.z,
        vx: np.vx,
        vz: np.vz,
        facingAngle: np.facingAngle
      });
      if (snapImmediate || distJump > 9) {
        p.position.x = np.x;
        p.position.y = np.y;
        p.position.z = np.z;
        p.facingAngle = np.facingAngle;
      }
    }
    const wasFirstSnapshot = !this.hasReceivedNetSnapshot;
    this.hasReceivedNetSnapshot = true;
    if (wasFirstSnapshot) {
      const ownerTeam = this.resolveBallOwnerTeam();
      const firstTeam = this.phase === "setpiece" && this.setPiece ? this.setPiece.team : ownerTeam ?? this.ball.lastTouchTeam ?? this.kickoffTeam;
      this.controlModeState = createControlModeState(
        firstTeam === this.localSide ? "ATTACK" : "DEFENSE"
      );
    } else {
      this.updateControlMode(0);
    }
    for (const ev of snapshot.events) {
      this.playSoundEventLocally(ev);
      if (ev.type === "post") {
        this.callbacks.onCameraTrauma(0.45);
      } else if (ev.type === "goal") {
        this.callbacks.onCameraTrauma(0.55);
      }
    }
    soundEngine.updateCrowdIntensity(
      computeCrowdIntensity({
        shellState: this.shellState,
        phase: this.phase,
        ballX: this.ball.position.x,
        ballSpeed: Math.hypot(this.ball.velocity.x, this.ball.velocity.z),
        isReplaying: this.isReplaying,
        isOnline: true
      })
    );
    if (snapshot.phase === "fulltime") {
      this.shellState = "gameover";
    }
    this.emitHudSnapshot();
  }
  /**
   * Smoothly interpolates ball and remote players between server snapshots at 60 FPS.
   */
  stepOnlineInterpolation(rawDt) {
    const dt = Math.min(rawDt, 0.05);
    const ballAlpha = Math.min(1, 18 * dt);
    const playerAlpha = Math.min(1, 15 * dt);
    if (this.netBallTarget) {
      this.netBallTarget.x += this.netBallTarget.vx * dt * 0.35;
      this.netBallTarget.z += this.netBallTarget.vz * dt * 0.35;
      this.ball.position.x += (this.netBallTarget.x - this.ball.position.x) * ballAlpha;
      this.ball.position.y += (this.netBallTarget.y - this.ball.position.y) * ballAlpha;
      this.ball.position.z += (this.netBallTarget.z - this.ball.position.z) * ballAlpha;
    }
    for (const p of this.players) {
      const target = this.netPlayerTargets.get(p.id);
      if (!target) continue;
      target.x += target.vx * dt * 0.25;
      target.z += target.vz * dt * 0.25;
      p.position.x += (target.x - p.position.x) * playerAlpha;
      p.position.y += (target.y - p.position.y) * playerAlpha;
      p.position.z += (target.z - p.position.z) * playerAlpha;
      p.facingAngle = lerpAngle(p.facingAngle, target.facingAngle, Math.min(1, 16 * dt));
      const speed = Math.hypot(p.velocity.x, p.velocity.z);
      p.animPhase += speed * dt * 2.2;
    }
    if (this.updateControlMode(dt)) {
      this.emitHudSnapshot();
    }
  }
  /**
   * Returns live state or interpolated slow-motion replay proxies for 3D scene rendering.
   */
  getVisualState() {
    if (this.isOnlineClient || !this.isReplaying || this.replayRecorder.getClipLength() === 0) {
      return { ball: this.ball, players: this.players };
    }
    const replayProgress = Math.max(
      0,
      Math.min(1, (this.goalTotalElapsed - GOAL_IMPACT_DURATION) / GOAL_REPLAY_DURATION)
    );
    const clipSample = this.replayRecorder.sampleAtProgress(0.3 + replayProgress * 0.7);
    if (!clipSample) {
      return { ball: this.ball, players: this.players };
    }
    this.replayBallProxy.position.x = clipSample.ballPos.x;
    this.replayBallProxy.position.y = clipSample.ballPos.y;
    this.replayBallProxy.position.z = clipSample.ballPos.z;
    this.replayBallProxy.velocity.x = clipSample.ballVel.x;
    this.replayBallProxy.velocity.y = clipSample.ballVel.y;
    this.replayBallProxy.velocity.z = clipSample.ballVel.z;
    this.replayBallProxy.spin.x = clipSample.ballSpin.x;
    this.replayBallProxy.spin.y = clipSample.ballSpin.y;
    this.replayBallProxy.spin.z = clipSample.ballSpin.z;
    for (let i = 0; i < this.replayPlayerProxies.length; i++) {
      const proxy = this.replayPlayerProxies[i];
      const f = clipSample.players[i];
      if (!f) continue;
      proxy.position.x = f.x;
      proxy.position.y = f.y;
      proxy.position.z = f.z;
      proxy.facingAngle = f.facingAngle;
      proxy.actionState = f.actionState;
      proxy.diveDir = f.diveDir;
      proxy.animPhase = f.animPhase;
      proxy.isControlled = this.players[i]?.isControlled ?? false;
    }
    return { ball: this.replayBallProxy, players: this.replayPlayerProxies };
  }
  step(rawDt, input, awayInput) {
    if (this.shellState !== "playing") {
      return;
    }
    if (this.isOnlineClient) {
      this.stepOnlineInterpolation(rawDt);
      return;
    }
    const dt = Math.min(rawDt, 0.05);
    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      return;
    }
    if (this.phase === "goal") {
      stepBallPhysics(this.ball, dt);
      this.goalTotalElapsed += dt;
      this.goalCelebrationTimer -= dt;
      const shouldReplay = !this.awayHumanControl && this.goalTotalElapsed >= GOAL_IMPACT_DURATION && this.replayRecorder.getClipLength() > 4;
      if (shouldReplay !== this.isReplaying) {
        this.isReplaying = shouldReplay;
        this.emitHudSnapshot();
      }
      if (this.isReplaying && (input.shootPressed || input.passPressed || input.switchPressed)) {
        this.finishGoalCelebration();
        return;
      }
      if (this.goalCelebrationTimer <= 0) {
        this.finishGoalCelebration();
      }
      return;
    }
    if (this.phase === "halftime") {
      this.halftimeTimer -= dt;
      if (this.halftimeTimer <= 0) {
        this.half = 2;
        this.halfElapsedReal = 0;
        this.phase = "live";
        this.kickoffTeam = "away";
        this.shotCharge = 0;
        this.awayShotCharge = 0;
        this.setPiece = null;
        this.replayRecorder.clear();
        resetForKickoff(
          this.players,
          this.ball,
          this.homeFormation,
          this.awayFormation,
          "away"
        );
        this.ensureControlledPlayers();
        this.resetControlModeForKickoff();
        this.emitSound({ type: "whistle", pattern: "short" });
        this.emitHudSnapshot();
      }
      return;
    }
    if (this.phase === "fulltime") {
      return;
    }
    this.halfElapsedReal += dt;
    const clock = computeMatchClock(
      this.half,
      this.halfElapsedReal,
      this.halfDurationSeconds
    );
    this.matchMinutes = clock.matchMinutes;
    this.matchSeconds = clock.matchSeconds;
    if (clock.phaseTransition === "halftime") {
      this.phase = "halftime";
      this.halftimeTimer = 2.6;
      this.shotCharge = 0;
      this.awayShotCharge = 0;
      this.setPiece = null;
      this.emitSound({ type: "whistle", pattern: "double" });
      this.emitHudSnapshot();
      return;
    }
    if (clock.phaseTransition === "fulltime") {
      this.phase = "fulltime";
      this.shellState = "gameover";
      this.shotCharge = 0;
      this.awayShotCharge = 0;
      this.setPiece = null;
      this.emitSound({ type: "whistle", pattern: "long" });
      this.callbacks.onMatchFinished({ ...this.stats });
      this.emitHudSnapshot();
      return;
    }
    if (this.phase === "setpiece" && this.setPiece) {
      this.stepSetPiecePhase(dt, input, awayInput);
      return;
    }
    if (input.switchPressed) {
      const current = this.getControlledPlayer("home");
      const target = selectSwitchTarget(
        this.players,
        this.ball,
        "home",
        current?.id ?? null
      );
      if (target) {
        if (current) current.isControlled = false;
        target.isControlled = true;
        this.shotCharge = 0;
      }
    }
    if (this.awayHumanControl && awayInput?.switchPressed) {
      const currentAway = this.getControlledPlayer("away");
      const targetAway = selectSwitchTarget(
        this.players,
        this.ball,
        "away",
        currentAway?.id ?? null
      );
      if (targetAway) {
        if (currentAway) currentAway.isControlled = false;
        targetAway.isControlled = true;
        this.awayShotCharge = 0;
      }
    }
    this.lastHomeInputDir.x = input.moveX;
    this.lastHomeInputDir.z = input.moveZ;
    if (awayInput) {
      this.lastAwayInputDir.x = awayInput.moveX;
      this.lastAwayInputDir.z = awayInput.moveZ;
    }
    if (this.transitionTimer > 0) {
      this.transitionTimer = Math.max(0, this.transitionTimer - dt);
    }
    this.aiTickCounter += 1;
    const homeAssign = computeDefensiveAssignments(this.players, this.ball, "home");
    const awayAssign = computeDefensiveAssignments(this.players, this.ball, "away");
    const homeTransition = this.transitionTimer > 0 && this.lastPossessionTeam !== null ? this.lastPossessionTeam === "home" ? "attack" : "defend" : "none";
    const awayTransition = this.transitionTimer > 0 && this.lastPossessionTeam !== null ? this.lastPossessionTeam === "away" ? "attack" : "defend" : "none";
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      if (p.actionTimer > 0) {
        p.actionTimer = Math.max(0, p.actionTimer - dt);
        if (p.actionTimer === 0 && (p.actionState === "kick" || p.actionState === "tackle" || p.actionState === "dive")) {
          p.actionState = "idle";
          p.diveDir = 0;
        }
      }
      if (p.tackleCooldown > 0) p.tackleCooldown = Math.max(0, p.tackleCooldown - dt);
      if (p.kickCooldown > 0) p.kickCooldown = Math.max(0, p.kickCooldown - dt);
      if (p.diveCooldown > 0) p.diveCooldown = Math.max(0, p.diveCooldown - dt);
      if (p.gkHoldTimer > 0) p.gkHoldTimer = Math.max(0, p.gkHoldTimer - dt);
      if (p.isControlled && p.team === "home") {
        this.stepControlledPlayer(p, input, dt);
      } else if (p.isControlled && p.team === "away" && this.awayHumanControl && awayInput) {
        this.stepControlledPlayer(p, awayInput, dt);
      } else {
        const formation = p.team === "home" ? this.homeFormation : this.awayFormation;
        const mentality = p.team === "home" ? this.homeMentality : this.awayMentality;
        const assign = p.team === "home" ? homeAssign : awayAssign;
        const transition = p.team === "home" ? homeTransition : awayTransition;
        const isUrgent = p.role === "GK" || p.hasBall || p.id === assign.presserId || transition !== "none" || !this.aiDecisionCache.has(p.id);
        let steering = this.aiDecisionCache.get(p.id);
        if (isUrgent || (this.aiTickCounter + i) % 3 === 0 || !steering) {
          steering = computeAiSteering(
            p,
            this.players,
            this.ball,
            formation,
            assign.presserId,
            assign.coverId,
            mentality,
            transition
          );
          this.aiDecisionCache.set(p.id, steering);
        }
        this.stepAiPlayer(p, steering, dt);
      }
      clampPlayerToArena(p.position);
      if (this.phase === "setpiece") return;
    }
    resolvePlayerCollisions(this.players);
    if (this.ball.ownerId !== null) {
      const owner = this.players.find((p) => p.id === this.ball.ownerId);
      if (!owner) {
        this.ball.ownerId = null;
        this.shotCharge = 0;
        this.awayShotCharge = 0;
      } else {
        if (owner.team === "home") this.stats.homePossessionSeconds += dt;
        else this.stats.awayPossessionSeconds += dt;
        const dirX = Math.sin(owner.facingAngle);
        const dirZ = Math.cos(owner.facingAngle);
        const ownerSpeed = Math.hypot(owner.velocity.x, owner.velocity.z);
        const isSprinting = owner.actionState === "sprint" || ownerSpeed > 7.4;
        const speedNorm = Math.min(1, ownerSpeed / 9.8);
        const stridePulse = isSprinting ? Math.sin(owner.animPhase * 1.1) * 0.08 : 0;
        const leadDist = DRIBBLE_OFFSET_DIST * (0.86 + speedNorm * (isSprinting ? 0.48 : 0.16)) + stridePulse;
        const desiredBallX = owner.position.x + dirX * leadDist;
        const desiredBallZ = owner.position.z + dirZ * leadDist;
        const controlTightness = isSprinting ? 11.5 : 16.5;
        const followRate = Math.min(1, (controlTightness + owner.attributes.dribbling * 0.12) * dt);
        this.ball.position.x += (desiredBallX - this.ball.position.x) * followRate;
        this.ball.position.z += (desiredBallZ - this.ball.position.z) * followRate;
        this.ball.position.y = BALL_RADIUS;
        this.ball.velocity.x = owner.velocity.x;
        this.ball.velocity.y = 0;
        this.ball.velocity.z = owner.velocity.z;
        this.ball.spin.x = -owner.velocity.z * 0.9;
        this.ball.spin.y = 0;
        this.ball.spin.z = owner.velocity.x * 0.9;
      }
    } else {
      this.shotCharge = 0;
      this.awayShotCharge = 0;
      const ballResult = stepBallPhysics(this.ball, dt);
      if (ballResult.hitPost) {
        this.emitSound({ type: "post" });
        this.emitSound({ type: "crowd", reaction: "ooh" });
        this.callbacks.onCameraTrauma(0.45);
      }
      if (ballResult.scoredTeam !== null) {
        this.replayRecorder.record(this.ball, this.players, 0.04);
        this.handleGoalScored(ballResult.scoredTeam);
        return;
      }
      if (ballResult.outOfBounds !== null) {
        this.handleOutOfBounds(ballResult.outOfBounds);
        return;
      }
      this.tryPickupLooseBall();
      if (this.ball.ownerId === null) {
        const blocker = resolveLooseBallBodyContact(this.ball, this.players);
        if (blocker) {
          this.emitSound({ type: "kick", power: 0.48 });
        }
      }
    }
    if (!this.awayHumanControl) {
      this.replayRecorder.record(this.ball, this.players, dt);
    }
    const controlModeChanged = this.updateControlMode(dt);
    this.hudEmitAccumulator += dt;
    const hudInterval = this.shotCharge > 0 || this.awayShotCharge > 0 ? 0.04 : 0.1;
    if (controlModeChanged || this.hudEmitAccumulator >= hudInterval) {
      this.hudEmitAccumulator = 0;
      soundEngine.updateCrowdIntensity(
        computeCrowdIntensity({
          shellState: this.shellState,
          phase: this.phase,
          ballX: this.ball.position.x,
          ballSpeed: Math.hypot(this.ball.velocity.x, this.ball.velocity.z),
          isReplaying: this.isReplaying,
          isOnline: true
        })
      );
      this.emitHudSnapshot();
    }
  }
  stepSetPiecePhase(dt, homeInput, awayInput) {
    const sp = this.setPiece;
    if (!sp) {
      this.phase = "live";
      return;
    }
    const taker = sp.takerId ? this.players.find((p) => p.id === sp.takerId) ?? null : null;
    if (!taker) {
      this.phase = "live";
      this.setPiece = null;
      this.emitHudSnapshot();
      return;
    }
    const isHumanTaker = sp.team === "home" || sp.team === "away" && this.awayHumanControl && Boolean(awayInput);
    const takerInput = sp.team === "home" ? homeInput : awayInput ?? homeInput;
    const defendingInput = sp.team === "home" ? awayInput : homeInput;
    const attackGoalX = sp.team === "home" ? HALF_LENGTH : -HALF_LENGTH;
    if (sp.type === "penalty" && defendingInput && (sp.team === "away" || this.awayHumanControl)) {
      const defTeam = sp.team === "home" ? "away" : "home";
      const defGk = this.players.find((p) => p.team === defTeam && p.role === "GK");
      if (defGk) {
        if (defGk.diveCooldown > 0) defGk.diveCooldown = Math.max(0, defGk.diveCooldown - dt);
        if (defGk.actionTimer > 0) {
          defGk.actionTimer = Math.max(0, defGk.actionTimer - dt);
          if (defGk.actionTimer === 0 && defGk.actionState === "dive") {
            defGk.actionState = "idle";
            defGk.diveDir = 0;
          }
        }
        if ((defendingInput.tacklePressed || defendingInput.shootPressed) && defGk.diveCooldown <= 0) {
          const diveSign = defendingInput.moveZ >= 0 ? 1 : -1;
          defGk.actionState = "dive";
          defGk.actionTimer = 0.55;
          defGk.diveCooldown = 1.1;
          defGk.diveDir = diveSign;
          defGk.velocity.z = diveSign * 7.8;
        } else if (defGk.actionState !== "dive") {
          defGk.position.z = Math.max(
            -GOAL_HALF_WIDTH + 0.4,
            Math.min(GOAL_HALF_WIDTH - 0.4, defGk.position.z + defendingInput.moveZ * 4.5 * dt)
          );
        } else {
          defGk.position.z += defGk.velocity.z * dt;
          defGk.velocity.z *= Math.pow(0.92, dt * 60);
        }
      }
    }
    if (isHumanTaker && taker) {
      const moveMag = Math.hypot(takerInput.moveX, takerInput.moveZ);
      if (moveMag > 0.12) {
        const targetAngle = Math.atan2(takerInput.moveX, takerInput.moveZ);
        taker.facingAngle = lerpAngle(taker.facingAngle, targetAngle, Math.min(1, 10 * dt));
      }
      if (takerInput.shootHeld && !takerInput.shootPressed) {
        if (sp.team === "home") {
          this.shotCharge = Math.min(1, this.shotCharge + 1.45 * dt);
        } else {
          this.awayShotCharge = Math.min(1, this.awayShotCharge + 1.45 * dt);
        }
      }
      if (takerInput.shootReleased || takerInput.shootPressed || takerInput.passPressed || takerInput.lobPressed) {
        const rawCharge = sp.team === "home" ? this.shotCharge : this.awayShotCharge;
        const charge = rawCharge > 0.03 ? rawCharge : 0.55;
        if (sp.team === "home") this.shotCharge = 0;
        else this.awayShotCharge = 0;
        if (sp.type === "penalty") {
          const aimZ = Math.abs(takerInput.moveZ) > 0.1 ? takerInput.moveZ * (GOAL_HALF_WIDTH * 0.88) : 0;
          const profile = computeShotProfile(taker.attributes.shotPower, charge, false);
          applyBallKick(
            this.ball,
            attackGoalX - sp.spot.x,
            aimZ - sp.spot.z,
            profile.horizontalSpeed * 1.05,
            2.4 + charge * 2.2,
            taker,
            Math.sign(aimZ) * 1.1
          );
          if (sp.team === "home") this.stats.homeShots += 1;
          else this.stats.awayShots += 1;
          this.emitSound({ type: "kick", power: 1.2 });
        } else if ((sp.type === "free_kick" || sp.type === "corner") && (takerInput.shootReleased || takerInput.shootPressed)) {
          if (sp.type === "corner") {
            const boxX = sp.team === "home" ? HALF_LENGTH - 9.5 : -HALF_LENGTH + 9.5;
            const aimZ = Math.abs(takerInput.moveZ) > 0.1 ? takerInput.moveZ * 5 : 0;
            applyBallKick(
              this.ball,
              boxX - sp.spot.x,
              aimZ - sp.spot.z,
              18 + charge * 4,
              6.8 + charge * 1.6,
              taker,
              Math.sign(sp.spot.z || 1) * 1.6
            );
            if (sp.team === "home") this.stats.homePasses += 1;
            else this.stats.awayPasses += 1;
          } else {
            const aimZ = Math.abs(takerInput.moveZ) > 0.1 ? takerInput.moveZ * 3.4 : 0;
            const profile = computeShotProfile(taker.attributes.shotPower, charge, false);
            applyBallKick(
              this.ball,
              attackGoalX - sp.spot.x,
              aimZ - sp.spot.z,
              profile.horizontalSpeed,
              4.4 + charge * 2.5,
              taker,
              Math.sign(takerInput.moveZ || 1) * 1.8
            );
            if (sp.team === "home") this.stats.homeShots += 1;
            else this.stats.awayShots += 1;
          }
          this.emitSound({ type: "kick", power: 1.15 });
        } else {
          const isLob = takerInput.lobPressed || sp.type === "corner" || sp.type === "goal_kick";
          const aimX = moveMag > 0.12 ? takerInput.moveX : Math.sin(taker.facingAngle);
          const aimZ = moveMag > 0.12 ? takerInput.moveZ : Math.cos(taker.facingAngle);
          const target = findBestPassTarget(taker, this.players, aimX, aimZ);
          if (target) {
            const lead = computeLeadPassVector(taker, target, isLob);
            applyBallKick(this.ball, lead.dirX, lead.dirZ, lead.speed, lead.loft, taker);
            if (target.role !== "GK") {
              taker.isControlled = false;
              target.isControlled = true;
            }
          } else {
            applyBallKick(
              this.ball,
              aimX,
              aimZ,
              isLob ? 20 : 15,
              isLob ? 6.5 : 1.2,
              taker
            );
          }
          if (sp.team === "home") this.stats.homePasses += 1;
          else this.stats.awayPasses += 1;
          this.emitSound({ type: "kick", power: 0.95 });
        }
        this.phase = "live";
        this.setPiece = null;
        this.emitHudSnapshot();
        return;
      }
    } else {
      sp.timer -= dt;
      if (sp.timer <= 0 && taker) {
        const decision = computeSetPieceAiDecision(taker, sp.type, this.ball, this.players);
        applyBallKick(
          this.ball,
          decision.dirX,
          decision.dirZ,
          decision.speed,
          decision.loft,
          taker,
          decision.sideSpin
        );
        if (decision.isShot) this.stats.awayShots += 1;
        else this.stats.awayPasses += 1;
        this.emitSound({ type: "kick", power: decision.isShot ? 1.15 : 0.9 });
        this.phase = "live";
        this.setPiece = null;
        this.emitHudSnapshot();
        return;
      }
    }
    this.hudEmitAccumulator += dt;
    if (this.hudEmitAccumulator >= 0.06) {
      this.hudEmitAccumulator = 0;
      this.emitHudSnapshot();
    }
  }
  stepControlledPlayer(p, input, dt) {
    const moveMag = Math.hypot(input.moveX, input.moveZ);
    const wantsSprint = input.sprint && p.stamina > 8 && moveMag > 0.15;
    const isHome = p.team === "home";
    if (wantsSprint) {
      p.stamina = Math.max(0, p.stamina - 22 * dt);
    } else {
      p.stamina = Math.min(p.attributes.staminaMax, p.stamina + 14 * dt);
    }
    if (input.tacklePressed && !p.hasBall && p.tackleCooldown <= 0) {
      const dirX = moveMag > 0.1 ? input.moveX / moveMag : Math.sin(p.facingAngle);
      const dirZ = moveMag > 0.1 ? input.moveZ / moveMag : Math.cos(p.facingAngle);
      p.facingAngle = Math.atan2(dirX, dirZ);
      p.velocity.x = dirX * 11.2;
      p.velocity.z = dirZ * 11.2;
      p.actionState = "tackle";
      p.actionTimer = 0.34;
      p.tackleCooldown = 0.85;
      this.emitSound({ type: "tackle" });
      this.attemptTackleSteal(p);
      if (this.phase === "setpiece") return;
    }
    if (p.actionState !== "tackle") {
      const dribbleRetention = p.hasBall ? 0.89 + p.attributes.dribbling / 100 * 0.06 : 1;
      const topSpeed = p.attributes.speed * (wantsSprint ? 1.32 : 1) * dribbleRetention;
      const targetVx = input.moveX * topSpeed;
      const targetVz = input.moveZ * topSpeed;
      const targetAngle = moveMag > 0.1 ? Math.atan2(input.moveX, input.moveZ) : null;
      stepPlayerLocomotion(p, targetVx, targetVz, targetAngle, dt, wantsSprint, p.hasBall);
      if (moveMag > 0.1) {
        if (p.actionTimer <= 0) {
          p.actionState = wantsSprint ? "sprint" : p.hasBall ? "dribble" : "run";
        }
      } else if (p.actionTimer <= 0) {
        p.actionState = "idle";
      }
    } else {
      p.velocity.x *= Math.pow(0.88, dt * 60);
      p.velocity.z *= Math.pow(0.88, dt * 60);
      this.attemptTackleSteal(p);
      if (this.phase === "setpiece") return;
    }
    p.position.x += p.velocity.x * dt;
    p.position.z += p.velocity.z * dt;
    const speed = Math.hypot(p.velocity.x, p.velocity.z);
    p.animPhase += speed * dt * 2.2;
    if (p.hasBall) {
      if (input.shootHeld && !input.shootPressed) {
        if (isHome) this.shotCharge = Math.min(1, this.shotCharge + 1.55 * dt);
        else this.awayShotCharge = Math.min(1, this.awayShotCharge + 1.55 * dt);
      }
      if (input.shootReleased || input.shootPressed) {
        const rawCharge = isHome ? this.shotCharge : this.awayShotCharge;
        const charge = rawCharge > 0.03 ? rawCharge : 0.24;
        if (isHome) this.shotCharge = 0;
        else this.awayShotCharge = 0;
        const targetGoalX = isHome ? HALF_LENGTH : -HALF_LENGTH;
        const aimZ = Math.abs(input.moveZ) > 0.12 ? input.moveZ * 3.4 : 0;
        const shot = computeContextualShot(
          p,
          targetGoalX,
          aimZ,
          charge,
          this.players,
          wantsSprint
        );
        applyBallKick(
          this.ball,
          shot.dirX,
          shot.dirZ,
          shot.horizontalSpeed,
          shot.loftSpeed,
          p,
          shot.sideSpin
        );
        if (isHome) this.stats.homeShots += 1;
        else this.stats.awayShots += 1;
        this.hitstopTimer = shot.shotKind === "power" ? 0.045 : 0.032;
        this.callbacks.onCameraTrauma(0.16 + charge * 0.22);
        this.emitSound({ type: "kick", power: 0.98 + charge * 0.42 });
        this.emitHudSnapshot();
        return;
      }
      if (input.passPressed || input.lobPressed) {
        if (isHome) this.shotCharge = 0;
        else this.awayShotCharge = 0;
        const isLob = input.lobPressed;
        const target = findBestPassTarget(p, this.players, input.moveX, input.moveZ, isLob);
        let dirX = moveMag > 0.15 ? input.moveX : Math.sin(p.facingAngle);
        let dirZ = moveMag > 0.15 ? input.moveZ : Math.cos(p.facingAngle);
        let passSpeed = isLob ? 20.5 : wantsSprint ? 19.2 : 14.8;
        let loft = isLob ? 7.2 : wantsSprint ? 0.85 : 0.35;
        if (target) {
          const lead = computeLeadPassVector(p, target, isLob);
          const dist = Math.hypot(lead.dirX, lead.dirZ);
          dirX = lead.dirX + (Math.random() - 0.5) * lead.spreadFactor * dist;
          dirZ = lead.dirZ + (Math.random() - 0.5) * lead.spreadFactor * dist;
          passSpeed = lead.speed;
          loft = lead.loft;
        }
        applyBallKick(this.ball, dirX, dirZ, passSpeed, loft, p);
        if (isHome) this.stats.homePasses += 1;
        else this.stats.awayPasses += 1;
        this.emitSound({ type: "kick", power: isLob ? 1 : passSpeed > 18 ? 0.86 : 0.68 });
        if (target && target.role !== "GK") {
          p.isControlled = false;
          target.isControlled = true;
        }
      }
    } else {
      if (isHome) this.shotCharge = 0;
      else this.awayShotCharge = 0;
    }
  }
  stepAiPlayer(p, steering, dt) {
    if (p.role === "GK") {
      if (steering.shouldDive && p.diveCooldown <= 0 && p.actionState !== "dive") {
        const prevReaction = this.gkDiveReactionTimer.get(p.id);
        if (prevReaction === void 0) {
          const distToBall = Math.hypot(
            this.ball.position.x - p.position.x,
            this.ball.position.z - p.position.z
          );
          const reactionDelay = distToBall < 12 ? 0.14 : 0.1;
          this.gkDiveReactionTimer.set(p.id, reactionDelay);
        } else if (prevReaction > 0) {
          this.gkDiveReactionTimer.set(p.id, Math.max(0, prevReaction - dt));
        } else {
          this.gkDiveReactionTimer.delete(p.id);
          p.actionState = "dive";
          p.actionTimer = 0.48;
          p.diveCooldown = 1.15;
          p.diveDir = steering.diveDir;
          p.facingAngle = p.team === "home" ? Math.PI / 2 : -Math.PI / 2;
          p.velocity.x *= 0.25;
          p.velocity.z = steering.diveDir * 7.6;
        }
      } else {
        this.gkDiveReactionTimer.delete(p.id);
      }
    }
    if (steering.shouldTackle && !p.hasBall && p.tackleCooldown <= 0 && p.actionState !== "tackle" && p.actionState !== "dive") {
      const ballOwner = this.ball.ownerId !== null ? this.players.find((pl) => pl.id === this.ball.ownerId) ?? null : null;
      const canTackleCleanly = !ballOwner || ballOwner.team !== p.team && isCleanTackleAngle(p, ballOwner, this.ball);
      if (canTackleCleanly) {
        const dx = this.ball.position.x - p.position.x;
        const dz = this.ball.position.z - p.position.z;
        const len = Math.hypot(dx, dz) || 1;
        const nx = dx / len;
        const nz = dz / len;
        p.facingAngle = Math.atan2(nx, nz);
        p.velocity.x = nx * 10.6;
        p.velocity.z = nz * 10.6;
        p.actionState = "tackle";
        p.actionTimer = 0.34;
        p.tackleCooldown = 1.05;
        this.attemptTackleSteal(p);
        if (this.phase === "setpiece") return;
      }
    }
    if (p.actionState === "dive") {
      p.velocity.x *= Math.pow(0.88, dt * 60);
      p.velocity.z *= Math.pow(0.92, dt * 60);
      p.position.x += p.velocity.x * dt;
      p.position.z += p.velocity.z * dt;
      return;
    }
    if (p.actionState === "tackle") {
      p.velocity.x *= Math.pow(0.88, dt * 60);
      p.velocity.z *= Math.pow(0.88, dt * 60);
      this.attemptTackleSteal(p);
      if (this.phase === "setpiece") return;
    } else {
      const dx = steering.desiredX - p.position.x;
      const dz = steering.desiredZ - p.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.35) {
        const nx = dx / dist;
        const nz = dz / dist;
        const maxSpeed = p.attributes.speed * (steering.sprint ? 1.18 : 0.92);
        const desiredSpeed = Math.min(maxSpeed, dist * 2.8);
        const targetAngle = Math.atan2(nx, nz);
        stepPlayerLocomotion(
          p,
          nx * desiredSpeed,
          nz * desiredSpeed,
          targetAngle,
          dt,
          steering.sprint,
          p.hasBall
        );
        if (p.actionTimer <= 0) {
          p.actionState = p.hasBall ? "dribble" : steering.sprint ? "sprint" : "run";
        }
      } else {
        const bdx = this.ball.position.x - p.position.x;
        const bdz = this.ball.position.z - p.position.z;
        const lookAngle = Math.hypot(bdx, bdz) > 0.5 ? Math.atan2(bdx, bdz) : null;
        stepPlayerLocomotion(p, 0, 0, lookAngle, dt, false, p.hasBall);
        if (p.actionTimer <= 0) p.actionState = "idle";
      }
    }
    p.position.x += p.velocity.x * dt;
    p.position.z += p.velocity.z * dt;
    const speed = Math.hypot(p.velocity.x, p.velocity.z);
    p.animPhase += speed * dt * 2.2;
    if (p.hasBall && (steering.shouldShoot || steering.shouldPass)) {
      if (steering.shouldShoot) {
        if (p.team === "home") this.stats.homeShots += 1;
        else this.stats.awayShots += 1;
      } else if (steering.shouldPass) {
        if (p.team === "home") this.stats.homePasses += 1;
        else this.stats.awayPasses += 1;
      }
      executeAiBallAction(p, this.ball, steering, this.players, (kind) => {
        this.emitSound({ type: "kick", power: kind === "kick" ? 1.12 : 0.72 });
      });
    }
  }
  attemptTackleSteal(tackler) {
    if (this.phase !== "live" || tackler.actionState !== "tackle") return;
    if (this.ball.ownerId === null) {
      const d = Math.hypot(
        this.ball.position.x - tackler.position.x,
        this.ball.position.z - tackler.position.z
      );
      if (d < TACKLE_REACH) {
        this.claimBall(tackler);
      }
      return;
    }
    const owner = this.players.find((p) => p.id === this.ball.ownerId);
    if (!owner || owner.team === tackler.team) return;
    const outcome = classifyTackleFoul(tackler, owner, this.ball);
    if (outcome === "free_kick" || outcome === "penalty") {
      if (tackler.team === "home") this.stats.homeFouls += 1;
      else this.stats.awayFouls += 1;
      tackler.actionState = "idle";
      tackler.actionTimer = 0;
      tackler.tackleCooldown = 1.6;
      this.triggerSetPiece(outcome, owner.team, { ...owner.position });
      return;
    }
    if (outcome === "clean") {
      owner.hasBall = false;
      owner.kickCooldown = 0.5;
      this.claimBall(tackler);
      this.emitSound({ type: "kick", power: 0.8 });
    }
  }
  triggerSetPiece(type, restartTeam, spot) {
    const setup = computeSetPieceSetup(type, spot, restartTeam, this.players, this.ball);
    this.shotCharge = 0;
    this.awayShotCharge = 0;
    this.phase = "setpiece";
    this.setPiece = {
      type,
      team: restartTeam,
      spot: setup.spot,
      takerId: setup.takerId,
      timer: type === "penalty" ? 1.45 : 1.15
    };
    this.emitSound({
      type: "whistle",
      pattern: type === "penalty" || type === "free_kick" ? "double" : "short"
    });
    if (type === "penalty" || type === "free_kick") {
      this.emitSound({ type: "crowd", reaction: "boo" });
    } else if (type === "corner") {
      this.emitSound({ type: "crowd", reaction: "applause" });
    }
    this.updateControlMode(0);
    this.emitHudSnapshot();
  }
  tryPickupLooseBall() {
    if (this.ball.pickupLockTimer > 0) return;
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      if (p.role !== "GK") continue;
      const incomingSpeed = Math.hypot(this.ball.velocity.x, this.ball.velocity.z);
      const wasOpponentShot = this.ball.lastTouchTeam !== null && this.ball.lastTouchTeam !== p.team;
      const saveResult = attemptGoalkeeperSave(p, this.ball);
      if (saveResult === "parry") {
        if (p.team === "home") this.stats.homeSaves += 1;
        else this.stats.awaySaves += 1;
        this.callbacks.onCameraTrauma(0.25);
        this.emitSound({ type: "kick", power: 1.1 });
        this.emitSound({ type: "crowd", reaction: "ooh" });
        this.emitHudSnapshot();
        return;
      }
      if (saveResult === "catch") {
        if (wasOpponentShot && incomingSpeed > 9.5) {
          if (p.team === "home") this.stats.homeSaves += 1;
          else this.stats.awaySaves += 1;
          this.emitSound({ type: "crowd", reaction: "applause" });
        }
        p.gkHoldTimer = 0.75;
        this.claimBall(p);
        this.emitSound({ type: "kick", power: 0.55 });
        this.emitHudSnapshot();
        return;
      }
    }
    if (this.ball.position.y > 1.92) return;
    let closestReceiver = null;
    let bestReceiverDist = DRIBBLE_CONTROL_RADIUS;
    let closestInterceptor = null;
    let bestInterceptDist = Infinity;
    let closestBlocker = null;
    let bestBlockDist = Infinity;
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      if (p.role === "GK" || p.kickCooldown > 0) continue;
      const d = Math.hypot(
        this.ball.position.x - p.position.x,
        this.ball.position.z - p.position.z
      );
      if (this.ball.lastTouchTeam !== null && this.ball.lastTouchTeam !== p.team) {
        const outcome = evaluateInterception(p, this.ball);
        if (outcome === "intercept" && d < bestInterceptDist) {
          bestInterceptDist = d;
          closestInterceptor = p;
        } else if (outcome === "block" && d < bestBlockDist) {
          bestBlockDist = d;
          closestBlocker = p;
        }
        continue;
      }
      if (this.ball.position.y <= 1.55 && d < bestReceiverDist) {
        bestReceiverDist = d;
        closestReceiver = p;
      }
    }
    if (!closestReceiver && !closestInterceptor && closestBlocker) {
      const bx = this.ball.position.x - closestBlocker.position.x;
      const bz = this.ball.position.z - closestBlocker.position.z;
      const len = Math.hypot(bx, bz) || 1;
      this.ball.velocity.x = bx / len * 6.2 + closestBlocker.velocity.x * 0.3;
      this.ball.velocity.z = bz / len * 6.2 + closestBlocker.velocity.z * 0.3;
      this.ball.velocity.y = 2.1;
      this.ball.pickupLockTimer = 0.16;
      this.ball.lastTouchTeam = closestBlocker.team;
      this.ball.lastTouchPlayerName = closestBlocker.name;
      closestBlocker.kickCooldown = 0.2;
      this.emitSound({ type: "kick", power: 0.72 });
      return;
    }
    const winner = closestReceiver && closestInterceptor ? bestReceiverDist <= bestInterceptDist ? closestReceiver : closestInterceptor : closestReceiver ?? closestInterceptor;
    if (!winner) return;
    const inputDir = winner.isControlled && winner.team === "home" ? this.lastHomeInputDir : winner.isControlled && winner.team === "away" ? this.lastAwayInputDir : { x: 0, z: 0 };
    const reception = evaluateBallReception(winner, this.ball, inputDir.x, inputDir.z);
    if (reception.outcome === "heavy_touch") {
      this.ball.position.x = winner.position.x + reception.touchDirX * reception.touchOffsetMeters;
      this.ball.position.z = winner.position.z + reception.touchDirZ * reception.touchOffsetMeters;
      this.ball.position.y = BALL_RADIUS + 0.08;
      this.ball.velocity.x = reception.touchDirX * reception.deflectSpeed;
      this.ball.velocity.z = reception.touchDirZ * reception.deflectSpeed;
      this.ball.velocity.y = 1.4;
      this.ball.pickupLockTimer = 0.14;
      this.ball.lastTouchTeam = winner.team;
      this.ball.lastTouchPlayerName = winner.name;
      this.emitSound({ type: "kick", power: 0.55 });
      return;
    }
    this.claimBall(winner);
    this.ball.position.x = winner.position.x + reception.touchDirX * reception.touchOffsetMeters;
    this.ball.position.z = winner.position.z + reception.touchDirZ * reception.touchOffsetMeters;
    this.ball.position.y = BALL_RADIUS;
    if (Math.hypot(reception.touchDirX, reception.touchDirZ) > 0.1) {
      const touchAngle = Math.atan2(reception.touchDirX, reception.touchDirZ);
      winner.facingAngle = lerpAngle(winner.facingAngle, touchAngle, 0.45);
    }
  }
  claimBall(player) {
    if (this.lastPossessionTeam !== null && this.lastPossessionTeam !== player.team) {
      this.transitionTimer = 1.65;
    }
    this.lastPossessionTeam = player.team;
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      p.hasBall = p.id === player.id;
    }
    this.ball.ownerId = player.id;
    this.ball.lastTouchTeam = player.team;
    this.ball.lastTouchPlayerName = player.name;
    if (player.team === "home" && player.role !== "GK" && !player.isControlled) {
      this.shotCharge = 0;
      for (let i = 0; i < this.players.length; i++) {
        const p = this.players[i];
        if (p.team === "home") p.isControlled = p.id === player.id;
      }
    } else if (player.team === "away" && this.awayHumanControl && player.role !== "GK" && !player.isControlled) {
      this.awayShotCharge = 0;
      for (let i = 0; i < this.players.length; i++) {
        const p = this.players[i];
        if (p.team === "away") p.isControlled = p.id === player.id;
      }
    }
  }
  handleGoalScored(scoringTeam) {
    if (scoringTeam === "home") {
      this.stats.homeScore += 1;
    } else {
      this.stats.awayScore += 1;
    }
    const scorerName = this.ball.lastTouchTeam === scoringTeam && this.ball.lastTouchPlayerName ? this.ball.lastTouchPlayerName : scoringTeam === "home" ? this.homeTeam.roster[9].name : this.awayTeam.roster[9].name;
    this.stats.lastScorerName = scorerName;
    this.stats.lastScorerTeam = scoringTeam;
    this.stats.lastGoalMinute = Math.max(1, this.matchMinutes);
    this.goalBanner = {
      scorerName,
      teamName: scoringTeam === "home" ? this.homeTeam.name : this.awayTeam.name,
      minute: Math.max(1, this.matchMinutes)
    };
    for (const p of this.players) {
      if (p.team === scoringTeam && p.role !== "GK") {
        const distToBall = Math.hypot(
          p.position.x - this.ball.position.x,
          p.position.z - this.ball.position.z
        );
        if (p.name === scorerName || distToBall < 22) {
          p.actionState = "celebrate";
          p.actionTimer = GOAL_IMPACT_DURATION + 0.5;
          p.velocity.x = 0;
          p.velocity.z = 0;
        }
      }
    }
    if (!this.awayHumanControl) {
      this.replayRecorder.freezeClip();
    }
    this.phase = "goal";
    this.isReplaying = false;
    this.goalTotalElapsed = 0;
    this.kickoffTeam = scoringTeam === "home" ? "away" : "home";
    this.goalCelebrationTimer = this.awayHumanControl ? 2.2 : GOAL_IMPACT_DURATION + GOAL_REPLAY_DURATION;
    this.hitstopTimer = 0.06;
    this.shotCharge = 0;
    this.awayShotCharge = 0;
    this.setPiece = null;
    this.callbacks.onCameraTrauma(0.55);
    this.emitSound({ type: "net" });
    this.emitSound({ type: "whistle", pattern: "short" });
    this.emitSound({ type: "goal" });
    this.emitHudSnapshot();
  }
  handleOutOfBounds(outType) {
    const restart = getRestartPositionForOutOfBounds(
      outType,
      this.ball.position.x,
      this.ball.position.z,
      this.ball.lastTouchTeam
    );
    if (restart.type === "corner") {
      if (restart.restartTeam === "home") this.stats.homeCorners += 1;
      else this.stats.awayCorners += 1;
    }
    this.triggerSetPiece(restart.type, restart.restartTeam, {
      x: restart.x,
      y: BALL_RADIUS,
      z: restart.z
    });
  }
  emitHudSnapshot() {
    const controlled = this.getControlledPlayer(this.localSide) ?? this.players[9];
    const localCharge = this.getShotCharge(this.localSide);
    const radarPlayers = this.players.map((p) => ({
      x: p.position.x / HALF_LENGTH,
      z: p.position.z / 34,
      team: p.team,
      isControlled: p.team === this.localSide && p.isControlled
    }));
    let setPieceBanner = null;
    if (this.phase === "setpiece" && this.setPiece) {
      const sp = this.setPiece;
      const teamName = sp.team === "home" ? this.homeTeam.shortName : this.awayTeam.shortName;
      let hint = "D\xE9fense sur coup de pied arr\xEAt\xE9";
      if (sp.team === this.localSide) {
        hint = sp.type === "penalty" ? "Visez un angle + Maintenez/Rel\xE2chez TIR" : "Visez + PASSE / LOB / TIR";
      } else if (sp.type === "penalty") {
        hint = "D\xE9placez le gardien + TACLE / TIR pour plonger";
      }
      setPieceBanner = {
        type: sp.type,
        team: sp.team,
        teamName,
        hint
      };
    }
    this.callbacks.onHudUpdate({
      shellState: this.shellState,
      phase: this.phase,
      half: this.half,
      matchMinutes: this.matchMinutes,
      matchSeconds: this.matchSeconds,
      homeScore: this.stats.homeScore,
      awayScore: this.stats.awayScore,
      homeShort: this.homeTeam.shortName,
      awayShort: this.awayTeam.shortName,
      homeColor: this.homeTeam.kit.primary,
      awayColor: this.awayTeam.kit.primary,
      homeFormation: this.localSide === "away" ? this.awayFormation : this.homeFormation,
      homeMentality: this.localSide === "away" ? this.awayMentality : this.homeMentality,
      controlledPlayerName: controlled?.name ?? "Player",
      controlledPlayerNumber: controlled?.number ?? 9,
      controlledPlayerRole: controlled?.role ?? "ST",
      controlledStamina: Math.round(controlled?.stamina ?? 100),
      controlledHasBall: controlled?.hasBall ?? false,
      controlledShotCharge: controlled?.hasBall || this.phase === "setpiece" && this.setPiece?.team === this.localSide ? localCharge : 0,
      controlMode: this.controlModeState.mode,
      cameraMode: this.cameraMode,
      isReplaying: this.isReplaying,
      setPieceBanner,
      goalBanner: this.goalBanner,
      stats: { ...this.stats },
      radarBall: {
        x: this.ball.position.x / HALF_LENGTH,
        z: this.ball.position.z / 34
      },
      radarPlayers
    });
  }
};
function lerpAngle(a, b, t) {
  let diff = b - a;
  while (diff < -Math.PI) diff += Math.PI * 2;
  while (diff > Math.PI) diff -= Math.PI * 2;
  return a + diff * t;
}

// src/teams/teams.ts
function makePlayer(id, name, number, role, speedBoost, skinTone, hairStyle, hairColor, bootsColor) {
  const isGK = role === "GK";
  const isFwd = role === "ST" || role === "LW" || role === "RW" || role === "CAM";
  const isMid = role === "CM" || role === "CDM";
  return {
    id,
    name,
    number,
    role,
    attributes: {
      speed: isGK ? 6.1 : (isFwd ? 7.8 : isMid ? 7.3 : 7.1) + speedBoost,
      acceleration: isGK ? 14 : 18 + speedBoost * 2,
      staminaMax: 100,
      shotPower: isFwd ? 28 : isMid ? 25 : 22,
      passing: isMid ? 88 : isFwd ? 80 : 76,
      dribbling: isFwd ? 86 : isMid ? 82 : 72
    },
    appearance: {
      skinTone,
      hairStyle,
      hairColor,
      bootsColor
    }
  };
}
var SKIN_TONES = ["#f1c7a6", "#d99e78", "#b97a52", "#7d4d32", "#f4d3b8"];
var HAIR_COLORS = ["#1d1815", "#3b281c", "#7a4b22", "#c89b44", "#111216"];
var HAIR_STYLES = ["short", "fade", "curly", "buzz"];
function buildSquad(prefix, names, bootsPrimary, bootsAlt, ratingOffset) {
  const roles = ["GK", "LB", "CB", "CB", "RB", "CDM", "CM", "CM", "LW", "ST", "RW"];
  const numbers = [1, 3, 4, 5, 2, 6, 8, 10, 11, 9, 7];
  return names.map(
    (name, idx) => makePlayer(
      `${prefix}_${idx}`,
      name,
      numbers[idx],
      roles[idx],
      ratingOffset + (idx % 3 - 1) * 0.14,
      SKIN_TONES[(idx * 2 + prefix.length) % SKIN_TONES.length],
      HAIR_STYLES[(idx + prefix.length) % HAIR_STYLES.length],
      HAIR_COLORS[(idx * 3 + prefix.length) % HAIR_COLORS.length],
      idx >= 8 ? bootsAlt : bootsPrimary
    )
  );
}
var TEAMS = [
  // ========================
  // EUROPEAN CLUBS (14)
  // ========================
  {
    id: "aurelia",
    name: "Real Madrid",
    shortName: "RMA",
    city: "Madrid",
    region: "europe",
    kit: {
      primary: "#f8fafc",
      secondary: "#1e3a8a",
      shorts: "#f8fafc",
      socks: "#f8fafc",
      gkPrimary: "#f59e0b",
      gkSecondary: "#1f2937"
    },
    rating: { attack: 89, midfield: 87, defense: 85 },
    roster: buildSquad(
      "rma",
      [
        "T. Courtois",
        "F. Mendy",
        "A. Rudiger",
        "E. Militao",
        "D. Carvajal",
        "A. Tchouameni",
        "F. Valverde",
        "J. Bellingham",
        "Vinicius Jr",
        "K. Mbappe",
        "Rodrygo"
      ],
      "#f97316",
      "#38bdf8",
      0.22
    )
  },
  {
    id: "nordic",
    name: "FC Barcelona",
    shortName: "BAR",
    city: "Barcelona",
    region: "europe",
    kit: {
      primary: "#1d4ed8",
      secondary: "#be123c",
      shorts: "#1e3a8a",
      socks: "#1d4ed8",
      gkPrimary: "#10b981",
      gkSecondary: "#064e3b"
    },
    rating: { attack: 87, midfield: 88, defense: 83 },
    roster: buildSquad(
      "bar",
      [
        "M. ter Stegen",
        "A. Balde",
        "R. Araujo",
        "P. Cubarsi",
        "J. Kounde",
        "F. de Jong",
        "Pedri",
        "Gavi",
        "Raphinha",
        "R. Lewandowski",
        "L. Yamal"
      ],
      "#facc15",
      "#fb7185",
      0.19
    )
  },
  {
    id: "valoria",
    name: "Manchester City",
    shortName: "MCI",
    city: "Manchester",
    region: "europe",
    kit: {
      primary: "#38bdf8",
      secondary: "#ffffff",
      shorts: "#f8fafc",
      socks: "#38bdf8",
      gkPrimary: "#f97316",
      gkSecondary: "#1f2937"
    },
    rating: { attack: 88, midfield: 89, defense: 85 },
    roster: buildSquad(
      "mci",
      [
        "Ederson",
        "J. Gvardiol",
        "R. Dias",
        "J. Stones",
        "K. Walker",
        "Rodri",
        "K. De Bruyne",
        "B. Silva",
        "J. Doku",
        "E. Haaland",
        "P. Foden"
      ],
      "#22c55e",
      "#f43f5e",
      0.21
    )
  },
  {
    id: "metro",
    name: "Manchester United",
    shortName: "MUN",
    city: "Manchester",
    region: "europe",
    kit: {
      primary: "#dc2626",
      secondary: "#ffffff",
      shorts: "#f8fafc",
      socks: "#111827",
      gkPrimary: "#22c55e",
      gkSecondary: "#14532d"
    },
    rating: { attack: 83, midfield: 82, defense: 81 },
    roster: buildSquad(
      "mun",
      [
        "A. Onana",
        "L. Shaw",
        "L. Martinez",
        "M. de Ligt",
        "D. Dalot",
        "Casemiro",
        "K. Mainoo",
        "B. Fernandes",
        "M. Rashford",
        "R. Hojlund",
        "A. Garnacho"
      ],
      "#38bdf8",
      "#facc15",
      0.11
    )
  },
  {
    id: "solaris",
    name: "Liverpool",
    shortName: "LIV",
    city: "Liverpool",
    region: "europe",
    kit: {
      primary: "#b91c1c",
      secondary: "#fef2f2",
      shorts: "#b91c1c",
      socks: "#b91c1c",
      gkPrimary: "#eab308",
      gkSecondary: "#1f2937"
    },
    rating: { attack: 87, midfield: 85, defense: 86 },
    roster: buildSquad(
      "liv",
      [
        "Alisson",
        "A. Robertson",
        "V. van Dijk",
        "I. Konate",
        "T. Alexander-Arnold",
        "R. Gravenberch",
        "A. Mac Allister",
        "D. Szoboszlai",
        "L. Diaz",
        "D. Jota",
        "M. Salah"
      ],
      "#fb923c",
      "#fde047",
      0.18
    )
  },
  {
    id: "ironport",
    name: "Arsenal",
    shortName: "ARS",
    city: "London",
    region: "europe",
    kit: {
      primary: "#ef4444",
      secondary: "#ffffff",
      shorts: "#f8fafc",
      socks: "#ef4444",
      gkPrimary: "#a3e635",
      gkSecondary: "#1e293b"
    },
    rating: { attack: 85, midfield: 86, defense: 87 },
    roster: buildSquad(
      "ars",
      [
        "D. Raya",
        "J. Timber",
        "W. Saliba",
        "Gabriel",
        "B. White",
        "D. Rice",
        "M. Odegaard",
        "M. Merino",
        "G. Martinelli",
        "K. Havertz",
        "B. Saka"
      ],
      "#f43f5e",
      "#38bdf8",
      0.17
    )
  },
  {
    id: "verde",
    name: "Chelsea",
    shortName: "CHE",
    city: "London",
    region: "europe",
    kit: {
      primary: "#1e40af",
      secondary: "#ffffff",
      shorts: "#1e40af",
      socks: "#f8fafc",
      gkPrimary: "#f59e0b",
      gkSecondary: "#111827"
    },
    rating: { attack: 84, midfield: 83, defense: 82 },
    roster: buildSquad(
      "che",
      [
        "R. Sanchez",
        "M. Cucurella",
        "L. Colwill",
        "W. Fofana",
        "R. James",
        "M. Caicedo",
        "E. Fernandez",
        "C. Palmer",
        "P. Neto",
        "N. Jackson",
        "N. Madueke"
      ],
      "#38bdf8",
      "#facc15",
      0.13
    )
  },
  {
    id: "caspian",
    name: "Bayern Munich",
    shortName: "BAY",
    city: "Munich",
    region: "europe",
    kit: {
      primary: "#dc2626",
      secondary: "#f8fafc",
      shorts: "#dc2626",
      socks: "#dc2626",
      gkPrimary: "#22d3ee",
      gkSecondary: "#0f172a"
    },
    rating: { attack: 88, midfield: 86, defense: 85 },
    roster: buildSquad(
      "bay",
      [
        "M. Neuer",
        "A. Davies",
        "D. Upamecano",
        "M. Kim",
        "J. Kimmich",
        "J. Palhinha",
        "L. Goretzka",
        "J. Musiala",
        "L. Sane",
        "H. Kane",
        "M. Olise"
      ],
      "#a3e635",
      "#f8fafc",
      0.2
    )
  },
  {
    id: "dortmund",
    name: "Borussia Dortmund",
    shortName: "BVB",
    city: "Dortmund",
    region: "europe",
    kit: {
      primary: "#facc15",
      secondary: "#111827",
      shorts: "#111827",
      socks: "#facc15",
      gkPrimary: "#0ea5e9",
      gkSecondary: "#0f172a"
    },
    rating: { attack: 84, midfield: 82, defense: 81 },
    roster: buildSquad(
      "bvb",
      [
        "G. Kobel",
        "R. Bensebaini",
        "N. Schlotterbeck",
        "W. Anton",
        "J. Ryerson",
        "E. Can",
        "M. Sabitzer",
        "J. Brandt",
        "K. Adeyemi",
        "S. Guirassy",
        "D. Malen"
      ],
      "#f97316",
      "#111827",
      0.12
    )
  },
  {
    id: "psg",
    name: "Paris Saint-Germain",
    shortName: "PSG",
    city: "Paris",
    region: "europe",
    kit: {
      primary: "#0f172a",
      secondary: "#dc2626",
      shorts: "#0f172a",
      socks: "#0f172a",
      gkPrimary: "#22c55e",
      gkSecondary: "#052e16"
    },
    rating: { attack: 86, midfield: 85, defense: 84 },
    roster: buildSquad(
      "psg",
      [
        "G. Donnarumma",
        "N. Mendes",
        "Marquinhos",
        "W. Pacho",
        "A. Hakimi",
        "Vitinha",
        "J. Neves",
        "W. Zaire-Emery",
        "B. Barcola",
        "G. Ramos",
        "O. Dembele"
      ],
      "#fb7185",
      "#38bdf8",
      0.16
    )
  },
  {
    id: "inter",
    name: "Inter Milan",
    shortName: "INT",
    city: "Milan",
    region: "europe",
    kit: {
      primary: "#1d4ed8",
      secondary: "#0f172a",
      shorts: "#0f172a",
      socks: "#1d4ed8",
      gkPrimary: "#f59e0b",
      gkSecondary: "#1c1917"
    },
    rating: { attack: 86, midfield: 86, defense: 86 },
    roster: buildSquad(
      "int",
      [
        "Y. Sommer",
        "F. Dimarco",
        "A. Bastoni",
        "F. Acerbi",
        "D. Dumfries",
        "H. Calhanoglu",
        "N. Barella",
        "H. Mkhitaryan",
        "M. Thuram",
        "L. Martinez",
        "M. Taremi"
      ],
      "#38bdf8",
      "#facc15",
      0.17
    )
  },
  {
    id: "milan",
    name: "AC Milan",
    shortName: "ACM",
    city: "Milan",
    region: "europe",
    kit: {
      primary: "#b91c1c",
      secondary: "#111827",
      shorts: "#111827",
      socks: "#111827",
      gkPrimary: "#14b8a6",
      gkSecondary: "#0f172a"
    },
    rating: { attack: 84, midfield: 83, defense: 82 },
    roster: buildSquad(
      "acm",
      [
        "M. Maignan",
        "T. Hernandez",
        "F. Tomori",
        "M. Thiaw",
        "D. Calabria",
        "Y. Fofana",
        "T. Reijnders",
        "R. Loftus-Cheek",
        "R. Leao",
        "A. Morata",
        "C. Pulisic"
      ],
      "#f43f5e",
      "#f8fafc",
      0.13
    )
  },
  {
    id: "juventus",
    name: "Juventus",
    shortName: "JUV",
    city: "Turin",
    region: "europe",
    kit: {
      primary: "#1e293b",
      secondary: "#ffffff",
      shorts: "#0f172a",
      socks: "#ffffff",
      gkPrimary: "#eab308",
      gkSecondary: "#1e293b"
    },
    rating: { attack: 83, midfield: 83, defense: 85 },
    roster: buildSquad(
      "juv",
      [
        "M. Di Gregorio",
        "A. Cambiaso",
        "Bremer",
        "F. Gatti",
        "P. Kalulu",
        "M. Locatelli",
        "K. Thuram",
        "T. Koopmeiners",
        "K. Yildiz",
        "D. Vlahovic",
        "F. Conceicao"
      ],
      "#e2e8f0",
      "#f97316",
      0.12
    )
  },
  {
    id: "atletico",
    name: "Atl\xE9tico Madrid",
    shortName: "ATM",
    city: "Madrid",
    region: "europe",
    kit: {
      primary: "#e11d48",
      secondary: "#ffffff",
      shorts: "#1e3a8a",
      socks: "#e11d48",
      gkPrimary: "#10b981",
      gkSecondary: "#064e3b"
    },
    rating: { attack: 85, midfield: 84, defense: 85 },
    roster: buildSquad(
      "atm",
      [
        "J. Oblak",
        "J. Galan",
        "J. Gimenez",
        "R. Le Normand",
        "M. Llorente",
        "Koke",
        "R. De Paul",
        "C. Gallagher",
        "A. Griezmann",
        "J. Alvarez",
        "A. Sorloth"
      ],
      "#f43f5e",
      "#38bdf8",
      0.15
    )
  },
  // ========================
  // AFRICAN CLUBS (10)
  // ========================
  {
    id: "alahly",
    name: "Al Ahly",
    shortName: "AHL",
    city: "Cairo",
    region: "africa",
    kit: {
      primary: "#dc2626",
      secondary: "#ffffff",
      shorts: "#f8fafc",
      socks: "#dc2626",
      gkPrimary: "#0ea5e9",
      gkSecondary: "#0f172a"
    },
    rating: { attack: 82, midfield: 81, defense: 81 },
    roster: buildSquad(
      "ahl",
      [
        "M. El Shenawy",
        "A. Maaloul",
        "Y. Ibrahim",
        "R. Rabia",
        "M. Hany",
        "M. Attia",
        "E. Ashour",
        "A. El Solia",
        "H. El Shahat",
        "W. Abou Ali",
        "P. Tau"
      ],
      "#facc15",
      "#38bdf8",
      0.09
    )
  },
  {
    id: "zamalek",
    name: "Zamalek",
    shortName: "ZAM",
    city: "Cairo",
    region: "africa",
    kit: {
      primary: "#f1f5f9",
      secondary: "#dc2626",
      shorts: "#f1f5f9",
      socks: "#f1f5f9",
      gkPrimary: "#22c55e",
      gkSecondary: "#052e16"
    },
    rating: { attack: 80, midfield: 79, defense: 78 },
    roster: buildSquad(
      "zam",
      [
        "M. Awad",
        "A. Fatouh",
        "H. Abdelmaguid",
        "M. Hamdy",
        "O. Gaber",
        "N. Emad",
        "A. El Said",
        "N. Maher",
        "M. Shalaby",
        "S. Jaziri",
        "Zizo"
      ],
      "#ef4444",
      "#facc15",
      0.05
    )
  },
  {
    id: "wydad",
    name: "Wydad AC",
    shortName: "WAC",
    city: "Casablanca",
    region: "africa",
    kit: {
      primary: "#e11d48",
      secondary: "#ffffff",
      shorts: "#ffffff",
      socks: "#e11d48",
      gkPrimary: "#eab308",
      gkSecondary: "#1f2937"
    },
    rating: { attack: 80, midfield: 80, defense: 79 },
    roster: buildSquad(
      "wac",
      [
        "Y. El Motie",
        "A. Boutouil",
        "J. Harkass",
        "A. Aboulfath",
        "A. El Amloud",
        "Y. Jabrane",
        "M. Moufid",
        "O. Sakhi",
        "M. Rayhi",
        "C. Mailula",
        "M. Ounajem"
      ],
      "#f8fafc",
      "#fbbf24",
      0.06
    )
  },
  {
    id: "raja",
    name: "Raja CA",
    shortName: "RCA",
    city: "Casablanca",
    region: "africa",
    kit: {
      primary: "#16a34a",
      secondary: "#ffffff",
      shorts: "#f8fafc",
      socks: "#16a34a",
      gkPrimary: "#f97316",
      gkSecondary: "#1c1917"
    },
    rating: { attack: 80, midfield: 81, defense: 79 },
    roster: buildSquad(
      "rca",
      [
        "A. Zniti",
        "Y. Belammari",
        "A. Khafifi",
        "B. Benoun",
        "M. Boulacsout",
        "M. Zrida",
        "S. Bougrine",
        "A. Ennafati",
        "Y. Bouzok",
        "N. Zerhouni",
        "H. Rahimi"
      ],
      "#a3e635",
      "#38bdf8",
      0.07
    )
  },
  {
    id: "esperance",
    name: "Esp\xE9rance de Tunis",
    shortName: "EST",
    city: "Tunis",
    region: "africa",
    kit: {
      primary: "#eab308",
      secondary: "#dc2626",
      shorts: "#111827",
      socks: "#eab308",
      gkPrimary: "#2563eb",
      gkSecondary: "#0f172a"
    },
    rating: { attack: 81, midfield: 80, defense: 80 },
    roster: buildSquad(
      "est",
      [
        "A. Memmiche",
        "M. Ben Hamida",
        "Y. Meriah",
        "M. Tougai",
        "R. Bouchniba",
        "R. Aholou",
        "H. Tka",
        "Y. Sasse",
        "Y. Belaili",
        "R. Rodrigues",
        "E. Mokwana"
      ],
      "#ef4444",
      "#fde047",
      0.08
    )
  },
  {
    id: "mazembe",
    name: "TP Mazembe",
    shortName: "TPM",
    city: "Lubumbashi",
    region: "africa",
    kit: {
      primary: "#18181b",
      secondary: "#f8fafc",
      shorts: "#18181b",
      socks: "#f8fafc",
      gkPrimary: "#f59e0b",
      gkSecondary: "#1e293b"
    },
    rating: { attack: 79, midfield: 79, defense: 80 },
    roster: buildSquad(
      "tpm",
      [
        "A. Faty",
        "E. Luzolo",
        "K. Mondeko",
        "J. Ntambwe",
        "I. Keita",
        "A. Oladapo",
        "G. Likonza",
        "B. Zemanga",
        "C. Fofana",
        "F. Traore",
        "P. Kinzumbi"
      ],
      "#facc15",
      "#22c55e",
      0.05
    )
  },
  {
    id: "sundowns",
    name: "Mamelodi Sundowns",
    shortName: "MSF",
    city: "Pretoria",
    region: "africa",
    kit: {
      primary: "#facc15",
      secondary: "#15803d",
      shorts: "#1d4ed8",
      socks: "#f8fafc",
      gkPrimary: "#7c3aed",
      gkSecondary: "#1e1b4b"
    },
    rating: { attack: 82, midfield: 82, defense: 80 },
    roster: buildSquad(
      "msf",
      [
        "R. Williams",
        "A. Modiba",
        "G. Kekana",
        "M. Mvala",
        "K. Mudau",
        "T. Mokoena",
        "M. Allende",
        "T. Zwane",
        "L. Ribeiro",
        "P. Shalulile",
        "I. Rayners"
      ],
      "#22c55e",
      "#38bdf8",
      0.09
    )
  },
  {
    id: "pyramids",
    name: "Pyramids FC",
    shortName: "PYR",
    city: "Cairo",
    region: "africa",
    kit: {
      primary: "#1e3a8a",
      secondary: "#38bdf8",
      shorts: "#1e3a8a",
      socks: "#38bdf8",
      gkPrimary: "#f97316",
      gkSecondary: "#111827"
    },
    rating: { attack: 81, midfield: 80, defense: 79 },
    roster: buildSquad(
      "pyr",
      [
        "A. El Shenawy",
        "M. Hamdy",
        "A. Samy",
        "A. Gabr",
        "M. Chibi",
        "B. Toure",
        "M. Lasheen",
        "W. El Karti",
        "I. Adel",
        "F. Mayele",
        "M. Fathi"
      ],
      "#38bdf8",
      "#facc15",
      0.07
    )
  },
  {
    id: "farrabat",
    name: "FAR Rabat",
    shortName: "FAR",
    city: "Rabat",
    region: "africa",
    kit: {
      primary: "#15803d",
      secondary: "#dc2626",
      shorts: "#111827",
      socks: "#15803d",
      gkPrimary: "#eab308",
      gkSecondary: "#0f172a"
    },
    rating: { attack: 79, midfield: 80, defense: 79 },
    roster: buildSquad(
      "far",
      [
        "A. El Khayati",
        "T. Carneiro",
        "H. Nakach",
        "E. Inonga",
        "M. Moufid",
        "M. Hrimat",
        "Z. Derrag",
        "A. Hammoudan",
        "A. Zouhzouh",
        "J. Beya",
        "K. Ait Ourkhane"
      ],
      "#ef4444",
      "#22c55e",
      0.05
    )
  },
  {
    id: "usmalger",
    name: "USM Alger",
    shortName: "USM",
    city: "Algiers",
    region: "africa",
    kit: {
      primary: "#b91c1c",
      secondary: "#0f172a",
      shorts: "#0f172a",
      socks: "#b91c1c",
      gkPrimary: "#10b981",
      gkSecondary: "#064e3b"
    },
    rating: { attack: 78, midfield: 79, defense: 80 },
    roster: buildSquad(
      "usm",
      [
        "O. Benbot",
        "S. Radouani",
        "Z. Belaid",
        "A. Alilet",
        "H. Dehiri",
        "O. Chita",
        "B. Benzaza",
        "I. Merili",
        "H. Ghacha",
        "I. Belkacemi",
        "A. Bousseliou"
      ],
      "#f97316",
      "#f8fafc",
      0.04
    )
  }
];
function getTeamById(id) {
  return TEAMS.find((t) => t.id === id) ?? TEAMS[0];
}

// src/multiplayer/roomManager.ts
var VALID_FORMATIONS = /* @__PURE__ */ new Set(["4-3-3", "4-4-2", "3-5-2", "4-2-3-1"]);
var VALID_HALF_DURATIONS = /* @__PURE__ */ new Set([60, 120, 180]);
var VALID_TEAM_IDS = new Set(TEAMS.map((t) => t.id));
var CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
var RECONNECT_GRACE_MS = 9e4;
function createNeutralInput() {
  return {
    moveX: 0,
    moveZ: 0,
    sprint: false,
    passPressed: false,
    lobPressed: false,
    shootPressed: false,
    shootHeld: false,
    shootReleased: false,
    tacklePressed: false,
    switchPressed: false
  };
}
function clampAxis(val) {
  if (typeof val !== "number" || !Number.isFinite(val)) return 0;
  return Math.max(-1, Math.min(1, val));
}
function sanitizeInput(raw) {
  const moveX = clampAxis(raw.moveX);
  const moveZ = clampAxis(raw.moveZ);
  const mag = Math.hypot(moveX, moveZ);
  const nx = mag > 1 ? moveX / mag : moveX;
  const nz = mag > 1 ? moveZ / mag : moveZ;
  return {
    moveX: nx,
    moveZ: nz,
    sprint: Boolean(raw.sprint),
    passPressed: Boolean(raw.passPressed),
    lobPressed: Boolean(raw.lobPressed),
    shootPressed: Boolean(raw.shootPressed),
    shootHeld: Boolean(raw.shootHeld),
    shootReleased: Boolean(raw.shootReleased),
    tacklePressed: Boolean(raw.tacklePressed),
    switchPressed: Boolean(raw.switchPressed)
  };
}
function sanitizeNickname(raw, uid) {
  const cleaned = (raw || "").trim().replace(/\s+/g, " ").slice(0, 24);
  return cleaned.length > 0 ? cleaned : `Joueur_${uid.slice(0, 4).toUpperCase()}`;
}
function sanitizeRoomCode(raw) {
  return (raw || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
}
function normalizeTeamId(teamId) {
  return VALID_TEAM_IDS.has(teamId) ? teamId : TEAMS[0].id;
}
function pickDistinctTeam(takenTeamId, preferredTeamId) {
  if (preferredTeamId && VALID_TEAM_IDS.has(preferredTeamId) && preferredTeamId !== takenTeamId) {
    return preferredTeamId;
  }
  return (TEAMS.find((t) => t.id !== takenTeamId) ?? TEAMS[0]).id;
}
function normalizeFormation(f) {
  return VALID_FORMATIONS.has(f) ? f : "4-3-3";
}
function normalizeHalfDuration(sec) {
  return sec && VALID_HALF_DURATIONS.has(sec) ? sec : 120;
}
var OnlineRoomManager = class {
  constructor() {
    this.clients = /* @__PURE__ */ new Map();
    this.authenticatedUids = /* @__PURE__ */ new Map();
    this.clientToRoom = /* @__PURE__ */ new Map();
    this.rooms = /* @__PURE__ */ new Map();
  }
  addClient(client) {
    this.clients.set(client.id, client);
    client.send({
      type: "connected",
      clientId: client.id,
      onlineCount: this.clients.size
    });
    this.broadcastPresence();
  }
  authenticateClient(clientId, verifiedUid) {
    if (!this.clients.has(clientId)) return false;
    const cleanUid = verifiedUid.trim();
    if (!cleanUid) return false;
    this.authenticatedUids.set(clientId, cleanUid);
    return true;
  }
  getAuthenticatedUid(clientId) {
    return this.authenticatedUids.get(clientId) ?? null;
  }
  getOnlineCount() {
    return this.clients.size;
  }
  getRoomSnapshot(roomCode) {
    const room = this.rooms.get(sanitizeRoomCode(roomCode));
    return room ? this.toRoomSnapshot(room) : null;
  }
  removeClient(clientId) {
    this.clients.delete(clientId);
    this.authenticatedUids.delete(clientId);
    const roomCode = this.clientToRoom.get(clientId);
    this.clientToRoom.delete(clientId);
    if (roomCode) {
      const room = this.rooms.get(roomCode);
      if (room) {
        const player = room.players.find((p) => p.clientId === clientId);
        if (player) {
          if (room.status === "playing") {
            player.connected = false;
            player.transport = null;
            player.disconnectedAt = Date.now();
            player.latestInput = createNeutralInput();
            room.pausedForDisconnect = true;
            for (const other of room.players) {
              if (other.uid !== player.uid && other.transport) {
                other.transport.send({
                  type: "opponent:disconnected",
                  message: `${player.nickname} a perdu la connexion. En attente de reconnexion...`
                });
              }
            }
            this.broadcastRoomState(room);
          } else {
            room.players = room.players.filter((p) => p.clientId !== clientId);
            if (room.players.length === 0) {
              this.rooms.delete(roomCode);
            } else {
              room.players[0].side = "home";
              this.broadcastRoomState(room);
            }
          }
        }
      }
    }
    this.broadcastPresence();
  }
  handleMessage(clientId, msg) {
    const client = this.clients.get(clientId);
    if (!client) return;
    if (msg.type === "ping") {
      client.send({ type: "pong", clientTime: msg.clientTime, serverTime: Date.now() });
      return;
    }
    if (msg.type === "auth") {
      return;
    }
    const verifiedUid = this.authenticatedUids.get(clientId);
    if (!verifiedUid) {
      client.send({
        type: "auth:error",
        message: "Authentification Firebase requise avant toute action multijoueur."
      });
      return;
    }
    if ("uid" in msg && typeof msg.uid === "string" && msg.uid.trim().length > 0 && msg.uid.trim() !== verifiedUid) {
      client.send({
        type: "auth:error",
        message: "Identit\xE9 Firebase incoh\xE9rente avec le jeton authentifi\xE9."
      });
      return;
    }
    switch (msg.type) {
      case "room:create":
        this.handleCreateRoom(client, verifiedUid, msg);
        return;
      case "room:join":
        this.handleJoinRoom(client, verifiedUid, msg);
        return;
      case "room:reconnect":
        this.handleReconnect(client, msg.roomCode, verifiedUid, msg.bootstrap);
        return;
      case "room:leave":
        this.leaveCurrentRoom(clientId);
        return;
      case "room:updateProfile":
        this.handleUpdateProfile(clientId, msg);
        return;
      case "room:start":
        this.handleStartMatch(client, verifiedUid, msg);
        return;
      case "match:input":
        this.handleMatchInput(clientId, msg.input);
        return;
      case "match:rematch":
        this.handleRematch(clientId);
        return;
    }
  }
  /**
   * Advances all active authoritative matches by dt seconds (called at 30 Hz on server).
   */
  stepAllMatches(dt, now = Date.now()) {
    for (const [roomCode, room] of this.rooms.entries()) {
      if (room.status === "playing" && room.pausedForDisconnect) {
        const allDisconnectedLong = room.players.every(
          (p) => !p.connected && p.disconnectedAt !== null && now - p.disconnectedAt > RECONNECT_GRACE_MS
        );
        if (allDisconnectedLong) {
          this.rooms.delete(roomCode);
          continue;
        }
        continue;
      }
      if (room.status !== "playing" || !room.engine) continue;
      const homePlayer = room.players.find((p) => p.side === "home");
      const awayPlayer = room.players.find((p) => p.side === "away");
      if (!homePlayer || !awayPlayer) continue;
      const homeInput = { ...homePlayer.latestInput };
      const awayInput = { ...awayPlayer.latestInput };
      homePlayer.latestInput.passPressed = false;
      homePlayer.latestInput.lobPressed = false;
      homePlayer.latestInput.shootPressed = false;
      homePlayer.latestInput.shootReleased = false;
      homePlayer.latestInput.tacklePressed = false;
      homePlayer.latestInput.switchPressed = false;
      awayPlayer.latestInput.passPressed = false;
      awayPlayer.latestInput.lobPressed = false;
      awayPlayer.latestInput.shootPressed = false;
      awayPlayer.latestInput.shootReleased = false;
      awayPlayer.latestInput.tacklePressed = false;
      awayPlayer.latestInput.switchPressed = false;
      const prevPhase = room.engine.phase;
      room.engine.step(dt, homeInput, awayInput);
      room.tick += 1;
      room.broadcastCounter += 1;
      const phaseChanged = room.engine.phase !== prevPhase;
      const hasEvents = room.pendingEvents.length > 0;
      if (phaseChanged || hasEvents || room.broadcastCounter >= 2) {
        room.broadcastCounter = 0;
        const events = room.pendingEvents.splice(0, room.pendingEvents.length);
        const snapshot = room.engine.getOnlineSnapshot(room.tick, events);
        for (const p of room.players) {
          p.transport?.send({ type: "match:state", snapshot });
        }
      }
    }
  }
  generateUniqueCode() {
    for (let attempt = 0; attempt < 25; attempt++) {
      let code = "";
      for (let i = 0; i < 5; i++) {
        code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
    return `F${String(Date.now()).slice(-4)}`;
  }
  leaveCurrentRoom(clientId) {
    const existingCode = this.clientToRoom.get(clientId);
    if (!existingCode) return;
    this.clientToRoom.delete(clientId);
    const room = this.rooms.get(existingCode);
    if (!room) return;
    const leaving = room.players.find((p) => p.clientId === clientId);
    const wasPlaying = room.status === "playing";
    const finalStats = room.engine ? { ...room.engine.stats } : null;
    const roomBeforeLeave = wasPlaying ? this.toRoomSnapshot(room) : null;
    room.players = room.players.filter((p) => p.clientId !== clientId);
    if (room.players.length === 0) {
      room.engine = null;
      this.rooms.delete(existingCode);
      return;
    }
    if (wasPlaying) {
      room.status = "finished";
      room.engine = null;
      room.pausedForDisconnect = false;
      const stoppedRoom = {
        ...roomBeforeLeave ?? this.toRoomSnapshot(room),
        status: "finished"
      };
      const fallbackStats = finalStats ?? {
        homeScore: 0,
        awayScore: 0,
        homeShots: 0,
        awayShots: 0,
        homePasses: 0,
        awayPasses: 0,
        homeSaves: 0,
        awaySaves: 0,
        homeCorners: 0,
        awayCorners: 0,
        homeFouls: 0,
        awayFouls: 0,
        homePossessionSeconds: 0,
        awayPossessionSeconds: 0,
        lastScorerName: null,
        lastScorerTeam: null,
        lastGoalMinute: null
      };
      const leavingName = leaving?.nickname ?? "Votre adversaire";
      for (const other of room.players) {
        other.ready = false;
        other.transport?.send({
          type: "match:finished",
          stats: fallbackStats,
          room: stoppedRoom,
          abortedByNickname: leavingName
        });
      }
      this.broadcastRoomState(room);
      return;
    }
    room.players[0].side = "home";
    this.broadcastRoomState(room);
  }
  handleCreateRoom(client, verifiedUid, msg) {
    this.leaveCurrentRoom(client.id);
    const requestedCode = sanitizeRoomCode(msg.roomCode);
    const code = requestedCode.length === 5 && !this.rooms.has(requestedCode) ? requestedCode : this.generateUniqueCode();
    const host = {
      clientId: client.id,
      uid: verifiedUid,
      nickname: sanitizeNickname(msg.nickname, verifiedUid),
      side: "home",
      teamId: normalizeTeamId(msg.teamId),
      formation: normalizeFormation(msg.formation),
      ready: false,
      connected: true,
      transport: client,
      latestInput: createNeutralInput(),
      disconnectedAt: null
    };
    const room = {
      roomCode: code,
      status: "waiting",
      halfDurationSeconds: normalizeHalfDuration(msg.halfDurationSeconds),
      matchNumber: 0,
      players: [host],
      engine: null,
      pendingEvents: [],
      tick: 0,
      broadcastCounter: 0,
      pausedForDisconnect: false
    };
    this.rooms.set(code, room);
    this.clientToRoom.set(client.id, code);
    this.broadcastRoomState(room);
  }
  hydrateRoomFromBootstrap(code, bootstrap, client, verifiedUid) {
    const hostUid = (bootstrap.hostUid || "").trim();
    const guestUid = (bootstrap.guestUid || "").trim();
    if (!hostUid) return null;
    const isHost = verifiedUid === hostUid;
    const isGuest = guestUid.length > 0 && verifiedUid === guestUid;
    if (!isHost && !isGuest) {
      return null;
    }
    this.leaveCurrentRoom(client.id);
    const hostTeamId = normalizeTeamId(bootstrap.hostTeamId);
    const host = {
      clientId: isHost ? client.id : `pending_host_${code}`,
      uid: hostUid,
      nickname: sanitizeNickname(bootstrap.hostName, hostUid),
      side: "home",
      teamId: hostTeamId,
      formation: normalizeFormation(bootstrap.hostFormation),
      ready: Boolean(bootstrap.hostReady),
      connected: isHost,
      transport: isHost ? client : null,
      latestInput: createNeutralInput(),
      disconnectedAt: isHost ? null : Date.now()
    };
    const players = [host];
    if (guestUid && guestUid !== hostUid) {
      players.push({
        clientId: isGuest ? client.id : `pending_guest_${code}`,
        uid: guestUid,
        nickname: sanitizeNickname(bootstrap.guestName || "", guestUid),
        side: "away",
        teamId: pickDistinctTeam(hostTeamId, bootstrap.guestTeamId),
        formation: normalizeFormation(bootstrap.guestFormation ?? "4-3-3"),
        ready: Boolean(bootstrap.guestReady),
        connected: isGuest,
        transport: isGuest ? client : null,
        latestInput: createNeutralInput(),
        disconnectedAt: isGuest ? null : Date.now()
      });
    }
    const room = {
      roomCode: code,
      status: "waiting",
      halfDurationSeconds: normalizeHalfDuration(bootstrap.halfDurationSeconds),
      matchNumber: 0,
      players,
      engine: null,
      pendingEvents: [],
      tick: 0,
      broadcastCounter: 0,
      pausedForDisconnect: false
    };
    this.rooms.set(code, room);
    this.clientToRoom.set(client.id, code);
    this.broadcastRoomState(room);
    return room;
  }
  handleJoinRoom(client, verifiedUid, msg) {
    const code = sanitizeRoomCode(msg.roomCode);
    if (code.length !== 5) {
      client.send({
        type: "room:error",
        message: "Le code de partie doit contenir 5 caract\xE8res (ex: A7K92)."
      });
      return;
    }
    const room = this.rooms.get(code);
    if (!room) {
      if (msg.bootstrap) {
        const hydrated = this.hydrateRoomFromBootstrap(code, msg.bootstrap, client, verifiedUid);
        if (hydrated) {
          return;
        }
      }
      client.send({
        type: "room:error",
        message: `Aucune partie active trouv\xE9e pour le code ${code}.`
      });
      return;
    }
    const existingByUid = room.players.find((p) => p.uid === verifiedUid);
    if (existingByUid) {
      this.handleReconnect(client, code, verifiedUid, msg.bootstrap);
      return;
    }
    if (room.status !== "waiting") {
      client.send({
        type: "room:error",
        message: "Ce match a d\xE9j\xE0 commenc\xE9."
      });
      return;
    }
    if (room.players.length >= 2) {
      client.send({
        type: "room:error",
        message: "Cette partie est d\xE9j\xE0 compl\xE8te (2/2 joueurs)."
      });
      return;
    }
    this.leaveCurrentRoom(client.id);
    const host = room.players[0];
    const assignedTeam = pickDistinctTeam(host.teamId, msg.teamId);
    const guest = {
      clientId: client.id,
      uid: verifiedUid,
      nickname: sanitizeNickname(msg.nickname, verifiedUid),
      side: "away",
      teamId: assignedTeam,
      formation: normalizeFormation(msg.formation),
      ready: false,
      connected: true,
      transport: client,
      latestInput: createNeutralInput(),
      disconnectedAt: null
    };
    room.players.push(guest);
    this.clientToRoom.set(client.id, code);
    this.broadcastRoomState(room);
  }
  handleReconnect(client, rawCode, verifiedUid, bootstrap) {
    const code = sanitizeRoomCode(rawCode);
    const room = this.rooms.get(code);
    if (!room) {
      if (code.length === 5 && bootstrap) {
        const hydrated = this.hydrateRoomFromBootstrap(code, bootstrap, client, verifiedUid);
        if (hydrated) {
          return;
        }
      }
      client.send({ type: "room:error", message: `Partie ${code} introuvable.` });
      return;
    }
    let slot = room.players.find((p) => p.uid === verifiedUid);
    if (!slot && room.status === "waiting" && bootstrap && room.players.length < 2) {
      const isBootstrapGuest = Boolean(bootstrap.guestUid) && bootstrap.guestUid === verifiedUid;
      const isBootstrapHost = bootstrap.hostUid === verifiedUid;
      if (isBootstrapGuest || isBootstrapHost) {
        this.leaveCurrentRoom(client.id);
        const existingPlayer = room.players[0];
        const attachedTeam = pickDistinctTeam(
          existingPlayer.teamId,
          isBootstrapGuest ? bootstrap.guestTeamId : bootstrap.hostTeamId
        );
        slot = {
          clientId: client.id,
          uid: verifiedUid,
          nickname: sanitizeNickname(
            isBootstrapGuest ? bootstrap.guestName || "" : bootstrap.hostName,
            verifiedUid
          ),
          side: existingPlayer.side === "home" ? "away" : "home",
          teamId: attachedTeam,
          formation: normalizeFormation(
            isBootstrapGuest ? bootstrap.guestFormation ?? "4-3-3" : bootstrap.hostFormation
          ),
          ready: Boolean(isBootstrapGuest ? bootstrap.guestReady : bootstrap.hostReady),
          connected: true,
          transport: client,
          latestInput: createNeutralInput(),
          disconnectedAt: null
        };
        room.players.push(slot);
        this.clientToRoom.set(client.id, code);
        this.broadcastRoomState(room);
        return;
      }
    }
    if (!slot) {
      client.send({ type: "room:error", message: "Vous ne faites pas partie de cette salle." });
      return;
    }
    this.clientToRoom.delete(slot.clientId);
    slot.clientId = client.id;
    slot.transport = client;
    slot.connected = true;
    slot.disconnectedAt = null;
    this.clientToRoom.set(client.id, code);
    if (room.status === "playing") {
      room.pausedForDisconnect = room.players.some((p) => !p.connected);
      client.send({
        type: "match:start",
        room: this.toRoomSnapshot(room),
        yourSide: slot.side
      });
      if (room.engine) {
        client.send({
          type: "match:state",
          snapshot: room.engine.getOnlineSnapshot(room.tick, [])
        });
      }
      for (const other of room.players) {
        if (other.uid !== slot.uid && other.transport) {
          other.transport.send({
            type: "opponent:reconnected",
            message: `${slot.nickname} est reconnect\xE9. Le match reprend !`
          });
        }
      }
    }
    this.broadcastRoomState(room);
  }
  handleUpdateProfile(clientId, msg) {
    const code = this.clientToRoom.get(clientId);
    if (!code) return;
    const room = this.rooms.get(code);
    if (!room || room.status !== "waiting") return;
    const player = room.players.find((p) => p.clientId === clientId);
    if (!player) return;
    if (typeof msg.nickname === "string") {
      player.nickname = sanitizeNickname(msg.nickname, player.uid);
    }
    if (typeof msg.teamId === "string" && VALID_TEAM_IDS.has(msg.teamId)) {
      const other = room.players.find((p) => p.clientId !== clientId);
      if (!other || other.teamId !== msg.teamId) {
        player.teamId = msg.teamId;
      }
    }
    if (msg.formation && VALID_FORMATIONS.has(msg.formation)) {
      player.formation = msg.formation;
    }
    if (typeof msg.ready === "boolean") {
      player.ready = msg.ready;
    }
    this.broadcastRoomState(room);
  }
  handleStartMatch(client, verifiedUid, msg) {
    let code = this.clientToRoom.get(client.id);
    if (!code && msg.roomCode) {
      this.handleReconnect(client, msg.roomCode, verifiedUid, msg.bootstrap);
      code = this.clientToRoom.get(client.id);
    }
    if (!code) {
      client.send({
        type: "room:error",
        message: "Salle non synchronis\xE9e avec le serveur temps r\xE9el."
      });
      return;
    }
    const room = this.rooms.get(code);
    if (!room) {
      client.send({
        type: "room:error",
        message: `Partie ${code} introuvable sur le serveur.`
      });
      return;
    }
    if (room.status !== "waiting") {
      return;
    }
    if (room.players.length < 2) {
      client.send({
        type: "room:error",
        message: "En attente du deuxi\xE8me joueur avant le coup d\u2019envoi."
      });
      return;
    }
    if (room.players.some((p) => !p.connected)) {
      client.send({
        type: "room:error",
        message: "En attente de la connexion temps r\xE9el du deuxi\xE8me joueur..."
      });
      return;
    }
    this.startRoomEngine(room);
  }
  handleRematch(clientId) {
    const code = this.clientToRoom.get(clientId);
    if (!code) return;
    const room = this.rooms.get(code);
    if (!room || room.players.length < 2) return;
    if (room.status !== "finished") return;
    if (room.players.some((p) => !p.connected)) {
      this.clients.get(clientId)?.send({
        type: "room:error",
        message: "Les deux joueurs doivent \xEAtre connect\xE9s pour lancer la revanche."
      });
      return;
    }
    this.startRoomEngine(room);
  }
  startRoomEngine(room) {
    const home = room.players.find((p) => p.side === "home");
    const away = room.players.find((p) => p.side === "away");
    if (!home || !away) return;
    if (away.teamId === home.teamId) {
      away.teamId = pickDistinctTeam(home.teamId);
    }
    home.latestInput = createNeutralInput();
    away.latestInput = createNeutralInput();
    room.pendingEvents = [];
    room.tick = 0;
    room.broadcastCounter = 0;
    room.pausedForDisconnect = false;
    room.matchNumber += 1;
    room.status = "playing";
    const homeTeam = getTeamById(home.teamId);
    const awayTeam = getTeamById(away.teamId);
    const engine = new MatchEngine(
      homeTeam,
      awayTeam,
      home.formation,
      away.formation,
      room.halfDurationSeconds,
      "tv",
      {
        onHudUpdate: () => {
        },
        onCameraTrauma: () => {
        },
        onSoundEvent: (ev) => {
          room.pendingEvents.push(ev);
        },
        onMatchFinished: (finalStats) => {
          room.status = "finished";
          const roomSnap2 = this.toRoomSnapshot(room);
          for (const p of room.players) {
            p.transport?.send({
              type: "match:finished",
              stats: { ...finalStats },
              room: roomSnap2
            });
          }
        }
      },
      "balanced",
      "balanced"
    );
    engine.startNewMatch(
      homeTeam,
      awayTeam,
      home.formation,
      away.formation,
      room.halfDurationSeconds,
      "balanced",
      "balanced",
      {
        awayHumanControl: true,
        localSide: "home",
        isOnlineClient: false
      }
    );
    room.engine = engine;
    const roomSnap = this.toRoomSnapshot(room);
    const initialSnapshot = engine.getOnlineSnapshot(0, room.pendingEvents.splice(0));
    for (const p of room.players) {
      p.transport?.send({
        type: "match:start",
        room: roomSnap,
        yourSide: p.side
      });
      p.transport?.send({
        type: "match:state",
        snapshot: initialSnapshot
      });
    }
  }
  handleMatchInput(clientId, rawInput) {
    const code = this.clientToRoom.get(clientId);
    if (!code) return;
    const room = this.rooms.get(code);
    if (!room || room.status !== "playing") return;
    const player = room.players.find((p) => p.clientId === clientId);
    if (!player) return;
    const clean = sanitizeInput(rawInput);
    player.latestInput = {
      moveX: clean.moveX,
      moveZ: clean.moveZ,
      sprint: clean.sprint,
      shootHeld: clean.shootHeld,
      passPressed: player.latestInput.passPressed || clean.passPressed,
      lobPressed: player.latestInput.lobPressed || clean.lobPressed,
      shootPressed: player.latestInput.shootPressed || clean.shootPressed,
      shootReleased: player.latestInput.shootReleased || clean.shootReleased,
      tacklePressed: player.latestInput.tacklePressed || clean.tacklePressed,
      switchPressed: player.latestInput.switchPressed || clean.switchPressed
    };
  }
  toRoomSnapshot(room) {
    return {
      roomCode: room.roomCode,
      status: room.status,
      halfDurationSeconds: room.halfDurationSeconds,
      matchNumber: room.matchNumber,
      players: room.players.map((p) => ({
        clientId: p.clientId,
        uid: p.uid,
        nickname: p.nickname,
        side: p.side,
        teamId: p.teamId,
        formation: p.formation,
        ready: p.ready,
        connected: p.connected
      }))
    };
  }
  broadcastRoomState(room) {
    const snap = this.toRoomSnapshot(room);
    for (const p of room.players) {
      p.transport?.send({
        type: "room:state",
        room: snap,
        yourSide: p.side
      });
    }
  }
  broadcastPresence() {
    const onlineCount = this.clients.size;
    for (const c of this.clients.values()) {
      c.send({ type: "presence", onlineCount });
    }
  }
};

// server.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
function loadFirebaseProjectId() {
  const configPath = path.resolve(__dirname, "firebase-applet-config.json");
  const raw = fs.readFileSync(configPath, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed.projectId) {
    throw new Error("Missing projectId in firebase-applet-config.json");
  }
  return parsed.projectId;
}
function initFirebaseTokenVerifier() {
  const projectId = loadFirebaseProjectId();
  const adminApp = getApps().length ? getApp() : initializeApp({ projectId });
  const adminAuth = getAuth(adminApp);
  return async (idToken) => {
    const decoded = await adminAuth.verifyIdToken(idToken);
    return {
      uid: decoded.uid,
      emailVerified: decoded.email_verified === true
    };
  };
}
async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = Number(process.env.PORT || 3e3);
  const verifyFirebaseIdToken = initFirebaseTokenVerifier();
  const roomManager = new OnlineRoomManager();
  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      onlinePlayers: roomManager.getOnlineCount(),
      timestamp: Date.now()
    });
  });
  app.head("/api/health", (_req, res) => {
    res.status(200).end();
  });
  const wss = new WebSocketServer({ server, path: "/ws" });
  let nextClientSeq = 1;
  wss.on("connection", (ws) => {
    const clientId = `c_${Date.now().toString(36)}_${nextClientSeq++}`;
    const sendSafe = (payload) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
      }
    };
    roomManager.addClient({
      id: clientId,
      send: sendSafe
    });
    ws.on("message", async (raw) => {
      try {
        const text = typeof raw === "string" ? raw : raw.toString("utf8");
        const msg = JSON.parse(text);
        if (!msg || typeof msg.type !== "string") return;
        if (msg.type === "auth") {
          if (typeof msg.idToken !== "string" || msg.idToken.trim().length < 20) {
            sendSafe({
              type: "auth:error",
              message: "Jeton Firebase manquant ou invalide."
            });
            return;
          }
          try {
            const verified = await verifyFirebaseIdToken(msg.idToken.trim());
            if (ws.readyState !== WebSocket.OPEN) return;
            if (!verified.uid || !verified.emailVerified) {
              sendSafe({
                type: "auth:error",
                message: "Compte Google v\xE9rifi\xE9 requis pour le mode multijoueur en ligne."
              });
              return;
            }
            if (roomManager.authenticateClient(clientId, verified.uid)) {
              sendSafe({ type: "auth:ok", uid: verified.uid });
            }
          } catch {
            sendSafe({
              type: "auth:error",
              message: "Jeton Firebase invalide ou expir\xE9. Reconnectez-vous."
            });
          }
          return;
        }
        roomManager.handleMessage(clientId, msg);
      } catch {
      }
    });
    ws.on("close", () => {
      roomManager.removeClient(clientId);
    });
    ws.on("error", () => {
      roomManager.removeClient(clientId);
    });
  });
  const TICK_DT = 1 / 30;
  setInterval(() => {
    roomManager.stepAllMatches(TICK_DT, Date.now());
  }, Math.round(TICK_DT * 1e3));
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, "dist");
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`FiFA 2026 server running on http://0.0.0.0:${PORT}`);
  });
}
void startServer();
export {
  startServer
};
