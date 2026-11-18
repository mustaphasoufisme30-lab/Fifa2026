import { useEffect } from 'react';
import { Play, Settings, Shield, Users } from 'lucide-react';
import { CareerProgress, FormationId, TeamConfig } from '../core/types';

export type TitlePanel = 'teams' | 'formation' | 'settings' | null;

interface TitleScreenProps {
  homeTeam: TeamConfig;
  awayTeam: TeamConfig;
  homeFormation: FormationId;
  career: CareerProgress;
  onStartMatch: () => void;
  onOpenPanel: (panel: TitlePanel) => void;
}

export function TitleScreen({
  homeTeam,
  awayTeam,
  homeFormation,
  career,
  onStartMatch,
  onOpenPanel,
}: TitleScreenProps) {
  // Allow Enter or Space from title screen when no modal is open
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (document.body.dataset.state !== 'title') return;
      if (e.code === 'Enter' || e.code === 'Space') {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT') return;
        e.preventDefault();
        onStartMatch();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onStartMatch]);

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between p-6 sm:p-10 pointer-events-none bg-gradient-to-r from-[#060d17]/90 via-[#060d17]/55 to-transparent">
      {/* Top Matchup Line (Clean unboxed typography, zero pills) */}
      <div className="flex items-center justify-between text-xs sm:text-sm text-slate-300 font-medium">
        <div className="flex items-center gap-2.5">
          <span
            className="w-2.5 h-2.5 rounded-xs inline-block"
            style={{ backgroundColor: homeTeam.kit.primary }}
          />
          <span className="text-white font-semibold">{homeTeam.name}</span>
          <span className="text-slate-400">vs</span>
          <span className="text-white font-semibold">{awayTeam.name}</span>
          <span
            className="w-2.5 h-2.5 rounded-xs inline-block"
            style={{ backgroundColor: awayTeam.kit.primary }}
          />
        </div>
        <div className="hidden sm:flex items-center gap-2 text-slate-300 tabular-nums">
          <span>Formation {homeFormation}</span>
          {career.matchesPlayed > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span>
                Record {career.wins}W-{career.draws}D-{career.losses}L
              </span>
            </>
          )}
        </div>
      </div>

      {/* Main Left-Third Title Lockup & Menu */}
      <div className="max-w-md flex flex-col items-start gap-6 pointer-events-auto my-auto">
        {/* Custom Inline SVG Crest & Wordmark */}
        <div className="flex items-center gap-4">
          <svg
            viewBox="0 0 64 64"
            className="w-14 h-14 sm:w-16 sm:h-16 shrink-0"
            aria-hidden="true"
          >
            <path
              d="M32 4 L56 14 V34 C56 47 45 56 32 60 C19 56 8 47 8 34 V14 Z"
              fill="#0f1e33"
              stroke="#38bdf8"
              strokeWidth="2.5"
            />
            <path
              d="M32 10 L50 18 V33 C50 43 41 50 32 54 C23 50 14 43 14 33 V18 Z"
              fill="#152b47"
            />
            <circle cx="32" cy="31" r="10" fill="none" stroke="#f8fafc" strokeWidth="2.2" />
            <polygon points="32,24 37,28 35,35 29,35 27,28" fill="#38bdf8" />
          </svg>
          <div>
            <h1 className="font-display font-extrabold text-5xl sm:text-6xl tracking-tight text-white leading-none">
              CLUB XI
            </h1>
            <p className="text-sm text-slate-300 mt-1">
              11v11 3D Stadium Football
            </p>
          </div>
        </div>

        {/* Primary Kick Off Button + Secondary Menu Actions */}
        <div className="w-full flex flex-col gap-2.5">
          <button
            type="button"
            data-start="true"
            onClick={onStartMatch}
            className="w-full sm:w-96 h-13 px-6 rounded-md bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-display font-extrabold text-xl tracking-wider uppercase flex items-center justify-center gap-2.5 shadow-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <Play className="w-5 h-5 fill-slate-950 shrink-0" />
            <span>PLAY</span>
          </button>

          <div className="grid grid-cols-3 gap-2 w-full sm:w-96">
            <button
              type="button"
              onClick={() => onOpenPanel('teams')}
              className="h-11 px-2.5 rounded-md bg-[#0e1b2e]/90 hover:bg-[#172b47] border border-white/15 text-slate-100 font-display font-bold text-sm tracking-wider uppercase flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Shield className="w-4 h-4 text-sky-400 shrink-0" />
              <span>TEAMS</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenPanel('formation')}
              className="h-11 px-2.5 rounded-md bg-[#0e1b2e]/90 hover:bg-[#172b47] border border-white/15 text-slate-100 font-display font-bold text-sm tracking-wider uppercase flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Users className="w-4 h-4 text-amber-400 shrink-0" />
              <span>FORMATION</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenPanel('settings')}
              className="h-11 px-2.5 rounded-md bg-[#0e1b2e]/90 hover:bg-[#172b47] border border-white/15 text-slate-100 font-display font-bold text-sm tracking-wider uppercase flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Settings className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>SETTINGS</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Flat Control Hint Line */}
      <div className="text-xs text-slate-300/90 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>WASD / Touch Joystick Move</span>
        <span aria-hidden="true">·</span>
        <span>K Pass</span>
        <span aria-hidden="true">·</span>
        <span>L Lob</span>
        <span aria-hidden="true">·</span>
        <span>Space Shoot</span>
        <span aria-hidden="true">·</span>
        <span>Shift Sprint</span>
        <span aria-hidden="true">·</span>
        <span>Q Switch</span>
        <span aria-hidden="true">·</span>
        <span>C Camera</span>
      </div>
    </div>
  );
}
