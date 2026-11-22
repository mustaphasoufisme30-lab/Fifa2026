import { MatchPhase, TeamSide } from '../core/types';

export type ControlPadMode = 'ATTACK' | 'DEFENSE';

export interface ControlModeInput {
  phase: MatchPhase;
  localTeam: TeamSide;
  ballOwnerTeam: TeamSide | null;
  lastTouchTeam: TeamSide | null;
  setPieceTeam: TeamSide | null;
  kickoffTeam: TeamSide;
}

export interface ControlModeState {
  mode: ControlPadMode;
  pendingMode: ControlPadMode | null;
  pendingElapsedMs: number;
  cooldownRemainingMs: number;
}

export interface ControlModeStepResult {
  state: ControlModeState;
  changed: boolean;
}

/** Sustained direct possession required to flip modes (ms). */
export const CONTROL_MODE_CONFIRM_MS = 150;
/** Weight applied when ball is in flight (ownerId === null) after opposite team's touch (~275ms confirm). */
export const CONTROL_MODE_INFLIGHT_WEIGHT = 0.55;
/** Minimum cooldown after a live mode switch to prevent rapid duel ping-pong (ms). */
export const CONTROL_MODE_COOLDOWN_MS = 280;

export function createControlModeState(initialMode: ControlPadMode = 'ATTACK'): ControlModeState {
  return {
    mode: initialMode,
    pendingMode: null,
    pendingElapsedMs: 0,
    cooldownRemainingMs: 0,
  };
}

export function resolveImmediateControlMode(input: ControlModeInput): ControlPadMode | null {
  if (input.phase === 'kickoff') {
    return input.kickoffTeam === input.localTeam ? 'ATTACK' : 'DEFENSE';
  }
  if (input.phase === 'setpiece' && input.setPieceTeam !== null) {
    return input.setPieceTeam === input.localTeam ? 'ATTACK' : 'DEFENSE';
  }
  return null;
}

export function stepControlMode(
  prev: ControlModeState,
  input: ControlModeInput,
  dtMs: number,
  confirmWindowMs: number = CONTROL_MODE_CONFIRM_MS,
  cooldownMs: number = CONTROL_MODE_COOLDOWN_MS,
): ControlModeStepResult {
  const safeDtMs = Math.max(0, dtMs);
  const nextCooldown = Math.max(0, prev.cooldownRemainingMs - safeDtMs);

  // Kickoff and set pieces deterministically assign attacking/defending roles immediately.
  const immediateMode = resolveImmediateControlMode(input);
  if (immediateMode !== null) {
    const changed = immediateMode !== prev.mode;
    return {
      state: {
        mode: immediateMode,
        pendingMode: null,
        pendingElapsedMs: 0,
        cooldownRemainingMs: 0,
      },
      changed,
    };
  }

  // Non-live pause/celebration phases preserve the current mode without jitter.
  if (input.phase !== 'live') {
    return {
      state: {
        mode: prev.mode,
        pendingMode: null,
        pendingElapsedMs: 0,
        cooldownRemainingMs: nextCooldown,
      },
      changed: false,
    };
  }

  // Determine observed possessing team and confirmation weight:
  // - Direct ball control confirms quickly (1.0x -> 150ms)
  // - Loose/in-flight ball preserves current mode when last touch belongs to current team,
  //   and confirms slower (0.55x -> ~275ms) when opposite team chains passes or clears cleanly.
  const observedTeam: TeamSide | null = input.ballOwnerTeam ?? input.lastTouchTeam;
  if (observedTeam === null) {
    return {
      state: {
        mode: prev.mode,
        pendingMode: null,
        pendingElapsedMs: 0,
        cooldownRemainingMs: nextCooldown,
      },
      changed: false,
    };
  }

  const desiredMode: ControlPadMode =
    observedTeam === input.localTeam ? 'ATTACK' : 'DEFENSE';

  if (desiredMode === prev.mode) {
    return {
      state: {
        mode: prev.mode,
        pendingMode: null,
        pendingElapsedMs: 0,
        cooldownRemainingMs: nextCooldown,
      },
      changed: false,
    };
  }

  // During switch cooldown, avoid rapid back-and-forth toggling in contested duels.
  if (nextCooldown > 0) {
    return {
      state: {
        mode: prev.mode,
        pendingMode: desiredMode,
        pendingElapsedMs: 0,
        cooldownRemainingMs: nextCooldown,
      },
      changed: false,
    };
  }

  const weight = input.ballOwnerTeam !== null ? 1 : CONTROL_MODE_INFLIGHT_WEIGHT;
  const weightedDtMs = safeDtMs * weight;
  const accumulatedMs =
    prev.pendingMode === desiredMode ? prev.pendingElapsedMs + weightedDtMs : weightedDtMs;

  if (accumulatedMs >= confirmWindowMs) {
    return {
      state: {
        mode: desiredMode,
        pendingMode: null,
        pendingElapsedMs: 0,
        cooldownRemainingMs: cooldownMs,
      },
      changed: true,
    };
  }

  return {
    state: {
      mode: prev.mode,
      pendingMode: desiredMode,
      pendingElapsedMs: accumulatedMs,
      cooldownRemainingMs: 0,
    },
    changed: false,
  };
}
