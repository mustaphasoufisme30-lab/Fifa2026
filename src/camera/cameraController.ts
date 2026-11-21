import * as THREE from 'three';
import { CameraMode, GameShellState, Vec3 } from '../core/types';

export interface CameraDynamicContext {
  ballVelocity?: Vec3 | null;
  scorerPos?: Vec3 | null;
  isReplaying?: boolean;
}

const MIN_BROADCAST_HEIGHT = 5.8;
const MIN_PLAYER_HEIGHT = 4.6;

export class CameraController {
  private readonly currentPos = new THREE.Vector3(0, 16.4, 22.6);
  private readonly currentLook = new THREE.Vector3(0, 0.35, 0.15);
  private readonly targetPos = new THREE.Vector3();
  private readonly targetLook = new THREE.Vector3();
  private readonly prevFocus = new THREE.Vector3(0, 0, 0);
  private readonly leadOffset = new THREE.Vector3(0, 0, 0);
  private hasPrevFocus = false;
  private trauma = 0;
  private flyoverAngle = 0;
  private replayOrbitAngle = 0;

  // Smoothly damped broadcast framing scalars (zero GC allocations)
  private dangerZoom = 0;
  private spreadPullback = 0;
  private lastEffectiveMode: CameraMode = 'tv';
  private modeTransitionTimer = 0;

  public addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  public snapToGameplay(ballPos: Vec3, mode: CameraMode): void {
    this.hasPrevFocus = false;
    this.leadOffset.set(0, 0, 0);
    this.dangerZoom = 0;
    this.spreadPullback = 0;
    this.modeTransitionTimer = 0;
    this.lastEffectiveMode = mode;
    this.computeGameplayTargets(ballPos, null, mode, 0, false, undefined);
    this.currentPos.copy(this.targetPos);
    this.currentLook.copy(this.targetLook);
  }

  private getTargetFov(
    shellState: GameShellState,
    mode: CameraMode,
    isGoalCelebration: boolean,
    isReplaying: boolean,
  ): number {
    if (shellState === 'title' || shellState === 'tournament') return 45;
    if (isGoalCelebration) {
      return isReplaying ? 43 : 37.5;
    }
    if (mode === 'tv') {
      // Subtle FOV tightening in dangerous box moments & slight widening during long switches
      return THREE.MathUtils.clamp(
        42 - this.dangerZoom * 2.1 + this.spreadPullback * 1.4,
        39.5,
        44.0,
      );
    }
    if (mode === 'close') {
      return THREE.MathUtils.clamp(39.6 - this.dangerZoom * 1.2, 38.2, 40.5);
    }
    if (mode === 'player') return 49;
    return 44;
  }

