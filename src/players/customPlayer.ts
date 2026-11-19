import {
  CustomPlayerAppearance,
  CustomPlayerProfile,
  CustomPlayerRatings,
  FacePresetId,
  HairStyleId,
  JerseyPatternId,
  PlayerAttributes,
  PlayerRole,
  TeamConfig,
} from '../core/types';

export interface PaletteSwatch {
  id: string;
  label: string;
  hex: string;
}

export const SKIN_TONE_SWATCHES: PaletteSwatch[] = [
  { id: 'porcelain', label: 'Fair', hex: '#f4d3b8' },
  { id: 'warm', label: 'Light', hex: '#f1c7a6' },
  { id: 'olive', label: 'Olive', hex: '#d99e78' },
  { id: 'tan', label: 'Tan', hex: '#b97a52' },
  { id: 'bronze', label: 'Bronze', hex: '#8e5a3c' },
  { id: 'deep', label: 'Deep', hex: '#5f3a25' },
];

export const HAIR_COLOR_SWATCHES: PaletteSwatch[] = [
  { id: 'jet', label: 'Jet Black', hex: '#14151a' },
  { id: 'espresso', label: 'Dark Brown', hex: '#3b281c' },
  { id: 'chestnut', label: 'Chestnut', hex: '#7a4b22' },
  { id: 'golden', label: 'Blonde', hex: '#c89b44' },
  { id: 'copper', label: 'Auburn', hex: '#9a4326' },
  { id: 'silver', label: 'Platinum', hex: '#cfd6e0' },
];

export const BOOTS_COLOR_SWATCHES: PaletteSwatch[] = [
  { id: 'sky', label: 'Electric Sky', hex: '#38bdf8' },
  { id: 'solar', label: 'Solar Orange', hex: '#f97316' },
  { id: 'volt', label: 'Volt Lime', hex: '#a3e635' },
  { id: 'crimson', label: 'Crimson', hex: '#f43f5e' },
  { id: 'gold', label: 'Championship Gold', hex: '#facc15' },
  { id: 'stealth', label: 'Stealth White', hex: '#f8fafc' },
];

export const JERSEY_COLOR_SWATCHES: Array<PaletteSwatch | { id: 'club'; label: string; hex: null }> = [
  { id: 'club', label: 'Club Kit', hex: null },
  { id: 'royal', label: 'Royal Blue', hex: '#1d4ed8' },
  { id: 'emerald', label: 'Emerald', hex: '#059669' },
  { id: 'crimson', label: 'Crimson', hex: '#dc2626' },
  { id: 'obsidian', label: 'Obsidian', hex: '#111827' },
  { id: 'amber', label: 'Amber Gold', hex: '#d97706' },
];

export const HAIR_STYLE_OPTIONS: Array<{ id: HairStyleId; label: string }> = [
  { id: 'short', label: 'Short' },
  { id: 'fade', label: 'Fade' },
  { id: 'curly', label: 'Curly' },
  { id: 'buzz', label: 'Buzz' },
  { id: 'mohawk', label: 'Mohawk' },
  { id: 'long', label: 'Long' },
];

export const FACE_PRESET_OPTIONS: Array<{ id: FacePresetId; label: string }> = [
  { id: 'classic', label: 'Classic' },
  { id: 'sculpted', label: 'Sculpted' },
  { id: 'athletic', label: 'Stubble' },
  { id: 'beard', label: 'Full Beard' },
];

export const JERSEY_PATTERN_OPTIONS: Array<{ id: JerseyPatternId; label: string }> = [
  { id: 'stripe', label: 'Stripe' },
  { id: 'solid', label: 'Solid' },
  { id: 'hoops', label: 'Hoops' },
  { id: 'sash', label: 'Sash' },
];

