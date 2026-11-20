import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
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
  InputSnapshot,
  MatchHudSnapshot,
  MatchStats,
  SavedState,
  TacticalMentality,
  TeamConfig,
  TeamSide,
  TournamentMatch,
} from './core/types';
import {
  signInWithGoogle,
  signOutPlayer,
  subscribeAuthState,
} from './firebase/firebase';
import {
  createFirestoreRoom,
  deleteWaitingFirestoreRoom,
  ensurePlayerProfile,
  FirestoreRoomDoc,
  joinFirestoreRoom,
  markFirestoreRoomFinished,
  markFirestoreRoomPlaying,
  publishFirestoreGuestInput,
  publishFirestoreMatchState,
  publishFirestoreRematch,
  recordOnlinePlayerMatchStats,
  sanitizeDisplayName,
  sanitizeRoomCode,
  subscribeFirestoreGuestInput,
  subscribeFirestoreMatchState,
  subscribeFirestoreRematch,
  subscribeFirestoreRoom,
  updateFirestoreRoomLobby,
} from './firebase/roomService';
import { MatchEngine } from './game/matchEngine';
import {
  createTournament,
  getRoundLabel,
  recordUserTournamentMatchResult,
  simulateUserTournamentMatch,
} from './game/tournament';
import {
  OnlineMultiplayerClient,
  OnlineSocketStatus,
} from './multiplayer/onlineClient';
import {
  OnlineRoomSnapshot,
  OnlineSoundEvent,
  RoomBootstrapData,
  ServerToClientMessage,
} from './multiplayer/protocol';
import { createNeutralInput } from './multiplayer/roomManager';
import { applyCustomPlayerToTeam } from './players/customPlayer';
import { pickRandomRobotTeam, resolveUserVsRobotPairing } from './teams/matchup';
import { getTeamById, TEAMS } from './teams/teams';
import { MatchHud } from './ui/MatchHud';
import {
  FullTimeModal,
  OnlineMatchSummary,
  PauseModal,
  TitleSettingsDrawer,
  TournamentMatchSummary,
} from './ui/Modals';
import { OfflineGateModal } from './ui/OfflineGateModal';
import { OnlineScreen } from './ui/OnlineScreen';
import { PitchScene } from './ui/PitchScene';
import { PlayerStudioModal } from './ui/PlayerStudioModal';
import { TeamMatchupModal } from './ui/TeamMatchupModal';
import { TitlePanel, TitleScreen } from './ui/TitleScreen';
import { TournamentScreen } from './ui/TournamentScreen';

const CAMERA_CYCLE: CameraMode[] = ['tv', 'close', 'player'];

function toRoomBootstrap(doc: FirestoreRoomDoc): RoomBootstrapData {
  return {
    hostUid: doc.hostUid,
    hostName: doc.hostName,
    hostTeamId: doc.hostTeamId,
    hostFormation: doc.hostFormation,
    hostReady: doc.hostReady,
    guestUid: doc.guestUid || undefined,
    guestName: doc.guestName || undefined,
    guestTeamId: doc.guestTeamId || undefined,
    guestFormation: doc.guestFormation,
    guestReady: doc.guestReady,
    halfDurationSeconds: doc.halfDurationSeconds,
  };
}

function firestoreDocToRoomSnapshot(
  doc: FirestoreRoomDoc,
  existingWsRoom?: OnlineRoomSnapshot | null,
): OnlineRoomSnapshot {
  const existingHome = existingWsRoom?.players.find((p) => p.uid === doc.hostUid);
  const existingGuest = doc.guestUid
    ? existingWsRoom?.players.find((p) => p.uid === doc.guestUid)
    : undefined;

  const players: OnlineRoomSnapshot['players'] = [
    {
      clientId: existingHome?.clientId ?? `fs_host_${doc.roomCode}`,
      uid: doc.hostUid,
      nickname: doc.hostName,
      side: 'home',
      teamId: doc.hostTeamId,
      formation: doc.hostFormation,
      ready: doc.hostReady,
      connected: existingHome?.connected ?? true,
    },
  ];

  if (doc.guestUid) {
    players.push({
      clientId: existingGuest?.clientId ?? `fs_guest_${doc.roomCode}`,
      uid: doc.guestUid,
      nickname: doc.guestName || 'Joueur 2',
      side: 'away',
      teamId: doc.guestTeamId || 'nordic',
      formation: doc.guestFormation,
      ready: doc.guestReady,
      connected: existingGuest?.connected ?? true,
    });
  }

  return {
    roomCode: doc.roomCode,
    status: doc.status,
    halfDurationSeconds: doc.halfDurationSeconds,
    matchNumber: existingWsRoom?.matchNumber ?? 0,
    players,
  };
}

