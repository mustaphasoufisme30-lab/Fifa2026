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
  dampFacingAngle,
  evaluateTargetPose,
  PlayerAnimClip,
  PlayerAnimMemory,
  PlayerAnimSignals,
  resolvePlayerAnimClip,
} from './playerAnimation';

// Shared reusable geometries across all 22 players (created once, zero duplication)
interface SharedPlayerGeometries {
  torso: THREE.LatheGeometry;
  shoulderBridge: THREE.CapsuleGeometry;
  collarCrew: THREE.TorusGeometry;
  collarV: THREE.TorusGeometry;
  neck: THREE.CylinderGeometry;
  pelvis: THREE.CylinderGeometry;
  shortLeg: THREE.LatheGeometry;
  head: THREE.SphereGeometry;
  hairShort: THREE.SphereGeometry;
  hairFadeTop: THREE.CylinderGeometry;
  hairCurly: THREE.DodecahedronGeometry;
  hairBuzz: THREE.SphereGeometry;
  hairMohawk: THREE.CapsuleGeometry;
  hairLongBack: THREE.CapsuleGeometry;
  sleeve: THREE.CylinderGeometry;
  sleeveCuff: THREE.CylinderGeometry;
  upperArm: THREE.CapsuleGeometry;
  forearm: THREE.CapsuleGeometry;
  longForearmSleeve: THREE.CylinderGeometry;
  hand: THREE.SphereGeometry;
  glove: THREE.CapsuleGeometry;
  thigh: THREE.LatheGeometry;
  calfSock: THREE.LatheGeometry;
  sockTrim: THREE.CylinderGeometry;
  bootUpper: THREE.CapsuleGeometry;
  bootAccent: THREE.BoxGeometry;
  bootSole: THREE.BoxGeometry;
  shadow: THREE.CircleGeometry;
  ring: THREE.RingGeometry;
  marker: THREE.ConeGeometry;
  aimChevron: THREE.BufferGeometry;
}

