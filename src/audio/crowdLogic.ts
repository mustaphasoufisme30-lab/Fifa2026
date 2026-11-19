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
