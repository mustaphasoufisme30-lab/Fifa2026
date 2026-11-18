import * as THREE from 'three';
import { CameraMode, GameShellState, Vec3 } from '../core/types';

export class CameraController {
  private readonly currentPos = new THREE.Vector3(0, 26, 36);
  private readonly currentLook = new THREE.Vector3(0, 0, 0);
  private readonly targetPos = new THREE.Vector3();
  private readonly targetLook = new THREE.Vector3();
  private trauma = 0;
  private flyoverAngle = 0;
  private replayOrbitAngle = 0;

  public addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  public snapToGameplay(ballPos: Vec3, mode: CameraMode): void {
    this.computeGameplayTargets(ballPos, null, mode);
    this.currentPos.copy(this.targetPos);
    this.currentLook.copy(this.targetLook);
  }

  private computeGameplayTargets(
    ballPos: Vec3,
    controlledPos: Vec3 | null,
    mode: CameraMode,
  ): void {
    const focusX = controlledPos ? ballPos.x * 0.65 + controlledPos.x * 0.35 : ballPos.x;
    const focusZ = controlledPos ? ballPos.z * 0.65 + controlledPos.z * 0.35 : ballPos.z;

    if (mode === 'tv') {
      // Classic broadcast TV camera angled from the southern touchline (+Z) looking across pitch
      const clampedX = THREE.MathUtils.clamp(focusX * 0.78, -36, 36);
      const clampedZ = THREE.MathUtils.clamp(focusZ * 0.45, -15, 15);
      this.targetPos.set(clampedX, 23.5, clampedZ + 34.5);
      this.targetLook.set(clampedX * 1.06, 0.5, clampedZ * 0.85);
    } else if (mode === 'close') {
      const clampedX = THREE.MathUtils.clamp(focusX * 0.9, -46, 46);
      const clampedZ = THREE.MathUtils.clamp(focusZ * 0.68, -24, 24);
      this.targetPos.set(clampedX, 13.5, clampedZ + 20.5);
      this.targetLook.set(focusX, 0.8, focusZ);
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
    if (shellState === 'title') {
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
      this.computeGameplayTargets(ballPos, controlledPos, effectiveMode);
    }

    const posLambda = shellState === 'title' ? 3.5 : isGoalCelebration ? 4.8 : 6.2;
    const lookLambda = shellState === 'title' ? 4.0 : 8.5;

    this.currentPos.x = THREE.MathUtils.damp(this.currentPos.x, this.targetPos.x, posLambda, dt);
    this.currentPos.y = THREE.MathUtils.damp(this.currentPos.y, this.targetPos.y, posLambda, dt);
    this.currentPos.z = THREE.MathUtils.damp(this.currentPos.z, this.targetPos.z, posLambda, dt);

    this.currentLook.x = THREE.MathUtils.damp(this.currentLook.x, this.targetLook.x, lookLambda, dt);
    this.currentLook.y = THREE.MathUtils.damp(this.currentLook.y, this.targetLook.y, lookLambda, dt);
    this.currentLook.z = THREE.MathUtils.damp(this.currentLook.z, this.targetLook.z, lookLambda, dt);

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
