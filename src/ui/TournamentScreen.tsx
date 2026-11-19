import { ArrowLeft, FastForward, Play, RotateCcw, Trophy } from 'lucide-react';
import {
  TournamentMatch,
  TournamentRound,
  TournamentState,
} from '../core/types';
import {
  getMatchesByRound,
  getRoundLabel,
  getRoundPluralLabel,
  getUserActiveMatch,
  hasTournamentStarted,
  TOURNAMENT_ROUNDS,
} from '../game/tournament';
import { getTeamById, TEAMS } from '../teams/teams';

interface TournamentScreenProps {
  tournament: TournamentState;
  trophiesWon: number;
  onSelectClub: (teamId: string) => void;
  onPlayMatch: (match: TournamentMatch) => void;
  onSimulateMatch: () => void;
  onNewTournament: (teamId: string) => void;
  onBackToTitle: () => void;
}

interface MatchCardProps {
  match: TournamentMatch;
  userTeamId: string;
  label: string;
  isFinal?: boolean;
}

function BracketMatchCard({ match, userTeamId, label, isFinal = false }: MatchCardProps) {
  const home = match.homeTeamId ? getTeamById(match.homeTeamId) : null;
  const away = match.awayTeamId ? getTeamById(match.awayTeamId) : null;
  const isNextUser = match.isUserMatch && match.status === 'ready';
  const hasPens = match.homePenalties !== null && match.awayPenalties !== null;

  const renderRow = (
    team: ReturnType<typeof getTeamById> | null,
    score: number | null,
    pens: number | null,
    isWinner: boolean,
    isLoser: boolean,
  ) => {
    const isUser = team?.id === userTeamId;
    return (
      <div
        className={`flex items-center justify-between gap-2 px-3 py-2 text-sm ${
          isUser
            ? 'bg-emerald-500/12 border-l-2 border-emerald-400'
            : 'border-l-2 border-transparent'
        } ${isLoser ? 'opacity-50' : ''}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-2.5 h-2.5 rounded-xs shrink-0"
            style={{ backgroundColor: team ? team.kit.primary : '#334155' }}
          />
          <span
            className={`truncate ${
              isWinner || isUser
                ? 'font-bold text-white'
                : team
                  ? 'font-medium text-slate-200'
                  : 'italic text-slate-500'
            }`}
          >
            {team ? team.name : 'TBD'}
          </span>
        </div>
        <div className="font-display font-bold text-base tabular-nums shrink-0 flex items-center gap-1">
          {score !== null ? (
            <>
              <span className={isWinner ? 'text-emerald-400' : 'text-slate-300'}>
                {score}
              </span>
              {hasPens && pens !== null && (
                <span className="text-[11px] font-sans font-semibold text-amber-300">
                  ({pens})
                </span>
              )}
            </>
          ) : (
            <span className="text-slate-600">–</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      data-testid={`bracket-match-${match.id}`}
      className={`rounded-lg overflow-hidden border shadow-lg transition-colors ${
        isNextUser
          ? 'bg-[#10243d]/95 border-emerald-400 ring-1 ring-emerald-400/40'
          : isFinal
            ? 'bg-[#121f34]/95 border-amber-400/50'
            : 'bg-[#0b1626]/92 border-white/12'
      }`}
    >
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#07101c]/90 border-b border-white/10 text-[11px] font-bold uppercase tracking-wider">
        <span className={isFinal ? 'text-amber-400' : 'text-slate-400'}>{label}</span>
        {isNextUser ? (
          <span className="text-emerald-400">Next Match</span>
        ) : match.status === 'completed' ? (
          <span className="text-slate-400">{hasPens ? 'FT · PENS' : 'FT'}</span>
        ) : match.status === 'ready' ? (
          <span className="text-sky-400">Scheduled</span>
        ) : (
          <span className="text-slate-600">Pending</span>
        )}
      </div>
      <div className="divide-y divide-white/8">
        {renderRow(
          home,
          match.homeScore,
          match.homePenalties,
          match.status === 'completed' && match.winnerTeamId === match.homeTeamId,
          match.status === 'completed' && match.winnerTeamId !== match.homeTeamId,
        )}
        {renderRow(
          away,
          match.awayScore,
          match.awayPenalties,
          match.status === 'completed' && match.winnerTeamId === match.awayTeamId,
          match.status === 'completed' && match.winnerTeamId !== match.awayTeamId,
        )}
      </div>
    </div>
  );
}

export function TournamentScreen({
  tournament,
  trophiesWon,
  onSelectClub,
  onPlayMatch,
  onSimulateMatch,
  onNewTournament,
  onBackToTitle,
}: TournamentScreenProps) {
  const activeMatch = getUserActiveMatch(tournament);
  const started = hasTournamentStarted(tournament);
  const qfMatches = getMatchesByRound(tournament, 'quarterfinal');
  const sfMatches = getMatchesByRound(tournament, 'semifinal');
  const finalMatch = getMatchesByRound(tournament, 'final')[0];

  const userTeam = getTeamById(tournament.userTeamId);
  const championTeam = tournament.championTeamId
    ? getTeamById(tournament.championTeamId)
    : null;
  const activeHome = activeMatch?.homeTeamId ? getTeamById(activeMatch.homeTeamId) : null;
  const activeAway = activeMatch?.awayTeamId ? getTeamById(activeMatch.awayTeamId) : null;

  const roundIndex = (r: TournamentRound) => TOURNAMENT_ROUNDS.indexOf(r);
  const curIdx = roundIndex(tournament.currentRound);

  return (
    <div
      data-testid="tournament-screen"
      className="fixed inset-0 z-20 flex flex-col bg-[#060d17]/88 overflow-hidden"
    >
      {/* Header Bar */}
      <header className="shrink-0 border-b border-white/10 bg-[#081220]/95 px-3.5 py-2.5 sm:px-8 sm:py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <button
              type="button"
              aria-label="Back to Menu"
              onClick={onBackToTitle}
              className="h-9 px-2.5 sm:px-3 rounded-md bg-white/5 hover:bg-white/10 border border-white/15 text-slate-200 text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Menu</span>
            </button>
            <div className="min-w-0">
              <h1 className="font-display font-extrabold text-lg sm:text-3xl text-white tracking-wide uppercase leading-none flex items-center gap-1.5 sm:gap-2 truncate">
                <Trophy className="w-5 h-5 sm:w-6 sm:h-6 text-amber-400 shrink-0" />
                <span className="truncate">{tournament.name}</span>
              </h1>
              <div className="text-[11px] sm:text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span>8-Club Knockout</span>
                <span aria-hidden="true">·</span>
                <span className="text-amber-300 font-semibold tabular-nums">
                  Cups Won: {trophiesWon}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNewTournament(tournament.userTeamId)}
            className="h-9 px-2.5 sm:px-3.5 rounded-md bg-[#122238] hover:bg-[#1a3150] border border-white/15 text-slate-100 text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5 shrink-0" />
            <span>New Cup</span>
          </button>
        </div>
      </header>

      {/* Main Scrollable Bracket Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-6xl w-full mx-auto px-4 py-4 sm:px-8 sm:py-6 space-y-5">
        {/* Round Progression Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-white/10 text-xs sm:text-sm">
          <div className="flex items-center gap-2 sm:gap-4">
            {TOURNAMENT_ROUNDS.map((r, idx) => {
              const isCurrent = tournament.status === 'active' && idx === curIdx;
              const isDone =
                tournament.status !== 'active' || idx < curIdx;
              return (
                <div key={r} className="flex items-center gap-2">
                  <span
                    className={`font-display font-bold uppercase tracking-wider ${
                      isCurrent
                        ? 'text-emerald-400'
                        : isDone
                          ? 'text-slate-200'
                          : 'text-slate-500'
                    }`}
                  >
                    {idx + 1}. {getRoundPluralLabel(r)}
                  </span>
                  {idx < TOURNAMENT_ROUNDS.length - 1 && (
                    <span className="text-slate-600" aria-hidden="true">
                      →
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="text-xs text-slate-300">
            Your Club:{' '}
            <span className="font-bold text-white">{userTeam.name}</span>
          </div>
        </div>

        {/* Pre-Cup Club Selector (available before Match 1 is played) */}
        {!started && tournament.status === 'active' && (
          <section aria-label="Choose tournament club">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Select Your Club for the Knockout Cup
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
              {TEAMS.map((t) => {
                const selected = t.id === tournament.userTeamId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onSelectClub(t.id)}
                    className={`h-9 px-2.5 rounded-md border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                      selected
                        ? 'bg-[#172b47] border-emerald-400 text-white'
                        : 'bg-[#09121e]/90 border-white/12 text-slate-300 hover:border-white/30'
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-xs shrink-0"
                      style={{ backgroundColor: t.kit.primary }}
                    />
                    <span className="truncate">{t.shortName}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Knockout Outcome Banner (Champion or Eliminated) */}
        {tournament.status === 'champion' && (
          <div
            data-testid="tournament-outcome-banner"
            className="rounded-lg bg-gradient-to-r from-amber-500/20 via-emerald-500/15 to-amber-500/20 border border-amber-400/70 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-lg bg-amber-400/20 border border-amber-400/60 flex items-center justify-center shrink-0">
                <Trophy className="w-7 h-7 text-amber-400" />
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-amber-300">
                  KNOCKOUT CUP CHAMPIONS
                </div>
                <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-white">
                  {userTeam.name} Lift the Trophy!
                </h2>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNewTournament(tournament.userTeamId)}
              className="h-11 px-5 rounded-md bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-extrabold text-base uppercase tracking-wider cursor-pointer"
            >
              Defend the Title
            </button>
          </div>
        )}

        {tournament.status === 'eliminated' && (
          <div
            data-testid="tournament-outcome-banner"
            className="rounded-lg bg-[#1c1018]/95 border border-rose-500/50 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4"
          >
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-rose-400">
                KNOCKED OUT IN{' '}
                {tournament.eliminatedRound
                  ? getRoundLabel(tournament.eliminatedRound).toUpperCase()
                  : 'TOURNAMENT'}
              </div>
              <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-white mt-0.5">
                {championTeam
                  ? `${championTeam.name} Won the Cup`
                  : 'Tournament Eliminated'}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNewTournament(tournament.userTeamId)}
              className="h-11 px-5 rounded-md bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-extrabold text-base uppercase tracking-wider cursor-pointer"
            >
              Start New Tournament
            </button>
          </div>
        )}

        {/* 3-Column Visual Knockout Bracket */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
          {/* Column 1: Quarter-Finals */}
          <div className="flex flex-col gap-3">
            <div className="text-xs font-bold uppercase tracking-widest text-slate-400">
              Quarter-Finals
            </div>
            <div className="flex-1 flex flex-col justify-between gap-3">
              {qfMatches.map((m, idx) => (
                <BracketMatchCard
                  key={m.id}
                  match={m}
                  userTeamId={tournament.userTeamId}
                  label={`QF ${idx + 1}`}
                />
              ))}
            </div>
          </div>

          {/* Column 2: Semi-Finals */}
          <div className="flex flex-col gap-3">
            <div className="text-xs font-bold uppercase tracking-widest text-slate-400">
              Semi-Finals
            </div>
            <div className="flex-1 flex flex-col justify-around gap-4">
              {sfMatches.map((m, idx) => (
                <BracketMatchCard
                  key={m.id}
                  match={m}
                  userTeamId={tournament.userTeamId}
                  label={`SF ${idx + 1}`}
                />
              ))}
            </div>
          </div>

          {/* Column 3: Final & Champion Pedestal */}
          <div className="flex flex-col gap-3">
            <div className="text-xs font-bold uppercase tracking-widest text-amber-400">
              Championship Final
            </div>
            <div className="flex-1 flex flex-col justify-center gap-4">
              {finalMatch && (
                <BracketMatchCard
                  match={finalMatch}
                  userTeamId={tournament.userTeamId}
                  label="FINAL"
                  isFinal
                />
              )}

              {/* Champion Card */}
              <div className="rounded-lg bg-[#0a1526]/92 border border-amber-400/35 p-4 text-center">
                <Trophy
                  className={`w-8 h-8 mx-auto ${
                    championTeam ? 'text-amber-400' : 'text-slate-600'
                  }`}
                />
                <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mt-1.5">
                  Cup Champion
                </div>
                <div className="font-display font-extrabold text-2xl text-white mt-0.5">
                  {championTeam ? championTeam.name : 'TBD'}
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* Pinned Match Action Footer */}
      <footer className="shrink-0 border-t border-white/12 bg-[#081220]/96 px-4 py-3 sm:px-8 sm:py-4">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
          {activeMatch && activeHome && activeAway ? (
            <>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-widest text-emerald-400">
                  Next Fixture · {getRoundLabel(activeMatch.round)}
                </div>
                <div className="font-display font-bold text-lg sm:text-xl text-white flex items-center gap-2">
                  <span>{activeHome.name}</span>
                  <span className="text-slate-500 text-sm">vs</span>
                  <span>{activeAway.name}</span>
                </div>
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={onSimulateMatch}
                  className="h-11 px-4 rounded-md bg-[#122238] hover:bg-[#1a3150] border border-white/15 text-slate-200 font-display font-bold text-sm uppercase tracking-wider inline-flex items-center justify-center gap-1.5 cursor-pointer flex-1 sm:flex-initial"
                >
                  <FastForward className="w-4 h-4 text-sky-400 shrink-0" />
                  <span>Quick Sim</span>
                </button>
                <button
                  type="button"
                  data-testid="tournament-play-match"
                  onClick={() => onPlayMatch(activeMatch)}
                  className="h-11 px-6 rounded-md bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-extrabold text-base sm:text-lg uppercase tracking-wider inline-flex items-center justify-center gap-2 shadow-lg cursor-pointer flex-1 sm:flex-initial"
                >
                  <Play className="w-4 h-4 fill-slate-950 shrink-0" />
                  <span>Play {getRoundLabel(activeMatch.round)}</span>
                </button>
              </div>
            </>
          ) : (
            <div className="w-full flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-slate-300">
                {tournament.status === 'champion'
                  ? `Congratulations! ${userTeam.name} conquered the 8-team knockout bracket.`
                  : 'Cup run complete. Start a new knockout tournament to try again.'}
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={onBackToTitle}
                  className="h-10 px-4 rounded-md bg-[#122238] hover:bg-[#1a3150] border border-white/15 text-slate-200 font-display font-bold text-sm uppercase tracking-wider cursor-pointer"
                >
                  Main Menu
                </button>
                <button
                  type="button"
                  onClick={() => onNewTournament(tournament.userTeamId)}
                  className="h-10 px-5 rounded-md bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-extrabold text-sm uppercase tracking-wider cursor-pointer"
                >
                  New Tournament
                </button>
              </div>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
