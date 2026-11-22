import {
  CameraMode,
  ControlAssistMode,
  GameSettings,
  MatchDifficulty,
  QualityLevel,
  ViewMode,
  WeatherPreset,
} from './types';
import { DEFAULT_HALF_REAL_SECONDS } from './constants';

export interface SelectOption<T> {
  value: T;
  label: string;
}

export const MATCH_LEVEL_OPTIONS: SelectOption<MatchDifficulty>[] = [
  { value: 'amateur', label: 'Amateur' },
  { value: 'pro', label: 'Professional' },
  { value: 'world_class', label: 'World Class' },
];

export const MATCH_TIME_OPTIONS: SelectOption<number>[] = [
  { value: 60, label: '2 min.' },
  { value: 120, label: '4 min.' },
  { value: 180, label: '6 min.' },
  { value: 240, label: '8 min.' },
  { value: 300, label: '10 min.' },
];

export const CONTROL_MODE_OPTIONS: SelectOption<ControlAssistMode>[] = [
  { value: 'manual', label: 'Manual' },
  { value: 'assisted', label: 'Assisted' },
  { value: 'semi_auto', label: 'Semi-Auto' },
];

export const WEATHER_OPTIONS: SelectOption<WeatherPreset>[] = [
  { value: 'clear', label: 'Clear' },
  { value: 'overcast', label: 'Overcast' },
  { value: 'evening', label: 'Evening' },
  { value: 'night', label: 'Night' },
];

export const CAMERA_TYPE_OPTIONS: SelectOption<Exclude<CameraMode, 'replay'>>[] = [
  { value: 'tv', label: 'TV Broadcast' },
  { value: 'close', label: 'Close Action' },
  { value: 'vertical', label: 'Vertical Cam' },
  { value: 'player', label: 'Player Cam' },
];

export const VIEW_MODE_OPTIONS: SelectOption<ViewMode>[] = [
  { value: '3d', label: '3D' },
  { value: '2d', label: '2D' },
];

