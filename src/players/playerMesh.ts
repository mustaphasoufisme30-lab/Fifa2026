import * as THREE from 'three';
import {
  BallState,
  FacePresetId,
  HairStyleId,
  JerseyPatternId,
  PlayerState,
  TeamKit,
} from '../core/types';
import {
  ArticulatedPose,
  blendArticulatedPose,
  createAnimMemory,
  createDefaultPose,
  evaluateTargetPose,
  PlayerAnimClip,
  PlayerAnimMemory,
  PlayerAnimSignals,
  resolvePlayerAnimClip,
} from './playerAnimation';

// Shared reusable geometries across all 22 players (created once, zero duplication)
interface SharedPlayerGeometries {
  torso: THREE.CylinderGeometry;
  shoulderBridge: THREE.CapsuleGeometry;
  collar: THREE.TorusGeometry;
  neck: THREE.CylinderGeometry;
  pelvis: THREE.CylinderGeometry;
  shortLeg: THREE.CylinderGeometry;
  head: THREE.SphereGeometry;
  hairShort: THREE.SphereGeometry;
  hairFadeTop: THREE.CylinderGeometry;
  hairCurly: THREE.DodecahedronGeometry;
  hairBuzz: THREE.SphereGeometry;
  hairMohawk: THREE.CapsuleGeometry;
  hairLongBack: THREE.CapsuleGeometry;
  sleeve: THREE.CylinderGeometry;
  upperArm: THREE.CapsuleGeometry;
  forearm: THREE.CapsuleGeometry;
  hand: THREE.SphereGeometry;
  glove: THREE.CapsuleGeometry;
  thigh: THREE.CapsuleGeometry;
  calfSock: THREE.CapsuleGeometry;
  sockTrim: THREE.CylinderGeometry;
  bootUpper: THREE.CapsuleGeometry;
  bootSole: THREE.BoxGeometry;
  shadow: THREE.CircleGeometry;
  ring: THREE.RingGeometry;
  marker: THREE.ConeGeometry;
  aimChevron: THREE.BufferGeometry;
}

let sharedGeos: SharedPlayerGeometries | null = null;
let sharedShadowTex: THREE.CanvasTexture | null = null;

function createAimChevronGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.4);
  shape.lineTo(0.22, 0);
  shape.lineTo(0, 0.13);
  shape.lineTo(-0.22, 0);
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(Math.PI / 2);
  return geo;
}

function getSharedGeometries(): SharedPlayerGeometries {
  if (sharedGeos) return sharedGeos;

  // Sculpted athletic V-tapered torso; rotateY(-PI/2) puts UV seam under right arm,
  // front chest cleanly at u = 0.25 and back squad number un-mirrored at u = 0.75.
  const torso = new THREE.CylinderGeometry(0.2, 0.155, 0.5, 12, 1, false);
  torso.rotateY(-Math.PI / 2);
  torso.scale(1.18, 1.0, 0.82);

  const shoulderBridge = new THREE.CapsuleGeometry(0.095, 0.3, 4, 8);
  shoulderBridge.rotateZ(Math.PI / 2);
  shoulderBridge.scale(1, 0.84, 0.88);

  const collar = new THREE.TorusGeometry(0.086, 0.02, 6, 12);
  collar.rotateX(Math.PI / 2);

  const pelvis = new THREE.CylinderGeometry(0.165, 0.172, 0.19, 10);
  pelvis.scale(1.14, 1, 0.84);

  const head = new THREE.SphereGeometry(0.13, 14, 12);
  head.scale(0.93, 1.07, 0.99);

  const bootUpper = new THREE.CapsuleGeometry(0.052, 0.15, 4, 8);
  bootUpper.rotateX(Math.PI / 2);
  bootUpper.scale(1.08, 0.8, 1.0);

  const hand = new THREE.SphereGeometry(0.045, 8, 6);
  hand.scale(0.86, 1.15, 0.75);

  const hairMohawk = new THREE.CapsuleGeometry(0.03, 0.135, 4, 6);
  hairMohawk.rotateX(Math.PI / 2);

  sharedGeos = {
    torso,
    shoulderBridge,
    collar,
    neck: new THREE.CylinderGeometry(0.056, 0.065, 0.1, 8),
    pelvis,
    shortLeg: new THREE.CylinderGeometry(0.096, 0.092, 0.22, 9),
    head,
    hairShort: new THREE.SphereGeometry(0.136, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.58),
    hairFadeTop: new THREE.CylinderGeometry(0.112, 0.122, 0.074, 10),
    hairCurly: new THREE.DodecahedronGeometry(0.148, 1),
    hairBuzz: new THREE.SphereGeometry(0.133, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.52),
    hairMohawk,
    hairLongBack: new THREE.CapsuleGeometry(0.085, 0.115, 4, 8),
    sleeve: new THREE.CylinderGeometry(0.072, 0.062, 0.19, 8),
    upperArm: new THREE.CapsuleGeometry(0.048, 0.18, 4, 8),
    forearm: new THREE.CapsuleGeometry(0.04, 0.19, 4, 8),
    hand,
    glove: new THREE.CapsuleGeometry(0.055, 0.078, 4, 8),
    thigh: new THREE.CapsuleGeometry(0.074, 0.24, 4, 8),
    calfSock: new THREE.CapsuleGeometry(0.056, 0.28, 4, 8),
    sockTrim: new THREE.CylinderGeometry(0.059, 0.059, 0.048, 8),
    bootUpper,
    bootSole: new THREE.BoxGeometry(0.102, 0.024, 0.24),
    shadow: new THREE.CircleGeometry(0.48, 16),
    ring: new THREE.RingGeometry(0.5, 0.62, 28),
    marker: new THREE.ConeGeometry(0.13, 0.22, 4),
    aimChevron: createAimChevronGeometry(),
  };
  return sharedGeos;
}

