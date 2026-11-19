import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ServerToClientMessage } from './protocol';
import { createNeutralInput, OnlineRoomManager } from './roomManager';

function createMockClient(id: string) {
  const received: ServerToClientMessage[] = [];
  return {
    id,
    received,
    send(msg: ServerToClientMessage) {
      received.push(msg);
    },
    lastOfType<T extends ServerToClientMessage['type']>(type: T) {
      for (let i = received.length - 1; i >= 0; i--) {
        if (received[i].type === type) {
          return received[i] as Extract<ServerToClientMessage, { type: T }>;
        }
      }
      return undefined;
    },
  };
}

describe('OnlineRoomManager authoritative 1v1 multiplayer', () => {
  it('blocks unauthenticated commands and rejects spoofed uid claims', () => {
    const manager = new OnlineRoomManager();
    const unauth = createMockClient('c_unauth');
    manager.addClient(unauth);

    manager.handleMessage('c_unauth', {
      type: 'room:create',
      uid: 'spoofed_uid',
      nickname: 'Intruder',
      teamId: 'aurelia',
      formation: '4-3-3',
    });
    assert.ok(unauth.lastOfType('auth:error'), 'room:create without verified token must fail');
    assert.equal(unauth.lastOfType('room:state'), undefined);

    manager.handleMessage('c_unauth', {
      type: 'room:join',
      roomCode: 'A7K92',
      uid: 'spoofed_uid',
      nickname: 'Intruder',
      teamId: 'nordic',
      formation: '4-3-3',
    });
    assert.equal(
      unauth.received.filter((m) => m.type === 'auth:error').length,
      2,
      'room:join without verified token must fail',
    );

    manager.handleMessage('c_unauth', {
      type: 'room:reconnect',
      roomCode: 'A7K92',
      uid: 'spoofed_uid',
    });
    assert.equal(
      unauth.received.filter((m) => m.type === 'auth:error').length,
      3,
      'room:reconnect without verified token must fail',
    );

    manager.handleMessage('c_unauth', {
      type: 'match:input',
      input: { ...createNeutralInput(), moveX: 1 },
    });
    assert.equal(
      unauth.received.filter((m) => m.type === 'auth:error').length,
      4,
      'match:input without verified token must fail',
    );

    // Authenticate with real Firebase UID, then attempt spoofing a different UID
    assert.equal(manager.authenticateClient('c_unauth', 'uid_real_user'), true);
    manager.handleMessage('c_unauth', {
      type: 'room:create',
      uid: 'uid_someone_else',
      nickname: 'Spoofer',
      teamId: 'aurelia',
      formation: '4-3-3',
    });
    assert.equal(
      unauth.received.filter((m) => m.type === 'auth:error').length,
      5,
      'Mismatched payload uid vs verified token uid must be rejected',
    );
  });

  it('creates a 5-character room code, joins player 2 with a distinct club, and starts an authoritative 1v1 match', () => {
    const manager = new OnlineRoomManager();
    const c1 = createMockClient('c1');
    const c2 = createMockClient('c2');
    manager.addClient(c1);
    manager.addClient(c2);
    manager.authenticateClient('c1', 'uid_host');
    manager.authenticateClient('c2', 'uid_guest');

    manager.handleMessage('c1', {
      type: 'room:create',
      nickname: 'Mustapha',
      teamId: 'aurelia',
      formation: '4-3-3',
      halfDurationSeconds: 60,
    });

    const created = c1.lastOfType('room:state');
    assert.ok(created, 'Host should receive room:state');
    assert.match(created.room.roomCode, /^[A-Z0-9]{5}$/);
    assert.equal(created.yourSide, 'home');
    assert.equal(created.room.players[0].uid, 'uid_host');
    assert.equal(created.room.matchNumber, 0);

    // Player 2 tries to join with the SAME club -> server must assign a distinct club automatically!
    manager.handleMessage('c2', {
      type: 'room:join',
      roomCode: created.room.roomCode,
      nickname: 'Karim',
      teamId: 'aurelia',
      formation: '4-4-2',
    });

    const joined = c2.lastOfType('room:state');
    assert.ok(joined, 'Guest should receive room:state');
    assert.equal(joined.yourSide, 'away');
    assert.equal(joined.room.players.length, 2);
    const homeSlot = joined.room.players.find((p) => p.side === 'home')!;
    const awaySlot = joined.room.players.find((p) => p.side === 'away')!;
    assert.equal(awaySlot.uid, 'uid_guest');
    assert.notEqual(homeSlot.teamId, awaySlot.teamId, 'Both players must receive distinct clubs');

    // Start match
    manager.handleMessage('c1', { type: 'room:start' });
    const start1 = c1.lastOfType('match:start');
    const start2 = c2.lastOfType('match:start');
    assert.ok(start1 && start2, 'Both clients should receive match:start');
    assert.equal(start1.yourSide, 'home');
    assert.equal(start2.yourSide, 'away');
    assert.equal(start1.room.matchNumber, 1);

    // Send real inputs from both players and advance authoritative simulation
    const beforeState = c1.lastOfType('match:state')!;
    const homeBefore = beforeState.snapshot.players.find(
      (p) => p.id.startsWith('home_') && p.isControlled,
    )!;
    const awayBefore = beforeState.snapshot.players.find(
      (p) => p.id.startsWith('away_') && p.isControlled,
    )!;

    manager.handleMessage('c1', {
      type: 'match:input',
      input: { ...createNeutralInput(), moveX: 1, sprint: true },
    });
    manager.handleMessage('c2', {
      type: 'match:input',
      input: { ...createNeutralInput(), moveX: -1, sprint: true },
    });

    for (let i = 0; i < 16; i++) {
      manager.stepAllMatches(1 / 30);
    }

    const afterState = c2.lastOfType('match:state')!;
    const homeAfter = afterState.snapshot.players.find((p) => p.id === homeBefore.id)!;
    const awayAfter = afterState.snapshot.players.find((p) => p.id === awayBefore.id)!;

    assert.ok(
      homeAfter.x > homeBefore.x,
      'Host controlled player should move forward from home input',
    );
    assert.ok(
      awayAfter.x < awayBefore.x,
      'Guest controlled player should move forward from away input',
    );
    assert.ok(afterState.snapshot.tick >= 16, 'Authoritative server tick should advance');
  });

  it('rejects unknown room codes and handles mid-match disconnect + automatic reconnect + rematch', () => {
    const manager = new OnlineRoomManager();
    const c1 = createMockClient('c1');
    const c2 = createMockClient('c2');
    manager.addClient(c1);
    manager.addClient(c2);
    manager.authenticateClient('c1', 'uid_host');
    manager.authenticateClient('c2', 'uid_guest');

    manager.handleMessage('c2', {
      type: 'room:join',
      roomCode: 'ZZZZZ',
      nickname: 'Guest',
      teamId: 'nordic',
      formation: '4-3-3',
    });
    assert.ok(c2.lastOfType('room:error'), 'Joining non-existent room should emit room:error');

    manager.handleMessage('c1', {
      type: 'room:create',
      roomCode: 'A7K92',
      nickname: 'Host',
      teamId: 'aurelia',
      formation: '4-3-3',
      halfDurationSeconds: 60,
    });
    manager.handleMessage('c2', {
      type: 'room:join',
      roomCode: 'A7K92',
      nickname: 'Guest',
      teamId: 'nordic',
      formation: '4-3-3',
    });
    manager.handleMessage('c1', { type: 'room:start' });

    // Disconnect c2 mid-match
    manager.removeClient('c2');
    assert.ok(
      c1.lastOfType('opponent:disconnected'),
      'Remaining player should be notified of opponent disconnect',
    );

    // Reconnect c2 on a new socket ID authenticated with the same Firebase UID
    const c2Reconnected = createMockClient('c2_new');
    manager.addClient(c2Reconnected);
    manager.authenticateClient('c2_new', 'uid_guest');
    manager.handleMessage('c2_new', {
      type: 'room:reconnect',
      roomCode: 'A7K92',
    });

    assert.ok(
      c2Reconnected.lastOfType('match:start'),
      'Reconnected player should resume active match immediately',
    );
    assert.ok(
      c1.lastOfType('opponent:reconnected'),
      'Host should be notified that opponent reconnected',
    );

    // Advance full 2-half match (2 * 60s = 120s) until match:finished, then verify rematch increments matchNumber
    for (let i = 0; i < 4200 && !c1.lastOfType('match:finished'); i++) {
      manager.stepAllMatches(1 / 30);
    }
    const finished = c1.lastOfType('match:finished');
    assert.ok(finished, 'Authoritative match should finish when full time expires');
    assert.equal(finished.room.matchNumber, 1);

    manager.handleMessage('c1', { type: 'match:rematch' });
    const rematchStart = c1.lastOfType('match:start');
    assert.ok(rematchStart, 'Rematch should emit a new match:start');
    assert.equal(
      rematchStart.room.matchNumber,
      2,
      'Rematch must increment matchNumber to 2 so Firestore terminal lock is never violated',
    );
  });

  it('hydrates a waiting room across server instances from verified Firestore bootstrap data and blocks outsiders', () => {
    const freshServer = new OnlineRoomManager();
    const hostClient = createMockClient('c_host_b');
    const guestClient = createMockClient('c_guest_b');
    const outsiderClient = createMockClient('c_outsider');

    freshServer.addClient(hostClient);
    freshServer.addClient(guestClient);
    freshServer.addClient(outsiderClient);
    freshServer.authenticateClient('c_host_b', 'uid_host');
    freshServer.authenticateClient('c_guest_b', 'uid_guest');
    freshServer.authenticateClient('c_outsider', 'uid_stranger');

    const bootstrap = {
      hostUid: 'uid_host',
      hostName: 'Mustapha',
      hostTeamId: 'aurelia',
      hostFormation: '4-3-3' as const,
      guestUid: 'uid_guest',
      guestName: 'Karim',
      guestTeamId: 'nordic',
      guestFormation: '4-4-2' as const,
      halfDurationSeconds: 120,
    };

    // Outsider trying to hydrate someone else's room must be rejected
    freshServer.handleMessage('c_outsider', {
      type: 'room:join',
      roomCode: 'B9M44',
      nickname: 'Stranger',
      teamId: 'valoria',
      formation: '4-3-3',
      bootstrap,
    });
    assert.ok(outsiderClient.lastOfType('room:error'), 'Outsider cannot hydrate a room');

    // Guest arrives on fresh instance -> hydrates waiting room cleanly
    freshServer.handleMessage('c_guest_b', {
      type: 'room:join',
      roomCode: 'B9M44',
      nickname: 'Karim',
      teamId: 'nordic',
      formation: '4-4-2',
      bootstrap,
    });
    const guestState = guestClient.lastOfType('room:state');
    assert.ok(guestState, 'Guest should hydrate room on fresh server instance');
    assert.equal(guestState.yourSide, 'away');
    assert.equal(guestState.room.players.length, 2);

    // Cannot start until host reconnects on the same instance
    freshServer.handleMessage('c_guest_b', { type: 'room:start' });
    assert.ok(
      guestClient.lastOfType('room:error'),
      'Match must not start while host socket is still disconnected',
    );

    // Host reconnects -> both sockets live -> match starts cleanly
    freshServer.handleMessage('c_host_b', {
      type: 'room:reconnect',
      roomCode: 'B9M44',
      bootstrap,
    });
    freshServer.handleMessage('c_host_b', { type: 'room:start' });
    assert.ok(hostClient.lastOfType('match:start'), 'Host should start hydrated match');
    assert.ok(guestClient.lastOfType('match:start'), 'Guest should receive match:start');
  });
});
