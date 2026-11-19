import {
  computeAiSteering,
  computeDefensiveAssignments,
  computeSetPieceAiDecision,
  executeAiBallAction,
} from '../ai/basicAi';
import { computeCrowdIntensity } from '../audio/crowdLogic';
import { soundEngine } from '../audio/soundEngine';
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
  BallState,
  CameraMode,
  FormationId,
  GameShellState,
  InputSnapshot,
  MatchHudSnapshot,
  MatchPhase,
  MatchStats,
  PlayerState,
  SetPieceInfo,
  SetPieceType,
  TacticalMentality,
  TeamConfig,
  TeamSide,
  Vec3,
} from '../core/types';
import { ReplayRecorder } from './replayRecorder';
import {
  classifyTackleFoul,
  computeLeadPassVector,
  computeMatchClock,
  computeSetPieceSetup,
  createTeamPlayers,
  findBestPassTarget,
  getRestartPositionForOutOfBounds,
  resetForKickoff,
  selectSwitchTarget,
} from './rules';
import {
  applyBallKick,
  attemptGoalkeeperSave,
  clampPlayerToArena,
  computeShotProfile,
  resolvePlayerCollisions,
  stepBallPhysics,
} from '../physics/pitchPhysics';

export interface MatchEngineCallbacks {
  onHudUpdate: (snapshot: MatchHudSnapshot) => void;
  onCameraTrauma: (amount: number) => void;
  onMatchFinished: (stats: MatchStats) => void;
}