export const CUSTOM_SLOT_OPTIONS: Array<{ slotIndex: number; label: string; role: PlayerRole }> = [
  { slotIndex: 9, label: 'ST · Striker', role: 'ST' },
  { slotIndex: 8, label: 'LW · Left Wing', role: 'LW' },
  { slotIndex: 10, label: 'RW · Right Wing', role: 'RW' },
  { slotIndex: 7, label: 'CM · Playmaker', role: 'CM' },
  { slotIndex: 5, label: 'CDM · Anchor', role: 'CDM' },
  { slotIndex: 2, label: 'CB · Center Back', role: 'CB' },
];

export function getDefaultCustomPlayer(): CustomPlayerProfile {
  return {
    enabled: false,
    slotIndex: 9,
    name: 'A. Moreau',
    number: 10,
    appearance: {
      skinTone: '#d99e78',
      facePreset: 'classic',
      hairStyle: 'fade',
      hairColor: '#14151a',
      bootsColor: '#38bdf8',
      jerseyPattern: 'stripe',
      jerseyColorOverride: null,
      referenceImageDataUrl: null,
    },
    ratings: {
      pace: 84,
      shooting: 83,
      passing: 80,
      dribbling: 85,
      stamina: 88,
    },
  };
}

function clampInt(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return min;
  return Math.max(min, Math.min(max, Math.round(val)));
}

export function sanitizeCustomPlayerProfile(
  input: Partial<CustomPlayerProfile> | null | undefined,
): CustomPlayerProfile {
  const def = getDefaultCustomPlayer();
  if (!input) return def;

  const rawName = typeof input.name === 'string' ? input.name.trim() : '';
  const safeName = rawName.length >= 2 ? rawName.slice(0, 20) : def.name;
  const safeNumber = clampInt(input.number ?? def.number, 1, 99);
  const validSlots = new Set(CUSTOM_SLOT_OPTIONS.map((s) => s.slotIndex));
  const safeSlot =
    typeof input.slotIndex === 'number' && validSlots.has(input.slotIndex)
      ? input.slotIndex
      : def.slotIndex;

  const validHair = new Set(HAIR_STYLE_OPTIONS.map((h) => h.id));
  const validFaces = new Set(FACE_PRESET_OPTIONS.map((f) => f.id));
  const validPatterns = new Set(JERSEY_PATTERN_OPTIONS.map((p) => p.id));

  const appIn: Partial<CustomPlayerAppearance> = input.appearance ?? {};
  const appearance: CustomPlayerAppearance = {
    skinTone: typeof appIn.skinTone === 'string' && appIn.skinTone.startsWith('#')
      ? appIn.skinTone
      : def.appearance.skinTone,
    facePreset: appIn.facePreset && validFaces.has(appIn.facePreset)
      ? appIn.facePreset
      : def.appearance.facePreset,
    hairStyle: appIn.hairStyle && validHair.has(appIn.hairStyle)
      ? appIn.hairStyle
      : def.appearance.hairStyle,
    hairColor: typeof appIn.hairColor === 'string' && appIn.hairColor.startsWith('#')
      ? appIn.hairColor
      : def.appearance.hairColor,
    bootsColor: typeof appIn.bootsColor === 'string' && appIn.bootsColor.startsWith('#')
      ? appIn.bootsColor
      : def.appearance.bootsColor,
    jerseyPattern: appIn.jerseyPattern && validPatterns.has(appIn.jerseyPattern)
      ? appIn.jerseyPattern
      : def.appearance.jerseyPattern,
    jerseyColorOverride:
      typeof appIn.jerseyColorOverride === 'string' && appIn.jerseyColorOverride.startsWith('#')
        ? appIn.jerseyColorOverride
        : null,
    referenceImageDataUrl:
      typeof appIn.referenceImageDataUrl === 'string' &&
      appIn.referenceImageDataUrl.startsWith('data:image/')
        ? appIn.referenceImageDataUrl
        : null,
  };

  const ratIn: Partial<CustomPlayerRatings> = input.ratings ?? {};
  const ratings: CustomPlayerRatings = {
    pace: clampInt(ratIn.pace ?? def.ratings.pace, 60, 96),
    shooting: clampInt(ratIn.shooting ?? def.ratings.shooting, 60, 96),
    passing: clampInt(ratIn.passing ?? def.ratings.passing, 60, 96),
    dribbling: clampInt(ratIn.dribbling ?? def.ratings.dribbling, 60, 96),
    stamina: clampInt(ratIn.stamina ?? def.ratings.stamina, 65, 99),
  };

  return {
    enabled: Boolean(input.enabled),
    slotIndex: safeSlot,
    name: safeName,
    number: safeNumber,
    appearance,
    ratings,
  };
}

