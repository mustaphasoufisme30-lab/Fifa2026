import * as THREE from 'three';
import { HALF_LENGTH, HALF_WIDTH } from './constants';
import { QualityLevel } from './types';

export interface SpectatorSlot {
  x: number;
  y: number;
  z: number;
  rotY: number;
  scaleW: number;
  scaleH: number;
  phase: number;
  standIndex: 0 | 1 | 2 | 3; // 0: North, 1: West, 2: East, 3: South
  shirtColorHex: number;
  skinColorHex: number;
  excitementBias: number;
}

const SHIRT_PALETTE = [
  0x1d4ed8, // Royal club blue
  0x2563eb, // Bright cobalt blue
  0xdc2626, // Crimson red
  0xef4444, // Bright red
  0xf8fafc, // Crisp white jersey
  0xf1f5f9, // Off-white kit
  0xf59e0b, // Golden yellow scarf/shirt
  0x0f172a, // Dark navy jacket
  0x334155, // Charcoal casual
  0x0ea5e9, // Sky blue supporter
  0x10b981, // Emerald accent
  0x64748b, // Slate grey
];

const SKIN_PALETTE = [
  0xf2c9a0,
  0xe2b086,
  0xc98f63,
  0x9a643f,
  0x6e4328,
  0xdfb490,
];

