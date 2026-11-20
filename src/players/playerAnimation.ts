import { PlayerState } from '../core/types';

export type PlayerAnimClip =
  | 'idle'
  | 'walk'
  | 'run'
  | 'sprint'
  | 'turn'
  | 'stop'
  | 'kick'
  | 'pass'
  | 'shoot'
  | 'tackle'
  | 'dive'
  | 'celebration';

export interface ArticulatedPose {
  pelvisY: number;
  pelvisPitch: number;
  pelvisRoll: number;
  torsoPitch: number;
  torsoYaw: number;
  headYaw: number;
  headPitch: number;
  leftShoulderPitch: number;
  leftShoulderRoll: number;
  leftElbowFlex: number;
  rightShoulderPitch: number;
  rightShoulderRoll: number;
  rightElbowFlex: number;
  leftHipPitch: number;
  leftHipRoll: number;
  leftKneeFlex: number;
  leftAnklePitch: number;
  rightHipPitch: number;
  rightHipRoll: number;
  rightKneeFlex: number;
  rightAnklePitch: number;
}

export interface PlayerAnimMemory {
  prevSpeed: number;
  prevFacingAngle: number;
  hasPrev: boolean;
  stopTimer: number;
  turnIntensity: number;
  turnSign: number;
  kickVariant: 'kick' | 'pass' | 'shoot';
  wasKicking: boolean;
  lastShotCharge: number;
  stridePhase: number;
}

export interface PlayerAnimSignals {
  speed: number;
  facingAngle: number;
  actionState: PlayerState['actionState'];
  actionTimer: number;
  hasBall: boolean;
  diveDir: -1 | 0 | 1;
  team: PlayerState['team'];
  slotIndex: number;
  animPhase: number;
  shotCharge: number;
  ballSpeed: number;
  dt: number;
  elapsed: number;
}

export function createDefaultPose(): ArticulatedPose {
  return {
    pelvisY: 0,
    pelvisPitch: 0,
    pelvisRoll: 0,
    torsoPitch: 0,
    torsoYaw: 0,
    headYaw: 0,
    headPitch: 0,
    leftShoulderPitch: 0,
    leftShoulderRoll: 0.08,
    leftElbowFlex: -0.18,
    rightShoulderPitch: 0,
    rightShoulderRoll: -0.08,
    rightElbowFlex: -0.18,
    leftHipPitch: 0,
    leftHipRoll: 0,
    leftKneeFlex: 0.06,
    leftAnklePitch: 0,
    rightHipPitch: 0,
    rightHipRoll: 0,
    rightKneeFlex: 0.06,
    rightAnklePitch: 0,
  };
}

export function createAnimMemory(): PlayerAnimMemory {
  return {
    prevSpeed: 0,
    prevFacingAngle: 0,
    hasPrev: false,
    stopTimer: 0,
    turnIntensity: 0,
    turnSign: 0,
    kickVariant: 'kick',
    wasKicking: false,
    lastShotCharge: 0,
    stridePhase: 0,
  };
}

