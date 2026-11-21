export interface AnalogJoystickOutput {
  /** Normalized horizontal movement axis in [-1, 1] after deadzone & progressive curve */
  x: number;
  /** Normalized vertical/pitch-depth movement axis in [-1, 1] after deadzone & progressive curve */
  z: number;
  /** Visual thumbstick X offset in pixels clamped within maxRadius */
  knobX: number;
  /** Visual thumbstick Y offset in pixels clamped within maxRadius */
  knobY: number;
  /** Effective analog magnitude in [0, 1] */
  magnitude: number;
  /** Direction angle in radians (atan2(z, x)) */
  angle: number;
  /** True when stick exceeds radial deadzone */
  active: boolean;
}

/**
 * Computes a smooth 360-degree analog movement vector from raw pointer delta (dx, dy)
 * relative to the circular joystick center.
 *
 * Features:
 * - True circular radial deadzone (zero accidental drift, no axial snapping)
 * - Progressive non-linear response curve for fine dribbling at small deflections
 *   and full sprint speed at outer rim
 * - Clamped visual knob coordinates for crisp mobile feedback
 */
export function computeAnalogJoystickVector(
  dx: number,
  dy: number,
  maxRadius: number,
  deadzone = 0.14,
): AnalogJoystickOutput {
  if (maxRadius <= 0 || !Number.isFinite(dx) || !Number.isFinite(dy)) {
    return { x: 0, z: 0, knobX: 0, knobY: 0, magnitude: 0, angle: 0, active: false };
  }

  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6) {
    return { x: 0, z: 0, knobX: 0, knobY: 0, magnitude: 0, angle: 0, active: false };
  }

  const clampedDist = Math.min(dist, maxRadius);
  const nx = dx / dist;
  const ny = dy / dist;
  const knobX = nx * clampedDist;
  const knobY = ny * clampedDist;
  const rawMag = clampedDist / maxRadius;

  if (rawMag <= deadzone) {
    return {
      x: 0,
      z: 0,
      knobX: knobX * 0.55,
      knobY: knobY * 0.55,
      magnitude: 0,
      angle: Math.atan2(ny, nx),
      active: false,
    };
  }

  const remapped = Math.min(1, (rawMag - deadzone) / Math.max(0.01, 1 - deadzone));
  // Smooth progressive curve: fine dribble control near center, full 1.0 at rim
  const progressiveMag = remapped * (0.62 + 0.38 * remapped);

  return {
    x: nx * progressiveMag,
    z: ny * progressiveMag,
    knobX,
    knobY,
    magnitude: progressiveMag,
    angle: Math.atan2(ny, nx),
    active: true,
  };
}
