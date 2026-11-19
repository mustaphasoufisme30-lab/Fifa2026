import {
  BallState,
  FormationId,
  InputSnapshot,
  MatchPhase,
  MatchStats,
  PlayerActionState,
  SetPieceInfo,
  TeamSide,
} from '../core/types';

export type OnlineSoundEvent =
  | { type: 'kick'; power: number }
  | { type: 'whistle'; pattern: 'short' | 'double' | 'long' }
  | { type: 'post' }
  | { type: 'goal' }
  | { type: 'net' }
  | { type: 'tackle' }
  | { type: 'crowd'; reaction: 'ooh' | 'applause' | 'boo' };

export interface OnlinePlayerSlot {
  clientId: string;
  uid: string;
  nickname: string;
  side: TeamSide;
  teamId: string;
  formation: FormationId;
  ready: boolean;
  connected: boolean;
}

export interface OnlineRoomSnapshot {
  roomCode: string;
  status: 'waiting' | 'playing' | 'finished';
  players: OnlinePlayerSlot[];
  halfDurationSeconds: number;
}

export interface CompactPlayerNetState {
  id: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  facingAngle: number;
  stamina: number;
  actionState: PlayerActionState;
  diveDir: -1 | 0 | 1;
  hasBall: boolean;
  isControlled: boolean;
  animPhase: number;
}

export interface OnlineMatchSnapshot {
  tick: number;
  serverTime: number;
  phase: MatchPhase;
  half: 1 | 2;
  matchMinutes: number;
  matchSeconds: number;
  isReplaying: boolean;
  homeShotCharge: number;
  awayShotCharge: number;
  ball: BallState;
  players: CompactPlayerNetState[];
  setPiece: SetPieceInfo | null;
  goalBanner: {
    scorerName: string;
    teamName: string;
    minute: number;
  } | null;
  stats: MatchStats;
  events: OnlineSoundEvent[];
}

export type ClientToServerMessage =
  | {
      type: 'room:create';
      roomCode?: string;
      uid: string;
      nickname: string;
      teamId: string;
      formation: FormationId;
      halfDurationSeconds?: number;
    }
  | {
      type: 'room:join';
      roomCode: string;
      uid: string;
      nickname: string;
      teamId: string;
      formation: FormationId;
    }
  | {
      type: 'room:reconnect';
      roomCode: string;
      uid: string;
    }
  | { type: 'room:leave' }
  | {
      type: 'room:updateProfile';
      teamId?: string;
      formation?: FormationId;
      ready?: boolean;
      nickname?: string;
    }
  | { type: 'room:start' }
  | { type: 'match:input'; input: InputSnapshot }
  | { type: 'match:rematch' }
  | { type: 'ping'; clientTime: number };

export type ServerToClientMessage =
  | { type: 'connected'; clientId: string; onlineCount: number }
  | { type: 'presence'; onlineCount: number }
  | { type: 'pong'; clientTime: number; serverTime: number }
  | { type: 'room:state'; room: OnlineRoomSnapshot; yourSide: TeamSide }
  | { type: 'room:error'; message: string }
  | {
      type: 'match:start';
      room: OnlineRoomSnapshot;
      yourSide: TeamSide;
    }
  | { type: 'match:state'; snapshot: OnlineMatchSnapshot }
  | { type: 'match:finished'; stats: MatchStats; room: OnlineRoomSnapshot }
  | { type: 'opponent:disconnected'; message: string }
  | { type: 'opponent:reconnected'; message: string };