  private computeGameplayTargets(
    ballPos: Vec3,
    controlledPos: Vec3 | null,
    mode: CameraMode,
    dt: number,
    isGoalCelebration: boolean,
    context?: CameraDynamicContext,
  ): void {
    const isReplaying = Boolean(context?.isReplaying);

    // Goal TV broadcast presentation: smooth progressive recenter & zoom on goal scorer before replay
    if (isGoalCelebration && !isReplaying) {
      const hero = context?.scorerPos ?? ballPos;
      const sideSign = hero.x >= 0 ? -1 : 1;
      const clampedX = THREE.MathUtils.clamp(hero.x + sideSign * 3.8, -46, 46);
      const clampedZ = THREE.MathUtils.clamp(hero.z * 0.65, -18, 18);
      this.targetPos.set(clampedX, 9.6, clampedZ + 14.6);
      this.targetLook.set(
        THREE.MathUtils.clamp(hero.x * 0.8 + ballPos.x * 0.2, -52, 52),
        1.15,
        THREE.MathUtils.clamp(hero.z * 0.8 + ballPos.z * 0.2, -32, 32),
      );
      return;
    }

    // Weight focus more strongly on ball while keeping controlled player comfortably in frame
    const focusX = controlledPos ? ballPos.x * 0.68 + controlledPos.x * 0.32 : ballPos.x;
    const focusZ = controlledPos ? ballPos.z * 0.68 + controlledPos.z * 0.32 : ballPos.z;

    // Smooth horizontal & depth anticipation ahead of play (uses ball velocity when available to avoid frame jitter)
    if (dt > 0.0001) {
      let vx = 0;
      let vz = 0;
      if (context?.ballVelocity) {
        vx = THREE.MathUtils.clamp(context.ballVelocity.x * 0.72, -16, 16);
        vz = THREE.MathUtils.clamp(context.ballVelocity.z * 0.65, -10, 10);
      } else if (this.hasPrevFocus) {
        vx = THREE.MathUtils.clamp((focusX - this.prevFocus.x) / dt, -14, 14);
        vz = THREE.MathUtils.clamp((focusZ - this.prevFocus.z) / dt, -10, 10);
      }
      const desiredLeadX = THREE.MathUtils.clamp(vx * 0.28, -4.4, 4.4);
      const desiredLeadZ = THREE.MathUtils.clamp(vz * 0.14, -1.8, 1.8);
      this.leadOffset.x = THREE.MathUtils.damp(this.leadOffset.x, desiredLeadX, 3.0, dt);
      this.leadOffset.z = THREE.MathUtils.damp(this.leadOffset.z, desiredLeadZ, 3.0, dt);

      // Compute dynamic TV broadcast scalars:
      // 1) Danger-zone zoom when ball approaches either penalty area (|x| in 30..48m)
      const absBallX = Math.abs(ballPos.x);
      const boxZFactor = 1 - THREE.MathUtils.clamp((Math.abs(ballPos.z) - 14) / 20, 0, 0.55);
      const rawDanger =
        THREE.MathUtils.clamp((absBallX - 30) / 18, 0, 1) * boxZFactor;
      this.dangerZoom = THREE.MathUtils.damp(this.dangerZoom, rawDanger, 2.2, dt);

      // 2) Automatic pullback when ball & controlled player are spread apart or ball is traveling fast
      const spreadDist = controlledPos
        ? Math.hypot(ballPos.x - controlledPos.x, ballPos.z - controlledPos.z)
        : 0;
      const ballSpeed = context?.ballVelocity
        ? Math.hypot(context.ballVelocity.x, context.ballVelocity.z)
        : 0;
      const rawPullback = THREE.MathUtils.clamp(
        Math.max((spreadDist - 9.5) / 16.0, (ballSpeed - 15.0) / 18.0),
        0,
        1,
      );
      this.spreadPullback = THREE.MathUtils.damp(this.spreadPullback, rawPullback, 2.4, dt);
    }
    this.prevFocus.set(focusX, 0, focusZ);
    this.hasPrevFocus = true;

    if (mode === 'tv') {
      // Dynamic Broadcast Mobile TV framing: preserves Stage 1 base height/distance while adapting softly to zones & spread
      const zonePullX = THREE.MathUtils.clamp(ballPos.x * 0.12, -3.5, 3.5);
      const clampedX = THREE.MathUtils.clamp(
        focusX * 0.87 + this.leadOffset.x + zonePullX * 0.35,
        -41.5,
        41.5,
      );
      const clampedZ = THREE.MathUtils.clamp(
        focusZ * 0.58 + this.leadOffset.z * 0.6,
        -13.2,
        17.2,
      );

      // Keep ball safely inside comfortable screen zone even near touchlines/wings
      const height = THREE.MathUtils.clamp(
        16.4 - this.dangerZoom * 1.35 + this.spreadPullback * 2.1,
        14.8,
        18.8,
      );
      const zDist = THREE.MathUtils.clamp(
        22.6 - this.dangerZoom * 1.8 + this.spreadPullback * 2.7,
        20.4,
        25.8,
      );

      this.targetPos.set(clampedX, Math.max(MIN_BROADCAST_HEIGHT, height), clampedZ + zDist);
      this.targetLook.set(
        THREE.MathUtils.clamp(focusX * 0.9 + this.leadOffset.x * 0.45, -45, 45),
        0.38 + this.dangerZoom * 0.14,
        THREE.MathUtils.clamp(clampedZ + 0.15 + (ballPos.z - clampedZ) * 0.2, -24, 24),
      );
    } else if (mode === 'close') {
      // Closer TV Action angle with smooth non-clipping height floor & comfortable ball centering
      const clampedX = THREE.MathUtils.clamp(focusX * 0.92 + this.leadOffset.x * 0.72, -46, 46);
      const clampedZ = THREE.MathUtils.clamp(focusZ * 0.72 + this.leadOffset.z * 0.45, -20, 21);
      const height = THREE.MathUtils.clamp(
        12.2 - this.dangerZoom * 0.8 + this.spreadPullback * 1.35,
        11.2,
        13.9,
      );
      const zDist = THREE.MathUtils.clamp(
        18.0 - this.dangerZoom * 1.1 + this.spreadPullback * 1.8,
        16.6,
        20.2,
      );
      this.targetPos.set(clampedX, Math.max(MIN_BROADCAST_HEIGHT, height), clampedZ + zDist);
      this.targetLook.set(
        THREE.MathUtils.clamp(focusX + this.leadOffset.x * 0.28, -48, 48),
        0.7,
        THREE.MathUtils.clamp(focusZ, -28, 28),
      );
    } else if (mode === 'player') {
      const anchor = controlledPos ?? ballPos;
      // Behind-the-shoulder action view looking toward +X attack direction (clamped safely above players & turf)
      this.targetPos.set(
        THREE.MathUtils.clamp(anchor.x - 10.5, -58, 52),
        Math.max(MIN_PLAYER_HEIGHT, 6.2),
        THREE.MathUtils.clamp(anchor.z + 6.5, -32, 34),
      );
      this.targetLook.set(anchor.x + 8.5, 1.1, anchor.z * 0.85);
    } else {
      // Replay / dramatic sweeping goal-side broadcast angle
      const sweepX = Math.sin(this.replayOrbitAngle) * 7.5;
      const sweepZ = Math.cos(this.replayOrbitAngle) * 14.5;
      const sideSign = ballPos.x >= 0 ? -1 : 1;
      this.targetPos.set(
        THREE.MathUtils.clamp(ballPos.x + sideSign * 11 + sweepX * 0.45, -56, 56),
        Math.max(MIN_BROADCAST_HEIGHT, 8.2 + Math.sin(this.replayOrbitAngle * 1.4) * 1.3),
        THREE.MathUtils.clamp(ballPos.z * 0.4 + sweepZ, -30, 30),
      );
      this.targetLook.set(ballPos.x, 1.0, ballPos.z);
    }
  }

