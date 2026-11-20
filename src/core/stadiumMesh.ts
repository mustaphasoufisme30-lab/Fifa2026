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

  // Sunlit daytime outer grass apron (rich emerald-lime matching the main pitch)
  ctx.fillStyle = '#3b7d1a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Broad vertical mowed grass stripes (18 bands across 105m length)
  const stripeCount = 18;
  const stripeW = fieldW / stripeCount;
  for (let i = 0; i < stripeCount; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#40861b' : '#4f9c22';
    ctx.fillRect(padX + i * stripeW, padY - 18, stripeW + 1, fieldH + 36);
  }

  // Subtle horizontal cross-cut mowing bands for a natural stadium checkerboard pattern
  const rowCount = 10;
  const rowH = fieldH / rowCount;
  for (let r = 0; r < rowCount; r++) {
    ctx.fillStyle =
      r % 2 === 0
        ? 'rgba(198, 240, 86, 0.085)'
        : 'rgba(18, 56, 8, 0.11)';
    ctx.fillRect(padX - 18, padY + r * rowH, fieldW + 36, rowH + 0.5);
  }

  // Soft natural sunlight luminance variation across the pitch (prevents artificial flat look)
  const sunGrad = ctx.createRadialGradient(
    canvas.width * 0.52,
    canvas.height * 0.46,
    80,
    canvas.width * 0.5,
    canvas.height * 0.5,
    canvas.width * 0.62,
  );
  sunGrad.addColorStop(0, 'rgba(248, 255, 195, 0.06)');
  sunGrad.addColorStop(0.65, 'rgba(255, 255, 255, 0)');
  sunGrad.addColorStop(1, 'rgba(14, 48, 8, 0.09)');
  ctx.fillStyle = sunGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Subtle organic turf grain (deterministic light & dark blade micro-texture)
  ctx.fillStyle = 'rgba(235, 255, 170, 0.04)';
  for (let i = 0; i < 4200; i++) {
    const rx = (i * 197 + 23) % canvas.width;
    const ry = (i * 313 + 11) % canvas.height;
    ctx.fillRect(rx, ry, 2, 2);
  }
  ctx.fillStyle = 'rgba(16, 48, 8, 0.045)';
  for (let i = 0; i < 3200; i++) {
    const rx = (i * 263 + 71) % canvas.width;
    const ry = (i * 419 + 47) % canvas.height;
    ctx.fillRect(rx, ry, 2, 2);
  }

  // Crisp luminous regulation white pitch lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.96)';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
  ctx.lineWidth = 3.2;

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
  ctx.arc(toPxX(0), toPxZ(0), 5.5, 0, Math.PI * 2);
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
    ctx.arc(toPxX(penSpotX), toPxZ(0), 4.8, 0, Math.PI * 2);
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
  ctx.strokeStyle = 'rgba(248, 250, 252, 0.78)';
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

  // Modern high-contrast crimson / magenta / black continuous stadium LED ribbon
  const bgGrad = ctx.createLinearGradient(0, 0, canvas.width, 0);
  bgGrad.addColorStop(0, '#9e0730');
  bgGrad.addColorStop(0.25, '#c4093e');
  bgGrad.addColorStop(0.5, '#8f062b');
  bgGrad.addColorStop(0.75, '#c4093e');
  bgGrad.addColorStop(1, '#9e0730');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const panels = [
    { labelTop: 'FOOTBALL', labelBottom: 'LEAGUE', num: '26' },
    { labelTop: 'PRO CUP', labelBottom: 'SERIES', num: '26' },
    { labelTop: 'FOOTBALL', labelBottom: 'LEAGUE', num: '26' },
    { labelTop: 'WORLD', labelBottom: 'ARENA', num: '26' },
  ];

  const segW = canvas.width / panels.length;
  panels.forEach((p, i) => {
    const x0 = i * segW;

    // Sleek dark obsidian diagonal slash divider at left of each LED panel
    ctx.fillStyle = '#0c050c';
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    ctx.lineTo(x0 + 34, 0);
    ctx.lineTo(x0 + 14, canvas.height);
    ctx.lineTo(x0 - 20, canvas.height);
    ctx.closePath();
    ctx.fill();

    // Crisp magenta accent line along top & obsidian base strip along bottom
    ctx.fillStyle = '#e11d5a';
    ctx.fillRect(x0 + 34, 0, segW - 34, 6);
    ctx.fillStyle = '#12060e';
    ctx.fillRect(x0, canvas.height - 9, segW, 9);

    // Stylized emblem badge
    const badgeX = x0 + 56;
    const badgeY = 62;
    ctx.fillStyle = '#0c050c';
    ctx.beginPath();
    ctx.arc(badgeX, badgeY, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f43f74';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FL', badgeX, badgeY + 1);

    // Stacked modern typography
    ctx.fillStyle = '#0d040b';
    ctx.font = '900 22px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(p.labelTop, x0 + 88, 46);
    ctx.fillStyle = '#140610';
    ctx.font = '800 20px sans-serif';
    ctx.fillText(p.labelBottom, x0 + 88, 76);

    // Bold edition number
    ctx.fillStyle = '#090308';
    ctx.font = '900 56px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(p.num, x0 + segW - 18, 66);
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(5, 1);
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

  // 1. Surrounding stadium ground apron (rich sunlit turf border, y = -0.025)
  const apronGeo = new THREE.PlaneGeometry(180, 136);
  const apronMat = new THREE.MeshStandardMaterial({
    color: 0x346b17,
    roughness: 0.94,
    metalness: 0.0,
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
    roughness: 0.92,
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

  // 4b. Two Composite Technical Dugouts tucked behind the North LED Ribbon
  const dugoutFrameMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.45,
    metalness: 0.35,
  });
  const dugoutGlassMat = new THREE.MeshStandardMaterial({
    color: 0xcbe6ff,
    roughness: 0.2,
    metalness: 0.1,
    transparent: true,
    opacity: 0.32,
  });
  const dugoutSeatMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.7,
    metalness: 0.1,
  });
  const dugoutRoofGeo = new THREE.BoxGeometry(8.4, 0.14, 2.2);
  const dugoutBackGeo = new THREE.BoxGeometry(8.4, 1.75, 0.12);
  const dugoutSideGeo = new THREE.BoxGeometry(0.12, 1.75, 2.1);
  const dugoutBenchGeo = new THREE.BoxGeometry(7.6, 0.44, 0.62);
  disposables.push(
    dugoutFrameMat,
    dugoutGlassMat,
    dugoutSeatMat,
    dugoutRoofGeo,
    dugoutBackGeo,
    dugoutSideGeo,
    dugoutBenchGeo,
  );

  for (const dx of [-16.5, 16.5] as const) {
    const dugout = new THREE.Group();
    dugout.position.set(dx, 0, -HALF_WIDTH - 6.6);

    const roof = new THREE.Mesh(dugoutRoofGeo, dugoutFrameMat);
    roof.position.set(0, 1.78, 0);
    roof.rotation.x = 0.08;
    dugout.add(roof);

    const backWall = new THREE.Mesh(dugoutBackGeo, dugoutGlassMat);
    backWall.position.set(0, 0.86, -1.0);
    dugout.add(backWall);

    const leftWall = new THREE.Mesh(dugoutSideGeo, dugoutGlassMat);
    leftWall.position.set(-4.14, 0.86, 0);
    dugout.add(leftWall);

    const rightWall = new THREE.Mesh(dugoutSideGeo, dugoutGlassMat);
    rightWall.position.set(4.14, 0.86, 0);
    dugout.add(rightWall);

    const bench = new THREE.Mesh(dugoutBenchGeo, dugoutSeatMat);
    bench.position.set(0, 0.34, -0.4);
    dugout.add(bench);

    group.add(dugout);
  }

  // 5. Continuous Perimeter LED Advertising Ribbon (crimson / magenta / black)
  const adTex = createAdBoardTexture();
  adTex.anisotropy = maxAnisotropy;
  const adMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: adTex,
    emissive: new THREE.Color(0xffffff),
    emissiveMap: adTex,
    emissiveIntensity: 0.28,
    roughness: 0.42,
    metalness: 0.06,
  });
  const adLongGeo = new THREE.BoxGeometry(PITCH_LENGTH + 11.5, 1.32, 0.34);
  const adShortGeo = new THREE.BoxGeometry(0.34, 1.32, PITCH_WIDTH + 6.4);
  disposables.push(adTex, adMat, adLongGeo, adShortGeo);

  for (const sz of [-1, 1] as const) {
    const board = new THREE.Mesh(adLongGeo, adMat);
    // Front face at HALF_WIDTH + 2.88 keeps players (clamped at +2.8) clear while staying right behind touchline
    board.position.set(0, 0.66, sz * (HALF_WIDTH + 3.05));
    group.add(board);
  }
  for (const sx of [-1, 1] as const) {
    const board = new THREE.Mesh(adShortGeo, adMat);
    board.position.set(sx * (HALF_LENGTH + 5.6), 0.66, 0);
    group.add(board);
  }

  // 6. Tiered Daytime Stadium Stands & Spectators (secondary visual backdrop, InstancedMesh for mobile)
  const standMat = new THREE.MeshStandardMaterial({
    color: 0xb6c3cf,
    roughness: 0.82,
    metalness: 0.05,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0xdce6f0,
    roughness: 0.62,
    metalness: 0.22,
  });
  const towerMat = new THREE.MeshStandardMaterial({
    color: 0xc2ced9,
    roughness: 0.55,
    metalness: 0.3,
  });
  disposables.push(standMat, roofMat, towerMat);

  const standConfigs = [
    // North & South grandstands pushed back slightly so pitch + LED boards dominate gameplay framing
    { w: 128, h: 9.6, d: 13, x: 0, z: -HALF_WIDTH - 14.2, rotY: 0 },
    { w: 128, h: 9.6, d: 13, x: 0, z: HALF_WIDTH + 15.0, rotY: Math.PI },
    // East & West behind-goal stands
    { w: 80, h: 9.2, d: 12, x: -HALF_LENGTH - 14.0, z: 0, rotY: Math.PI / 2 },
    { w: 80, h: 9.2, d: 12, x: HALF_LENGTH + 14.0, z: 0, rotY: -Math.PI / 2 },
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
    const canopyGeo = new THREE.BoxGeometry(sc.w + 4, 0.65, sc.d * 0.92);
    disposables.push(canopyGeo);
    const canopy = new THREE.Mesh(canopyGeo, roofMat);
    canopy.position.set(0, sc.h + 2.3, -sc.d * 0.12);
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
    roughness: 0.78,
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
      const x = ((i * 13.7) % 118) - 59;
      const z = -HALF_WIDTH - 10.2 - tier * 4.2;
      const y = 3.3 + tier * 2.9;
      dummy.position.set(x, y, z);
    } else if (section === 1) {
      // West stand
      const z = ((i * 11.3) % 72) - 36;
      const x = -HALF_LENGTH - 10.2 - tier * 3.9;
      const y = 3.2 + tier * 2.75;
      dummy.position.set(x, y, z);
    } else {
      // East stand
      const z = ((i * 17.1) % 72) - 36;
      const x = HALF_LENGTH + 10.2 + tier * 3.9;
      const y = 3.2 + tier * 2.75;
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

  // 7. Four Daytime Stadium Light Masts (no night-time additive glow halos)
  const towerPoleGeo = new THREE.CylinderGeometry(0.42, 0.7, 27, 8);
  const towerHeadGeo = new THREE.BoxGeometry(5.2, 2.4, 0.75);
  const towerFaceMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    roughness: 0.4,
    metalness: 0.25,
  });
  disposables.push(towerPoleGeo, towerHeadGeo, towerFaceMat);

  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      const tx = sx * (HALF_LENGTH + 21);
      const tz = sz * (HALF_WIDTH + 20);

      const tower = new THREE.Mesh(towerPoleGeo, towerMat);
      tower.position.set(tx, 13.5, tz);
      group.add(tower);

      const head = new THREE.Mesh(towerHeadGeo, towerFaceMat);
      head.position.set(tx, 27.4, tz);
      head.lookAt(0, 0, 0);
      group.add(head);
    }
  }

  return {
    group,
    update: (elapsed: number, isGoalCelebration: boolean) => {
      // Gentle stadium breeze flutter on corner flags
      for (let i = 0; i < flagCloths.length; i++) {
        flagCloths[i].rotation.y = Math.sin(elapsed * 5.0 + i * 1.3) * 0.28;
      }

      // Dynamic LED ad-board highlight pulse during goal celebrations
      if (isGoalCelebration) {
        const pulse = 0.48 + Math.sin(elapsed * 12) * 0.24;
        adMat.emissive.setHex(0xffe082);
        adMat.emissiveIntensity = pulse;
      } else {
        adMat.emissive.setHex(0xffffff);
        adMat.emissiveIntensity = 0.28;
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
