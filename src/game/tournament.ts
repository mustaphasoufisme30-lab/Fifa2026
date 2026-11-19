import {
  TeamConfig,
  TournamentMatch,
  TournamentRound,
  TournamentState,
} from '../core/types';

export const TOURNAMENT_ROUNDS: TournamentRound[] = [
  'quarterfinal',
  'semifinal',
  'final',
];

export function getRoundLabel(round: TournamentRound): string {
  if (round === 'quarterfinal') return 'Quarter-Final';
  if (round === 'semifinal') return 'Semi-Final';
  return 'Championship Final';
}

export function getRoundPluralLabel(round: TournamentRound): string {
  if (round === 'quarterfinal') return 'Quarter-Finals';
  if (round === 'semifinal') return 'Semi-Finals';
  return 'Final';
}

function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function shuffleWithRng<T>(items: T[], rng: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function createTournament(
  userTeamId: string,
  allTeams: TeamConfig[],
  seed?: number,
): TournamentState {
  const rng = seed !== undefined ? seededRandom(seed) : Math.random;
  const userTeam = allTeams.find((t) => t.id === userTeamId) ?? allTeams[0];
  const others = shuffleWithRng(
    allTeams.filter((t) => t.id !== userTeam.id),
    rng,
  ).slice(0, 7);

  // Build 4 Quarter-Finals (user anchored in qf_0 as home)
  const qfPairs: Array<[string, string]> = [
    [userTeam.id, others[0].id],
    [others[1].id, others[2].id],
    [others[3].id, others[4].id],
    [others[5].id, others[6].id],
  ];

  const qfMatches: TournamentMatch[] = qfPairs.map(([homeId, awayId], idx) => ({
    id: `qf_${idx}`,
    round: 'quarterfinal',
    slotIndex: idx,
    homeTeamId: homeId,
    awayTeamId: awayId,
    homeScore: null,
    awayScore: null,
    homePenalties: null,
    awayPenalties: null,
    winnerTeamId: null,
    status: 'ready',
    isUserMatch: homeId === userTeam.id || awayId === userTeam.id,
  }));

  const sfMatches: TournamentMatch[] = [0, 1].map((idx) => ({
    id: `sf_${idx}`,
    round: 'semifinal',
    slotIndex: idx,
    homeTeamId: null,
    awayTeamId: null,
    homeScore: null,
    awayScore: null,
    homePenalties: null,
    awayPenalties: null,
    winnerTeamId: null,
    status: 'pending',
    isUserMatch: false,
  }));

  const finalMatch: TournamentMatch = {
    id: 'final',
    round: 'final',
    slotIndex: 0,
    homeTeamId: null,
    awayTeamId: null,
    homeScore: null,
    awayScore: null,
    homePenalties: null,
    awayPenalties: null,
    winnerTeamId: null,
    status: 'pending',
    isUserMatch: false,
  };

  return {
    id: `cup_${seed ?? Date.now()}`,
    name: 'FiFA 2026 Knockout Cup',
    userTeamId: userTeam.id,
    currentRound: 'quarterfinal',
    status: 'active',
    matches: [...qfMatches, ...sfMatches, finalMatch],
    championTeamId: null,
    eliminatedRound: null,
  };
}

export function getMatchesByRound(
  state: TournamentState,
  round: TournamentRound,
): TournamentMatch[] {
  return state.matches
    .filter((m) => m.round === round)
    .sort((a, b) => a.slotIndex - b.slotIndex);
}

export function getUserActiveMatch(state: TournamentState): TournamentMatch | null {
  if (state.status !== 'active') return null;
  return (
    state.matches.find((m) => m.isUserMatch && m.status === 'ready') ?? null
  );
}

export function hasTournamentStarted(state: TournamentState): boolean {
  return state.matches.some((m) => m.status === 'completed');
}

export interface KnockoutOutcome {
  homeScore: number;
  awayScore: number;
  homePenalties: number | null;
  awayPenalties: number | null;
  winnerTeamId: string;
}

/**
 * Guarantees a knockout winner; resolves ties with a realistic penalty shootout score.
 */
export function resolveKnockoutResult(
  homeTeamId: string,
  awayTeamId: string,
  homeScore: number,
  awayScore: number,
  rng: () => number = Math.random,
): KnockoutOutcome {
  if (homeScore > awayScore) {
    return {
      homeScore,
      awayScore,
      homePenalties: null,
      awayPenalties: null,
      winnerTeamId: homeTeamId,
    };
  }
  if (awayScore > homeScore) {
    return {
      homeScore,
      awayScore,
      homePenalties: null,
      awayPenalties: null,
      winnerTeamId: awayTeamId,
    };
  }

  // Tied at full-time -> penalty shootout tiebreaker
  const homeWinsShootout = rng() < 0.52;
  const baseWinnerPens = 4 + Math.floor(rng() * 3); // 4, 5, or 6
  const loserPens = Math.max(2, baseWinnerPens - (rng() < 0.72 ? 1 : 2));
  return {
    homeScore,
    awayScore,
    homePenalties: homeWinsShootout ? baseWinnerPens : loserPens,
    awayPenalties: homeWinsShootout ? loserPens : baseWinnerPens,
    winnerTeamId: homeWinsShootout ? homeTeamId : awayTeamId,
  };
}

function teamOverall(team: TeamConfig): number {
  return (team.rating.attack + team.rating.midfield + team.rating.defense) / 3;
}

export function simulateAiMatchScore(
  home: TeamConfig,
  away: TeamConfig,
  rng: () => number = Math.random,
): KnockoutOutcome {
  const diff = (teamOverall(home) - teamOverall(away)) * 0.04;
  const homeExpected = Math.max(0.4, 1.35 + diff);
  const awayExpected = Math.max(0.4, 1.25 - diff);

  const sampleGoals = (expected: number): number => {
    let goals = 0;
    for (let i = 0; i < 5; i++) {
      if (rng() < expected / 5) goals += 1;
    }
    return goals;
  };

  const homeScore = sampleGoals(homeExpected);
  const awayScore = sampleGoals(awayExpected);
  return resolveKnockoutResult(home.id, away.id, homeScore, awayScore, rng);
}

function populateNextRoundMatches(
  matches: TournamentMatch[],
  completedRound: TournamentRound,
  userTeamId: string,
): TournamentMatch[] {
  if (completedRound === 'quarterfinal') {
    const qfs = matches.filter((m) => m.round === 'quarterfinal');
    return matches.map((m) => {
      if (m.round !== 'semifinal') return m;
      const feederA = qfs.find((q) => q.slotIndex === m.slotIndex * 2);
      const feederB = qfs.find((q) => q.slotIndex === m.slotIndex * 2 + 1);
      const homeTeamId = feederA?.winnerTeamId ?? null;
      const awayTeamId = feederB?.winnerTeamId ?? null;
      const ready = homeTeamId !== null && awayTeamId !== null;
      return {
        ...m,
        homeTeamId,
        awayTeamId,
        status: ready ? 'ready' : 'pending',
        isUserMatch: homeTeamId === userTeamId || awayTeamId === userTeamId,
      };
    });
  }

  if (completedRound === 'semifinal') {
    const sfs = matches.filter((m) => m.round === 'semifinal');
    return matches.map((m) => {
      if (m.round !== 'final') return m;
      const homeTeamId = sfs.find((s) => s.slotIndex === 0)?.winnerTeamId ?? null;
      const awayTeamId = sfs.find((s) => s.slotIndex === 1)?.winnerTeamId ?? null;
      const ready = homeTeamId !== null && awayTeamId !== null;
      return {
        ...m,
        homeTeamId,
        awayTeamId,
        status: ready ? 'ready' : 'pending',
        isUserMatch: homeTeamId === userTeamId || awayTeamId === userTeamId,
      };
    });
  }

  return matches;
}

function getTeamLookup(allTeams: TeamConfig[], id: string): TeamConfig {
  return allTeams.find((t) => t.id === id) ?? allTeams[0];
}

function simulateRemainingAiRounds(
  matches: TournamentMatch[],
  fromRound: TournamentRound,
  userTeamId: string,
  allTeams: TeamConfig[],
  rng: () => number,
): { matches: TournamentMatch[]; championTeamId: string | null } {
  let nextMatches = matches;
  const startIdx = TOURNAMENT_ROUNDS.indexOf(fromRound);

  for (let r = startIdx; r < TOURNAMENT_ROUNDS.length; r++) {
    const round = TOURNAMENT_ROUNDS[r];
    nextMatches = nextMatches.map((m) => {
      if (m.round !== round || m.status === 'completed') return m;
      if (!m.homeTeamId || !m.awayTeamId) return m;
      const res = simulateAiMatchScore(
        getTeamLookup(allTeams, m.homeTeamId),
        getTeamLookup(allTeams, m.awayTeamId),
        rng,
      );
      return {
        ...m,
        ...res,
        status: 'completed',
      };
    });
    nextMatches = populateNextRoundMatches(nextMatches, round, userTeamId);
  }

  const finalMatch = nextMatches.find((m) => m.round === 'final');
  return {
    matches: nextMatches,
    championTeamId: finalMatch?.winnerTeamId ?? null,
  };
}

/**
 * Records the user's completed knockout match, simulates the rest of the round,
 * advances winners to the next round, and resolves champion/eliminated status.
 */
export function recordUserTournamentMatchResult(
  state: TournamentState,
  matchId: string,
  homeScore: number,
  awayScore: number,
  allTeams: TeamConfig[],
  rng: () => number = Math.random,
): TournamentState {
  const target = state.matches.find((m) => m.id === matchId);
  if (!target || !target.homeTeamId || !target.awayTeamId || target.status === 'completed') {
    return state;
  }

  const userOutcome = resolveKnockoutResult(
    target.homeTeamId,
    target.awayTeamId,
    homeScore,
    awayScore,
    rng,
  );

  // 1. Complete user match + simulate all other matches in the same round
  let nextMatches: TournamentMatch[] = state.matches.map((m) => {
    if (m.id === matchId) {
      return {
        ...m,
        ...userOutcome,
        status: 'completed',
      };
    }
    if (m.round === target.round && m.status !== 'completed' && m.homeTeamId && m.awayTeamId) {
      const aiOutcome = simulateAiMatchScore(
        getTeamLookup(allTeams, m.homeTeamId),
        getTeamLookup(allTeams, m.awayTeamId),
        rng,
      );
      return {
        ...m,
        ...aiOutcome,
        status: 'completed',
      };
    }
    return m;
  });

  // 2. Populate next round slots
  nextMatches = populateNextRoundMatches(nextMatches, target.round, state.userTeamId);

  const userWon = userOutcome.winnerTeamId === state.userTeamId;

  // 3. Final completed
  if (target.round === 'final') {
    return {
      ...state,
      currentRound: 'final',
      status: userWon ? 'champion' : 'eliminated',
      matches: nextMatches,
      championTeamId: userOutcome.winnerTeamId,
      eliminatedRound: userWon ? null : 'final',
    };
  }

  const nextRound: TournamentRound =
    target.round === 'quarterfinal' ? 'semifinal' : 'final';

  // 4. User eliminated before final -> simulate remainder of bracket to crown cup winner
  if (!userWon) {
    const resolved = simulateRemainingAiRounds(
      nextMatches,
      nextRound,
      state.userTeamId,
      allTeams,
      rng,
    );
    return {
      ...state,
      currentRound: 'final',
      status: 'eliminated',
      matches: resolved.matches,
      championTeamId: resolved.championTeamId,
      eliminatedRound: target.round,
    };
  }

  // 5. User advances to next round
  return {
    ...state,
    currentRound: nextRound,
    status: 'active',
    matches: nextMatches,
    championTeamId: null,
    eliminatedRound: null,
  };
}

/**
 * Convenience helper to simulate the user's current knockout match directly from the bracket.
 */
export function simulateUserTournamentMatch(
  state: TournamentState,
  allTeams: TeamConfig[],
  rng: () => number = Math.random,
): TournamentState {
  const active = getUserActiveMatch(state);
  if (!active || !active.homeTeamId || !active.awayTeamId) return state;

  const outcome = simulateAiMatchScore(
    getTeamLookup(allTeams, active.homeTeamId),
    getTeamLookup(allTeams, active.awayTeamId),
    rng,
  );
  return recordUserTournamentMatchResult(
    state,
    active.id,
    outcome.homeScore,
    outcome.awayScore,
    allTeams,
    rng,
  );
}
