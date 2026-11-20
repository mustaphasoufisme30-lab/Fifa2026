import * as THREE from 'three';
import { BALL_RADIUS } from '../core/constants';
import { BallState } from '../core/types';

// Exact 12 vertices of a unit icosahedron (centers of the 12 classic black pentagon panels)
const PHI = (1 + Math.sqrt(5)) / 2;
const ICOS_LEN = Math.hypot(1, PHI);
const PENTAGON_CENTERS: ReadonlyArray<[number, number, number]> = [
  [0, 1, PHI],
  [0, -1, PHI],
  [0, 1, -PHI],
  [0, -1, -PHI],
  [1, PHI, 0],
  [-1, PHI, 0],
  [1, -PHI, 0],
  [-1, -PHI, 0],
  [PHI, 0, 1],
  [-PHI, 0, 1],
  [PHI, 0, -1],
  [-PHI, 0, -1],
].map(([x, y, z]) => [x / ICOS_LEN, y / ICOS_LEN, z / ICOS_LEN] as [number, number, number]);

interface BallTextures {
  albedo: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
}

/**
 * Generates distortion-free 3D-projected classic Telstar/pro match-ball albedo + seam bump maps.
 * Sampling exact 3D unit-sphere normals guarantees crisp pentagons & hexagons with zero polar pinching.
 */
function createFootballTextures(): BallTextures {
  const w = 512;
  const h = 256;

  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = w;
  albedoCanvas.height = h;
  const aCtx = albedoCanvas.getContext('2d')!;
  const aImg = aCtx.createImageData(w, h);
  const aData = aImg.data;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = w;
  bumpCanvas.height = h;
  const bCtx = bumpCanvas.getContext('2d')!;
  const bImg = bCtx.createImageData(w, h);
  const bData = bImg.data;

  // Threshold cosine of angle from pentagon center (~22.6 deg for classic truncated icosahedron)
  const pentThreshold = 0.922;
  const pentSeamOuter = 0.912;

  for (let py = 0; py < h; py++) {
    const v = (py + 0.5) / h;
    const theta = v * Math.PI;
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);

    for (let px = 0; px < w; px++) {
      const u = (px + 0.5) / w;
      const phi = u * Math.PI * 2;
      const nx = -sinTheta * Math.cos(phi);
      const ny = cosTheta;
      const nz = sinTheta * Math.sin(phi);

      // Find nearest & second-nearest icosahedron vertex (Voronoi cell = pentagon/hexagons)
      let d1 = -2;
      let d2 = -2;
      for (let i = 0; i < 12; i++) {
        const c = PENTAGON_CENTERS[i];
        const dot = nx * c[0] + ny * c[1] + nz * c[2];
        if (dot > d1) {
          d2 = d1;
          d1 = dot;
        } else if (dot > d2) {
          d2 = dot;
        }
      }

      const hexSeamGap = d1 - d2;
      const isPentagon = d1 >= pentThreshold;
      const isPentSeam = d1 >= pentSeamOuter && d1 < pentThreshold;
      const isHexSeam = !isPentagon && hexSeamGap < 0.022;

      // Subtle deterministic synthetic leather micro-pebble grain
      const pebble = ((px * 37 + py * 73) & 15) - 7;

      let r: number;
      let g: number;
      let b: number;
      let bumpVal: number;

      if (isPentagon) {
        // Deep charcoal-black panel with subtle glossy center highlight
        const centerLift = Math.max(0, (d1 - pentThreshold) * 180);
        r = Math.min(48, 22 + centerLift + pebble * 0.4);
        g = Math.min(54, 26 + centerLift + pebble * 0.4);
        b = Math.min(64, 34 + centerLift + pebble * 0.4);
        bumpVal = 165 + pebble * 2;
      } else if (isPentSeam || isHexSeam) {
        // Stitched recessed panel seam
        r = 162;
        g = 168;
        b = 176;
        bumpVal = 45;
      } else {
        // Crisp modern match-ball white panel with delicate seam bevel shading
        const edgeShade = hexSeamGap < 0.055 ? (hexSeamGap - 0.022) / 0.033 : 1;
        const base = 236 + edgeShade * 14 + pebble * 0.35;
        r = Math.min(252, base);
        g = Math.min(253, base + 1);
        b = Math.min(255, base + 3);
        bumpVal = 195 + pebble * 2;
      }

      const idx = (py * w + px) * 4;
      aData[idx] = r;
      aData[idx + 1] = g;
      aData[idx + 2] = b;
      aData[idx + 3] = 255;

      const clampedBump = Math.max(0, Math.min(255, bumpVal));
      bData[idx] = clampedBump;
      bData[idx + 1] = clampedBump;
      bData[idx + 2] = clampedBump;
      bData[idx + 3] = 255;
    }
  }

  aCtx.putImageData(aImg, 0, 0);
  bCtx.putImageData(bImg, 0, 0);

  const albedo = new THREE.CanvasTexture(albedoCanvas);
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.wrapS = THREE.RepeatWrapping;
  albedo.wrapT = THREE.ClampToEdgeWrapping;

  const bump = new THREE.CanvasTexture(bumpCanvas);
  bump.wrapS = THREE.RepeatWrapping;
  bump.wrapT = THREE.ClampToEdgeWrapping;

  return { albedo, bump };
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 58);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.56)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.24)');
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

const TRAIL_POOL_SIZE = 8;

// Pre-allocated scratch math helpers (zero GC allocations inside requestAnimationFrame)
const _rollAxis = new THREE.Vector3();
const _spinAxis = new THREE.Vector3(0, 1, 0);
const _deltaQuat = new THREE.Quaternion();

