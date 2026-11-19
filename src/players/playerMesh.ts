import * as THREE from 'three';
import {
  FacePresetId,
  HairStyleId,
  JerseyPatternId,
  PlayerState,
  TeamKit,
} from '../core/types';

// Shared reusable geometries across all 22 players to keep draw/memory budget tight for mobile
interface SharedPlayerGeometries {
  torso: THREE.BoxGeometry;
  shorts: THREE.BoxGeometry;
  head: THREE.SphereGeometry;
  hairShort: THREE.SphereGeometry;
  hairFadeTop: THREE.CylinderGeometry;
  hairCurly: THREE.DodecahedronGeometry;
  hairBuzz: THREE.SphereGeometry;
  hairMohawk: THREE.BoxGeometry;
  hairLongBack: THREE.BoxGeometry;
  arm: THREE.BoxGeometry;
  glove: THREE.BoxGeometry;
  legUpper: THREE.BoxGeometry;
  legLower: THREE.BoxGeometry;
  boot: THREE.BoxGeometry;
  shadow: THREE.CircleGeometry;
  ring: THREE.RingGeometry;
  marker: THREE.ConeGeometry;
  aimChevron: THREE.BufferGeometry;
}

let sharedGeos: SharedPlayerGeometries | null = null;
let sharedShadowTex: THREE.CanvasTexture | null = null;

function createAimChevronGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.42);
  shape.lineTo(0.26, 0);
  shape.lineTo(0, 0.14);
  shape.lineTo(-0.26, 0);
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(Math.PI / 2);
  return geo;
}

