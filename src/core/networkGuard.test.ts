import assert from 'node:assert/strict';
import test from 'node:test';
import { computeCrowdGainLevels, computeCrowdIntensity } from '../audio/crowdLogic';
import {
  buildPingUrl,
  evaluateOnlineStatus,
  probeNetworkConnection,
} from './networkGuard';

test('evaluateOnlineStatus blocks offline navigator or failed network probe', () => {
  assert.deepEqual(evaluateOnlineStatus(false, true), {
    online: false,
    reason: 'navigator_offline',
  });
  assert.deepEqual(evaluateOnlineStatus(true, false), {
    online: false,
    reason: 'network_error',
  });
  assert.deepEqual(evaluateOnlineStatus(true, true), {
    online: true,
    reason: 'ok',
  });
});

test('probeNetworkConnection returns online=true on 200 HEAD and online=false on fetch rejection', async () => {
  const okFetch = (async () => ({ ok: true }) as Response) as unknown as typeof fetch;
  const failFetch = (async () => {
    throw new TypeError('Failed to fetch');
  }) as unknown as typeof fetch;

  const okRes = await probeNetworkConnection(okFetch, 'http://localhost:3000/', true, 500);
  assert.equal(okRes.online, true);
  assert.equal(okRes.reason, 'ok');

  const offlineRes = await probeNetworkConnection(failFetch, 'http://localhost:3000/', true, 500);
  assert.equal(offlineRes.online, false);
  assert.equal(offlineRes.reason, 'network_error');

  const navOffRes = await probeNetworkConnection(okFetch, 'http://localhost:3000/', false, 500);
  assert.equal(navOffRes.online, false);
  assert.equal(navOffRes.reason, 'navigator_offline');

  assert.match(buildPingUrl('http://localhost:3000/', 12345), /_netcheck=12345/);
});

test('computeCrowdIntensity scales from offline silence through midfield to attacking danger and goals', () => {
  const offline = computeCrowdIntensity({
    shellState: 'playing',
    phase: 'live',
    ballX: 40,
    ballSpeed: 20,
    isReplaying: false,
    isOnline: false,
  });
  assert.equal(offline, 0);

  const midfield = computeCrowdIntensity({
    shellState: 'playing',
    phase: 'live',
    ballX: 0,
    ballSpeed: 4,
    isReplaying: false,
    isOnline: true,
  });
  const penaltyBox = computeCrowdIntensity({
    shellState: 'playing',
    phase: 'live',
    ballX: 46,
    ballSpeed: 18,
    isReplaying: false,
    isOnline: true,
  });
  const goal = computeCrowdIntensity({
    shellState: 'playing',
    phase: 'goal',
    ballX: 52,
    ballSpeed: 15,
    isReplaying: false,
    isOnline: true,
  });

  assert.ok(penaltyBox > midfield, `Expected penaltyBox (${penaltyBox}) > midfield (${midfield})`);
  assert.equal(goal, 1);

  const silentLevels = computeCrowdGainLevels(0);
  const loudLevels = computeCrowdGainLevels(1);
  assert.equal(silentLevels.murmurGain, 0);
  assert.ok(loudLevels.murmurGain > 0.08);
  assert.ok(loudLevels.chatterFreqHz > 950);
});
