import {
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { FormationId, InputSnapshot } from '../core/types';
import { OnlineMatchSnapshot } from '../multiplayer/protocol';
import { TEAMS } from '../teams/teams';
import { db, handleFirestoreError, OperationType } from './firebase';

export interface FirestoreRoomDoc {
  roomCode: string;
  hostUid: string;
  hostName: string;
  hostTeamId: string;
  hostFormation: FormationId;
  hostReady: boolean;
  guestUid: string;
  guestName: string;
  guestTeamId: string;
  guestFormation: FormationId;
  guestReady: boolean;
  status: 'waiting' | 'playing' | 'finished';
  homeScore: number;
  awayScore: number;
  winnerUid: string;
  halfDurationSeconds: number;
}

export interface FirestorePlayerProfile {
  uid: string;
  displayName: string;
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  goalsScored: number;
}

const VALID_HALF_DURATIONS = new Set([60, 120, 180]);
const VALID_FORMATIONS = new Set<FormationId>(['4-3-3', '4-4-2', '3-5-2', '4-2-3-1']);
const VALID_TEAM_IDS = new Set(TEAMS.map((t) => t.id));
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function sanitizeDisplayName(raw: string | null | undefined, fallbackUid?: string): string {
  const cleaned = (raw ?? '').trim().replace(/\s+/g, ' ').slice(0, 24);
  if (cleaned.length >= 1) return cleaned;
  if (fallbackUid) return `Joueur_${fallbackUid.slice(0, 4).toUpperCase()}`;
  return 'Joueur';
}

export function sanitizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
}

export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

export function pickDistinctTeamId(takenTeamId: string, preferredTeamId?: string): string {
  if (
    preferredTeamId &&
    VALID_TEAM_IDS.has(preferredTeamId) &&
    preferredTeamId !== takenTeamId
  ) {
    return preferredTeamId;
  }
  const fallback = TEAMS.find((t) => t.id !== takenTeamId) ?? TEAMS[0];
  return fallback.id;
}

function normalizeTeamId(id: string): string {
  return VALID_TEAM_IDS.has(id) ? id : TEAMS[0].id;
}

function normalizeFormation(f: FormationId): FormationId {
  return VALID_FORMATIONS.has(f) ? f : '4-3-3';
}

function normalizeHalfDuration(sec: number): number {
  return VALID_HALF_DURATIONS.has(sec) ? sec : 120;
}