function getShadowTexture(): THREE.CanvasTexture {
  if (sharedShadowTex) return sharedShadowTex;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(0,0,0,0.48)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.22)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  sharedShadowTex = new THREE.CanvasTexture(canvas);
  return sharedShadowTex;
}

// Reusable material cache shared across players in the active match (reduces WebGL material swaps)
export class PlayerMaterialPool {
  private readonly cache = new Map<string, THREE.MeshStandardMaterial>();

  public getStandard(
    key: string,
    params: THREE.MeshStandardMaterialParameters,
  ): THREE.MeshStandardMaterial {
    const existing = this.cache.get(key);
    if (existing) return existing;
    const mat = new THREE.MeshStandardMaterial(params);
    this.cache.set(key, mat);
    return mat;
  }

  public dispose(): void {
    for (const mat of this.cache.values()) {
      mat.dispose();
    }
    this.cache.clear();
  }
}

// Single-draw-call InstancedMesh batch rendering all 22 players' soft ground contact shadows
const _shadowMatrix = new THREE.Matrix4();
const _shadowPos = new THREE.Vector3();
const _shadowQuat = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(1, 0, 0),
  -Math.PI / 2,
);
const _shadowScale = new THREE.Vector3();

export class PlayerShadowBatch {
  public readonly mesh: THREE.InstancedMesh;
  private readonly mat: THREE.MeshBasicMaterial;

