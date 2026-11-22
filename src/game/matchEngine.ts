import {
  AiSteeringOutput,
  computeAiSteering,
  computeDefensiveAssignments,
  computeSetPieceAiDecision,
  executeAiBallAction,
  TeamTransitionMode,
} from '../ai/basicAi';
import { computeCrowdIntensity } from '../audio/crowdLogic';
import { soundEngine } from '../audio/soundEngine';
import {
  ControlModeState,
  createControlModeState,
  stepControlMode,
} from '../controls/controlMode';
import {
  BALL_RADIUS,
  DRIBBLE_CONTROL_RADIUS,
  DRIBBLE_OFFSET_DIST,
  GOAL_HALF_WIDTH,
  HALF_LENGTH,
  PLAYER_RADIUS,
  TACKLE_REACH,
} from '../core/constants';
import {
  BallRestartOrigin,
  BallState,
  CameraMode,
  FormationId,
  FoulRecord,
  FreeKickKind,
  GameShellState,
  InputSnapshot,
  MatchHudSnapshot,
  MatchPhase,
  MatchStats,
  OffsideRecord,
  PlayerState,
  SetPieceInfo,
  SetPieceType,
  TacticalMentality,
  TeamConfig,
  TeamSide,
  Vec3,
} from '../core/types';
import {
  CompactPlayerNetState,
  OnlineMatchSnapshot,
  OnlineSoundEvent,
} from '../multiplayer/protocol';
import { ReplayRecorder } from './replayRecorder';
import {
  capturePassOffsideSnapshot,
  createMatchRulesState,
  evaluateActiveChallenge,
  evaluateBallBoundaryDecision,
  evaluateHandballFoul,
  evaluateIllegalPushFoul,
  evaluateOffsideInterference,
  evaluateOffsideOnTouch,
  formatFoulTypeLabel,
  MatchRulesRuntimeState,
  OutOfBoundsDecision,
  recordBallTouch,
  resetTransientRuleState,
  stepRuleTimers,
} from './matchRulesEngine';
import {
  computeLeadPassVector,
  computeMatchClock,
  computeSetPieceSetup,
  createTeamPlayers,
  evaluateInterception,
  findBestPassTarget,
  isCleanTackleAngle,
  resetForKickoff,
  selectSwitchTarget,
} from './rules';
import {
  applyBallKick,
  attemptGoalkeeperSave,
  clampPlayerToArena,
  computeContextualShot,
  computeShotProfile,
  evaluateBallReception,
  resolveLooseBallBodyContact,
  resolvePlayerCollisions,
  stepBallPhysics,
  stepPlayerLocomotion,
} from '../physics/pitchPhysics';

export interface MatchEngineCallbacks {
  onHudUpdate: (snapshot: MatchHudSnapshot) => void;
  onCameraTrauma: (amount: number) => void;
  onMatchFinished: (stats: MatchStats) => void;
  onSoundEvent?: (event: OnlineSoundEvent) => void;
}

const GOAL_IMPACT_DURATION = 0.85;
const GOAL_REPLAY_DURATION = 3.25;

interface NetPlayerTarget {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  facingAngle: number;
}

export class MatchEngine {
  public homeTeam: TeamConfig;
  public awayTeam: TeamConfig;
  public homeFormation: FormationId;
  public awayFormation: FormationId;
  public homeMentality: TacticalMentality;
  public awayMentality: TacticalMentality;
  public halfDurationSeconds: number;

  public players: PlayerState[] = [];
  public ball: BallState;
  public shellState: GameShellState = 'title';
  public phase: MatchPhase = 'kickoff';
  public half: 1 | 2 = 1;
  public halfElapsedReal = 0;
  public matchMinutes = 0;
  public matchSeconds = 0;
  public cameraMode: CameraMode = 'tv';

  /** Online multiplayer configuration */
  public awayHumanControl = false;
  public localSide: TeamSide = 'home';
  public isOnlineClient = false;

  public stats: MatchStats;
  public goalBanner: MatchHudSnapshot['goalBanner'] = null;
  public setPiece: SetPieceInfo | null = null;
  public isReplaying = false;
  public rulesState: MatchRulesRuntimeState = createMatchRulesState();

  private hitstopTimer = 0;
  private goalCelebrationTimer = 0;
  private goalTotalElapsed = 0;
  private halftimeTimer = 0;
  private kickoffTeam: TeamSide = 'home';
  private hudEmitAccumulator = 0;
  private shotCharge = 0;
  private awayShotCharge = 0;
  private callbacks: MatchEngineCallbacks;
  private replayRecorder = new ReplayRecorder();
  private replayBallProxy: BallState;
  private replayPlayerProxies: PlayerState[] = [];

  // Client-side interpolation targets for online multiplayer
  private netBallTarget: { x: number; y: number; z: number; vx: number; vy: number; vz: number } | null =
    null;
  private netPlayerTargets: Map<string, NetPlayerTarget> = new Map();
  private hasReceivedNetSnapshot = false;

  // Lightweight AI caching, turnover transition tracking, and GK human reaction timers
  private aiDecisionCache: Map<string, AiSteeringOutput> = new Map();
  private aiTickCounter = 0;
  private lastPossessionTeam: TeamSide | null = null;
  private transitionTimer = 0;
  private gkDiveReactionTimer: Map<string, number> = new Map();
  private lastHomeInputDir = { x: 0, z: 0 };
  private lastAwayInputDir = { x: 0, z: 0 };
  private controlModeState: ControlModeState = createControlModeState('ATTACK');

  private resolveBallOwnerTeam(): TeamSide | null {
    if (!this.ball.ownerId) return null;
    const owner = this.players.find((p) => p.id === this.ball.ownerId);
    return owner ? owner.team : null;
  }

  private resetControlModeForKickoff(): void {
    const initialMode = this.kickoffTeam === this.localSide ? 'ATTACK' : 'DEFENSE';
    this.controlModeState = createControlModeState(initialMode);
  }

  private updateControlMode(dtSeconds: number): boolean {
    const result = stepControlMode(
      this.controlModeState,
      {
        phase: this.phase,
        localTeam: this.localSide,
        ballOwnerTeam: this.resolveBallOwnerTeam(),
        lastTouchTeam: this.ball.lastTouchTeam,
        setPieceTeam: this.setPiece?.team ?? null,
        kickoffTeam: this.kickoffTeam,
      },
      dtSeconds * 1000,
    );
    this.controlModeState = result.state;
    return result.changed;
  }

  public getShotCharge(side: TeamSide = this.localSide): number {
    return side === 'away' ? this.awayShotCharge : this.shotCharge;
  }

  constructor(
    homeTeam: TeamConfig,
    awayTeam: TeamConfig,
    homeFormation: FormationId,
    awayFormation: FormationId,
    halfDurationSeconds: number,
    cameraMode: CameraMode,
    callbacks: MatchEngineCallbacks,
    homeMentality: TacticalMentality = 'balanced',
    awayMentality: TacticalMentality = 'balanced',
  ) {
    this.homeTeam = homeTeam;
    this.awayTeam = awayTeam;
    this.homeFormation = homeFormation;
    this.awayFormation = awayFormation;
    this.homeMentality = homeMentality;
    this.awayMentality = awayMentality;
    this.halfDurationSeconds = halfDurationSeconds;
    this.cameraMode = cameraMode;
    this.callbacks = callbacks;

    this.ball = this.createEmptyBall();
    this.replayBallProxy = this.createEmptyBall();
    this.stats = this.createEmptyStats();
    this.rebuildTeams();
  }

  private emitSound(event: OnlineSoundEvent): void {
    this.callbacks.onSoundEvent?.(event);
    if (this.callbacks.onSoundEvent && typeof window === 'undefined') {
      return;
    }
    this.playSoundEventLocally(event);
  }

  private playSoundEventLocally(event: OnlineSoundEvent): void {
    switch (event.type) {
      case 'kick':
        soundEngine.playKick(event.power);
        break;
      case 'whistle':
        soundEngine.playWhistle(event.pattern);
        break;
      case 'post':
        soundEngine.playPostHit();
        break;
      case 'goal':
        soundEngine.playGoalCheer();
        break;
      case 'net':
        soundEngine.playNetSwish();
        break;
      case 'tackle':
        soundEngine.playTackle();
        break;
      case 'crowd':
        soundEngine.playCrowdReaction(event.reaction);
        break;
    }
  }