function hash01(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function getCrowdCountForQuality(quality: QualityLevel, maxCount: number): number {
  if (quality === 'low') return Math.min(maxCount, 460);
  if (quality === 'medium') return Math.min(maxCount, 880);
  return maxCount;
}

/**
 * Generates deterministically organized stadium spectator slots across tiered stands.
 * Prioritizes North (main TV backdrop), West, and East stands first so lower quality
 * levels still render a convincingly full stadium in broadcast TV view.
 */
export function generateSpectatorSlots(maxCount = 1320): SpectatorSlot[] {
  const slots: SpectatorSlot[] = [];

  // Tier geometry matches buildStadium standConfigs:
  // North/South: w=128, h=9.6, d=13 -> tier t in {0,1,2}: tierH = 2.88*(t+1), localZ = (1-t)*(13/3)
  // East/West: w=80, h=9.2, d=12 -> tier t in {0,1,2}: tierH = 2.76*(t+1), localZ = (1-t)*4
  const northSlots: SpectatorSlot[] = [];
  const westSlots: SpectatorSlot[] = [];
  const eastSlots: SpectatorSlot[] = [];
  const southSlots: SpectatorSlot[] = [];

  let seed = 1;

  // Helper to push a structured spectator seat
  const makeSlot = (
    x: number,
    y: number,
    z: number,
    rotY: number,
    standIndex: 0 | 1 | 2 | 3,
    clusterBias: number,
  ): SpectatorSlot => {
    const r1 = hash01(seed++);
    const r2 = hash01(seed++);
    const r3 = hash01(seed++);
    const r4 = hash01(seed++);
    const r5 = hash01(seed++);

    // Supporters tend to cluster in home/away colored sections with casual outfits mixed in
    let shirtIdx: number;
    if (r1 < 0.42) {
      shirtIdx = clusterBias === 0 ? (r2 < 0.5 ? 0 : 1) : r2 < 0.5 ? 2 : 3;
    } else if (r1 < 0.62) {
      shirtIdx = r2 < 0.5 ? 4 : 5;
    } else {
      shirtIdx = Math.floor(r2 * SHIRT_PALETTE.length) % SHIRT_PALETTE.length;
    }

    const skinIdx = Math.floor(r3 * SKIN_PALETTE.length) % SKIN_PALETTE.length;

    return {
      x,
      y,
      z,
      rotY: rotY + (r4 - 0.5) * 0.24,
      scaleW: 0.88 + r4 * 0.24,
      scaleH: 0.88 + r5 * 0.22,
      phase: r1 * Math.PI * 2,
      standIndex,
      shirtColorHex: SHIRT_PALETTE[shirtIdx],
      skinColorHex: SKIN_PALETTE[skinIdx],
      excitementBias: 0.35 + r5 * 0.65,
    };
  };

  // 1a. Lower front-row North supporters perched right behind the LED boards (leaving dugout bays clear)
  const frontCols = 58;
  for (let col = 0; col < frontCols; col++) {
    if (col % 14 === 7) continue;
    const t = col / (frontCols - 1);
    const x = -58 + t * 116;
    // Leave technical dugouts at x = -16.5 and +16.5 (width 8.4m) completely clear
    if (Math.abs(x - -16.5) < 5.2 || Math.abs(x - 16.5) < 5.2) continue;
    if (hash01(seed + col * 37) < 0.08) continue;
    const cluster = x < 0 ? 0 : 1;
    northSlots.push(makeSlot(x, 2.55, -HALF_WIDTH - 8.2, 0, 0, cluster));
  }

  // 1b. Main 3-tier North Stand (main broadcast TV backdrop — densest & most visible)
  // 3 concrete tiers, 2 rows per tier = 6 organized rows across x in [-59, +59]
  for (let tier = 0; tier < 3; tier++) {
    const tierTopY = 9.6 * 0.3 * (tier + 1);
    const tierCenterZ = -HALF_WIDTH - 14.2 + (1 - tier) * (13 / 3);
    for (let subRow = 0; subRow < 2; subRow++) {
      const rowZ = tierCenterZ + 1.15 - subRow * 1.9;
      const rowY = tierTopY + subRow * 0.34;
      const colCount = 62;
      for (let col = 0; col < colCount; col++) {
        // Natural stadium stair aisles every ~15 seats
        if (col % 15 === 7) continue;
        // Slight occupancy gaps (~9%) so crowd looks organic rather than robotic grid
        if (hash01(seed + col * 19 + tier * 73 + subRow * 31) < 0.09) continue;
        const t = col / (colCount - 1);
        const jitterX = (hash01(seed * 3 + col) - 0.5) * 0.35;
        const x = -59.5 + t * 119 + jitterX;
        const cluster = x < 0 ? 0 : 1;
        northSlots.push(makeSlot(x, rowY, rowZ, 0, 0, cluster));
      }
    }
  }

  // 2. West & East Behind-Goal Stands (3 tiers x 2 rows each)
  for (const isEast of [false, true]) {
    const sign = isEast ? 1 : -1;
    const targetList = isEast ? eastSlots : westSlots;
    const standIdx: 1 | 2 = isEast ? 2 : 1;
    const baseRotY = isEast ? -Math.PI / 2 : Math.PI / 2;

    for (let tier = 0; tier < 3; tier++) {
      const tierTopY = 9.2 * 0.3 * (tier + 1);
      const tierCenterX = sign * (HALF_LENGTH + 14.0 - (1 - tier) * 4.0);
      for (let subRow = 0; subRow < 2; subRow++) {
        const rowX = tierCenterX - sign * (1.05 - subRow * 1.75);
        const rowY = tierTopY + subRow * 0.32;
        const colCount = 38;
        for (let col = 0; col < colCount; col++) {
          if (col % 12 === 6) continue;
          if (hash01(seed + col * 23 + tier * 59 + subRow * 41) < 0.12) continue;
          const t = col / (colCount - 1);
          const jitterZ = (hash01(seed * 5 + col) - 0.5) * 0.35;
          const z = -36 + t * 72 + jitterZ;
          targetList.push(makeSlot(rowX, rowY, z, baseRotY, standIdx, isEast ? 1 : 0));
        }
      }
    }
  }

  // 3. South Stand (visible during title flyover, replay orbits, and behind-player camera)
  for (let tier = 0; tier < 3; tier++) {
    const tierTopY = 9.6 * 0.3 * (tier + 1);
    const tierCenterZ = HALF_WIDTH + 15.0 - (1 - tier) * (13 / 3);
    const rowZ = tierCenterZ - 0.6;
    const colCount = 46;
    for (let col = 0; col < colCount; col++) {
      if (col % 15 === 7) continue;
      if (hash01(seed + col * 29 + tier * 83) < 0.15) continue;
      const t = col / (colCount - 1);
      const x = -58 + t * 116;
      southSlots.push(makeSlot(x, tierTopY + 0.15, rowZ, Math.PI, 3, x < 0 ? 0 : 1));
    }
  }

  // Interleave stands with North-weighted priority so quality LOD ('low'/'medium')
  // evenly populates every stand while keeping the TV-facing North stand rich.
  let nIdx = 0;
  let wIdx = 0;
  let eIdx = 0;
  let sIdx = 0;

  while (slots.length < maxCount) {
    const before = slots.length;
    for (let k = 0; k < 3 && nIdx < northSlots.length && slots.length < maxCount; k++) {
      slots.push(northSlots[nIdx++]);
    }
    if (wIdx < westSlots.length && slots.length < maxCount) {
      slots.push(westSlots[wIdx++]);
    }
    if (eIdx < eastSlots.length && slots.length < maxCount) {
      slots.push(eastSlots[eIdx++]);
    }
    if (sIdx < southSlots.length && slots.length < maxCount) {
      slots.push(southSlots[sIdx++]);
    }
    if (slots.length === before) break;
  }

  return slots;
}

// Reusable zero-GC math scratch objects at module scope
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _mat = new THREE.Matrix4();
const _color = new THREE.Color();

export class StadiumCrowd {
  public readonly group = new THREE.Group();

  private readonly maxCount: number;
  private activeCount: number;

  private readonly torsoMesh: THREE.InstancedMesh;
  private readonly headMesh: THREE.InstancedMesh;
  private readonly leftArmMesh: THREE.InstancedMesh;
  private readonly rightArmMesh: THREE.InstancedMesh;

  private readonly disposables: Array<{ dispose: () => void }> = [];

  // Compact Structure-of-Arrays (SoA) for cache-friendly zero-allocation animation
  private readonly baseX: Float32Array;
  private readonly baseY: Float32Array;
  private readonly baseZ: Float32Array;
  private readonly baseRotY: Float32Array;
  private readonly cosRotY: Float32Array;
  private readonly sinRotY: Float32Array;
  private readonly scaleW: Float32Array;
  private readonly scaleH: Float32Array;
  private readonly phase: Float32Array;
  private readonly excitementBias: Float32Array;

  private lastAnimTime = -1;
  private smoothedExcitement = 0.25;

  constructor(quality: QualityLevel, maxCount = 1320) {
    const slots = generateSpectatorSlots(maxCount);
    this.maxCount = slots.length;
    this.activeCount = getCrowdCountForQuality(quality, this.maxCount);

    this.baseX = new Float32Array(this.maxCount);
    this.baseY = new Float32Array(this.maxCount);
    this.baseZ = new Float32Array(this.maxCount);
    this.baseRotY = new Float32Array(this.maxCount);
    this.cosRotY = new Float32Array(this.maxCount);
    this.sinRotY = new Float32Array(this.maxCount);
    this.scaleW = new Float32Array(this.maxCount);
    this.scaleH = new Float32Array(this.maxCount);
    this.phase = new Float32Array(this.maxCount);
    this.excitementBias = new Float32Array(this.maxCount);

    // Lightweight, reused geometries (total 4 draw calls for the entire stadium crowd!)
    const torsoGeo = new THREE.CylinderGeometry(0.24, 0.19, 0.64, 6);
    const headGeo = new THREE.SphereGeometry(0.165, 6, 5);
    // Arm pivoted at shoulder (origin at top of arm so rotation X/Z raises & claps naturally)
    const armGeo = new THREE.BoxGeometry(0.11, 0.46, 0.11);
    armGeo.translate(0, -0.19, 0);

    const clothMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.84,
      metalness: 0.02,
    });
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.72,
      metalness: 0.0,
    });

    this.disposables.push(torsoGeo, headGeo, armGeo, clothMat, skinMat);

    this.torsoMesh = new THREE.InstancedMesh(torsoGeo, clothMat, this.maxCount);
    this.headMesh = new THREE.InstancedMesh(headGeo, skinMat, this.maxCount);
    this.leftArmMesh = new THREE.InstancedMesh(armGeo, clothMat, this.maxCount);
    this.rightArmMesh = new THREE.InstancedMesh(armGeo, clothMat, this.maxCount);

    this.torsoMesh.frustumCulled = false;
    this.headMesh.frustumCulled = false;
    this.leftArmMesh.frustumCulled = false;
    this.rightArmMesh.frustumCulled = false;

    for (let i = 0; i < this.maxCount; i++) {
      const s = slots[i];
      this.baseX[i] = s.x;
      this.baseY[i] = s.y;
      this.baseZ[i] = s.z;
      this.baseRotY[i] = s.rotY;
      this.cosRotY[i] = Math.cos(s.rotY);
      this.sinRotY[i] = Math.sin(s.rotY);
      this.scaleW[i] = s.scaleW;
      this.scaleH[i] = s.scaleH;
      this.phase[i] = s.phase;
      this.excitementBias[i] = s.excitementBias;

      _color.setHex(s.shirtColorHex);
      this.torsoMesh.setColorAt(i, _color);
      // Slight subtle shade difference on sleeves for added visual richness
      _color.offsetHSL(0, 0, -0.04);
      this.leftArmMesh.setColorAt(i, _color);
      this.rightArmMesh.setColorAt(i, _color);

      _color.setHex(s.skinColorHex);
      this.headMesh.setColorAt(i, _color);
    }

    if (this.torsoMesh.instanceColor) this.torsoMesh.instanceColor.needsUpdate = true;
    if (this.headMesh.instanceColor) this.headMesh.instanceColor.needsUpdate = true;
    if (this.leftArmMesh.instanceColor) this.leftArmMesh.instanceColor.needsUpdate = true;
    if (this.rightArmMesh.instanceColor) this.rightArmMesh.instanceColor.needsUpdate = true;

    this.applyActiveCount();
    this.writeTransforms(0, false);

    this.group.add(this.torsoMesh, this.headMesh, this.leftArmMesh, this.rightArmMesh);
  }

  private applyActiveCount(): void {
    this.torsoMesh.count = this.activeCount;
    this.headMesh.count = this.activeCount;
    this.leftArmMesh.count = this.activeCount;
    this.rightArmMesh.count = this.activeCount;
  }

  public setQuality(quality: QualityLevel): void {
    const next = getCrowdCountForQuality(quality, this.maxCount);
    if (next !== this.activeCount) {
      this.activeCount = next;
      this.applyActiveCount();
      this.lastAnimTime = -1; // Force immediate refresh of newly visible instances
    }
  }

  public update(elapsed: number, isGoalCelebration: boolean, excitement = 0.35): void {
    const targetExc = isGoalCelebration ? 1.0 : Math.min(1, Math.max(0.15, excitement));
    this.smoothedExcitement += (targetExc - this.smoothedExcitement) * 0.14;

    // Pace matrix uploads to ~18Hz in live play and ~28Hz on goals to keep mobile CPU ultra-light
    const minInterval = isGoalCelebration ? 0.036 : 0.056;
    if (this.lastAnimTime >= 0 && elapsed - this.lastAnimTime < minInterval) {
      return;
    }
    this.lastAnimTime = elapsed;
    this.writeTransforms(elapsed, isGoalCelebration);
  }

  private writeTransforms(elapsed: number, isGoalCelebration: boolean): void {
    const count = this.activeCount;
    const exc = this.smoothedExcitement;
    const isHighAction = exc > 0.62;

    for (let i = 0; i < count; i++) {
      const bx = this.baseX[i];
      const by = this.baseY[i];
      const bz = this.baseZ[i];
      const rotY = this.baseRotY[i];
      const cosY = this.cosRotY[i];
      const sinY = this.sinRotY[i];
      const sw = this.scaleW[i];
      const sh = this.scaleH[i];
      const ph = this.phase[i];
      const bias = this.excitementBias[i];

      let bobY = 0;
      let leanX = 0;
      let leftArmPitch = 0.08;
      let rightArmPitch = 0.08;
      let leftArmRoll = 0.12;
      let rightArmRoll = -0.12;

      if (isGoalCelebration) {
        // Staggered stadium celebration jump + raised cheering arms
        const jumpWave = Math.abs(Math.sin(elapsed * 7.2 + ph + bx * 0.08));
        bobY = 0.14 + jumpWave * (0.28 + bias * 0.2);
        leanX = -0.08 * jumpWave;
        const waveArm = Math.sin(elapsed * 11.5 + ph) * 0.35;
        leftArmPitch = -2.65 + waveArm;
        rightArmPitch = -2.65 - waveArm;
        leftArmRoll = 0.36;
        rightArmRoll = -0.36;
      } else if (isHighAction && bias > 0.45) {
        // Applause & rising excitement on dangerous shots / good plays
        const clap = Math.sin(elapsed * 13.0 + ph);
        bobY = 0.07 + Math.max(0, Math.sin(elapsed * 4.2 + ph)) * 0.08 * exc;
        leanX = 0.06;
        if (bias > 0.72) {
          // Arms raised cheering
          leftArmPitch = -2.2 + clap * 0.25;
          rightArmPitch = -2.2 - clap * 0.25;
          leftArmRoll = 0.26;
          rightArmRoll = -0.26;
        } else {
          // Rhythmic clapping in front of chest
          leftArmPitch = -1.05;
          rightArmPitch = -1.05;
          leftArmRoll = -0.34 - clap * 0.22;
          rightArmRoll = 0.34 + clap * 0.22;
        }
      } else {
        // Subtle ambient spectator life: gentle body sway + scattered periodic clapping
        const sway = Math.sin(elapsed * 1.9 + ph);
        bobY = sway * 0.028 * (0.6 + exc);
        leanX = sway * 0.04;
        const clapWindow = Math.sin(elapsed * 0.55 + ph * 1.7);
        if (clapWindow > 0.62) {
          const clap = Math.sin(elapsed * 11.0 + ph);
          leftArmPitch = -0.95;
          rightArmPitch = -0.95;
          leftArmRoll = -0.32 - clap * 0.18;
          rightArmRoll = 0.32 + clap * 0.18;
        } else {
          leftArmPitch = 0.06 + sway * 0.08;
          rightArmPitch = 0.06 - sway * 0.08;
        }
      }

      const torsoY = by + 0.34 * sh + bobY;

      // 1. Torso
      _pos.set(bx, torsoY, bz);
      _euler.set(leanX, rotY, 0);
      _quat.setFromEuler(_euler);
      _scale.set(sw, sh, sw);
      _mat.compose(_pos, _quat, _scale);
      this.torsoMesh.setMatrixAt(i, _mat);

      // 2. Head (sits atop torso)
      _pos.set(bx, torsoY + 0.41 * sh, bz);
      _scale.set(sw, sw, sw);
      _mat.compose(_pos, _quat, _scale);
      this.headMesh.setMatrixAt(i, _mat);

      // Shoulder offsets in world space based on spectator's facing rotY
      const shoulderHalf = 0.245 * sw;
      const shoulderY = torsoY + 0.21 * sh;
      const dxShoulder = cosY * shoulderHalf;
      const dzShoulder = -sinY * shoulderHalf;

      // 3. Left Arm
      _pos.set(bx - dxShoulder, shoulderY, bz - dzShoulder);
      _euler.set(leftArmPitch, rotY, leftArmRoll);
      _quat.setFromEuler(_euler);
      _scale.set(sw, sh, sw);
      _mat.compose(_pos, _quat, _scale);
      this.leftArmMesh.setMatrixAt(i, _mat);

      // 4. Right Arm
      _pos.set(bx + dxShoulder, shoulderY, bz + dzShoulder);
      _euler.set(rightArmPitch, rotY, rightArmRoll);
      _quat.setFromEuler(_euler);
      _mat.compose(_pos, _quat, _scale);
      this.rightArmMesh.setMatrixAt(i, _mat);
    }

    this.torsoMesh.instanceMatrix.needsUpdate = true;
    this.headMesh.instanceMatrix.needsUpdate = true;
    this.leftArmMesh.instanceMatrix.needsUpdate = true;
    this.rightArmMesh.instanceMatrix.needsUpdate = true;
  }

  public dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
