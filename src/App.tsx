import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { computeCrowdIntensity } from './audio/crowdLogic';
import { soundEngine } from './audio/soundEngine';
import { InputManager } from './controls/inputManager';
import { probeNetworkConnection } from './core/networkGuard';
import { loadSavedState, saveState } from './core/storage';
import {
  CameraMode,
  CustomPlayerProfile,
  FormationId,
  GameSettings,
  GameShellState,
  MatchHudSnapshot,
  MatchStats,
  SavedState,
  TacticalMentality,
  TeamConfig,
  TournamentMatch,
} from './core/types';
import { MatchEngine } from './game/matchEngine';
import {
  createTournament,
  getRoundLabel,
  recordUserTournamentMatchResult,
  simulateUserTournamentMatch,
} from './game/tournament';
import { applyCustomPlayerToTeam } from './players/customPlayer';
import { getTeamById, TEAMS } from './teams/teams';
import { MatchHud } from './ui/MatchHud';
import {
  FullTimeModal,
  PauseModal,
  TitleSettingsDrawer,
  TournamentMatchSummary,
} from './ui/Modals';
import { OfflineGateModal } from './ui/OfflineGateModal';
import { PitchScene } from './ui/PitchScene';
import { PlayerStudioModal } from './ui/PlayerStudioModal';
import { TitlePanel, TitleScreen } from './ui/TitleScreen';
import { TournamentScreen } from './ui/TournamentScreen';

const CAMERA_CYCLE: CameraMode[] = ['tv', 'close', 'player'];