  private createEmptyBall(): BallState {
    return {
      position: { x: 0, y: BALL_RADIUS, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      spin: { x: 0, y: 0, z: 0 },
      ownerId: null,
      lastTouchTeam: null,
      lastTouchPlayerId: null,
      lastTouchPlayerName: null,
      lastTouchSource: 'kickoff',
      pickupLockTimer: 0,
    };
  }

  private createEmptyStats(): MatchStats {
    return {
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
      homeOffsides: 0,
      awayOffsides: 0,
      homeYellowCards: 0,
      awayYellowCards: 0,
      homeRedCards: 0,
      awayRedCards: 0,
      homePossessionSeconds: 0,
      awayPossessionSeconds: 0,
      lastScorerName: null,
      lastScorerTeam: null,
      lastGoalMinute: null,
    };
  }

  private ensureControlledPlayers(): void {
    const hasHomeControlled = this.players.some(
      (p) => p.team === 'home' && p.isControlled && !p.isSentOff,
    );
    if (!hasHomeControlled) {
      const homeStriker =
        this.players.find((p) => p.team === 'home' && p.role === 'ST' && !p.isSentOff) ??
        this.players.find((p) => p.team === 'home' && p.role !== 'GK' && !p.isSentOff);
      if (homeStriker) homeStriker.isControlled = true;
    }

    if (this.awayHumanControl) {
      const hasAwayControlled = this.players.some(
        (p) => p.team === 'away' && p.isControlled && !p.isSentOff,
      );
      if (!hasAwayControlled) {
        const awayStriker =
          this.players.find((p) => p.team === 'away' && p.role === 'ST' && !p.isSentOff) ??
          this.players.find((p) => p.team === 'away' && p.role !== 'GK' && !p.isSentOff);
        if (awayStriker) awayStriker.isControlled = true;
      }
    } else {
      for (const p of this.players) {
        if (p.team === 'away') p.isControlled = false;
      }
    }
  }

  public rebuildTeams(): void {
    const home = createTeamPlayers(this.homeTeam, 'home', this.homeFormation);
    const away = createTeamPlayers(this.awayTeam, 'away', this.awayFormation);
    this.players = [...home, ...away];
    this.replayPlayerProxies = this.players.map((p) => ({
      ...p,
      position: { ...p.position },
      velocity: { ...p.velocity },
      homeAnchor: { ...p.homeAnchor },
      attributes: { ...p.attributes },
      appearance: { ...p.appearance },
    }));
    this.shotCharge = 0;
    this.awayShotCharge = 0;
    this.setPiece = null;
    this.isReplaying = false;
    this.netBallTarget = null;
    this.netPlayerTargets.clear();
    this.aiDecisionCache.clear();
    this.gkDiveReactionTimer.clear();
    this.aiTickCounter = 0;
    this.lastPossessionTeam = null;
    this.transitionTimer = 0;
    this.hasReceivedNetSnapshot = false;
    this.replayRecorder.clear();
    resetForKickoff(
      this.players,
      this.ball,
      this.homeFormation,
      this.awayFormation,
      this.kickoffTeam,
    );
    this.ensureControlledPlayers();
  }

  public startNewMatch(
    homeTeam: TeamConfig,
    awayTeam: TeamConfig,
    homeFormation: FormationId,
    awayFormation: FormationId,
    halfDurationSeconds: number,
    homeMentality: TacticalMentality = this.homeMentality,
    awayMentality: TacticalMentality = this.awayMentality,
    options?: {
      awayHumanControl?: boolean;
      localSide?: TeamSide;
      isOnlineClient?: boolean;
    },
  ): void {
    this.homeTeam = homeTeam;
    this.awayTeam = awayTeam;
    this.homeFormation = homeFormation;
    this.awayFormation = awayFormation;
    this.homeMentality = homeMentality;
    this.awayMentality = awayMentality;
    this.halfDurationSeconds = halfDurationSeconds;
    this.awayHumanControl = options?.awayHumanControl ?? false;
    this.localSide = options?.localSide ?? 'home';
    this.isOnlineClient = options?.isOnlineClient ?? false;

    this.half = 1;
    this.halfElapsedReal = 0;
    this.matchMinutes = 0;
    this.matchSeconds = 0;
    this.phase = 'live';
    this.shellState = 'playing';
    this.kickoffTeam = 'home';
    this.goalBanner = null;
    this.setPiece = null;
    this.isReplaying = false;
    this.hitstopTimer = 0;
    this.goalCelebrationTimer = 0;
    this.goalTotalElapsed = 0;
    this.halftimeTimer = 0;
    this.shotCharge = 0;
    this.awayShotCharge = 0;
    this.stats = this.createEmptyStats();
    this.rulesState = createMatchRulesState();
    this.rebuildTeams();
    this.resetControlModeForKickoff();
    if (!this.isOnlineClient) {
      this.emitSound({ type: 'whistle', pattern: 'short' });
    }
    this.emitHudSnapshot();
  }

  public skipReplay(): void {
    if (this.phase !== 'goal' || this.isOnlineClient) return;
    this.finishGoalCelebration();
  }

  private finishGoalCelebration(): void {
    this.goalBanner = null;
    this.isReplaying = false;
    this.phase = 'live';
    this.shotCharge = 0;
    this.awayShotCharge = 0;
    this.replayRecorder.clear();
    resetForKickoff(
      this.players,
      this.ball,
      this.homeFormation,
      this.awayFormation,
      this.kickoffTeam,
    );
    resetTransientRuleState(this.rulesState);
    this.ensureControlledPlayers();
    this.resetControlModeForKickoff();
    this.emitSound({ type: 'whistle', pattern: 'short' });
    this.emitHudSnapshot();
  }

  public getControlledPlayer(side: TeamSide = this.localSide): PlayerState | null {
    return (
      this.players.find((p) => p.team === side && p.isControlled) ??
      this.players.find((p) => p.isControlled) ??
      null
    );
  }

  /**
   * Produces a compact authoritative snapshot for server-to-client synchronization.
   */
  public getOnlineSnapshot(tick: number, events: OnlineSoundEvent[]): OnlineMatchSnapshot {
    const compactPlayers: CompactPlayerNetState[] = this.players.map((p) => ({
      id: p.id,
      x: Math.round(p.position.x * 100) / 100,
      y: Math.round(p.position.y * 100) / 100,
      z: Math.round(p.position.z * 100) / 100,
      vx: Math.round(p.velocity.x * 100) / 100,
      vz: Math.round(p.velocity.z * 100) / 100,
      facingAngle: Math.round(p.facingAngle * 1000) / 1000,
      stamina: Math.round(p.stamina),
      actionState: p.actionState,
      diveDir: p.diveDir,
      hasBall: p.hasBall,
      isControlled: p.isControlled,
      animPhase: Math.round(p.animPhase * 100) / 100,
      isSentOff: p.isSentOff,
      yellowCards: p.yellowCards,
    }));

    return {
      tick,
      serverTime: Date.now(),
      phase: this.phase,
      half: this.half,
      matchMinutes: this.matchMinutes,
      matchSeconds: this.matchSeconds,
      isReplaying: this.isReplaying,
      homeShotCharge: Math.round(this.shotCharge * 100) / 100,
      awayShotCharge: Math.round(this.awayShotCharge * 100) / 100,
      ball: {
        position: {
          x: Math.round(this.ball.position.x * 100) / 100,
          y: Math.round(this.ball.position.y * 100) / 100,
          z: Math.round(this.ball.position.z * 100) / 100,
        },
        velocity: {
          x: Math.round(this.ball.velocity.x * 100) / 100,
          y: Math.round(this.ball.velocity.y * 100) / 100,
          z: Math.round(this.ball.velocity.z * 100) / 100,
        },
        spin: {
          x: Math.round(this.ball.spin.x * 100) / 100,
          y: Math.round(this.ball.spin.y * 100) / 100,
          z: Math.round(this.ball.spin.z * 100) / 100,
        },
        ownerId: this.ball.ownerId,
        lastTouchTeam: this.ball.lastTouchTeam,
        lastTouchPlayerId: this.ball.lastTouchPlayerId ?? null,
        lastTouchPlayerName: this.ball.lastTouchPlayerName,
        lastTouchSource: this.ball.lastTouchSource,
        pickupLockTimer: 0,
      },
      players: compactPlayers,
      setPiece: this.setPiece
        ? {
            ...this.setPiece,
            spot: { ...this.setPiece.spot },
            foul: this.setPiece.foul ? { ...this.setPiece.foul, foulPosition: { ...this.setPiece.foul.foulPosition } } : null,
            offside: this.setPiece.offside
              ? { ...this.setPiece.offside, offsidePosition: { ...this.setPiece.offside.offsidePosition } }
              : null,
          }
        : null,
      goalBanner: this.goalBanner ? { ...this.goalBanner } : null,
      stats: { ...this.stats },
      events,
    };
  }

  /**
   * Applies an authoritative server snapshot on an online client, setting up smooth interpolation.
   */
  public applyOnlineSnapshot(snapshot: OnlineMatchSnapshot, localSide: TeamSide): void {
    this.isOnlineClient = true;
    this.awayHumanControl = true;
    this.localSide = localSide;

    const prevPhase = this.phase;
    this.phase = snapshot.phase;
    this.half = snapshot.half;
    this.matchMinutes = snapshot.matchMinutes;
    this.matchSeconds = snapshot.matchSeconds;
    this.isReplaying = snapshot.isReplaying;
    this.shotCharge = snapshot.homeShotCharge;
    this.awayShotCharge = snapshot.awayShotCharge;
    this.setPiece = snapshot.setPiece;
    this.goalBanner = snapshot.goalBanner;
    this.stats = { ...snapshot.stats };

    const ballJump = Math.hypot(
      snapshot.ball.position.x - this.ball.position.x,
      snapshot.ball.position.z - this.ball.position.z,
    );
    const snapImmediate =
      !this.hasReceivedNetSnapshot ||
      ballJump > 12 ||
      (prevPhase !== snapshot.phase && (snapshot.phase === 'live' || snapshot.phase === 'setpiece'));

    this.ball.ownerId = snapshot.ball.ownerId;
    this.ball.lastTouchTeam = snapshot.ball.lastTouchTeam;
    this.ball.lastTouchPlayerId = snapshot.ball.lastTouchPlayerId ?? null;
    this.ball.lastTouchPlayerName = snapshot.ball.lastTouchPlayerName;
    this.ball.lastTouchSource = snapshot.ball.lastTouchSource;
    this.ball.spin = { ...snapshot.ball.spin };
    this.ball.velocity = { ...snapshot.ball.velocity };
    this.netBallTarget = {
      x: snapshot.ball.position.x,
      y: snapshot.ball.position.y,
      z: snapshot.ball.position.z,
      vx: snapshot.ball.velocity.x,
      vy: snapshot.ball.velocity.y,
      vz: snapshot.ball.velocity.z,
    };
    if (snapImmediate) {
      this.ball.position = { ...snapshot.ball.position };
    }

    const byId = new Map<string, CompactPlayerNetState>();
    for (const np of snapshot.players) {
      byId.set(np.id, np);
    }

    for (const p of this.players) {
      const np = byId.get(p.id);
      if (!np) continue;
      p.stamina = np.stamina;
      p.actionState = np.actionState;
      p.diveDir = np.diveDir;
      p.hasBall = np.hasBall;
      p.isControlled = np.isControlled;
      p.isSentOff = np.isSentOff ?? false;
      p.yellowCards = np.yellowCards ?? 0;
      p.velocity.x = np.vx;
      p.velocity.z = np.vz;
      p.animPhase = np.animPhase;

      const distJump = Math.hypot(np.x - p.position.x, np.z - p.position.z);
      this.netPlayerTargets.set(p.id, {
        x: np.x,
        y: np.y,
        z: np.z,
        vx: np.vx,
        vz: np.vz,
        facingAngle: np.facingAngle,
      });

      if (snapImmediate || distJump > 9) {
        p.position.x = np.x;
        p.position.y = np.y;
        p.position.z = np.z;
        p.facingAngle = np.facingAngle;
      }
    }

    const wasFirstSnapshot = !this.hasReceivedNetSnapshot;
    this.hasReceivedNetSnapshot = true;

    if (wasFirstSnapshot) {
      const ownerTeam = this.resolveBallOwnerTeam();
      const firstTeam =
        this.phase === 'setpiece' && this.setPiece
          ? this.setPiece.team
          : ownerTeam ?? this.ball.lastTouchTeam ?? this.kickoffTeam;
      this.controlModeState = createControlModeState(
        firstTeam === this.localSide ? 'ATTACK' : 'DEFENSE',
      );
    } else {
      this.updateControlMode(0);
    }

    for (const ev of snapshot.events) {
      this.playSoundEventLocally(ev);
      if (ev.type === 'post') {
        this.callbacks.onCameraTrauma(0.45);
      } else if (ev.type === 'goal') {
        this.callbacks.onCameraTrauma(0.55);
      }
    }

    soundEngine.updateCrowdIntensity(
      computeCrowdIntensity({
        shellState: this.shellState,
        phase: this.phase,
        ballX: this.ball.position.x,
        ballSpeed: Math.hypot(this.ball.velocity.x, this.ball.velocity.z),
        isReplaying: this.isReplaying,
        isOnline: true,
      }),
    );

    if (snapshot.phase === 'fulltime') {
      this.shellState = 'gameover';
    }

    this.emitHudSnapshot();
  }

  /**
   * Smoothly interpolates ball and remote players between server snapshots at 60 FPS.
   */
  public stepOnlineInterpolation(rawDt: number): void {
    const dt = Math.min(rawDt, 0.05);
    const ballAlpha = Math.min(1, 18 * dt);
    const playerAlpha = Math.min(1, 15 * dt);

    if (this.netBallTarget) {
      // Gentle velocity lead compensation for smoother fast shots/passes
      this.netBallTarget.x += this.netBallTarget.vx * dt * 0.35;
      this.netBallTarget.z += this.netBallTarget.vz * dt * 0.35;
      this.ball.position.x += (this.netBallTarget.x - this.ball.position.x) * ballAlpha;
      this.ball.position.y += (this.netBallTarget.y - this.ball.position.y) * ballAlpha;
      this.ball.position.z += (this.netBallTarget.z - this.ball.position.z) * ballAlpha;
    }

    for (const p of this.players) {
      const target = this.netPlayerTargets.get(p.id);
      if (!target) continue;
      target.x += target.vx * dt * 0.25;
      target.z += target.vz * dt * 0.25;
      p.position.x += (target.x - p.position.x) * playerAlpha;
      p.position.y += (target.y - p.position.y) * playerAlpha;
      p.position.z += (target.z - p.position.z) * playerAlpha;
      p.facingAngle = lerpAngle(p.facingAngle, target.facingAngle, Math.min(1, 16 * dt));
      const speed = Math.hypot(p.velocity.x, p.velocity.z);
      p.animPhase += speed * dt * 2.2;
    }

    if (this.updateControlMode(dt)) {
      this.emitHudSnapshot();
    }
  }

  /**
   * Returns live state or interpolated slow-motion replay proxies for 3D scene rendering.
   */
  public getVisualState(): { ball: BallState; players: PlayerState[] } {
    if (this.isOnlineClient || !this.isReplaying || this.replayRecorder.getClipLength() === 0) {
      return { ball: this.ball, players: this.players };
    }

    const replayProgress = Math.max(
      0,
      Math.min(1, (this.goalTotalElapsed - GOAL_IMPACT_DURATION) / GOAL_REPLAY_DURATION),
    );
    const clipSample = this.replayRecorder.sampleAtProgress(0.3 + replayProgress * 0.7);
    if (!clipSample) {
      return { ball: this.ball, players: this.players };
    }

    this.replayBallProxy.position.x = clipSample.ballPos.x;
    this.replayBallProxy.position.y = clipSample.ballPos.y;
    this.replayBallProxy.position.z = clipSample.ballPos.z;
    this.replayBallProxy.velocity.x = clipSample.ballVel.x;
    this.replayBallProxy.velocity.y = clipSample.ballVel.y;
    this.replayBallProxy.velocity.z = clipSample.ballVel.z;
    this.replayBallProxy.spin.x = clipSample.ballSpin.x;
    this.replayBallProxy.spin.y = clipSample.ballSpin.y;
    this.replayBallProxy.spin.z = clipSample.ballSpin.z;

    for (let i = 0; i < this.replayPlayerProxies.length; i++) {
      const proxy = this.replayPlayerProxies[i];
      const f = clipSample.players[i];
      if (!f) continue;
      proxy.position.x = f.x;
      proxy.position.y = f.y;
      proxy.position.z = f.z;
      proxy.facingAngle = f.facingAngle;
      proxy.actionState = f.actionState;
      proxy.diveDir = f.diveDir;
      proxy.animPhase = f.animPhase;
      proxy.isControlled = this.players[i]?.isControlled ?? false;
    }

    return { ball: this.replayBallProxy, players: this.replayPlayerProxies };
  }

  public step(rawDt: number, input: InputSnapshot, awayInput?: InputSnapshot): void {
    if (this.shellState !== 'playing') {
      return;
    }

    if (this.isOnlineClient) {
      this.stepOnlineInterpolation(rawDt);
      return;
    }

    const dt = Math.min(rawDt, 0.05);

    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      return;
    }

    if (this.phase === 'goal') {
      stepBallPhysics(this.ball, dt);
      this.goalTotalElapsed += dt;
      this.goalCelebrationTimer -= dt;

      const shouldReplay =
        !this.awayHumanControl &&
        this.goalTotalElapsed >= GOAL_IMPACT_DURATION &&
        this.replayRecorder.getClipLength() > 4;

      if (shouldReplay !== this.isReplaying) {
        this.isReplaying = shouldReplay;
        this.emitHudSnapshot();
      }

      if (
        this.isReplaying &&
        (input.shootPressed || input.passPressed || input.switchPressed)
      ) {
        this.finishGoalCelebration();
        return;
      }

      if (this.goalCelebrationTimer <= 0) {
        this.finishGoalCelebration();
      }
      return;
    }

    if (this.phase === 'halftime') {
      this.halftimeTimer -= dt;
      if (this.halftimeTimer <= 0) {
        this.half = 2;
        this.halfElapsedReal = 0;
        this.phase = 'live';
        this.kickoffTeam = 'away';
        this.shotCharge = 0;
        this.awayShotCharge = 0;
        this.setPiece = null;
        this.replayRecorder.clear();
        resetForKickoff(
          this.players,
          this.ball,
          this.homeFormation,
          this.awayFormation,
          'away',
        );
        this.ensureControlledPlayers();
        resetTransientRuleState(this.rulesState);
        this.resetControlModeForKickoff();
        this.emitSound({ type: 'whistle', pattern: 'short' });
        this.emitHudSnapshot();
      }
      return;
    }

    if (this.phase === 'fulltime') {
      return;
    }

    stepRuleTimers(this.rulesState, dt);

    // Advance match clock
    this.halfElapsedReal += dt;
    const clock = computeMatchClock(
      this.half,
      this.halfElapsedReal,
      this.halfDurationSeconds,
    );
    this.matchMinutes = clock.matchMinutes;
    this.matchSeconds = clock.matchSeconds;

    if (clock.phaseTransition === 'halftime') {
      this.phase = 'halftime';
      this.halftimeTimer = 2.6;
      this.shotCharge = 0;
      this.awayShotCharge = 0;
      this.setPiece = null;
      this.emitSound({ type: 'whistle', pattern: 'double' });
      this.emitHudSnapshot();
      return;
    }

    if (clock.phaseTransition === 'fulltime') {
      this.phase = 'fulltime';
      this.shellState = 'gameover';
      this.shotCharge = 0;
      this.awayShotCharge = 0;
      this.setPiece = null;
      this.emitSound({ type: 'whistle', pattern: 'long' });
      this.callbacks.onMatchFinished({ ...this.stats });
      this.emitHudSnapshot();
      return;
    }

    if (this.phase === 'setpiece' && this.setPiece) {
      this.stepSetPiecePhase(dt, input, awayInput);
      return;
    }

    if (input.switchPressed) {
      const current = this.getControlledPlayer('home');
      const target = selectSwitchTarget(
        this.players,
        this.ball,
        'home',
        current?.id ?? null,
      );
      if (target) {
        if (current) current.isControlled = false;
        target.isControlled = true;
        this.shotCharge = 0;
      }
    }

    if (this.awayHumanControl && awayInput?.switchPressed) {
      const currentAway = this.getControlledPlayer('away');
      const targetAway = selectSwitchTarget(
        this.players,
        this.ball,
        'away',
        currentAway?.id ?? null,
      );
      if (targetAway) {
        if (currentAway) currentAway.isControlled = false;
        targetAway.isControlled = true;
        this.awayShotCharge = 0;
      }
    }

    this.lastHomeInputDir.x = input.moveX;
    this.lastHomeInputDir.z = input.moveZ;
    if (awayInput) {
      this.lastAwayInputDir.x = awayInput.moveX;
      this.lastAwayInputDir.z = awayInput.moveZ;
    }

    if (this.transitionTimer > 0) {
      this.transitionTimer = Math.max(0, this.transitionTimer - dt);
    }
    this.aiTickCounter += 1;

    const homeAssign = computeDefensiveAssignments(this.players, this.ball, 'home');
    const awayAssign = computeDefensiveAssignments(this.players, this.ball, 'away');

    const homeTransition: TeamTransitionMode =
      this.transitionTimer > 0 && this.lastPossessionTeam !== null
        ? this.lastPossessionTeam === 'home'
          ? 'attack'
          : 'defend'
        : 'none';
    const awayTransition: TeamTransitionMode =
      this.transitionTimer > 0 && this.lastPossessionTeam !== null
        ? this.lastPossessionTeam === 'away'
          ? 'attack'
          : 'defend'
        : 'none';

    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      if (p.isSentOff) {
        p.velocity.x = 0;
        p.velocity.z = 0;
        p.hasBall = false;
        p.isControlled = false;
        continue;
      }
      if (p.actionTimer > 0) {
        p.actionTimer = Math.max(0, p.actionTimer - dt);
        if (
          p.actionTimer === 0 &&
          (p.actionState === 'kick' || p.actionState === 'tackle' || p.actionState === 'dive')
        ) {
          p.actionState = 'idle';
          p.diveDir = 0;
        }
      }
      if (p.tackleCooldown > 0) p.tackleCooldown = Math.max(0, p.tackleCooldown - dt);
      if (p.kickCooldown > 0) p.kickCooldown = Math.max(0, p.kickCooldown - dt);
      if (p.diveCooldown > 0) p.diveCooldown = Math.max(0, p.diveCooldown - dt);
      if (p.gkHoldTimer > 0) p.gkHoldTimer = Math.max(0, p.gkHoldTimer - dt);

      if (p.isControlled && p.team === 'home') {
        this.stepControlledPlayer(p, input, dt);
      } else if (p.isControlled && p.team === 'away' && this.awayHumanControl && awayInput) {
        this.stepControlledPlayer(p, awayInput, dt);
      } else {
        const formation = p.team === 'home' ? this.homeFormation : this.awayFormation;
        const mentality = p.team === 'home' ? this.homeMentality : this.awayMentality;
        const assign = p.team === 'home' ? homeAssign : awayAssign;
        const transition = p.team === 'home' ? homeTransition : awayTransition;

        // Refresh urgent AI every tick (GK, ball carrier, presser, transition); stagger off-ball AI every 3 ticks for mobile CPU efficiency
        const isUrgent =
          p.role === 'GK' ||
          p.hasBall ||
          p.id === assign.presserId ||
          transition !== 'none' ||
          !this.aiDecisionCache.has(p.id);
        let steering = this.aiDecisionCache.get(p.id);
        if (isUrgent || (this.aiTickCounter + i) % 3 === 0 || !steering) {
          steering = computeAiSteering(
            p,
            this.players,
            this.ball,
            formation,
            assign.presserId,
            assign.coverId,
            mentality,
            transition,
          );
          this.aiDecisionCache.set(p.id, steering);
        }
        this.stepAiPlayer(p, steering, dt);
      }

      clampPlayerToArena(p.position);
      if (this.phase === 'setpiece') return;
    }

