import * as THREE from 'three';
import { BALL_RADIUS } from '../core/constants';
import { BallState } from '../core/types';

function createFootballAlbedoTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Clean off-white synthetic leather base
  ctx.fillStyle = '#f4f6f8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Subtle seam grid & original geometric pentagon/hex panel motifs
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 3;

  const cols = 6;
  const rows = 3;
  const cellW = canvas.width / cols;
  const cellH = canvas.height / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = (c + 0.5) * cellW + (r % 2 === 1 ? cellW * 0.5 : 0);
      const cy = (r + 0.5) * cellH;

      // Dark navy/emerald original match-ball graphic panels
      ctx.fillStyle = (c + r) % 2 === 0 ? '#0f172a' : '#0284c7';
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        const px = cx + Math.cos(a) * 20;
        const py = cy + Math.sin(a) * 20;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();

      // Panel seam lines radiating out
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * 20, cy + Math.sin(a) * 20);
        ctx.lineTo(cx + Math.cos(a) * 44, cy + Math.sin(a) * 44);
        ctx.stroke();
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.58)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.25)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

export class BallVisual {
  public readonly group: THREE.Group;
  public readonly sphere: THREE.Mesh;
  public readonly shadowDisc: THREE.Mesh;

  private readonly albedoTex: THREE.CanvasTexture;
  private readonly shadowTex: THREE.CanvasTexture;

  constructor(maxAnisotropy: number) {
    this.group = new THREE.Group();

    this.albedoTex = createFootballAlbedoTexture();
    this.albedoTex.anisotropy = maxAnisotropy;

    const ballGeo = new THREE.SphereGeometry(BALL_RADIUS, 24, 18);
    const ballMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.albedoTex,
      roughness: 0.35,
      metalness: 0.05,
    });
    this.sphere = new THREE.Mesh(ballGeo, ballMat);
    this.sphere.castShadow = true;
    this.sphere.receiveShadow = false;
    this.group.add(this.sphere);

    this.shadowTex = createContactShadowTexture();
    const shadowGeo = new THREE.CircleGeometry(BALL_RADIUS * 1.65, 20);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: this.shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.75,
    });
    this.shadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadowDisc.rotation.x = -Math.PI / 2;
    this.shadowDisc.position.y = 0.018;
    this.group.add(this.shadowDisc);
  }

  public sync(ball: BallState, dt: number): void {
    this.sphere.position.set(ball.position.x, ball.position.y, ball.position.z);

    // Visual rolling rotation based on ground velocity
    const speed = Math.hypot(ball.velocity.x, ball.velocity.z);
    if (speed > 0.05) {
      this.sphere.rotation.z -= (ball.velocity.x * dt) / BALL_RADIUS;
      this.sphere.rotation.x += (ball.velocity.z * dt) / BALL_RADIUS;
    }

    // Ground contact shadow stays directly underneath the ball on the turf
    this.shadowDisc.position.set(ball.position.x, 0.018, ball.position.z);
    const heightAboveTurf = Math.max(0, ball.position.y - BALL_RADIUS);
    const scale = Math.max(0.45, 1 - heightAboveTurf * 0.14);
    this.shadowDisc.scale.setScalar(scale);
    (this.shadowDisc.material as THREE.MeshBasicMaterial).opacity = Math.max(
      0.18,
      0.78 - heightAboveTurf * 0.16,
    );
  }

  public dispose(): void {
    this.sphere.geometry.dispose();
    (this.sphere.material as THREE.Material).dispose();
    this.shadowDisc.geometry.dispose();
    (this.shadowDisc.material as THREE.Material).dispose();
    this.albedoTex.dispose();
    this.shadowTex.dispose();
  }
}
