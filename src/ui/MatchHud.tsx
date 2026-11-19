import { useEffect, useRef } from 'react';
import { Camera, FastForward, Pause, Volume2, VolumeX } from 'lucide-react';
import { CameraMode, MatchHudSnapshot, SetPieceType } from '../core/types';
import { InputManager } from '../controls/inputManager';
import { TouchControls } from './TouchControls';

interface MatchHudProps {
  snapshot: MatchHudSnapshot;
  inputManager: InputManager;
  soundEnabled: boolean;
  showTouchControls: boolean;
  onCycleCamera: () => void;
  onToggleSound: () => void;
  onPause: () => void;
  onSkipReplay?: () => void;
}

const CAMERA_LABELS: Record<CameraMode, string> = {
  tv: 'TV',
  close: 'CLOSE',
  player: 'PLAYER',
  replay: 'REPLAY',
};

const SET_PIECE_LABELS: Record<SetPieceType, string> = {
  throw_in: 'THROW-IN',
  goal_kick: 'GOAL KICK',
  corner: 'CORNER KICK',
  free_kick: 'FREE KICK',
  penalty: 'PENALTY KICK',
};

export function MatchHud({
  snapshot,
  inputManager,
  soundEnabled,
  showTouchControls,
  onCycleCamera,
  onToggleSound,
  onPause,
  onSkipReplay,
}: MatchHudProps) {
  const radarCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = radarCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Pitch turf backdrop
    ctx.fillStyle = '#154424';
    ctx.fillRect(0, 0, w, h);

    // Pitch outline & halfway line
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(2, 2, w - 4, h - 4);
    ctx.beginPath();
    ctx.moveTo(w / 2, 2);
    ctx.lineTo(w / 2, h - 2);
    ctx.stroke();

    // Center circle
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 8, 0, Math.PI * 2);
    ctx.stroke();

    // Players
    for (const p of snapshot.radarPlayers) {
      const px = ((p.x + 1) * 0.5) * (w - 8) + 4;
      const py = ((p.z + 1) * 0.5) * (h - 8) + 4;
      ctx.beginPath();
      ctx.arc(px, py, p.isControlled ? 3.5 : 2.3, 0, Math.PI * 2);
      ctx.fillStyle = p.isControlled
        ? '#facc15'
        : p.team === 'home'
          ? snapshot.homeColor
          : snapshot.awayColor;
      ctx.fill();
      if (p.isControlled) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Ball
    const bx = ((snapshot.radarBall.x + 1) * 0.5) * (w - 8) + 4;
    const by = ((snapshot.radarBall.z + 1) * 0.5) * (h - 8) + 4;
    ctx.beginPath();
    ctx.arc(bx, by, 2.8, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }, [snapshot]);

  const minStr = String(snapshot.matchMinutes).padStart(2, '0');
  const secStr = String(snapshot.matchSeconds).padStart(2, '0');
  const halfLabel =
    snapshot.phase === 'halftime'
      ? 'HT'
      : snapshot.half === 1
        ? '1ST'
        : '2ND';

  return (
    <div className="fixed inset-0 z-10 pointer-events-none">
      {/* Top Broadcast Bar: Scoreboard Left + Utilities Right */}
      <div className="flex flex-col gap-1.5 px-2.5 pt-2.5 sm:px-5 sm:pt-4">
        <div className="flex items-center justify-between gap-2">
          {/* Broadcast Scoreboard */}
          <div
            data-testid="match-scoreboard"
            className="flex items-center bg-[#09121e]/90 border border-white/15 rounded-md overflow-hidden shadow-lg pointer-events-auto shrink-0"
          >
            <div className="flex items-center gap-1.5 px-2 py-1 sm:px-3 sm:py-1.5 bg-[#0f1c2e] whitespace-nowrap">
              <span
                className="w-2 h-4 sm:w-2.5 sm:h-5 rounded-xs shrink-0"
                style={{ backgroundColor: snapshot.homeColor }}
              />
              <span className="font-display font-bold text-sm sm:text-lg tracking-wide text-white">
                {snapshot.homeShort}
              </span>
            </div>

            <div className="px-2 sm:px-3 py-1 sm:py-1.5 bg-white text-slate-950 font-display font-extrabold text-sm sm:text-xl tabular-nums tracking-wider whitespace-nowrap">
              {snapshot.homeScore} - {snapshot.awayScore}
            </div>

            <div className="flex items-center gap-1.5 px-2 py-1 sm:px-3 sm:py-1.5 bg-[#0f1c2e] whitespace-nowrap">
              <span className="font-display font-bold text-sm sm:text-lg tracking-wide text-white">
                {snapshot.awayShort}
              </span>
              <span
                className="w-2 h-4 sm:w-2.5 sm:h-5 rounded-xs shrink-0"
                style={{ backgroundColor: snapshot.awayColor }}
              />
            </div>

            <div className="flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 bg-emerald-600 text-white font-display font-bold text-xs sm:text-base tabular-nums whitespace-nowrap">
              <span className="text-emerald-100 text-[10px] sm:text-xs">{halfLabel}</span>
              <span>
                {minStr}:{secStr}
              </span>
            </div>
          </div>

          {/* Top-Right Utility Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto shrink-0">
            <button
              type="button"
              tabIndex={-1}
              aria-label={`Camera: ${CAMERA_LABELS[snapshot.cameraMode]}`}
              onClick={(e) => {
                e.currentTarget.blur();
                onCycleCamera();
              }}
              className="h-9 sm:h-10 px-2.5 sm:px-3 rounded-md bg-[#09121e]/85 hover:bg-[#132238] border border-white/15 text-slate-100 text-xs font-semibold flex items-center gap-1.5 shadow-md whitespace-nowrap"
            >
              <Camera className="w-4 h-4 text-sky-400 shrink-0" />
              <span className="hidden sm:inline">{CAMERA_LABELS[snapshot.cameraMode]}</span>
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label={soundEnabled ? 'Mute sound' : 'Unmute sound'}
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleSound();
              }}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-md bg-[#09121e]/85 hover:bg-[#132238] border border-white/15 text-slate-100 flex items-center justify-center shadow-md"
            >
              {soundEnabled ? (
                <Volume2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <VolumeX className="w-4 h-4 text-slate-400" />
              )}
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label="Pause match"
              onClick={(e) => {
                e.currentTarget.blur();
                onPause();
              }}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-md bg-[#09121e]/85 hover:bg-[#132238] border border-white/15 text-slate-100 flex items-center justify-center shadow-md"
            >
              <Pause className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mobile Controlled Player Indicator (cleanly stacked under scoreboard on <sm) */}
        <div className="flex sm:hidden flex-col items-start gap-1">
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-[#09121e]/88 border border-white/15 shadow-md">
            <span className="font-display font-bold text-xs text-amber-400 tabular-nums">
              #{snapshot.controlledPlayerNumber}
            </span>
            <span className="text-[11px] font-semibold text-white whitespace-nowrap">
              {snapshot.controlledPlayerName}
            </span>
            <span className="text-[10px] text-slate-400 font-medium">
              {snapshot.controlledPlayerRole}
            </span>
            <div className="w-12 h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full transition-all duration-100 ${
                  snapshot.controlledStamina > 35 ? 'bg-emerald-400' : 'bg-amber-500'
                }`}
                style={{ width: `${snapshot.controlledStamina}%` }}
              />
            </div>
          </div>

          {snapshot.controlledShotCharge > 0.02 && (
            <div
              data-testid="shot-charge-bar-mobile"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#09121e]/92 border border-amber-400/50 shadow-md"
            >
              <span className="font-display font-bold text-[10px] tracking-wider text-amber-300 uppercase">
                PWR
              </span>
              <div className="w-20 h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className={`h-full transition-none ${
                    snapshot.controlledShotCharge > 0.78
                      ? 'bg-rose-500'
                      : snapshot.controlledShotCharge > 0.45
                        ? 'bg-amber-400'
                        : 'bg-emerald-400'
                  }`}
                  style={{ width: `${Math.round(snapshot.controlledShotCharge * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Live Replay Indicator + Skip */}
      {snapshot.isReplaying && (
        <div
          data-testid="replay-indicator"
          className="fixed top-16 sm:top-20 right-3 sm:right-5 flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#09121e]/92 border border-rose-500/70 shadow-xl pointer-events-auto"
        >
          <span className="w-1.5 h-3.5 rounded-xs bg-rose-500 shrink-0" />
          <span className="font-display font-bold text-xs sm:text-sm tracking-widest text-white uppercase">
            REPLAY
          </span>
          {onSkipReplay && (
            <button
              type="button"
              onClick={onSkipReplay}
              className="ml-1 px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[11px] font-semibold text-slate-200 flex items-center gap-1 cursor-pointer"
            >
              <FastForward className="w-3 h-3" />
              <span>Skip</span>
            </button>
          )}
        </div>
      )}

      {/* Set-Piece Banner */}
      {snapshot.setPieceBanner && (
        <div
          data-testid="set-piece-banner"
          className="fixed top-20 sm:top-18 left-1/2 -translate-x-1/2 px-5 py-2 rounded-md bg-[#09121e]/92 border border-sky-400/60 shadow-xl text-center whitespace-nowrap"
        >
          <div className="font-display font-extrabold text-lg sm:text-2xl tracking-wider text-sky-300 uppercase">
            {SET_PIECE_LABELS[snapshot.setPieceBanner.type]} · {snapshot.setPieceBanner.teamName}
          </div>
          <div className="text-[11px] sm:text-xs font-medium text-slate-200">
            {snapshot.setPieceBanner.hint}
          </div>
        </div>
      )}

      {/* Goal Celebration Banner */}
      {snapshot.goalBanner && (
        <div
          data-testid="goal-banner"
          className="fixed top-20 left-1/2 -translate-x-1/2 px-8 py-3 rounded-md bg-[#09121e]/95 border-2 border-amber-400 shadow-2xl text-center"
        >
          <div className="font-display font-extrabold text-3xl sm:text-4xl tracking-widest text-amber-400 uppercase">
            GOAL!
          </div>
          <div className="text-xs sm:text-sm font-semibold text-white mt-0.5">
            {snapshot.goalBanner.scorerName} · {snapshot.goalBanner.teamName} ({snapshot.goalBanner.minute}&apos;)
          </div>
        </div>
      )}

      {/* Half-Time Banner */}
      {snapshot.phase === 'halftime' && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 px-7 py-3 rounded-md bg-[#09121e]/95 border border-sky-400/50 shadow-xl text-center">
          <div className="font-display font-bold text-2xl tracking-wider text-white uppercase">
            HALF TIME
          </div>
          <div className="text-xs text-slate-300">Second half kicking off...</div>
        </div>
      )}

      {/* Bottom Center (Desktop/Tablet): Shot Gauge + Controlled Player + Radar */}
      <div className="hidden sm:flex fixed bottom-3 left-1/2 -translate-x-1/2 flex-col items-center gap-1.5 pointer-events-none">
        {snapshot.controlledShotCharge > 0.02 && (
          <div
            data-testid="shot-charge-bar"
            className="flex items-center gap-2 px-3 py-1 rounded-md bg-[#09121e]/92 border border-amber-400/60 shadow-lg"
          >
            <span className="font-display font-bold text-xs tracking-wider text-amber-300 uppercase">
              SHOT POWER
            </span>
            <div className="w-28 h-2.5 rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full transition-none ${
                  snapshot.controlledShotCharge > 0.78
                    ? 'bg-rose-500'
                    : snapshot.controlledShotCharge > 0.45
                      ? 'bg-amber-400'
                      : 'bg-emerald-400'
                }`}
                style={{ width: `${Math.round(snapshot.controlledShotCharge * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Controlled Player Name & Stamina + Active Tactics */}
        <div className="flex items-center gap-2.5 px-3 py-1 rounded-md bg-[#09121e]/88 border border-white/15 shadow-md">
          <span className="font-display font-bold text-sm text-amber-400 tabular-nums">
            #{snapshot.controlledPlayerNumber}
          </span>
          <span className="text-xs font-semibold text-white whitespace-nowrap">
            {snapshot.controlledPlayerName}
          </span>
          <span className="text-[11px] text-slate-400 font-medium">
            {snapshot.controlledPlayerRole}
          </span>
          <div className="w-20 h-2 rounded-full bg-slate-800 overflow-hidden">
            <div
              className={`h-full transition-all duration-100 ${
                snapshot.controlledStamina > 35 ? 'bg-emerald-400' : 'bg-amber-500'
              }`}
              style={{ width: `${snapshot.controlledStamina}%` }}
            />
          </div>
          <span className="text-[10px] font-semibold text-sky-300 border-l border-white/15 pl-2 uppercase whitespace-nowrap">
            {snapshot.homeFormation} · {snapshot.homeMentality.slice(0, 3)}
          </span>
        </div>

        {/* Live Radar Minimap */}
        <canvas
          ref={radarCanvasRef}
          width={148}
          height={86}
          aria-label="Pitch radar minimap"
          className="hidden md:block rounded border border-white/25 shadow-lg opacity-90"
        />
      </div>

      {/* Mobile / Touch Controls */}
      {showTouchControls && (
        <TouchControls
          inputManager={inputManager}
          hasBall={snapshot.controlledHasBall}
          shotCharge={snapshot.controlledShotCharge}
        />
      )}
    </div>
  );
}
