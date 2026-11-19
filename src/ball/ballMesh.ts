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

interface TrailNode {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  age: number;
  maxAge: number;
  active: boolean;
}

const TRAIL_POOL_SIZE = 10;

export class BallVisual {
  public readonly group: THREE.Group;
  public readonly sphere: THREE.Mesh;
  public readonly shadowDisc: THREE.Mesh;

  private readonly albedoTex: THREE.CanvasTexture;
  private readonly shadowTex: THREE.CanvasTexture;
  private readonly trailGeo: THREE.SphereGeometry;
  private readonly trailNodes: TrailNode[] = [];
  private trailCursor = 0;
  private trailSpawnAccum = 0;

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

    // Pre-allocated zero-GC trail pool for power shots and fast driven passes
    this.trailGeo = new THREE.SphereGeometry(BALL_RADIUS * 0.72, 8, 6);
    for (let i = 0; i < TRAIL_POOL_SIZE; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xe0f2fe,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.trailGeo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.trailNodes.push({ mesh, mat, age: 0, maxAge: 0.24, active: false });
    }
  }

  public sync(ball: BallState, dt: number): void {
    this.sphere.position.set(ball.position.x, ball.position.y, ball.position.z);

    // Visual rolling rotation based on ground velocity + aerial spin
    const groundSpeed = Math.hypot(ball.velocity.x, ball.velocity.z);
    const totalSpeed = Math.hypot(ball.velocity.x, ball.velocity.y, ball.velocity.z);
    if (groundSpeed > 0.05) {
      this.sphere.rotation.z -= (ball.velocity.x * dt) / BALL_RADIUS;
      this.sphere.rotation.x += (ball.velocity.z * dt) / BALL_RADIUS;
    }
    if (Math.abs(ball.spin.y) > 0.1) {
      this.sphere.rotation.y += ball.spin.y * dt * 0.65;
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

    // Spawn sleek trail nodes only during fast kicks/shots (> 15.5 m/s)
    this.trailSpawnAccum += dt;
    if (ball.ownerId === null && totalSpeed > 15.5 && this.trailSpawnAccum >= 0.026) {
      this.trailSpawnAccum = 0;
      const node = this.trailNodes[this.trailCursor];
      this.trailCursor = (this.trailCursor + 1) % TRAIL_POOL_SIZE;
      node.active = true;
      node.age = 0;
      node.maxAge = totalSpeed > 23 ? 0.28 : 0.2;
      node.mesh.visible = true;
      node.mesh.position.set(ball.position.x, ball.position.y, ball.position.z);
      node.mesh.scale.setScalar(totalSpeed > 23 ? 0.95 : 0.72);
      node.mat.color.setHex(totalSpeed > 23 ? 0xfbbf24 : 0xbae6fd);
      node.mat.opacity = totalSpeed > 23 ? 0.42 : 0.26;
    }

    for (let i = 0; i < TRAIL_POOL_SIZE; i++) {
      const node = this.trailNodes[i];
      if (!node.active) continue;
      node.age += dt;
      if (node.age >= node.maxAge) {
        node.active = false;
        node.mesh.visible = false;
        node.mat.opacity = 0;
        continue;
      }
      const life = 1 - node.age / node.maxAge;
      node.mesh.scale.setScalar(Math.max(0.15, life * 0.85));
      node.mat.opacity = life * 0.34;
    }
  }

  public dispose(): void {
    this.sphere.geometry.dispose();
    (this.sphere.material as THREE.Material).dispose();
    this.shadowDisc.geometry.dispose();
    (this.shadowDisc.material as THREE.Material).dispose();
    this.trailGeo.dispose();
    for (const node of this.trailNodes) {
      node.mat.dispose();
    }
    this.albedoTex.dispose();
    this.shadowTex.dispose();
  }
}
