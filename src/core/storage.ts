import { DEFAULT_HALF_REAL_SECONDS } from './constants';
import { SavedState } from './types';

const STORAGE_KEY = 'club_xi_football_save_v1';

export function getDefaultSavedState(): SavedState {
  return {
    settings: {
      quality: 'medium',
      cameraMode: 'tv',
      soundEnabled: true,
      showTouchControls: true,
      halfDurationSeconds: DEFAULT_HALF_REAL_SECONDS,
    },
    homeTeamId: 'aurelia',
    awayTeamId: 'nordic',
    homeFormation: '4-3-3',
    awayFormation: '4-4-2',
    homeMentality: 'balanced',
    awayMentality: 'balanced',
    career: {
      matchesPlayed: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsScored: 0,
    },
    customCaptainAppearance: null,
  };
}

export function loadSavedState(): SavedState {
  const defaults = getDefaultSavedState();
  if (typeof window === 'undefined' || !window.localStorage) {
    return defaults;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<SavedState>;
    return {
      settings: { ...defaults.settings, ...(parsed.settings ?? {}) },
      homeTeamId: parsed.homeTeamId ?? defaults.homeTeamId,
      awayTeamId: parsed.awayTeamId ?? defaults.awayTeamId,
      homeFormation: parsed.homeFormation ?? defaults.homeFormation,
      awayFormation: parsed.awayFormation ?? defaults.awayFormation,
      homeMentality: parsed.homeMentality ?? defaults.homeMentality,
      awayMentality: parsed.awayMentality ?? defaults.awayMentality,
      career: { ...defaults.career, ...(parsed.career ?? {}) },
      customCaptainAppearance: parsed.customCaptainAppearance ?? null,
    };
  } catch {
    return defaults;
  }
}

export function saveState(state: SavedState): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota / privacy mode storage errors
  }
}
