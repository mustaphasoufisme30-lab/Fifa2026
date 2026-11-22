import { FormationId, InputSnapshot, MatchStats, TeamSide } from '../core/types';
import { MatchEngine } from '../game/matchEngine';
import { getTeamById, TEAMS } from '../teams/teams';
import {
  ClientToServerMessage,
  OnlinePlayerSlot,
  OnlineRoomSnapshot,
  OnlineSoundEvent,
  RoomBootstrapData,
  ServerToClientMessage,
} from './protocol';

export interface ClientTransport {
  id: string;
  send: (msg: ServerToClientMessage) => void;
}

interface LivePlayer extends OnlinePlayerSlot {
  transport: ClientTransport | null;
  latestInput: InputSnapshot;
  disconnectedAt: number | null;
}

interface LiveRoom {
  roomCode: string;
  status: 'waiting' | 'playing' | 'finished';
  halfDurationSeconds: number;
  matchNumber: number;
  players: LivePlayer[];
  engine: MatchEngine | null;
  pendingEvents: OnlineSoundEvent[];
  tick: number;
  broadcastCounter: number;
  pausedForDisconnect: boolean;
}

const VALID_FORMATIONS = new Set<FormationId>(['4-3-3', '4-4-2', '3-5-2', '4-2-3-1']);
const VALID_HALF_DURATIONS = new Set([60, 120, 180]);
const VALID_TEAM_IDS = new Set(TEAMS.map((t) => t.id));
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RECONNECT_GRACE_MS = 90_000;

export function createNeutralInput(): InputSnapshot {
  return {
    moveX: 0,
    moveZ: 0,
    sprint: false,
    passPressed: false,
    lobPressed: false,
    shootPressed: false,
    shootHeld: false,
    shootReleased: false,
    tacklePressed: false,
    switchPressed: false,
  };
}

function clampAxis(val: unknown): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return 0;
  return Math.max(-1, Math.min(1, val));
}

function sanitizeInput(raw: InputSnapshot): InputSnapshot {
  const moveX = clampAxis(raw.moveX);
  const moveZ = clampAxis(raw.moveZ);
  const mag = Math.hypot(moveX, moveZ);
  const nx = mag > 1 ? moveX / mag : moveX;
  const nz = mag > 1 ? moveZ / mag : moveZ;
  return {
    moveX: nx,
    moveZ: nz,
    sprint: Boolean(raw.sprint),
    passPressed: Boolean(raw.passPressed),
    lobPressed: Boolean(raw.lobPressed),
    shootPressed: Boolean(raw.shootPressed),
    shootHeld: Boolean(raw.shootHeld),
    shootReleased: Boolean(raw.shootReleased),
    tacklePressed: Boolean(raw.tacklePressed),
    switchPressed: Boolean(raw.switchPressed),
  };
}

function sanitizeNickname(raw: string, uid: string): string {
  const cleaned = (raw || '').trim().replace(/\s+/g, ' ').slice(0, 24);
  return cleaned.length > 0 ? cleaned : `Joueur_${uid.slice(0, 4).toUpperCase()}`;
}