  constructor(maxPlayers = 24) {
    const geos = getSharedGeometries();
    this.mat = new THREE.MeshBasicMaterial({
      map: getShadowTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0.68,
    });
    this.mesh = new THREE.InstancedMesh(geos.shadow, this.mat, maxPlayers);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  public sync(players: PlayerState[]): void {
    const count = Math.min(players.length, this.mesh.instanceMatrix.count);
    this.mesh.count = count;
    for (let i = 0; i < count; i++) {
      const p = players[i];
      const lift = Math.max(0, p.position.y);
      const isDive = p.actionState === 'dive';
      const isTackle = p.actionState === 'tackle';
      const sx = isDive ? 1.55 : isTackle ? 1.35 : Math.max(0.65, 1.0 - lift * 0.35);
      const sz = isDive ? 0.95 : isTackle ? 1.3 : Math.max(0.65, 1.0 - lift * 0.35);
      _shadowPos.set(p.position.x, 0.015, p.position.z);
      _shadowScale.set(sx, sz, 1);
      _shadowMatrix.compose(_shadowPos, _shadowQuat, _shadowScale);
      this.mesh.setMatrixAt(i, _shadowMatrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  public dispose(): void {
    this.mat.dispose();
  }
}

/**
 * Generates a wrap-around 256x128 athletic football jersey texture:
 * u = 0.25 (x = 64) -> chest front with crest & athletic fabric seam shading
 * u = 0.75 (x = 192) -> back with crisp high-contrast squad number
 */
function createWrapJerseyTexture(
  jerseyColor: string,
  accentColor: string,
  num: number,
  pattern: JerseyPatternId,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  // Base athletic jersey fabric
  ctx.fillStyle = jerseyColor;
  ctx.fillRect(0, 0, 256, 128);

  // Kit pattern
  if (pattern !== 'solid') {
    ctx.fillStyle = accentColor;
    if (pattern === 'stripe') {
      ctx.globalAlpha = 0.24;
      for (let x = 22; x < 256; x += 36) {
        ctx.fillRect(x, 0, 16, 128);
      }
    } else if (pattern === 'hoops') {
      ctx.globalAlpha = 0.25;
      ctx.fillRect(0, 20, 256, 20);
      ctx.fillRect(0, 62, 256, 20);
      ctx.fillRect(0, 102, 256, 16);
    } else if (pattern === 'sash') {
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.moveTo(24, 0);
      ctx.lineTo(54, 0);
      ctx.lineTo(106, 128);
      ctx.lineTo(76, 128);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Subtle side-seam panels and hem/collar trim for modern pro-kit tailoring
  ctx.fillStyle = accentColor;
  ctx.globalAlpha = 0.5;
  ctx.fillRect(0, 0, 256, 5);
  ctx.fillRect(0, 121, 256, 7);
  ctx.globalAlpha = 0.2;
  ctx.fillRect(124, 0, 8, 128);
  ctx.fillRect(0, 0, 4, 128);
  ctx.fillRect(252, 0, 4, 128);
  ctx.globalAlpha = 1;

  // Subtle fabric chest contour shading
  const shadeGrad = ctx.createLinearGradient(0, 0, 0, 128);
  shadeGrad.addColorStop(0, 'rgba(255,255,255,0.08)');
  shadeGrad.addColorStop(0.55, 'rgba(0,0,0,0)');
  shadeGrad.addColorStop(1, 'rgba(0,0,0,0.16)');
  ctx.fillStyle = shadeGrad;
  ctx.fillRect(0, 0, 256, 128);

  // Front chest club crest (left chest near x = 78, front center is x = 64)
  ctx.fillStyle = accentColor;
  ctx.beginPath();
  ctx.moveTo(75, 28);
  ctx.lineTo(86, 31);
  ctx.lineTo(86, 43);
  ctx.lineTo(80.5, 49);
  ctx.lineTo(75, 43);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Subtle geometric chest sponsor band across front (x = 40..88)
  ctx.fillStyle = accentColor;
  ctx.globalAlpha = 0.78;
  ctx.fillRect(46, 58, 36, 4);
  ctx.globalAlpha = 0.45;
  ctx.fillRect(52, 65, 24, 3);
  ctx.globalAlpha = 1;

  // Crisp high-contrast squad number on back (x = 192 = u 0.75)
  ctx.font = '900 60px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.strokeText(String(num), 192, 68);
  ctx.fillStyle = accentColor;
  ctx.fillText(String(num), 192, 68);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createFaceTexture(
  skinTone: string,
  hairColor: string,
  preset: FacePresetId,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = skinTone;
  ctx.fillRect(0, 0, 128, 64);

  // Subtle cheek/jaw shading for natural depth
  const jawGrad = ctx.createLinearGradient(0, 28, 0, 64);
  jawGrad.addColorStop(0, 'rgba(0,0,0,0)');
  jawGrad.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = jawGrad;
  ctx.fillRect(0, 28, 128, 36);

  // Face features centered around u = 0.25 (+Z front of sphere)
  const cx = 32;
  ctx.fillStyle = hairColor;
  const browH = preset === 'sculpted' ? 3 : 2;
  ctx.fillRect(cx - 10, 22, 7, browH);
  ctx.fillRect(cx + 3, 22, 7, browH);

  // Eyes with crisp white sclera hint
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(cx - 9, 27, 6, 3);
  ctx.fillRect(cx + 3, 27, 6, 3);
  ctx.fillStyle = '#141820';
  ctx.fillRect(cx - 7, 27, 3, 3);
  ctx.fillRect(cx + 4, 27, 3, 3);

  // Subtle nose bridge shadow
  ctx.fillStyle = 'rgba(0,0,0,0.14)';
  ctx.fillRect(cx - 1, 30, 2, 7);

  if (preset === 'athletic') {
    ctx.fillStyle = hairColor;
    ctx.globalAlpha = 0.25;
    ctx.fillRect(cx - 10, 41, 20, 10);
    ctx.globalAlpha = 1;
  } else if (preset === 'beard') {
    ctx.fillStyle = hairColor;
    ctx.globalAlpha = 0.82;
    ctx.beginPath();
    ctx.arc(cx, 44, 10.5, 0, Math.PI, false);
    ctx.fill();
    ctx.fillRect(cx - 10.5, 39, 21, 5.5);
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = 'rgba(72, 30, 26, 0.5)';
  ctx.fillRect(cx - 4, 42, 8, 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildHairGroup(
  geos: SharedPlayerGeometries,
  hairMat: THREE.Material,
  style: HairStyleId,
): THREE.Group {
  const group = new THREE.Group();
  if (style === 'buzz') {
    const cap = new THREE.Mesh(geos.hairBuzz, hairMat);
    cap.position.y = 0.015;
    cap.rotation.x = -0.1;
    cap.scale.set(0.94, 1.08, 0.99);
    group.add(cap);
  } else if (style === 'fade') {
    const top = new THREE.Mesh(geos.hairFadeTop, hairMat);
    top.position.set(0, 0.11, 0.005);
    group.add(top);
  } else if (style === 'curly') {
    const crown = new THREE.Mesh(geos.hairCurly, hairMat);
    crown.position.set(0, 0.065, -0.012);
    crown.scale.set(0.98, 0.86, 0.98);
    group.add(crown);
  } else if (style === 'mohawk') {
    const ridge = new THREE.Mesh(geos.hairMohawk, hairMat);
    ridge.position.set(0, 0.125, -0.01);
    group.add(ridge);
  } else if (style === 'long') {
    const cap = new THREE.Mesh(geos.hairShort, hairMat);
    cap.position.y = 0.02;
    cap.rotation.x = -0.15;
    cap.scale.set(0.95, 1.08, 1.0);
    group.add(cap);
    const backLock = new THREE.Mesh(geos.hairLongBack, hairMat);
    backLock.position.set(0, -0.045, -0.095);
    group.add(backLock);
  } else {
    const cap = new THREE.Mesh(geos.hairShort, hairMat);
    cap.position.y = 0.02;
    cap.rotation.x = -0.14;
    cap.scale.set(0.95, 1.08, 1.0);
    group.add(cap);
  }
  return group;
}

export class PlayerVisual {
  public readonly root: THREE.Group;
  private readonly bodyGroup: THREE.Group;
  private readonly pelvisPivot: THREE.Group;
  private readonly torsoPivot: THREE.Group;
  private readonly headPivot: THREE.Group;

  private readonly leftShoulderPivot: THREE.Group;
  private readonly leftElbowPivot: THREE.Group;
  private readonly rightShoulderPivot: THREE.Group;
  private readonly rightElbowPivot: THREE.Group;

  private readonly leftHipPivot: THREE.Group;
  private readonly leftKneePivot: THREE.Group;
  private readonly leftAnklePivot: THREE.Group;
  private readonly rightHipPivot: THREE.Group;
  private readonly rightKneePivot: THREE.Group;
  private readonly rightAnklePivot: THREE.Group;

  private readonly controlledRing: THREE.Mesh;
  private readonly controlledMarker: THREE.Mesh;
  private readonly controlledAimPivot: THREE.Group;
  private readonly controlledAimArrow: THREE.Mesh;

  private readonly shadowCasters: THREE.Mesh[] = [];
  private lastShadowCast = true;
  private readonly disposableMaterials: THREE.Material[] = [];
  private readonly disposableTextures: THREE.Texture[] = [];

  // Zero-allocation animation state machine & pose interpolation buffers
  private readonly animMemory: PlayerAnimMemory = createAnimMemory();
  private readonly currentPose: ArticulatedPose = createDefaultPose();
  private readonly targetPose: ArticulatedPose = createDefaultPose();
  private readonly animSignals: PlayerAnimSignals;
  private lastElapsed = -1;
  public lastClip: PlayerAnimClip = 'idle';

  constructor(player: PlayerState, kit: TeamKit, materialPool?: PlayerMaterialPool) {
    const geos = getSharedGeometries();
    this.root = new THREE.Group();
    this.bodyGroup = new THREE.Group();
    // Subtle broadcast athletic scale (anchored at y = 0 so cleats stay flush on turf)
    this.bodyGroup.scale.setScalar(1.07);
    this.root.add(this.bodyGroup);

    this.animSignals = {
      speed: 0,
      facingAngle: player.facingAngle,
      actionState: player.actionState,
      actionTimer: player.actionTimer,
      hasBall: player.hasBall,
      diveDir: player.diveDir,
      team: player.team,
      slotIndex: player.slotIndex,
      animPhase: player.animPhase,
      shotCharge: 0,
      ballSpeed: 0,
      dt: 0.016,
      elapsed: 0,
    };

    const isGK = player.role === 'GK';
    const jerseyHex = isGK
      ? kit.gkPrimary
      : (player.appearance.jerseyColorOverride ?? kit.primary);
    const accentHex = isGK ? kit.gkSecondary : kit.secondary;
    const jerseyPattern: JerseyPatternId = player.appearance.jerseyPattern ?? 'stripe';
    const facePreset: FacePresetId = player.appearance.facePreset ?? 'classic';

    const getSharedOrOwnMat = (
      key: string,
      params: THREE.MeshStandardMaterialParameters,
    ): THREE.MeshStandardMaterial => {
      if (materialPool) return materialPool.getStandard(key, params);
      const mat = new THREE.MeshStandardMaterial(params);
      this.disposableMaterials.push(mat);
      return mat;
    };

    // Per-player unique textures (jersey back number & face)
    const wrapJerseyTex = createWrapJerseyTexture(
      jerseyHex,
      accentHex,
      player.number,
      jerseyPattern,
    );
    const faceTex = createFaceTexture(
      player.appearance.skinTone,
      player.appearance.hairColor,
      facePreset,
    );
    this.disposableTextures.push(wrapJerseyTex, faceTex);

    const torsoMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: wrapJerseyTex,
      roughness: 0.74,
      metalness: 0.03,
    });
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: faceTex,
      roughness: 0.62,
      metalness: 0.02,
    });
    this.disposableMaterials.push(torsoMat, headMat);

    // Pooled materials shared across teammates for mobile performance
    const jerseySolidMat = getSharedOrOwnMat(`jersey:${jerseyHex}`, {
      color: jerseyHex,
      roughness: 0.74,
      metalness: 0.03,
    });
    const accentMat = getSharedOrOwnMat(`accent:${accentHex}`, {
      color: accentHex,
      roughness: 0.68,
      metalness: 0.04,
    });
    const shortsMat = getSharedOrOwnMat(`shorts:${kit.shorts}`, {
      color: kit.shorts,
      roughness: 0.78,
      metalness: 0.02,
    });
    const sockHex = isGK ? kit.gkPrimary : kit.socks;
    const socksMat = getSharedOrOwnMat(`socks:${sockHex}`, {
      color: sockHex,
      roughness: 0.76,
      metalness: 0.02,
    });
    const skinMat = getSharedOrOwnMat(`skin:${player.appearance.skinTone}`, {
      color: player.appearance.skinTone,
      roughness: 0.62,
      metalness: 0.02,
    });
    const hairMat = getSharedOrOwnMat(`hair:${player.appearance.hairColor}`, {
      color: player.appearance.hairColor,
      roughness: 0.84,
      metalness: 0.04,
    });
    const bootsMat = getSharedOrOwnMat(`boots:${player.appearance.bootsColor}`, {
      color: player.appearance.bootsColor,
      roughness: 0.34,
      metalness: 0.16,
    });
    const soleMat = getSharedOrOwnMat('sole:dark', {
      color: 0x181c24,
      roughness: 0.7,
      metalness: 0.08,
    });

    // === HIERARCHICAL ARTICULATED HUMANOID RIG (~1.81m standing height) ===

    // 1. Pelvis / Shorts Anchor (y = 0.88 above turf)
    this.pelvisPivot = new THREE.Group();
    this.pelvisPivot.position.y = 0.88;
    this.bodyGroup.add(this.pelvisPivot);

    const pelvisMesh = new THREE.Mesh(geos.pelvis, shortsMat);
    pelvisMesh.position.y = 0.02;
    pelvisMesh.castShadow = true;
    this.pelvisPivot.add(pelvisMesh);

    // 2. Torso Pivot (sits atop pelvis at local y = 0.08 -> world y = 0.96)
    this.torsoPivot = new THREE.Group();
    this.torsoPivot.position.y = 0.08;
    this.pelvisPivot.add(this.torsoPivot);

    const torsoMesh = new THREE.Mesh(geos.torso, torsoMat);
    torsoMesh.position.y = 0.25;
    torsoMesh.castShadow = true;
    this.torsoPivot.add(torsoMesh);

    // Rounded athletic shoulders & collar
    const shouldersMesh = new THREE.Mesh(geos.shoulderBridge, jerseySolidMat);
    shouldersMesh.position.y = 0.455;
    this.torsoPivot.add(shouldersMesh);

    const collarMesh = new THREE.Mesh(geos.collar, accentMat);
    collarMesh.position.y = 0.5;
    this.torsoPivot.add(collarMesh);

    const neckMesh = new THREE.Mesh(geos.neck, skinMat);
    neckMesh.position.y = 0.54;
    this.torsoPivot.add(neckMesh);

    // 3. Head Pivot (world y ~ 1.65, crown ~ 1.81m)
    this.headPivot = new THREE.Group();
    this.headPivot.position.y = 0.67;
    this.torsoPivot.add(this.headPivot);

    const headMesh = new THREE.Mesh(geos.head, headMat);
    headMesh.castShadow = true;
    this.headPivot.add(headMesh);

    const hairGroup = buildHairGroup(geos, hairMat, player.appearance.hairStyle);
    this.headPivot.add(hairGroup);

    // 4. Two-Segment Articulated Arms (Shoulder -> Sleeve + Upper Arm -> Elbow -> Forearm + Hand/Glove)
    const gloveMat = isGK
      ? getSharedOrOwnMat(`gkGlove:${kit.gkSecondary}`, {
          color: kit.gkSecondary,
          roughness: 0.45,
          metalness: 0.06,
        })
      : null;

    const buildArm = (
      sideX: number,
    ): { shoulder: THREE.Group; elbow: THREE.Group } => {
      const shoulder = new THREE.Group();
      shoulder.position.set(sideX, 0.455, 0);

      const sleeve = new THREE.Mesh(geos.sleeve, jerseySolidMat);
      sleeve.position.y = -0.075;
      shoulder.add(sleeve);

      const upperArm = new THREE.Mesh(geos.upperArm, skinMat);
      upperArm.position.y = -0.16;
      shoulder.add(upperArm);

      const elbow = new THREE.Group();
      elbow.position.y = -0.27;
      shoulder.add(elbow);

      const forearm = new THREE.Mesh(geos.forearm, skinMat);
      forearm.position.y = -0.115;
      elbow.add(forearm);

      const handMesh = new THREE.Mesh(
        isGK ? geos.glove : geos.hand,
        isGK && gloveMat ? gloveMat : skinMat,
      );
      handMesh.position.y = -0.245;
      elbow.add(handMesh);

      this.torsoPivot.add(shoulder);
      return { shoulder, elbow };
    };

    const leftArm = buildArm(-0.235);
    this.leftShoulderPivot = leftArm.shoulder;
    this.leftElbowPivot = leftArm.elbow;

    const rightArm = buildArm(0.235);
    this.rightShoulderPivot = rightArm.shoulder;
    this.rightElbowPivot = rightArm.elbow;

    // 5. Three-Segment Articulated Legs (Hip -> Short Leg + Thigh -> Knee -> Calf/Sock -> Ankle -> Boot)
    const buildLeg = (
      sideX: number,
    ): { hip: THREE.Group; knee: THREE.Group; ankle: THREE.Group } => {
      const hip = new THREE.Group();
      hip.position.set(sideX, 0, 0);

      const shortLeg = new THREE.Mesh(geos.shortLeg, shortsMat);
      shortLeg.position.y = -0.095;
      hip.add(shortLeg);

      const thigh = new THREE.Mesh(geos.thigh, skinMat);
      thigh.position.y = -0.22;
      thigh.castShadow = true;
      hip.add(thigh);

      const knee = new THREE.Group();
      knee.position.y = -0.39;
      hip.add(knee);

      const sockTrim = new THREE.Mesh(geos.sockTrim, accentMat);
      sockTrim.position.y = -0.055;
      knee.add(sockTrim);

      const calfSock = new THREE.Mesh(geos.calfSock, socksMat);
      calfSock.position.y = -0.21;
      knee.add(calfSock);

      const ankle = new THREE.Group();
      ankle.position.y = -0.41;
      knee.add(ankle);

      const bootUpper = new THREE.Mesh(geos.bootUpper, bootsMat);
      bootUpper.position.set(0, -0.036, 0.042);
      ankle.add(bootUpper);

      const bootSole = new THREE.Mesh(geos.bootSole, soleMat);
      bootSole.position.set(0, -0.068, 0.04);
      ankle.add(bootSole);

      this.pelvisPivot.add(hip);
      return { hip, knee, ankle };
    };

    const leftLeg = buildLeg(-0.105);
    this.leftHipPivot = leftLeg.hip;
    this.leftKneePivot = leftLeg.knee;
    this.leftAnklePivot = leftLeg.ankle;

    const rightLeg = buildLeg(0.105);
    this.rightHipPivot = rightLeg.hip;
    this.rightKneePivot = rightLeg.knee;
    this.rightAnklePivot = rightLeg.ankle;

    // 6. Controlled player ground ring, directional aim chevron & overhead indicator
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const markerMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
    });
    const aimMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    this.disposableMaterials.push(ringMat, markerMat, aimMat);

    this.controlledRing = new THREE.Mesh(geos.ring, ringMat);
    this.controlledRing.rotation.x = -Math.PI / 2;
    this.controlledRing.position.y = 0.024;
    this.controlledRing.visible = player.isControlled;
    this.root.add(this.controlledRing);

    this.controlledAimPivot = new THREE.Group();
    this.controlledAimPivot.position.y = 0.026;
    this.controlledAimPivot.visible = player.isControlled;
    this.controlledAimArrow = new THREE.Mesh(geos.aimChevron, aimMat);
    this.controlledAimArrow.position.z = 0.78;
    this.controlledAimPivot.add(this.controlledAimArrow);
    this.root.add(this.controlledAimPivot);

    this.controlledMarker = new THREE.Mesh(geos.marker, markerMat);
    this.controlledMarker.rotation.x = Math.PI;
    this.controlledMarker.position.y = 2.08;
    this.controlledMarker.visible = player.isControlled;
    this.root.add(this.controlledMarker);

    // Collect only primary silhouette shadow casters (mobile-optimized vertex budget)
    this.bodyGroup.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh && obj.castShadow) {
        this.shadowCasters.push(obj as THREE.Mesh);
      }
    });
  }

  public sync(
    player: PlayerState,
    elapsed: number,
    shotCharge = 0,
    allowShadowCast = true,
    dtOverride?: number,
    ball?: BallState,
  ): void {
    const dt =
      dtOverride !== undefined
        ? Math.max(0.001, Math.min(dtOverride, 0.08))
        : this.lastElapsed >= 0
          ? Math.max(0.001, Math.min(elapsed - this.lastElapsed, 0.08))
          : 0.016;
    this.lastElapsed = elapsed;

    this.root.position.set(player.position.x, player.position.y, player.position.z);
    this.bodyGroup.rotation.y = player.facingAngle;

    if (allowShadowCast !== this.lastShadowCast) {
      this.lastShadowCast = allowShadowCast;
      for (let i = 0; i < this.shadowCasters.length; i++) {
        this.shadowCasters[i].castShadow = allowShadowCast;
      }
    }

    // Populate zero-allocation signal struct from authoritative gameplay/network state
    const s = this.animSignals;
    s.speed = Math.hypot(player.velocity.x, player.velocity.z);
    s.facingAngle = player.facingAngle;
    s.actionState = player.actionState;
    s.actionTimer = player.actionTimer;
    s.hasBall = player.hasBall;
    s.diveDir = player.diveDir;
    s.team = player.team;
    s.slotIndex = player.slotIndex;
    s.animPhase = player.animPhase;
    s.shotCharge = shotCharge;
    s.ballSpeed = ball ? Math.hypot(ball.velocity.x, ball.velocity.y, ball.velocity.z) : 0;
    s.dt = dt;
    s.elapsed = elapsed;

    const clip = resolvePlayerAnimClip(s, this.animMemory);
    this.lastClip = clip;
    evaluateTargetPose(clip, s, this.animMemory, this.targetPose);
    blendArticulatedPose(this.currentPose, this.targetPose, clip, dt);

    // Apply smoothly blended articulated pose to skeleton pivots
    const pose = this.currentPose;
    this.pelvisPivot.position.y = 0.88 + pose.pelvisY;
    this.pelvisPivot.rotation.set(pose.pelvisPitch, 0, pose.pelvisRoll);

    this.torsoPivot.rotation.set(pose.torsoPitch, pose.torsoYaw, 0);
    this.headPivot.rotation.set(pose.headPitch, pose.headYaw, 0);

    this.leftShoulderPivot.rotation.set(pose.leftShoulderPitch, 0, pose.leftShoulderRoll);
    this.leftElbowPivot.rotation.x = pose.leftElbowFlex;

    this.rightShoulderPivot.rotation.set(pose.rightShoulderPitch, 0, pose.rightShoulderRoll);
    this.rightElbowPivot.rotation.x = pose.rightElbowFlex;

    this.leftHipPivot.rotation.set(pose.leftHipPitch, 0, pose.leftHipRoll);
    this.leftKneePivot.rotation.x = pose.leftKneeFlex;
    this.leftAnklePivot.rotation.x = pose.leftAnklePitch;

    this.rightHipPivot.rotation.set(pose.rightHipPitch, 0, pose.rightHipRoll);
    this.rightKneePivot.rotation.x = pose.rightKneeFlex;
    this.rightAnklePivot.rotation.x = pose.rightAnklePitch;

    // Controlled ring, aim chevron & overhead indicator
    const showCtrl = player.isControlled;
    this.controlledRing.visible = showCtrl;
    this.controlledMarker.visible = showCtrl;
    this.controlledAimPivot.visible = showCtrl;
    if (showCtrl) {
      const indicatorHex =
        shotCharge > 0.72
          ? 0xf43f5e
          : shotCharge > 0.05
            ? 0xfacc15
            : player.hasBall
              ? 0xffffff
              : 0x38bdf8;
      this.controlledMarker.position.y = 2.08 + Math.sin(elapsed * 4.5) * 0.06;
      (this.controlledRing.material as THREE.MeshBasicMaterial).color.setHex(indicatorHex);
      (this.controlledMarker.material as THREE.MeshBasicMaterial).color.setHex(
        shotCharge > 0.72 ? 0xf43f5e : shotCharge > 0.05 ? 0xfacc15 : 0x2dd4bf,
      );

      this.controlledAimPivot.rotation.y = player.facingAngle;
      this.controlledAimArrow.position.z = 0.76 + shotCharge * 0.52;
      this.controlledAimArrow.scale.set(1 + shotCharge * 0.3, 1, 1 + shotCharge * 0.85);
      (this.controlledAimArrow.material as THREE.MeshBasicMaterial).color.setHex(indicatorHex);
    }
  }

  public dispose(): void {
    for (const tex of this.disposableTextures) {
      tex.dispose();
    }
    for (const mat of this.disposableMaterials) {
      mat.dispose();
    }
  }
}
