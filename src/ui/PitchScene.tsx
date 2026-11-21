import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { soundEngine } from '../audio/soundEngine';
import { BallVisual } from '../ball/ballMesh';
import { CameraController, CameraDynamicContext } from '../camera/cameraController';
import { buildStadium, StadiumResources } from '../core/stadiumMesh';
import { CameraMode, GameSettings, GameShellState, InputSnapshot, TeamSide } from '../core/types';
import { InputManager } from '../controls/inputManager';
import { MatchEngine } from '../game/matchEngine';
import {
  PlayerMaterialPool,
  PlayerShadowBatch,
  PlayerVisual,
} from '../players/playerMesh';

interface PitchSceneProps {
  engineRef: React.MutableRefObject<MatchEngine | null>;
  inputManager: InputManager;
  settings: GameSettings;
  shellState: GameShellState;
  cameraMode: CameraMode;
  teamVersion: number;
  onlineMode?: boolean;
  localSide?: TeamSide;
  onOnlineInput?: (input: InputSnapshot) => void;
  consumeRemoteAwayInput?: () => InputSnapshot | undefined;
  onCameraTraumaRef: React.MutableRefObject<((amount: number) => void) | null>;
  onContextLostChange?: (lost: boolean) => void;
}

function detectSoftwareGl(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export function PitchScene({
  engineRef,
  inputManager,
  settings,
  shellState,
  cameraMode,
  teamVersion,
  onlineMode = false,
  localSide = 'home',
  onOnlineInput,
  consumeRemoteAwayInput,
  onCameraTraumaRef,
  onContextLostChange,
}: PitchSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const shellStateRef = useRef(shellState);
  shellStateRef.current = shellState;

  const cameraModeRef = useRef(cameraMode);
  cameraModeRef.current = cameraMode;

  const onlineModeRef = useRef(onlineMode);
  onlineModeRef.current = onlineMode;

  const localSideRef = useRef<TeamSide>(localSide);
  localSideRef.current = localSide;

  const onOnlineInputRef = useRef(onOnlineInput);
  onOnlineInputRef.current = onOnlineInput;

  const consumeRemoteAwayInputRef = useRef(consumeRemoteAwayInput);
  consumeRemoteAwayInputRef.current = consumeRemoteAwayInput;

  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const stadiumRef = useRef<StadiumResources | null>(null);
  const playerVisualsRef = useRef<Map<string, PlayerVisual>>(new Map());
  const playerMaterialPoolRef = useRef<PlayerMaterialPool | null>(null);
  const playerShadowBatchRef = useRef<PlayerShadowBatch | null>(null);
  const ballVisualRef = useRef<BallVisual | null>(null);
  const cameraCtrlRef = useRef<CameraController | null>(null);
  const cameraContextRef = useRef<CameraDynamicContext>({
    ballVelocity: null,
    scorerPos: null,
    isReplaying: false,
  });
  const keyLightRef = useRef<THREE.DirectionalLight | null>(null);
  const isSoftwareGlRef = useRef(false);
  const crowdObserverRef = useRef({
    passes: 0,
    shots: 0,
    saves: 0,
    pulse: 0.25,
    initialized: false,
  });

  // Rebuild player 3D visuals whenever teams/kits change
  const rebuildPlayerVisuals = () => {
    const scene = sceneRef.current;
    const engine = engineRef.current;
    if (!scene || !engine) return;

    for (const pv of playerVisualsRef.current.values()) {
      scene.remove(pv.root);
      pv.dispose();
    }
    playerVisualsRef.current.clear();
    playerMaterialPoolRef.current?.dispose();

    const pool = new PlayerMaterialPool();
    playerMaterialPoolRef.current = pool;

    for (const p of engine.players) {
      const kit = p.team === 'home' ? engine.homeTeam.kit : engine.awayTeam.kit;
      const pv = new PlayerVisual(p, kit, pool);
      pv.sync(p, 0, 0, true, 0.016, engine.ball);
      scene.add(pv.root);
      playerVisualsRef.current.set(p.id, pv);
    }
    playerShadowBatchRef.current?.sync(engine.players);
  };

  // Mount Three.js renderer & stadium once
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareGl();
    isSoftwareGlRef.current = isSoftwareGl;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;
    renderer.setPixelRatio(
      isSoftwareGl
        ? 1
        : Math.min(
            window.devicePixelRatio || 1,
            settingsRef.current.quality === 'high' ? 2 : 1.5,
          ),
    );
    renderer.shadowMap.enabled =
      !isSoftwareGl && settingsRef.current.quality !== 'low';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    const skyColor = new THREE.Color(0x6fb7ec);
    scene.background = skyColor;
    // Very light daytime horizon haze — keeps entire 105m pitch crystal clear
    scene.fog = new THREE.Fog(0xb5ddf7, 145, 300);
    sceneRef.current = scene;

    // Mandatory Studio Environment Reflections (RoomEnvironment)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = 0.35;
    pmremGenerator.dispose();

    // Balanced Daylight Stadium 3-Point Rig (single shadow caster for mobile performance)
    const hemiLight = new THREE.HemisphereLight(0xd8eeff, 0x3b6620, 0.85);
    hemiLight.position.set(0, 55, 0);
    scene.add(hemiLight);

    const sunOffsetX = 32;
    const sunOffsetY = 50;
    const sunOffsetZ = 22;
    const keyLight = new THREE.DirectionalLight(0xfff4dc, 1.55);
    keyLight.position.set(sunOffsetX, sunOffsetY, sunOffsetZ);
    keyLight.target.position.set(0, 0, 0);
    scene.add(keyLight.target);
    keyLight.castShadow = !isSoftwareGl && settingsRef.current.quality !== 'low';
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.radius = 2.5;
    keyLight.shadow.camera.near = 10;
    keyLight.shadow.camera.far = 135;
    // Tight action-centered shadow frustum for crisp mobile shadows at 1024x1024
    keyLight.shadow.camera.left = -38;
    keyLight.shadow.camera.right = 38;
    keyLight.shadow.camera.top = 30;
    keyLight.shadow.camera.bottom = -30;
    keyLight.shadow.bias = -0.0004;
    keyLight.shadow.normalBias = 0.025;
    scene.add(keyLight);
    keyLightRef.current = keyLight;

    const fillLight = new THREE.DirectionalLight(0xc2e1ff, 0.32);
    fillLight.position.set(-34, 30, -32);
    scene.add(fillLight);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.5, 290);
    const cameraCtrl = new CameraController();
    cameraCtrlRef.current = cameraCtrl;
    onCameraTraumaRef.current = (amt: number) => cameraCtrl.addTrauma(amt);

    const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const stadium = buildStadium(maxAnisotropy, settingsRef.current.quality);
    scene.add(stadium.group);
    stadiumRef.current = stadium;

    const ballVisual = new BallVisual(maxAnisotropy);
    scene.add(ballVisual.group);
    ballVisualRef.current = ballVisual;

    const shadowBatch = new PlayerShadowBatch(24);
    scene.add(shadowBatch.mesh);
    playerShadowBatchRef.current = shadowBatch;

    rebuildPlayerVisuals();

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      onContextLostChange?.(true);
    };
    const handleContextRestored = () => {
      onContextLostChange?.(false);
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = Math.max(1, entry.contentRect.width);
      const h = Math.max(1, entry.contentRect.height);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    let disposed = false;
    let frameId = 0;
    let lastTime = performance.now();
    let elapsed = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync?.(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;

      const now = performance.now();
      const rawDt = Math.max(0.001, (now - lastTime) / 1000);
      lastTime = now;
      const dt = Math.min(rawDt, 0.05);
      elapsed += dt;

      const engine = engineRef.current;
      if (engine) {
        engine.shellState = shellStateRef.current;
        engine.cameraMode = cameraModeRef.current;

        const inputSnap = inputManager.consumeSnapshot();
        if (onlineModeRef.current && shellStateRef.current === 'playing') {
          onOnlineInputRef.current?.(inputSnap);
        }
        const remoteAwayInput =
          onlineModeRef.current && shellStateRef.current === 'playing'
            ? consumeRemoteAwayInputRef.current?.()
            : undefined;
        engine.step(dt, inputSnap, remoteAwayInput);

        // Sync 3D visuals with live state or slow-motion goal replay proxy
        const visual = engine.getVisualState();
        const isGoalMoment = engine.phase === 'goal' || engine.isReplaying;

        // Read-only match event observer for stadium applause, dangerous-shot reactions & crowd energy (0 allocations)
        const obs = crowdObserverRef.current;
        const totalPasses = engine.stats.homePasses + engine.stats.awayPasses;
        const totalShots = engine.stats.homeShots + engine.stats.awayShots;
        const totalSaves = engine.stats.homeSaves + engine.stats.awaySaves;
        if (
          !obs.initialized ||
          totalPasses < obs.passes ||
          totalShots < obs.shots ||
          totalSaves < obs.saves
        ) {
          obs.passes = totalPasses;
          obs.shots = totalShots;
          obs.saves = totalSaves;
          obs.initialized = true;
        } else if (shellStateRef.current === 'playing' && !engine.isReplaying) {
          const absBallX = Math.abs(visual.ball.position.x);
          const ballSpeed = Math.hypot(visual.ball.velocity.x, visual.ball.velocity.z);
          if (totalShots > obs.shots) {
            obs.shots = totalShots;
            if (ballSpeed > 18 || absBallX > 25) {
              soundEngine.playCrowdReaction('ooh');
              obs.pulse = Math.max(obs.pulse, 0.9);
            }
          }
          if (totalSaves > obs.saves) {
            obs.saves = totalSaves;
            soundEngine.playCrowdReaction('applause');
            obs.pulse = Math.max(obs.pulse, 0.85);
          }
          if (totalPasses > obs.passes) {
            obs.passes = totalPasses;
            if (absBallX > 16) {
              soundEngine.playCrowdReaction('applause');
              obs.pulse = Math.max(obs.pulse, 0.72);
            }
          }
        }
        const baseCrowdEnergy = isGoalMoment
          ? 1.0
          : shellStateRef.current === 'playing'
            ? 0.28 + Math.min(0.45, Math.abs(visual.ball.position.x) / 72)
            : 0.24;
        obs.pulse = Math.max(baseCrowdEnergy, obs.pulse - dt * 0.24);
        stadiumRef.current?.update(elapsed, isGoalMoment, obs.pulse);

        const animDt = engine.isReplaying ? dt * 0.55 : dt;
        const ballCarrier = visual.ball.ownerId
          ? (visual.players.find((p) => p.id === visual.ball.ownerId) ?? null)
          : null;
        const isLiveGoalCelebration = engine.phase === 'goal' && !engine.isReplaying;
        ballVisualRef.current?.sync(visual.ball, animDt, ballCarrier, isLiveGoalCelebration);
        const activeSide = onlineModeRef.current ? localSideRef.current : 'home';
        const shotCharge = engine.getShotCharge(activeSide);
        const quality = settingsRef.current.quality;
        const allowShadowsGlobal = !isSoftwareGl && quality !== 'low';
        const shadowDistLimitSq = quality === 'high' ? 99999 : 34 * 34;
        const isPlayingView = shellStateRef.current === 'playing';

        // Identify the goal scorer read-only during goal broadcast presentation (zero gameplay modification)
        let goalScorerPlayer = null;
        if (isGoalMoment) {
          const scorerName = engine.stats.lastScorerName ?? visual.ball.lastTouchPlayerName;
          const scorerTeam = engine.stats.lastScorerTeam ?? visual.ball.lastTouchTeam;
          if (scorerName) {
            goalScorerPlayer =
              visual.players.find(
                (p) => p.name === scorerName && (!scorerTeam || p.team === scorerTeam),
              ) ?? null;
          }
        }

        for (const p of visual.players) {
          const pv = playerVisualsRef.current.get(p.id);
          if (!pv) continue;
          const isLocalControlled = p.isControlled && p.team === activeSide;
          const isActiveBallCarrier = ballCarrier !== null && ballCarrier.id === p.id;
          const isGoalScorer = goalScorerPlayer !== null && goalScorerPlayer.id === p.id;
          const dx = p.position.x - visual.ball.position.x;
          const dz = p.position.z - visual.ball.position.z;
          const allowShadow =
            allowShadowsGlobal &&
            (isLocalControlled || isGoalScorer || dx * dx + dz * dz <= shadowDistLimitSq);
          pv.sync(
            p,
            elapsed,
            isLocalControlled ? shotCharge : 0,
            allowShadow,
            animDt,
            visual.ball,
            isPlayingView && (isLocalControlled || isActiveBallCarrier || isGoalScorer),
            isGoalScorer,
          );
        }
        playerShadowBatchRef.current?.sync(visual.players);

        const controlled =
          visual.players.find((p) => p.isControlled && p.team === activeSide) ??
          visual.players.find((p) => p.isControlled) ??
          null;

        // Keep tight directional sun shadow frustum centered around active play
        if (allowShadowsGlobal) {
          const shadowCenterX = THREE.MathUtils.clamp(visual.ball.position.x, -34, 34);
          const shadowCenterZ = THREE.MathUtils.clamp(visual.ball.position.z, -16, 16);
          keyLight.target.position.set(shadowCenterX, 0, shadowCenterZ);
          keyLight.position.set(
            shadowCenterX + sunOffsetX,
            sunOffsetY,
            shadowCenterZ + sunOffsetZ,
          );
          keyLight.target.updateMatrixWorld();
        }

        const camCtx = cameraContextRef.current;
        camCtx.ballVelocity = visual.ball.velocity;
        camCtx.scorerPos = goalScorerPlayer ? goalScorerPlayer.position : null;
        camCtx.isReplaying = engine.isReplaying;

        cameraCtrl.update(
          camera,
          shellStateRef.current,
          cameraModeRef.current,
          visual.ball.position,
          controlled ? controlled.position : null,
          isGoalMoment,
          dt,
          camCtx,
        );
      }

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    if (isSoftwareGl) {
      frameId = window.setTimeout(tick, 16);
    } else {
      frameId = requestAnimationFrame(tick);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);

      for (const pv of playerVisualsRef.current.values()) {
        pv.dispose();
      }
      playerVisualsRef.current.clear();
      playerMaterialPoolRef.current?.dispose();
      playerMaterialPoolRef.current = null;
      shadowBatch.dispose();
      playerShadowBatchRef.current = null;
      ballVisual.dispose();
      stadium.dispose();
      envTarget.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update renderer quality, shadows, and mobile crowd LOD without recreating scene
  useEffect(() => {
    stadiumRef.current?.setQuality(settings.quality);

    const renderer = rendererRef.current;
    const keyLight = keyLightRef.current;
    if (!renderer || isSoftwareGlRef.current) return;

    const ratio =
      settings.quality === 'low'
        ? 1
        : settings.quality === 'medium'
          ? Math.min(window.devicePixelRatio || 1, 1.5)
          : Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(ratio);
    const shadowsOn = settings.quality !== 'low';
    renderer.shadowMap.enabled = shadowsOn;
    if (keyLight) keyLight.castShadow = shadowsOn;
  }, [settings.quality]);

  // Rebuild players when teams/kits change
  useEffect(() => {
    rebuildPlayerVisuals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamVersion]);

  // Snap camera quickly when transitioning from title -> playing
  useEffect(() => {
    if (shellState === 'playing' && engineRef.current && cameraCtrlRef.current) {
      cameraCtrlRef.current.snapToGameplay(engineRef.current.ball.position, cameraMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shellState]);

  return (
    <div
      ref={mountRef}
      data-testid="pitch-canvas-container"
      className="fixed inset-0 w-full h-full bg-[#7cc0f0]"
    />
  );
}