export async function ensurePlayerProfile(
  uid: string,
  displayName: string,
): Promise<FirestorePlayerProfile> {
  const path = `players/${uid}`;
  const ref = doc(db, 'players', uid);
  const safeName = sanitizeDisplayName(displayName, uid);

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      return {
        uid,
        displayName: typeof data.displayName === 'string' ? data.displayName : safeName,
        matchesPlayed: Number(data.matchesPlayed ?? 0),
        wins: Number(data.wins ?? 0),
        draws: Number(data.draws ?? 0),
        losses: Number(data.losses ?? 0),
        goalsScored: Number(data.goalsScored ?? 0),
      };
    }

    const initial = {
      uid,
      displayName: safeName,
      matchesPlayed: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsScored: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(ref, initial);
    return {
      uid,
      displayName: safeName,
      matchesPlayed: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsScored: 0,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function recordOnlinePlayerMatchStats(
  uid: string,
  displayName: string,
  goalsScored: number,
  outcome: 'win' | 'draw' | 'loss',
): Promise<void> {
  const path = `players/${uid}`;
  const ref = doc(db, 'players', uid);

  try {
    const existing = await ensurePlayerProfile(uid, displayName);
    const clampedGoals = Math.max(0, Math.min(30, Math.round(goalsScored)));
    await updateDoc(ref, {
      displayName: sanitizeDisplayName(displayName, uid),
      matchesPlayed: existing.matchesPlayed + 1,
      wins: existing.wins + (outcome === 'win' ? 1 : 0),
      draws: existing.draws + (outcome === 'draw' ? 1 : 0),
      losses: existing.losses + (outcome === 'loss' ? 1 : 0),
      goalsScored: existing.goalsScored + clampedGoals,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function createFirestoreRoom(params: {
  roomCode?: string;
  hostUid: string;
  hostName: string;
  hostTeamId: string;
  hostFormation: FormationId;
  halfDurationSeconds: number;
}): Promise<FirestoreRoomDoc> {
  const safeHostName = sanitizeDisplayName(params.hostName, params.hostUid);
  const safeTeamId = normalizeTeamId(params.hostTeamId);
  const safeFormation = normalizeFormation(params.hostFormation);
  const safeHalf = normalizeHalfDuration(params.halfDurationSeconds);

  let code = params.roomCode ? sanitizeRoomCode(params.roomCode) : generateRoomCode();
  if (code.length !== 5) {
    code = generateRoomCode();
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const path = `rooms/${code}`;
    const ref = doc(db, 'rooms', code);
    try {
      const existing = await getDoc(ref);
      if (existing.exists()) {
        code = generateRoomCode();
        continue;
      }

      await setDoc(ref, {
        roomCode: code,
        hostUid: params.hostUid,
        hostName: safeHostName,
        hostTeamId: safeTeamId,
        hostFormation: safeFormation,
        hostReady: false,
        guestUid: '',
        guestName: '',
        guestTeamId: '',
        guestFormation: '4-3-3',
        guestReady: false,
        status: 'waiting',
        homeScore: 0,
        awayScore: 0,
        winnerUid: '',
        halfDurationSeconds: safeHalf,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      return {
        roomCode: code,
        hostUid: params.hostUid,
        hostName: safeHostName,
        hostTeamId: safeTeamId,
        hostFormation: safeFormation,
        hostReady: false,
        guestUid: '',
        guestName: '',
        guestTeamId: '',
        guestFormation: '4-3-3',
        guestReady: false,
        status: 'waiting',
        homeScore: 0,
        awayScore: 0,
        winnerUid: '',
        halfDurationSeconds: safeHalf,
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }

  throw new Error('Impossible de générer un code de partie unique. Réessayez.');
}

export async function joinFirestoreRoom(params: {
  roomCode: string;
  guestUid: string;
  guestName: string;
  preferredTeamId: string;
  guestFormation: FormationId;
}): Promise<FirestoreRoomDoc> {
  const code = sanitizeRoomCode(params.roomCode);
  if (code.length !== 5) {
    throw new Error('Le code de partie doit contenir exactement 5 caractères.');
  }

  const path = `rooms/${code}`;
  const ref = doc(db, 'rooms', code);

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      throw new Error(`Aucune partie trouvée avec le code ${code}.`);
    }

    const data = snap.data() as FirestoreRoomDoc;
    if (data.hostUid === params.guestUid) {
      return data;
    }
    if (data.guestUid === params.guestUid) {
      return data;
    }
    if (data.status !== 'waiting') {
      throw new Error('Cette partie a déjà commencé ou est terminée.');
    }
    if (data.guestUid && data.guestUid !== '') {
      throw new Error('Cette partie est déjà complète (2 joueurs connectés).');
    }

    const assignedTeamId = pickDistinctTeamId(data.hostTeamId, params.preferredTeamId);
    const safeGuestName = sanitizeDisplayName(params.guestName, params.guestUid);
    const safeFormation = normalizeFormation(params.guestFormation);

    await updateDoc(ref, {
      guestUid: params.guestUid,
      guestName: safeGuestName,
      guestTeamId: assignedTeamId,
      guestFormation: safeFormation,
      guestReady: false,
      updatedAt: serverTimestamp(),
    });

    return {
      ...data,
      guestUid: params.guestUid,
      guestName: safeGuestName,
      guestTeamId: assignedTeamId,
      guestFormation: safeFormation,
      guestReady: false,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('Aucune partie') ||
        error.message.includes('déjà complète') ||
        error.message.includes('déjà commencé') ||
        error.message.includes('exactement 5'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateFirestoreRoomLobby(params: {
  roomCode: string;
  role: 'host' | 'guest';
  name: string;
  teamId: string;
  formation: FormationId;
  ready: boolean;
}): Promise<void> {
  const code = sanitizeRoomCode(params.roomCode);
  const path = `rooms/${code}`;
  const ref = doc(db, 'rooms', code);
  const safeName = sanitizeDisplayName(params.name);
  const safeTeam = normalizeTeamId(params.teamId);
  const safeFormation = normalizeFormation(params.formation);

  try {
    if (params.role === 'host') {
      await updateDoc(ref, {
        hostName: safeName,
        hostTeamId: safeTeam,
        hostFormation: safeFormation,
        hostReady: params.ready,
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        guestName: safeName,
        guestTeamId: safeTeam,
        guestFormation: safeFormation,
        guestReady: params.ready,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function markFirestoreRoomPlaying(roomCode: string): Promise<void> {
  const code = sanitizeRoomCode(roomCode);
  const path = `rooms/${code}`;
  try {
    await updateDoc(doc(db, 'rooms', code), {
      status: 'playing',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    // Ignore benign race if the other participant already transitioned to playing
    const msg = error instanceof Error ? error.message : '';
    if (msg.includes('PERMISSION_DENIED')) return;
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function markFirestoreRoomFinished(params: {
  roomCode: string;
  homeScore: number;
  awayScore: number;
  hostUid: string;
  guestUid: string;
}): Promise<void> {
  const code = sanitizeRoomCode(params.roomCode);
  const path = `rooms/${code}`;
  const homeScore = Math.max(0, Math.min(30, Math.round(params.homeScore)));
  const awayScore = Math.max(0, Math.min(30, Math.round(params.awayScore)));
  const winnerUid =
    homeScore > awayScore
      ? params.hostUid
      : awayScore > homeScore
        ? params.guestUid
        : '';

  try {
    await updateDoc(doc(db, 'rooms', code), {
      status: 'finished',
      homeScore,
      awayScore,
      winnerUid,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    // Ignore benign race if the other participant already finalized the room
    const msg = error instanceof Error ? error.message : '';
    if (msg.includes('PERMISSION_DENIED')) return;
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteWaitingFirestoreRoom(roomCode: string): Promise<void> {
  const code = sanitizeRoomCode(roomCode);
  const path = `rooms/${code}`;
  try {
    await deleteDoc(doc(db, 'rooms', code));
  } catch {
    // Safe ignore if room already started or deleted
  }
}

export function subscribeFirestoreRoom(
  roomCode: string,
  onData: (room: FirestoreRoomDoc | null) => void,
  onError?: (err: Error) => void,
): () => void {
  const code = sanitizeRoomCode(roomCode);
  const path = `rooms/${code}`;
  return onSnapshot(
    doc(db, 'rooms', code),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData(snap.data() as FirestoreRoomDoc);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    },
  );
}

// =============================================================================
// Firestore Live Match Sync Fallback (/rooms/{roomCode}/live/{channel})
// =============================================================================

function clampAxis(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(-1, Math.min(1, v));
}

export async function publishFirestoreMatchState(
  roomCode: string,
  tick: number,
  seq: number,
  snapshot: OnlineMatchSnapshot,
): Promise<void> {
  const code = sanitizeRoomCode(roomCode);
  const payload = JSON.stringify(snapshot);
  if (payload.length > 39500) return;
  await setDoc(doc(db, 'rooms', code, 'live', 'state'), {
    tick: Math.max(0, Math.min(1000000, Math.round(tick))),
    seq: Math.max(0, Math.min(1000000, Math.round(seq))),
    payload,
    updatedAt: serverTimestamp(),
  });
}

export function subscribeFirestoreMatchState(
  roomCode: string,
  onSnapshotData: (snapshot: OnlineMatchSnapshot, seq: number) => void,
): () => void {
  const code = sanitizeRoomCode(roomCode);
  return onSnapshot(
    doc(db, 'rooms', code, 'live', 'state'),
    (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (typeof data.payload !== 'string') return;
      try {
        const parsed = JSON.parse(data.payload) as OnlineMatchSnapshot;
        onSnapshotData(parsed, Number(data.seq ?? 0));
      } catch {
        // Ignore malformed snapshot
      }
    },
    () => {
      // Transient network error; Firestore SDK retries automatically
    },
  );
}

export async function publishFirestoreGuestInput(
  roomCode: string,
  seq: number,
  input: InputSnapshot,
): Promise<void> {
  const code = sanitizeRoomCode(roomCode);
  await setDoc(doc(db, 'rooms', code, 'live', 'guestInput'), {
    seq: Math.max(0, Math.min(1000000, Math.round(seq))),
    moveX: clampAxis(input.moveX),
    moveZ: clampAxis(input.moveZ),
    sprint: Boolean(input.sprint),
    passPressed: Boolean(input.passPressed),
    lobPressed: Boolean(input.lobPressed),
    shootPressed: Boolean(input.shootPressed),
    shootHeld: Boolean(input.shootHeld),
    shootReleased: Boolean(input.shootReleased),
    tacklePressed: Boolean(input.tacklePressed),
    switchPressed: Boolean(input.switchPressed),
    updatedAt: serverTimestamp(),
  });
}

export function subscribeFirestoreGuestInput(
  roomCode: string,
  onInput: (input: InputSnapshot, seq: number) => void,
): () => void {
  const code = sanitizeRoomCode(roomCode);
  return onSnapshot(
    doc(db, 'rooms', code, 'live', 'guestInput'),
    (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      onInput(
        {
          moveX: clampAxis(Number(data.moveX ?? 0)),
          moveZ: clampAxis(Number(data.moveZ ?? 0)),
          sprint: Boolean(data.sprint),
          passPressed: Boolean(data.passPressed),
          lobPressed: Boolean(data.lobPressed),
          shootPressed: Boolean(data.shootPressed),
          shootHeld: Boolean(data.shootHeld),
          shootReleased: Boolean(data.shootReleased),
          tacklePressed: Boolean(data.tacklePressed),
          switchPressed: Boolean(data.switchPressed),
        },
        Number(data.seq ?? 0),
      );
    },
    () => {
      // Transient network error
    },
  );
}

export async function publishFirestoreRematch(
  roomCode: string,
  rematchCount: number,
  requestedBy: string,
): Promise<void> {
  const code = sanitizeRoomCode(roomCode);
  await setDoc(doc(db, 'rooms', code, 'live', 'rematch'), {
    rematchCount: Math.max(1, Math.min(100, Math.round(rematchCount))),
    requestedBy,
    updatedAt: serverTimestamp(),
  });
}

export function subscribeFirestoreRematch(
  roomCode: string,
  onRematch: (rematchCount: number) => void,
): () => void {
  const code = sanitizeRoomCode(roomCode);
  return onSnapshot(
    doc(db, 'rooms', code, 'live', 'rematch'),
    (snap) => {
      if (!snap.exists()) return;
      const count = Number(snap.data().rematchCount ?? 0);
      if (count >= 1) {
        onRematch(count);
      }
    },
    () => {
      // Transient network error
    },
  );
}
