import { X } from 'lucide-react';
import { FORMATIONS, FORMATION_LIST, MENTALITY_MODIFIERS } from '../formations/formations';
import { TEAMS } from '../teams/teams';
import {
  CameraMode,
  FormationId,
  GameSettings,
  MatchStats,
  QualityLevel,
  TacticalMentality,
  TeamConfig,
} from '../core/types';
import { TitlePanel } from './TitleScreen';

const MENTALITIES: TacticalMentality[] = ['defensive', 'balanced', 'attacking'];

export interface TournamentMatchSummary {
  roundLabel: string;
  advanced: boolean;
  isChampion: boolean;
  homePenalties: number | null;
  awayPenalties: number | null;
}

export interface OnlineMatchSummary {
  homePlayerName: string;
  awayPlayerName: string;
  yourSide: 'home' | 'away';
  abortedBy?: string | null;
}

interface PauseModalProps {
  homeFormation: FormationId;
  homeMentality: TacticalMentality;
  isTournament?: boolean;
  isOnline?: boolean;
  onSelectFormation: (id: FormationId) => void;
  onSelectMentality: (m: TacticalMentality) => void;
  onResume: () => void;
  onRestart: () => void;
  onReturnToBracket?: () => void;
  onMainMenu: () => void;
}

export function PauseModal({
  homeFormation,
  homeMentality,
  isTournament = false,
  isOnline = false,
  onSelectFormation,
  onSelectMentality,
  onResume,
  onRestart,
  onReturnToBracket,
  onMainMenu,
}: PauseModalProps) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#040912]/75 p-4">
      <div
        role="dialog"
        aria-label="Match Paused"
        className="w-full max-w-sm rounded-lg bg-[#0d192a] border border-white/15 p-6 shadow-2xl"
      >
        <h2 className="font-display font-bold text-3xl text-white tracking-wide text-center uppercase">
          MATCH PAUSED
        </h2>

        {/* Mid-Match Quick Tactics */}
        <div className="mt-4 space-y-3 border-y border-white/10 py-3.5">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Formation
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {FORMATION_LIST.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onSelectFormation(f.id)}
                  className={`h-8 rounded text-xs font-bold cursor-pointer ${
                    homeFormation === f.id
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-[#09121e] text-slate-200 border border-white/15'
                  }`}
                >
                  {f.id}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Mentality
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {MENTALITIES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onSelectMentality(m)}
                  className={`h-8 rounded text-xs font-bold uppercase cursor-pointer ${
                    homeMentality === m
                      ? 'bg-sky-500 text-slate-950'
                      : 'bg-[#09121e] text-slate-200 border border-white/15'
                  }`}
                >
                  {MENTALITY_MODIFIERS[m].label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onResume}
            className="w-full h-11 rounded-md bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-bold text-lg tracking-wider uppercase cursor-pointer"
          >
            {isOnline ? 'Reprendre' : 'Resume'}
          </button>
          {!isOnline && (
            <button
              type="button"
              onClick={onRestart}
              className="w-full h-11 rounded-md bg-[#162740] hover:bg-[#1f3557] border border-white/15 text-white font-display font-bold text-base tracking-wider uppercase cursor-pointer"
            >
              Restart Match
            </button>
          )}
          {isTournament && onReturnToBracket && (
            <button
              type="button"
              onClick={onReturnToBracket}
              className="w-full h-11 rounded-md bg-[#162740] hover:bg-[#1f3557] border border-amber-400/35 text-amber-300 font-display font-bold text-base tracking-wider uppercase cursor-pointer"
            >
              Back to Bracket
            </button>
          )}
          <button
            type="button"
            onClick={onMainMenu}
            className="w-full h-11 rounded-md bg-transparent hover:bg-white/5 border border-white/15 text-slate-300 font-display font-bold text-base tracking-wider uppercase cursor-pointer"
          >
            {isOnline ? 'Quitter le match' : 'Main Menu'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface FullTimeModalProps {
  homeTeam: TeamConfig;
  awayTeam: TeamConfig;
  stats: MatchStats;
  tournamentSummary?: TournamentMatchSummary | null;
  onlineSummary?: OnlineMatchSummary | null;
  onPlayAgain: () => void;
  onViewBracket?: () => void;
  onMainMenu: () => void;
}

export function FullTimeModal({
  homeTeam,
  awayTeam,
  stats,
  tournamentSummary = null,
  onlineSummary = null,
  onPlayAgain,
  onViewBracket,
  onMainMenu,
}: FullTimeModalProps) {
  const totalPoss = stats.homePossessionSeconds + stats.awayPossessionSeconds;
  const homePossPct =
    totalPoss > 0 ? Math.round((stats.homePossessionSeconds / totalPoss) * 100) : 50;
  const awayPossPct = 100 - homePossPct;

  const outcomeLabel = onlineSummary
    ? onlineSummary.abortedBy
      ? 'ADVERSAIRE PARTI'
      : stats.homeScore > stats.awayScore
        ? `VICTOIRE · ${onlineSummary.homePlayerName}`
        : stats.awayScore > stats.homeScore
          ? `VICTOIRE · ${onlineSummary.awayPlayerName}`
          : 'MATCH NUL'
    : tournamentSummary
      ? tournamentSummary.isChampion
        ? 'TOURNAMENT CHAMPIONS!'
        : tournamentSummary.advanced
          ? 'ADVANCED TO NEXT ROUND'
          : 'ELIMINATED FROM CUP'
      : stats.homeScore > stats.awayScore
        ? `${homeTeam.name} Victory`
        : stats.awayScore > stats.homeScore
          ? `${awayTeam.name} Victory`
          : 'Full Time Draw';

  const hasPens =
    tournamentSummary !== null &&
    tournamentSummary.homePenalties !== null &&
    tournamentSummary.awayPenalties !== null;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#040912]/80 p-4">
      <div
        role="dialog"
        aria-label="Full Time Summary"
        className="w-full max-w-md rounded-lg bg-[#0d192a] border border-white/15 p-6 shadow-2xl"
      >
        <div className="text-center">
          <div
            className={`text-xs font-semibold uppercase tracking-widest ${
              onlineSummary?.abortedBy
                ? 'text-amber-400'
                : onlineSummary
                  ? 'text-sky-400'
                  : tournamentSummary
                    ? tournamentSummary.isChampion
                      ? 'text-amber-400'
                      : tournamentSummary.advanced
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    : 'text-emerald-400'
            }`}
          >
            {onlineSummary?.abortedBy
              ? 'MATCH ARRÊTÉ'
              : onlineSummary
                ? 'FIN DU MATCH EN LIGNE'
                : tournamentSummary
                  ? `FULL TIME · ${tournamentSummary.roundLabel.toUpperCase()}`
                  : 'FULL TIME'}
          </div>
          <h2 className="font-display font-extrabold text-3xl text-white mt-1">
            {outcomeLabel}
          </h2>
          {onlineSummary?.abortedBy && (
            <p className="text-xs sm:text-sm text-amber-200/90 mt-1.5">
              {onlineSummary.abortedBy} a quitté le salon. Le match a été arrêté.
            </p>
          )}
        </div>

        {/* Final Scoreboard */}
        <div className="mt-5 px-5 py-4 rounded-md bg-[#08101c] border border-white/10">
          <div className="flex items-center justify-between">
            <div className="text-left">
              <div className="font-display font-bold text-xl text-white">
                {homeTeam.shortName}
              </div>
              <div className="text-xs text-slate-400">
                {onlineSummary ? onlineSummary.homePlayerName : homeTeam.name}
              </div>
            </div>
            <div className="font-display font-extrabold text-4xl text-white tabular-nums">
              {stats.homeScore} - {stats.awayScore}
            </div>
            <div className="text-right">
              <div className="font-display font-bold text-xl text-white">
                {awayTeam.shortName}
              </div>
              <div className="text-xs text-slate-400">
                {onlineSummary ? onlineSummary.awayPlayerName : awayTeam.name}
              </div>
            </div>
          </div>
          {hasPens && tournamentSummary && (
            <div className="mt-2 pt-2 border-t border-white/10 text-center text-xs font-bold uppercase tracking-wider text-amber-300 tabular-nums">
              Penalties: {tournamentSummary.homePenalties} - {tournamentSummary.awayPenalties}
            </div>
          )}
        </div>

        {/* Match Stats Table */}
        <div className="mt-4 space-y-2 text-sm tabular-nums">
          <div className="flex justify-between text-slate-200 px-2">
            <span className="font-semibold">{stats.homeShots}</span>
            <span className="text-slate-400">Shots</span>
            <span className="font-semibold">{stats.awayShots}</span>
          </div>
          <div className="flex justify-between text-slate-200 px-2">
            <span className="font-semibold">{stats.homePasses}</span>
            <span className="text-slate-400">Passes</span>
            <span className="font-semibold">{stats.awayPasses}</span>
          </div>
          <div className="flex justify-between text-slate-200 px-2">
            <span className="font-semibold">{stats.homeSaves}</span>
            <span className="text-slate-400">GK Saves</span>
            <span className="font-semibold">{stats.awaySaves}</span>
          </div>
          <div className="flex justify-between text-slate-200 px-2">
            <span className="font-semibold">{stats.homeCorners}</span>
            <span className="text-slate-400">Corners</span>
            <span className="font-semibold">{stats.awayCorners}</span>
          </div>
          <div className="flex justify-between text-slate-200 px-2">
            <span className="font-semibold">{stats.homeFouls}</span>
            <span className="text-slate-400">Fouls</span>
            <span className="font-semibold">{stats.awayFouls}</span>
          </div>
          <div className="flex justify-between text-slate-200 px-2">
            <span className="font-semibold">{homePossPct}%</span>
            <span className="text-slate-400">Possession</span>
            <span className="font-semibold">{awayPossPct}%</span>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          {tournamentSummary && onViewBracket ? (
            <button
              type="button"
              data-testid="fulltime-view-bracket"
              onClick={onViewBracket}
              className="flex-1 h-11 rounded-md bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-bold text-lg tracking-wider uppercase cursor-pointer"
            >
              View Bracket
            </button>
          ) : !onlineSummary?.abortedBy ? (
            <button
              type="button"
              data-start="true"
              onClick={onPlayAgain}
              className="flex-1 h-11 rounded-md bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-bold text-lg tracking-wider uppercase cursor-pointer"
            >
              {onlineSummary ? 'REJOUER' : 'Play Again'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onMainMenu}
            className={`${
              onlineSummary?.abortedBy ? 'flex-1' : 'px-4'
            } h-11 rounded-md bg-[#162740] hover:bg-[#1f3557] border border-white/15 text-white font-display font-bold text-base tracking-wider uppercase cursor-pointer`}
          >
            {onlineSummary ? 'QUITTER' : 'Menu'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface TitleSettingsDrawerProps {
  panel: TitlePanel;
  homeTeamId: string;
  awayTeamId: string;
  homeFormation: FormationId;
  awayFormation: FormationId;
  homeMentality: TacticalMentality;
  settings: GameSettings;
  onClose: () => void;
  onSelectHomeTeam: (id: string) => void;
  onSelectAwayTeam: (id: string) => void;
  onSelectFormation: (id: FormationId) => void;
  onSelectAwayFormation: (id: FormationId) => void;
  onSelectMentality: (m: TacticalMentality) => void;
  onUpdateSettings: (patch: Partial<GameSettings>) => void;
}

export function TitleSettingsDrawer({
  panel,
  homeTeamId,
  awayTeamId,
  homeFormation,
  awayFormation,
  homeMentality,
  settings,
  onClose,
  onSelectHomeTeam,
  onSelectAwayTeam,
  onSelectFormation,
  onSelectAwayFormation,
  onSelectMentality,
  onUpdateSettings,
}: TitleSettingsDrawerProps) {
  if (!panel) return null;

  const activeFormation = FORMATIONS[homeFormation];

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#040912]/80 p-4">
      <div
        role="dialog"
        aria-label={panel}
        className="w-full max-w-lg rounded-lg bg-[#0d192a] border border-white/15 p-5 sm:p-6 shadow-2xl max-h-[88vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <h2 className="font-display font-bold text-2xl text-white uppercase tracking-wide">
            {panel === 'teams'
              ? 'Select Teams'
              : panel === 'formation'
                ? 'Tactical Formation'
                : 'Game Settings'}
          </h2>
          <button
            type="button"
            aria-label="Close panel"
            onClick={onClose}
            className="w-9 h-9 rounded-md bg-white/5 hover:bg-white/10 text-slate-300 flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {panel === 'teams' && (
          <div className="mt-4 space-y-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-sky-400 mb-2">
                Home Team (You Control)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {TEAMS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onSelectHomeTeam(t.id)}
                    className={`p-3 rounded-md border text-left transition-colors cursor-pointer ${
                      homeTeamId === t.id
                        ? 'bg-[#172b47] border-sky-400'
                        : 'bg-[#09121e] border-white/10 hover:border-white/25'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3.5 h-3.5 rounded-xs shrink-0"
                        style={{ backgroundColor: t.kit.primary }}
                      />
                      <span className="font-display font-bold text-lg text-white">
                        {t.name}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-1 tabular-nums">
                      ATT {t.rating.attack} · MID {t.rating.midfield} · DEF {t.rating.defense}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-rose-400 mb-2">
                Away Opponent
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {TEAMS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onSelectAwayTeam(t.id)}
                    className={`p-3 rounded-md border text-left transition-colors cursor-pointer ${
                      awayTeamId === t.id
                        ? 'bg-[#2a1722] border-rose-400'
                        : 'bg-[#09121e] border-white/10 hover:border-white/25'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3.5 h-3.5 rounded-xs shrink-0"
                        style={{ backgroundColor: t.kit.primary }}
                      />
                      <span className="font-display font-bold text-lg text-white">
                        {t.name}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-1 tabular-nums">
                      ATT {t.rating.attack} · MID {t.rating.midfield} · DEF {t.rating.defense}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {panel === 'formation' && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
              <div className="space-y-2">
                {FORMATION_LIST.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => onSelectFormation(f.id)}
                    className={`w-full p-3 rounded-md border text-left cursor-pointer ${
                      homeFormation === f.id
                        ? 'bg-[#172b47] border-emerald-400'
                        : 'bg-[#09121e] border-white/10 hover:border-white/25'
                    }`}
                  >
                    <div className="font-display font-bold text-lg text-white">
                      {f.label}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {f.description}
                    </div>
                  </button>
                ))}
              </div>

              {/* Tactical Pitch Schematic Preview */}
              <div className="relative h-64 rounded-md bg-[#164a27] border border-white/20 overflow-hidden">
                <div className="absolute inset-x-0 top-1/2 h-px bg-white/30" />
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border border-white/30" />
                {activeFormation.slots.map((slot, i) => {
                  const depthShift =
                    homeMentality === 'attacking'
                      ? 0.08
                      : homeMentality === 'defensive'
                        ? -0.08
                        : 0;
                  const topPct = 92 - ((slot.nx + depthShift + 1) * 0.85) * 85;
                  const leftPct = 50 + slot.nz * 40;
                  return (
                    <div
                      key={i}
                      style={{ top: `${Math.max(8, Math.min(92, topPct))}%`, left: `${leftPct}%` }}
                      className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
                    >
                      <span
                        className={`w-4 h-4 rounded-full border border-white ${
                          slot.role === 'GK' ? 'bg-amber-400' : 'bg-sky-500'
                        }`}
                      />
                      <span className="text-[10px] font-bold text-white mt-0.5">
                        {slot.role}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Tactical Mentality Selector */}
            <div>
              <div className="text-xs font-semibold text-slate-300 uppercase mb-1.5">
                Team Tactical Mentality
              </div>
              <div className="grid grid-cols-3 gap-2">
                {MENTALITIES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => onSelectMentality(m)}
                    className={`h-10 rounded-md border text-xs sm:text-sm font-semibold uppercase cursor-pointer ${
                      homeMentality === m
                        ? 'bg-sky-500 text-slate-950 border-sky-400'
                        : 'bg-[#09121e] text-slate-200 border-white/15'
                    }`}
                  >
                    {MENTALITY_MODIFIERS[m].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Away AI Formation */}
            <div>
              <div className="text-xs font-semibold text-rose-300 uppercase mb-1.5">
                Away Opponent Formation
              </div>
              <div className="grid grid-cols-4 gap-2">
                {FORMATION_LIST.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => onSelectAwayFormation(f.id)}
                    className={`h-9 rounded-md border text-xs font-bold cursor-pointer ${
                      awayFormation === f.id
                        ? 'bg-rose-500 text-white border-rose-400'
                        : 'bg-[#09121e] text-slate-300 border-white/15'
                    }`}
                  >
                    {f.id}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {panel === 'settings' && (
          <div className="mt-4 space-y-4">
            <div>
              <div className="text-xs font-semibold text-slate-300 uppercase mb-1.5">
                Graphics Quality (Mobile Optimization)
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(['low', 'medium', 'high'] as QualityLevel[]).map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => onUpdateSettings({ quality: q })}
                    className={`h-10 rounded-md border text-sm font-semibold uppercase cursor-pointer ${
                      settings.quality === q
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                        : 'bg-[#09121e] text-slate-200 border-white/15'
                    }`}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-300 uppercase mb-1.5">
                Camera Angle
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(['tv', 'close', 'player'] as CameraMode[]).map((cam) => (
                  <button
                    key={cam}
                    type="button"
                    onClick={() => onUpdateSettings({ cameraMode: cam })}
                    className={`h-10 rounded-md border text-sm font-semibold uppercase cursor-pointer ${
                      settings.cameraMode === cam
                        ? 'bg-sky-500 text-slate-950 border-sky-400'
                        : 'bg-[#09121e] text-slate-200 border-white/15'
                    }`}
                  >
                    {cam}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-300 uppercase mb-1.5">
                Half Length
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[60, 120, 180].map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => onUpdateSettings({ halfDurationSeconds: sec })}
                    className={`h-10 rounded-md border text-sm font-semibold cursor-pointer ${
                      settings.halfDurationSeconds === sec
                        ? 'bg-sky-500 text-slate-950 border-sky-400'
                        : 'bg-[#09121e] text-slate-200 border-white/15'
                    }`}
                  >
                    {sec / 60} min
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-sm font-medium text-slate-200">
                On-Screen Touch Controls
              </span>
              <button
                type="button"
                onClick={() =>
                  onUpdateSettings({
                    showTouchControls: !settings.showTouchControls,
                  })
                }
                className={`px-4 h-9 rounded-md text-xs font-bold uppercase cursor-pointer ${
                  settings.showTouchControls
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                {settings.showTouchControls ? 'On' : 'Off'}
              </button>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-200">
                Stadium Sound & Effects
              </span>
              <button
                type="button"
                onClick={() =>
                  onUpdateSettings({ soundEnabled: !settings.soundEnabled })
                }
                className={`px-4 h-9 rounded-md text-xs font-bold uppercase cursor-pointer ${
                  settings.soundEnabled
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                {settings.soundEnabled ? 'On' : 'Off'}
              </button>
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-6 rounded-md bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-bold text-base uppercase tracking-wider cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