function formatOnlineError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const raw = error.message || '';
  if (raw.startsWith('{') && raw.includes('"error"')) {
    try {
      const parsed = JSON.parse(raw) as { error?: string };
      const inner = parsed.error || '';
      if (inner.includes('PERMISSION_DENIED') || inner.includes('Missing or insufficient permissions')) {
        return 'Accès Firestore refusé. Vérifiez que votre compte Google est connecté puis réessayez.';
      }
      if (inner.includes('offline') || inner.includes('unavailable')) {
        return 'Connexion au serveur Firestore indisponible. Vérifiez votre accès Internet.';
      }
      if (inner) return inner;
    } catch {
      // Fall through to raw message
    }
  }
  return raw || fallback;
}

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

  // Online 1v1 Multiplayer & Firebase Auth State
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [onlineNickname, setOnlineNickname] = useState('Joueur');
  const [onlineTeamId, setOnlineTeamId] = useState(() => loadSavedState().homeTeamId);
  const [onlineFormation, setOnlineFormation] = useState<FormationId>(
    () => loadSavedState().homeFormation,
  );
  const [socketStatus, setSocketStatus] = useState<OnlineSocketStatus>('disconnected');
  const [onlineRoom, setOnlineRoom] = useState<OnlineRoomSnapshot | null>(null);
  const [onlineSide, setOnlineSide] = useState<TeamSide | null>(null);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [onlineBusy, setOnlineBusy] = useState(false);
  const [isOnlineMatch, setIsOnlineMatch] = useState(false);
  const [onlineTransport, setOnlineTransport] = useState<'ws' | 'firestore'>('ws');
  const [opponentDisconnectedMsg, setOpponentDisconnectedMsg] = useState<string | null>(null);
  const [onlineMatchSummary, setOnlineMatchSummary] = useState<OnlineMatchSummary | null>(null);

  const savedRef = useRef(saved);
  savedRef.current = saved;
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;
  const activeTournamentMatchRef = useRef<TournamentMatch | null>(null);
  const authUserRef = useRef<User | null>(null);
  authUserRef.current = authUser;
  const onlineRoomRef = useRef<OnlineRoomSnapshot | null>(null);
  onlineRoomRef.current = onlineRoom;
  const onlineSideRef = useRef<TeamSide>('home');
  onlineSideRef.current = onlineSide ?? 'home';
  const isOnlineMatchRef = useRef(false);
  isOnlineMatchRef.current = isOnlineMatch;
  const onlineTransportRef = useRef<'ws' | 'firestore'>('ws');
  onlineTransportRef.current = onlineTransport;
  const wsRoomHasBothConnectedRef = useRef(false);
  const startFallbackTimerRef = useRef<number | null>(null);
  const firestoreMatchNumberRef = useRef(1);
  const firestoreRematchSeenRef = useRef(0);
  const firestorePendingEventsRef = useRef<OnlineSoundEvent[]>([]);
  const firestoreRemoteAwayInputRef = useRef<InputSnapshot>(createNeutralInput());
  const firestoreLastGuestSeqRef = useRef(0);
  const firestoreLastStateSeqRef = useRef(0);
  const firestoreGuestInputSeqRef = useRef(0);
  const firestoreGuestInputLastSentRef = useRef(0);
  const firestoreGuestLastAxesRef = useRef({
    moveX: 0,
    moveZ: 0,
    sprint: false,
    shootHeld: false,
  });
  const firestoreMatchFinishedSentRef = useRef(false);
  const finalizeFirestoreMatchRef = useRef<((stats: MatchStats) => void) | null>(null);
  const onlineNicknameRef = useRef(onlineNickname);
  onlineNicknameRef.current = onlineNickname;

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
  const onlineClientRef = useRef<OnlineMultiplayerClient | null>(null);

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
        onSoundEvent: (ev) => {
          if (
            isOnlineMatchRef.current &&
            onlineTransportRef.current === 'firestore' &&
            onlineSideRef.current === 'home'
          ) {
            firestorePendingEventsRef.current.push(ev);
          }
        },
        onMatchFinished: (finalStats: MatchStats) => {
          if (isOnlineMatchRef.current) {
            if (
              onlineTransportRef.current === 'firestore' &&
              onlineSideRef.current === 'home' &&
              !firestoreMatchFinishedSentRef.current
            ) {
              firestoreMatchFinishedSentRef.current = true;
              const engine = engineRef.current;
              const room = onlineRoomRef.current;
              if (engine && room) {
                const finalSnap = engine.getOnlineSnapshot(
                  999999,
                  firestorePendingEventsRef.current.splice(0),
                );
                void publishFirestoreMatchState(
                  room.roomCode,
                  999999,
                  999999,
                  finalSnap,
                ).catch(() => {});
              }
              finalizeFirestoreMatchRef.current?.(finalStats);
            }
            return;
          }
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

  // Subscribe to Firebase Authentication state
  useEffect(() => {
    const unsubscribe = subscribeAuthState((user) => {
      setAuthUser(user);
      authUserRef.current = user;
      if (user) {
        const cleanName = sanitizeDisplayName(user.displayName, user.uid);
        setOnlineNickname((prev) =>
          prev === 'Joueur' || prev.trim().length === 0 ? cleanName : prev,
        );
        onlineClientRef.current?.reauthenticate();
        void ensurePlayerProfile(user.uid, cleanName).catch(() => {
          // Non-fatal if offline
        });
      }
    });
    return unsubscribe;
  }, []);

  const clearStartFallbackTimer = useCallback(() => {
    if (startFallbackTimerRef.current !== null) {
      window.clearTimeout(startFallbackTimerRef.current);
      startFallbackTimerRef.current = null;
    }
  }, []);

  const finalizeFirestoreOnlineMatch = useCallback(
    (finalStats: MatchStats) => {
      inputManager.clearAll();
      const room = onlineRoomRef.current;
      const homeSlot = room?.players.find((p) => p.side === 'home');
      const awaySlot = room?.players.find((p) => p.side === 'away');
      const yourSide = onlineSideRef.current;

      setOnlineMatchSummary({
        homePlayerName: homeSlot?.nickname ?? 'Joueur 1',
        awayPlayerName: awaySlot?.nickname ?? 'Joueur 2',
        yourSide,
      });
      setOpponentDisconnectedMsg(null);
      setShellState('gameover');
      document.body.dataset.state = 'gameover';

      const user = authUserRef.current;
      if (user && room && homeSlot && awaySlot) {
        if (firestoreMatchNumberRef.current === 1) {
          void markFirestoreRoomFinished({
            roomCode: room.roomCode,
            homeScore: finalStats.homeScore,
            awayScore: finalStats.awayScore,
            hostUid: homeSlot.uid,
            guestUid: awaySlot.uid,
          }).catch(() => {});
        }

        const myGoals = yourSide === 'home' ? finalStats.homeScore : finalStats.awayScore;
        const oppGoals = yourSide === 'home' ? finalStats.awayScore : finalStats.homeScore;
        const outcome = myGoals > oppGoals ? 'win' : myGoals < oppGoals ? 'loss' : 'draw';
        void recordOnlinePlayerMatchStats(
          user.uid,
          onlineNicknameRef.current,
          myGoals,
          outcome,
        ).catch(() => {});
      }
    },
    [inputManager],
  );
  finalizeFirestoreMatchRef.current = finalizeFirestoreOnlineMatch;

  const launchFirestoreOnlineMatch = useCallback(
    (room: OnlineRoomSnapshot, side: TeamSide, matchNumber: number) => {
      clearStartFallbackTimer();
      onlineTransportRef.current = 'firestore';
      setOnlineTransport('firestore');
      firestoreMatchNumberRef.current = matchNumber;
      firestoreMatchFinishedSentRef.current = false;
      firestorePendingEventsRef.current = [];
      firestoreRemoteAwayInputRef.current = createNeutralInput();
      firestoreLastGuestSeqRef.current = 0;
      firestoreLastStateSeqRef.current = 0;
      firestoreGuestInputSeqRef.current = 0;

      const playingRoom: OnlineRoomSnapshot = {
        ...room,
        status: 'playing',
        matchNumber,
      };
      setOnlineRoom(playingRoom);
      setOnlineSide(side);
      onlineSideRef.current = side;
      setIsOnlineMatch(true);
      isOnlineMatchRef.current = true;
      setOpponentDisconnectedMsg(null);
      setOnlineMatchSummary(null);
      setOnlineError(null);
      setOnlineBusy(false);
      setLastTournamentSummary(null);
      activeTournamentMatchRef.current = null;
      setActiveTournamentMatch(null);

      const homeSlot = playingRoom.players.find((p) => p.side === 'home');
      const awaySlot = playingRoom.players.find((p) => p.side === 'away');
      const matchHome = getTeamById(homeSlot?.teamId ?? 'aurelia');
      const matchAway = getTeamById(awaySlot?.teamId ?? 'nordic');

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
          homeSlot?.formation ?? '4-3-3',
          awaySlot?.formation ?? '4-3-3',
          playingRoom.halfDurationSeconds,
          'balanced',
          'balanced',
          {
            awayHumanControl: true,
            localSide: side,
            isOnlineClient: side === 'away',
          },
        );
        setTeamVersion((v) => v + 1);
      }

      setShellState('playing');
      document.body.dataset.state = 'playing';
    },
    [clearStartFallbackTimer, inputManager],
  );

  // Handle incoming authoritative WebSocket multiplayer messages
  const handleServerMessage = useCallback(
    (msg: ServerToClientMessage) => {
      switch (msg.type) {
        case 'auth:error': {
          setOnlineError(msg.message);
          setOnlineBusy(false);
          break;
        }
        case 'room:state': {
          wsRoomHasBothConnectedRef.current =
            msg.room.players.length === 2 && msg.room.players.every((p) => p.connected);
          setOnlineRoom(msg.room);
          setOnlineSide(msg.yourSide);
          setOnlineError(null);
          const mySlot = msg.room.players.find((p) => p.side === msg.yourSide);
          if (mySlot) {
            setOnlineTeamId(mySlot.teamId);
            setOnlineFormation(mySlot.formation);
          }
          break;
        }
        case 'room:error': {
          clearStartFallbackTimer();
          setOnlineError(msg.message);
          setOnlineBusy(false);
          break;
        }
        case 'match:start': {
          clearStartFallbackTimer();
          onlineTransportRef.current = 'ws';
          setOnlineTransport('ws');
          setOnlineRoom(msg.room);
          setOnlineSide(msg.yourSide);
          onlineSideRef.current = msg.yourSide;
          setIsOnlineMatch(true);
          isOnlineMatchRef.current = true;
          setOpponentDisconnectedMsg(null);
          setOnlineMatchSummary(null);
          setOnlineError(null);
          setOnlineBusy(false);
          setLastTournamentSummary(null);
          activeTournamentMatchRef.current = null;
          setActiveTournamentMatch(null);

          const homeSlot = msg.room.players.find((p) => p.side === 'home');
          const awaySlot = msg.room.players.find((p) => p.side === 'away');
          const matchHome = getTeamById(homeSlot?.teamId ?? 'aurelia');
          const matchAway = getTeamById(awaySlot?.teamId ?? 'nordic');

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
              homeSlot?.formation ?? '4-3-3',
              awaySlot?.formation ?? '4-3-3',
              msg.room.halfDurationSeconds,
              'balanced',
              'balanced',
              {
                awayHumanControl: true,
                localSide: msg.yourSide,
                isOnlineClient: true,
              },
            );
            setTeamVersion((v) => v + 1);
          }

          // Only transition Firestore room waiting -> playing on the initial match.
          // Rematches (matchNumber > 1) run cleanly on the authoritative WebSocket
          // room without mutating the terminal-locked finished Firestore document.
          if (authUserRef.current && msg.room.matchNumber === 1) {
            void markFirestoreRoomPlaying(msg.room.roomCode).catch(() => {});
          }

          setShellState('playing');
          document.body.dataset.state = 'playing';
          break;
        }
        case 'match:state': {
          const engine = engineRef.current;
          if (engine && isOnlineMatchRef.current) {
            engine.applyOnlineSnapshot(msg.snapshot, onlineSideRef.current);
          }
          break;
        }
        case 'match:finished': {
          inputManager.clearAll();
          setOnlineRoom(msg.room);
          const homeSlot = msg.room.players.find((p) => p.side === 'home');
          const awaySlot = msg.room.players.find((p) => p.side === 'away');
          const yourSide = onlineSideRef.current;
          setOnlineMatchSummary({
            homePlayerName: homeSlot?.nickname ?? 'Joueur 1',
            awayPlayerName: awaySlot?.nickname ?? 'Joueur 2',
            yourSide,
          });
          setOpponentDisconnectedMsg(null);
          setShellState('gameover');
          document.body.dataset.state = 'gameover';

          const user = authUserRef.current;
          if (user && homeSlot && awaySlot) {
            if (msg.room.matchNumber === 1) {
              void markFirestoreRoomFinished({
                roomCode: msg.room.roomCode,
                homeScore: msg.stats.homeScore,
                awayScore: msg.stats.awayScore,
                hostUid: homeSlot.uid,
                guestUid: awaySlot.uid,
              }).catch(() => {});
            }

            const myGoals = yourSide === 'home' ? msg.stats.homeScore : msg.stats.awayScore;
            const oppGoals = yourSide === 'home' ? msg.stats.awayScore : msg.stats.homeScore;
            const outcome = myGoals > oppGoals ? 'win' : myGoals < oppGoals ? 'loss' : 'draw';
            void recordOnlinePlayerMatchStats(
              user.uid,
              onlineNicknameRef.current,
              myGoals,
              outcome,
            ).catch(() => {});
          }
          break;
        }
        case 'opponent:disconnected': {
          setOpponentDisconnectedMsg(msg.message);
          inputManager.clearAll();
          break;
        }
        case 'opponent:reconnected': {
          setOpponentDisconnectedMsg(null);
          break;
        }
      }
    },
    [clearStartFallbackTimer, inputManager],
  );

  // Initialize WebSocket client lifecycle with Firebase ID Token authentication
  useEffect(() => {
    const client = new OnlineMultiplayerClient({
      getAuthToken: async (forceRefresh = false) => {
        const current = authUserRef.current;
        if (!current) return null;
        return current.getIdToken(forceRefresh);
      },
      onStatusChange: (st) => {
        setSocketStatus(st);
        if (st !== 'connected') {
          wsRoomHasBothConnectedRef.current = false;
        }
      },
      onMessage: (msg) => handleServerMessage(msg),
    });
    onlineClientRef.current = client;

    return () => {
      clearStartFallbackTimer();
      client.disconnect();
      onlineClientRef.current = null;
    };
  }, [clearStartFallbackTimer, handleServerMessage]);

  // Keep waiting room synchronized with Cloud Firestore across devices/restarts,
  // and launch both devices immediately when Firestore transitions to status='playing'.
  useEffect(() => {
    const roomCode = onlineRoom?.roomCode;
    if (!roomCode || shellState !== 'online' || !authUser) return;

    const unsubscribe = subscribeFirestoreRoom(
      roomCode,
      (doc) => {
        if (!doc) return;
        const bootstrap = toRoomBootstrap(doc);
        onlineClientRef.current?.updateSessionBootstrap(bootstrap);

        const wsRoom = onlineRoomRef.current;
        if (doc.status === 'playing' && doc.guestUid && !isOnlineMatchRef.current) {
          // If the room transitioned to playing in Firestore (including when triggered
          // by the opponent via Firestore live sync), launch immediately on this device.
          const mySide: TeamSide = doc.hostUid === authUser.uid ? 'home' : 'away';
          launchFirestoreOnlineMatch(firestoreDocToRoomSnapshot(doc, wsRoom), mySide, 1);
          return;
        }

        if (wsRoom && wsRoom.roomCode === doc.roomCode && wsRoom.status === 'waiting') {
          setOnlineRoom((prev) =>
            prev && prev.roomCode === doc.roomCode && prev.status === 'waiting'
              ? firestoreDocToRoomSnapshot(doc, prev)
              : prev,
          );

          if (doc.guestUid && wsRoom.players.length < 2) {
            onlineClientRef.current?.send({
              type: 'room:reconnect',
              roomCode: doc.roomCode,
              bootstrap,
            });
          }
        }
      },
      () => {
        // Non-fatal; WebSocket remains primary real-time channel
      },
    );

    return unsubscribe;
  }, [authUser, launchFirestoreOnlineMatch, onlineRoom?.roomCode, shellState]);

  // Live Firestore match state / guest input / rematch sync when running in Firestore fallback mode
  useEffect(() => {
    const roomCode = onlineRoom?.roomCode;
    if (!isOnlineMatch || onlineTransport !== 'firestore' || !roomCode || !authUser) return;

    const unsubRematch = subscribeFirestoreRematch(roomCode, (rematchCount) => {
      if (rematchCount > firestoreRematchSeenRef.current && onlineRoomRef.current) {
        firestoreRematchSeenRef.current = rematchCount;
        launchFirestoreOnlineMatch(
          onlineRoomRef.current,
          onlineSideRef.current,
          1 + rematchCount,
        );
      }
    });

    if (shellState !== 'playing') {
      return unsubRematch;
    }

    if (onlineSide === 'home') {
      const unsubInput = subscribeFirestoreGuestInput(roomCode, (input, seq) => {
        const isFresh = seq > firestoreLastGuestSeqRef.current;
        if (isFresh) {
          firestoreLastGuestSeqRef.current = seq;
        }
        const prev = firestoreRemoteAwayInputRef.current;
        firestoreRemoteAwayInputRef.current = {
          moveX: input.moveX,
          moveZ: input.moveZ,
          sprint: input.sprint,
          shootHeld: input.shootHeld,
          passPressed: prev.passPressed || (isFresh && input.passPressed),
          lobPressed: prev.lobPressed || (isFresh && input.lobPressed),
          shootPressed: prev.shootPressed || (isFresh && input.shootPressed),
          shootReleased: prev.shootReleased || (isFresh && input.shootReleased),
          tacklePressed: prev.tacklePressed || (isFresh && input.tacklePressed),
          switchPressed: prev.switchPressed || (isFresh && input.switchPressed),
        };
      });

      let tick = 0;
      let seq = 0;
      let publishing = false;
      const timer = window.setInterval(() => {
        const engine = engineRef.current;
        if (!engine || publishing || firestoreMatchFinishedSentRef.current) return;
        tick += 1;
        seq += 1;
        const events = firestorePendingEventsRef.current.splice(0);
        const snap = engine.getOnlineSnapshot(tick, events);
        publishing = true;
        void publishFirestoreMatchState(roomCode, tick, seq, snap)
          .catch(() => {})
          .finally(() => {
            publishing = false;
          });
      }, 95);

      return () => {
        unsubRematch();
        unsubInput();
        window.clearInterval(timer);
      };
    }

    // Guest side: subscribe to live host snapshots and feed into MatchEngine interpolation
    const unsubState = subscribeFirestoreMatchState(roomCode, (snapshot, seq) => {
      if (seq < firestoreLastStateSeqRef.current) return;
      firestoreLastStateSeqRef.current = seq;
      const engine = engineRef.current;
      if (engine && isOnlineMatchRef.current) {
        engine.applyOnlineSnapshot(snapshot, 'away');
      }
      if (snapshot.phase === 'fulltime' && !firestoreMatchFinishedSentRef.current) {
        firestoreMatchFinishedSentRef.current = true;
        finalizeFirestoreOnlineMatch(snapshot.stats);
      }
    });

    return () => {
      unsubRematch();
      unsubState();
    };
  }, [
    authUser,
    finalizeFirestoreOnlineMatch,
    isOnlineMatch,
    launchFirestoreOnlineMatch,
    onlineRoom?.roomCode,
    onlineSide,
    onlineTransport,
    shellState,
  ]);

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
        if (prev === 'playing' && !isOnlineMatchRef.current) {
          document.body.dataset.state = 'paused';
          return 'paused';
        }
        return prev;
      });
    } else if (isOnlineMatchRef.current) {
      onlineClientRef.current?.connect();
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
        if (prev === 'playing' && !isOnlineMatchRef.current) {
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

    void verifyConnection();

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

  const handleOnlineInput = useCallback((snap: InputSnapshot) => {
    if (onlineTransportRef.current === 'ws') {
      onlineClientRef.current?.sendInput(snap);
      return;
    }

    if (onlineTransportRef.current === 'firestore' && onlineSideRef.current === 'away') {
      const room = onlineRoomRef.current;
      if (!room) return;
      const now = performance.now();
      const hasDiscrete =
        snap.passPressed ||
        snap.lobPressed ||
        snap.shootPressed ||
        snap.shootReleased ||
        snap.tacklePressed ||
        snap.switchPressed;
      const lastAxes = firestoreGuestLastAxesRef.current;
      const axesChanged =
        Math.abs(snap.moveX - lastAxes.moveX) > 0.06 ||
        Math.abs(snap.moveZ - lastAxes.moveZ) > 0.06 ||
        snap.sprint !== lastAxes.sprint ||
        snap.shootHeld !== lastAxes.shootHeld;

      const minInterval = hasDiscrete ? 0 : axesChanged ? 85 : 220;
      if (now - firestoreGuestInputLastSentRef.current < minInterval) return;

      firestoreGuestInputLastSentRef.current = now;
      firestoreGuestLastAxesRef.current = {
        moveX: snap.moveX,
        moveZ: snap.moveZ,
        sprint: snap.sprint,
        shootHeld: snap.shootHeld,
      };
      firestoreGuestInputSeqRef.current += 1;
      void publishFirestoreGuestInput(
        room.roomCode,
        firestoreGuestInputSeqRef.current,
        snap,
      ).catch(() => {});
    }
  }, []);

  const consumeRemoteAwayInput = useCallback((): InputSnapshot | undefined => {
    if (onlineTransportRef.current !== 'firestore' || onlineSideRef.current !== 'home') {
      return undefined;
    }
    const cur = firestoreRemoteAwayInputRef.current;
    const out: InputSnapshot = { ...cur };
    cur.passPressed = false;
    cur.lobPressed = false;
    cur.shootPressed = false;
    cur.shootReleased = false;
    cur.tacklePressed = false;
    cur.switchPressed = false;
    return out;
  }, []);

  const handleOpenOnline = useCallback(() => {
    if (!isOnlineRef.current) return;
    setActivePanel(null);
    setOnlineError(null);
    setAuthError(null);
    inputManager.clearAll();
    onlineClientRef.current?.connect();
    if (engineRef.current) {
      engineRef.current.shellState = 'online';
    }
    setShellState('online');
    document.body.dataset.state = 'online';
  }, [inputManager]);

  const handleSignInGoogle = useCallback(async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('popup-closed-by-user')) {
        setAuthError('Fenêtre de connexion Google fermée avant validation.');
      } else if (msg.includes('unauthorized-domain')) {
        const host = typeof window !== 'undefined' ? window.location.hostname : '';
        setAuthError(
          `Domaine non autorisé (${host}). Ajoutez ce domaine dans Firebase Console → Authentication → Settings → Authorized domains.`,
        );
      } else {
        setAuthError(`Impossible de se connecter avec Google : ${msg}`);
      }
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    onlineClientRef.current?.send({ type: 'room:leave' });
    onlineClientRef.current?.resetAuth();
    setOnlineRoom(null);
    setOnlineSide(null);
    await signOutPlayer();
  }, []);

  const handleCreateOnlineRoom = useCallback(async () => {
    const user = authUserRef.current;
    if (!user) return;
    setOnlineBusy(true);
    setOnlineError(null);
    try {
      const cleanName = sanitizeDisplayName(onlineNickname, user.uid);
      const created = await createFirestoreRoom({
        hostUid: user.uid,
        hostName: cleanName,
        hostTeamId: onlineTeamId,
        hostFormation: onlineFormation,
        halfDurationSeconds: savedRef.current.settings.halfDurationSeconds,
      });

      // Immediately enter the waiting lobby and display the generated 5-character
      // room code on screen without blocking on WebSocket handshake latency.
      const initialRoom = firestoreDocToRoomSnapshot(created);
      setOnlineRoom(initialRoom);
      setOnlineSide('home');

      const bootstrap = toRoomBootstrap(created);
      onlineClientRef.current?.connect();
      onlineClientRef.current?.setActiveSession({
        roomCode: created.roomCode,
        bootstrap,
      });
      onlineClientRef.current?.send({
        type: 'room:create',
        roomCode: created.roomCode,
        nickname: cleanName,
        teamId: created.hostTeamId,
        formation: created.hostFormation,
        halfDurationSeconds: created.halfDurationSeconds,
      });
    } catch (error) {
      setOnlineError(
        formatOnlineError(error, 'Erreur lors de la création de la partie.'),
      );
    } finally {
      setOnlineBusy(false);
    }
  }, [onlineFormation, onlineNickname, onlineTeamId]);

  const handleJoinOnlineRoom = useCallback(
    async (rawCode: string) => {
      const user = authUserRef.current;
      if (!user) return;
      const code = sanitizeRoomCode(rawCode);
      if (code.length !== 5) {
        setOnlineError('Veuillez saisir un code valide à 5 caractères (ex: A7K92).');
        return;
      }

      setOnlineBusy(true);
      setOnlineError(null);
      try {
        const cleanName = sanitizeDisplayName(onlineNickname, user.uid);
        const joined = await joinFirestoreRoom({
          roomCode: code,
          guestUid: user.uid,
          guestName: cleanName,
          preferredTeamId: onlineTeamId,
          guestFormation: onlineFormation,
        });

        const joinedSide: TeamSide = joined.hostUid === user.uid ? 'home' : 'away';
        setOnlineRoom(firestoreDocToRoomSnapshot(joined));
        setOnlineSide(joinedSide);

        const bootstrap = toRoomBootstrap(joined);
        onlineClientRef.current?.connect();
        onlineClientRef.current?.setActiveSession({
          roomCode: joined.roomCode,
          bootstrap,
        });
        onlineClientRef.current?.send({
          type: 'room:join',
          roomCode: joined.roomCode,
          nickname: cleanName,
          teamId: joined.guestTeamId || onlineTeamId,
          formation: onlineFormation,
          bootstrap,
        });
      } catch (error) {
        setOnlineError(
          formatOnlineError(error, 'Impossible de rejoindre cette partie.'),
        );
      } finally {
        setOnlineBusy(false);
      }
    },
    [onlineFormation, onlineNickname, onlineTeamId],
  );

  const handleSelectOnlineTeam = useCallback(
    (teamId: string) => {
      setOnlineTeamId(teamId);
      const room = onlineRoomRef.current;
      const side = onlineSide;
      if (room && side && room.status === 'waiting') {
        onlineClientRef.current?.send({ type: 'room:updateProfile', teamId });
        const mySlot = room.players.find((p) => p.side === side);
        void updateFirestoreRoomLobby({
          roomCode: room.roomCode,
          role: side === 'home' ? 'host' : 'guest',
          name: mySlot?.nickname ?? onlineNickname,
          teamId,
          formation: mySlot?.formation ?? onlineFormation,
          ready: mySlot?.ready ?? false,
        }).catch(() => {});
      }
    },
    [onlineFormation, onlineNickname, onlineSide],
  );

  const handleSelectOnlineFormation = useCallback(
    (formation: FormationId) => {
      setOnlineFormation(formation);
      const room = onlineRoomRef.current;
      const side = onlineSide;
      if (room && side && room.status === 'waiting') {
        onlineClientRef.current?.send({ type: 'room:updateProfile', formation });
        const mySlot = room.players.find((p) => p.side === side);
        void updateFirestoreRoomLobby({
          roomCode: room.roomCode,
          role: side === 'home' ? 'host' : 'guest',
          name: mySlot?.nickname ?? onlineNickname,
          teamId: mySlot?.teamId ?? onlineTeamId,
          formation,
          ready: mySlot?.ready ?? false,
        }).catch(() => {});
      }
    },
    [onlineNickname, onlineSide, onlineTeamId],
  );

  const handleToggleOnlineReady = useCallback(() => {
    const room = onlineRoomRef.current;
    const side = onlineSide;
    if (!room || !side) return;
    const mySlot = room.players.find((p) => p.side === side);
    const nextReady = !(mySlot?.ready ?? false);
    onlineClientRef.current?.send({ type: 'room:updateProfile', ready: nextReady });
    void updateFirestoreRoomLobby({
      roomCode: room.roomCode,
      role: side === 'home' ? 'host' : 'guest',
      name: mySlot?.nickname ?? onlineNickname,
      teamId: mySlot?.teamId ?? onlineTeamId,
      formation: mySlot?.formation ?? onlineFormation,
      ready: nextReady,
    }).catch(() => {});
  }, [onlineFormation, onlineNickname, onlineSide, onlineTeamId]);

  const handleStartOnlineMatch = useCallback(async () => {
    const room = onlineRoomRef.current;
    const user = authUserRef.current;
    if (!room || !user) return;
    if (room.players.length < 2) {
      setOnlineError('En attente du deuxième joueur avant le coup d’envoi.');
      return;
    }

    setOnlineBusy(true);
    setOnlineError(null);

    const launchViaFirestore = async () => {
      try {
        await markFirestoreRoomPlaying(room.roomCode);
        const mySide: TeamSide =
          room.players.find((p) => p.uid === user.uid)?.side ?? onlineSideRef.current;
        launchFirestoreOnlineMatch(room, mySide, 1);
      } catch (error) {
        setOnlineError(
          formatOnlineError(error, 'Impossible de lancer le match en ligne.'),
        );
        setOnlineBusy(false);
      }
    };

    if (onlineClientRef.current?.isReady() && wsRoomHasBothConnectedRef.current) {
      onlineClientRef.current.send({
        type: 'room:start',
        roomCode: room.roomCode,
      });
      clearStartFallbackTimer();
      startFallbackTimerRef.current = window.setTimeout(() => {
        startFallbackTimerRef.current = null;
        if (!isOnlineMatchRef.current && onlineRoomRef.current?.roomCode === room.roomCode) {
          void launchViaFirestore();
        }
      }, 2200);
      return;
    }

    await launchViaFirestore();
  }, [clearStartFallbackTimer, launchFirestoreOnlineMatch]);

  const handleLeaveOnlineRoom = useCallback(() => {
    clearStartFallbackTimer();
    const room = onlineRoomRef.current;
    if (room && room.status === 'waiting' && onlineSide === 'home') {
      void deleteWaitingFirestoreRoom(room.roomCode);
    }
    onlineClientRef.current?.send({ type: 'room:leave' });
    onlineClientRef.current?.setActiveSession(null);
    wsRoomHasBothConnectedRef.current = false;
    firestoreRematchSeenRef.current = 0;
    firestoreMatchNumberRef.current = 1;
    setOnlineRoom(null);
    setOnlineSide(null);
    setIsOnlineMatch(false);
    isOnlineMatchRef.current = false;
    setOpponentDisconnectedMsg(null);
    setOnlineMatchSummary(null);
    setOnlineError(null);
  }, [clearStartFallbackTimer, onlineSide]);

  const handleOnlineRematch = useCallback(() => {
    if (onlineTransportRef.current === 'firestore') {
      const room = onlineRoomRef.current;
      const user = authUserRef.current;
      if (!room || !user) return;
      const nextCount = firestoreRematchSeenRef.current + 1;
      firestoreRematchSeenRef.current = nextCount;
      void publishFirestoreRematch(room.roomCode, nextCount, user.uid).catch(() => {});
      launchFirestoreOnlineMatch(room, onlineSideRef.current, 1 + nextCount);
      return;
    }
    onlineClientRef.current?.send({ type: 'match:rematch' });
  }, [launchFirestoreOnlineMatch]);

  const startMatch = useCallback(() => {
    if (!isOnlineRef.current) return;
    setActivePanel(null);
    setIsOnlineMatch(false);
    isOnlineMatchRef.current = false;
    setOnlineMatchSummary(null);
    setOpponentDisconnectedMsg(null);
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
        {
          awayHumanControl: false,
          localSide: 'home',
          isOnlineClient: false,
        },
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
    setIsOnlineMatch(false);
    isOnlineMatchRef.current = false;
    setOnlineMatchSummary(null);
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
      setIsOnlineMatch(false);
      isOnlineMatchRef.current = false;
      setOnlineMatchSummary(null);
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
          {
            awayHumanControl: false,
            localSide: 'home',
            isOnlineClient: false,
          },
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
      engineRef.current.isOnlineClient = false;
      engineRef.current.awayHumanControl = false;
      engineRef.current.localSide = 'home';
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

  // Support ?autostart=1 or ?autostart=tournament or ?autostart=online for instant boot
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      startMatch();
    } else if (params.get('autostart') === 'tournament') {
      handleOpenTournament();
    } else if (params.get('autostart') === 'online') {
      handleOpenOnline();
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

  const handleReturnToTitle = useCallback(() => {
    inputManager.clearAll();
    if (isOnlineMatchRef.current || onlineRoomRef.current) {
      handleLeaveOnlineRoom();
    }
    activeTournamentMatchRef.current = null;
    setActiveTournamentMatch(null);
    setLastTournamentSummary(null);
    setOnlineMatchSummary(null);
    setShellState('title');
    document.body.dataset.state = 'title';
    if (engineRef.current) {
      engineRef.current.isOnlineClient = false;
      engineRef.current.awayHumanControl = false;
      engineRef.current.localSide = 'home';
      engineRef.current.shellState = 'title';
      engineRef.current.homeTeam = homeTeam;
      engineRef.current.awayTeam = awayTeam;
      engineRef.current.rebuildTeams();
      setTeamVersion((v) => v + 1);
    }
  }, [awayTeam, handleLeaveOnlineRoom, homeTeam, inputManager]);

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
        onlineMode={isOnlineMatch}
        localSide={onlineSide ?? 'home'}
        onOnlineInput={handleOnlineInput}
        consumeRemoteAwayInput={consumeRemoteAwayInput}
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
            onStartMatch={() => {
              if (!isOnlineRef.current) return;
              setActivePanel('teams');
            }}
            onOpenOnline={handleOpenOnline}
            onOpenTournament={handleOpenTournament}
            onOpenPanel={setActivePanel}
          />
          {activePanel === 'teams' ? (
            <TeamMatchupModal
              homeTeam={homeTeam}
              awayTeam={awayTeam}
              onSelectUserTeam={(id) => {
                const pairing = resolveUserVsRobotPairing(id, saved.awayTeamId, TEAMS);
                handleUpdateTeams(pairing.homeTeamId, pairing.awayTeamId);
              }}
              onSelectRobotTeam={(id) => {
                if (id === saved.homeTeamId) {
                  handleUpdateTeams(saved.awayTeamId, id);
                } else {
                  handleUpdateTeams(saved.homeTeamId, id);
                }
              }}
              onRandomizeRobot={() => {
                const nextRobot = pickRandomRobotTeam(
                  saved.homeTeamId,
                  saved.awayTeamId,
                  TEAMS,
                );
                handleUpdateTeams(saved.homeTeamId, nextRobot);
              }}
              onStartMatch={startMatch}
              onClose={() => setActivePanel(null)}
            />
          ) : activePanel === 'player' ? (
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
                handleUpdateTeams(
                  id,
                  id === saved.awayTeamId ? saved.homeTeamId : saved.awayTeamId,
                )
              }
              onSelectAwayTeam={(id) =>
                handleUpdateTeams(
                  id === saved.homeTeamId ? saved.awayTeamId : saved.homeTeamId,
                  id,
                )
              }
              onSelectFormation={(id) => handleSelectFormation(id, true)}
              onSelectAwayFormation={handleSelectAwayFormation}
              onSelectMentality={handleSelectMentality}
              onUpdateSettings={handleUpdateSettings}
            />
          )}
        </>
      )}

      {/* Online 1v1 Multiplayer Lobby Screen */}
      {shellState === 'online' && (
        <OnlineScreen
          authUser={authUser}
          authLoading={authLoading}
          authError={authError}
          nickname={onlineNickname}
          selectedTeamId={onlineTeamId}
          selectedFormation={onlineFormation}
          halfDurationSeconds={saved.settings.halfDurationSeconds}
          socketStatus={socketStatus}
          room={onlineRoom}
          yourSide={onlineSide}
          roomError={onlineError}
          busy={onlineBusy}
          onSignInGoogle={() => void handleSignInGoogle()}
          onSignOut={() => void handleSignOut()}
          onChangeNickname={setOnlineNickname}
          onSelectTeam={handleSelectOnlineTeam}
          onSelectFormation={handleSelectOnlineFormation}
          onCreateRoom={() => void handleCreateOnlineRoom()}
          onJoinRoom={(code) => void handleJoinOnlineRoom(code)}
          onToggleReady={handleToggleOnlineReady}
          onStartMatch={() => void handleStartOnlineMatch()}
          onLeaveRoom={handleLeaveOnlineRoom}
          onBackToTitle={handleReturnToTitle}
        />
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
          onlineOverlay={
            isOnlineMatch
              ? {
                  socketStatus:
                    onlineTransport === 'firestore'
                      ? isOnline
                        ? 'connected'
                        : 'reconnecting'
                      : socketStatus,
                  opponentDisconnectedMsg,
                  onRetryReconnect: () => onlineClientRef.current?.connect(),
                  onQuitOnline: handleReturnToTitle,
                }
              : null
          }
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
          isOnline={isOnlineMatch}
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
          onlineSummary={onlineMatchSummary}
          onPlayAgain={isOnlineMatch ? handleOnlineRematch : startMatch}
          onViewBracket={handleReturnToBracket}
          onMainMenu={handleReturnToTitle}
        />
      )}
    </main>
  );
}
