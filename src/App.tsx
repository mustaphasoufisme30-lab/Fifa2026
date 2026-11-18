import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { soundEngine } from './audio/soundEngine';
import { InputManager } from './controls/inputManager';
import { loadSavedState, saveState } from './core/storage';
import {
  CameraMode,
  FormationId,
  GameSettings,
  GameShellState,
  MatchHudSnapshot,
  MatchStats,
  SavedState,
  TacticalMentality,
} from './core/types';
import { MatchEngine } from './game/matchEngine';
import { getTeamById } from './teams/teams';
import { MatchHud } from './ui/MatchHud';
import { FullTimeModal, PauseModal, TitleSettingsDrawer } from './ui/Modals';
import { PitchScene } from './ui/PitchScene';
import { TitlePanel, TitleScreen } from './ui/TitleScreen';

const CAMERA_CYCLE: CameraMode[] = ['tv', 'close', 'player'];

export default function App() {
  const [saved, setSaved] = useState<SavedState>(() => loadSavedState());
  const [shellState, setShellState] = useState<GameShellState>('title');
  const [activePanel, setActivePanel] = useState<TitlePanel>(null);
  const [teamVersion, setTeamVersion] = useState(0);
  const [contextLost, setContextLost] = useState(false);

  const homeTeam = useMemo(() => getTeamById(saved.homeTeamId), [saved.homeTeamId]);
  const awayTeam = useMemo(() => getTeamById(saved.awayTeamId), [saved.awayTeamId]);

  const [hudSnapshot, setHudSnapshot] = useState<MatchHudSnapshot>(() => ({
    shellState: 'title',
    phase: 'kickoff',
    half: 1,
    matchMinutes: 0,
    matchSeconds: 0,
    homeScore: 0,
    awayScore: 0,
    homeShort: homeTeam.shortName,
    awayShort: awayTeam.shortName,
    homeColor: homeTeam.kit.primary,
    awayColor: awayTeam.kit.primary,
    homeFormation: saved.homeFormation,
    homeMentality: saved.homeMentality,
    controlledPlayerName: homeTeam.roster[9].name,
    controlledPlayerNumber: homeTeam.roster[9].number,
    controlledPlayerRole: homeTeam.roster[9].role,
    controlledStamina: 100,
    controlledHasBall: false,
    controlledShotCharge: 0,
    cameraMode: saved.settings.cameraMode,
    isReplaying: false,
    setPieceBanner: null,
    goalBanner: null,
    stats: {
      homeScore: 0,
      awayScore: 0,
      homeShots: 0,
      awayShots: 0,
      homePasses: 0,
      awayPasses: 0,
      homeSaves: 0,
      awaySaves: 0,
      homeCorners: 0,
      awayCorners: 0,
      homeFouls: 0,
      awayFouls: 0,
      homePossessionSeconds: 0,
      awayPossessionSeconds: 0,
      lastScorerName: null,
      lastScorerTeam: null,
      lastGoalMinute: null,
    },
    radarBall: { x: 0, z: 0 },
    radarPlayers: [],
  }));

  const inputManager = useMemo(() => new InputManager(), []);
  const cameraTraumaRef = useRef<((amount: number) => void) | null>(null);
  const engineRef = useRef<MatchEngine | null>(null);

  const persist = useCallback((next: SavedState) => {
    setSaved(next);
    saveState(next);
  }, []);

  // Initialize MatchEngine once
  if (!engineRef.current) {
    engineRef.current = new MatchEngine(
      homeTeam,
      awayTeam,
      saved.homeFormation,
      saved.awayFormation,
      saved.settings.halfDurationSeconds,
      saved.settings.cameraMode,
      {
        onHudUpdate: (snap) => {
          setHudSnapshot(snap);
          if (snap.shellState === 'gameover') {
            setShellState('gameover');
          }
        },
        onCameraTrauma: (amt) => cameraTraumaRef.current?.(amt),
        onMatchFinished: (finalStats: MatchStats) => {
          setSaved((prev) => {
            const win = finalStats.homeScore > finalStats.awayScore ? 1 : 0;
            const draw = finalStats.homeScore === finalStats.awayScore ? 1 : 0;
            const loss = finalStats.homeScore < finalStats.awayScore ? 1 : 0;
            const next: SavedState = {
              ...prev,
              career: {
                matchesPlayed: prev.career.matchesPlayed + 1,
                wins: prev.career.wins + win,
                draws: prev.career.draws + draw,
                losses: prev.career.losses + loss,
                goalsScored: prev.career.goalsScored + finalStats.homeScore,
              },
            };
            saveState(next);
            return next;
          });
        },
      },
      saved.homeMentality,
      saved.awayMentality,
    );
  }

  // Keep body data-state mirrored
  useEffect(() => {
    document.body.dataset.state = shellState;
  }, [shellState]);

  // Sync sound setting
  useEffect(() => {
    soundEngine.setEnabled(saved.settings.soundEnabled);
  }, [saved.settings.soundEnabled]);

  const startMatch = useCallback(() => {
    setActivePanel(null);
    inputManager.clearAll();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const engine = engineRef.current;
    if (engine) {
      engine.startNewMatch(
        homeTeam,
        awayTeam,
        saved.homeFormation,
        saved.awayFormation,
        saved.settings.halfDurationSeconds,
        saved.homeMentality,
        saved.awayMentality,
      );
      setTeamVersion((v) => v + 1);
    }
    setShellState('playing');
    document.body.dataset.state = 'playing';
  }, [
    awayTeam,
    homeTeam,
    inputManager,
    saved.awayFormation,
    saved.awayMentality,
    saved.homeFormation,
    saved.homeMentality,
    saved.settings.halfDurationSeconds,
  ]);

  const handleTogglePause = useCallback(() => {
    setShellState((prev) => {
      if (prev === 'playing') {
        inputManager.clearAll();
        document.body.dataset.state = 'paused';
        return 'paused';
      }
      if (prev === 'paused') {
        inputManager.clearAll();
        document.body.dataset.state = 'playing';
        return 'playing';
      }
      return prev;
    });
  }, [inputManager]);

  const handleCycleCamera = useCallback(() => {
    setSaved((prev) => {
      const idx = CAMERA_CYCLE.indexOf(prev.settings.cameraMode);
      const nextCam = CAMERA_CYCLE[(idx + 1) % CAMERA_CYCLE.length];
      const next: SavedState = {
        ...prev,
        settings: { ...prev.settings, cameraMode: nextCam },
      };
      saveState(next);
      if (engineRef.current) {
        engineRef.current.cameraMode = nextCam;
        engineRef.current.emitHudSnapshot();
      }
      return next;
    });
  }, []);

  const handleToggleSound = useCallback(() => {
    setSaved((prev) => {
      const nextSound = !prev.settings.soundEnabled;
      soundEngine.setEnabled(nextSound);
      const next: SavedState = {
        ...prev,
        settings: { ...prev.settings, soundEnabled: nextSound },
      };
      saveState(next);
      return next;
    });
  }, []);

  // Attach global keyboard input & pause shortcut
  useEffect(() => {
    inputManager.onPauseToggle = handleTogglePause;
    inputManager.onCameraCycle = handleCycleCamera;
    inputManager.onMuteToggle = handleToggleSound;
    inputManager.attach();

    return () => {
      inputManager.detach();
    };
  }, [handleCycleCamera, handleTogglePause, handleToggleSound, inputManager]);

  // Support ?autostart=1 for instant gameplay boot
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      startMatch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUpdateTeams = (homeId: string, awayId: string) => {
    const next: SavedState = {
      ...saved,
      homeTeamId: homeId,
      awayTeamId: awayId,
    };
    persist(next);
    if (engineRef.current) {
      engineRef.current.homeTeam = getTeamById(homeId);
      engineRef.current.awayTeam = getTeamById(awayId);
      engineRef.current.rebuildTeams();
      engineRef.current.emitHudSnapshot();
      setTeamVersion((v) => v + 1);
    }
  };

  const handleSelectFormation = (formationId: FormationId, rebuildIfTitle = true) => {
    const next: SavedState = {
      ...saved,
      homeFormation: formationId,
    };
    persist(next);
    if (engineRef.current) {
      engineRef.current.homeFormation = formationId;
      if (rebuildIfTitle && shellState === 'title') {
        engineRef.current.rebuildTeams();
        setTeamVersion((v) => v + 1);
      }
      engineRef.current.emitHudSnapshot();
    }
  };

  const handleSelectAwayFormation = (formationId: FormationId) => {
    const next: SavedState = {
      ...saved,
      awayFormation: formationId,
    };
    persist(next);
    if (engineRef.current) {
      engineRef.current.awayFormation = formationId;
      if (shellState === 'title') {
        engineRef.current.rebuildTeams();
        setTeamVersion((v) => v + 1);
      }
      engineRef.current.emitHudSnapshot();
    }
  };

  const handleSelectMentality = (mentality: TacticalMentality) => {
    const next: SavedState = {
      ...saved,
      homeMentality: mentality,
    };
    persist(next);
    if (engineRef.current) {
      engineRef.current.homeMentality = mentality;
      engineRef.current.emitHudSnapshot();
    }
  };

  const handleUpdateSettings = (patch: Partial<GameSettings>) => {
    const next: SavedState = {
      ...saved,
      settings: { ...saved.settings, ...patch },
    };
    persist(next);
    if (engineRef.current && patch.cameraMode) {
      engineRef.current.cameraMode = patch.cameraMode;
      engineRef.current.emitHudSnapshot();
    }
  };

  const handleReturnToTitle = () => {
    inputManager.clearAll();
    setShellState('title');
    if (engineRef.current) {
      engineRef.current.shellState = 'title';
      engineRef.current.rebuildTeams();
    }
  };

  return (
    <main className="relative w-full h-full overflow-hidden bg-[#0b1524]">
      {/* Isolated 3D WebGL Stadium Viewport */}
      <PitchScene
        engineRef={engineRef}
        inputManager={inputManager}
        settings={saved.settings}
        shellState={shellState}
        cameraMode={saved.settings.cameraMode}
        teamVersion={teamVersion}
        onCameraTraumaRef={cameraTraumaRef}
        onContextLostChange={setContextLost}
      />

      {contextLost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#060d17]/95 text-center p-6">
          <div>
            <h2 className="font-display font-bold text-2xl text-white">
              Graphics Context Restoring...
            </h2>
            <p className="text-sm text-slate-300 mt-1">
              Your match state is preserved.
            </p>
          </div>
        </div>
      )}

      {/* Title Screen */}
      {shellState === 'title' && (
        <>
          <TitleScreen
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            homeFormation={saved.homeFormation}
            career={saved.career}
            onStartMatch={startMatch}
            onOpenPanel={setActivePanel}
          />
          <TitleSettingsDrawer
            panel={activePanel}
            homeTeamId={saved.homeTeamId}
            awayTeamId={saved.awayTeamId}
            homeFormation={saved.homeFormation}
            awayFormation={saved.awayFormation}
            homeMentality={saved.homeMentality}
            settings={saved.settings}
            onClose={() => setActivePanel(null)}
            onSelectHomeTeam={(id) =>
              handleUpdateTeams(id, id === saved.awayTeamId ? saved.homeTeamId : saved.awayTeamId)
            }
            onSelectAwayTeam={(id) =>
              handleUpdateTeams(id === saved.homeTeamId ? saved.awayTeamId : saved.homeTeamId, id)
            }
            onSelectFormation={(id) => handleSelectFormation(id, true)}
            onSelectAwayFormation={handleSelectAwayFormation}
            onSelectMentality={handleSelectMentality}
            onUpdateSettings={handleUpdateSettings}
          />
        </>
      )}

      {/* Live Playing HUD */}
      {(shellState === 'playing' || shellState === 'paused') && (
        <MatchHud
          snapshot={hudSnapshot}
          inputManager={inputManager}
          soundEnabled={saved.settings.soundEnabled}
          showTouchControls={saved.settings.showTouchControls}
          onCycleCamera={handleCycleCamera}
          onToggleSound={handleToggleSound}
          onPause={handleTogglePause}
          onSkipReplay={() => engineRef.current?.skipReplay()}
        />
      )}

      {/* Pause Modal */}
      {shellState === 'paused' && (
        <PauseModal
          homeFormation={saved.homeFormation}
          homeMentality={saved.homeMentality}
          onSelectFormation={(id) => handleSelectFormation(id, false)}
          onSelectMentality={handleSelectMentality}
          onResume={handleTogglePause}
          onRestart={startMatch}
          onMainMenu={handleReturnToTitle}
        />
      )}

      {/* Full Time Modal */}
      {shellState === 'gameover' && (
        <FullTimeModal
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          stats={hudSnapshot.stats}
          onPlayAgain={startMatch}
          onMainMenu={handleReturnToTitle}
        />
      )}
    </main>
  );
}