    resolvePlayerCollisions(this.players);

    if (this.ball.ownerId !== null) {
      const owner = this.players.find((p) => p.id === this.ball.ownerId);
      if (!owner) {
        this.ball.ownerId = null;
        this.shotCharge = 0;
        this.awayShotCharge = 0;
      } else {
        if (owner.team === 'home') this.stats.homePossessionSeconds += dt;
        else this.stats.awayPossessionSeconds += dt;

        const dirX = Math.sin(owner.facingAngle);
        const dirZ = Math.cos(owner.facingAngle);
        const ownerSpeed = Math.hypot(owner.velocity.x, owner.velocity.z);
        const isSprinting = owner.actionState === 'sprint' || ownerSpeed > 7.4;
        const speedNorm = Math.min(1, ownerSpeed / 9.8);
        // Tighter close control when slow; longer push-ahead touches with stride cadence when sprinting
        const stridePulse = isSprinting ? Math.sin(owner.animPhase * 1.1) * 0.08 : 0;
        const leadDist =
          DRIBBLE_OFFSET_DIST * (0.86 + speedNorm * (isSprinting ? 0.48 : 0.16)) + stridePulse;
        const desiredBallX = owner.position.x + dirX * leadDist;
        const desiredBallZ = owner.position.z + dirZ * leadDist;
        const controlTightness = isSprinting ? 11.5 : 16.5;
        const followRate = Math.min(1, (controlTightness + owner.attributes.dribbling * 0.12) * dt);

        this.ball.position.x += (desiredBallX - this.ball.position.x) * followRate;
        this.ball.position.z += (desiredBallZ - this.ball.position.z) * followRate;
        this.ball.position.y = BALL_RADIUS;
        this.ball.velocity.x = owner.velocity.x;
        this.ball.velocity.y = 0;
        this.ball.velocity.z = owner.velocity.z;
        this.ball.spin.x = -owner.velocity.z * 0.9;
        this.ball.spin.y = 0;
        this.ball.spin.z = owner.velocity.x * 0.9;

        // Check boundary crossings even when a dribbler carries the ball across a line
        const carrierBoundary = evaluateBallBoundaryDecision(this.ball);
        if (carrierBoundary !== null) {
          this.applyBoundaryDecision(carrierBoundary);
          return;
        }

        // Event-driven spatial check for illegal forceful pushing from behind against carrier
        for (let i = 0; i < this.players.length; i++) {
          const opp = this.players[i];
          if (opp.team === owner.team || opp.isSentOff || opp.actionState !== 'sprint') continue;
          const dSq =
            (opp.position.x - owner.position.x) * (opp.position.x - owner.position.x) +
            (opp.position.z - owner.position.z) * (opp.position.z - owner.position.z);
          if (dSq > 1.0) continue;
          const pushFoul = evaluateIllegalPushFoul(
            this.rulesState,
            opp,
            owner,
            this.ball,
            this.players,
          );
          if (pushFoul) {
            this.handleFoulDetected(pushFoul, opp);
            return;
          }
        }
      }
    } else {
      this.shotCharge = 0;
      this.awayShotCharge = 0;
      const ballResult = stepBallPhysics(this.ball, dt);
      if (ballResult.hitPost) {
        this.emitSound({ type: 'post' });
        this.emitSound({ type: 'crowd', reaction: 'ooh' });
        this.callbacks.onCameraTrauma(0.45);
      }

      if (ballResult.scoredTeam !== null) {
        this.replayRecorder.record(this.ball, this.players, 0.04);
        this.handleGoalScored(ballResult.scoredTeam);
        return;
      }

      const boundary = evaluateBallBoundaryDecision(this.ball);
      if (boundary !== null) {
        this.applyBoundaryDecision(boundary);
        return;
      }

      // Check active offside interference before ball pickup
      const interferenceOffside = evaluateOffsideInterference(
        this.rulesState,
        this.ball,
        this.players,
      );
      if (interferenceOffside) {
        this.handleOffsideDetected(interferenceOffside);
        return;
      }

      this.tryPickupLooseBall();
      if (this.phase !== 'live') return;

      // Prevent loose balls from ever ghosting through players when not picked up
      if (this.ball.ownerId === null) {
        const blocker = resolveLooseBallBodyContact(this.ball, this.players);
        if (blocker) {
          const offsideOnDeflect = evaluateOffsideOnTouch(this.rulesState, blocker);
          if (offsideOnDeflect) {
            this.handleOffsideDetected(offsideOnDeflect);
            return;
          }
          this.emitSound({ type: 'kick', power: 0.48 });
        }
      }
    }