export function shortestAngleDelta(from: number, to: number): number {
  let diff = (to - from) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function dampValue(current: number, target: number, lambda: number, dt: number): number {
  if (dt <= 0) return target;
  const factor = 1 - Math.exp(-lambda * dt);
  return current + (target - current) * factor;
}

/**
 * Classifies the active animation clip strictly from existing gameplay/network state.
 * Mutates `memory` in place (zero allocations per frame).
 */
export function resolvePlayerAnimClip(
  signals: PlayerAnimSignals,
  memory: PlayerAnimMemory,
): PlayerAnimClip {
  const dt = Math.max(0.001, Math.min(signals.dt, 0.1));

  // Track peak shot charge just prior to kick release so SHOOT vs PASS reads authentically
  if (signals.shotCharge > 0.04) {
    memory.lastShotCharge = signals.shotCharge;
  } else if (signals.actionState !== 'kick') {
    memory.lastShotCharge = Math.max(0, memory.lastShotCharge - dt * 2.5);
  }

  let angularVel = 0;
  let decel = 0;
  if (memory.hasPrev) {
    const dAngle = shortestAngleDelta(memory.prevFacingAngle, signals.facingAngle);
    angularVel = dAngle / dt;
    decel = (memory.prevSpeed - signals.speed) / dt;
  }

  // Smooth turn intensity for natural body banking
  const absAngVel = Math.abs(angularVel);
  const targetTurn = absAngVel > 1.8 && signals.speed > 0.8 ? clamp((absAngVel - 1.8) / 5.5, 0, 1) : 0;
  memory.turnIntensity = dampValue(memory.turnIntensity, targetTurn, 10, dt);
  if (absAngVel > 1.2) {
    memory.turnSign = angularVel >= 0 ? 1 : -1;
  }

  // Detect abrupt braking / stopping from running speed
  if (memory.hasPrev && memory.prevSpeed > 3.2 && signals.speed < 2.2 && decel > 4.5) {
    memory.stopTimer = 0.24;
  } else if (memory.stopTimer > 0) {
    memory.stopTimer = Math.max(0, memory.stopTimer - dt);
  }

  // Advance smooth local stride phase when moving (works consistently for both local & online players)
  if (signals.speed > 0.25) {
    const freq = signals.speed > 6.2 ? 2.15 : signals.speed > 2.5 ? 1.85 : 1.55;
    memory.stridePhase += signals.speed * freq * dt;
  }

  memory.prevSpeed = signals.speed;
  memory.prevFacingAngle = signals.facingAngle;
  memory.hasPrev = true;

  // 1. High-priority action states directly from MatchEngine / network snapshot
  if (signals.actionState === 'celebrate') {
    memory.wasKicking = false;
    return 'celebration';
  }
  if (signals.actionState === 'dive') {
    memory.wasKicking = false;
    return 'dive';
  }
  if (signals.actionState === 'tackle') {
    memory.wasKicking = false;
    return 'tackle';
  }
  if (signals.actionState === 'kick') {
    if (!memory.wasKicking) {
      if (memory.lastShotCharge > 0.22 || signals.ballSpeed > 19.0) {
        memory.kickVariant = 'shoot';
      } else if (signals.ballSpeed > 7.0 && signals.ballSpeed <= 19.0) {
        memory.kickVariant = 'pass';
      } else {
        memory.kickVariant = 'kick';
      }
      memory.wasKicking = true;
    }
    return memory.kickVariant;
  }
  memory.wasKicking = false;

  // 2. Locomotion & transitional states driven by velocity & rotation
  if (signals.speed < 0.32) {
    return memory.stopTimer > 0.02 ? 'stop' : 'idle';
  }
  if (memory.stopTimer > 0.05 && signals.speed < 1.8) {
    return 'stop';
  }
  if (memory.turnIntensity > 0.55 && signals.speed >= 1.2 && signals.speed < 6.4) {
    return 'turn';
  }
  if (signals.actionState === 'sprint' || signals.speed >= 6.4) {
    return 'sprint';
  }
  if (signals.speed >= 2.5) {
    return 'run';
  }
  return 'walk';
}

/**
 * Computes the target articulated bone pose for the resolved animation clip.
 * Writes directly into `out` to avoid any per-frame heap allocations.
 */
export function evaluateTargetPose(
  clip: PlayerAnimClip,
  signals: PlayerAnimSignals,
  memory: PlayerAnimMemory,
  out: ArticulatedPose,
): void {
  const phase = signals.animPhase !== 0 ? signals.animPhase : memory.stridePhase;
  const bankRoll = clamp(memory.turnSign * memory.turnIntensity * 0.22, -0.24, 0.24);
  const bankYaw = clamp(memory.turnSign * memory.turnIntensity * 0.26, -0.28, 0.28);

  // Reset baseline neutral athletic posture
  out.pelvisY = 0;
  out.pelvisPitch = 0;
  out.pelvisRoll = 0;
  out.torsoPitch = 0.03;
  out.torsoYaw = 0;
  out.headYaw = 0;
  out.headPitch = 0;
  out.leftShoulderPitch = 0.06;
  out.leftShoulderRoll = 0.1;
  out.leftElbowFlex = -0.22;
  out.rightShoulderPitch = 0.06;
  out.rightShoulderRoll = -0.1;
  out.rightElbowFlex = -0.22;
  out.leftHipPitch = 0;
  out.leftHipRoll = 0.03;
  out.leftKneeFlex = 0.08;
  out.leftAnklePitch = 0;
  out.rightHipPitch = 0;
  out.rightHipRoll = -0.03;
  out.rightKneeFlex = 0.08;
  out.rightAnklePitch = 0;

  switch (clip) {
    case 'idle': {
      const breath = Math.sin(signals.elapsed * 2.3 + signals.slotIndex * 1.1);
      const sway = Math.sin(signals.elapsed * 1.15 + signals.slotIndex * 0.7);
      // Athletic ready stance (slight knee flex, staggered feet, relaxed bent elbows)
      out.pelvisY = breath * 0.009 - 0.026;
      out.pelvisPitch = 0.06;
      out.pelvisRoll = sway * 0.025;
      out.torsoPitch = 0.07 + breath * 0.018;
      out.torsoYaw = sway * 0.055;
      out.headYaw = Math.sin(signals.elapsed * 0.9 + signals.slotIndex * 1.7) * 0.14;
      out.headPitch = -0.05;
      out.leftShoulderPitch = 0.12 - breath * 0.035;
      out.rightShoulderPitch = 0.05 + breath * 0.035;
      out.leftShoulderRoll = 0.18;
      out.rightShoulderRoll = -0.18;
      out.leftElbowFlex = -0.44;
      out.rightElbowFlex = -0.4;
      out.leftHipPitch = -0.13;
      out.rightHipPitch = 0.08;
      out.leftHipRoll = 0.06;
      out.rightHipRoll = -0.06;
      out.leftKneeFlex = 0.22;
      out.rightKneeFlex = 0.18;
      out.leftAnklePitch = -0.08;
      out.rightAnklePitch = -0.06;
      break;
    }

    case 'walk': {
      const s = Math.sin(phase);
      const c = Math.cos(phase);
      const amp = clamp(0.24 + signals.speed * 0.11, 0.24, 0.48);
      out.pelvisY = Math.abs(c) * 0.022 - 0.01;
      out.pelvisPitch = 0.05;
      out.pelvisRoll = bankRoll * 0.6;
      out.torsoPitch = 0.05;
      out.torsoYaw = -s * 0.08 + bankYaw * 0.5;
      out.headYaw = bankYaw * 0.4;

      out.leftHipPitch = s * amp;
      out.rightHipPitch = -s * amp;
      // Knee flexes naturally during leg recovery (swing forward)
      out.leftKneeFlex = 0.12 + Math.max(0, -c) * 0.48;
      out.rightKneeFlex = 0.12 + Math.max(0, c) * 0.48;
      out.leftAnklePitch = -out.leftKneeFlex * 0.28;
      out.rightAnklePitch = -out.rightKneeFlex * 0.28;

      out.leftShoulderPitch = -s * amp * 0.72;
      out.rightShoulderPitch = s * amp * 0.72;
      out.leftShoulderRoll = 0.12;
      out.rightShoulderRoll = -0.12;
      out.leftElbowFlex = -0.35 - Math.max(0, -s) * 0.22;
      out.rightElbowFlex = -0.35 - Math.max(0, s) * 0.22;
      break;
    }

    case 'run':
    case 'turn': {
      const s = Math.sin(phase);
      const c = Math.cos(phase);
      const dribbleCrouch = signals.hasBall ? 0.06 : 0;
      const amp = clamp(0.45 + signals.speed * 0.065, 0.52, 0.86);
      const turnBoost = clip === 'turn' ? 1.25 : 1.0;

      out.pelvisY = Math.abs(c) * 0.048 - 0.02 - dribbleCrouch * 0.25;
      out.pelvisPitch = clamp(0.11 + signals.speed * 0.014, 0.11, 0.22) + dribbleCrouch;
      out.pelvisRoll = bankRoll * turnBoost;
      out.torsoPitch = 0.06 + dribbleCrouch;
      out.torsoYaw = -s * 0.16 + bankYaw * turnBoost;
      out.headYaw = bankYaw * 0.65;
      out.headPitch = -out.pelvisPitch * 0.45;

      out.leftHipPitch = s * amp - 0.08;
      out.rightHipPitch = -s * amp - 0.08;
      out.leftKneeFlex = 0.18 + Math.max(0, -c) * 0.92 + Math.max(0, s) * 0.2;
      out.rightKneeFlex = 0.18 + Math.max(0, c) * 0.92 + Math.max(0, -s) * 0.2;
      out.leftAnklePitch = -out.leftKneeFlex * 0.25;
      out.rightAnklePitch = -out.rightKneeFlex * 0.25;

      out.leftShoulderPitch = -s * amp * 0.85;
      out.rightShoulderPitch = s * amp * 0.85;
      out.leftShoulderRoll = 0.18 + (clip === 'turn' ? 0.14 : 0);
      out.rightShoulderRoll = -0.18 - (clip === 'turn' ? 0.14 : 0);
      out.leftElbowFlex = -0.82 - Math.max(0, -s) * 0.35;
      out.rightElbowFlex = -0.82 - Math.max(0, s) * 0.35;
      break;
    }

    case 'sprint': {
      const s = Math.sin(phase);
      const c = Math.cos(phase);
      const amp = 1.02;
      out.pelvisY = Math.abs(c) * 0.068 - 0.028;
      out.pelvisPitch = 0.24;
      out.pelvisRoll = bankRoll * 1.1;
      out.torsoPitch = 0.1;
      out.torsoYaw = -s * 0.22 + bankYaw * 0.8;
      out.headYaw = bankYaw * 0.5;
      out.headPitch = -0.16;

      out.leftHipPitch = s * amp - 0.14;
      out.rightHipPitch = -s * amp - 0.14;
      out.leftKneeFlex = 0.22 + Math.max(0, -c) * 1.22 + Math.max(0, s) * 0.22;
      out.rightKneeFlex = 0.22 + Math.max(0, c) * 1.22 + Math.max(0, -s) * 0.22;
      out.leftAnklePitch = -0.22;
      out.rightAnklePitch = -0.22;

      out.leftShoulderPitch = -s * 1.05;
      out.rightShoulderPitch = s * 1.05;
      out.leftShoulderRoll = 0.22;
      out.rightShoulderRoll = -0.22;
      out.leftElbowFlex = -1.25 - Math.max(0, -s) * 0.28;
      out.rightElbowFlex = -1.25 - Math.max(0, s) * 0.28;
      break;
    }

    case 'stop': {
      // Planted athletic braking posture (low center of gravity, knees bent, arms wide for balance)
      out.pelvisY = -0.075;
      out.pelvisPitch = -0.08;
      out.pelvisRoll = bankRoll * 0.8;
      out.torsoPitch = 0.12;
      out.torsoYaw = 0.12;
      out.leftHipPitch = -0.38;
      out.rightHipPitch = 0.24;
      out.leftKneeFlex = 0.52;
      out.rightKneeFlex = 0.42;
      out.leftShoulderPitch = -0.25;
      out.rightShoulderPitch = 0.28;
      out.leftShoulderRoll = 0.42;
      out.rightShoulderRoll = -0.42;
      out.leftElbowFlex = -0.58;
      out.rightElbowFlex = -0.58;
      break;
    }

    case 'pass': {
      // Crisp side-foot pass follow-through
      const t = clamp(1 - signals.actionTimer / 0.25, 0, 1);
      const swing = Math.sin(t * Math.PI);
      out.pelvisY = -0.025 + swing * 0.02;
      out.pelvisPitch = 0.08;
      out.pelvisRoll = -0.08 * swing;
      out.torsoPitch = 0.06;
      out.torsoYaw = -0.32 * swing;

      out.leftHipPitch = -0.18;
      out.leftKneeFlex = 0.32;
      out.rightHipPitch = -0.78 * swing + 0.18 * (1 - swing);
      out.rightHipRoll = -0.18 * swing;
      out.rightKneeFlex = 0.22 + (1 - swing) * 0.45;
      out.rightAnklePitch = 0.22 * swing;

      out.leftShoulderPitch = -0.35 * swing;
      out.leftShoulderRoll = 0.36;
      out.leftElbowFlex = -0.55;
      out.rightShoulderPitch = 0.42 * swing;
      out.rightShoulderRoll = -0.24;
      out.rightElbowFlex = -0.48;
      break;
    }

    case 'shoot': {
      // Explosive full-power strike with strong hip/shoulder torque & follow-through
      const t = clamp(1 - signals.actionTimer / 0.25, 0, 1);
      const swing = Math.sin(t * Math.PI);
      out.pelvisY = 0.03 * swing;
      out.pelvisPitch = 0.12 - 0.16 * swing;
      out.pelvisRoll = -0.22 * swing;
      out.torsoPitch = 0.12;
      out.torsoYaw = -0.58 * swing;

      out.leftHipPitch = 0.26 * swing;
      out.leftKneeFlex = 0.28;
      out.rightHipPitch = -1.28 * swing + 0.45 * (1 - swing);
      out.rightKneeFlex = 0.12 + (1 - swing) * 0.85;
      out.rightAnklePitch = 0.35 * swing;

      out.leftShoulderPitch = -0.85 * swing;
      out.leftShoulderRoll = 0.62 * swing + 0.15;
      out.leftElbowFlex = -0.65;
      out.rightShoulderPitch = 0.82 * swing;
      out.rightShoulderRoll = -0.36;
      out.rightElbowFlex = -0.55;
      break;
    }

    case 'kick': {
      // Balanced athletic kick / clearance
      const t = clamp(1 - signals.actionTimer / 0.25, 0, 1);
      const swing = Math.sin(t * Math.PI);
      out.pelvisY = 0.015 * swing;
      out.pelvisPitch = 0.06;
      out.pelvisRoll = -0.14 * swing;
      out.torsoYaw = -0.4 * swing;

      out.leftHipPitch = 0.18;
      out.leftKneeFlex = 0.26;
      out.rightHipPitch = -1.04 * swing + 0.28 * (1 - swing);
      out.rightKneeFlex = 0.16 + (1 - swing) * 0.6;
      out.rightAnklePitch = 0.25 * swing;

      out.leftShoulderPitch = -0.55 * swing;
      out.leftShoulderRoll = 0.45;
      out.leftElbowFlex = -0.58;
      out.rightShoulderPitch = 0.6 * swing;
      out.rightShoulderRoll = -0.28;
      out.rightElbowFlex = -0.5;
      break;
    }

    case 'tackle': {
      // Low athletic sliding tackle: right leg extended, left knee tucked underneath
      out.pelvisY = -0.34;
      out.pelvisPitch = -0.68;
      out.pelvisRoll = 0.14;
      out.torsoPitch = 0.22;
      out.torsoYaw = -0.25;
      out.headPitch = 0.32;

      out.rightHipPitch = -1.02;
      out.rightKneeFlex = 0.12;
      out.rightAnklePitch = 0.32;
      out.leftHipPitch = 0.35;
      out.leftKneeFlex = 1.25;

      out.leftShoulderPitch = 0.65;
      out.leftShoulderRoll = 0.42;
      out.leftElbowFlex = -0.45;
      out.rightShoulderPitch = -0.42;
      out.rightShoulderRoll = -0.52;
      out.rightElbowFlex = -0.52;
      break;
    }

    case 'dive': {
      // Full-stretch goalkeeper horizontal dive
      const sideSign = (signals.team === 'home' ? -1 : 1) * (signals.diveDir || 1);
      out.pelvisY = 0.32;
      out.pelvisPitch = 0.06;
      out.pelvisRoll = sideSign * 1.28;
      out.torsoPitch = -0.05;
      out.headPitch = -0.2;

      out.leftHipPitch = 0.18;
      out.rightHipPitch = -0.18;
      out.leftKneeFlex = 0.45;
      out.rightKneeFlex = 0.28;

      out.leftShoulderPitch = -2.55;
      out.rightShoulderPitch = -2.55;
      out.leftShoulderRoll = 0.24;
      out.rightShoulderRoll = -0.24;
      out.leftElbowFlex = -0.18;
      out.rightElbowFlex = -0.18;
      break;
    }

    case 'celebration': {
      const hopPhase = signals.elapsed * 7.2 + signals.slotIndex * 0.9;
      const hop = Math.abs(Math.sin(hopPhase));
      const pump = Math.sin(hopPhase * 1.2);
      out.pelvisY = hop * 0.24;
      out.pelvisPitch = -0.08;
      out.pelvisRoll = Math.sin(signals.elapsed * 4.5 + signals.slotIndex) * 0.1;
      out.torsoPitch = -0.1;
      out.torsoYaw = Math.sin(signals.elapsed * 5.2 + signals.slotIndex) * 0.22;

      out.leftHipPitch = -hop * 0.45;
      out.rightHipPitch = -hop * 0.32;
      out.leftKneeFlex = 0.25 + hop * 0.72;
      out.rightKneeFlex = 0.25 + hop * 0.58;

      out.leftShoulderPitch = -2.65 + pump * 0.25;
      out.rightShoulderPitch = -2.65 - pump * 0.25;
      out.leftShoulderRoll = 0.48;
      out.rightShoulderRoll = -0.48;
      out.leftElbowFlex = -0.35 - hop * 0.25;
      out.rightElbowFlex = -0.35 - hop * 0.25;
      break;
    }
  }
}

/**
 * Smoothly blends `current` toward `target` using frame-rate-independent exponential damping.
 * Zero allocations; eliminates abrupt pose popping across all transitions.
 */
export function blendArticulatedPose(
  current: ArticulatedPose,
  target: ArticulatedPose,
  clip: PlayerAnimClip,
  dt: number,
): void {
  const isSnapAction =
    clip === 'kick' ||
    clip === 'pass' ||
    clip === 'shoot' ||
    clip === 'tackle' ||
    clip === 'dive';
  const lambda = isSnapAction ? 20 : clip === 'stop' ? 16 : 13;

  current.pelvisY = dampValue(current.pelvisY, target.pelvisY, lambda, dt);
  current.pelvisPitch = dampValue(current.pelvisPitch, target.pelvisPitch, lambda, dt);
  current.pelvisRoll = dampValue(current.pelvisRoll, target.pelvisRoll, lambda, dt);
  current.torsoPitch = dampValue(current.torsoPitch, target.torsoPitch, lambda, dt);
  current.torsoYaw = dampValue(current.torsoYaw, target.torsoYaw, lambda, dt);
  current.headYaw = dampValue(current.headYaw, target.headYaw, lambda * 0.8, dt);
  current.headPitch = dampValue(current.headPitch, target.headPitch, lambda * 0.8, dt);

  current.leftShoulderPitch = dampValue(current.leftShoulderPitch, target.leftShoulderPitch, lambda, dt);
  current.leftShoulderRoll = dampValue(current.leftShoulderRoll, target.leftShoulderRoll, lambda, dt);
  current.leftElbowFlex = dampValue(current.leftElbowFlex, target.leftElbowFlex, lambda, dt);

  current.rightShoulderPitch = dampValue(current.rightShoulderPitch, target.rightShoulderPitch, lambda, dt);
  current.rightShoulderRoll = dampValue(current.rightShoulderRoll, target.rightShoulderRoll, lambda, dt);
  current.rightElbowFlex = dampValue(current.rightElbowFlex, target.rightElbowFlex, lambda, dt);

  current.leftHipPitch = dampValue(current.leftHipPitch, target.leftHipPitch, lambda, dt);
  current.leftHipRoll = dampValue(current.leftHipRoll, target.leftHipRoll, lambda, dt);
  current.leftKneeFlex = dampValue(current.leftKneeFlex, target.leftKneeFlex, lambda, dt);
  current.leftAnklePitch = dampValue(current.leftAnklePitch, target.leftAnklePitch, lambda, dt);

  current.rightHipPitch = dampValue(current.rightHipPitch, target.rightHipPitch, lambda, dt);
  current.rightHipRoll = dampValue(current.rightHipRoll, target.rightHipRoll, lambda, dt);
  current.rightKneeFlex = dampValue(current.rightKneeFlex, target.rightKneeFlex, lambda, dt);
  current.rightAnklePitch = dampValue(current.rightAnklePitch, target.rightAnklePitch, lambda, dt);
}
