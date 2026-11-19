import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BallVisual } from '../ball/ballMesh';
import { CameraController } from '../camera/cameraController';
import { buildStadium, StadiumResources } from '../core/stadiumMesh';
import { CameraMode, GameSettings, GameShellState } from '../core/types';
import { InputManager } from '../controls/inputManager';
import { MatchEngine } from '../game/matchEngine';
import { PlayerVisual } from '../players/playerMesh';

interface PitchSceneProps {
  engineRef: React.MutableRefObject<MatchEngine | null>;
  inputManager: InputManager;
  settings: GameSettings;
  shellState: GameShellState;
  cameraMode: CameraMode;
  teamVersion: number;
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

  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const stadiumRef = useRef<StadiumResources | null>(null);
  const playerVisualsRef = useRef<Map<string, PlayerVisual>>(new Map());
  const ballVisualRef = useRef<BallVisual | null>(null);
  const cameraCtrlRef = useRef<CameraController | null>(null);
  const keyLightRef = useRef<THREE.DirectionalLight | null>(null);
  const isSoftwareGlRef = useRef(false);

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

    for (const p of engine.players) {
      const kit = p.team === 'home' ? engine.homeTeam.kit : engine.awayTeam.kit;
      const pv = new PlayerVisual(p, kit);
      pv.sync(p, 0);
      scene.add(pv.root);
      playerVisualsRef.current.set(p.id, pv);
    }
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
    renderer.toneMappingExposure = 1.12;
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
    const skyColor = new THREE.Color(0x0b1524);
    scene.background = skyColor;
    scene.fog = new THREE.FogExp2(0x0b1524, 0.0022);
    sceneRef.current = scene;

    // Mandatory Studio Environment Reflections (RoomEnvironment)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmremGenerator.dispose();

    // Warm/Cool 3-Point Stadium Lighting
    const hemiLight = new THREE.HemisphereLight(0x9ec5ff, 0x1b3a24, 0.9);
    hemiLight.position.set(0, 50, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff4e0, 1.85);
    keyLight.position.set(28, 48, 32);
    keyLight.castShadow = !isSoftwareGl && settingsRef.current.quality !== 'low';
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 5;
    keyLight.shadow.camera.far = 140;
    keyLight.shadow.camera.left = -62;
    keyLight.shadow.camera.right = 62;
    keyLight.shadow.camera.top = 45;
    keyLight.shadow.camera.bottom = -45;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);
    keyLightRef.current = keyLight;

    const rimLight = new THREE.DirectionalLight(0x88b8ff, 0.55);
    rimLight.position.set(-34, 28, -36);
    scene.add(rimLight);

    const camera = new THREE.PerspectiveCamera(46, width / height, 0.5, 280);
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
        engine.step(dt, inputSnap);

        // Sync 3D visuals with live state or slow-motion goal replay proxy
        const visual = engine.getVisualState();
        const isGoalMoment = engine.phase === 'goal' || engine.isReplaying;
        stadiumRef.current?.update(elapsed, isGoalMoment);

        ballVisualRef.current?.sync(visual.ball, engine.isReplaying ? dt * 0.55 : dt);
        const shotCharge = engine.getShotCharge();
        const quality = settingsRef.current.quality;
        const allowShadowsGlobal = !isSoftwareGl && quality !== 'low';
        const shadowDistLimitSq = quality === 'high' ? 99999 : 34 * 34;

        for (const p of visual.players) {
          const pv = playerVisualsRef.current.get(p.id);
          if (!pv) continue;
          const dx = p.position.x - visual.ball.position.x;
          const dz = p.position.z - visual.ball.position.z;
          const allowShadow =
            allowShadowsGlobal &&
            (p.isControlled || dx * dx + dz * dz <= shadowDistLimitSq);
          pv.sync(p, elapsed, p.isControlled ? shotCharge : 0, allowShadow);
        }

        const controlled = visual.players.find((p) => p.isControlled) ?? null;
        cameraCtrl.update(
          camera,
          shellStateRef.current,
          cameraModeRef.current,
          visual.ball.position,
          controlled ? controlled.position : null,
          isGoalMoment,
          dt,
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
      className="fixed inset-0 w-full h-full bg-[#0b1524]"
    />
  );
}