export default function App() {
  const [saved, setSaved] = useState<SavedState>(() => loadSavedState());
  const [shellState, setShellState] = useState<GameShellState>('title');
  const [activePanel, setActivePanel] = useState<TitlePanel>(null);
  const [teamVersion, setTeamVersion] = useState(0);
  const [contextLost, setContextLost] = useState(false);
  const [activeTournamentMatch, setActiveTournamentMatch] =
    useState<TournamentMatch | null>(null);
  const [lastTournamentSummary, setLastTournamentSummary] =
    useState<TournamentMatchSummary | null>(null);
  const [activeMatchTeams, setActiveMatchTeams] = useState<{
    home: TeamConfig;
    away: TeamConfig;
  } | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [checkingNetwork, setCheckingNetwork] = useState(false);

  const savedRef = useRef(saved);
  savedRef.current = saved;
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;
  const activeTournamentMatchRef = useRef<TournamentMatch | null>(null);

  const baseHomeTeam = useMemo(() => getTeamById(saved.homeTeamId), [saved.homeTeamId]);
  const homeTeam = useMemo(
    () => applyCustomPlayerToTeam(baseHomeTeam, saved.customPlayer),
    [baseHomeTeam, saved.customPlayer],
  );
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
    savedRef.current = next;
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
          const prev = savedRef.current;
          const activeTourney = activeTournamentMatchRef.current;
          const win = finalStats.homeScore > finalStats.awayScore ? 1 : 0;
          const draw = finalStats.homeScore === finalStats.awayScore ? 1 : 0;
          const loss = finalStats.homeScore < finalStats.awayScore ? 1 : 0;

          let nextTournament = prev.tournament;
          let wonTrophy = 0;

          if (activeTourney && prev.tournament) {
            const updated = recordUserTournamentMatchResult(
              prev.tournament,
              activeTourney.id,
              finalStats.homeScore,
              finalStats.awayScore,
              TEAMS,
            );
            const completed = updated.matches.find((m) => m.id === activeTourney.id);
            const advanced = completed?.winnerTeamId === updated.userTeamId;
            const isChampion = updated.status === 'champion';
            if (isChampion) wonTrophy = 1;

            nextTournament = updated;
            setLastTournamentSummary({
              roundLabel: getRoundLabel(activeTourney.round),
              advanced,
              isChampion,
              homePenalties: completed?.homePenalties ?? null,
              awayPenalties: completed?.awayPenalties ?? null,
            });
            activeTournamentMatchRef.current = null;
            setActiveTournamentMatch(null);
          } else {
            setLastTournamentSummary(null);
          }

          const next: SavedState = {
            ...prev,
            career: {
              matchesPlayed: prev.career.matchesPlayed + 1,
              wins: prev.career.wins + win,
              draws: prev.career.draws + draw,
              losses: prev.career.losses + loss,
              goalsScored: prev.career.goalsScored + finalStats.homeScore,
              trophiesWon: prev.career.trophiesWon + wonTrophy,
            },
            tournament: nextTournament,
          };
          persist(next);
        },
      },
      saved.homeMentality,
      saved.awayMentality,
    );
  }

  // Keep body data-state & online status mirrored
  useEffect(() => {
    document.body.dataset.state = shellState;
  }, [shellState]);

  useEffect(() => {
    document.body.dataset.online = isOnline ? 'true' : 'false';
  }, [isOnline]);

  // Sync sound setting & stadium spectator ambience with shell/connectivity state
  useEffect(() => {
    soundEngine.setEnabled(saved.settings.soundEnabled && isOnline);
    if (!isOnline || shellState !== 'playing') {
      soundEngine.updateCrowdIntensity(
        computeCrowdIntensity({
          shellState,
          phase: hudSnapshot.phase,
          ballX: 0,
          ballSpeed: 0,
          isReplaying: hudSnapshot.isReplaying,
          isOnline,
        }),
      );
    }
  }, [
    hudSnapshot.isReplaying,
    hudSnapshot.phase,
    isOnline,
    saved.settings.soundEnabled,
    shellState,
  ]);

  const verifyConnection = useCallback(async () => {
    setCheckingNetwork(true);
    const result = await probeNetworkConnection();
    isOnlineRef.current = result.online;
    setIsOnline(result.online);
    setCheckingNetwork(false);
    if (!result.online) {
      inputManager.clearAll();
      soundEngine.updateCrowdIntensity(0);
      setShellState((prev) => {
        if (prev === 'playing') {
          document.body.dataset.state = 'paused';
          return 'paused';
        }
        return prev;
      });
    }
  }, [inputManager]);

  // Enforce online-only operation: instant offline event + periodic live reachability check
  useEffect(() => {
    const handleOffline = () => {
      isOnlineRef.current = false;
      setIsOnline(false);
      inputManager.clearAll();
      soundEngine.updateCrowdIntensity(0);
      setShellState((prev) => {
        if (prev === 'playing') {
          document.body.dataset.state = 'paused';
          return 'paused';
        }
        return prev;
      });
    };

    const handleOnline = () => {
      void verifyConnection();
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    // Initial live reachability probe
    void verifyConnection();

    // Periodic check catches silent connection drops while tab is active
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void verifyConnection();
      }
    }, 15000);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      window.clearInterval(interval);
    };
  }, [inputManager, verifyConnection]);

  const startMatch = useCallback(() => {
    if (!isOnlineRef.current) return;
    setActivePanel(null);
    activeTournamentMatchRef.current = null;
    setActiveTournamentMatch(null);
    setLastTournamentSummary(null);
    setActiveMatchTeams({ home: homeTeam, away: awayTeam });
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

  const handleOpenTournament = useCallback(() => {
    if (!isOnlineRef.current) return;
    setActivePanel(null);
    activeTournamentMatchRef.current = null;
    setActiveTournamentMatch(null);
    setLastTournamentSummary(null);
    inputManager.clearAll();

    const cur = savedRef.current;
    if (!cur.tournament) {
      const created = createTournament(cur.homeTeamId, TEAMS);
      persist({ ...cur, tournament: created });
    }
    if (engineRef.current) {
      engineRef.current.shellState = 'tournament';
    }
    setShellState('tournament');
    document.body.dataset.state = 'tournament';
  }, [inputManager, persist]);

  const handleSelectTournamentClub = useCallback(
    (teamId: string) => {
      const cur = savedRef.current;
      const freshCup = createTournament(teamId, TEAMS);
      const nextAwayId =
        cur.awayTeamId === teamId ? cur.homeTeamId : cur.awayTeamId;
      persist({
        ...cur,
        homeTeamId: teamId,
        awayTeamId: nextAwayId === teamId ? TEAMS.find((t) => t.id !== teamId)!.id : nextAwayId,
        tournament: freshCup,
      });
    },
    [persist],
  );

  const handleNewTournament = useCallback(
    (teamId: string) => {
      const cur = savedRef.current;
      const freshCup = createTournament(teamId, TEAMS);
      persist({
        ...cur,
        tournament: freshCup,
      });
    },
    [persist],
  );

  const handlePlayTournamentMatch = useCallback(
    (match: TournamentMatch) => {
      if (!isOnlineRef.current) return;
      if (!match.homeTeamId || !match.awayTeamId) return;
      const cur = savedRef.current;
      const userTeamId = cur.tournament?.userTeamId ?? match.homeTeamId;

      const baseHome = getTeamById(match.homeTeamId);
      const baseAway = getTeamById(match.awayTeamId);
      const matchHome =
        baseHome.id === userTeamId
          ? applyCustomPlayerToTeam(baseHome, cur.customPlayer)
          : baseHome;
      const matchAway =
        baseAway.id === userTeamId
          ? applyCustomPlayerToTeam(baseAway, cur.customPlayer)
          : baseAway;

      setActivePanel(null);
      activeTournamentMatchRef.current = match;
      setActiveTournamentMatch(match);
      setLastTournamentSummary(null);
      setActiveMatchTeams({ home: matchHome, away: matchAway });
      inputManager.clearAll();
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      const engine = engineRef.current;
      if (engine) {
        engine.startNewMatch(
          matchHome,
          matchAway,
          cur.homeFormation,
          cur.awayFormation,
          cur.settings.halfDurationSeconds,
          cur.homeMentality,
          cur.awayMentality,
        );
        setTeamVersion((v) => v + 1);
      }
      setShellState('playing');
      document.body.dataset.state = 'playing';
    },
    [inputManager],
  );

  const handleSimulateTournamentMatch = useCallback(() => {
    const cur = savedRef.current;
    if (!cur.tournament || cur.tournament.status !== 'active') return;
    const prevStatus = cur.tournament.status;
    const nextTournament = simulateUserTournamentMatch(cur.tournament, TEAMS);
    const wonTrophy =
      prevStatus === 'active' && nextTournament.status === 'champion' ? 1 : 0;

    persist({
      ...cur,
      career: {
        ...cur.career,
        trophiesWon: cur.career.trophiesWon + wonTrophy,
      },
      tournament: nextTournament,
    });
  }, [persist]);

  const handleReturnToBracket = useCallback(() => {
    inputManager.clearAll();
    activeTournamentMatchRef.current = null;
    setActiveTournamentMatch(null);
    setLastTournamentSummary(null);
    if (engineRef.current) {
      engineRef.current.shellState = 'tournament';
      engineRef.current.rebuildTeams();
    }
    setShellState('tournament');
    document.body.dataset.state = 'tournament';
  }, [inputManager]);

  const handleTogglePause = useCallback(() => {
    if (!isOnlineRef.current) return;
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

  // Support ?autostart=1 or ?autostart=tournament for instant boot
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      startMatch();
    } else if (params.get('autostart') === 'tournament') {
      handleOpenTournament();
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
      engineRef.current.homeTeam = applyCustomPlayerToTeam(
        getTeamById(homeId),
        next.customPlayer,
      );
      engineRef.current.awayTeam = getTeamById(awayId);
      engineRef.current.rebuildTeams();
      engineRef.current.emitHudSnapshot();
      setTeamVersion((v) => v + 1);
    }
  };

  const handleSaveCustomPlayer = (customPlayer: CustomPlayerProfile) => {
    const next: SavedState = {
      ...saved,
      customPlayer,
    };
    persist(next);
    if (engineRef.current) {
      engineRef.current.homeTeam = applyCustomPlayerToTeam(
        getTeamById(next.homeTeamId),
        customPlayer,
      );
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
    activeTournamentMatchRef.current = null;
    setActiveTournamentMatch(null);
    setLastTournamentSummary(null);
    setShellState('title');
    document.body.dataset.state = 'title';
    if (engineRef.current) {
      engineRef.current.shellState = 'title';
      engineRef.current.rebuildTeams();
    }
  };

  const currentTournament = useMemo(
    () => saved.tournament ?? createTournament(saved.homeTeamId, TEAMS, 1),
    [saved.homeTeamId, saved.tournament],
  );

  const tournamentBadge =
    saved.tournament?.status === 'active'
      ? getRoundLabel(saved.tournament.currentRound)
      : null;

  return (
    <main className="relative w-full h-full overflow-hidden bg-[#0b1524]">
      {/* Isolated 3D WebGL Stadium Viewport */}
      <PitchScene
        engineRef={engineRef}
        inputManager={inputManager}
        settings={saved.settings}
        shellState={isOnline ? shellState : 'paused'}
        cameraMode={saved.settings.cameraMode}
        teamVersion={teamVersion}
        onCameraTraumaRef={cameraTraumaRef}
        onContextLostChange={setContextLost}
      />

      {!isOnline && (
        <OfflineGateModal
          checking={checkingNetwork}
          onRetry={() => void verifyConnection()}
        />
      )}

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
            customPlayerLabel={
              saved.customPlayer.enabled
                ? `#${saved.customPlayer.number} ${saved.customPlayer.name}`
                : null
            }
            tournamentBadge={tournamentBadge}
            onStartMatch={startMatch}
            onOpenTournament={handleOpenTournament}
            onOpenPanel={setActivePanel}
          />
          {activePanel === 'player' ? (
            <PlayerStudioModal
              profile={saved.customPlayer}
              homeTeam={baseHomeTeam}
              onSave={handleSaveCustomPlayer}
              onClose={() => setActivePanel(null)}
            />
          ) : (
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
          )}
        </>
      )}

      {/* Tournament Bracket Shell State */}
      {shellState === 'tournament' && (
        <TournamentScreen
          tournament={currentTournament}
          trophiesWon={saved.career.trophiesWon}
          onSelectClub={handleSelectTournamentClub}
          onPlayMatch={handlePlayTournamentMatch}
          onSimulateMatch={handleSimulateTournamentMatch}
          onNewTournament={handleNewTournament}
          onBackToTitle={handleReturnToTitle}
        />
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
          isTournament={activeTournamentMatch !== null}
          onSelectFormation={(id) => handleSelectFormation(id, false)}
          onSelectMentality={handleSelectMentality}
          onResume={handleTogglePause}
          onRestart={() => {
            if (activeTournamentMatch) {
              handlePlayTournamentMatch(activeTournamentMatch);
            } else {
              startMatch();
            }
          }}
          onReturnToBracket={handleReturnToBracket}
          onMainMenu={handleReturnToTitle}
        />
      )}

      {/* Full Time Modal */}
      {shellState === 'gameover' && (
        <FullTimeModal
          homeTeam={activeMatchTeams?.home ?? homeTeam}
          awayTeam={activeMatchTeams?.away ?? awayTeam}
          stats={hudSnapshot.stats}
          tournamentSummary={lastTournamentSummary}
          onPlayAgain={startMatch}
          onViewBracket={handleReturnToBracket}
          onMainMenu={handleReturnToTitle}
        />
      )}
    </main>
  );
}
