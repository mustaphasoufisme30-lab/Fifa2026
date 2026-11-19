export type TeamSide = 'home' | 'away';

export type PlayerRole =
  | 'GK'
  | 'CB'
  | 'LB'
  | 'RB'
  | 'CDM'
  | 'CM'
  | 'CAM'
  | 'LW'
  | 'RW'
  | 'ST';

export type FormationId = '4-3-3' | '4-4-2' | '4-2-3-1' | '3-5-2';

export type TacticalMentality = 'defensive' | 'balanced' | 'attacking';

export type QualityLevel = 'low' | 'medium' | 'high';

export type CameraMode = 'tv' | 'close' | 'player' | 'replay';

export type GameShellState = 'title' | 'playing' | 'paused' | 'gameover';

export type MatchPhase =
  | 'kickoff'
  | 'live'
  | 'goal'
  | 'halftime'
  | 'fulltime'
  | 'setpiece';

export type SetPieceType =
  | 'throw_in'
  | 'goal_kick'
  | 'corner'
  | 'free_kick'
  | 'penalty';

export type PlayerActionState =
  | 'idle'
  | 'run'
  | 'sprint'
  | 'dribble'
  | 'kick'
  | 'tackle'
  | 'dive';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type HairStyleId = 'short' | 'fade' | 'curly' | 'buzz' | 'mohawk' | 'long';

export type FacePresetId = 'classic' | 'sculpted' | 'athletic' | 'beard';

export type JerseyPatternId = 'stripe' | 'solid' | 'hoops' | 'sash';

export interface CustomPlayerAppearance {
  skinTone: string;
  facePreset?: FacePresetId;
  hairStyle: HairStyleId;
  hairColor: string;
  bootsColor: string;
  jerseyPattern?: JerseyPatternId;
  jerseyColorOverride?: string | null;
  referenceImageDataUrl?: string | null;
}

export interface CustomPlayerRatings {
  pace: number; // 60 - 96
  shooting: number; // 60 - 96
  passing: number; // 60 - 96
  dribbling: number; // 60 - 96
  stamina: number; // 65 - 99
}

export interface CustomPlayerProfile {
  enabled: boolean;
  slotIndex: number; // 1..10 outfield slot on Home squad (default 9 = ST)
  name: string;
  number: number; // 1..99
  appearance: CustomPlayerAppearance;
  ratings: CustomPlayerRatings;
}

export interface PlayerAttributes {
  speed: number; // m/s base max speed (e.g., 6.6 - 8.2)
  acceleration: number; // m/s^2
  staminaMax: number; // 0-100
  shotPower: number; // m/s impulse scalar (20 - 31)
  passing: number; // 0-100 accuracy
  dribbling: number; // 0-100 ball control
}

export interface PlayerProfile {
  id: string;
  name: string;
  number: number;
  role: PlayerRole;
  attributes: PlayerAttributes;
  appearance: CustomPlayerAppearance;
}

export interface PlayerState {
  id: string;
  name: string;
  number: number;
  team: TeamSide;
  role: PlayerRole;
  slotIndex: number;
  position: Vec3;
  velocity: Vec3;
  facingAngle: number;
  homeAnchor: Vec3;
  attributes: PlayerAttributes;
  appearance: CustomPlayerAppearance;
  stamina: number;
  actionState: PlayerActionState;
  actionTimer: number;
  tackleCooldown: number;
  kickCooldown: number;
  diveCooldown: number;
  diveDir: -1 | 0 | 1;
  gkHoldTimer: number;
  hasBall: boolean;
  isControlled: boolean;
  animPhase: number;
}

export interface BallState {
  position: Vec3;
  velocity: Vec3;
  spin: Vec3;
  ownerId: string | null;
  lastTouchTeam: TeamSide | null;
  lastTouchPlayerName: string | null;
  pickupLockTimer: number;
}

export interface SetPieceInfo {
  type: SetPieceType;
  team: TeamSide;
  spot: Vec3;
  takerId: string | null;
  timer: number;
}

export interface ReplayPlayerFrame {
  id: string;
  x: number;
  y: number;
  z: number;
  facingAngle: number;
  actionState: PlayerActionState;
  diveDir: -1 | 0 | 1;
  animPhase: number;
}

export interface ReplayFrame {
  ballPos: Vec3;
  ballVel: Vec3;
  ballSpin: Vec3;
  players: ReplayPlayerFrame[];
}

export interface TeamKit {
  primary: string;
  secondary: string;
  shorts: string;
  socks: string;
  gkPrimary: string;
  gkSecondary: string;
}

export interface TeamConfig {
  id: string;
  name: string;
  shortName: string;
  city: string;
  kit: TeamKit;
  rating: {
    attack: number;
    midfield: number;
    defense: number;
  };
  roster: PlayerProfile[];
}

export interface GameSettings {
  quality: QualityLevel;
  cameraMode: CameraMode;
  soundEnabled: boolean;
  showTouchControls: boolean;
  halfDurationSeconds: number; // real-time seconds per half (e.g., 120s)
}

export interface MatchStats {
  homeScore: number;
  awayScore: number;
  homeShots: number;
  awayShots: number;
  homePasses: number;
  awayPasses: number;
  homeSaves: number;
  awaySaves: number;
  homeCorners: number;
  awayCorners: number;
  homeFouls: number;
  awayFouls: number;
  homePossessionSeconds: number;
  awayPossessionSeconds: number;
  lastScorerName: string | null;
  lastScorerTeam: TeamSide | null;
  lastGoalMinute: number | null;
}

export interface CareerProgress {
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  goalsScored: number;
}

export interface SavedState {
  settings: GameSettings;
  homeTeamId: string;
  awayTeamId: string;
  homeFormation: FormationId;
  awayFormation: FormationId;
  homeMentality: TacticalMentality;
  awayMentality: TacticalMentality;
  career: CareerProgress;
  customCaptainAppearance: CustomPlayerAppearance | null;
  customPlayer: CustomPlayerProfile;
}

export interface RadarDot {
  x: number; // normalized -1..1 along pitch length
  z: number; // normalized -1..1 along pitch width
  team: TeamSide;
  isControlled: boolean;
}

export interface MatchHudSnapshot {
  shellState: GameShellState;
  phase: MatchPhase;
  half: 1 | 2;
  matchMinutes: number; // 0..90+
  matchSeconds: number; // 0..59 display clock
  homeScore: number;
  awayScore: number;
  homeShort: string;
  awayShort: string;
  homeColor: string;
  awayColor: string;
  homeFormation: FormationId;
  homeMentality: TacticalMentality;
  controlledPlayerName: string;
  controlledPlayerNumber: number;
  controlledPlayerRole: PlayerRole;
  controlledStamina: number;
  controlledHasBall: boolean;
  controlledShotCharge: number; // 0..1
  cameraMode: CameraMode;
  isReplaying: boolean;
  setPieceBanner: {
    type: SetPieceType;
    team: TeamSide;
    teamName: string;
    hint: string;
  } | null;
  goalBanner: {
    scorerName: string;
    teamName: string;
    minute: number;
  } | null;
  stats: MatchStats;
  radarBall: { x: number; z: number };
  radarPlayers: RadarDot[];
}

export interface InputSnapshot {
  moveX: number; // -1..1 screen/world right
  moveZ: number; // -1..1 screen/world down
  sprint: boolean;
  passPressed: boolean;
  lobPressed: boolean;
  shootHeld: boolean;
  shootReleased: boolean;
  shootPressed: boolean; // true on quick tap or release
  tacklePressed: boolean;
  switchPressed: boolean;
}
