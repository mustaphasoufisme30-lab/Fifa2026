import * as THREE from 'three';
import { CameraMode, GameShellState, Vec3 } from '../core/types';

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

  public addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  public snapToGameplay(ballPos: Vec3, mode: CameraMode): void {
    this.hasPrevFocus = false;
    this.leadOffset.set(0, 0, 0);
    this.computeGameplayTargets(ballPos, null, mode, 0);
    this.currentPos.copy(this.targetPos);
    this.currentLook.copy(this.targetLook);
  }

  private getTargetFov(shellState: GameShellState, mode: CameraMode, isGoalCelebration: boolean): number {
    if (shellState === 'title' || shellState === 'tournament') return 45;
    const effectiveMode: CameraMode = isGoalCelebration ? 'replay' : mode;
    if (effectiveMode === 'tv') return 42;
    if (effectiveMode === 'close') return 40;
    if (effectiveMode === 'player') return 50;
    return 44;
  }

  private computeGameplayTargets(
    ballPos: Vec3,
    controlledPos: Vec3 | null,
    mode: CameraMode,
    dt: number,
  ): void {
    const focusX = controlledPos ? ballPos.x * 0.62 + controlledPos.x * 0.38 : ballPos.x;
    const focusZ = controlledPos ? ballPos.z * 0.62 + controlledPos.z * 0.38 : ballPos.z;

    // Smooth velocity-based anticipation ahead of the play
    if (dt > 0.0001 && this.hasPrevFocus) {
      const vx = THREE.MathUtils.clamp((focusX - this.prevFocus.x) / dt, -14, 14);
      const vz = THREE.MathUtils.clamp((focusZ - this.prevFocus.z) / dt, -10, 10);
      const desiredLeadX = THREE.MathUtils.clamp(vx * 0.24, -3.4, 3.4);
      const desiredLeadZ = THREE.MathUtils.clamp(vz * 0.12, -1.4, 1.4);
      this.leadOffset.x = THREE.MathUtils.damp(this.leadOffset.x, desiredLeadX, 3.2, dt);
      this.leadOffset.z = THREE.MathUtils.damp(this.leadOffset.z, desiredLeadZ, 3.2, dt);
    }
    this.prevFocus.set(focusX, 0, focusZ);
    this.hasPrevFocus = true;

    if (mode === 'tv') {
      // Broadcast Mobile / closer TV angle keeping pitch dominant and far LED boards flush near top edge
      const clampedX = THREE.MathUtils.clamp(focusX * 0.86 + this.leadOffset.x, -39, 39);
      const clampedZ = THREE.MathUtils.clamp(focusZ * 0.56 + this.leadOffset.z * 0.6, -12.0, 16.5);
      this.targetPos.set(clampedX, 16.4, clampedZ + 22.6);
      this.targetLook.set(clampedX + this.leadOffset.x * 0.25, 0.35, clampedZ + 0.15);
    } else if (mode === 'close') {
      const clampedX = THREE.MathUtils.clamp(focusX * 0.92 + this.leadOffset.x * 0.8, -46, 46);
      const clampedZ = THREE.MathUtils.clamp(focusZ * 0.72 + this.leadOffset.z * 0.5, -21, 22);
      this.targetPos.set(clampedX, 12.2, clampedZ + 18.0);
      this.targetLook.set(focusX + this.leadOffset.x * 0.3, 0.65, focusZ);
    } else if (mode === 'player') {
      const anchor = controlledPos ?? ballPos;
      // Behind-the-shoulder action view looking toward +X attack direction
      this.targetPos.set(anchor.x - 10.5, 6.2, anchor.z + 6.5);
      this.targetLook.set(anchor.x + 8.5, 1.1, anchor.z * 0.85);
    } else {
      // Replay / dramatic sweeping goal-side broadcast angle
      const sweepX = Math.sin(this.replayOrbitAngle) * 7.5;
      const sweepZ = Math.cos(this.replayOrbitAngle) * 14.5;
      const sideSign = ballPos.x >= 0 ? -1 : 1;
      this.targetPos.set(
        THREE.MathUtils.clamp(ballPos.x + sideSign * 11 + sweepX * 0.45, -56, 56),
        7.8 + Math.sin(this.replayOrbitAngle * 1.4) * 1.4,
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
  ): void {
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
      const effectiveMode: CameraMode = isGoalCelebration ? 'replay' : mode;
      if (effectiveMode === 'replay') {
        this.replayOrbitAngle += dt * 0.55;
      }
      this.computeGameplayTargets(ballPos, controlledPos, effectiveMode, dt);
    }

    const posLambda = shellState === 'title' ? 3.5 : isGoalCelebration ? 4.8 : 6.2;
    const lookLambda = shellState === 'title' ? 4.0 : 8.5;

    this.currentPos.x = THREE.MathUtils.damp(this.currentPos.x, this.targetPos.x, posLambda, dt);
    this.currentPos.y = THREE.MathUtils.damp(this.currentPos.y, this.targetPos.y, posLambda, dt);
    this.currentPos.z = THREE.MathUtils.damp(this.currentPos.z, this.targetPos.z, posLambda, dt);

    this.currentLook.x = THREE.MathUtils.damp(this.currentLook.x, this.targetLook.x, lookLambda, dt);
    this.currentLook.y = THREE.MathUtils.damp(this.currentLook.y, this.targetLook.y, lookLambda, dt);
    this.currentLook.z = THREE.MathUtils.damp(this.currentLook.z, this.targetLook.z, lookLambda, dt);

    const targetFov = this.getTargetFov(shellState, mode, isGoalCelebration);
    const nextFov = THREE.MathUtils.damp(camera.fov, targetFov, 5.5, dt);
    if (Math.abs(nextFov - camera.fov) > 0.01) {
      camera.fov = nextFov;
      camera.updateProjectionMatrix();
    }

    camera.position.copy(this.currentPos);

    if (this.trauma > 0.001) {
      const shake = this.trauma * this.trauma * 0.45;
      camera.position.x += (Math.random() * 2 - 1) * shake;
      camera.position.y += (Math.random() * 2 - 1) * shake * 0.7;
      this.trauma = Math.max(0, this.trauma - dt * 2.4);
    }

    camera.lookAt(this.currentLook);
  }
}