  public update(
    camera: THREE.PerspectiveCamera,
    shellState: GameShellState,
    mode: CameraMode,
    ballPos: Vec3,
    controlledPos: Vec3 | null,
    isGoalCelebration: boolean,
    dt: number,
    context?: CameraDynamicContext,
  ): void {
    const isReplaying = Boolean(context?.isReplaying);
    const effectiveMode: CameraMode = isGoalCelebration ? 'replay' : mode;

    // Detect camera mode transitions (e.g. TV <-> CLOSE or live -> goal) to smooth entry/exit progressively
    if (effectiveMode !== this.lastEffectiveMode) {
      this.lastEffectiveMode = effectiveMode;
      this.modeTransitionTimer = 0.55;
    } else if (this.modeTransitionTimer > 0) {
      this.modeTransitionTimer = Math.max(0, this.modeTransitionTimer - dt);
    }

    if (shellState === 'title' || shellState === 'tournament') {
      this.flyoverAngle += dt * 0.14;
      const radiusX = 48;
      const radiusZ = 38;
      this.targetPos.set(
        Math.cos(this.flyoverAngle) * radiusX,
        24 + Math.sin(this.flyoverAngle * 1.7) * 3.5,
        Math.sin(this.flyoverAngle) * radiusZ,
      );
      this.targetLook.set(0, 1.5, 0);
    } else {
      if (effectiveMode === 'replay' && isReplaying) {
        this.replayOrbitAngle += dt * 0.52;
      }
      this.computeGameplayTargets(ballPos, controlledPos, effectiveMode, dt, isGoalCelebration, context);
    }

    // Smooth progressive entry/exit damping during mode changes, steady broadcast tracking during live play
    const isTransitioning = this.modeTransitionTimer > 0;
    const posLambda =
      shellState === 'title' || shellState === 'tournament'
        ? 3.4
        : isGoalCelebration
          ? 4.2
          : isTransitioning
            ? 4.5
            : 5.8;
    const lookLambda =
      shellState === 'title' || shellState === 'tournament'
        ? 4.0
        : isTransitioning
          ? 6.0
          : 8.2;

    this.currentPos.x = THREE.MathUtils.damp(this.currentPos.x, this.targetPos.x, posLambda, dt);
    this.currentPos.y = THREE.MathUtils.damp(this.currentPos.y, this.targetPos.y, posLambda, dt);
    this.currentPos.z = THREE.MathUtils.damp(this.currentPos.z, this.targetPos.z, posLambda, dt);

    // Enforce anti-clipping floor above turf and players across every camera mode
    const minHeight = effectiveMode === 'player' ? MIN_PLAYER_HEIGHT : MIN_BROADCAST_HEIGHT;
    if (this.currentPos.y < minHeight) {
      this.currentPos.y = minHeight;
    }

    this.currentLook.x = THREE.MathUtils.damp(this.currentLook.x, this.targetLook.x, lookLambda, dt);
    this.currentLook.y = THREE.MathUtils.damp(this.currentLook.y, this.targetLook.y, lookLambda, dt);
    this.currentLook.z = THREE.MathUtils.damp(this.currentLook.z, this.targetLook.z, lookLambda, dt);

    const targetFov = this.getTargetFov(shellState, mode, isGoalCelebration, isReplaying);
    const fovLambda = isTransitioning || isGoalCelebration ? 4.2 : 5.2;
    const nextFov = THREE.MathUtils.damp(camera.fov, targetFov, fovLambda, dt);
    if (Math.abs(nextFov - camera.fov) > 0.01) {
      camera.fov = nextFov;
      camera.updateProjectionMatrix();
    }

    camera.position.copy(this.currentPos);

    if (this.trauma > 0.001) {
      const shake = this.trauma * this.trauma * 0.42;
      camera.position.x += (Math.random() * 2 - 1) * shake;
      camera.position.y += (Math.random() * 2 - 1) * shake * 0.65;
      this.trauma = Math.max(0, this.trauma - dt * 2.5);
    }

    camera.lookAt(this.currentLook);
  }
}
