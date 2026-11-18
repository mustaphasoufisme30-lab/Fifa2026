import { HALF_LENGTH, HALF_WIDTH } from '../core/constants';
import { FormationId, PlayerRole, TacticalMentality, TeamSide, Vec3 } from '../core/types';

export interface FormationSlot {
  role: PlayerRole;
  /** Depth along own half -> opponent half: -1 (own goal line) to +1 (opp goal line), 0 = halfway line */
  nx: number;
  /** Lateral position across width: -1 (left wing) to +1 (right wing) */
  nz: number;
}

export interface FormationTactics {
  /** Base depth offset along pitch (-0.15..+0.15) */
  lineDepthBias: number;
  /** Width multiplier for flank players (0.88..1.16) */
  widthScale: number;
  /** Pressing & run aggression multiplier (0.75..1.35) */
  pressIntensity: number;
  /** Off-ball attacking push offset in meters */
  attackPushMeters: number;
}

export interface FormationDefinition {
  id: FormationId;
  label: string;
  description: string;
  tactics: FormationTactics;
  slots: FormationSlot[];
}

export const MENTALITY_MODIFIERS: Record<
  TacticalMentality,
  { label: string; depthOffset: number; pressMult: number; attackPush: number }
> = {
  defensive: {
    label: 'Defensive',
    depthOffset: -0.14,
    pressMult: 0.78,
    attackPush: -4.5,
  },
  balanced: {
    label: 'Balanced',
    depthOffset: 0,
    pressMult: 1.0,
    attackPush: 0,
  },
  attacking: {
    label: 'Attacking',
    depthOffset: 0.14,
    pressMult: 1.24,
    attackPush: 5.5,
  },
};

export const FORMATIONS: Record<FormationId, FormationDefinition> = {
  '4-3-3': {
    id: '4-3-3',
    label: '4-3-3 Attack',
    description: 'Wide wingers stretching the pitch with a balanced 3-man midfield.',
    tactics: {
      lineDepthBias: 0.05,
      widthScale: 1.06,
      pressIntensity: 1.12,
      attackPushMeters: 3.0,
    },
    slots: [
      { role: 'GK', nx: -0.94, nz: 0.0 },
      { role: 'LB', nx: -0.62, nz: -0.66 },
      { role: 'CB', nx: -0.68, nz: -0.24 },
      { role: 'CB', nx: -0.68, nz: 0.24 },
      { role: 'RB', nx: -0.62, nz: 0.66 },
      { role: 'CDM', nx: -0.38, nz: 0.0 },
      { role: 'CM', nx: -0.22, nz: -0.42 },
      { role: 'CM', nx: -0.22, nz: 0.42 },
      { role: 'LW', nx: -0.06, nz: -0.68 },
      { role: 'ST', nx: -0.04, nz: 0.0 },
      { role: 'RW', nx: -0.06, nz: 0.68 },
    ],
  },
  '4-4-2': {
    id: '4-4-2',
    label: '4-4-2 Classic',
    description: 'Compact two-bank defensive shape with a strike partnership up top.',
    tactics: {
      lineDepthBias: -0.05,
      widthScale: 0.92,
      pressIntensity: 0.92,
      attackPushMeters: 0.0,
    },
    slots: [
      { role: 'GK', nx: -0.94, nz: 0.0 },
      { role: 'LB', nx: -0.64, nz: -0.66 },
      { role: 'CB', nx: -0.7, nz: -0.24 },
      { role: 'CB', nx: -0.7, nz: 0.24 },
      { role: 'RB', nx: -0.64, nz: 0.66 },
      { role: 'LW', nx: -0.32, nz: -0.68 },
      { role: 'CM', nx: -0.36, nz: -0.22 },
      { role: 'CM', nx: -0.36, nz: 0.22 },
      { role: 'RW', nx: -0.32, nz: 0.68 },
      { role: 'ST', nx: -0.06, nz: -0.22 },
      { role: 'ST', nx: -0.06, nz: 0.22 },
    ],
  },
  '4-2-3-1': {
    id: '4-2-3-1',
    label: '4-2-3-1 Control',
    description: 'Double pivot shielding the defense behind a creative playmaker.',
    tactics: {
      lineDepthBias: 0.0,
      widthScale: 0.98,
      pressIntensity: 1.0,
      attackPushMeters: 1.5,
    },
    slots: [
      { role: 'GK', nx: -0.94, nz: 0.0 },
      { role: 'LB', nx: -0.64, nz: -0.66 },
      { role: 'CB', nx: -0.7, nz: -0.24 },
      { role: 'CB', nx: -0.7, nz: 0.24 },
      { role: 'RB', nx: -0.64, nz: 0.66 },
      { role: 'CDM', nx: -0.44, nz: -0.26 },
      { role: 'CDM', nx: -0.44, nz: 0.26 },
      { role: 'LW', nx: -0.18, nz: -0.64 },
      { role: 'CAM', nx: -0.18, nz: 0.0 },
      { role: 'RW', nx: -0.18, nz: 0.64 },
      { role: 'ST', nx: -0.04, nz: 0.0 },
    ],
  },
  '3-5-2': {
    id: '3-5-2',
    label: '3-5-2 Wingbacks',
    description: 'Three central defenders with high-energy wingbacks dominating flanks.',
    tactics: {
      lineDepthBias: 0.03,
      widthScale: 1.12,
      pressIntensity: 1.08,
      attackPushMeters: 2.5,
    },
    slots: [
      { role: 'GK', nx: -0.94, nz: 0.0 },
      { role: 'CB', nx: -0.7, nz: -0.44 },
      { role: 'CB', nx: -0.72, nz: 0.0 },
      { role: 'CB', nx: -0.7, nz: 0.44 },
      { role: 'LB', nx: -0.34, nz: -0.76 },
      { role: 'CDM', nx: -0.42, nz: 0.0 },
      { role: 'CM', nx: -0.26, nz: -0.34 },
      { role: 'CM', nx: -0.26, nz: 0.34 },
      { role: 'RB', nx: -0.34, nz: 0.76 },
      { role: 'ST', nx: -0.05, nz: -0.22 },
      { role: 'ST', nx: -0.05, nz: 0.22 },
    ],
  },
};

