import { Bot, Play, Shuffle, User, X } from 'lucide-react';
import { useState } from 'react';
import { TeamConfig } from '../core/types';
import { TEAMS } from '../teams/teams';

interface TeamMatchupModalProps {
  homeTeam: TeamConfig;
  awayTeam: TeamConfig;
  onSelectUserTeam: (teamId: string) => void;
  onSelectRobotTeam: (teamId: string) => void;
  onRandomizeRobot: () => void;
  onStartMatch: () => void;
  onClose: () => void;
}

export function TeamMatchupModal({
  homeTeam,
  awayTeam,
  onSelectUserTeam,
  onSelectRobotTeam,
  onRandomizeRobot,
  onStartMatch,
  onClose,
}: TeamMatchupModalProps) {
  const [pickingSide, setPickingSide] = useState<'user' | 'robot'>('user');
  const [regionFilter, setRegionFilter] = useState<'all' | 'europe' | 'africa'>('all');

  const europeanCount = TEAMS.filter((t) => t.region === 'europe').length;
  const africanCount = TEAMS.filter((t) => t.region === 'africa').length;
  const filteredTeams =
    regionFilter === 'all' ? TEAMS : TEAMS.filter((t) => t.region === regionFilter);

  return (
    <div
      data-testid="team-select-modal"
      className="fixed inset-0 z-30 flex items-center justify-center bg-[#040912]/82 p-3 sm:p-4"
    >
      <div
        role="dialog"
        aria-label="Choisir votre équipe contre le Robot"
        className="w-full max-w-2xl rounded-xl bg-[#0d192a] border border-white/15 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-[#091220]">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-emerald-400">
              MATCH RAPIDE · JOUEUR VS ROBOT (IA)
            </div>
            <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-white uppercase tracking-wide leading-tight">
              Choisissez votre équipe
            </h2>
          </div>
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="w-9 h-9 rounded-md bg-white/5 hover:bg-white/10 text-slate-300 flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-5 space-y-4">
          {/* Live Face-off Banner: User vs Robot */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setPickingSide('user')}
              className={`rounded-lg p-3.5 border text-left transition-colors cursor-pointer ${
                pickingSide === 'user'
                  ? 'bg-[#122742] border-emerald-400 ring-1 ring-emerald-400/40'
                  : 'bg-[#09121e] border-white/12 hover:border-white/25'
              }`}
            >
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider">
                <span className="text-emerald-400 inline-flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" />
                  Votre équipe (Vous)
                </span>
                {pickingSide === 'user' && (
                  <span className="text-emerald-300">En sélection</span>
                )}
              </div>
              <div className="mt-2 flex items-center gap-2.5">
                <span
                  className="w-4 h-4 rounded-xs shrink-0 border border-white/25"
                  style={{ backgroundColor: homeTeam.kit.primary }}
                />
                <span className="font-display font-extrabold text-xl text-white truncate">
                  {homeTeam.name}
                </span>
              </div>
              <div className="text-xs text-slate-400 mt-1 tabular-nums">
                ATT {homeTeam.rating.attack} · MIL {homeTeam.rating.midfield} · DÉF{' '}
                {homeTeam.rating.defense}
              </div>
            </button>

            <div
              className={`rounded-lg p-3.5 border transition-colors ${
                pickingSide === 'robot'
                  ? 'bg-[#261420] border-rose-400 ring-1 ring-rose-400/40'
                  : 'bg-[#09121e] border-white/12'
              }`}
            >
              <div className="flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wider">
                <button
                  type="button"
                  onClick={() => setPickingSide('robot')}
                  className="text-rose-400 inline-flex items-center gap-1.5 cursor-pointer hover:text-rose-300"
                >
                  <Bot className="w-3.5 h-3.5" />
                  Robot (IA)
                </button>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    data-testid="randomize-robot-btn"
                    onClick={onRandomizeRobot}
                    className="px-2 py-0.5 rounded bg-white/8 hover:bg-white/15 text-slate-200 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Shuffle className="w-3 h-3" />
                    <span>Aléatoire</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPickingSide('robot')}
                    className={`px-2 py-0.5 rounded cursor-pointer ${
                      pickingSide === 'robot'
                        ? 'bg-rose-500 text-white'
                        : 'bg-white/8 hover:bg-white/15 text-slate-200'
                    }`}
                  >
                    Choisir
                  </button>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2.5">
                <span
                  className="w-4 h-4 rounded-xs shrink-0 border border-white/25"
                  style={{ backgroundColor: awayTeam.kit.primary }}
                />
                <span className="font-display font-extrabold text-xl text-white truncate">
                  {awayTeam.name}
                </span>
              </div>
              <div className="text-xs text-slate-400 mt-1 tabular-nums">
                ATT {awayTeam.rating.attack} · MIL {awayTeam.rating.midfield} · DÉF{' '}
                {awayTeam.rating.defense}
              </div>
            </div>
          </div>

          {/* Club Selection Grid with Europe / Afrique Filter */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                {pickingSide === 'user'
                  ? 'Cliquez pour choisir votre équipe :'
                  : 'Cliquez pour choisir l’équipe du Robot (IA) :'}
              </span>
              <div className="flex items-center gap-1.5">
                {(
                  [
                    { id: 'all', label: `Tous (${TEAMS.length})` },
                    { id: 'europe', label: `Europe (${europeanCount})` },
                    { id: 'africa', label: `Afrique (${africanCount})` },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    data-testid={`filter-region-${tab.id}`}
                    onClick={() => setRegionFilter(tab.id)}
                    className={`px-2.5 py-1 rounded text-[11px] font-bold uppercase tracking-wider cursor-pointer transition-colors ${
                      regionFilter === tab.id
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-[#09121e] text-slate-300 border border-white/12 hover:border-white/30'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {filteredTeams.map((team) => {
                const isUserTeam = team.id === homeTeam.id;
                const isRobotTeam = team.id === awayTeam.id;
                const isSelectedForActiveSide =
                  pickingSide === 'user' ? isUserTeam : isRobotTeam;

                return (
                  <button
                    key={team.id}
                    type="button"
                    data-testid={`pick-club-${team.id}`}
                    onClick={() => {
                      if (pickingSide === 'user') {
                        onSelectUserTeam(team.id);
                      } else {
                        onSelectRobotTeam(team.id);
                      }
                    }}
                    className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                      isSelectedForActiveSide
                        ? pickingSide === 'user'
                          ? 'bg-[#152d4b] border-emerald-400'
                          : 'bg-[#2c1522] border-rose-400'
                        : 'bg-[#09121e] border-white/10 hover:border-white/30'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="w-3 h-3 rounded-xs shrink-0 border border-white/25"
                          style={{ backgroundColor: team.kit.primary }}
                        />
                        <span className="font-display font-bold text-base text-white truncate">
                          {team.shortName}
                        </span>
                      </div>
                      {isUserTeam && (
                        <span className="text-[10px] font-bold uppercase text-emerald-400">
                          VOUS
                        </span>
                      )}
                      {isRobotTeam && (
                        <span className="text-[10px] font-bold uppercase text-rose-400">
                          ROBOT
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-300 truncate mt-0.5">
                      {team.name}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1 tabular-nums">
                      {team.rating.attack}/{team.rating.midfield}/{team.rating.defense}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Pinned Kickoff Footer */}
        <div className="shrink-0 px-5 py-3.5 border-t border-white/10 bg-[#091220] flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-300">
            <span className="font-bold text-emerald-400">{homeTeam.shortName}</span> (Vous)
            {' '}vs{' '}
            <span className="font-bold text-rose-400">{awayTeam.shortName}</span> (Robot IA)
          </div>
          <button
            type="button"
            data-testid="confirm-play-vs-robot"
            onClick={onStartMatch}
            className="w-full sm:w-auto h-11 px-6 rounded-md bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-extrabold text-lg tracking-wider uppercase inline-flex items-center justify-center gap-2 shadow-lg cursor-pointer"
          >
            <Play className="w-4 h-4 fill-slate-950 shrink-0" />
            <span>Jouer contre le Robot</span>
          </button>
        </div>
      </div>
    </div>
  );
}
