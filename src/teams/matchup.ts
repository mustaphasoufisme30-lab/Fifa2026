import { TeamConfig } from '../core/types';

export interface MatchupPairing {
  homeTeamId: string;
  awayTeamId: string;
}

/**
 * Resolves a valid User (home) vs Robot AI (away) club pairing, guaranteeing
 * the Robot opponent is always a distinct club from the user's selection.
 */
export function resolveUserVsRobotPairing(
  selectedUserTeamId: string,
  currentRobotTeamId: string,
  allTeams: TeamConfig[],
): MatchupPairing {
  const userTeam = allTeams.find((t) => t.id === selectedUserTeamId) ?? allTeams[0];
  if (
    currentRobotTeamId !== userTeam.id &&
    allTeams.some((t) => t.id === currentRobotTeamId)
  ) {
    return {
      homeTeamId: userTeam.id,
      awayTeamId: currentRobotTeamId,
    };
  }

  const fallbackRobot = allTeams.find((t) => t.id !== userTeam.id) ?? userTeam;
  return {
    homeTeamId: userTeam.id,
    awayTeamId: fallbackRobot.id,
  };
}

/**
 * Picks a random Robot (AI) opponent club different from the user's club
 * (and different from the current opponent when alternatives exist).
 */
export function pickRandomRobotTeam(
  userTeamId: string,
  currentRobotTeamId: string,
  allTeams: TeamConfig[],
  rng: () => number = Math.random,
): string {
  const candidates = allTeams.filter(
    (t) => t.id !== userTeamId && t.id !== currentRobotTeamId,
  );
  const pool =
    candidates.length > 0
      ? candidates
      : allTeams.filter((t) => t.id !== userTeamId);
  if (pool.length === 0) return userTeamId;
  const idx = Math.floor(rng() * pool.length);
  return pool[Math.min(pool.length - 1, Math.max(0, idx))].id;
}
