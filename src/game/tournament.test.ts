import test from 'node:test';
import assert from 'node:assert/strict';
import { TEAMS } from '../teams/teams';
import {
  createTournament,
  getMatchesByRound,
  getUserActiveMatch,
  recordUserTournamentMatchResult,
  resolveKnockoutResult,
  simulateUserTournamentMatch,
} from './tournament';

test('createTournament builds an 8-team knockout bracket with 4 QF, 2 SF, and 1 Final', () => {
  const cup = createTournament('aurelia', TEAMS, 42);
  assert.equal(cup.status, 'active');
  assert.equal(cup.currentRound, 'quarterfinal');
  assert.equal(cup.matches.length, 7);

  const qfs = getMatchesByRound(cup, 'quarterfinal');
  const sfs = getMatchesByRound(cup, 'semifinal');
  const finals = getMatchesByRound(cup, 'final');

  assert.equal(qfs.length, 4);
  assert.equal(sfs.length, 2);
  assert.equal(finals.length, 1);

  const uniqueTeams = new Set(qfs.flatMap((m) => [m.homeTeamId, m.awayTeamId]));
  assert.equal(uniqueTeams.size, 8);
  assert.ok(uniqueTeams.has('aurelia'));

  const userMatch = getUserActiveMatch(cup);
  assert.ok(userMatch);
  assert.equal(userMatch.id, 'qf_0');
  assert.equal(userMatch.homeTeamId, 'aurelia');
  assert.equal(userMatch.status, 'ready');
});

test('winning QF -> SF -> Final sequentially advances and crowns user champion', () => {
  let cup = createTournament('aurelia', TEAMS, 101);
  const fixedRng = () => 0.3;

  // Quarter-Final win
  const qf = getUserActiveMatch(cup)!;
  cup = recordUserTournamentMatchResult(cup, qf.id, 2, 0, TEAMS, fixedRng);
  assert.equal(cup.status, 'active');
  assert.equal(cup.currentRound, 'semifinal');
  assert.ok(getMatchesByRound(cup, 'quarterfinal').every((m) => m.status === 'completed'));

  const sf = getUserActiveMatch(cup)!;
  assert.equal(sf.round, 'semifinal');
  assert.equal(sf.homeTeamId, 'aurelia');
  assert.ok(sf.awayTeamId !== null);

  // Semi-Final win
  cup = recordUserTournamentMatchResult(cup, sf.id, 3, 1, TEAMS, fixedRng);
  assert.equal(cup.status, 'active');
  assert.equal(cup.currentRound, 'final');

  const finalMatch = getUserActiveMatch(cup)!;
  assert.equal(finalMatch.round, 'final');
  assert.equal(finalMatch.homeTeamId, 'aurelia');

  // Final win
  cup = recordUserTournamentMatchResult(cup, finalMatch.id, 1, 0, TEAMS, fixedRng);
  assert.equal(cup.status, 'champion');
  assert.equal(cup.championTeamId, 'aurelia');
  assert.equal(cup.eliminatedRound, null);
  assert.equal(getUserActiveMatch(cup), null);
});

test('tied knockout match resolves via penalty shootout so a winner always advances', () => {
  const outcome = resolveKnockoutResult('aurelia', 'nordic', 1, 1, () => 0.25);
  assert.equal(outcome.homeScore, 1);
  assert.equal(outcome.awayScore, 1);
  assert.ok(outcome.homePenalties !== null && outcome.awayPenalties !== null);
  assert.notEqual(outcome.homePenalties, outcome.awayPenalties);
  assert.equal(outcome.winnerTeamId, 'aurelia');
});

test('losing in Quarter-Final eliminates user and simulates remaining bracket to crown an AI champion', () => {
  let cup = createTournament('aurelia', TEAMS, 77);
  const qf = getUserActiveMatch(cup)!;

  cup = recordUserTournamentMatchResult(cup, qf.id, 0, 2, TEAMS, () => 0.4);
  assert.equal(cup.status, 'eliminated');
  assert.equal(cup.eliminatedRound, 'quarterfinal');
  assert.ok(cup.championTeamId !== null);
  assert.notEqual(cup.championTeamId, 'aurelia');
  assert.ok(cup.matches.every((m) => m.status === 'completed'));
});

test('simulateUserTournamentMatch progresses a full cup to completion', () => {
  let cup = createTournament('nordic', TEAMS, 55);
  let steps = 0;
  while (cup.status === 'active' && steps < 5) {
    cup = simulateUserTournamentMatch(cup, TEAMS, () => 0.2);
    steps += 1;
  }
  assert.ok(cup.status === 'champion' || cup.status === 'eliminated');
  assert.ok(cup.championTeamId !== null);
  assert.ok(steps >= 1 && steps <= 3);
});
