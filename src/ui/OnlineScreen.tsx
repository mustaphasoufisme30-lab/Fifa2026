import { useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  Globe,
  LogIn,
  LogOut,
  Play,
  Plus,
  Shield,
  UserCheck,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { FormationId, TeamSide } from '../core/types';
import { FORMATION_LIST } from '../formations/formations';
import { OnlineRoomSnapshot } from '../multiplayer/protocol';
import { OnlineSocketStatus } from '../multiplayer/onlineClient';
import { getTeamById, TEAMS } from '../teams/teams';

interface OnlineScreenProps {
  authUser: User | null;
  authLoading: boolean;
  authError: string | null;
  nickname: string;
  selectedTeamId: string;
  selectedFormation: FormationId;
  halfDurationSeconds: number;
  socketStatus: OnlineSocketStatus;
  room: OnlineRoomSnapshot | null;
  yourSide: TeamSide | null;
  roomError: string | null;
  busy: boolean;
  onSignInGoogle: () => void;
  onSignOut: () => void;
  onChangeNickname: (val: string) => void;
  onSelectTeam: (teamId: string) => void;
  onSelectFormation: (formation: FormationId) => void;
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
  onToggleReady: () => void;
  onStartMatch: () => void;
  onLeaveRoom: () => void;
  onBackToTitle: () => void;
}

export function OnlineScreen({
  authUser,
  authLoading,
  authError,
  nickname,
  selectedTeamId,
  selectedFormation,
  halfDurationSeconds,
  socketStatus,
  room,
  yourSide,
  roomError,
  busy,
  onSignInGoogle,
  onSignOut,
  onChangeNickname,
  onSelectTeam,
  onSelectFormation,
  onCreateRoom,
  onJoinRoom,
  onToggleReady,
  onStartMatch,
  onLeaveRoom,
  onBackToTitle,
}: OnlineScreenProps) {
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [copied, setCopied] = useState(false);

  const handleCopyCode = async () => {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.roomCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard may be restricted in some webviews
    }
  };

  const homeSlot = room?.players.find((p) => p.side === 'home') ?? null;
  const awaySlot = room?.players.find((p) => p.side === 'away') ?? null;
  const mySlot = room?.players.find((p) => p.side === yourSide) ?? null;
  const otherSlot = room?.players.find((p) => p.side !== yourSide) ?? null;

  const canStart = Boolean(room && room.players.length === 2 && !busy);

  return (
    <div
      data-testid="online-screen"
      className="fixed inset-0 z-20 flex flex-col bg-[#060d17]/92 text-white overflow-y-auto"
    >
      {/* Top Bar */}
      <header className="w-full max-w-4xl mx-auto px-4 sm:px-6 pt-4 pb-3 flex items-center justify-between gap-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (room) onLeaveRoom();
              onBackToTitle();
            }}
            className="h-9 px-3 rounded-md bg-[#0e1b2e] hover:bg-[#172b47] border border-white/15 text-slate-200 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Accueil</span>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-sky-400" />
              <h1 className="font-display font-extrabold text-xl sm:text-2xl tracking-wide uppercase">
                MATCH EN LIGNE · 1v1
              </h1>
            </div>
            <p className="text-[11px] text-slate-400">
              FiFA 2026 Multijoueur temps réel · Firebase + Serveur Autoritaire
            </p>
          </div>
        </div>

        {authUser && (
          <div className="flex items-center gap-2">
            <div className="hidden sm:block text-right">
              <div className="text-xs font-bold text-white leading-tight">
                {nickname || authUser.displayName || 'Joueur'}
              </div>
              <div className="text-[10px] text-slate-400 font-mono">
                ID: {authUser.uid.slice(0, 8)}
              </div>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              aria-label="Se déconnecter"
              className="h-9 px-3 rounded-md bg-[#0e1b2e] hover:bg-[#1f2937] border border-white/15 text-slate-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Déconnexion</span>
            </button>
          </div>
        )}
      </header>

      <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-5 flex-1 flex flex-col gap-5">
        {/* Step 1: Firebase Authentication */}
        {!authUser ? (
          <section className="my-auto max-w-md w-full mx-auto rounded-lg bg-[#0d192a] border border-sky-400/35 p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-md bg-sky-500/15 border border-sky-400/40 flex items-center justify-center shrink-0">
                <LogIn className="w-5 h-5 text-sky-400" />
              </div>
              <div>
                <h2 className="font-display font-extrabold text-2xl uppercase tracking-wide">
                  Connexion Joueur
                </h2>
                <p className="text-xs text-slate-300">
                  Identifiez-vous via Firebase pour créer ou rejoindre un match 1v1.
                </p>
              </div>
            </div>

            {authError && (
              <div className="mt-4 p-3 rounded-md bg-rose-950/70 border border-rose-500/50 text-xs text-rose-200 leading-relaxed">
                {authError}
              </div>
            )}

            <div className="mt-5 flex flex-col gap-2.5">
              <button
                type="button"
                data-testid="online-google-signin"
                disabled={authLoading}
                onClick={onSignInGoogle}
                className="w-full h-12 px-4 rounded-md bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 font-display font-extrabold text-base tracking-wider uppercase flex items-center justify-center gap-2 cursor-pointer"
              >
                <UserCheck className="w-5 h-5" />
                <span>{authLoading ? 'Connexion...' : 'Se connecter avec Google'}</span>
              </button>
            </div>

            <p className="mt-4 text-[11px] text-slate-400 leading-relaxed">
              Chaque joueur reçoit un identifiant Firebase unique permettant de sécuriser les
              salles de match et la reconnexion automatique.
            </p>
          </section>
        ) : !room ? (
          /* Step 2: Create or Join Room Menu */
          <>
            {roomError && (
              <div
                role="alert"
                className="p-3 rounded-md bg-rose-950/75 border border-rose-500/50 text-sm text-rose-200"
              >
                {roomError}
              </div>
            )}

            {socketStatus === 'reconnecting' && (
              <div className="p-3 rounded-md bg-amber-950/75 border border-amber-400/50 text-xs text-amber-200">
                Connexion au serveur de match en cours de rétablissement...
              </div>
            )}

            {/* Player Profile + Club Choice */}
            <section className="rounded-lg bg-[#0d192a] border border-white/15 p-4 sm:p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="online-nickname"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5"
                  >
                    Votre Pseudo
                  </label>
                  <input
                    id="online-nickname"
                    type="text"
                    maxLength={24}
                    value={nickname}
                    onChange={(e) => onChangeNickname(e.target.value)}
                    placeholder="Votre nom sur le terrain"
                    className="w-full h-10 px-3 rounded-md bg-[#08101c] border border-white/15 text-sm text-white focus:outline-none focus:border-sky-400"
                  />
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                    Formation · Mi-temps {halfDurationSeconds / 60} min
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {FORMATION_LIST.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => onSelectFormation(f.id)}
                        className={`h-10 rounded-md text-xs font-bold cursor-pointer ${
                          selectedFormation === f.id
                            ? 'bg-sky-500 text-slate-950'
                            : 'bg-[#08101c] text-slate-200 border border-white/15 hover:border-white/30'
                        }`}
                      >
                        {f.id}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Choisissez votre équipe</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {TEAMS.map((team) => {
                    const active = selectedTeamId === team.id;
                    return (
                      <button
                        key={team.id}
                        type="button"
                        onClick={() => onSelectTeam(team.id)}
                        className={`p-2.5 rounded-md border text-left transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#172b47] border-emerald-400'
                            : 'bg-[#08101c] border-white/10 hover:border-white/25'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-xs shrink-0"
                            style={{ backgroundColor: team.kit.primary }}
                          />
                          <span className="font-display font-bold text-sm text-white truncate">
                            {team.name}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5 tabular-nums">
                          ATT {team.rating.attack} · DEF {team.rating.defense}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* Primary 2-Column Multiplayer Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* CRÉER UNE PARTIE */}
              <section className="rounded-lg bg-[#0d192a] border border-emerald-400/40 p-5 flex flex-col justify-between gap-4">
                <div>
                  <h2 className="font-display font-extrabold text-2xl uppercase tracking-wide text-emerald-400">
                    CRÉER UNE PARTIE
                  </h2>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    Générez un code court unique (ex: <span className="font-mono text-white">A7K92</span>)
                    et partagez-le à votre adversaire pour jouer ensemble en temps réel.
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="online-create-room"
                  disabled={busy}
                  onClick={onCreateRoom}
                  className="w-full h-12 px-5 rounded-md bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 font-display font-extrabold text-lg tracking-wider uppercase flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Plus className="w-5 h-5" />
                  <span>{busy ? 'Création...' : 'CRÉER UNE PARTIE'}</span>
                </button>
              </section>

              {/* REJOINDRE UNE PARTIE */}
              <section className="rounded-lg bg-[#0d192a] border border-sky-400/40 p-5 flex flex-col justify-between gap-4">
                <div>
                  <h2 className="font-display font-extrabold text-2xl uppercase tracking-wide text-sky-400">
                    REJOINDRE UNE PARTIE
                  </h2>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    Saisissez le code à 5 caractères communiqué par l&apos;hôte. Une équipe
                    distincte vous sera automatiquement attribuée.
                  </p>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    onJoinRoom(joinCodeInput);
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    data-testid="online-join-code-input"
                    value={joinCodeInput}
                    onChange={(e) =>
                      setJoinCodeInput(
                        e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5),
                      )
                    }
                    placeholder="EX: A7K92"
                    maxLength={5}
                    className="flex-1 h-12 px-3 rounded-md bg-[#08101c] border border-white/20 font-mono font-bold text-lg tracking-[0.25em] text-center text-white uppercase focus:outline-none focus:border-sky-400"
                  />
                  <button
                    type="submit"
                    data-testid="online-join-room-btn"
                    disabled={busy || joinCodeInput.length !== 5}
                    className="h-12 px-5 rounded-md bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-display font-extrabold text-base tracking-wider uppercase whitespace-nowrap cursor-pointer"
                  >
                    REJOINDRE
                  </button>
                </form>
              </section>
            </div>
          </>
        ) : (
          /* Step 3: Waiting Room Lobby */
          <section className="rounded-lg bg-[#0d192a] border border-white/15 p-5 sm:p-6 flex flex-col gap-5">
            {roomError && (
              <div className="p-3 rounded-md bg-rose-950/75 border border-rose-500/50 text-xs text-rose-200">
                {roomError}
              </div>
            )}

            {/* Room Code Hero Banner */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-md bg-[#08101c] border border-sky-400/35">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-widest text-sky-400">
                  CODE DE LA PARTIE
                </div>
                <div
                  data-testid="online-room-code"
                  className="font-mono font-extrabold text-4xl sm:text-5xl tracking-[0.22em] text-white mt-0.5"
                >
                  {room.roomCode}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Partagez ce code à votre adversaire pour qu&apos;il rejoigne la salle.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleCopyCode()}
                className="h-11 px-4 rounded-md bg-[#13243b] hover:bg-[#1c3354] border border-white/15 text-sm font-bold text-white flex items-center gap-2 cursor-pointer whitespace-nowrap"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Code copié !</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-sky-400" />
                    <span>Copier le code</span>
                  </>
                )}
              </button>
            </div>

            {/* 2 Player Slots */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Home Slot */}
              <div className="p-4 rounded-md bg-[#08101c] border border-emerald-400/35">
                <div className="flex items-center justify-between text-xs uppercase tracking-wider font-bold">
                  <span className="text-emerald-400">Joueur 1 · Domicile</span>
                  {homeSlot?.ready && <span className="text-emerald-300">PRÊT</span>}
                </div>
                {homeSlot ? (
                  <div className="mt-2">
                    <div className="font-display font-bold text-xl text-white">
                      {homeSlot.nickname} {yourSide === 'home' ? '(Vous)' : ''}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 text-sm text-slate-300">
                      <span
                        className="w-3.5 h-3.5 rounded-xs shrink-0"
                        style={{ backgroundColor: getTeamById(homeSlot.teamId).kit.primary }}
                      />
                      <span className="font-semibold">{getTeamById(homeSlot.teamId).name}</span>
                      <span className="text-slate-500">·</span>
                      <span>{homeSlot.formation}</span>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Away Slot */}
              <div
                className={`p-4 rounded-md bg-[#08101c] border ${
                  awaySlot ? 'border-sky-400/35' : 'border-dashed border-white/20'
                }`}
              >
                <div className="flex items-center justify-between text-xs uppercase tracking-wider font-bold">
                  <span className="text-sky-400">Joueur 2 · Extérieur</span>
                  {awaySlot?.ready && <span className="text-emerald-300">PRÊT</span>}
                </div>
                {awaySlot ? (
                  <div className="mt-2">
                    <div className="font-display font-bold text-xl text-white">
                      {awaySlot.nickname} {yourSide === 'away' ? '(Vous)' : ''}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 text-sm text-slate-300">
                      <span
                        className="w-3.5 h-3.5 rounded-xs shrink-0"
                        style={{ backgroundColor: getTeamById(awaySlot.teamId).kit.primary }}
                      />
                      <span className="font-semibold">{getTeamById(awaySlot.teamId).name}</span>
                      <span className="text-slate-500">·</span>
                      <span>{awaySlot.formation}</span>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 text-sm text-slate-400">
                    En attente qu&apos;un deuxième joueur rejoigne avec le code{' '}
                    <span className="font-mono font-bold text-white">{room.roomCode}</span>...
                  </div>
                )}
              </div>
            </div>

            {/* Club Switcher inside Lobby (disallows picking opponent's club) */}
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                Changer votre club (chaque joueur a une équipe différente)
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {TEAMS.map((team) => {
                  const isMine = mySlot?.teamId === team.id;
                  const takenByOpponent = otherSlot?.teamId === team.id;
                  return (
                    <button
                      key={team.id}
                      type="button"
                      disabled={takenByOpponent}
                      onClick={() => onSelectTeam(team.id)}
                      className={`p-2 rounded-md border text-left text-xs transition-colors ${
                        isMine
                          ? 'bg-[#172b47] border-emerald-400 text-white cursor-pointer'
                          : takenByOpponent
                            ? 'bg-[#070d16] border-white/5 text-slate-500 opacity-50 cursor-not-allowed'
                            : 'bg-[#08101c] border-white/10 hover:border-white/25 text-slate-200 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-xs shrink-0"
                          style={{ backgroundColor: team.kit.primary }}
                        />
                        <span className="font-semibold truncate">{team.name}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Lobby Action Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={onLeaveRoom}
                className="h-11 px-4 rounded-md bg-transparent hover:bg-white/5 border border-white/15 text-slate-300 font-display font-bold text-sm uppercase tracking-wider cursor-pointer"
              >
                Quitter la salle
              </button>

              <div className="flex flex-col sm:flex-row gap-2.5">
                <button
                  type="button"
                  onClick={onToggleReady}
                  className={`h-11 px-5 rounded-md font-display font-bold text-sm uppercase tracking-wider cursor-pointer border ${
                    mySlot?.ready
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                      : 'bg-[#13243b] hover:bg-[#1c3354] border-white/15 text-white'
                  }`}
                >
                  {mySlot?.ready ? 'Prêt ✓' : 'Je suis prêt'}
                </button>

                <button
                  type="button"
                  data-testid="online-start-match"
                  disabled={!canStart}
                  onClick={onStartMatch}
                  className="h-11 px-6 rounded-md bg-emerald-500 hover:bg-emerald-400 disabled:opacity-45 text-slate-950 font-display font-extrabold text-base uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-slate-950" />
                  <span>
                    {room.players.length < 2 ? 'En attente du Joueur 2...' : 'LANCER LE MATCH'}
                  </span>
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
