import { InputSnapshot } from '../core/types';

export class InputManager {
  private keys = new Set<string>();
  private touchMoveX = 0;
  private touchMoveZ = 0;
  private touchSprint = false;
  private touchShootHeld = false;

  private pendingPass = false;
  private pendingLob = false;
  private pendingShootTap = false;
  private pendingShootRelease = false;
  private pendingTackle = false;
  private pendingSwitch = false;

  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundKeyUp: (e: KeyboardEvent) => void;
  private boundBlur: () => void;
  private boundVisibility: () => void;

  public onPauseToggle?: () => void;
  public onCameraCycle?: () => void;
  public onMuteToggle?: () => void;

  constructor() {
    this.boundKeyDown = this.handleKeyDown.bind(this);
    this.boundKeyUp = this.handleKeyUp.bind(this);
    this.boundBlur = this.clearAll.bind(this);
    this.boundVisibility = () => {
      if (document.hidden) this.clearAll();
    };
  }

  public attach(): void {
    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('keyup', this.boundKeyUp);
    window.addEventListener('blur', this.boundBlur);
    document.addEventListener('visibilitychange', this.boundVisibility);
  }

  public detach(): void {
    window.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('keyup', this.boundKeyUp);
    window.removeEventListener('blur', this.boundBlur);
    document.removeEventListener('visibilitychange', this.boundVisibility);
  }

  public clearAll(): void {
    this.keys.clear();
    this.touchMoveX = 0;
    this.touchMoveZ = 0;
    this.touchSprint = false;
    this.touchShootHeld = false;
    this.pendingPass = false;
    this.pendingLob = false;
    this.pendingShootTap = false;
    this.pendingShootRelease = false;
    this.pendingTackle = false;
    this.pendingSwitch = false;
  }

  public setTouchJoystick(x: number, z: number): void {
    this.touchMoveX = Math.max(-1, Math.min(1, x));
    this.touchMoveZ = Math.max(-1, Math.min(1, z));
  }

  public setTouchSprint(active: boolean): void {
    this.touchSprint = active;
  }

  public setTouchShootHeld(held: boolean): void {
    if (held && !this.touchShootHeld) {
      this.touchShootHeld = true;
    } else if (!held && this.touchShootHeld) {
      this.touchShootHeld = false;
      this.pendingShootRelease = true;
    }
  }

  public triggerPass(): void {
    this.pendingPass = true;
  }

  public triggerLob(): void {
    this.pendingLob = true;
  }

  public triggerShoot(): void {
    this.pendingShootTap = true;
  }

  public triggerTackle(): void {
    this.pendingTackle = true;
  }

  public triggerSwitch(): void {
    this.pendingSwitch = true;
  }

  public consumeSnapshot(): InputSnapshot {
    let kx = 0;
    let kz = 0;

    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) kx += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) kx -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) kz += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) kz -= 1;

    if (kx !== 0 && kz !== 0) {
      const inv = 1 / Math.SQRT2;
      kx *= inv;
      kz *= inv;
    }

    const moveX = Math.abs(this.touchMoveX) > 0.05 ? this.touchMoveX : kx;
    const moveZ = Math.abs(this.touchMoveZ) > 0.05 ? this.touchMoveZ : kz;
    const sprint =
      this.touchSprint ||
      this.keys.has('ShiftLeft') ||
      this.keys.has('ShiftRight');

    const shootHeld =
      this.touchShootHeld ||
      this.keys.has('Space') ||
      this.keys.has('KeyJ');

    const shootReleased = this.pendingShootRelease;
    const shootPressed = this.pendingShootTap || shootReleased;

    const snapshot: InputSnapshot = {
      moveX,
      moveZ,
      sprint,
      passPressed: this.pendingPass,
      lobPressed: this.pendingLob,
      shootHeld,
      shootReleased,
      shootPressed,
      tacklePressed: this.pendingTackle,
      switchPressed: this.pendingSwitch,
    };

    this.pendingPass = false;
    this.pendingLob = false;
    this.pendingShootTap = false;
    this.pendingShootRelease = false;
    this.pendingTackle = false;
    this.pendingSwitch = false;

    return snapshot;
  }

  private handleKeyDown(e: KeyboardEvent): void {
    const state = document.body.dataset.state;
    const isPauseKey =
      e.code === 'Escape' ||
      e.code === 'KeyP' ||
      e.key === 'Escape' ||
      e.key === 'p' ||
      e.key === 'P';

    if (isPauseKey && !e.repeat && (state === 'playing' || state === 'paused')) {
      e.preventDefault();
      this.onPauseToggle?.();
      return;
    }

    if (state !== 'playing') return;

    if (
      e.code === 'ArrowUp' ||
      e.code === 'ArrowDown' ||
      e.code === 'ArrowLeft' ||
      e.code === 'ArrowRight' ||
      e.code === 'Space' ||
      e.code === 'Tab'
    ) {
      e.preventDefault();
    }

    if (!e.repeat) {
      if (e.code === 'KeyK' || e.code === 'KeyX') this.pendingPass = true;
      else if (e.code === 'KeyL' || e.code === 'KeyE') this.pendingLob = true;
      else if (e.code === 'KeyT' || e.code === 'KeyF') this.pendingTackle = true;
      else if (e.code === 'KeyQ' || e.code === 'Tab') this.pendingSwitch = true;
      else if (e.code === 'KeyC') this.onCameraCycle?.();
      else if (e.code === 'KeyM') this.onMuteToggle?.();
    }

    this.keys.add(e.code);
  }

  private handleKeyUp(e: KeyboardEvent): void {
    if (this.keys.has(e.code) && (e.code === 'Space' || e.code === 'KeyJ')) {
      if (document.body.dataset.state === 'playing') {
        this.pendingShootRelease = true;
      }
    }
    this.keys.delete(e.code);
  }
}
