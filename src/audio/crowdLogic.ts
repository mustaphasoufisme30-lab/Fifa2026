import { HALF_LENGTH } from '../core/constants';
import { GameShellState, MatchPhase } from '../core/types';

export interface CrowdIntensityInput {
  shellState: GameShellState;
  phase: MatchPhase;
  ballX: number;
  ballSpeed: number;
  isReplaying: boolean;
  isOnline: boolean;
}

/**
 * Computes normalized stadium crowd excitement in [0, 1].
 * Quiet when paused/offline, gentle murmur on title/midfield, rising on attacks and goals.
 */
export function computeCrowdIntensity(input: CrowdIntensityInput): number {
  if (!input.isOnline) return 0;
  if (input.shellState === 'paused') return 0.08;
  if (input.shellState === 'title' || input.shellState === 'tournament') return 0.22;
  if (input.shellState === 'gameover') return 0.42;

  if (input.phase === 'goal' || input.isReplaying) {
    return 1.0;
  }
  if (input.phase === 'halftime' || input.phase === 'fulltime') {
    return 0.45;
  }
  if (input.phase === 'setpiece') {
    return 0.62;
  }

  // Live open play: ramp excitement smoothly as ball enters attacking thirds / penalty boxes
  const absX = Math.abs(input.ballX);
  const dangerRatio = Math.min(1, Math.max(0, (absX - 16) / (HALF_LENGTH - 16)));
  const speedBoost = Math.min(0.15, (input.ballSpeed / 28) * 0.15);
  return Math.min(0.9, 0.34 + dangerRatio * 0.42 + speedBoost);
}

export interface CrowdGainLevels {
  murmurGain: number;
  chatterGain: number;
  chatterFreqHz: number;
}

/**
 * Converts normalized crowd intensity [0..1] into Web Audio layer gains and formant cutoff.
 */
export function computeCrowdGainLevels(intensity: number): CrowdGainLevels {
  const clamped = Math.min(1, Math.max(0, intensity));
  return {
    murmurGain: clamped <= 0.001 ? 0 : 0.032 + clamped * 0.068,
    chatterGain: clamped <= 0.001 ? 0 : 0.016 + clamped * 0.056,
    chatterFreqHz: 580 + clamped * 440,
  };
}

export type SoundChannelId =
  | 'kick'
  | 'tackle'
  | 'whistle'
  | 'postHit'
  | 'netSwish'
  | 'applause'
  | 'ooh'
  | 'boo'
  | 'goalCheer';

export const SOUND_COOLDOWNS_MS: Record<SoundChannelId, number> = {
  kick: 55,
  tackle: 180,
  whistle: 240,
  postHit: 220,
  netSwish: 300,
  applause: 1500,
  ooh: 1200,
  boo: 1600,
  goalCheer: 2600,
};

/**
 * Pure cooldown guard preventing simultaneous duplicate audio triggers.
 * Updates `lastTriggeredMs[channel]` when allowed.
 */
export function canTriggerSound(
  lastTriggeredMs: Partial<Record<SoundChannelId, number>>,
  channel: SoundChannelId,
  nowMs: number,
  cooldownOverrideMs?: number,
): boolean {
  const minGap = cooldownOverrideMs ?? SOUND_COOLDOWNS_MS[channel];
  const prev = lastTriggeredMs[channel];
  if (prev !== undefined && nowMs - prev < minGap) {
    return false;
  }
  lastTriggeredMs[channel] = nowMs;
  return true;
}

/**
 * Blends live baseline stadium ambience with a decaying post-action boost
 * (applause, dangerous shot, or goal roar) for a smooth return to normal crowd levels.
 */
export function computeEffectiveCrowdIntensity(
  baseIntensity: number,
  boostPeak: number,
  elapsedSinceBoostSec: number,
  decayDurationSec: number,
): number {
  const clampedBase = Math.min(1, Math.max(0, baseIntensity));
  if (clampedBase <= 0.001) return 0;
  if (boostPeak <= 0 || decayDurationSec <= 0 || elapsedSinceBoostSec >= decayDurationSec) {
    return clampedBase;
  }
  const t = Math.max(0, Math.min(1, elapsedSinceBoostSec / decayDurationSec));
  // Smooth ease-out decay back to normal crowd level
  const remaining = (1 - t) * (1 - t);
  return Math.min(1, clampedBase + boostPeak * remaining);
}