function sanitizeRoomCode(raw?: string): string {
  return (raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
}

function normalizeTeamId(teamId: string): string {
  return VALID_TEAM_IDS.has(teamId) ? teamId : TEAMS[0].id;
}

function pickDistinctTeam(takenTeamId: string, preferredTeamId?: string): string {
  if (preferredTeamId && VALID_TEAM_IDS.has(preferredTeamId) && preferredTeamId !== takenTeamId) {
    return preferredTeamId;
  }
  return (TEAMS.find((t) => t.id !== takenTeamId) ?? TEAMS[0]).id;
}

function normalizeFormation(f: FormationId): FormationId {
  return VALID_FORMATIONS.has(f) ? f : '4-3-3';
}

function normalizeHalfDuration(sec?: number): number {
  return sec && VALID_HALF_DURATIONS.has(sec) ? sec : 120;
}

export class OnlineRoomManager {
  private clients = new Map<string, ClientTransport>();
  private authenticatedUids = new Map<string, string>();
  private clientToRoom = new Map<string, string>();
  private rooms = new Map<string, LiveRoom>();

  public addClient(client: ClientTransport): void {
    this.clients.set(client.id, client);
    client.send({
      type: 'connected',
      clientId: client.id,
      onlineCount: this.clients.size,
    });
    this.broadcastPresence();
  }

  public authenticateClient(clientId: string, verifiedUid: string): boolean {
    if (!this.clients.has(clientId)) return false;
    const cleanUid = verifiedUid.trim();
    if (!cleanUid) return false;
    this.authenticatedUids.set(clientId, cleanUid);
    return true;
  }

  public getAuthenticatedUid(clientId: string): string | null {
    return this.authenticatedUids.get(clientId) ?? null;
  }

  public getOnlineCount(): number {
    return this.clients.size;
  }

  public getRoomSnapshot(roomCode: string): OnlineRoomSnapshot | null {
    const room = this.rooms.get(sanitizeRoomCode(roomCode));
    return room ? this.toRoomSnapshot(room) : null;
  }

  public removeClient(clientId: string): void {
    this.clients.delete(clientId);
    this.authenticatedUids.delete(clientId);
    const roomCode = this.clientToRoom.get(clientId);
    this.clientToRoom.delete(clientId);

    if (roomCode) {
      const room = this.rooms.get(roomCode);
      if (room) {
        const player = room.players.find((p) => p.clientId === clientId);
        if (player) {
          if (room.status === 'playing') {
            // Keep slot alive so the player can reconnect automatically!
            player.connected = false;
            player.transport = null;
            player.disconnectedAt = Date.now();
            player.latestInput = createNeutralInput();
            room.pausedForDisconnect = true;

            for (const other of room.players) {
              if (other.uid !== player.uid && other.transport) {
                other.transport.send({
                  type: 'opponent:disconnected',
                  message: `${player.nickname} a perdu la connexion. En attente de reconnexion...`,
                });
              }
            }
            this.broadcastRoomState(room);
          } else {
            // In waiting or finished lobby, remove player cleanly
            room.players = room.players.filter((p) => p.clientId !== clientId);
            if (room.players.length === 0) {
              this.rooms.delete(roomCode);
            } else {
              // Promote remaining player to home if needed
              room.players[0].side = 'home';
              this.broadcastRoomState(room);
            }
          }
        }
      }
    }

    this.broadcastPresence();
  }

  public handleMessage(clientId: string, msg: ClientToServerMessage): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    if (msg.type === 'ping') {
      client.send({ type: 'pong', clientTime: msg.clientTime, serverTime: Date.now() });
      return;
    }

    if (msg.type === 'auth') {
      // Token verification is handled asynchronously in server.ts via verifyIdToken
      return;
    }

    const verifiedUid = this.authenticatedUids.get(clientId);
    if (!verifiedUid) {
      client.send({
        type: 'auth:error',
        message: 'Authentification Firebase requise avant toute action multijoueur.',
      });
      return;
    }

    if (
      'uid' in msg &&
      typeof msg.uid === 'string' &&
      msg.uid.trim().length > 0 &&
      msg.uid.trim() !== verifiedUid
    ) {
      client.send({
        type: 'auth:error',
        message: 'Identité Firebase incohérente avec le jeton authentifié.',
      });
      return;
    }

    switch (msg.type) {
      case 'room:create':
        this.handleCreateRoom(client, verifiedUid, msg);
        return;

      case 'room:join':
        this.handleJoinRoom(client, verifiedUid, msg);
        return;

      case 'room:reconnect':
        this.handleReconnect(client, msg.roomCode, verifiedUid, msg.bootstrap);
        return;

      case 'room:leave':
        this.leaveCurrentRoom(clientId);
        return;

      case 'room:updateProfile':
        this.handleUpdateProfile(clientId, msg);
        return;

      case 'room:start':
        this.handleStartMatch(client, verifiedUid, msg);
        return;

      case 'match:input':
        this.handleMatchInput(clientId, msg.input);
        return;

      case 'match:rematch':
        this.handleRematch(clientId);
        return;
    }
  }

  /**
   * Advances all active authoritative matches by dt seconds (called at 30 Hz on server).
   */
  public stepAllMatches(dt: number, now = Date.now()): void {
    for (const [roomCode, room] of this.rooms.entries()) {
      // Clean up abandoned disconnected rooms after grace period
      if (room.status === 'playing' && room.pausedForDisconnect) {
        const allDisconnectedLong = room.players.every(
          (p) => !p.connected && p.disconnectedAt !== null && now - p.disconnectedAt > RECONNECT_GRACE_MS,
        );
        if (allDisconnectedLong) {
          this.rooms.delete(roomCode);
          continue;
        }
        continue;
      }

      if (room.status !== 'playing' || !room.engine) continue;

      const homePlayer = room.players.find((p) => p.side === 'home');
      const awayPlayer = room.players.find((p) => p.side === 'away');
      if (!homePlayer || !awayPlayer) continue;

      const homeInput = { ...homePlayer.latestInput };
      const awayInput = { ...awayPlayer.latestInput };

      // Consume one-shot edge triggers so a press only fires once
      homePlayer.latestInput.passPressed = false;
      homePlayer.latestInput.lobPressed = false;
      homePlayer.latestInput.shootPressed = false;
      homePlayer.latestInput.shootReleased = false;
      homePlayer.latestInput.tacklePressed = false;
      homePlayer.latestInput.switchPressed = false;

      awayPlayer.latestInput.passPressed = false;
      awayPlayer.latestInput.lobPressed = false;
      awayPlayer.latestInput.shootPressed = false;
      awayPlayer.latestInput.shootReleased = false;
      awayPlayer.latestInput.tacklePressed = false;
      awayPlayer.latestInput.switchPressed = false;

      const prevPhase = room.engine.phase;
      room.engine.step(dt, homeInput, awayInput);
      room.tick += 1;
      room.broadcastCounter += 1;

      const phaseChanged = room.engine.phase !== prevPhase;
      const hasEvents = room.pendingEvents.length > 0;

      // Broadcast at ~15-20 Hz (every 2 ticks at 30 Hz = 15 Hz, or immediately on goals/events/phase changes)
      if (phaseChanged || hasEvents || room.broadcastCounter >= 2) {
        room.broadcastCounter = 0;
        const events = room.pendingEvents.splice(0, room.pendingEvents.length);
        const snapshot = room.engine.getOnlineSnapshot(room.tick, events);

        for (const p of room.players) {
          p.transport?.send({ type: 'match:state', snapshot });
        }
      }
    }
  }

  private generateUniqueCode(): string {
    for (let attempt = 0; attempt < 25; attempt++) {
      let code = '';
      for (let i = 0; i < 5; i++) {
        code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
    return `F${String(Date.now()).slice(-4)}`;
  }

  private leaveCurrentRoom(clientId: string): void {
    const existingCode = this.clientToRoom.get(clientId);
    if (!existingCode) return;
    this.clientToRoom.delete(clientId);

    const room = this.rooms.get(existingCode);
    if (!room) return;

    const leaving = room.players.find((p) => p.clientId === clientId);
    const wasPlaying = room.status === 'playing';
    const finalStats: MatchStats | null = room.engine ? { ...room.engine.stats } : null;
    const roomBeforeLeave = wasPlaying ? this.toRoomSnapshot(room) : null;

    room.players = room.players.filter((p) => p.clientId !== clientId);

    if (room.players.length === 0) {
      room.engine = null;
      this.rooms.delete(existingCode);
      return;
    }

    if (wasPlaying) {
      room.status = 'finished';
      room.engine = null;
      room.pausedForDisconnect = false;
      const stoppedRoom: OnlineRoomSnapshot = {
        ...(roomBeforeLeave ?? this.toRoomSnapshot(room)),
        status: 'finished',
      };
      const fallbackStats: MatchStats = finalStats ?? {
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
      const leavingName = leaving?.nickname ?? 'Votre adversaire';
      for (const other of room.players) {
        other.ready = false;
        other.transport?.send({
          type: 'match:finished',
          stats: fallbackStats,
          room: stoppedRoom,
          abortedByNickname: leavingName,
        });
      }
      this.broadcastRoomState(room);
      return;
    }

    room.players[0].side = 'home';
    this.broadcastRoomState(room);
  }

  private handleCreateRoom(
    client: ClientTransport,
    verifiedUid: string,
    msg: Extract<ClientToServerMessage, { type: 'room:create' }>,
  ): void {
    this.leaveCurrentRoom(client.id);

    const requestedCode = sanitizeRoomCode(msg.roomCode);
    const code =
      requestedCode.length === 5 && !this.rooms.has(requestedCode)
        ? requestedCode
        : this.generateUniqueCode();

    const host: LivePlayer = {
      clientId: client.id,
      uid: verifiedUid,
      nickname: sanitizeNickname(msg.nickname, verifiedUid),
      side: 'home',
      teamId: normalizeTeamId(msg.teamId),
      formation: normalizeFormation(msg.formation),
      ready: false,
      connected: true,
      transport: client,
      latestInput: createNeutralInput(),
      disconnectedAt: null,
    };

    const room: LiveRoom = {
      roomCode: code,
      status: 'waiting',
      halfDurationSeconds: normalizeHalfDuration(msg.halfDurationSeconds),
      matchNumber: 0,
      players: [host],
      engine: null,
      pendingEvents: [],
      tick: 0,
      broadcastCounter: 0,
      pausedForDisconnect: false,
    };

    this.rooms.set(code, room);
    this.clientToRoom.set(client.id, code);
    this.broadcastRoomState(room);
  }

  private hydrateRoomFromBootstrap(
    code: string,
    bootstrap: RoomBootstrapData,
    client: ClientTransport,
    verifiedUid: string,
  ): LiveRoom | null {
    const hostUid = (bootstrap.hostUid || '').trim();
    const guestUid = (bootstrap.guestUid || '').trim();
    if (!hostUid) return null;

    const isHost = verifiedUid === hostUid;
    const isGuest = guestUid.length > 0 && verifiedUid === guestUid;
    if (!isHost && !isGuest) {
      return null;
    }

    this.leaveCurrentRoom(client.id);

    const hostTeamId = normalizeTeamId(bootstrap.hostTeamId);
    const host: LivePlayer = {
      clientId: isHost ? client.id : `pending_host_${code}`,
      uid: hostUid,
      nickname: sanitizeNickname(bootstrap.hostName, hostUid),
      side: 'home',
      teamId: hostTeamId,
      formation: normalizeFormation(bootstrap.hostFormation),
      ready: Boolean(bootstrap.hostReady),
      connected: isHost,
      transport: isHost ? client : null,
      latestInput: createNeutralInput(),
      disconnectedAt: isHost ? null : Date.now(),
    };

    const players: LivePlayer[] = [host];
    if (guestUid && guestUid !== hostUid) {
      players.push({
        clientId: isGuest ? client.id : `pending_guest_${code}`,
        uid: guestUid,
        nickname: sanitizeNickname(bootstrap.guestName || '', guestUid),
        side: 'away',
        teamId: pickDistinctTeam(hostTeamId, bootstrap.guestTeamId),
        formation: normalizeFormation(bootstrap.guestFormation ?? '4-3-3'),
        ready: Boolean(bootstrap.guestReady),
        connected: isGuest,
        transport: isGuest ? client : null,
        latestInput: createNeutralInput(),
        disconnectedAt: isGuest ? null : Date.now(),
      });
    }

    const room: LiveRoom = {
      roomCode: code,
      status: 'waiting',
      halfDurationSeconds: normalizeHalfDuration(bootstrap.halfDurationSeconds),
      matchNumber: 0,
      players,
      engine: null,
      pendingEvents: [],
      tick: 0,
      broadcastCounter: 0,
      pausedForDisconnect: false,
    };

    this.rooms.set(code, room);
    this.clientToRoom.set(client.id, code);
    this.broadcastRoomState(room);
    return room;
  }

  private handleJoinRoom(
    client: ClientTransport,
    verifiedUid: string,
    msg: Extract<ClientToServerMessage, { type: 'room:join' }>,
  ): void {
    const code = sanitizeRoomCode(msg.roomCode);
    if (code.length !== 5) {
      client.send({
        type: 'room:error',
        message: 'Le code de partie doit contenir 5 caractères (ex: A7K92).',
      });
      return;
    }

    const room = this.rooms.get(code);
    if (!room) {
      if (msg.bootstrap) {
        const hydrated = this.hydrateRoomFromBootstrap(code, msg.bootstrap, client, verifiedUid);
        if (hydrated) {
          return;
        }
      }
      client.send({
        type: 'room:error',
        message: `Aucune partie active trouvée pour le code ${code}.`,
      });
      return;
    }

    // Reconnect seamlessly if the same verified Firebase UID is already in this room!
    const existingByUid = room.players.find((p) => p.uid === verifiedUid);
    if (existingByUid) {
      this.handleReconnect(client, code, verifiedUid, msg.bootstrap);
      return;
    }

    if (room.status !== 'waiting') {
      client.send({
        type: 'room:error',
        message: 'Ce match a déjà commencé.',
      });
      return;
    }

    if (room.players.length >= 2) {
      client.send({
        type: 'room:error',
        message: 'Cette partie est déjà complète (2/2 joueurs).',
      });
      return;
    }

    this.leaveCurrentRoom(client.id);

    const host = room.players[0];
    const assignedTeam = pickDistinctTeam(host.teamId, msg.teamId);

    const guest: LivePlayer = {
      clientId: client.id,
      uid: verifiedUid,
      nickname: sanitizeNickname(msg.nickname, verifiedUid),
      side: 'away',
      teamId: assignedTeam,
      formation: normalizeFormation(msg.formation),
      ready: false,
      connected: true,
      transport: client,
      latestInput: createNeutralInput(),
      disconnectedAt: null,
    };

    room.players.push(guest);
    this.clientToRoom.set(client.id, code);
    this.broadcastRoomState(room);
  }

  private handleReconnect(
    client: ClientTransport,
    rawCode: string,
    verifiedUid: string,
    bootstrap?: RoomBootstrapData,
  ): void {
    const code = sanitizeRoomCode(rawCode);
    const room = this.rooms.get(code);
    if (!room) {
      if (code.length === 5 && bootstrap) {
        const hydrated = this.hydrateRoomFromBootstrap(code, bootstrap, client, verifiedUid);
        if (hydrated) {
          return;
        }
      }
      client.send({ type: 'room:error', message: `Partie ${code} introuvable.` });
      return;
    }

    let slot = room.players.find((p) => p.uid === verifiedUid);
    if (!slot && room.status === 'waiting' && bootstrap && room.players.length < 2) {
      // Allow verified Firestore participant to attach if the room was recreated on a new instance
      const isBootstrapGuest = Boolean(bootstrap.guestUid) && bootstrap.guestUid === verifiedUid;
      const isBootstrapHost = bootstrap.hostUid === verifiedUid;
      if (isBootstrapGuest || isBootstrapHost) {
        this.leaveCurrentRoom(client.id);
        const existingPlayer = room.players[0];
        const attachedTeam = pickDistinctTeam(
          existingPlayer.teamId,
          isBootstrapGuest ? bootstrap.guestTeamId : bootstrap.hostTeamId,
        );
        slot = {
          clientId: client.id,
          uid: verifiedUid,
          nickname: sanitizeNickname(
            isBootstrapGuest ? bootstrap.guestName || '' : bootstrap.hostName,
            verifiedUid,
          ),
          side: existingPlayer.side === 'home' ? 'away' : 'home',
          teamId: attachedTeam,
          formation: normalizeFormation(
            isBootstrapGuest
              ? (bootstrap.guestFormation ?? '4-3-3')
              : bootstrap.hostFormation,
          ),
          ready: Boolean(isBootstrapGuest ? bootstrap.guestReady : bootstrap.hostReady),
          connected: true,
          transport: client,
          latestInput: createNeutralInput(),
          disconnectedAt: null,
        };
        room.players.push(slot);
        this.clientToRoom.set(client.id, code);
        this.broadcastRoomState(room);
        return;
      }
    }

    if (!slot) {
      client.send({ type: 'room:error', message: 'Vous ne faites pas partie de cette salle.' });
      return;
    }

    // Rebind transport & clientId
    this.clientToRoom.delete(slot.clientId);
    slot.clientId = client.id;
    slot.transport = client;
    slot.connected = true;
    slot.disconnectedAt = null;
    this.clientToRoom.set(client.id, code);

    if (room.status === 'playing') {
      room.pausedForDisconnect = room.players.some((p) => !p.connected);
      client.send({
        type: 'match:start',
        room: this.toRoomSnapshot(room),
        yourSide: slot.side,
      });
      if (room.engine) {
        client.send({
          type: 'match:state',
          snapshot: room.engine.getOnlineSnapshot(room.tick, []),
        });
      }
      for (const other of room.players) {
        if (other.uid !== slot.uid && other.transport) {
          other.transport.send({
            type: 'opponent:reconnected',
            message: `${slot.nickname} est reconnecté. Le match reprend !`,
          });
        }
      }
    }

    this.broadcastRoomState(room);
  }

  private handleUpdateProfile(
    clientId: string,
    msg: Extract<ClientToServerMessage, { type: 'room:updateProfile' }>,
  ): void {
    const code = this.clientToRoom.get(clientId);
    if (!code) return;
    const room = this.rooms.get(code);
    if (!room || room.status !== 'waiting') return;

    const player = room.players.find((p) => p.clientId === clientId);
    if (!player) return;

    if (typeof msg.nickname === 'string') {
      player.nickname = sanitizeNickname(msg.nickname, player.uid);
    }

    if (typeof msg.teamId === 'string' && VALID_TEAM_IDS.has(msg.teamId)) {
      const other = room.players.find((p) => p.clientId !== clientId);
      if (!other || other.teamId !== msg.teamId) {
        player.teamId = msg.teamId;
      }
    }

    if (msg.formation && VALID_FORMATIONS.has(msg.formation)) {
      player.formation = msg.formation;
    }

    if (typeof msg.ready === 'boolean') {
      player.ready = msg.ready;
    }

    this.broadcastRoomState(room);
  }

  private handleStartMatch(
    client: ClientTransport,
    verifiedUid: string,
    msg: Extract<ClientToServerMessage, { type: 'room:start' }>,
  ): void {
    let code = this.clientToRoom.get(client.id);
    if (!code && msg.roomCode) {
      this.handleReconnect(client, msg.roomCode, verifiedUid, msg.bootstrap);
      code = this.clientToRoom.get(client.id);
    }
    if (!code) {
      client.send({
        type: 'room:error',
        message: 'Salle non synchronisée avec le serveur temps réel.',
      });
      return;
    }

    const room = this.rooms.get(code);
    if (!room) {
      client.send({
        type: 'room:error',
        message: `Partie ${code} introuvable sur le serveur.`,
      });
      return;
    }

    if (room.status !== 'waiting') {
      return;
    }

    if (room.players.length < 2) {
      client.send({
        type: 'room:error',
        message: 'En attente du deuxième joueur avant le coup d’envoi.',
      });
      return;
    }

    if (room.players.some((p) => !p.connected)) {
      client.send({
        type: 'room:error',
        message: 'En attente de la connexion temps réel du deuxième joueur...',
      });
      return;
    }

    this.startRoomEngine(room);
  }

  private handleRematch(clientId: string): void {
    const code = this.clientToRoom.get(clientId);
    if (!code) return;
    const room = this.rooms.get(code);
    if (!room || room.players.length < 2) return;
    if (room.status !== 'finished') return;
    if (room.players.some((p) => !p.connected)) {
      this.clients.get(clientId)?.send({
        type: 'room:error',
        message: 'Les deux joueurs doivent être connectés pour lancer la revanche.',
      });
      return;
    }

    this.startRoomEngine(room);
  }

  private startRoomEngine(room: LiveRoom): void {
    const home = room.players.find((p) => p.side === 'home');
    const away = room.players.find((p) => p.side === 'away');
    if (!home || !away) return;

    // Guarantee distinct clubs on the pitch
    if (away.teamId === home.teamId) {
      away.teamId = pickDistinctTeam(home.teamId);
    }

    home.latestInput = createNeutralInput();
    away.latestInput = createNeutralInput();
    room.pendingEvents = [];
    room.tick = 0;
    room.broadcastCounter = 0;
    room.pausedForDisconnect = false;
    room.matchNumber += 1;
    room.status = 'playing';

    const homeTeam = getTeamById(home.teamId);
    const awayTeam = getTeamById(away.teamId);

    const engine = new MatchEngine(
      homeTeam,
      awayTeam,
      home.formation,
      away.formation,
      room.halfDurationSeconds,
      'tv',
      {
        onHudUpdate: () => {
          // Headless authoritative server does not need local HUD updates
        },
        onCameraTrauma: () => {
          // Handled on clients from authoritative sound/match events
        },
        onSoundEvent: (ev) => {
          room.pendingEvents.push(ev);
        },
        onMatchFinished: (finalStats: MatchStats) => {
          room.status = 'finished';
          const roomSnap = this.toRoomSnapshot(room);
          for (const p of room.players) {
            p.transport?.send({
              type: 'match:finished',
              stats: { ...finalStats },
              room: roomSnap,
            });
          }
        },
      },
      'balanced',
      'balanced',
    );

    engine.startNewMatch(
      homeTeam,
      awayTeam,
      home.formation,
      away.formation,
      room.halfDurationSeconds,
      'balanced',
      'balanced',
      {
        awayHumanControl: true,
        localSide: 'home',
        isOnlineClient: false,
      },
    );

    room.engine = engine;

    const roomSnap = this.toRoomSnapshot(room);
    const initialSnapshot = engine.getOnlineSnapshot(0, room.pendingEvents.splice(0));

    for (const p of room.players) {
      p.transport?.send({
        type: 'match:start',
        room: roomSnap,
        yourSide: p.side,
      });
      p.transport?.send({
        type: 'match:state',
        snapshot: initialSnapshot,
      });
    }
  }

  private handleMatchInput(clientId: string, rawInput: InputSnapshot): void {
    const code = this.clientToRoom.get(clientId);
    if (!code) return;
    const room = this.rooms.get(code);
    if (!room || room.status !== 'playing') return;

    const player = room.players.find((p) => p.clientId === clientId);
    if (!player) return;

    const clean = sanitizeInput(rawInput);
    // Latch discrete presses until consumed by the next authoritative tick
    player.latestInput = {
      moveX: clean.moveX,
      moveZ: clean.moveZ,
      sprint: clean.sprint,
      shootHeld: clean.shootHeld,
      passPressed: player.latestInput.passPressed || clean.passPressed,
      lobPressed: player.latestInput.lobPressed || clean.lobPressed,
      shootPressed: player.latestInput.shootPressed || clean.shootPressed,
      shootReleased: player.latestInput.shootReleased || clean.shootReleased,
      tacklePressed: player.latestInput.tacklePressed || clean.tacklePressed,
      switchPressed: player.latestInput.switchPressed || clean.switchPressed,
    };
  }

  private toRoomSnapshot(room: LiveRoom): OnlineRoomSnapshot {
    return {
      roomCode: room.roomCode,
      status: room.status,
      halfDurationSeconds: room.halfDurationSeconds,
      matchNumber: room.matchNumber,
      players: room.players.map((p) => ({
        clientId: p.clientId,
        uid: p.uid,
        nickname: p.nickname,
        side: p.side,
        teamId: p.teamId,
        formation: p.formation,
        ready: p.ready,
        connected: p.connected,
      })),
    };
  }

  private broadcastRoomState(room: LiveRoom): void {
    const snap = this.toRoomSnapshot(room);
    for (const p of room.players) {
      p.transport?.send({
        type: 'room:state',
        room: snap,
        yourSide: p.side,
      });
    }
  }

  private broadcastPresence(): void {
    const onlineCount = this.clients.size;
    for (const c of this.clients.values()) {
      c.send({ type: 'presence', onlineCount });
    }
  }
}