const GOAL_IMPACT_DURATION = 0.85;
const GOAL_REPLAY_DURATION = 3.25;

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

  public stats: MatchStats;
  public goalBanner: MatchHudSnapshot['goalBanner'] = null;
  public setPiece: SetPieceInfo | null = null;
  public isReplaying = false;

  private hitstopTimer = 0;
  private goalCelebrationTimer = 0;
  private goalTotalElapsed = 0;
  private halftimeTimer = 0;
  private kickoffTeam: TeamSide = 'home';
  private hudEmitAccumulator = 0;
  private shotCharge = 0;
  private callbacks: MatchEngineCallbacks;
  private replayRecorder = new ReplayRecorder();
  private replayBallProxy: BallState;
  private replayPlayerProxies: PlayerState[] = [];

  public getShotCharge(): number {
    return this.shotCharge;
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

  private createEmptyBall(): BallState {
    return {
      position: { x: 0, y: BALL_RADIUS, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      spin: { x: 0, y: 0, z: 0 },
      ownerId: null,
      lastTouchTeam: null,
      lastTouchPlayerName: null,
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
      homePossessionSeconds: 0,
      awayPossessionSeconds: 0,
      lastScorerName: null,
      lastScorerTeam: null,
      lastGoalMinute: null,
    };
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
    this.setPiece = null;
    this.isReplaying = false;
    this.replayRecorder.clear();
    resetForKickoff(
      this.players,
      this.ball,
      this.homeFormation,
      this.awayFormation,
      this.kickoffTeam,
    );
  }

  public startNewMatch(
    homeTeam: TeamConfig,
    awayTeam: TeamConfig,
    homeFormation: FormationId,
    awayFormation: FormationId,
    halfDurationSeconds: number,
    homeMentality: TacticalMentality = this.homeMentality,
    awayMentality: TacticalMentality = this.awayMentality,
  ): void {
    this.homeTeam = homeTeam;
    this.awayTeam = awayTeam;
    this.homeFormation = homeFormation;
    this.awayFormation = awayFormation;
    this.homeMentality = homeMentality;
    this.awayMentality = awayMentality;
    this.halfDurationSeconds = halfDurationSeconds;

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
    this.stats = this.createEmptyStats();
    this.rebuildTeams();
    soundEngine.playWhistle('short');
    this.emitHudSnapshot();
  }

  public skipReplay(): void {
    if (this.phase !== 'goal') return;
    this.finishGoalCelebration();
  }

  private finishGoalCelebration(): void {
    this.goalBanner = null;
    this.isReplaying = false;
    this.phase = 'live';
    this.shotCharge = 0;
    this.replayRecorder.clear();
    resetForKickoff(
      this.players,
      this.ball,
      this.homeFormation,
      this.awayFormation,
      this.kickoffTeam,
    );
    soundEngine.playWhistle('short');
    this.emitHudSnapshot();
  }

  public getControlledPlayer(): PlayerState | null {
    return this.players.find((p) => p.isControlled) ?? null;
  }

  /**
   * Returns live state or interpolated slow-motion replay proxies for 3D scene rendering.
   */
  public getVisualState(): { ball: BallState; players: PlayerState[] } {
    if (!this.isReplaying || this.replayRecorder.getClipLength() === 0) {
      return { ball: this.ball, players: this.players };
    }

    const replayProgress = Math.max(
      0,
      Math.min(1, (this.goalTotalElapsed - GOAL_IMPACT_DURATION) / GOAL_REPLAY_DURATION),
    );
    // Focus on the final 70% of the recorded buffer for dramatic slow-motion goal buildup & finish
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

  public step(rawDt: number, input: InputSnapshot): void {
    if (this.shellState !== 'playing') {
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
        this.setPiece = null;
        this.replayRecorder.clear();
        resetForKickoff(
          this.players,
          this.ball,
          this.homeFormation,
          this.awayFormation,
          'away',
        );
        soundEngine.playWhistle('short');
        this.emitHudSnapshot();
      }
      return;
    }

    if (this.phase === 'fulltime') {
      return;
    }

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
      this.setPiece = null;
      soundEngine.playWhistle('double');
      this.emitHudSnapshot();
      return;
    }

    if (clock.phaseTransition === 'fulltime') {
      this.phase = 'fulltime';
      this.shellState = 'gameover';
      this.shotCharge = 0;
      this.setPiece = null;
      soundEngine.playWhistle('long');
      this.callbacks.onMatchFinished({ ...this.stats });
      this.emitHudSnapshot();
      return;
    }

    if (this.phase === 'setpiece' && this.setPiece) {
      this.stepSetPiecePhase(dt, input);
      return;
    }

    if (input.switchPressed) {
      const current = this.getControlledPlayer();
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

    const homeAssign = computeDefensiveAssignments(this.players, this.ball, 'home');
    const awayAssign = computeDefensiveAssignments(this.players, this.ball, 'away');

    for (const p of this.players) {
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

      if (p.isControlled) {
        this.stepControlledPlayer(p, input, dt);
      } else {
        const formation = p.team === 'home' ? this.homeFormation : this.awayFormation;
        const mentality = p.team === 'home' ? this.homeMentality : this.awayMentality;
        const assign = p.team === 'home' ? homeAssign : awayAssign;
        const steering = computeAiSteering(
          p,
          this.players,
          this.ball,
          formation,
          assign.presserId,
          assign.coverId,
          mentality,
        );
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
      } else {
        if (owner.team === 'home') this.stats.homePossessionSeconds += dt;
        else this.stats.awayPossessionSeconds += dt;

        const dirX = Math.sin(owner.facingAngle);
        const dirZ = Math.cos(owner.facingAngle);
        const isSprinting = owner.actionState === 'sprint';
        const leadDist = DRIBBLE_OFFSET_DIST * (isSprinting ? 1.28 : 0.94);
        const desiredBallX = owner.position.x + dirX * leadDist;
        const desiredBallZ = owner.position.z + dirZ * leadDist;
        const followRate = Math.min(1, (16 + owner.attributes.dribbling * 0.14) * dt);

        this.ball.position.x += (desiredBallX - this.ball.position.x) * followRate;
        this.ball.position.z += (desiredBallZ - this.ball.position.z) * followRate;
        this.ball.position.y = BALL_RADIUS;
        this.ball.velocity.x = owner.velocity.x;
        this.ball.velocity.y = 0;
        this.ball.velocity.z = owner.velocity.z;
        this.ball.spin.x = -owner.velocity.z * 0.9;
        this.ball.spin.y = 0;
        this.ball.spin.z = owner.velocity.x * 0.9;
      }
    } else {
      this.shotCharge = 0;
      const ballResult = stepBallPhysics(this.ball, dt);
      if (ballResult.hitPost) {
        soundEngine.playPostHit();
        soundEngine.playCrowdReaction('ooh');
        this.callbacks.onCameraTrauma(0.45);
      }

      if (ballResult.scoredTeam !== null) {
        this.replayRecorder.record(this.ball, this.players, 0.04);
        this.handleGoalScored(ballResult.scoredTeam);
        return;
      }

      if (ballResult.outOfBounds !== null) {
        this.handleOutOfBounds(ballResult.outOfBounds);
        return;
      }

      this.tryPickupLooseBall();
    }

    this.replayRecorder.record(this.ball, this.players, dt);

    this.hudEmitAccumulator += dt;
    const hudInterval = this.shotCharge > 0 ? 0.04 : 0.1;
    if (this.hudEmitAccumulator >= hudInterval) {
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

  private stepSetPiecePhase(dt: number, input: InputSnapshot): void {
    const sp = this.setPiece;
    if (!sp) {
      this.phase = 'live';
      return;
    }

    const taker = sp.takerId ? this.players.find((p) => p.id === sp.takerId) ?? null : null;

    if (sp.team === 'home' && taker) {
      // User controls the set-piece taker: rotate aim with directional input, charge or pass/lob/shoot
      const moveMag = Math.hypot(input.moveX, input.moveZ);
      if (moveMag > 0.12) {
        const targetAngle = Math.atan2(input.moveX, input.moveZ);
        taker.facingAngle = lerpAngle(taker.facingAngle, targetAngle, Math.min(1, 10 * dt));
      }

      if (input.shootHeld && !input.shootPressed) {
        this.shotCharge = Math.min(1, this.shotCharge + 1.45 * dt);
      }

      if (input.shootReleased || input.shootPressed || input.passPressed || input.lobPressed) {
        const charge = this.shotCharge > 0.03 ? this.shotCharge : 0.55;
        this.shotCharge = 0;

        if (sp.type === 'penalty') {
          const aimZ = Math.abs(input.moveZ) > 0.1 ? input.moveZ * (GOAL_HALF_WIDTH * 0.88) : 0;
          const profile = computeShotProfile(taker.attributes.shotPower, charge, false);
          applyBallKick(
            this.ball,
            HALF_LENGTH - sp.spot.x,
            aimZ - sp.spot.z,
            profile.horizontalSpeed * 1.05,
            2.4 + charge * 2.2,
            taker,
            Math.sign(aimZ) * 1.1,
          );
          this.stats.homeShots += 1;
          soundEngine.playKick(1.2);
        } else if ((sp.type === 'free_kick' || sp.type === 'corner') && (input.shootReleased || input.shootPressed)) {
          if (sp.type === 'corner') {
            const boxX = HALF_LENGTH - 9.5;
            const aimZ = Math.abs(input.moveZ) > 0.1 ? input.moveZ * 5 : 0;
            applyBallKick(
              this.ball,
              boxX - sp.spot.x,
              aimZ - sp.spot.z,
              18 + charge * 4,
              6.8 + charge * 1.6,
              taker,
              Math.sign(sp.spot.z || 1) * 1.6,
            );
            this.stats.homePasses += 1;
          } else {
            const aimZ = Math.abs(input.moveZ) > 0.1 ? input.moveZ * 3.4 : 0;
            const profile = computeShotProfile(taker.attributes.shotPower, charge, false);
            applyBallKick(
              this.ball,
              HALF_LENGTH - sp.spot.x,
              aimZ - sp.spot.z,
              profile.horizontalSpeed,
              4.4 + charge * 2.5,
              taker,
              Math.sign(input.moveZ || 1) * 1.8,
            );
            this.stats.homeShots += 1;
          }
          soundEngine.playKick(1.15);
        } else {
          const isLob = input.lobPressed || sp.type === 'corner' || sp.type === 'goal_kick';
          const aimX = moveMag > 0.12 ? input.moveX : Math.sin(taker.facingAngle);
          const aimZ = moveMag > 0.12 ? input.moveZ : Math.cos(taker.facingAngle);
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
          this.stats.homePasses += 1;
          soundEngine.playKick(0.95);
        }

        this.phase = 'live';
        this.setPiece = null;
        this.emitHudSnapshot();
        return;
      }
    } else {
      // Away takes set piece after short tactical pause; allow user GK movement/dive on penalty!
      if (sp.type === 'penalty') {
        const homeGk = this.players.find((p) => p.team === 'home' && p.role === 'GK');
        if (homeGk) {
          if (homeGk.diveCooldown > 0) homeGk.diveCooldown = Math.max(0, homeGk.diveCooldown - dt);
          if (homeGk.actionTimer > 0) {
            homeGk.actionTimer = Math.max(0, homeGk.actionTimer - dt);
            if (homeGk.actionTimer === 0 && homeGk.actionState === 'dive') {
              homeGk.actionState = 'idle';
              homeGk.diveDir = 0;
            }
          }
          if ((input.tacklePressed || input.shootPressed) && homeGk.diveCooldown <= 0) {
            const diveSign: -1 | 1 = input.moveZ >= 0 ? 1 : -1;
            homeGk.actionState = 'dive';
            homeGk.actionTimer = 0.55;
            homeGk.diveCooldown = 1.1;
            homeGk.diveDir = diveSign;
            homeGk.velocity.z = diveSign * 7.8;
          } else if (homeGk.actionState !== 'dive') {
            homeGk.position.z = Math.max(
              -GOAL_HALF_WIDTH + 0.4,
              Math.min(GOAL_HALF_WIDTH - 0.4, homeGk.position.z + input.moveZ * 4.5 * dt),
            );
          } else {
            homeGk.position.z += homeGk.velocity.z * dt;
            homeGk.velocity.z *= Math.pow(0.92, dt * 60);
          }
        }
      }

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
        if (decision.isShot) this.stats.awayShots += 1;
        else this.stats.awayPasses += 1;
        soundEngine.playKick(decision.isShot ? 1.15 : 0.9);
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
      soundEngine.playTackle();
      this.attemptTackleSteal(p);
      if (this.phase === 'setpiece') return;
    }

    if (p.actionState !== 'tackle') {
      const dribbleRetention = p.hasBall
        ? 0.9 + (p.attributes.dribbling / 100) * 0.06
        : 1.0;
      const topSpeed = p.attributes.speed * (wantsSprint ? 1.32 : 1.0) * dribbleRetention;
      const targetVx = input.moveX * topSpeed;
      const targetVz = input.moveZ * topSpeed;
      const accel = p.attributes.acceleration;

      p.velocity.x += (targetVx - p.velocity.x) * Math.min(1, accel * dt);
      p.velocity.z += (targetVz - p.velocity.z) * Math.min(1, accel * dt);

      if (moveMag > 0.1) {
        const targetAngle = Math.atan2(input.moveX, input.moveZ);
        const turnRate = p.hasBall ? 10 + (p.attributes.dribbling / 100) * 6 : 14;
        p.facingAngle = lerpAngle(p.facingAngle, targetAngle, Math.min(1, turnRate * dt));
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
        this.shotCharge = Math.min(1, this.shotCharge + 1.55 * dt);
      }

      if (input.shootReleased || input.shootPressed) {
        const charge = this.shotCharge > 0.03 ? this.shotCharge : 0.35;
        this.shotCharge = 0;

        const goalDirX = HALF_LENGTH - p.position.x;
        const aimZ = Math.abs(input.moveZ) > 0.12 ? input.moveZ * 3.4 : 0;
        const goalDirZ = aimZ - p.position.z;
        const profile = computeShotProfile(p.attributes.shotPower, charge, wantsSprint);
        const sideSpin = Math.abs(input.moveZ) > 0.15 ? Math.sign(input.moveZ) * 1.25 : 0;

        applyBallKick(
          this.ball,
          goalDirX,
          goalDirZ,
          profile.horizontalSpeed,
          profile.loftSpeed,
          p,
          sideSpin,
        );
        this.stats.homeShots += 1;
        this.hitstopTimer = 0.035;
        this.callbacks.onCameraTrauma(0.18 + charge * 0.2);
        soundEngine.playKick(1.05 + charge * 0.35);
        this.emitHudSnapshot();
        return;
      }

      if (input.passPressed || input.lobPressed) {
        this.shotCharge = 0;
        const isLob = input.lobPressed;
        const target = findBestPassTarget(p, this.players, input.moveX, input.moveZ);
        let dirX = moveMag > 0.15 ? input.moveX : Math.sin(p.facingAngle);
        let dirZ = moveMag > 0.15 ? input.moveZ : Math.cos(p.facingAngle);
        let passSpeed = isLob ? 21 : 16;
        let loft = isLob ? 7.2 : 0.55;

        if (target) {
          const lead = computeLeadPassVector(p, target, isLob);
          const dist = Math.hypot(lead.dirX, lead.dirZ);
          const inaccuracy = ((100 - p.attributes.passing) / 100) * 0.055;
          dirX = lead.dirX + (Math.random() - 0.5) * inaccuracy * dist;
          dirZ = lead.dirZ + (Math.random() - 0.5) * inaccuracy * dist;
          passSpeed = lead.speed;
          loft = lead.loft;
        }

        applyBallKick(this.ball, dirX, dirZ, passSpeed, loft, p);
        this.stats.homePasses += 1;
        soundEngine.playKick(isLob ? 1.0 : 0.72);

        if (target && target.role !== 'GK') {
          p.isControlled = false;
          target.isControlled = true;
        }
      }
    } else {
      this.shotCharge = 0;
    }
  }

  private stepAiPlayer(
    p: PlayerState,
    steering: ReturnType<typeof computeAiSteering>,
    dt: number,
  ): void {
    if (
      p.role === 'GK' &&
      steering.shouldDive &&
      p.diveCooldown <= 0 &&
      p.actionState !== 'dive'
    ) {
      p.actionState = 'dive';
      p.actionTimer = 0.48;
      p.diveCooldown = 1.15;
      p.diveDir = steering.diveDir;
      p.facingAngle = p.team === 'home' ? Math.PI / 2 : -Math.PI / 2;
      p.velocity.x *= 0.25;
      p.velocity.z = steering.diveDir * 7.6;
    }

    if (
      steering.shouldTackle &&
      !p.hasBall &&
      p.tackleCooldown <= 0 &&
      p.actionState !== 'tackle' &&
      p.actionState !== 'dive'
    ) {
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
        p.velocity.x += (nx * desiredSpeed - p.velocity.x) * Math.min(1, 9 * dt);
        p.velocity.z += (nz * desiredSpeed - p.velocity.z) * Math.min(1, 9 * dt);
        const targetAngle = Math.atan2(nx, nz);
        p.facingAngle = lerpAngle(p.facingAngle, targetAngle, Math.min(1, 10 * dt));
        if (p.actionTimer <= 0) {
          p.actionState = p.hasBall ? 'dribble' : steering.sprint ? 'sprint' : 'run';
        }
      } else {
        p.velocity.x *= Math.pow(0.8, dt * 60);
        p.velocity.z *= Math.pow(0.8, dt * 60);
        if (p.actionTimer <= 0) p.actionState = 'idle';
        const bdx = this.ball.position.x - p.position.x;
        const bdz = this.ball.position.z - p.position.z;
        if (Math.hypot(bdx, bdz) > 0.5) {
          p.facingAngle = lerpAngle(p.facingAngle, Math.atan2(bdx, bdz), Math.min(1, 8 * dt));
        }
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
        soundEngine.playKick(kind === 'kick' ? 1.15 : 0.72);
      });
    }
  }

  private attemptTackleSteal(tackler: PlayerState): void {
    if (this.ball.ownerId === null) {
      const d = Math.hypot(
        this.ball.position.x - tackler.position.x,
        this.ball.position.z - tackler.position.z,
      );
      if (d < TACKLE_REACH) {
        this.claimBall(tackler);
      }
      return;
    }

    const owner = this.players.find((p) => p.id === this.ball.ownerId);
    if (!owner || owner.team === tackler.team) return;

    const outcome = classifyTackleFoul(tackler, owner, this.ball);
    if (outcome === 'free_kick' || outcome === 'penalty') {
      if (tackler.team === 'home') this.stats.homeFouls += 1;
      else this.stats.awayFouls += 1;
      tackler.tackleCooldown = 1.6;
      this.triggerSetPiece(outcome, owner.team, { ...owner.position });
      return;
    }

    if (outcome === 'clean') {
      owner.hasBall = false;
      owner.kickCooldown = 0.5;
      this.claimBall(tackler);
      soundEngine.playKick(0.8);
    }
  }

  private triggerSetPiece(type: SetPieceType, restartTeam: TeamSide, spot: Vec3): void {
    const setup = computeSetPieceSetup(type, spot, restartTeam, this.players, this.ball);
    this.shotCharge = 0;
    this.phase = 'setpiece';
    this.setPiece = {
      type,
      team: restartTeam,
      spot: setup.spot,
      takerId: setup.takerId,
      timer: type === 'penalty' ? 1.45 : 1.15,
    };
    soundEngine.playWhistle(type === 'penalty' || type === 'free_kick' ? 'double' : 'short');
    if (type === 'penalty' || type === 'free_kick') {
      soundEngine.playCrowdReaction('boo');
    } else if (type === 'corner') {
      soundEngine.playCrowdReaction('applause');
    }
    this.emitHudSnapshot();
  }

  private tryPickupLooseBall(): void {
    if (this.ball.pickupLockTimer > 0) return;

    for (const p of this.players) {
      if (p.role !== 'GK') continue;
      const incomingSpeed = Math.hypot(this.ball.velocity.x, this.ball.velocity.z);
      const wasOpponentShot = this.ball.lastTouchTeam !== null && this.ball.lastTouchTeam !== p.team;
      const saveResult = attemptGoalkeeperSave(p, this.ball);
      if (saveResult === 'parry') {
        if (p.team === 'home') this.stats.homeSaves += 1;
        else this.stats.awaySaves += 1;
        this.callbacks.onCameraTrauma(0.25);
        soundEngine.playKick(1.1);
        soundEngine.playCrowdReaction('ooh');
        this.emitHudSnapshot();
        return;
      }
      if (saveResult === 'catch') {
        if (wasOpponentShot && incomingSpeed > 9.5) {
          if (p.team === 'home') this.stats.homeSaves += 1;
          else this.stats.awaySaves += 1;
          soundEngine.playCrowdReaction('applause');
        }
        p.gkHoldTimer = 0.55;
        this.claimBall(p);
        soundEngine.playKick(0.55);
        this.emitHudSnapshot();
        return;
      }
    }

    if (this.ball.position.y > 1.7) return;

    let closest: PlayerState | null = null;
    let bestDist = DRIBBLE_CONTROL_RADIUS;

    for (const p of this.players) {
      if (p.role === 'GK' || p.kickCooldown > 0) continue;
      const d = Math.hypot(
        this.ball.position.x - p.position.x,
        this.ball.position.z - p.position.z,
      );
      if (d < bestDist) {
        bestDist = d;
        closest = p;
      }
    }

    if (closest) {
      this.claimBall(closest);
    }
  }

  private claimBall(player: PlayerState): void {
    for (const p of this.players) {
      p.hasBall = p.id === player.id;
    }
    this.ball.ownerId = player.id;
    this.ball.lastTouchTeam = player.team;
    this.ball.lastTouchPlayerName = player.name;

    if (player.team === 'home' && player.role !== 'GK' && !player.isControlled) {
      this.shotCharge = 0;
      for (const p of this.players) {
        if (p.team === 'home') p.isControlled = p.id === player.id;
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

    // Trigger goal celebration animation on the scorer & nearby teammates
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

    this.replayRecorder.freezeClip();
    this.phase = 'goal';
    this.isReplaying = false;
    this.goalTotalElapsed = 0;
    this.kickoffTeam = scoringTeam === 'home' ? 'away' : 'home';
    this.goalCelebrationTimer = GOAL_IMPACT_DURATION + GOAL_REPLAY_DURATION;
    this.hitstopTimer = 0.06;
    this.shotCharge = 0;
    this.setPiece = null;
    this.callbacks.onCameraTrauma(0.55);
    soundEngine.playNetSwish();
    soundEngine.playWhistle('short');
    soundEngine.playGoalCheer();
    this.emitHudSnapshot();
  }

  private handleOutOfBounds(outType: 'sideline' | 'endline_home' | 'endline_away'): void {
    const restart = getRestartPositionForOutOfBounds(
      outType,
      this.ball.position.x,
      this.ball.position.z,
      this.ball.lastTouchTeam,
    );

    if (restart.type === 'corner') {
      if (restart.restartTeam === 'home') this.stats.homeCorners += 1;
      else this.stats.awayCorners += 1;
    }

    this.triggerSetPiece(restart.type, restart.restartTeam, {
      x: restart.x,
      y: BALL_RADIUS,
      z: restart.z,
    });
  }

  public emitHudSnapshot(): void {
    const controlled = this.getControlledPlayer() ?? this.players[9];
    const radarPlayers = this.players.map((p) => ({
      x: p.position.x / HALF_LENGTH,
      z: p.position.z / 34,
      team: p.team,
      isControlled: p.isControlled,
    }));

    let setPieceBanner: MatchHudSnapshot['setPieceBanner'] = null;
    if (this.phase === 'setpiece' && this.setPiece) {
      const sp = this.setPiece;
      const teamName = sp.team === 'home' ? this.homeTeam.shortName : this.awayTeam.shortName;
      let hint = 'Defending Set Piece';
      if (sp.team === 'home') {
        hint =
          sp.type === 'penalty'
            ? 'Aim corner + Hold/Release SHOOT'
            : 'Aim + PASS / LOB / SHOOT';
      } else if (sp.type === 'penalty') {
        hint = 'Aim GK + TACKLE / SHOOT to Dive';
      }
      setPieceBanner = {
        type: sp.type,
        team: sp.team,
        teamName,
        hint,
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
      homeFormation: this.homeFormation,
      homeMentality: this.homeMentality,
      controlledPlayerName: controlled?.name ?? 'Player',
      controlledPlayerNumber: controlled?.number ?? 9,
      controlledPlayerRole: controlled?.role ?? 'ST',
      controlledStamina: Math.round(controlled?.stamina ?? 100),
      controlledHasBall: controlled?.hasBall ?? false,
      controlledShotCharge: controlled?.hasBall || (this.phase === 'setpiece' && this.setPiece?.team === 'home') ? this.shotCharge : 0,
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