let sharedGeos: SharedPlayerGeometries | null = null;
let sharedShadowTex: THREE.CanvasTexture | null = null;
let sharedFabricBumpTex: THREE.CanvasTexture | null = null;

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

  // Sculpted athletic V-tapered footballer torso (LatheGeometry replaces plain cylinder);
  // rotateY(-PI/2) puts UV seam under right arm, chest crest at u=0.25, un-mirrored back number at u=0.75.
  const torsoProfile = [
    new THREE.Vector2(0.146, -0.25),
    new THREE.Vector2(0.156, -0.15),
    new THREE.Vector2(0.172, -0.02),
    new THREE.Vector2(0.196, 0.1),
    new THREE.Vector2(0.208, 0.19),
    new THREE.Vector2(0.178, 0.25),
  ];
  const torso = new THREE.LatheGeometry(torsoProfile, 14);
  torso.rotateY(-Math.PI / 2);
  torso.scale(1.16, 1.0, 0.82);
  torso.computeVertexNormals();

  const shoulderBridge = new THREE.CapsuleGeometry(0.094, 0.31, 4, 10);
  shoulderBridge.rotateZ(Math.PI / 2);
  shoulderBridge.scale(1, 0.82, 0.88);

  const collarCrew = new THREE.TorusGeometry(0.086, 0.021, 6, 12);
  collarCrew.rotateX(Math.PI / 2);

  const collarV = new THREE.TorusGeometry(0.092, 0.019, 6, 12);
  collarV.rotateX(Math.PI / 2);
  collarV.scale(1.05, 1.0, 1.18);

  const pelvis = new THREE.CylinderGeometry(0.165, 0.174, 0.19, 12);
  pelvis.scale(1.14, 1, 0.84);

  // Tailored athletic football shorts leg with realistic slight flare at hem
  const shortProfile = [
    new THREE.Vector2(0.099, -0.115),
    new THREE.Vector2(0.094, -0.02),
    new THREE.Vector2(0.098, 0.11),
  ];
  const shortLeg = new THREE.LatheGeometry(shortProfile, 10);
  shortLeg.computeVertexNormals();

  // Sculpted muscular quadriceps thigh tapering naturally toward knee
  const thighProfile = [
    new THREE.Vector2(0.06, -0.18),
    new THREE.Vector2(0.069, -0.06),
    new THREE.Vector2(0.081, 0.08),
    new THREE.Vector2(0.078, 0.17),
  ];
  const thigh = new THREE.LatheGeometry(thighProfile, 10);
  thigh.computeVertexNormals();

  // Sculpted lower leg inside football sock (slender ankle -> fuller athletic calf -> knee)
  const calfProfile = [
    new THREE.Vector2(0.042, -0.19),
    new THREE.Vector2(0.049, -0.08),
    new THREE.Vector2(0.064, 0.06),
    new THREE.Vector2(0.058, 0.17),
  ];
  const calfSock = new THREE.LatheGeometry(calfProfile, 10);
  calfSock.computeVertexNormals();

  const head = new THREE.SphereGeometry(0.13, 14, 12);
  head.scale(0.92, 1.08, 0.99);

  const bootUpper = new THREE.CapsuleGeometry(0.051, 0.155, 4, 8);
  bootUpper.rotateX(Math.PI / 2);
  bootUpper.scale(1.06, 0.76, 1.02);

  const hand = new THREE.SphereGeometry(0.044, 8, 6);
  hand.scale(0.86, 1.15, 0.75);

  const hairMohawk = new THREE.CapsuleGeometry(0.03, 0.135, 4, 6);
  hairMohawk.rotateX(Math.PI / 2);

  sharedGeos = {
    torso,
    shoulderBridge,
    collarCrew,
    collarV,
    neck: new THREE.CylinderGeometry(0.056, 0.065, 0.1, 8),
    pelvis,
    shortLeg,
    head,
    hairShort: new THREE.SphereGeometry(0.136, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.58),
    hairFadeTop: new THREE.CylinderGeometry(0.112, 0.122, 0.074, 10),
    hairCurly: new THREE.DodecahedronGeometry(0.148, 1),
    hairBuzz: new THREE.SphereGeometry(0.133, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.52),
    hairMohawk,
    hairLongBack: new THREE.CapsuleGeometry(0.085, 0.115, 4, 8),
    sleeve: new THREE.CylinderGeometry(0.074, 0.062, 0.19, 9),
    sleeveCuff: new THREE.CylinderGeometry(0.063, 0.062, 0.032, 9),
    upperArm: new THREE.CapsuleGeometry(0.047, 0.18, 4, 8),
    forearm: new THREE.CapsuleGeometry(0.039, 0.19, 4, 8),
    longForearmSleeve: new THREE.CylinderGeometry(0.047, 0.039, 0.22, 8),
    hand,
    glove: new THREE.CapsuleGeometry(0.055, 0.078, 4, 8),
    thigh,
    calfSock,
    sockTrim: new THREE.CylinderGeometry(0.06, 0.06, 0.048, 10),
    bootUpper,
    bootAccent: new THREE.BoxGeometry(0.11, 0.024, 0.08),
    bootSole: new THREE.BoxGeometry(0.102, 0.022, 0.24),
    shadow: new THREE.CircleGeometry(0.5, 16),
    ring: new THREE.RingGeometry(0.54, 0.64, 32),
    marker: new THREE.ConeGeometry(0.14, 0.24, 4),
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
  grad.addColorStop(0, 'rgba(0,0,0,0.52)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.24)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  sharedShadowTex = new THREE.CanvasTexture(canvas);
  return sharedShadowTex;
}

// Single shared lightweight woven jersey fabric bump map (128x128) for richer daylight light response
function getFabricBumpTexture(): THREE.CanvasTexture {
  if (sharedFabricBumpTex) return sharedFabricBumpTex;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 2) {
    ctx.fillStyle = y % 4 === 0 ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, y, 128, 1);
  }
  for (let x = 0; x < 128; x += 4) {
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x, 0, 1, 128);
  }
  // Soft vertical athletic torso cloth folds
  const fold = ctx.createLinearGradient(0, 0, 128, 0);
  fold.addColorStop(0, 'rgba(0,0,0,0.12)');
  fold.addColorStop(0.25, 'rgba(255,255,255,0.12)');
  fold.addColorStop(0.5, 'rgba(0,0,0,0.1)');
  fold.addColorStop(0.75, 'rgba(255,255,255,0.12)');
  fold.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = fold;
  ctx.fillRect(0, 0, 128, 128);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  sharedFabricBumpTex = tex;
  return sharedFabricBumpTex;
}

