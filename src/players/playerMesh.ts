import * as THREE from 'three';
import { PlayerState, TeamKit } from '../core/types';

// Shared reusable geometries across all 22 players to keep draw/memory budget tight for mobile
interface SharedPlayerGeometries {
  torso: THREE.BoxGeometry;
  shorts: THREE.BoxGeometry;
  head: THREE.SphereGeometry;
  hairShort: THREE.SphereGeometry;
  arm: THREE.BoxGeometry;
  glove: THREE.BoxGeometry;
  legUpper: THREE.BoxGeometry;
  legLower: THREE.BoxGeometry;
  boot: THREE.BoxGeometry;
  shadow: THREE.CircleGeometry;
  ring: THREE.RingGeometry;
  marker: THREE.ConeGeometry;
}

let sharedGeos: SharedPlayerGeometries | null = null;
let sharedShadowTex: THREE.CanvasTexture | null = null;

function getSharedGeometries(): SharedPlayerGeometries {
  if (sharedGeos) return sharedGeos;
  sharedGeos = {
    torso: new THREE.BoxGeometry(0.42, 0.56, 0.24),
    shorts: new THREE.BoxGeometry(0.4, 0.22, 0.24),
    head: new THREE.SphereGeometry(0.145, 14, 12),
    hairShort: new THREE.SphereGeometry(0.152, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.58),
    arm: new THREE.BoxGeometry(0.11, 0.46, 0.11),
    glove: new THREE.BoxGeometry(0.14, 0.15, 0.14),
    legUpper: new THREE.BoxGeometry(0.14, 0.34, 0.14),
    legLower: new THREE.BoxGeometry(0.12, 0.36, 0.12),
    boot: new THREE.BoxGeometry(0.13, 0.09, 0.23),
    shadow: new THREE.CircleGeometry(0.48, 18),
    ring: new THREE.RingGeometry(0.56, 0.72, 24),
    marker: new THREE.ConeGeometry(0.16, 0.26, 4),
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

function createJerseyNumberTexture(jerseyColor: string, accentColor: string, num: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = jerseyColor;
  ctx.fillRect(0, 0, 128, 128);

  // Subtle vertical kit stripe accent
  ctx.fillStyle = accentColor;
  ctx.globalAlpha = 0.22;
  ctx.fillRect(44, 0, 40, 128);
  ctx.globalAlpha = 1;

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

export class PlayerVisual {
  public readonly root: THREE.Group;
  private readonly bodyGroup: THREE.Group;
  private readonly leftArmPivot: THREE.Group;
  private readonly rightArmPivot: THREE.Group;
  private readonly leftLegPivot: THREE.Group;
  private readonly rightLegPivot: THREE.Group;
  private readonly controlledRing: THREE.Mesh;
  private readonly controlledMarker: THREE.Mesh;
  private readonly disposableMaterials: THREE.Material[] = [];
  private readonly numberTex: THREE.CanvasTexture;

  constructor(player: PlayerState, kit: TeamKit) {
    const geos = getSharedGeometries();
    this.root = new THREE.Group();
    this.bodyGroup = new THREE.Group();
    this.root.add(this.bodyGroup);

    const isGK = player.role === 'GK';
    const jerseyHex = isGK ? kit.gkPrimary : kit.primary;
    const accentHex = isGK ? kit.gkSecondary : kit.secondary;

    this.numberTex = createJerseyNumberTexture(jerseyHex, accentHex, player.number);

    const jerseyMat = new THREE.MeshStandardMaterial({
      color: jerseyHex,
      roughness: 0.72,
      metalness: 0.04,
    });
    const backJerseyMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.numberTex,
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
      backJerseyMat,
      shortsMat,
      socksMat,
      skinMat,
      hairMat,
      bootsMat,
    );

    // 1. Torso (multi-material: back face shows number)
    const torsoMaterials = [
      jerseyMat,
      jerseyMat,
      jerseyMat,
      jerseyMat,
      jerseyMat,
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

    // 3. Head & Hair (composite upper read)
    const headMesh = new THREE.Mesh(geos.head, skinMat);
    headMesh.position.y = 1.62;
    headMesh.castShadow = true;
    this.bodyGroup.add(headMesh);

    const hairMesh = new THREE.Mesh(geos.hairShort, hairMat);
    hairMesh.position.y = 1.64;
    hairMesh.rotation.x = -0.15;
    this.bodyGroup.add(hairMesh);

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

    // 7. Controlled player ground ring & overhead marker
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
    this.disposableMaterials.push(ringMat, markerMat);

    this.controlledRing = new THREE.Mesh(geos.ring, ringMat);
    this.controlledRing.rotation.x = -Math.PI / 2;
    this.controlledRing.position.y = 0.024;
    this.controlledRing.visible = player.isControlled;
    this.root.add(this.controlledRing);

    this.controlledMarker = new THREE.Mesh(geos.marker, markerMat);
    this.controlledMarker.rotation.x = Math.PI;
    this.controlledMarker.position.y = 2.15;
    this.controlledMarker.visible = player.isControlled;
    this.root.add(this.controlledMarker);
  }

  public sync(player: PlayerState, elapsed: number): void {
    this.root.position.set(player.position.x, player.position.y, player.position.z);
    this.bodyGroup.rotation.y = player.facingAngle;

    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    const isMoving = speed > 0.35;

    if (player.actionState === 'dive') {
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
      const strideAmp = Math.min(0.82, 0.25 + speed * 0.075);
      const swing = Math.sin(player.animPhase);
      this.bodyGroup.position.y = Math.abs(Math.cos(player.animPhase)) * 0.045;
      this.bodyGroup.rotation.x = Math.min(0.18, speed * 0.02);
      this.bodyGroup.rotation.z = 0;
      this.leftLegPivot.rotation.x = swing * strideAmp;
      this.rightLegPivot.rotation.x = -swing * strideAmp;
      this.leftArmPivot.rotation.x = -swing * strideAmp * 0.7;
      this.rightArmPivot.rotation.x = swing * strideAmp * 0.7;
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

    // Controlled ring & indicator visibility
    const showCtrl = player.isControlled;
    this.controlledRing.visible = showCtrl;
    this.controlledMarker.visible = showCtrl;
    if (showCtrl) {
      this.controlledMarker.position.y = 2.12 + Math.sin(elapsed * 4.5) * 0.08;
      const ringMat = this.controlledRing.material as THREE.MeshBasicMaterial;
      ringMat.color.setHex(player.hasBall ? 0xfacc15 : 0x38bdf8);
      (this.controlledMarker.material as THREE.MeshBasicMaterial).color.setHex(
        player.hasBall ? 0xfacc15 : 0x38bdf8,
      );
    }
  }

  public dispose(): void {
    this.numberTex.dispose();
    for (const mat of this.disposableMaterials) {
      mat.dispose();
    }
  }
}
