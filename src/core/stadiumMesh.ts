import * as THREE from 'three';
import {
  CENTER_CIRCLE_RADIUS,
  GOAL_AREA_LENGTH,
  GOAL_AREA_WIDTH,
  GOAL_DEPTH,
  GOAL_HALF_WIDTH,
  GOAL_HEIGHT,
  GOAL_POST_RADIUS,
  HALF_LENGTH,
  HALF_WIDTH,
  PENALTY_AREA_LENGTH,
  PENALTY_AREA_WIDTH,
  PENALTY_SPOT_DIST,
  PITCH_LENGTH,
  PITCH_WIDTH,
} from './constants';
import { QualityLevel } from './types';

function createPitchTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  const padX = 96;
  const padY = 64;
  const fieldW = canvas.width - padX * 2;
  const fieldH = canvas.height - padY * 2;

  const scaleX = fieldW / PITCH_LENGTH;
  const scaleZ = fieldH / PITCH_WIDTH;
  const toPxX = (m: number) => padX + (m + HALF_LENGTH) * scaleX;
  const toPxZ = (m: number) => padY + (m + HALF_WIDTH) * scaleZ;

  // Base apron grass
  ctx.fillStyle = '#1f5b2c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Mowed grass stripes (18 bands across length)
  const stripeCount = 18;
  const stripeW = fieldW / stripeCount;
  for (let i = 0; i < stripeCount; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#277438' : '#2e8441';
    ctx.fillRect(padX + i * stripeW, padY - 12, stripeW + 1, fieldH + 24);
  }

  // Subtle organic turf grain
  ctx.fillStyle = 'rgba(255,255,255,0.025)';
  for (let i = 0; i < 4200; i++) {
    const rx = (i * 197) % canvas.width;
    const ry = (i * 313) % canvas.height;
    ctx.fillRect(rx, ry, 2, 2);
  }

  // Crisp regulation white pitch lines
  ctx.strokeStyle = 'rgba(248, 252, 255, 0.94)';
  ctx.fillStyle = 'rgba(248, 252, 255, 0.94)';
  ctx.lineWidth = 4;

  // Outer touchlines & goal lines
  ctx.strokeRect(padX, padY, fieldW, fieldH);

  // Halfway line
  ctx.beginPath();
  ctx.moveTo(toPxX(0), padY);
  ctx.lineTo(toPxX(0), padY + fieldH);
  ctx.stroke();

  // Center circle & center spot
  ctx.beginPath();
  ctx.ellipse(
    toPxX(0),
    toPxZ(0),
    CENTER_CIRCLE_RADIUS * scaleX,
    CENTER_CIRCLE_RADIUS * scaleZ,
    0,
    0,
    Math.PI * 2,
  );
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(toPxX(0), toPxZ(0), 6, 0, Math.PI * 2);
  ctx.fill();

  // Both penalty areas, goal areas, penalty spots, and arcs
  for (const sign of [-1, 1] as const) {
    const goalLineX = sign * HALF_LENGTH;
    const penBoxInnerX = sign * (HALF_LENGTH - PENALTY_AREA_LENGTH);
    const goalBoxInnerX = sign * (HALF_LENGTH - GOAL_AREA_LENGTH);
    const penSpotX = sign * (HALF_LENGTH - PENALTY_SPOT_DIST);

    const xMinPen = Math.min(toPxX(goalLineX), toPxX(penBoxInnerX));
    const xWPen = Math.abs(toPxX(goalLineX) - toPxX(penBoxInnerX));
    ctx.strokeRect(
      xMinPen,
      toPxZ(-PENALTY_AREA_WIDTH / 2),
      xWPen,
      PENALTY_AREA_WIDTH * scaleZ,
    );

    const xMinGoal = Math.min(toPxX(goalLineX), toPxX(goalBoxInnerX));
    const xWGoal = Math.abs(toPxX(goalLineX) - toPxX(goalBoxInnerX));
    ctx.strokeRect(
      xMinGoal,
      toPxZ(-GOAL_AREA_WIDTH / 2),
      xWGoal,
      GOAL_AREA_WIDTH * scaleZ,
    );

    // Penalty spot
    ctx.beginPath();
    ctx.arc(toPxX(penSpotX), toPxZ(0), 5, 0, Math.PI * 2);
    ctx.fill();

    // Penalty arc (outside penalty box)
    ctx.beginPath();
    const startA = sign === -1 ? -0.92 : Math.PI - 0.92;
    const endA = sign === -1 ? 0.92 : Math.PI + 0.92;
    ctx.ellipse(
      toPxX(penSpotX),
      toPxZ(0),
      CENTER_CIRCLE_RADIUS * scaleX,
      CENTER_CIRCLE_RADIUS * scaleZ,
      0,
      startA,
      endA,
    );
    ctx.stroke();

    // Corner arcs
    for (const zSign of [-1, 1] as const) {
      const cx = toPxX(goalLineX);
      const cz = toPxZ(zSign * HALF_WIDTH);
      ctx.beginPath();
      const cStart =
        sign === -1
          ? zSign === -1
            ? 0
            : -Math.PI / 2
          : zSign === -1
            ? Math.PI / 2
            : Math.PI;
      ctx.arc(cx, cz, 14, cStart, cStart + Math.PI / 2);
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createNetTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(241, 245, 249, 0.72)';
  ctx.lineWidth = 2.5;
  for (let i = 0; i <= 128; i += 16) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 128);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(128, i);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 3);
  return tex;
}

function createAdBoardTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  const brands = [
    { bg: '#0f172a', fg: '#38bdf8', text: 'FiFA 2026 CHAMPIONSHIP' },
    { bg: '#0369a1', fg: '#ffffff', text: 'VELOX ATHLETICS' },
    { bg: '#064e3b', fg: '#34d399', text: 'APEX TURF SYSTEMS' },
    { bg: '#7c2d12', fg: '#fbbf24', text: 'SOLANO FINANCIAL' },
  ];

  const segW = canvas.width / brands.length;
  brands.forEach((b, i) => {
    ctx.fillStyle = b.bg;
    ctx.fillRect(i * segW, 0, segW, canvas.height);
    ctx.fillStyle = b.fg;
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.text, i * segW + segW / 2, 64);
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(4, 1);
  return tex;
}

function createFloodlightHaloTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255, 250, 232, 0.85)');
  grad.addColorStop(0.35, 'rgba(220, 238, 255, 0.28)');
  grad.addColorStop(1, 'rgba(220, 238, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface StadiumResources {
  group: THREE.Group;
  update: (elapsed: number, isGoalCelebration: boolean) => void;
  setQuality: (quality: QualityLevel) => void;
  dispose: () => void;
}

export function buildStadium(
  maxAnisotropy: number,
  quality: QualityLevel,
): StadiumResources {
  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];
  const flagCloths: THREE.Mesh[] = [];

  // 1. Surrounding stadium ground apron (y = -0.025)
  const apronGeo = new THREE.PlaneGeometry(170, 128);
  const apronMat = new THREE.MeshStandardMaterial({
    color: 0x162638,
    roughness: 0.9,
    metalness: 0.05,
  });
  const apron = new THREE.Mesh(apronGeo, apronMat);
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.025;
  apron.receiveShadow = true;
  group.add(apron);
  disposables.push(apronGeo, apronMat);

  // 2. Main regulation grass pitch with lines (y = 0)
  const pitchTex = createPitchTexture();
  pitchTex.anisotropy = maxAnisotropy;
  const totalPitchTexLen = PITCH_LENGTH + 10.6;
  const totalPitchTexWid = PITCH_WIDTH + 9.4;
  const pitchGeo = new THREE.PlaneGeometry(totalPitchTexLen, totalPitchTexWid);
  const pitchMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: pitchTex,
    roughness: 0.88,
    metalness: 0.0,
  });
  const pitchMesh = new THREE.Mesh(pitchGeo, pitchMat);
  pitchMesh.rotation.x = -Math.PI / 2;
  pitchMesh.position.y = 0;
  pitchMesh.receiveShadow = true;
  group.add(pitchMesh);
  disposables.push(pitchTex, pitchGeo, pitchMat);

  // 3. Two 3D Goal Cages (posts, crossbar, stanchions, nets)
  const postMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.25,
    metalness: 0.4,
  });
  const netTex = createNetTexture();
  const netMat = new THREE.MeshBasicMaterial({
    map: netTex,
    transparent: true,
    opacity: 0.65,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const postGeo = new THREE.CylinderGeometry(
    GOAL_POST_RADIUS,
    GOAL_POST_RADIUS,
    GOAL_HEIGHT,
    10,
  );
  const crossbarGeo = new THREE.CylinderGeometry(
    GOAL_POST_RADIUS,
    GOAL_POST_RADIUS,
    GOAL_HALF_WIDTH * 2 + GOAL_POST_RADIUS * 2,
    10,
  );
  const depthBarGeo = new THREE.CylinderGeometry(0.035, 0.035, GOAL_DEPTH, 8);
  const backNetGeo = new THREE.PlaneGeometry(GOAL_HALF_WIDTH * 2, GOAL_HEIGHT);
  const sideNetGeo = new THREE.PlaneGeometry(GOAL_DEPTH, GOAL_HEIGHT);
  const topNetGeo = new THREE.PlaneGeometry(GOAL_DEPTH, GOAL_HALF_WIDTH * 2);

  disposables.push(
    postMat,
    netTex,
    netMat,
    postGeo,
    crossbarGeo,
    depthBarGeo,
    backNetGeo,
    sideNetGeo,
    topNetGeo,
  );

  for (const sign of [-1, 1] as const) {
    const goalGroup = new THREE.Group();
    const goalX = sign * HALF_LENGTH;
    const outDir = sign; // +1 for +X goal, -1 for -X goal

    // Left & right front posts
    for (const zSign of [-1, 1] as const) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(goalX, GOAL_HEIGHT / 2, zSign * GOAL_HALF_WIDTH);
      post.castShadow = true;
      goalGroup.add(post);

      // Rear ground & top stanchion bars
      const topSupport = new THREE.Mesh(depthBarGeo, postMat);
      topSupport.rotation.z = Math.PI / 2;
      topSupport.position.set(
        goalX + outDir * (GOAL_DEPTH / 2),
        GOAL_HEIGHT,
        zSign * GOAL_HALF_WIDTH,
      );
      goalGroup.add(topSupport);

      const bottomSupport = new THREE.Mesh(depthBarGeo, postMat);
      bottomSupport.rotation.z = Math.PI / 2;
      bottomSupport.position.set(
        goalX + outDir * (GOAL_DEPTH / 2),
        0.04,
        zSign * GOAL_HALF_WIDTH,
      );
      goalGroup.add(bottomSupport);

      const backCorner = new THREE.Mesh(postGeo, postMat);
      backCorner.scale.set(0.6, 1, 0.6);
      backCorner.position.set(
        goalX + outDir * GOAL_DEPTH,
        GOAL_HEIGHT / 2,
        zSign * GOAL_HALF_WIDTH,
      );
      goalGroup.add(backCorner);

      // Side net
      const sideNet = new THREE.Mesh(sideNetGeo, netMat);
      sideNet.position.set(
        goalX + outDir * (GOAL_DEPTH / 2),
        GOAL_HEIGHT / 2,
        zSign * GOAL_HALF_WIDTH,
      );
      goalGroup.add(sideNet);
    }

    // Crossbar + back top bar
    const crossbar = new THREE.Mesh(crossbarGeo, postMat);
    crossbar.rotation.x = Math.PI / 2;
    crossbar.position.set(goalX, GOAL_HEIGHT, 0);
    crossbar.castShadow = true;
    goalGroup.add(crossbar);

    const backBar = new THREE.Mesh(crossbarGeo, postMat);
    backBar.scale.set(0.6, 1, 0.6);
    backBar.rotation.x = Math.PI / 2;
    backBar.position.set(goalX + outDir * GOAL_DEPTH, GOAL_HEIGHT, 0);
    goalGroup.add(backBar);

    // Back net
    const backNet = new THREE.Mesh(backNetGeo, netMat);
    backNet.rotation.y = Math.PI / 2;
    backNet.position.set(goalX + outDir * GOAL_DEPTH, GOAL_HEIGHT / 2, 0);
    goalGroup.add(backNet);

    // Roof net
    const topNet = new THREE.Mesh(topNetGeo, netMat);
    topNet.rotation.x = Math.PI / 2;
    topNet.position.set(goalX + outDir * (GOAL_DEPTH / 2), GOAL_HEIGHT, 0);
    goalGroup.add(topNet);

    group.add(goalGroup);
  }

  // 4. Corner Flags (4 corners)
  const flagPoleGeo = new THREE.CylinderGeometry(0.025, 0.025, 1.45, 6);
  const flagClothGeo = new THREE.PlaneGeometry(0.45, 0.3);
  const flagClothMat = new THREE.MeshStandardMaterial({
    color: 0xf97316,
    side: THREE.DoubleSide,
    roughness: 0.7,
  });
  disposables.push(flagPoleGeo, flagClothGeo, flagClothMat);

  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      const pole = new THREE.Mesh(flagPoleGeo, postMat);
      pole.position.set(sx * HALF_LENGTH, 0.72, sz * HALF_WIDTH);
      group.add(pole);

      const cloth = new THREE.Mesh(flagClothGeo, flagClothMat);
      cloth.position.set(sx * HALF_LENGTH + sx * 0.22, 1.28, sz * HALF_WIDTH);
      group.add(cloth);
      flagCloths.push(cloth);
    }
  }

  // 4b. Two Composite Technical Dugouts along North Touchline
  const dugoutFrameMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.45,
    metalness: 0.45,
  });
  const dugoutGlassMat = new THREE.MeshStandardMaterial({
    color: 0x93c5fd,
    roughness: 0.2,
    metalness: 0.1,
    transparent: true,
    opacity: 0.35,
  });
  const dugoutSeatMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.7,
    metalness: 0.1,
  });
  const dugoutRoofGeo = new THREE.BoxGeometry(8.4, 0.16, 2.3);
  const dugoutBackGeo = new THREE.BoxGeometry(8.4, 1.9, 0.12);
  const dugoutSideGeo = new THREE.BoxGeometry(0.12, 1.9, 2.2);
  const dugoutBenchGeo = new THREE.BoxGeometry(7.6, 0.46, 0.65);
  disposables.push(
    dugoutFrameMat,
    dugoutGlassMat,
    dugoutSeatMat,
    dugoutRoofGeo,
    dugoutBackGeo,
    dugoutSideGeo,
    dugoutBenchGeo,
  );

  for (const dx of [-13.5, 13.5] as const) {
    const dugout = new THREE.Group();
    dugout.position.set(dx, 0, -HALF_WIDTH - 2.65);

    const roof = new THREE.Mesh(dugoutRoofGeo, dugoutFrameMat);
    roof.position.set(0, 2.05, 0);
    roof.rotation.x = 0.08;
    dugout.add(roof);

    const backWall = new THREE.Mesh(dugoutBackGeo, dugoutGlassMat);
    backWall.position.set(0, 1.0, -1.05);
    dugout.add(backWall);

    const leftWall = new THREE.Mesh(dugoutSideGeo, dugoutGlassMat);
    leftWall.position.set(-4.14, 1.0, 0);
    dugout.add(leftWall);

    const rightWall = new THREE.Mesh(dugoutSideGeo, dugoutGlassMat);
    rightWall.position.set(4.14, 1.0, 0);
    dugout.add(rightWall);

    const bench = new THREE.Mesh(dugoutBenchGeo, dugoutSeatMat);
    bench.position.set(0, 0.36, -0.42);
    dugout.add(bench);

    group.add(dugout);
  }

  // 5. Perimeter Advertising Boards (with subtle goal-celebration LED pulse)
  const adTex = createAdBoardTexture();
  adTex.anisotropy = maxAnisotropy;
  const adMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: adTex,
    emissive: new THREE.Color(0x1e3a5f),
    emissiveMap: adTex,
    emissiveIntensity: 0.16,
    roughness: 0.45,
    metalness: 0.1,
  });
  const adLongGeo = new THREE.BoxGeometry(PITCH_LENGTH + 8, 1.05, 0.35);
  const adShortGeo = new THREE.BoxGeometry(0.35, 1.05, PITCH_WIDTH + 6);
  disposables.push(adTex, adMat, adLongGeo, adShortGeo);

  for (const sz of [-1, 1] as const) {
    const board = new THREE.Mesh(adLongGeo, adMat);
    board.position.set(0, 0.52, sz * (HALF_WIDTH + 4.8));
    group.add(board);
  }
  for (const sx of [-1, 1] as const) {
    const board = new THREE.Mesh(adShortGeo, adMat);
    board.position.set(sx * (HALF_LENGTH + 5.6), 0.52, 0);
    group.add(board);
  }

  // 6. Tiered Stadium Stands & Spectators (InstancedMesh for crisp mobile performance)
  const standMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.78,
    metalness: 0.12,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.65,
    metalness: 0.35,
  });
  disposables.push(standMat, roofMat);

  const standConfigs = [
    // North & South grandstands
    { w: 124, h: 11, d: 13, x: 0, z: -HALF_WIDTH - 12.2, rotY: 0 },
    { w: 124, h: 11, d: 13, x: 0, z: HALF_WIDTH + 13.5, rotY: Math.PI },
    // East & West behind-goal stands
    { w: 78, h: 10, d: 12, x: -HALF_LENGTH - 13.2, z: 0, rotY: Math.PI / 2 },
    { w: 78, h: 10, d: 12, x: HALF_LENGTH + 13.2, z: 0, rotY: -Math.PI / 2 },
  ];

  for (const sc of standConfigs) {
    const standGroup = new THREE.Group();
    standGroup.position.set(sc.x, 0, sc.z);
    standGroup.rotation.y = sc.rotY;

    // 3 stepped concrete tiers (increasing height toward the back of the stand)
    for (let t = 0; t < 3; t++) {
      const tierH = sc.h * 0.3 * (t + 1);
      const tierGeo = new THREE.BoxGeometry(sc.w, tierH, sc.d / 3);
      disposables.push(tierGeo);
      const tierMesh = new THREE.Mesh(tierGeo, standMat);
      tierMesh.position.set(
        0,
        tierH / 2,
        (1 - t) * (sc.d / 3),
      );
      standGroup.add(tierMesh);
    }

    // Overhanging stadium canopy roof
    const canopyGeo = new THREE.BoxGeometry(sc.w + 4, 0.7, sc.d * 0.95);
    disposables.push(canopyGeo);
    const canopy = new THREE.Mesh(canopyGeo, roofMat);
    canopy.position.set(0, sc.h + 2.5, -sc.d * 0.1);
    canopy.rotation.x = 0.08;
    standGroup.add(canopy);

    group.add(standGroup);
  }

  // Instanced spectators on North, East, West stands with live quality-adaptive LOD count
  const maxCrowdCount = 1140;
  const getCrowdCountForQuality = (q: QualityLevel) =>
    q === 'low' ? 360 : q === 'medium' ? 750 : maxCrowdCount;
  const specGeo = new THREE.BoxGeometry(0.55, 0.92, 0.42);
  const specMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.75,
  });
  disposables.push(specGeo, specMat);

  const crowdInstanced = new THREE.InstancedMesh(specGeo, specMat, maxCrowdCount);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const palette = [0x0f62fe, 0xdc2626, 0xf8fafc, 0xf59e0b, 0x38bdf8, 0x10b981];

  for (let i = 0; i < maxCrowdCount; i++) {
    const section = i % 3;
    const tier = i % 3;
    if (section === 0) {
      // North stand: tier 0 is front (+z toward pitch), tier 2 is back (-z)
      const x = ((i * 13.7) % 116) - 58;
      const z = -HALF_WIDTH - 8.2 - tier * 4.2;
      const y = 3.7 + tier * 3.3;
      dummy.position.set(x, y, z);
    } else if (section === 1) {
      // West stand
      const z = ((i * 11.3) % 70) - 35;
      const x = -HALF_LENGTH - 9.4 - tier * 3.9;
      const y = 3.4 + tier * 3.0;
      dummy.position.set(x, y, z);
    } else {
      // East stand
      const z = ((i * 17.1) % 70) - 35;
      const x = HALF_LENGTH + 9.4 + tier * 3.9;
      const y = 3.4 + tier * 3.0;
      dummy.position.set(x, y, z);
    }

    const scaleJitter = 0.88 + ((i % 7) / 7) * 0.24;
    dummy.scale.set(scaleJitter, scaleJitter, scaleJitter);
    dummy.updateMatrix();
    crowdInstanced.setMatrixAt(i, dummy.matrix);

    color.setHex(palette[i % palette.length]);
    crowdInstanced.setColorAt(i, color);
  }
  crowdInstanced.instanceMatrix.needsUpdate = true;
  if (crowdInstanced.instanceColor) crowdInstanced.instanceColor.needsUpdate = true;
  crowdInstanced.count = getCrowdCountForQuality(quality);
  crowdInstanced.computeBoundingSphere();
  group.add(crowdInstanced);

  // 7. Four Stadium Floodlight Towers with Soft Atmospheric Glow Halos
  const towerPoleGeo = new THREE.CylinderGeometry(0.45, 0.75, 29, 8);
  const towerHeadGeo = new THREE.BoxGeometry(5.6, 2.8, 0.8);
  const towerBulbMat = new THREE.MeshBasicMaterial({ color: 0xfff8e7 });
  const haloTex = createFloodlightHaloTexture();
  const haloGeo = new THREE.PlaneGeometry(16, 16);
  const haloMat = new THREE.MeshBasicMaterial({
    map: haloTex,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  disposables.push(towerPoleGeo, towerHeadGeo, towerBulbMat, haloTex, haloGeo, haloMat);

  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      const tx = sx * (HALF_LENGTH + 20);
      const tz = sz * (HALF_WIDTH + 19);

      const tower = new THREE.Mesh(towerPoleGeo, roofMat);
      tower.position.set(tx, 14.5, tz);
      group.add(tower);

      const head = new THREE.Mesh(towerHeadGeo, towerBulbMat);
      head.position.set(tx, 29.5, tz);
      head.lookAt(0, 0, 0);
      group.add(head);

      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.position.set(tx - sx * 0.8, 29.2, tz - sz * 0.8);
      halo.lookAt(0, 4, 0);
      group.add(halo);
    }
  }

  return {
    group,
    update: (elapsed: number, isGoalCelebration: boolean) => {
      // Gentle stadium breeze flutter on corner flags
      for (let i = 0; i < flagCloths.length; i++) {
        flagCloths[i].rotation.y = Math.sin(elapsed * 5.0 + i * 1.3) * 0.28;
      }

      // Dynamic LED ad-board glow pulse during goal celebrations
      if (isGoalCelebration) {
        const pulse = 0.42 + Math.sin(elapsed * 12) * 0.26;
        adMat.emissive.setHex(0xf59e0b);
        adMat.emissiveIntensity = pulse;
      } else {
        adMat.emissive.setHex(0x1e3a5f);
        adMat.emissiveIntensity = 0.16;
      }
    },
    setQuality: (nextQuality: QualityLevel) => {
      crowdInstanced.count = getCrowdCountForQuality(nextQuality);
    },
    dispose: () => {
      for (const d of disposables) {
        d.dispose();
      }
    },
  };
}