export const QUALITY_OPTIONS: SelectOption<QualityLevel>[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export const USER_COLOR_PALETTE: string[] = [
  '#22c55e',
  '#06b6d4',
  '#2563eb',
  '#38bdf8',
  '#facc15',
  '#f97316',
  '#ffffff',
];

export const RIVAL_COLOR_PALETTE: string[] = [
  '#ef4444',
  '#f97316',
  '#ec4899',
  '#a855f7',
  '#facc15',
  '#38bdf8',
  '#94a3b8',
];

export const CAMERA_HEIGHT_MIN = 14;
export const CAMERA_HEIGHT_MAX = 34;
export const CAMERA_HEIGHT_DEFAULT = 24;

export interface WeatherLightingPreset {
  skyHex: number;
  fogHex: number;
  fogNear: number;
  fogFar: number;
  hemiSkyHex: number;
  hemiGroundHex: number;
  hemiIntensity: number;
  keyHex: number;
  keyIntensity: number;
  fillHex: number;
  fillIntensity: number;
  exposure: number;
  envIntensity: number;
}

export const WEATHER_LIGHTING_PRESETS: Record<WeatherPreset, WeatherLightingPreset> = {
  clear: {
    skyHex: 0x6fb7ec,
    fogHex: 0xb5ddf7,
    fogNear: 145,
    fogFar: 300,
    hemiSkyHex: 0xd8eeff,
    hemiGroundHex: 0x3b6620,
    hemiIntensity: 0.85,
    keyHex: 0xfff4dc,
    keyIntensity: 1.55,
    fillHex: 0xc2e1ff,
    fillIntensity: 0.32,
    exposure: 1.04,
    envIntensity: 0.35,
  },
  overcast: {
    skyHex: 0x9aaec0,
    fogHex: 0xb8c7d4,
    fogNear: 95,
    fogFar: 240,
    hemiSkyHex: 0xd4dde6,
    hemiGroundHex: 0x355726,
    hemiIntensity: 0.96,
    keyHex: 0xe6eef5,
    keyIntensity: 1.05,
    fillHex: 0xc2d0dc,
    fillIntensity: 0.45,
    exposure: 0.98,
    envIntensity: 0.3,
  },
  evening: {
    skyHex: 0xc97b59,
    fogHex: 0xd99b76,
    fogNear: 115,
    fogFar: 265,
    hemiSkyHex: 0xffd1a9,
    hemiGroundHex: 0x2c461c,
    hemiIntensity: 0.72,
    keyHex: 0xffb36b,
    keyIntensity: 1.48,
    fillHex: 0x7b9bc9,
    fillIntensity: 0.38,
    exposure: 1.02,
    envIntensity: 0.28,
  },
  night: {
    skyHex: 0x0b1628,
    fogHex: 0x102038,
    fogNear: 120,
    fogFar: 270,
    hemiSkyHex: 0x8fb4e8,
    hemiGroundHex: 0x1e3818,
    hemiIntensity: 0.65,
    keyHex: 0xf4f8ff,
    keyIntensity: 1.45,
    fillHex: 0x9fc4ff,
    fillIntensity: 0.48,
    exposure: 1.0,
    envIntensity: 0.24,
  },
};

export function getDefaultGameSettings(): GameSettings {
  return {
    quality: 'medium',
    cameraMode: 'tv',
    soundEnabled: true,
    showTouchControls: true,
    halfDurationSeconds: DEFAULT_HALF_REAL_SECONDS,
    matchLevel: 'amateur',
    controlMode: 'manual',
    weather: 'clear',
    cameraHeight: CAMERA_HEIGHT_DEFAULT,
    soundVolume: 100,
    effectsEnabled: true,
    effectsVolume: 75,
    userIndicatorColor: '#38bdf8',
    rivalIndicatorColor: '#ef4444',
    showRadar: true,
    showPlayerName: true,
    showCircle: true,
    viewMode: '3d',
  };
}

export function cycleValue<T>(list: readonly T[], current: T, delta: -1 | 1): T {
  const idx = list.indexOf(current);
  if (idx === -1) return list[0];
  const nextIdx = (idx + delta + list.length) % list.length;
  return list[nextIdx];
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function getDifficultyAiSpeedScale(level: MatchDifficulty): number {
  switch (level) {
    case 'amateur':
      return 0.88;
    case 'pro':
      return 1.0;
    case 'world_class':
      return 1.1;
  }
}

export function sanitizeGameSettings(raw?: Partial<GameSettings> | null): GameSettings {
  const d = getDefaultGameSettings();
  if (!raw || typeof raw !== 'object') return d;

  const validQuality: QualityLevel[] = ['low', 'medium', 'high'];
  const validCamera: CameraMode[] = ['tv', 'close', 'player', 'vertical'];
  const validLevel: MatchDifficulty[] = ['amateur', 'pro', 'world_class'];
  const validControl: ControlAssistMode[] = ['manual', 'assisted', 'semi_auto'];
  const validWeather: WeatherPreset[] = ['clear', 'overcast', 'evening', 'night'];
  const validView: ViewMode[] = ['3d', '2d'];
  const validHalfTimes = MATCH_TIME_OPTIONS.map((o) => o.value);

  const halfDuration =
    typeof raw.halfDurationSeconds === 'number' && validHalfTimes.includes(raw.halfDurationSeconds)
      ? raw.halfDurationSeconds
      : d.halfDurationSeconds;

  return {
    quality: raw.quality && validQuality.includes(raw.quality) ? raw.quality : d.quality,
    cameraMode:
      raw.cameraMode && validCamera.includes(raw.cameraMode) ? raw.cameraMode : d.cameraMode,
    soundEnabled: typeof raw.soundEnabled === 'boolean' ? raw.soundEnabled : d.soundEnabled,
    showTouchControls:
      typeof raw.showTouchControls === 'boolean' ? raw.showTouchControls : d.showTouchControls,
    halfDurationSeconds: halfDuration,
    matchLevel:
      raw.matchLevel && validLevel.includes(raw.matchLevel) ? raw.matchLevel : d.matchLevel,
    controlMode:
      raw.controlMode && validControl.includes(raw.controlMode)
        ? raw.controlMode
        : d.controlMode,
    weather: raw.weather && validWeather.includes(raw.weather) ? raw.weather : d.weather,
    cameraHeight: Math.round(
      clampNumber(
        typeof raw.cameraHeight === 'number' ? raw.cameraHeight : d.cameraHeight,
        CAMERA_HEIGHT_MIN,
        CAMERA_HEIGHT_MAX,
      ),
    ),
    soundVolume: Math.round(
      clampNumber(
        typeof raw.soundVolume === 'number' ? raw.soundVolume : d.soundVolume,
        0,
        100,
      ),
    ),
    effectsEnabled:
      typeof raw.effectsEnabled === 'boolean' ? raw.effectsEnabled : d.effectsEnabled,
    effectsVolume: Math.round(
      clampNumber(
        typeof raw.effectsVolume === 'number' ? raw.effectsVolume : d.effectsVolume,
        0,
        100,
      ),
    ),
    userIndicatorColor:
      typeof raw.userIndicatorColor === 'string' &&
      USER_COLOR_PALETTE.includes(raw.userIndicatorColor)
        ? raw.userIndicatorColor
        : d.userIndicatorColor,
    rivalIndicatorColor:
      typeof raw.rivalIndicatorColor === 'string' &&
      RIVAL_COLOR_PALETTE.includes(raw.rivalIndicatorColor)
        ? raw.rivalIndicatorColor
        : d.rivalIndicatorColor,
    showRadar: typeof raw.showRadar === 'boolean' ? raw.showRadar : d.showRadar,
    showPlayerName:
      typeof raw.showPlayerName === 'boolean' ? raw.showPlayerName : d.showPlayerName,
    showCircle: typeof raw.showCircle === 'boolean' ? raw.showCircle : d.showCircle,
    viewMode: raw.viewMode && validView.includes(raw.viewMode) ? raw.viewMode : d.viewMode,
  };
}
