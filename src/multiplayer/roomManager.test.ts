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
  it('creates a 5-character room code, joins player 2 with a distinct club, and starts an authoritative 1v1 match', () => {
    const manager = new OnlineRoomManager();
    const c1 = createMockClient('c1');
    const c2 = createMockClient('c2');
    manager.addClient(c1);
    manager.addClient(c2);

    manager.handleMessage('c1', {
      type: 'room:create',
      uid: 'uid_host',
      nickname: 'Mustapha',
      teamId: 'aurelia',
      formation: '4-3-3',
      halfDurationSeconds: 60,
    });

    const created = c1.lastOfType('room:state');
    assert.ok(created, 'Host should receive room:state');
    assert.match(created.room.roomCode, /^[A-Z0-9]{5}$/);
    assert.equal(created.yourSide, 'home');

    // Player 2 tries to join with the SAME club -> server must assign a distinct club automatically!
    manager.handleMessage('c2', {
      type: 'room:join',
      roomCode: created.room.roomCode,
      uid: 'uid_guest',
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
    assert.notEqual(homeSlot.teamId, awaySlot.teamId, 'Both players must receive distinct clubs');

    // Start match
    manager.handleMessage('c1', { type: 'room:start' });
    const start1 = c1.lastOfType('match:start');
    const start2 = c2.lastOfType('match:start');
    assert.ok(start1 && start2, 'Both clients should receive match:start');
    assert.equal(start1.yourSide, 'home');
    assert.equal(start2.yourSide, 'away');

    // Send real inputs from both players and advance authoritative simulation
    const beforeState = c1.lastOfType('match:state')!;
    const homeBefore = beforeState.snapshot.players.find((p) => p.id.startsWith('home_') && p.isControlled)!;
    const awayBefore = beforeState.snapshot.players.find((p) => p.id.startsWith('away_') && p.isControlled)!;

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

    assert.ok(homeAfter.x > homeBefore.x, 'Host controlled player should move forward from home input');
    assert.ok(awayAfter.x < awayBefore.x, 'Guest controlled player should move forward from away input');
    assert.ok(afterState.snapshot.tick >= 16, 'Authoritative server tick should advance');
  });

  it('rejects unknown room codes and handles mid-match disconnect + automatic reconnect + rematch', () => {
    const manager = new OnlineRoomManager();
    const c1 = createMockClient('c1');
    const c2 = createMockClient('c2');
    manager.addClient(c1);
    manager.addClient(c2);

    manager.handleMessage('c2', {
      type: 'room:join',
      roomCode: 'ZZZZZ',
      uid: 'uid_guest',
      nickname: 'Guest',
      teamId: 'nordic',
      formation: '4-3-3',
    });
    assert.ok(c2.lastOfType('room:error'), 'Joining non-existent room should emit room:error');

    manager.handleMessage('c1', {
      type: 'room:create',
      roomCode: 'A7K92',
      uid: 'uid_host',
      nickname: 'Host',
      teamId: 'aurelia',
      formation: '4-3-3',
      halfDurationSeconds: 60,
    });
    manager.handleMessage('c2', {
      type: 'room:join',
      roomCode: 'A7K92',
      uid: 'uid_guest',
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

    // Reconnect c2 on a new socket ID using the same Firebase UID
    const c2Reconnected = createMockClient('c2_new');
    manager.addClient(c2Reconnected);
    manager.handleMessage('c2_new', {
      type: 'room:reconnect',
      roomCode: 'A7K92',
      uid: 'uid_guest',
    });

    assert.ok(
      c2Reconnected.lastOfType('match:start'),
      'Reconnected player should resume active match immediately',
    );
    assert.ok(
      c1.lastOfType('opponent:reconnected'),
      'Host should be notified that opponent reconnected',
    );
  });
});