    if (!this.awayHumanControl) {
      this.replayRecorder.record(this.ball, this.players, dt);
    }

    const controlModeChanged = this.updateControlMode(dt);

    this.hudEmitAccumulator += dt;
    const hudInterval = this.shotCharge > 0 || this.awayShotCharge > 0 ? 0.04 : 0.1;
    if (controlModeChanged || this.hudEmitAccumulator >= hudInterval) {
      this.hudEmitAccumulator = 0;
      soundEngine.updateCrowdIntensity(
        computeCrowdIntensity({
          shellState: this.shellState,
          phase: this.phase,
          ballX: this.ball.position.x,
          ballSpeed: Math.hypot(this.ball.velocity.x, this.ball.velocity.z),
          isReplaying: this.isReplaying,
          isOnline: true,
        }),
      );
      this.emitHudSnapshot();
    }
  }

  private stepSetPiecePhase(
    dt: number,
    homeInput: InputSnapshot,
    awayInput?: InputSnapshot,
  ): void {
    const sp = this.setPiece;
    if (!sp) {
      this.phase = 'live';
      return;
    }

    const taker = sp.takerId ? this.players.find((p) => p.id === sp.takerId) ?? null : null;
    if (!taker) {
      resetTransientRuleState(this.rulesState);
      this.phase = 'live';
      this.setPiece = null;
      this.emitHudSnapshot();
      return;
    }
    const isHumanTaker =
      sp.team === 'home' || (sp.team === 'away' && this.awayHumanControl && Boolean(awayInput));
    const takerInput = sp.team === 'home' ? homeInput : awayInput ?? homeInput;
    const defendingInput = sp.team === 'home' ? awayInput : homeInput;
    const attackGoalX = sp.team === 'home' ? HALF_LENGTH : -HALF_LENGTH;

    // Allow defending human GK to move & dive during penalties
    if (sp.type === 'penalty' && defendingInput && (sp.team === 'away' || this.awayHumanControl)) {
      const defTeam: TeamSide = sp.team === 'home' ? 'away' : 'home';
      const defGk = this.players.find((p) => p.team === defTeam && p.role === 'GK');
      if (defGk) {
        if (defGk.diveCooldown > 0) defGk.diveCooldown = Math.max(0, defGk.diveCooldown - dt);
        if (defGk.actionTimer > 0) {
          defGk.actionTimer = Math.max(0, defGk.actionTimer - dt);
          if (defGk.actionTimer === 0 && defGk.actionState === 'dive') {
            defGk.actionState = 'idle';
            defGk.diveDir = 0;
          }
        }
        if ((defendingInput.tacklePressed || defendingInput.shootPressed) && defGk.diveCooldown <= 0) {
          const diveSign: -1 | 1 = defendingInput.moveZ >= 0 ? 1 : -1;
          defGk.actionState = 'dive';
          defGk.actionTimer = 0.55;
          defGk.diveCooldown = 1.1;
          defGk.diveDir = diveSign;
          defGk.velocity.z = diveSign * 7.8;
        } else if (defGk.actionState !== 'dive') {
          defGk.position.z = Math.max(
            -GOAL_HALF_WIDTH + 0.4,
            Math.min(GOAL_HALF_WIDTH - 0.4, defGk.position.z + defendingInput.moveZ * 4.5 * dt),
          );
        } else {
          defGk.position.z += defGk.velocity.z * dt;
          defGk.velocity.z *= Math.pow(0.92, dt * 60);
        }
      }
    }

    if (isHumanTaker && taker) {
      const moveMag = Math.hypot(takerInput.moveX, takerInput.moveZ);
      if (moveMag > 0.12) {
        const targetAngle = Math.atan2(takerInput.moveX, takerInput.moveZ);
        taker.facingAngle = lerpAngle(taker.facingAngle, targetAngle, Math.min(1, 10 * dt));
      }

      if (takerInput.shootHeld && !takerInput.shootPressed) {
        if (sp.team === 'home') {
          this.shotCharge = Math.min(1, this.shotCharge + 1.45 * dt);
        } else {
          this.awayShotCharge = Math.min(1, this.awayShotCharge + 1.45 * dt);
        }
      }

      if (
        takerInput.shootReleased ||
        takerInput.shootPressed ||
        takerInput.passPressed ||
        takerInput.lobPressed
      ) {
        const rawCharge = sp.team === 'home' ? this.shotCharge : this.awayShotCharge;
        const charge = rawCharge > 0.03 ? rawCharge : 0.55;
        if (sp.team === 'home') this.shotCharge = 0;
        else this.awayShotCharge = 0;

        if (sp.type === 'penalty') {
          const aimZ =
            Math.abs(takerInput.moveZ) > 0.1 ? takerInput.moveZ * (GOAL_HALF_WIDTH * 0.88) : 0;
          const profile = computeShotProfile(taker.attributes.shotPower, charge, false);
          applyBallKick(
            this.ball,
            attackGoalX - sp.spot.x,
            aimZ - sp.spot.z,
            profile.horizontalSpeed * 1.05,
            2.4 + charge * 2.2,
            taker,
            Math.sign(aimZ) * 1.1,
          );
          if (sp.team === 'home') this.stats.homeShots += 1;
          else this.stats.awayShots += 1;
          this.emitSound({ type: 'kick', power: 1.2 });
        } else if (
          (sp.type === 'free_kick' || sp.type === 'corner') &&
          (takerInput.shootReleased || takerInput.shootPressed)
        ) {
          if (sp.type === 'corner') {
            const boxX = sp.team === 'home' ? HALF_LENGTH - 9.5 : -HALF_LENGTH + 9.5;
            const aimZ = Math.abs(takerInput.moveZ) > 0.1 ? takerInput.moveZ * 5 : 0;
            applyBallKick(
              this.ball,
              boxX - sp.spot.x,
              aimZ - sp.spot.z,
              18 + charge * 4,
              6.8 + charge * 1.6,
              taker,
              Math.sign(sp.spot.z || 1) * 1.6,
            );
            if (sp.team === 'home') this.stats.homePasses += 1;
            else this.stats.awayPasses += 1;
          } else {
            const aimZ = Math.abs(takerInput.moveZ) > 0.1 ? takerInput.moveZ * 3.4 : 0;
            const profile = computeShotProfile(taker.attributes.shotPower, charge, false);
            applyBallKick(
              this.ball,
              attackGoalX - sp.spot.x,
              aimZ - sp.spot.z,
              profile.horizontalSpeed,
              4.4 + charge * 2.5,
              taker,
              Math.sign(takerInput.moveZ || 1) * 1.8,
            );
            if (sp.team === 'home') this.stats.homeShots += 1;
            else this.stats.awayShots += 1;
          }
          this.emitSound({ type: 'kick', power: 1.15 });
        } else {
          const isLob = takerInput.lobPressed || sp.type === 'corner' || sp.type === 'goal_kick';
          const aimX = moveMag > 0.12 ? takerInput.moveX : Math.sin(taker.facingAngle);
          const aimZ = moveMag > 0.12 ? takerInput.moveZ : Math.cos(taker.facingAngle);
          const target = findBestPassTarget(taker, this.players, aimX, aimZ);

          if (target) {
            const lead = computeLeadPassVector(taker, target, isLob);
            applyBallKick(this.ball, lead.dirX, lead.dirZ, lead.speed, lead.loft, taker);
            if (target.role !== 'GK') {
              taker.isControlled = false;
              target.isControlled = true;
            }
          } else {
            applyBallKick(
              this.ball,
              aimX,
              aimZ,
              isLob ? 20 : 15,
              isLob ? 6.5 : 1.2,
              taker,
            );
          }
          if (sp.team === 'home') this.stats.homePasses += 1;
          else this.stats.awayPasses += 1;
          this.emitSound({ type: 'kick', power: 0.95 });
        }

        const restartOrigin: BallRestartOrigin = sp.type;
        this.ball.lastTouchSource = restartOrigin;
        resetTransientRuleState(this.rulesState);
        capturePassOffsideSnapshot(this.rulesState, taker, this.ball, this.players, restartOrigin);
        this.phase = 'live';
        this.setPiece = null;
        this.emitHudSnapshot();
        return;
      }
    } else {
      sp.timer -= dt;
      if (sp.timer <= 0 && taker) {
        const decision = computeSetPieceAiDecision(taker, sp.type, this.ball, this.players);
        applyBallKick(
          this.ball,
          decision.dirX,
          decision.dirZ,
          decision.speed,
          decision.loft,
          taker,
          decision.sideSpin,
        );
        const restartOrigin: BallRestartOrigin = sp.type;
        this.ball.lastTouchSource = restartOrigin;
        if (decision.isShot) this.stats.awayShots += 1;
        else this.stats.awayPasses += 1;
        this.emitSound({ type: 'kick', power: decision.isShot ? 1.15 : 0.9 });
        resetTransientRuleState(this.rulesState);
        capturePassOffsideSnapshot(this.rulesState, taker, this.ball, this.players, restartOrigin);
        this.phase = 'live';
        this.setPiece = null;
        this.emitHudSnapshot();
        return;
      }
    }

    this.hudEmitAccumulator += dt;
    if (this.hudEmitAccumulator >= 0.06) {
      this.hudEmitAccumulator = 0;
      this.emitHudSnapshot();
    }
  }

  private stepControlledPlayer(p: PlayerState, input: InputSnapshot, dt: number): void {
    const moveMag = Math.hypot(input.moveX, input.moveZ);
    const wantsSprint = input.sprint && p.stamina > 8 && moveMag > 0.15;
    const isHome = p.team === 'home';

    if (wantsSprint) {
      p.stamina = Math.max(0, p.stamina - 22 * dt);
    } else {
      p.stamina = Math.min(p.attributes.staminaMax, p.stamina + 14 * dt);
    }

    if (input.tacklePressed && !p.hasBall && p.tackleCooldown <= 0) {
      const dirX = moveMag > 0.1 ? input.moveX / moveMag : Math.sin(p.facingAngle);
      const dirZ = moveMag > 0.1 ? input.moveZ / moveMag : Math.cos(p.facingAngle);
      p.facingAngle = Math.atan2(dirX, dirZ);
      p.velocity.x = dirX * 11.2;
      p.velocity.z = dirZ * 11.2;
      p.actionState = 'tackle';
      p.actionTimer = 0.34;
      p.tackleCooldown = 0.85;
      this.emitSound({ type: 'tackle' });
      this.attemptTackleSteal(p);
      if (this.phase === 'setpiece') return;
    }

    if (p.actionState !== 'tackle') {
      const dribbleRetention = p.hasBall
        ? 0.89 + (p.attributes.dribbling / 100) * 0.06
        : 1.0;
      const topSpeed = p.attributes.speed * (wantsSprint ? 1.32 : 1.0) * dribbleRetention;
      const targetVx = input.moveX * topSpeed;
      const targetVz = input.moveZ * topSpeed;
      const targetAngle = moveMag > 0.1 ? Math.atan2(input.moveX, input.moveZ) : null;

      stepPlayerLocomotion(p, targetVx, targetVz, targetAngle, dt, wantsSprint, p.hasBall);

      if (moveMag > 0.1) {
        if (p.actionTimer <= 0) {
          p.actionState = wantsSprint ? 'sprint' : p.hasBall ? 'dribble' : 'run';
        }
      } else if (p.actionTimer <= 0) {
        p.actionState = 'idle';
      }
    } else {
      p.velocity.x *= Math.pow(0.88, dt * 60);
      p.velocity.z *= Math.pow(0.88, dt * 60);
      this.attemptTackleSteal(p);
      if (this.phase === 'setpiece') return;
    }

    p.position.x += p.velocity.x * dt;
    p.position.z += p.velocity.z * dt;
    const speed = Math.hypot(p.velocity.x, p.velocity.z);
    p.animPhase += speed * dt * 2.2;

    if (p.hasBall) {
      if (input.shootHeld && !input.shootPressed) {
        if (isHome) this.shotCharge = Math.min(1, this.shotCharge + 1.55 * dt);
        else this.awayShotCharge = Math.min(1, this.awayShotCharge + 1.55 * dt);
      }

      if (input.shootReleased || input.shootPressed) {
        const rawCharge = isHome ? this.shotCharge : this.awayShotCharge;
        const charge = rawCharge > 0.03 ? rawCharge : 0.24;
        if (isHome) this.shotCharge = 0;
        else this.awayShotCharge = 0;

        const targetGoalX = isHome ? HALF_LENGTH : -HALF_LENGTH;
        const aimZ = Math.abs(input.moveZ) > 0.12 ? input.moveZ * 3.4 : 0;
        const shot = computeContextualShot(
          p,
          targetGoalX,
          aimZ,
          charge,
          this.players,
          wantsSprint,
        );

        applyBallKick(
          this.ball,
          shot.dirX,
          shot.dirZ,
          shot.horizontalSpeed,
          shot.loftSpeed,
          p,
          shot.sideSpin,
        );
        capturePassOffsideSnapshot(this.rulesState, p, this.ball, this.players, 'live');
        if (isHome) this.stats.homeShots += 1;
        else this.stats.awayShots += 1;
        this.hitstopTimer = shot.shotKind === 'power' ? 0.045 : 0.032;
        this.callbacks.onCameraTrauma(0.16 + charge * 0.22);
        this.emitSound({ type: 'kick', power: 0.98 + charge * 0.42 });
        this.emitHudSnapshot();
        return;
      }

      if (input.passPressed || input.lobPressed) {
        if (isHome) this.shotCharge = 0;
        else this.awayShotCharge = 0;
        const isLob = input.lobPressed;
        const target = findBestPassTarget(p, this.players, input.moveX, input.moveZ, isLob);
        let dirX = moveMag > 0.15 ? input.moveX : Math.sin(p.facingAngle);
        let dirZ = moveMag > 0.15 ? input.moveZ : Math.cos(p.facingAngle);
        let passSpeed = isLob ? 20.5 : wantsSprint ? 19.2 : 14.8;
        let loft = isLob ? 7.2 : wantsSprint ? 0.85 : 0.35;

        if (target) {
          const lead = computeLeadPassVector(p, target, isLob);
          const dist = Math.hypot(lead.dirX, lead.dirZ);
          dirX = lead.dirX + (Math.random() - 0.5) * lead.spreadFactor * dist;
          dirZ = lead.dirZ + (Math.random() - 0.5) * lead.spreadFactor * dist;
          passSpeed = lead.speed;
          loft = lead.loft;
        }

        applyBallKick(this.ball, dirX, dirZ, passSpeed, loft, p);
        capturePassOffsideSnapshot(this.rulesState, p, this.ball, this.players, 'live');
        if (isHome) this.stats.homePasses += 1;
        else this.stats.awayPasses += 1;
        this.emitSound({ type: 'kick', power: isLob ? 1.0 : passSpeed > 18 ? 0.86 : 0.68 });

        if (target && target.role !== 'GK' && !target.isSentOff) {
          p.isControlled = false;
          target.isControlled = true;
        }
      }
    } else {
      if (isHome) this.shotCharge = 0;
      else this.awayShotCharge = 0;
    }
  }

  private stepAiPlayer(
    p: PlayerState,
    steering: AiSteeringOutput,
    dt: number,
  ): void {
    if (p.role === 'GK') {
      if (steering.shouldDive && p.diveCooldown <= 0 && p.actionState !== 'dive') {
        // Coherent human GK reaction time (0.11s..0.16s) instead of robotic frame-0 instant dive
        const prevReaction = this.gkDiveReactionTimer.get(p.id);
        if (prevReaction === undefined) {
          const distToBall = Math.hypot(
            this.ball.position.x - p.position.x,
            this.ball.position.z - p.position.z,
          );
          const reactionDelay = distToBall < 12 ? 0.14 : 0.1;
          this.gkDiveReactionTimer.set(p.id, reactionDelay);
        } else if (prevReaction > 0) {
          this.gkDiveReactionTimer.set(p.id, Math.max(0, prevReaction - dt));
        } else {
          this.gkDiveReactionTimer.delete(p.id);
          p.actionState = 'dive';
          p.actionTimer = 0.48;
          p.diveCooldown = 1.15;
          p.diveDir = steering.diveDir;
          p.facingAngle = p.team === 'home' ? Math.PI / 2 : -Math.PI / 2;
          p.velocity.x *= 0.25;
          p.velocity.z = steering.diveDir * 7.6;
        }
      } else {
        this.gkDiveReactionTimer.delete(p.id);
      }
    }

    if (
      steering.shouldTackle &&
      !p.hasBall &&
      p.tackleCooldown <= 0 &&
      p.actionState !== 'tackle' &&
      p.actionState !== 'dive'
    ) {
      const ballOwner =
        this.ball.ownerId !== null
          ? this.players.find((pl) => pl.id === this.ball.ownerId) ?? null
          : null;
      const canTackleCleanly =
        !ballOwner ||
        (ballOwner.team !== p.team && isCleanTackleAngle(p, ballOwner, this.ball));

      if (canTackleCleanly) {
        const dx = this.ball.position.x - p.position.x;
        const dz = this.ball.position.z - p.position.z;
        const len = Math.hypot(dx, dz) || 1;
        const nx = dx / len;
        const nz = dz / len;
        p.facingAngle = Math.atan2(nx, nz);
        p.velocity.x = nx * 10.6;
        p.velocity.z = nz * 10.6;
        p.actionState = 'tackle';
        p.actionTimer = 0.34;
        p.tackleCooldown = 1.05;
        this.attemptTackleSteal(p);
        if (this.phase === 'setpiece') return;
      }
    }

    if (p.actionState === 'dive') {
      p.velocity.x *= Math.pow(0.88, dt * 60);
      p.velocity.z *= Math.pow(0.92, dt * 60);
      p.position.x += p.velocity.x * dt;
      p.position.z += p.velocity.z * dt;
      return;
    }

    if (p.actionState === 'tackle') {
      p.velocity.x *= Math.pow(0.88, dt * 60);
      p.velocity.z *= Math.pow(0.88, dt * 60);
      this.attemptTackleSteal(p);
      if (this.phase === 'setpiece') return;
    } else {
      const dx = steering.desiredX - p.position.x;
      const dz = steering.desiredZ - p.position.z;
      const dist = Math.hypot(dx, dz);

      if (dist > 0.35) {
        const nx = dx / dist;
        const nz = dz / dist;
        const maxSpeed = p.attributes.speed * (steering.sprint ? 1.18 : 0.92);
        const desiredSpeed = Math.min(maxSpeed, dist * 2.8);
        const targetAngle = Math.atan2(nx, nz);
        stepPlayerLocomotion(
          p,
          nx * desiredSpeed,
          nz * desiredSpeed,
          targetAngle,
          dt,
          steering.sprint,
          p.hasBall,
        );
        if (p.actionTimer <= 0) {
          p.actionState = p.hasBall ? 'dribble' : steering.sprint ? 'sprint' : 'run';
        }
      } else {
        const bdx = this.ball.position.x - p.position.x;
        const bdz = this.ball.position.z - p.position.z;
        const lookAngle = Math.hypot(bdx, bdz) > 0.5 ? Math.atan2(bdx, bdz) : null;
        stepPlayerLocomotion(p, 0, 0, lookAngle, dt, false, p.hasBall);
        if (p.actionTimer <= 0) p.actionState = 'idle';
      }
    }

    p.position.x += p.velocity.x * dt;
    p.position.z += p.velocity.z * dt;
    const speed = Math.hypot(p.velocity.x, p.velocity.z);
    p.animPhase += speed * dt * 2.2;

    if (p.hasBall && (steering.shouldShoot || steering.shouldPass)) {
      if (steering.shouldShoot) {
        if (p.team === 'home') this.stats.homeShots += 1;
        else this.stats.awayShots += 1;
      } else if (steering.shouldPass) {
        if (p.team === 'home') this.stats.homePasses += 1;
        else this.stats.awayPasses += 1;
      }
      executeAiBallAction(p, this.ball, steering, this.players, (kind) => {
        this.emitSound({ type: 'kick', power: kind === 'kick' ? 1.12 : 0.72 });
      });
      if (this.ball.ownerId === null) {
        capturePassOffsideSnapshot(this.rulesState, p, this.ball, this.players, 'live');
      }
    }
  }

  private attemptTackleSteal(tackler: PlayerState): void {
    if (this.phase !== 'live' || tackler.actionState !== 'tackle' || this.rulesState.eventLocked) {
      return;
    }

    const challenge = evaluateActiveChallenge(this.rulesState, tackler, this.ball, this.players);
    if (challenge.outcome === 'foul' && challenge.foul) {
      this.handleFoulDetected(challenge.foul, tackler);
      return;
    }

    if (this.ball.ownerId === null) {
      const d = Math.hypot(
        this.ball.position.x - tackler.position.x,
        this.ball.position.z - tackler.position.z,
      );
      if (d < TACKLE_REACH) {
        const offside = evaluateOffsideOnTouch(this.rulesState, tackler);
        if (offside) {
          this.handleOffsideDetected(offside);
          return;
        }
        this.claimBall(tackler);
      }
      return;
    }

    const owner = this.players.find((p) => p.id === this.ball.ownerId);
    if (!owner || owner.team === tackler.team) return;

    if (challenge.outcome === 'clean') {
      owner.hasBall = false;
      owner.kickCooldown = 0.5;
      this.claimBall(tackler);
      this.emitSound({ type: 'kick', power: 0.8 });
    }
  }

  private handleFoulDetected(foul: FoulRecord, fouler?: PlayerState): void {
    if (foul.foulingTeamId === 'home') {
      this.stats.homeFouls += 1;
      if (foul.card === 'yellow') this.stats.homeYellowCards = (this.stats.homeYellowCards ?? 0) + 1;
      if (foul.card === 'red') this.stats.homeRedCards = (this.stats.homeRedCards ?? 0) + 1;
    } else {
      this.stats.awayFouls += 1;
      if (foul.card === 'yellow') this.stats.awayYellowCards = (this.stats.awayYellowCards ?? 0) + 1;
      if (foul.card === 'red') this.stats.awayRedCards = (this.stats.awayRedCards ?? 0) + 1;
    }

    if (fouler) {
      fouler.actionState = 'idle';
      fouler.actionTimer = 0;
      fouler.tackleCooldown = 1.6;
    }

    this.ensureControlledPlayers();
    this.triggerSetPiece(foul.restartType, foul.fouledTeamId, { ...foul.foulPosition }, {
      kickKind: foul.kickKind,
      reason: 'foul',
      foul,
    });
  }

  private handleOffsideDetected(offside: OffsideRecord): void {
    if (offside.offsideTeam === 'home') {
      this.stats.homeOffsides = (this.stats.homeOffsides ?? 0) + 1;
    } else {
      this.stats.awayOffsides = (this.stats.awayOffsides ?? 0) + 1;
    }

    const restartTeam: TeamSide = offside.offsideTeam === 'home' ? 'away' : 'home';
    this.triggerSetPiece('indirect_free_kick', restartTeam, { ...offside.offsidePosition }, {
      kickKind: 'indirect',
      reason: 'offside',
      offside,
    });
  }

  private applyBoundaryDecision(decision: OutOfBoundsDecision): void {
    if (this.rulesState.eventLocked) return;

    if (decision.event === 'GOAL' && decision.restartType === 'goal') {
      this.rulesState.ruleState = 'GOAL';
      this.rulesState.eventLocked = true;
      this.rulesState.offsideSnapshot = null;
      this.replayRecorder.record(this.ball, this.players, 0.04);
      this.handleGoalScored(decision.awardedTeam);
      return;
    }

    if (decision.restartType === 'corner') {
      if (decision.awardedTeam === 'home') this.stats.homeCorners += 1;
      else this.stats.awayCorners += 1;
    }

    this.rulesState.offsideSnapshot = null;
    this.rulesState.eventLocked = true;
    this.triggerSetPiece(decision.restartType as SetPieceType, decision.awardedTeam, decision.spot, {
      reason: 'out_of_bounds',
    });
  }

  private triggerSetPiece(
    type: SetPieceType,
    restartTeam: TeamSide,
    spot: Vec3,
    meta?: {
      kickKind?: FreeKickKind;
      reason?: 'out_of_bounds' | 'foul' | 'offside';
      foul?: FoulRecord | null;
      offside?: OffsideRecord | null;
    },
  ): void {
    const setup = computeSetPieceSetup(type, spot, restartTeam, this.players, this.ball);
    this.shotCharge = 0;
    this.awayShotCharge = 0;
    this.phase = 'setpiece';
    this.rulesState.eventLocked = true;
    this.rulesState.offsideSnapshot = null;
    this.rulesState.ruleState =
      type === 'throw_in'
        ? 'THROW_IN'
        : type === 'goal_kick'
          ? 'GOAL_KICK'
          : type === 'corner'
            ? 'CORNER_KICK'
            : type === 'penalty'
              ? 'PENALTY'
              : type === 'indirect_free_kick'
                ? 'INDIRECT_FREE_KICK'
                : 'FREE_KICK';

    this.setPiece = {
      type,
      team: restartTeam,
      spot: setup.spot,
      takerId: setup.takerId,
      timer: type === 'penalty' ? 1.45 : 1.15,
      kickKind: meta?.kickKind ?? (type === 'indirect_free_kick' ? 'indirect' : 'direct'),
      reason: meta?.reason ?? 'out_of_bounds',
      foul: meta?.foul ?? null,
      offside: meta?.offside ?? null,
    };
    this.emitSound({
      type: 'whistle',
      pattern:
        type === 'penalty' || type === 'free_kick' || type === 'indirect_free_kick'
          ? 'double'
          : 'short',
    });
    if (type === 'penalty' || type === 'free_kick' || type === 'indirect_free_kick') {
      this.emitSound({ type: 'crowd', reaction: 'boo' });
    } else if (type === 'corner') {
      this.emitSound({ type: 'crowd', reaction: 'applause' });
    }
    this.updateControlMode(0);
    this.emitHudSnapshot();
  }

  private tryPickupLooseBall(): void {
    if (this.ball.pickupLockTimer > 0) return;

    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      if (p.role !== 'GK') continue;
      const incomingSpeed = Math.hypot(this.ball.velocity.x, this.ball.velocity.z);
      const wasOpponentShot = this.ball.lastTouchTeam !== null && this.ball.lastTouchTeam !== p.team;
      const saveResult = attemptGoalkeeperSave(p, this.ball);
      if (saveResult === 'parry') {
        if (p.team === 'home') this.stats.homeSaves += 1;
        else this.stats.awaySaves += 1;
        this.callbacks.onCameraTrauma(0.25);
        this.emitSound({ type: 'kick', power: 1.1 });
        this.emitSound({ type: 'crowd', reaction: 'ooh' });
        this.emitHudSnapshot();
        return;
      }
      if (saveResult === 'catch') {
        if (wasOpponentShot && incomingSpeed > 9.5) {
          if (p.team === 'home') this.stats.homeSaves += 1;
          else this.stats.awaySaves += 1;
          this.emitSound({ type: 'crowd', reaction: 'applause' });
        }
        this.rulesState.offsideSnapshot = null;
        p.gkHoldTimer = 0.75;
        this.claimBall(p);
        this.emitSound({ type: 'kick', power: 0.55 });
        this.emitHudSnapshot();
        return;
      }
    }

    if (this.ball.position.y > 1.92) return;

    let closestReceiver: PlayerState | null = null;
    let bestReceiverDist = DRIBBLE_CONTROL_RADIUS;
    let closestInterceptor: PlayerState | null = null;
    let bestInterceptDist = Infinity;
    let closestBlocker: PlayerState | null = null;
    let bestBlockDist = Infinity;

    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      if (p.role === 'GK' || p.kickCooldown > 0 || p.isSentOff) continue;

      const d = Math.hypot(
        this.ball.position.x - p.position.x,
        this.ball.position.z - p.position.z,
      );

      // Opponent pass/shot: enforce realistic non-magnetic interception/block rules
      if (this.ball.lastTouchTeam !== null && this.ball.lastTouchTeam !== p.team) {
        const outcome = evaluateInterception(p, this.ball);
        if (outcome === 'intercept' && d < bestInterceptDist) {
          bestInterceptDist = d;
          closestInterceptor = p;
        } else if (outcome === 'block' && d < bestBlockDist) {
          bestBlockDist = d;
          closestBlocker = p;
        }
        continue;
      }

      // Teammate pass reception or neutral loose ball
      if (this.ball.position.y <= 1.55 && d < bestReceiverDist) {
        bestReceiverDist = d;
        closestReceiver = p;
      }
    }

    // Physical block of a fast/high opponent strike
    if (!closestReceiver && !closestInterceptor && closestBlocker) {
      // Event-driven handball check ONLY on rare airborne arm-height strike blocks during diving/lunging block
      const isOutstretchedArmBlock =
        closestBlocker.actionState === 'tackle' &&
        this.ball.position.y >= 1.24 &&
        this.ball.position.y <= 1.5;
      const handball = evaluateHandballFoul(
        this.rulesState,
        closestBlocker,
        this.ball,
        this.players,
        isOutstretchedArmBlock,
      );
      if (handball) {
        this.handleFoulDetected(handball, closestBlocker);
        return;
      }

      // Opponent defender blocking clears any active offside pass snapshot
      evaluateOffsideOnTouch(this.rulesState, closestBlocker);

      const bx = this.ball.position.x - closestBlocker.position.x;
      const bz = this.ball.position.z - closestBlocker.position.z;
      const len = Math.hypot(bx, bz) || 1;
      this.ball.velocity.x = (bx / len) * 6.2 + closestBlocker.velocity.x * 0.3;
      this.ball.velocity.z = (bz / len) * 6.2 + closestBlocker.velocity.z * 0.3;
      this.ball.velocity.y = 2.1;
      this.ball.pickupLockTimer = 0.16;
      recordBallTouch(this.ball, closestBlocker, 'live');
      closestBlocker.kickCooldown = 0.2;
      this.emitSound({ type: 'kick', power: 0.72 });
      return;
    }

    const winner =
      closestReceiver && closestInterceptor
        ? bestReceiverDist <= bestInterceptDist
          ? closestReceiver
          : closestInterceptor
        : closestReceiver ?? closestInterceptor;

    if (!winner) return;

    // Check active offside BEFORE allowing the player to receive/continue the attack!
    const offsideRecord = evaluateOffsideOnTouch(this.rulesState, winner);
    if (offsideRecord) {
      this.handleOffsideDetected(offsideRecord);
      return;
    }

    const inputDir =
      winner.isControlled && winner.team === 'home'
        ? this.lastHomeInputDir
        : winner.isControlled && winner.team === 'away'
          ? this.lastAwayInputDir
          : { x: 0, z: 0 };

    const reception = evaluateBallReception(winner, this.ball, inputDir.x, inputDir.z);
    if (reception.outcome === 'heavy_touch') {
      // Difficult fast reception knocks the ball realistically into space instead of magnetic glue
      this.ball.position.x = winner.position.x + reception.touchDirX * reception.touchOffsetMeters;
      this.ball.position.z = winner.position.z + reception.touchDirZ * reception.touchOffsetMeters;
      this.ball.position.y = BALL_RADIUS + 0.08;
      this.ball.velocity.x = reception.touchDirX * reception.deflectSpeed;
      this.ball.velocity.z = reception.touchDirZ * reception.deflectSpeed;
      this.ball.velocity.y = 1.4;
      this.ball.pickupLockTimer = 0.14;
      recordBallTouch(this.ball, winner, 'live');
      this.emitSound({ type: 'kick', power: 0.55 });
      return;
    }

    this.claimBall(winner);
    // Apply realistic first-touch cushion adapted to movement direction & reception difficulty
    this.ball.position.x = winner.position.x + reception.touchDirX * reception.touchOffsetMeters;
    this.ball.position.z = winner.position.z + reception.touchDirZ * reception.touchOffsetMeters;
    this.ball.position.y = BALL_RADIUS;
    if (Math.hypot(reception.touchDirX, reception.touchDirZ) > 0.1) {
      const touchAngle = Math.atan2(reception.touchDirX, reception.touchDirZ);
      winner.facingAngle = lerpAngle(winner.facingAngle, touchAngle, 0.45);
    }
  }

  private claimBall(player: PlayerState): void {
    if (this.lastPossessionTeam !== null && this.lastPossessionTeam !== player.team) {
      // Possession turnover -> trigger collective attack/defend transition reactions
      this.transitionTimer = 1.65;
    }
    this.lastPossessionTeam = player.team;

    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      p.hasBall = p.id === player.id;
    }
    this.ball.ownerId = player.id;
    recordBallTouch(this.ball, player, 'live');

    if (player.team === 'home' && player.role !== 'GK' && !player.isControlled) {
      this.shotCharge = 0;
      for (let i = 0; i < this.players.length; i++) {
        const p = this.players[i];
        if (p.team === 'home') p.isControlled = p.id === player.id;
      }
    } else if (
      player.team === 'away' &&
      this.awayHumanControl &&
      player.role !== 'GK' &&
      !player.isControlled
    ) {
      this.awayShotCharge = 0;
      for (let i = 0; i < this.players.length; i++) {
        const p = this.players[i];
        if (p.team === 'away') p.isControlled = p.id === player.id;
      }
    }
  }

  private handleGoalScored(scoringTeam: TeamSide): void {
    if (scoringTeam === 'home') {
      this.stats.homeScore += 1;
    } else {
      this.stats.awayScore += 1;
    }

    const scorerName =
      this.ball.lastTouchTeam === scoringTeam && this.ball.lastTouchPlayerName
        ? this.ball.lastTouchPlayerName
        : scoringTeam === 'home'
          ? this.homeTeam.roster[9].name
          : this.awayTeam.roster[9].name;

    this.stats.lastScorerName = scorerName;
    this.stats.lastScorerTeam = scoringTeam;
    this.stats.lastGoalMinute = Math.max(1, this.matchMinutes);

    this.goalBanner = {
      scorerName,
      teamName: scoringTeam === 'home' ? this.homeTeam.name : this.awayTeam.name,
      minute: Math.max(1, this.matchMinutes),
    };

    for (const p of this.players) {
      if (p.team === scoringTeam && p.role !== 'GK') {
        const distToBall = Math.hypot(
          p.position.x - this.ball.position.x,
          p.position.z - this.ball.position.z,
        );
        if (p.name === scorerName || distToBall < 22) {
          p.actionState = 'celebrate';
          p.actionTimer = GOAL_IMPACT_DURATION + 0.5;
          p.velocity.x = 0;
          p.velocity.z = 0;
        }
      }
    }

    if (!this.awayHumanControl) {
      this.replayRecorder.freezeClip();
    }
    this.phase = 'goal';
    this.isReplaying = false;
    this.goalTotalElapsed = 0;
    this.kickoffTeam = scoringTeam === 'home' ? 'away' : 'home';
    this.goalCelebrationTimer = this.awayHumanControl
      ? 2.2
      : GOAL_IMPACT_DURATION + GOAL_REPLAY_DURATION;
    this.hitstopTimer = 0.06;
    this.shotCharge = 0;
    this.awayShotCharge = 0;
    this.setPiece = null;
    this.callbacks.onCameraTrauma(0.55);
    this.emitSound({ type: 'net' });
    this.emitSound({ type: 'whistle', pattern: 'short' });
    this.emitSound({ type: 'goal' });
    this.emitHudSnapshot();
  }

  public emitHudSnapshot(): void {
    const controlled = this.getControlledPlayer(this.localSide) ?? this.players[9];
    const localCharge = this.getShotCharge(this.localSide);
    const radarPlayers = this.players
      .filter((p) => !p.isSentOff)
      .map((p) => ({
        x: p.position.x / HALF_LENGTH,
        z: p.position.z / 34,
        team: p.team,
        isControlled: p.team === this.localSide && p.isControlled,
      }));

    let setPieceBanner: MatchHudSnapshot['setPieceBanner'] = null;
    if (this.phase === 'setpiece' && this.setPiece) {
      const sp = this.setPiece;
      const teamName = sp.team === 'home' ? this.homeTeam.shortName : this.awayTeam.shortName;
      let hint = 'Défense sur coup de pied arrêté';
      if (sp.team === this.localSide) {
        hint =
          sp.type === 'penalty'
            ? 'Visez un angle + Maintenez/Relâchez TIR'
            : sp.type === 'indirect_free_kick'
              ? 'Coup franc indirect · Visez + PASSE'
              : 'Visez + PASSE / LOB / TIR';
      } else if (sp.type === 'penalty') {
        hint = 'Déplacez le gardien + TACLE / TIR pour plonger';
      }

      let detail: string | undefined;
      if (sp.reason === 'offside' && sp.offside) {
        detail = `Hors-jeu : ${sp.offside.offsidePlayerName}`;
      } else if (sp.reason === 'foul' && sp.foul) {
        const foulTeamShort =
          sp.foul.foulingTeamId === 'home' ? this.homeTeam.shortName : this.awayTeam.shortName;
        detail = `Faute : ${sp.foul.foulingPlayerName} (${foulTeamShort}) · ${formatFoulTypeLabel(sp.foul.foulType)}`;
      }

      setPieceBanner = {
        type: sp.type,
        team: sp.team,
        teamName,
        hint,
        detail,
        card: sp.foul?.card,
        kickKind: sp.kickKind,
        reason: sp.reason,
      };
    }

    this.callbacks.onHudUpdate({
      shellState: this.shellState,
      phase: this.phase,
      half: this.half,
      matchMinutes: this.matchMinutes,
      matchSeconds: this.matchSeconds,
      homeScore: this.stats.homeScore,
      awayScore: this.stats.awayScore,
      homeShort: this.homeTeam.shortName,
      awayShort: this.awayTeam.shortName,
      homeColor: this.homeTeam.kit.primary,
      awayColor: this.awayTeam.kit.primary,
      homeFormation: this.localSide === 'away' ? this.awayFormation : this.homeFormation,
      homeMentality: this.localSide === 'away' ? this.awayMentality : this.homeMentality,
      controlledPlayerName: controlled?.name ?? 'Player',
      controlledPlayerNumber: controlled?.number ?? 9,
      controlledPlayerRole: controlled?.role ?? 'ST',
      controlledStamina: Math.round(controlled?.stamina ?? 100),
      controlledHasBall: controlled?.hasBall ?? false,
      controlledShotCharge:
        controlled?.hasBall || (this.phase === 'setpiece' && this.setPiece?.team === this.localSide)
          ? localCharge
          : 0,
      controlMode: this.controlModeState.mode,
      cameraMode: this.cameraMode,
      isReplaying: this.isReplaying,
      setPieceBanner,
      goalBanner: this.goalBanner,
      stats: { ...this.stats },
      radarBall: {
        x: this.ball.position.x / HALF_LENGTH,
        z: this.ball.position.z / 34,
      },
      radarPlayers,
    });
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff < -Math.PI) diff += Math.PI * 2;
  while (diff > Math.PI) diff -= Math.PI * 2;
  return a + diff * t;
}

void PLAYER_RADIUS;