function getSharedGeometries(): SharedPlayerGeometries {
  if (sharedGeos) return sharedGeos;
  sharedGeos = {
    torso: new THREE.BoxGeometry(0.42, 0.56, 0.24),
    shorts: new THREE.BoxGeometry(0.4, 0.22, 0.24),
    head: new THREE.SphereGeometry(0.145, 14, 12),
    hairShort: new THREE.SphereGeometry(0.152, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.58),
    hairFadeTop: new THREE.CylinderGeometry(0.125, 0.138, 0.085, 12),
    hairCurly: new THREE.DodecahedronGeometry(0.165, 1),
    hairBuzz: new THREE.SphereGeometry(0.149, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.52),
    hairMohawk: new THREE.BoxGeometry(0.06, 0.11, 0.22),
    hairLongBack: new THREE.BoxGeometry(0.22, 0.2, 0.12),
    arm: new THREE.BoxGeometry(0.11, 0.46, 0.11),
    glove: new THREE.BoxGeometry(0.14, 0.15, 0.14),
    legUpper: new THREE.BoxGeometry(0.14, 0.34, 0.14),
    legLower: new THREE.BoxGeometry(0.12, 0.36, 0.12),
    boot: new THREE.BoxGeometry(0.13, 0.09, 0.23),
    shadow: new THREE.CircleGeometry(0.48, 18),
    ring: new THREE.RingGeometry(0.56, 0.72, 24),
    marker: new THREE.ConeGeometry(0.16, 0.26, 4),
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
  grad.addColorStop(0, 'rgba(0,0,0,0.5)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  sharedShadowTex = new THREE.CanvasTexture(canvas);
  return sharedShadowTex;
}

function paintJerseyPattern(
  ctx: CanvasRenderingContext2D,
  jerseyColor: string,
  accentColor: string,
  pattern: JerseyPatternId,
): void {
  ctx.fillStyle = jerseyColor;
  ctx.fillRect(0, 0, 128, 128);

  if (pattern === 'solid') return;

  ctx.fillStyle = accentColor;
  if (pattern === 'stripe') {
    ctx.globalAlpha = 0.25;
    ctx.fillRect(44, 0, 40, 128);
  } else if (pattern === 'hoops') {
    ctx.globalAlpha = 0.28;
    ctx.fillRect(0, 18, 128, 22);
    ctx.fillRect(0, 60, 128, 22);
    ctx.fillRect(0, 102, 128, 18);
  } else if (pattern === 'sash') {
    ctx.globalAlpha = 0.32;
    ctx.beginPath();
    ctx.moveTo(0, 10);
    ctx.lineTo(36, 0);
    ctx.lineTo(128, 96);
    ctx.lineTo(96, 128);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function createJerseyFrontTexture(
  jerseyColor: string,
  accentColor: string,
  pattern: JerseyPatternId,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  paintJerseyPattern(ctx, jerseyColor, accentColor, pattern);

  // Subtle geometric club crest on left chest
  ctx.fillStyle = accentColor;
  ctx.beginPath();
  ctx.moveTo(86, 26);
  ctx.lineTo(98, 30);
  ctx.lineTo(98, 42);
  ctx.lineTo(92, 48);
  ctx.lineTo(86, 42);
  ctx.closePath();
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createJerseyNumberTexture(
  jerseyColor: string,
  accentColor: string,
  num: number,
  pattern: JerseyPatternId,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  paintJerseyPattern(ctx, jerseyColor, accentColor, pattern);

  // Squad number
  ctx.fillStyle = accentColor;
  ctx.font = 'bold 58px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(num), 64, 68);

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

  // Face features centered around u = 0.25 (+Z front of sphere)
  const cx = 32;
  // Brows
  ctx.fillStyle = hairColor;
  const browH = preset === 'sculpted' ? 3 : 2;
  ctx.fillRect(cx - 10, 22, 7, browH);
  ctx.fillRect(cx + 3, 22, 7, browH);

  // Eyes
  ctx.fillStyle = '#141820';
  ctx.fillRect(cx - 8, 27, 4, 4);
  ctx.fillRect(cx + 4, 27, 4, 4);

  // Subtle nose shadow
  ctx.fillStyle = 'rgba(0,0,0,0.14)';
  ctx.fillRect(cx - 1, 31, 2, 6);

  // Facial hair presets
  if (preset === 'athletic') {
    ctx.fillStyle = hairColor;
    ctx.globalAlpha = 0.26;
    ctx.fillRect(cx - 11, 41, 22, 11);
    ctx.globalAlpha = 1;
  } else if (preset === 'beard') {
    ctx.fillStyle = hairColor;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(cx, 44, 11, 0, Math.PI, false);
    ctx.fill();
    ctx.fillRect(cx - 11, 39, 22, 6);
    ctx.globalAlpha = 1;
  }

  // Mouth line
  ctx.fillStyle = 'rgba(70, 28, 24, 0.55)';
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
    cap.position.y = 1.63;
    cap.rotation.x = -0.1;
    group.add(cap);
  } else if (style === 'fade') {
    const top = new THREE.Mesh(geos.hairFadeTop, hairMat);
    top.position.set(0, 1.73, 0.01);
    group.add(top);
  } else if (style === 'curly') {
    const crown = new THREE.Mesh(geos.hairCurly, hairMat);
    crown.position.set(0, 1.69, -0.01);
    crown.scale.set(1.02, 0.88, 1.02);
    group.add(crown);
  } else if (style === 'mohawk') {
    const ridge = new THREE.Mesh(geos.hairMohawk, hairMat);
    ridge.position.set(0, 1.74, -0.01);
    group.add(ridge);
  } else if (style === 'long') {
    const cap = new THREE.Mesh(geos.hairShort, hairMat);
    cap.position.y = 1.64;
    cap.rotation.x = -0.15;
    group.add(cap);
    const backLock = new THREE.Mesh(geos.hairLongBack, hairMat);
    backLock.position.set(0, 1.56, -0.11);
    group.add(backLock);
  } else {
    // 'short'
    const cap = new THREE.Mesh(geos.hairShort, hairMat);
    cap.position.y = 1.64;
    cap.rotation.x = -0.15;
    group.add(cap);
  }
  return group;
}

export class PlayerVisual {
  public readonly root: THREE.Group;
  private readonly bodyGroup: THREE.Group;
  private readonly leftArmPivot: THREE.Group;
  private readonly rightArmPivot: THREE.Group;
  private readonly leftLegPivot: THREE.Group;
  private readonly rightLegPivot: THREE.Group;
  private readonly controlledRing: THREE.Mesh;
  private readonly controlledMarker: THREE.Mesh;
  private readonly controlledAimPivot: THREE.Group;
  private readonly controlledAimArrow: THREE.Mesh;
  private readonly shadowCasters: THREE.Mesh[] = [];
  private lastShadowCast = true;
  private readonly disposableMaterials: THREE.Material[] = [];
  private readonly disposableTextures: THREE.Texture[] = [];

  constructor(player: PlayerState, kit: TeamKit) {
    const geos = getSharedGeometries();
    this.root = new THREE.Group();
    this.bodyGroup = new THREE.Group();
    this.root.add(this.bodyGroup);

    const isGK = player.role === 'GK';
    const jerseyHex = isGK
      ? kit.gkPrimary
      : (player.appearance.jerseyColorOverride ?? kit.primary);
    const accentHex = isGK ? kit.gkSecondary : kit.secondary;
    const jerseyPattern: JerseyPatternId = player.appearance.jerseyPattern ?? 'stripe';
    const facePreset: FacePresetId = player.appearance.facePreset ?? 'classic';

    const frontTex = createJerseyFrontTexture(jerseyHex, accentHex, jerseyPattern);
    const numberTex = createJerseyNumberTexture(jerseyHex, accentHex, player.number, jerseyPattern);
    const faceTex = createFaceTexture(
      player.appearance.skinTone,
      player.appearance.hairColor,
      facePreset,
    );
    this.disposableTextures.push(frontTex, numberTex, faceTex);

    const jerseyMat = new THREE.MeshStandardMaterial({
      color: jerseyHex,
      roughness: 0.72,
      metalness: 0.04,
    });
    const frontJerseyMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: frontTex,
      roughness: 0.72,
      metalness: 0.04,
    });
    const backJerseyMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: numberTex,
      roughness: 0.72,
      metalness: 0.04,
    });
    const shortsMat = new THREE.MeshStandardMaterial({
      color: kit.shorts,
      roughness: 0.78,
      metalness: 0.02,
    });
    const socksMat = new THREE.MeshStandardMaterial({
      color: isGK ? kit.gkPrimary : kit.socks,
      roughness: 0.75,
      metalness: 0.02,
    });
    const skinMat = new THREE.MeshStandardMaterial({
      color: player.appearance.skinTone,
      roughness: 0.65,
      metalness: 0.02,
    });
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: faceTex,
      roughness: 0.65,
      metalness: 0.02,
    });
    const hairMat = new THREE.MeshStandardMaterial({
      color: player.appearance.hairColor,
      roughness: 0.85,
      metalness: 0.05,
    });
    const bootsMat = new THREE.MeshStandardMaterial({
      color: player.appearance.bootsColor,
      roughness: 0.35,
      metalness: 0.15,
    });

    this.disposableMaterials.push(
      jerseyMat,
      frontJerseyMat,
      backJerseyMat,
      shortsMat,
      socksMat,
      skinMat,
      headMat,
      hairMat,
      bootsMat,
    );

    // 1. Torso (multi-material: front has pattern+crest, back face shows number)
    const torsoMaterials = [
      jerseyMat,
      jerseyMat,
      jerseyMat,
      jerseyMat,
      frontJerseyMat,
      backJerseyMat,
    ];
    const torsoMesh = new THREE.Mesh(geos.torso, torsoMaterials);
    torsoMesh.position.y = 1.15;
    torsoMesh.castShadow = true;
    this.bodyGroup.add(torsoMesh);

    // 2. Shorts pelvis block
    const shortsMesh = new THREE.Mesh(geos.shorts, shortsMat);
    shortsMesh.position.y = 0.78;
    shortsMesh.castShadow = true;
    this.bodyGroup.add(shortsMesh);

    // 3. Head & Hair (composite upper read with stylized face texture)
    const headMesh = new THREE.Mesh(geos.head, headMat);
    headMesh.position.y = 1.62;
    headMesh.castShadow = true;
    this.bodyGroup.add(headMesh);

    const hairGroup = buildHairGroup(geos, hairMat, player.appearance.hairStyle);
    this.bodyGroup.add(hairGroup);

    // 4. Arms (shoulder pivots + GK gloves)
    this.leftArmPivot = new THREE.Group();
    this.leftArmPivot.position.set(-0.27, 1.38, 0);
    const leftArmMesh = new THREE.Mesh(geos.arm, skinMat);
    leftArmMesh.position.y = -0.2;
    leftArmMesh.castShadow = true;
    this.leftArmPivot.add(leftArmMesh);
    this.bodyGroup.add(this.leftArmPivot);

    this.rightArmPivot = new THREE.Group();
    this.rightArmPivot.position.set(0.27, 1.38, 0);
    const rightArmMesh = new THREE.Mesh(geos.arm, skinMat);
    rightArmMesh.position.y = -0.2;
    rightArmMesh.castShadow = true;
    this.rightArmPivot.add(rightArmMesh);
    this.bodyGroup.add(this.rightArmPivot);

    if (isGK) {
      const gloveMat = new THREE.MeshStandardMaterial({
        color: kit.gkSecondary,
        roughness: 0.45,
        metalness: 0.05,
      });
      this.disposableMaterials.push(gloveMat);
      const leftGlove = new THREE.Mesh(geos.glove, gloveMat);
      leftGlove.position.y = -0.4;
      this.leftArmPivot.add(leftGlove);
      const rightGlove = new THREE.Mesh(geos.glove, gloveMat);
      rightGlove.position.y = -0.4;
      this.rightArmPivot.add(rightGlove);
    }

    // 5. Legs (hip pivots -> thigh + sock + boot so foot touches y = 0)
    const buildLeg = (xOffset: number): THREE.Group => {
      const pivot = new THREE.Group();
      pivot.position.set(xOffset, 0.72, 0);

      const thigh = new THREE.Mesh(geos.legUpper, skinMat);
      thigh.position.y = -0.16;
      thigh.castShadow = true;
      pivot.add(thigh);

      const sock = new THREE.Mesh(geos.legLower, socksMat);
      sock.position.y = -0.46;
      sock.castShadow = true;
      pivot.add(sock);

      const boot = new THREE.Mesh(geos.boot, bootsMat);
      boot.position.set(0, -0.67, 0.04);
      boot.castShadow = true;
      pivot.add(boot);

      return pivot;
    };

    this.leftLegPivot = buildLeg(-0.11);
    this.rightLegPivot = buildLeg(0.11);
    this.bodyGroup.add(this.leftLegPivot);
    this.bodyGroup.add(this.rightLegPivot);

    // 6. Ground contact shadow disc
    const shadowMat = new THREE.MeshBasicMaterial({
      map: getShadowTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0.65,
    });
    this.disposableMaterials.push(shadowMat);
    const shadowDisc = new THREE.Mesh(geos.shadow, shadowMat);
    shadowDisc.rotation.x = -Math.PI / 2;
    shadowDisc.position.y = 0.015;
    this.root.add(shadowDisc);

    // 7. Controlled player ground ring, directional aim chevron & overhead marker
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
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
    this.controlledAimArrow.position.z = 0.82;
    this.controlledAimPivot.add(this.controlledAimArrow);
    this.root.add(this.controlledAimPivot);

    this.controlledMarker = new THREE.Mesh(geos.marker, markerMat);
    this.controlledMarker.rotation.x = Math.PI;
    this.controlledMarker.position.y = 2.15;
    this.controlledMarker.visible = player.isControlled;
    this.root.add(this.controlledMarker);

    // Collect shadow-casting meshes once for zero-allocation distance LOD toggling
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
  ): void {
    this.root.position.set(player.position.x, player.position.y, player.position.z);
    this.bodyGroup.rotation.y = player.facingAngle;

    if (allowShadowCast !== this.lastShadowCast) {
      this.lastShadowCast = allowShadowCast;
      for (let i = 0; i < this.shadowCasters.length; i++) {
        this.shadowCasters[i].castShadow = allowShadowCast;
      }
    }

    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    const isMoving = speed > 0.35;

    if (player.actionState === 'celebrate') {
      // Triumphant arms-up goal celebration hop
      const hop = Math.abs(Math.sin(elapsed * 7.5 + player.slotIndex)) * 0.22;
      this.bodyGroup.position.y = hop;
      this.bodyGroup.rotation.x = -0.06;
      this.bodyGroup.rotation.z = Math.sin(elapsed * 5 + player.slotIndex) * 0.08;
      this.leftLegPivot.rotation.x = -hop * 1.4;
      this.rightLegPivot.rotation.x = hop * 0.8;
      this.leftArmPivot.rotation.x = -2.75;
      this.rightArmPivot.rotation.x = -2.75;
      this.leftArmPivot.rotation.z = 0.42;
      this.rightArmPivot.rotation.z = -0.42;
    } else if (player.actionState === 'dive') {
      // Full-stretch lateral goalkeeper save pose
      const sideSign = (player.team === 'home' ? -1 : 1) * (player.diveDir || 1);
      this.bodyGroup.position.y = 0.36;
      this.bodyGroup.rotation.x = 0.05;
      this.bodyGroup.rotation.z = sideSign * 1.28;
      this.leftLegPivot.rotation.x = 0.2;
      this.rightLegPivot.rotation.x = -0.15;
      this.leftArmPivot.rotation.x = -2.45;
      this.rightArmPivot.rotation.x = -2.45;
      this.leftArmPivot.rotation.z = 0.25;
      this.rightArmPivot.rotation.z = -0.25;
    } else if (player.actionState === 'tackle') {
      // Low slide-tackle lunge pose
      this.bodyGroup.position.y = -0.28;
      this.bodyGroup.rotation.x = -0.58;
      this.bodyGroup.rotation.z = 0;
      this.leftLegPivot.rotation.x = -0.9;
      this.rightLegPivot.rotation.x = 0.45;
      this.leftArmPivot.rotation.x = 0.5;
      this.rightArmPivot.rotation.x = -0.4;
      this.leftArmPivot.rotation.z = 0;
      this.rightArmPivot.rotation.z = 0;
    } else if (player.actionState === 'kick') {
      this.bodyGroup.position.y = 0.04;
      this.bodyGroup.rotation.x = 0.08;
      this.bodyGroup.rotation.z = 0;
      this.rightLegPivot.rotation.x = -1.05;
      this.leftLegPivot.rotation.x = 0.35;
      this.leftArmPivot.rotation.x = -0.45;
      this.rightArmPivot.rotation.x = 0.55;
      this.leftArmPivot.rotation.z = 0;
      this.rightArmPivot.rotation.z = 0;
    } else if (isMoving) {
      const isSprint = player.actionState === 'sprint';
      const strideAmp = Math.min(isSprint ? 0.96 : 0.82, 0.25 + speed * 0.078);
      const swing = Math.sin(player.animPhase);
      this.bodyGroup.position.y = Math.abs(Math.cos(player.animPhase)) * (isSprint ? 0.06 : 0.045);
      this.bodyGroup.rotation.x = Math.min(isSprint ? 0.24 : 0.18, speed * 0.022);
      this.bodyGroup.rotation.z = 0;
      this.leftLegPivot.rotation.x = swing * strideAmp;
      this.rightLegPivot.rotation.x = -swing * strideAmp;
      this.leftArmPivot.rotation.x = -swing * strideAmp * (isSprint ? 0.85 : 0.7);
      this.rightArmPivot.rotation.x = swing * strideAmp * (isSprint ? 0.85 : 0.7);
      this.leftArmPivot.rotation.z = 0;
      this.rightArmPivot.rotation.z = 0;
    } else {
      // Subtle breathing idle
      this.bodyGroup.position.y = Math.sin(elapsed * 2.4 + player.slotIndex) * 0.01;
      this.bodyGroup.rotation.x = 0;
      this.bodyGroup.rotation.z = 0;
      this.leftLegPivot.rotation.x = 0;
      this.rightLegPivot.rotation.x = 0;
      this.leftArmPivot.rotation.x = 0;
      this.rightArmPivot.rotation.x = 0;
      this.leftArmPivot.rotation.z = 0;
      this.rightArmPivot.rotation.z = 0;
    }

    // Controlled ring, aim chevron & overhead indicator
    const showCtrl = player.isControlled;
    this.controlledRing.visible = showCtrl;
    this.controlledMarker.visible = showCtrl;
    this.controlledAimPivot.visible = showCtrl;
    if (showCtrl) {
      const indicatorHex =
        shotCharge > 0.72
          ? 0xf43f5e
          : shotCharge > 0.05 || player.hasBall
            ? 0xfacc15
            : 0x38bdf8;
      this.controlledMarker.position.y = 2.12 + Math.sin(elapsed * 4.5) * 0.08;
      (this.controlledRing.material as THREE.MeshBasicMaterial).color.setHex(indicatorHex);
      (this.controlledMarker.material as THREE.MeshBasicMaterial).color.setHex(indicatorHex);

      this.controlledAimPivot.rotation.y = player.facingAngle;
      this.controlledAimArrow.position.z = 0.82 + shotCharge * 0.55;
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