export class BallVisual {
  public readonly group: THREE.Group;
  public readonly sphere: THREE.Mesh;
  public readonly shadowDisc: THREE.Mesh;

  private readonly albedoTex: THREE.CanvasTexture;
  private readonly bumpTex: THREE.CanvasTexture;
  private readonly shadowTex: THREE.CanvasTexture;
  private readonly trailGeo: THREE.SphereGeometry;
  private readonly trailNodes: TrailNode[] = [];
  private trailCursor = 0;
  private trailSpawnAccum = 0;
  private prevX = 0;
  private prevZ = 0;
  private hasPrevPos = false;

  constructor(maxAnisotropy: number) {
    this.group = new THREE.Group();

    const { albedo, bump } = createFootballTextures();
    this.albedoTex = albedo;
    this.bumpTex = bump;
    this.albedoTex.anisotropy = maxAnisotropy;
    this.bumpTex.anisotropy = Math.min(4, maxAnisotropy);

    // Smooth spherical 3D football with stitched panel bump relief
    const ballGeo = new THREE.SphereGeometry(BALL_RADIUS, 28, 20);
    const ballMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.albedoTex,
      bumpMap: this.bumpTex,
      bumpScale: 0.008,
      roughness: 0.36,
      metalness: 0.04,
    });
    this.sphere = new THREE.Mesh(ballGeo, ballMat);
    this.sphere.castShadow = true;
    this.sphere.receiveShadow = false;
    this.group.add(this.sphere);

    this.shadowTex = createContactShadowTexture();
    const shadowGeo = new THREE.CircleGeometry(BALL_RADIUS * 1.55, 20);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: this.shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.72,
    });
    this.shadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadowDisc.rotation.x = -Math.PI / 2;
    this.shadowDisc.position.y = 0.018;
    this.group.add(this.shadowDisc);

    // Pre-allocated zero-GC trail pool for power shots (> 18 m/s)
    this.trailGeo = new THREE.SphereGeometry(BALL_RADIUS * 0.65, 8, 6);
    for (let i = 0; i < TRAIL_POOL_SIZE; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.trailGeo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.trailNodes.push({ mesh, mat, age: 0, maxAge: 0.2, active: false });
    }
  }

  public sync(ball: BallState, dt: number): void {
    this.sphere.position.set(ball.position.x, ball.position.y, ball.position.z);

    // Compute real rolling displacement (handles both free physics flight AND dribbler foot-roll)
    let moveDx = ball.velocity.x * dt;
    let moveDz = ball.velocity.z * dt;
    if (this.hasPrevPos && ball.ownerId !== null) {
      moveDx = ball.position.x - this.prevX;
      moveDz = ball.position.z - this.prevZ;
    }
    this.prevX = ball.position.x;
    this.prevZ = ball.position.z;
    this.hasPrevPos = true;

    const travelDist = Math.hypot(moveDx, moveDz);
    if (travelDist > 0.0008 && travelDist < 6.0) {
      // Exact gimbal-lock-free quaternion roll perpendicular to direction of travel
      _rollAxis.set(moveDz / travelDist, 0, -moveDx / travelDist);
      const rollAngle = travelDist / BALL_RADIUS;
      _deltaQuat.setFromAxisAngle(_rollAxis, rollAngle);
      this.sphere.quaternion.premultiply(_deltaQuat);
    }

    // Authentic side-spin / curl rotation in flight
    if (Math.abs(ball.spin.y) > 0.1 && dt > 0) {
      _deltaQuat.setFromAxisAngle(_spinAxis, ball.spin.y * dt * 0.72);
      this.sphere.quaternion.premultiply(_deltaQuat);
    }

    // Ground contact shadow stays directly underneath the ball on the turf
    this.shadowDisc.position.set(ball.position.x, 0.018, ball.position.z);
    const heightAboveTurf = Math.max(0, ball.position.y - BALL_RADIUS);
    const scale = Math.max(0.45, 1 - heightAboveTurf * 0.14);
    this.shadowDisc.scale.setScalar(scale);
    (this.shadowDisc.material as THREE.MeshBasicMaterial).opacity = Math.max(
      0.16,
      0.72 - heightAboveTurf * 0.15,
    );

    // Subtle speed streak only on powerful driven shots (> 18 m/s)
    const totalSpeed = Math.hypot(ball.velocity.x, ball.velocity.y, ball.velocity.z);
    this.trailSpawnAccum += dt;
    if (ball.ownerId === null && totalSpeed > 18.0 && this.trailSpawnAccum >= 0.028) {
      this.trailSpawnAccum = 0;
      const node = this.trailNodes[this.trailCursor];
      this.trailCursor = (this.trailCursor + 1) % TRAIL_POOL_SIZE;
      node.active = true;
      node.age = 0;
      node.maxAge = totalSpeed > 24 ? 0.22 : 0.16;
      node.mesh.visible = true;
      node.mesh.position.set(ball.position.x, ball.position.y, ball.position.z);
      node.mesh.scale.setScalar(totalSpeed > 24 ? 0.86 : 0.65);
      node.mat.color.setHex(totalSpeed > 24 ? 0xfef3c7 : 0xe2e8f0);
      node.mat.opacity = totalSpeed > 24 ? 0.34 : 0.2;
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
      node.mesh.scale.setScalar(Math.max(0.15, life * 0.78));
      node.mat.opacity = life * 0.28;
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
    this.bumpTex.dispose();
    this.shadowTex.dispose();
  }
}
