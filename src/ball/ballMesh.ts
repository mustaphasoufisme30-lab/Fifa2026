import * as THREE from 'three';
import { BALL_RADIUS } from '../core/constants';
import { BallState, PlayerState } from '../core/types';

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

interface BurstShard {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  maxAge: number;
  active: boolean;
}

const TRAIL_POOL_SIZE = 8;
const BURST_POOL_SIZE = 4;

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
  private readonly burstGeo: THREE.BoxGeometry;
  private readonly burstShards: BurstShard[] = [];
  private readonly kickRingMesh: THREE.Mesh;
  private readonly kickRingMat: THREE.MeshBasicMaterial;
  private kickRingAge = 1;
  private kickRingMaxAge = 0.22;
  private kickRingMaxScale = 2.9;
  private kickPulseAge = 1;
  private kickPulseStrength = 0;
  private wasGoalMoment = false;
  private trailCursor = 0;
  private trailSpawnAccum = 0;
  private prevX = 0;
  private prevZ = 0;
  private hasPrevPos = false;
  private prevOwnerId: string | null = null;
  private dribbleOffsetX = 0;
  private dribbleOffsetZ = 0;

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

    // Pre-allocated zero-GC contact ring shown briefly when a pass or shot is struck
    const kickRingGeo = new THREE.RingGeometry(BALL_RADIUS * 0.7, BALL_RADIUS * 1.18, 20);
    this.kickRingMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.kickRingMesh = new THREE.Mesh(kickRingGeo, this.kickRingMat);
    this.kickRingMesh.rotation.x = -Math.PI / 2;
    this.kickRingMesh.position.y = 0.022;
    this.kickRingMesh.visible = false;
    this.group.add(this.kickRingMesh);

    // Pre-allocated zero-GC directional departure micro-sparks for passes & shots (4 tiny reused meshes)
    this.burstGeo = new THREE.BoxGeometry(0.055, 0.035, 0.16);
    for (let i = 0; i < BURST_POOL_SIZE; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.burstGeo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.burstShards.push({
        mesh,
        mat,
        vx: 0,
        vy: 0,
        vz: 0,
        age: 1,
        maxAge: 0.18,
        active: false,
      });
    }

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

  private spawnKickBurst(
    x: number,
    y: number,
    z: number,
    dirX: number,
    dirZ: number,
    isPowerShot: boolean,
    isShot: boolean,
  ): void {
    const baseAngle = Math.atan2(dirX, dirZ);
    const count = isPowerShot ? 4 : isShot ? 3 : 2;
    const hex = isPowerShot ? 0xfef08a : isShot ? 0xf8fafc : 0xe2e8f0;
    const speedBase = isPowerShot ? 4.8 : isShot ? 3.5 : 2.2;
    for (let i = 0; i < count; i++) {
      const shard = this.burstShards[i];
      const spread = ((i / Math.max(1, count - 1)) - 0.5) * 1.15;
      const angle = baseAngle + spread;
      shard.active = true;
      shard.age = 0;
      shard.maxAge = isPowerShot ? 0.22 : 0.16;
      shard.vx = Math.sin(angle) * speedBase;
      shard.vy = isPowerShot ? 1.5 + i * 0.22 : 0.8 + i * 0.15;
      shard.vz = Math.cos(angle) * speedBase;
      shard.mesh.visible = true;
      shard.mesh.position.set(x, Math.max(0.08, y), z);
      shard.mesh.rotation.set(0, angle, 0);
      shard.mesh.scale.set(1, 1, isPowerShot ? 1.45 : 0.95);
      shard.mat.color.setHex(hex);
      shard.mat.opacity = isPowerShot ? 0.62 : isShot ? 0.48 : 0.34;
    }
  }

  public sync(
    ball: BallState,
    dt: number,
    owner?: PlayerState | null,
    isGoalMoment = false,
  ): void {
    // Purely visual foot-cadence dribble coupling while possessed (never alters authoritative physics)
    let targetOffX = 0;
    let targetOffZ = 0;
    if (owner && ball.ownerId === owner.id) {
      const ownerSpeed = Math.hypot(owner.velocity.x, owner.velocity.z);
      if (ownerSpeed > 0.45) {
        const fwdX = Math.sin(owner.facingAngle);
        const fwdZ = Math.cos(owner.facingAngle);
        const rightX = Math.cos(owner.facingAngle);
        const rightZ = -Math.sin(owner.facingAngle);
        const speedNorm = Math.min(1, ownerSpeed / 7.2);
        const push = (0.04 + Math.max(0, Math.sin(owner.animPhase * 1.1)) * 0.13) * speedNorm;
        const sway = Math.cos(owner.animPhase * 1.1) * 0.075 * speedNorm;
        targetOffX = fwdX * push + rightX * sway;
        targetOffZ = fwdZ * push + rightZ * sway;
      }
    }
    const dampLambda = ball.ownerId !== null ? 16 : 28;
    const factor = dt > 0 ? 1 - Math.exp(-dampLambda * dt) : 1;
    this.dribbleOffsetX += (targetOffX - this.dribbleOffsetX) * factor;
    this.dribbleOffsetZ += (targetOffZ - this.dribbleOffsetZ) * factor;

    const renderX = ball.position.x + this.dribbleOffsetX;
    const renderZ = ball.position.z + this.dribbleOffsetZ;
    this.sphere.position.set(renderX, ball.position.y, renderZ);

    // Compute real rolling displacement (handles both free physics flight AND dribbler foot-roll)
    let moveDx = ball.velocity.x * dt;
    let moveDz = ball.velocity.z * dt;
    if (this.hasPrevPos && ball.ownerId !== null) {
      moveDx = renderX - this.prevX;
      moveDz = renderZ - this.prevZ;
    }
    this.prevX = renderX;
    this.prevZ = renderZ;
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

    // Trigger subtle strictly-visual reactions on pass/shot strike & goal broadcast moment
    const totalSpeed = Math.hypot(ball.velocity.x, ball.velocity.y, ball.velocity.z);
    if (this.prevOwnerId !== null && ball.ownerId === null && totalSpeed > 8.5) {
      const isPowerShot = totalSpeed > 23.5;
      const isShot = totalSpeed > 18.5;
      this.kickRingAge = 0;
      this.kickRingMaxAge = isPowerShot ? 0.26 : isShot ? 0.22 : 0.18;
      this.kickRingMaxScale = isPowerShot ? 3.5 : isShot ? 2.9 : 2.15;
      this.kickRingMesh.visible = true;
      this.kickRingMesh.position.set(ball.position.x, 0.022, ball.position.z);
      this.kickRingMat.color.setHex(isPowerShot ? 0xfef08a : isShot ? 0xf8fafc : 0xffffff);

      // Brief strictly-visual impact pulse on the sphere scale (zero physics impact)
      this.kickPulseAge = 0;
      this.kickPulseStrength = isPowerShot ? 0.15 : isShot ? 0.1 : 0.05;

      const horiz = Math.hypot(ball.velocity.x, ball.velocity.z);
      if (horiz > 0.1) {
        this.spawnKickBurst(
          ball.position.x,
          ball.position.y,
          ball.position.z,
          ball.velocity.x / horiz,
          ball.velocity.z / horiz,
          isPowerShot,
          isShot,
        );
      }
    }
    this.prevOwnerId = ball.ownerId;

    // One-shot broadcast goal highlight ring when a goal is scored (strictly visual)
    if (isGoalMoment && !this.wasGoalMoment) {
      this.kickRingAge = 0;
      this.kickRingMaxAge = 0.42;
      this.kickRingMaxScale = 5.2;
      this.kickRingMesh.visible = true;
      this.kickRingMesh.position.set(ball.position.x, 0.026, ball.position.z);
      this.kickRingMat.color.setHex(0xfde047);
    }
    this.wasGoalMoment = isGoalMoment;

    // Apply brief visual strike pulse strictly to mesh scale (never alters BALL_RADIUS)
    if (this.kickPulseAge < 0.11) {
      this.kickPulseAge += dt;
      const pulseT = Math.min(1, this.kickPulseAge / 0.11);
      const bump = Math.sin(pulseT * Math.PI) * this.kickPulseStrength;
      this.sphere.scale.setScalar(1 + bump);
    } else if (this.sphere.scale.x !== 1) {
      this.sphere.scale.setScalar(1);
    }

    if (this.kickRingMesh.visible) {
      this.kickRingAge += dt;
      if (this.kickRingAge >= this.kickRingMaxAge) {
        this.kickRingMesh.visible = false;
        this.kickRingMat.opacity = 0;
      } else {
        const p = this.kickRingAge / this.kickRingMaxAge;
        this.kickRingMesh.scale.setScalar(1 + p * (this.kickRingMaxScale - 1));
        this.kickRingMat.opacity = (1 - p) * 0.48;
      }
    }

    // Step pre-allocated directional departure micro-sparks (zero allocations)
    for (let i = 0; i < BURST_POOL_SIZE; i++) {
      const shard = this.burstShards[i];
      if (!shard.active) continue;
      shard.age += dt;
      if (shard.age >= shard.maxAge) {
        shard.active = false;
        shard.mesh.visible = false;
        shard.mat.opacity = 0;
        continue;
      }
      const life = 1 - shard.age / shard.maxAge;
      shard.mesh.position.x += shard.vx * dt;
      shard.mesh.position.y = Math.max(0.03, shard.mesh.position.y + shard.vy * dt);
      shard.mesh.position.z += shard.vz * dt;
      shard.vy -= 5.8 * dt;
      shard.mesh.scale.set(Math.max(0.2, life), Math.max(0.2, life), Math.max(0.25, life * 1.25));
      shard.mat.opacity = life * 0.52;
    }

    // Ground contact shadow stays directly underneath the ball on the turf
    this.shadowDisc.position.set(renderX, 0.018, renderZ);
    const heightAboveTurf = Math.max(0, ball.position.y - BALL_RADIUS);
    const scale = Math.max(0.45, 1 - heightAboveTurf * 0.14);
    this.shadowDisc.scale.setScalar(scale);
    (this.shadowDisc.material as THREE.MeshBasicMaterial).opacity = Math.max(
      0.16,
      0.72 - heightAboveTurf * 0.15,
    );

    // Subtle speed streak only on powerful driven shots (> 18 m/s)
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
    this.kickRingMesh.geometry.dispose();
    this.kickRingMat.dispose();
    this.burstGeo.dispose();
    for (const shard of this.burstShards) {
      shard.mat.dispose();
    }
    this.trailGeo.dispose();
    for (const node of this.trailNodes) {
      node.mat.dispose();
    }
    this.albedoTex.dispose();
    this.bumpTex.dispose();
    this.shadowTex.dispose();
  }
}