/**
 * Maps human-friendly 60..96 ratings into deterministic MatchEngine physical attributes.
 */
export function mapRatingsToAttributes(ratings: CustomPlayerRatings): PlayerAttributes {
  const paceNorm = (clampInt(ratings.pace, 60, 96) - 60) / 36; // 0..1
  const shootNorm = (clampInt(ratings.shooting, 60, 96) - 60) / 36; // 0..1
  const passing = clampInt(ratings.passing, 60, 96);
  const dribbling = clampInt(ratings.dribbling, 60, 96);
  const stamina = clampInt(ratings.stamina, 65, 99);

  return {
    speed: Number((6.9 + paceNorm * 1.55).toFixed(2)), // 6.90 .. 8.45 m/s
    acceleration: Number((16.5 + paceNorm * 4.5).toFixed(2)), // 16.5 .. 21.0 m/s^2
    staminaMax: stamina,
    shotPower: Number((22 + shootNorm * 9.5).toFixed(2)), // 22.0 .. 31.5 m/s
    passing,
    dribbling,
  };
}

export function computeOverallRating(ratings: CustomPlayerRatings, role: PlayerRole): number {
  const isFwd = role === 'ST' || role === 'LW' || role === 'RW' || role === 'CAM';
  const isMid = role === 'CM' || role === 'CDM';

  const weighted = isFwd
    ? ratings.pace * 0.26 +
      ratings.shooting * 0.28 +
      ratings.dribbling * 0.26 +
      ratings.passing * 0.12 +
      ratings.stamina * 0.08
    : isMid
      ? ratings.passing * 0.3 +
        ratings.dribbling * 0.24 +
        ratings.stamina * 0.18 +
        ratings.pace * 0.14 +
        ratings.shooting * 0.14
      : ratings.stamina * 0.28 +
        ratings.pace * 0.24 +
        ratings.passing * 0.22 +
        ratings.dribbling * 0.14 +
        ratings.shooting * 0.12;

  return Math.round(weighted);
}

/**
 * Returns a non-mutating TeamConfig with the custom player applied to the chosen slot when enabled.
 */
export function applyCustomPlayerToTeam(
  baseTeam: TeamConfig,
  custom: CustomPlayerProfile | null | undefined,
): TeamConfig {
  if (!custom || !custom.enabled) return baseTeam;

  const safe = sanitizeCustomPlayerProfile(custom);
  const nextRoster = baseTeam.roster.map((player, idx) => {
    if (idx !== safe.slotIndex) return player;
    return {
      ...player,
      name: safe.name,
      number: safe.number,
      attributes: mapRatingsToAttributes(safe.ratings),
      appearance: {
        ...player.appearance,
        ...safe.appearance,
      },
    };
  });

  // Also apply custom jersey primary override to the team kit if chosen
  const nextKit = safe.appearance.jerseyColorOverride
    ? {
        ...baseTeam.kit,
        primary: safe.appearance.jerseyColorOverride,
        socks: safe.appearance.jerseyColorOverride,
      }
    : baseTeam.kit;

  return {
    ...baseTeam,
    kit: nextKit,
    roster: nextRoster,
  };
}