type NameplateStyle = 'controlled' | 'carrier' | 'scorer';

function createNameplateTexture(label: string, style: NameplateStyle): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 64);

  const display = style === 'scorer' ? `★ ${label}` : label;
  ctx.font =
    style === 'carrier'
      ? '700 24px system-ui, -apple-system, sans-serif'
      : '800 28px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Crisp broadcast drop shadow for effortless readability against sunlit emerald pitch
  ctx.lineJoin = 'round';
  ctx.lineWidth = 6;
  ctx.strokeStyle = style === 'scorer' ? 'rgba(24, 16, 4, 0.88)' : 'rgba(10, 18, 28, 0.78)';
  ctx.strokeText(display, 128, 34);
  ctx.fillStyle = style === 'scorer' ? '#fde047' : style === 'controlled' ? '#ffffff' : '#f1f5f9';
  ctx.fillText(display, 128, 34);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function getRoleBuildScale(role: PlayerState['role']): { width: number; height: number } {
  switch (role) {
    case 'GK':
      return { width: 1.08, height: 1.11 };
    case 'CB':
      return { width: 1.07, height: 1.09 };
    case 'ST':
      return { width: 1.04, height: 1.07 };
    case 'CDM':
    case 'CM':
      return { width: 1.03, height: 1.06 };
    default:
      return { width: 1.0, height: 1.05 };
  }
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
  private nameplateSprite: THREE.Sprite | null = null;
  private nameplateStyle: NameplateStyle = 'carrier';
  private readonly playerName: string;

  private readonly shadowCasters: THREE.Mesh[] = [];
  private lastShadowCast = true;
  private readonly disposableMaterials: THREE.Material[] = [];
  private readonly disposableTextures: THREE.Texture[] = [];

  // Zero-allocation animation state machine, pose interpolation & smooth facing state
  private readonly animMemory: PlayerAnimMemory = createAnimMemory();
  private readonly currentPose: ArticulatedPose = createDefaultPose();
  private readonly targetPose: ArticulatedPose = createDefaultPose();
  private readonly animSignals: PlayerAnimSignals;
  private visualFacingAngle: number;
  private prevWorldX: number;
  private prevWorldZ: number;
  private lastElapsed = -1;
  public lastClip: PlayerAnimClip = 'idle';

  constructor(player: PlayerState, kit: TeamKit, materialPool?: PlayerMaterialPool) {
    const geos = getSharedGeometries();
    const fabricBump = getFabricBumpTexture();
    this.playerName = player.name;
    this.visualFacingAngle = player.facingAngle;
    this.prevWorldX = player.position.x;
    this.prevWorldZ = player.position.z;

    this.root = new THREE.Group();
    this.bodyGroup = new THREE.Group();
    // Role-calibrated broadcast athletic build (anchored at y = 0 so cleats stay flush on turf)
    const build = getRoleBuildScale(player.role);
    this.bodyGroup.scale.set(build.width, build.height, build.width);
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
      bumpMap: fabricBump,
      bumpScale: 0.007,
      roughness: 0.78,
      metalness: 0.02,
    });
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: faceTex,
      roughness: 0.56,
      metalness: 0.02,
    });
    this.disposableMaterials.push(torsoMat, headMat);

    // Pooled materials shared across teammates for mobile performance & clear PBR contrast
    const jerseySolidMat = getSharedOrOwnMat(`jersey:${jerseyHex}`, {
      color: jerseyHex,
      bumpMap: fabricBump,
      bumpScale: 0.006,
      roughness: 0.78,
      metalness: 0.02,
    });
    const accentMat = getSharedOrOwnMat(`accent:${accentHex}`, {
      color: accentHex,
      roughness: 0.64,
      metalness: 0.05,
    });
    const shortsMat = getSharedOrOwnMat(`shorts:${kit.shorts}`, {
      color: kit.shorts,
      bumpMap: fabricBump,
      bumpScale: 0.006,
      roughness: 0.8,
      metalness: 0.02,
    });
    const sockHex = isGK ? kit.gkPrimary : kit.socks;
    const socksMat = getSharedOrOwnMat(`socks:${sockHex}`, {
      color: sockHex,
      roughness: 0.82,
      metalness: 0.01,
    });
    const skinMat = getSharedOrOwnMat(`skin:${player.appearance.skinTone}`, {
      color: player.appearance.skinTone,
      roughness: 0.56,
      metalness: 0.02,
    });
    const hairMat = getSharedOrOwnMat(`hair:${player.appearance.hairColor}`, {
      color: player.appearance.hairColor,
      roughness: 0.88,
      metalness: 0.02,
    });
    const bootsMat = getSharedOrOwnMat(`boots:${player.appearance.bootsColor}`, {
      color: player.appearance.bootsColor,
      roughness: 0.24,
      metalness: 0.22,
    });
    const soleMat = getSharedOrOwnMat('sole:dark', {
      color: 0x151922,
      roughness: 0.68,
      metalness: 0.08,
    });

    // Team & role silhouette differentiation (GKs wear full sleeves; away outfield uses V-collar + athletic undersleeve look on select positions)
    const isAwayTeam = player.team === 'away';
    const hasLongSleeves = isGK || (isAwayTeam && player.slotIndex % 3 === 0);

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

    // Rounded athletic shoulders & team-differentiated collar (crew vs V-cut trim)
    const shouldersMesh = new THREE.Mesh(geos.shoulderBridge, jerseySolidMat);
    shouldersMesh.position.y = 0.455;
    this.torsoPivot.add(shouldersMesh);

    const collarMesh = new THREE.Mesh(
      isAwayTeam ? geos.collarV : geos.collarCrew,
      accentMat,
    );
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

    // 4. Two-Segment Articulated Arms (Shoulder -> Sleeve + Cuff + Upper Arm -> Elbow -> Forearm + Hand/Glove)
    const gloveMat = isGK
      ? getSharedOrOwnMat(`gkGlove:${kit.gkSecondary}`, {
          color: kit.gkSecondary,
          roughness: 0.4,
          metalness: 0.08,
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

      const cuff = new THREE.Mesh(geos.sleeveCuff, accentMat);
      cuff.position.y = -0.168;
      shoulder.add(cuff);

      const upperArm = new THREE.Mesh(
        geos.upperArm,
        hasLongSleeves ? jerseySolidMat : skinMat,
      );
      upperArm.position.y = -0.16;
      shoulder.add(upperArm);

      const elbow = new THREE.Group();
      elbow.position.y = -0.27;
      shoulder.add(elbow);

      const forearm = new THREE.Mesh(
        hasLongSleeves ? geos.longForearmSleeve : geos.forearm,
        hasLongSleeves ? jerseySolidMat : skinMat,
      );
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

    const leftArm = buildArm(-0.238);
    this.leftShoulderPivot = leftArm.shoulder;
    this.leftElbowPivot = leftArm.elbow;

    const rightArm = buildArm(0.238);
    this.rightShoulderPivot = rightArm.shoulder;
    this.rightElbowPivot = rightArm.elbow;

    // 5. Three-Segment Sculpted Legs (Hip -> Tailored Short + Quad Thigh -> Knee -> Sculpted Calf Sock -> Ankle -> Cleat)
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
      sockTrim.position.y = -0.045;
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

      const bootAccent = new THREE.Mesh(geos.bootAccent, accentMat);
      bootAccent.position.set(0, -0.032, 0.015);
      ankle.add(bootAccent);

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

  private ensureNameplate(style: NameplateStyle): THREE.Sprite {
    if (this.nameplateSprite && this.nameplateStyle === style) {
      return this.nameplateSprite;
    }
    if (this.nameplateSprite) {
      this.root.remove(this.nameplateSprite);
      const oldMat = this.nameplateSprite.material as THREE.SpriteMaterial;
      oldMat.map?.dispose();
      oldMat.dispose();
    }
    const tex = createNameplateTexture(this.playerName, style);
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(style === 'scorer' ? 2.6 : 2.35, style === 'scorer' ? 0.64 : 0.58, 1);
    sprite.renderOrder = 20;
    this.root.add(sprite);
    this.nameplateSprite = sprite;
    this.nameplateStyle = style;
    return sprite;
  }

  public sync(
    player: PlayerState,
    elapsed: number,
    shotCharge = 0,
    allowShadowCast = true,
    dtOverride?: number,
    ball?: BallState,
    showBroadcastTag = false,
    isGoalScorer = false,
    displayPrefs?: {
      showCircle?: boolean;
      showPlayerName?: boolean;
      userIndicatorColor?: string;
      rivalIndicatorColor?: string;
      isRivalHighlight?: boolean;
    },
  ): void {
    const dt =
      dtOverride !== undefined
        ? Math.max(0.001, Math.min(dtOverride, 0.08))
        : this.lastElapsed >= 0
          ? Math.max(0.001, Math.min(elapsed - this.lastElapsed, 0.08))
          : 0.016;
    this.lastElapsed = elapsed;

    // Snap visual heading only on teleport resets (e.g. kickoff), otherwise damp smoothly
    const movedDistSq =
      (player.position.x - this.prevWorldX) ** 2 +
      (player.position.z - this.prevWorldZ) ** 2;
    this.prevWorldX = player.position.x;
    this.prevWorldZ = player.position.z;

    if (movedDistSq > 16) {
      this.visualFacingAngle = player.facingAngle;
    } else {
      const turnRate = player.actionState === 'kick' || player.actionState === 'tackle' ? 24 : 15;
      this.visualFacingAngle = dampFacingAngle(
        this.visualFacingAngle,
        player.facingAngle,
        turnRate,
        dt,
      );
    }

    this.root.position.set(player.position.x, player.position.y, player.position.z);
    this.bodyGroup.rotation.y = this.visualFacingAngle;

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
    s.ballLastTouchTeam = ball?.lastTouchTeam ?? null;
    s.isGoalScorer = isGoalScorer;
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

    // Clear TV visual hierarchy: controlled player > goal scorer highlight > active ball carrier
    const showCtrl = player.isControlled;
    const showCirclePref = displayPrefs?.showCircle ?? true;
    const showNamePref = displayPrefs?.showPlayerName ?? true;
    const userHex = displayPrefs?.userIndicatorColor ?? '#38bdf8';
    const rivalHex = displayPrefs?.rivalIndicatorColor ?? '#ef4444';
    const isRivalHighlight = Boolean(displayPrefs?.isRivalHighlight);

    const ringMat = this.controlledRing.material as THREE.MeshBasicMaterial;
    const markerMat = this.controlledMarker.material as THREE.MeshBasicMaterial;

    if (isGoalScorer) {
      this.controlledRing.visible = showCirclePref;
      this.controlledMarker.visible = true;
      this.controlledAimPivot.visible = false;
      const pulse = 1.12 + Math.sin(elapsed * 6.5) * 0.1;
      this.controlledRing.scale.setScalar(pulse);
      ringMat.color.setHex(0xfacc15);
      ringMat.opacity = 0.92;
      this.controlledMarker.position.y = 2.34 + Math.sin(elapsed * 5.5) * 0.06;
      markerMat.color.setHex(0xfde047);
    } else if (showCtrl) {
      this.controlledRing.visible = showCirclePref;
      this.controlledMarker.visible = true;
      this.controlledAimPivot.visible = showCirclePref;
      this.controlledRing.scale.setScalar(player.hasBall ? 1.04 : 1.0);
      if (shotCharge > 0.72) {
        ringMat.color.setHex(0xf43f5e);
        markerMat.color.setHex(0xf43f5e);
        (this.controlledAimArrow.material as THREE.MeshBasicMaterial).color.setHex(0xf43f5e);
      } else if (shotCharge > 0.05) {
        ringMat.color.setHex(0xfacc15);
        markerMat.color.setHex(0xfacc15);
        (this.controlledAimArrow.material as THREE.MeshBasicMaterial).color.setHex(0xfacc15);
      } else {
        ringMat.color.set(player.hasBall ? '#ffffff' : userHex);
        markerMat.color.set(userHex);
        (this.controlledAimArrow.material as THREE.MeshBasicMaterial).color.set(userHex);
      }
      ringMat.opacity = 0.92;
      this.controlledMarker.position.y = 2.26 + Math.sin(elapsed * 4.5) * 0.05;

      this.controlledAimPivot.rotation.y = player.facingAngle;
      this.controlledAimArrow.position.z = 0.78 + shotCharge * 0.52;
      this.controlledAimArrow.scale.set(1 + shotCharge * 0.3, 1, 1 + shotCharge * 0.85);
    } else if (isRivalHighlight) {
      this.controlledRing.visible = showCirclePref;
      this.controlledMarker.visible = true;
      this.controlledAimPivot.visible = false;
      this.controlledRing.scale.setScalar(0.95);
      ringMat.color.set(rivalHex);
      ringMat.opacity = 0.55;
      this.controlledMarker.position.y = 2.24 + Math.sin(elapsed * 4.5) * 0.04;
      markerMat.color.set(rivalHex);
    } else if (player.hasBall) {
      // Subtle translucent ground ring on non-controlled ball carrier for instant TV readability
      this.controlledRing.visible = showCirclePref;
      this.controlledMarker.visible = false;
      this.controlledAimPivot.visible = false;
      this.controlledRing.scale.setScalar(0.95);
      ringMat.color.setHex(0xf8fafc);
      ringMat.opacity = 0.42;
    } else {
      this.controlledRing.visible = false;
      this.controlledMarker.visible = false;
      this.controlledAimPivot.visible = false;
    }

    // Broadcast TV nameplate floating cleanly over goal scorer, controlled player, or active ball-carrier
    const wantTag = showNamePref && (isGoalScorer || showBroadcastTag || showCtrl);
    if (wantTag) {
      const style: NameplateStyle = isGoalScorer
        ? 'scorer'
        : showCtrl
          ? 'controlled'
          : 'carrier';
      const sprite = this.ensureNameplate(style);
      sprite.visible = true;
      sprite.position.set(0, isGoalScorer ? 2.84 : showCtrl ? 2.72 : 2.34, 0);
    } else if (this.nameplateSprite) {
      this.nameplateSprite.visible = false;
    }
  }

  public dispose(): void {
    if (this.nameplateSprite) {
      const mat = this.nameplateSprite.material as THREE.SpriteMaterial;
      mat.map?.dispose();
      mat.dispose();
      this.nameplateSprite = null;
    }
    for (const tex of this.disposableTextures) {
      tex.dispose();
    }
    for (const mat of this.disposableMaterials) {
      mat.dispose();
    }
  }
}
