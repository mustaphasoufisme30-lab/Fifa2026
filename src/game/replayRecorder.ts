import { BallState, PlayerState, ReplayFrame } from '../core/types';

const MAX_REPLAY_FRAMES = 108; // ~3.6 seconds at 30Hz
const SAMPLE_INTERVAL = 1 / 30;

/**
 * Rolling ring-buffer capturing live gameplay frames for slow-motion 3D goal replays.
 */
export class ReplayRecorder {
  private frames: ReplayFrame[] = [];
  private clipFrames: ReplayFrame[] = [];
  private sampleAccumulator = 0;

  public clear(): void {
    this.frames = [];
    this.clipFrames = [];
    this.sampleAccumulator = 0;
  }

  public record(ball: BallState, players: PlayerState[], dt: number): void {
    this.sampleAccumulator += dt;
    if (this.sampleAccumulator < SAMPLE_INTERVAL) return;
    this.sampleAccumulator -= SAMPLE_INTERVAL;

    this.frames.push({
      ballPos: { ...ball.position },
      ballVel: { ...ball.velocity },
      ballSpin: { ...ball.spin },
      players: players.map((p) => ({
        id: p.id,
        x: p.position.x,
        y: p.position.y,
        z: p.position.z,
        facingAngle: p.facingAngle,
        actionState: p.actionState,
        diveDir: p.diveDir,
        animPhase: p.animPhase,
      })),
    });

    if (this.frames.length > MAX_REPLAY_FRAMES) {
      this.frames.shift();
    }
  }

  public freezeClip(): void {
    this.clipFrames = this.frames.map((f) => ({
      ballPos: { ...f.ballPos },
      ballVel: { ...f.ballVel },
      ballSpin: { ...f.ballSpin },
      players: f.players.map((p) => ({ ...p })),
    }));
  }

  public getClipLength(): number {
    return this.clipFrames.length;
  }

  /**
   * Samples an interpolated frame along the frozen goal clip at progress [0..1].
   */
  public sampleAtProgress(progress: number): ReplayFrame | null {
    const len = this.clipFrames.length;
    if (len === 0) return null;
    if (len === 1) return this.clipFrames[0];

    const clamped = Math.max(0, Math.min(1, progress));
    const exactIndex = clamped * (len - 1);
    const idx0 = Math.floor(exactIndex);
    const idx1 = Math.min(len - 1, idx0 + 1);
    const alpha = exactIndex - idx0;

    const f0 = this.clipFrames[idx0];
    const f1 = this.clipFrames[idx1];

    return {
      ballPos: {
        x: f0.ballPos.x + (f1.ballPos.x - f0.ballPos.x) * alpha,
        y: f0.ballPos.y + (f1.ballPos.y - f0.ballPos.y) * alpha,
        z: f0.ballPos.z + (f1.ballPos.z - f0.ballPos.z) * alpha,
      },
      ballVel: {
        x: f0.ballVel.x + (f1.ballVel.x - f0.ballVel.x) * alpha,
        y: f0.ballVel.y + (f1.ballVel.y - f0.ballVel.y) * alpha,
        z: f0.ballVel.z + (f1.ballVel.z - f0.ballVel.z) * alpha,
      },
      ballSpin: { ...f0.ballSpin },
      players: f0.players.map((p0, i) => {
        const p1 = f1.players[i] ?? p0;
        return {
          id: p0.id,
          x: p0.x + (p1.x - p0.x) * alpha,
          y: p0.y + (p1.y - p0.y) * alpha,
          z: p0.z + (p1.z - p0.z) * alpha,
          facingAngle: lerpAngleShort(p0.facingAngle, p1.facingAngle, alpha),
          actionState: alpha < 0.5 ? p0.actionState : p1.actionState,
          diveDir: alpha < 0.5 ? p0.diveDir : p1.diveDir,
          animPhase: p0.animPhase + (p1.animPhase - p0.animPhase) * alpha,
        };
      }),
    };
  }
}

function lerpAngleShort(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff < -Math.PI) diff += Math.PI * 2;
  while (diff > Math.PI) diff -= Math.PI * 2;
  return a + diff * t;
}