export const FORMATION_LIST: FormationDefinition[] = Object.values(FORMATIONS);

export function getFormationTactics(
  formationId: FormationId,
  mentality: TacticalMentality = 'balanced',
): FormationTactics {
  const base = (FORMATIONS[formationId] ?? FORMATIONS['4-3-3']).tactics;
  const mod = MENTALITY_MODIFIERS[mentality] ?? MENTALITY_MODIFIERS.balanced;
  return {
    lineDepthBias: base.lineDepthBias + mod.depthOffset,
    widthScale: base.widthScale,
    pressIntensity: base.pressIntensity * mod.pressMult,
    attackPushMeters: base.attackPushMeters + mod.attackPush,
  };
}

/**
 * Maps a formation slot into world pitch coordinates (meters).
 * Home attacks +X (starts in -X half); Away attacks -X (starts in +X half).
 */
export function getFormationWorldPosition(
  slot: FormationSlot,
  side: TeamSide,
  ballX = 0,
  ballZ = 0,
  forKickoff = false,
  formationId: FormationId = '4-3-3',
  mentality: TacticalMentality = 'balanced',
): Vec3 {
  const dir = side === 'home' ? 1 : -1;
  const tactics = getFormationTactics(formationId, mentality);
  const depthAdjust = forKickoff || slot.role === 'GK' ? 0 : tactics.lineDepthBias;
  const widthAdjust = forKickoff || slot.role === 'GK' ? 1 : tactics.widthScale;

  let baseX = (slot.nx + depthAdjust) * HALF_LENGTH * dir;
  let baseZ = slot.nz * widthAdjust * (HALF_WIDTH * 0.88) * dir;

  if (forKickoff) {
    // Ensure players start strictly inside their own half (outside center circle unless kicker)
    if (side === 'home') {
      baseX = Math.min(baseX, -1.8);
    } else {
      baseX = Math.max(baseX, 1.8);
    }
    return { x: baseX, y: 0, z: baseZ };
  }

  // During live play, shift outfield line dynamically with ball position
  if (slot.role !== 'GK') {
    const shiftX = ballX * 0.42;
    const shiftZ = ballZ * 0.24;
    baseX = Math.max(-HALF_LENGTH + 3.5, Math.min(HALF_LENGTH - 3.5, baseX + shiftX));
    baseZ = Math.max(-HALF_WIDTH + 2.5, Math.min(HALF_WIDTH - 2.5, baseZ + shiftZ));
  }

  return { x: baseX, y: 0, z: baseZ };
}
