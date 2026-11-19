import assert from 'node:assert/strict';
import test from 'node:test';
import { pickRandomRobotTeam, resolveUserVsRobotPairing } from './matchup';
import { TEAMS } from './teams';

test('resolveUserVsRobotPairing keeps distinct robot club and swaps on collision', () => {
  const distinct = resolveUserVsRobotPairing('valoria', 'nordic', TEAMS);
  assert.deepEqual(distinct, { homeTeamId: 'valoria', awayTeamId: 'nordic' });

  const collision = resolveUserVsRobotPairing('nordic', 'nordic', TEAMS);
  assert.equal(collision.homeTeamId, 'nordic');
  assert.notEqual(collision.awayTeamId, 'nordic');
});

test('pickRandomRobotTeam never selects the user club and changes opponent when possible', () => {
  for (let i = 0; i < 20; i++) {
    const picked = pickRandomRobotTeam('aurelia', 'nordic', TEAMS, () => (i % 7) / 7);
    assert.notEqual(picked, 'aurelia');
    assert.notEqual(picked, 'nordic');
  }
});
