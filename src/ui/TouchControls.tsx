import { useRef, useState } from 'react';
import { InputManager } from '../controls/inputManager';
import { computeAnalogJoystickVector } from '../controls/joystickMath';

interface TouchControlsProps {
  inputManager: InputManager;
  hasBall: boolean;
  shotCharge: number;
}

function safeSetPointerCapture(el: HTMLElement, pointerId: number): void {
  try {
    if (typeof el.setPointerCapture === 'function') {
      el.setPointerCapture(pointerId);
    }
  } catch {
    // Ignore when pointer is synthetic or already released on mobile browsers
  }
}

export function TouchControls({ inputManager, hasBall, shotCharge }: TouchControlsProps) {
  const joyBaseRef = useRef<HTMLDivElement | null>(null);
  const joyPointerId = useRef<number | null>(null);
  const sprintPointerId = useRef<number | null>(null);
  const shootPointerId = useRef<number | null>(null);
  const pressPointerId = useRef<number | null>(null);

  const [knobOffset, setKnobOffset] = useState({ x: 0, y: 0 });
  const [joyActive, setJoyActive] = useState(false);
  const [joyAngleDeg, setJoyAngleDeg] = useState(0);
  const [sprintHeld, setSprintHeld] = useState(false);
  const [pressHeld, setPressHeld] = useState(false);
  const [shootHeld, setShootHeld] = useState(false);

  const updateJoystick = (clientX: number, clientY: number) => {
    const el = joyBaseRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const maxRadius = Math.max(30, rect.width * 0.37);

    const out = computeAnalogJoystickVector(clientX - cx, clientY - cy, maxRadius, 0.14);
    setKnobOffset({ x: out.knobX, y: out.knobY });
    setJoyActive(out.active);
    if (out.active) {
      setJoyAngleDeg((out.angle * 180) / Math.PI);
    }
    inputManager.setTouchJoystick(out.x, out.z);
  };

  const resetJoystick = () => {
    joyPointerId.current = null;
    setKnobOffset({ x: 0, y: 0 });
    setJoyActive(false);
    inputManager.setTouchJoystick(0, 0);
  };

  const releaseSprint = () => {
    sprintPointerId.current = null;
    setSprintHeld(false);
    inputManager.setTouchSprint(false);
  };

  const releasePress = () => {
    pressPointerId.current = null;
    setPressHeld(false);
    inputManager.setTouchPress(false);
  };

  const releaseShoot = () => {
    shootPointerId.current = null;
    setShootHeld(false);
    inputManager.setTouchShootHeld(false);
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-20 flex items-end justify-between px-4 sm:px-6 md:px-8 pb-[max(1rem,env(safe-area-inset-bottom))] md:pb-6 pointer-events-none select-none"
    >
      {/* Left Fixed 360° Analog Circular Joystick */}
      <div
        ref={joyBaseRef}
        data-testid="virtual-joystick"
        aria-label="Movement joystick"
        onPointerDown={(e) => {
          e.preventDefault();
          if (joyPointerId.current !== null) return;
          joyPointerId.current = e.pointerId;
          safeSetPointerCapture(e.currentTarget, e.pointerId);
          updateJoystick(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (joyPointerId.current === e.pointerId) {
            updateJoystick(e.clientX, e.clientY);
          }
        }}
        onPointerUp={(e) => {
          if (joyPointerId.current === e.pointerId) {
            resetJoystick();
          }
        }}
        onPointerCancel={(e) => {
          if (joyPointerId.current === e.pointerId) {
            resetJoystick();
          }
        }}
        className={`relative w-28 h-28 md:w-32 md:h-32 rounded-full pointer-events-auto flex items-center justify-center touch-none shadow-lg border-2 ${
          joyActive
            ? 'bg-[#09121e]/55 border-white/55'
            : 'bg-[#09121e]/42 border-white/28'
        }`}
      >
        {/* Inner precision ring & deadzone center dot */}
        <div className="absolute inset-3 rounded-full border border-white/15 pointer-events-none" />
        <div className="absolute w-2 h-2 rounded-full bg-white/20 pointer-events-none" />

        {/* Subtle 360° directional rim indicator outside thumbstick knob */}
        {joyActive && (
          <div
            className="absolute -inset-1 pointer-events-none"
            style={{ transform: `rotate(${joyAngleDeg}deg)` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rotate-45 border-t-2 border-r-2 border-sky-300 shadow-sm" />
          </div>
        )}

        {/* Analog Thumbstick Knob (instant drag response, smooth auto-center on release) */}
        <div
          style={{
            transform: `translate3d(${knobOffset.x}px, ${knobOffset.y}px, 0)`,
          }}
          className={`w-11 h-11 md:w-13 md:h-13 rounded-full border-2 shadow-md pointer-events-none ${
            joyActive
              ? 'bg-white/90 border-sky-300 transition-none'
              : 'bg-white/75 border-white/90 transition-transform duration-150 ease-out'
          }`}
        />
      </div>

      {/* Right Compact Circular Action Pad (all 6 actions unified around one thumb ring) */}
      <div className="flex items-end pointer-events-auto touch-none">
        <div
          data-testid="touch-action-circle"
          className="relative w-[176px] h-[176px] md:w-[200px] md:h-[200px] rounded-full bg-[#09121e]/24 border border-white/18 shrink-0 shadow-lg"
        >
          {/* Subtle inner guide ring unifying all 6 thumb actions into one circular cluster */}
          <div className="absolute inset-7 rounded-full border border-white/10 pointer-events-none" />

          {/* 12h (TOP): TIR (Shoot — hold to charge, release to shoot) */}
          <button
            type="button"
            aria-label="Tir"
            data-testid="touch-btn-shoot"
            onPointerDown={(e) => {
              e.preventDefault();
              if (shootPointerId.current !== null) return;
              shootPointerId.current = e.pointerId;
              safeSetPointerCapture(e.currentTarget, e.pointerId);
              setShootHeld(true);
              inputManager.setTouchShootHeld(true);
            }}
            onPointerUp={(e) => {
              if (shootPointerId.current === e.pointerId) {
                releaseShoot();
              }
            }}
            onPointerCancel={(e) => {
              if (shootPointerId.current === e.pointerId) {
                releaseShoot();
              }
            }}
            className={`absolute left-[50%] top-[16%] -translate-x-1/2 -translate-y-1/2 overflow-hidden w-[48px] h-[48px] md:w-[54px] md:h-[54px] rounded-full border-2 text-white font-display font-extrabold text-[11px] md:text-xs tracking-wider uppercase flex flex-col items-center justify-center shadow-lg touch-none cursor-pointer ${
              shootHeld
                ? 'bg-rose-500/85 border-amber-300 scale-95'
                : hasBall
                  ? 'bg-[#0b1726]/72 border-emerald-400/90 active:bg-emerald-500/80'
                  : 'bg-[#09121e]/64 border-white/45 active:bg-rose-500/80'
            }`}
          >
            {shotCharge > 0.02 && (
              <span
                className="absolute inset-x-0 bottom-0 bg-amber-400/60 pointer-events-none"
                style={{ height: `${Math.round(shotCharge * 100)}%` }}
              />
            )}
            <span className="relative z-10 leading-none">TIR</span>
            <span className="relative z-10 text-[7px] text-white/75 font-sans leading-none mt-0.5">
              SPC
            </span>
          </button>

          {/* 2h (UPPER-RIGHT): LOB */}
          <button
            type="button"
            aria-label="Lob Pass"
            data-testid="touch-btn-lob"
            onPointerDown={(e) => {
              e.preventDefault();
              inputManager.triggerLob();
            }}
            className="absolute left-[79.4%] top-[33%] -translate-x-1/2 -translate-y-1/2 w-[48px] h-[48px] md:w-[54px] md:h-[54px] rounded-full bg-[#09121e]/62 active:bg-sky-500/80 border-2 border-cyan-300/65 text-white font-display font-bold text-[10px] md:text-[11px] tracking-wider uppercase flex flex-col items-center justify-center shadow-lg touch-none cursor-pointer"
          >
            <span className="leading-none">LOB</span>
            <span className="text-[7px] text-white/70 font-sans leading-none mt-0.5">L</span>
          </button>

          {/* 4h (LOWER-RIGHT): PASSE */}
          <button
            type="button"
            aria-label="Passe"
            data-testid="touch-btn-pass"
            onPointerDown={(e) => {
              e.preventDefault();
              inputManager.triggerPass();
            }}
            className="absolute left-[79.4%] top-[67%] -translate-x-1/2 -translate-y-1/2 w-[48px] h-[48px] md:w-[54px] md:h-[54px] rounded-full bg-[#09121e]/65 active:bg-sky-500/85 border-2 border-sky-400/85 text-white font-display font-extrabold text-[10px] md:text-[11px] tracking-wider uppercase flex flex-col items-center justify-center shadow-lg touch-none cursor-pointer"
          >
            <span className="leading-none">PASSE</span>
            <span className="text-[7px] text-white/75 font-sans leading-none mt-0.5">K</span>
          </button>

          {/* 6h (BOTTOM): SPRINT */}
          <button
            type="button"
            aria-label="Sprint"
            data-testid="touch-btn-sprint"
            onPointerDown={(e) => {
              e.preventDefault();
              if (sprintPointerId.current !== null) return;
              sprintPointerId.current = e.pointerId;
              safeSetPointerCapture(e.currentTarget, e.pointerId);
              setSprintHeld(true);
              inputManager.setTouchSprint(true);
            }}
            onPointerUp={(e) => {
              if (sprintPointerId.current === e.pointerId) {
                releaseSprint();
              }
            }}
            onPointerCancel={(e) => {
              if (sprintPointerId.current === e.pointerId) {
                releaseSprint();
              }
            }}
            className={`absolute left-[50%] top-[84%] -translate-x-1/2 -translate-y-1/2 w-[48px] h-[48px] md:w-[54px] md:h-[54px] rounded-full border-2 font-display font-extrabold text-[10px] md:text-[11px] tracking-wider uppercase flex flex-col items-center justify-center shadow-lg touch-none cursor-pointer ${
              sprintHeld
                ? 'bg-emerald-500/85 border-white text-slate-950 scale-95'
                : 'bg-[#09121e]/64 border-white/45 text-white active:bg-emerald-500/80'
            }`}
          >
            <span className="leading-none">SPRINT</span>
            <span className="text-[7px] opacity-75 font-sans leading-none mt-0.5">SHIFT</span>
          </button>

          {/* 8h (LOWER-LEFT): CHANGER */}
          <button
            type="button"
            aria-label="Switch Player"
            data-testid="touch-btn-switch"
            onPointerDown={(e) => {
              e.preventDefault();
              inputManager.triggerSwitch();
            }}
            className="absolute left-[20.6%] top-[67%] -translate-x-1/2 -translate-y-1/2 w-[48px] h-[48px] md:w-[54px] md:h-[54px] rounded-full bg-[#09121e]/62 active:bg-indigo-500/80 border-2 border-indigo-400/70 text-white font-display font-bold text-[8px] md:text-[9px] tracking-wide uppercase flex flex-col items-center justify-center shadow-lg touch-none cursor-pointer"
          >
            <span className="leading-none">CHANGER</span>
            <span className="text-[7px] text-white/70 font-sans leading-none mt-0.5">Q</span>
          </button>

          {/* 10h (UPPER-LEFT): DÉFENSE / PRESSION */}
          <button
            type="button"
            aria-label="Défense / Pression"
            data-testid="touch-btn-defense"
            onPointerDown={(e) => {
              e.preventDefault();
              if (pressPointerId.current !== null) return;
              pressPointerId.current = e.pointerId;
              safeSetPointerCapture(e.currentTarget, e.pointerId);
              setPressHeld(true);
              inputManager.triggerTackle();
              inputManager.setTouchPress(true);
            }}
            onPointerUp={(e) => {
              if (pressPointerId.current === e.pointerId) {
                releasePress();
              }
            }}
            onPointerCancel={(e) => {
              if (pressPointerId.current === e.pointerId) {
                releasePress();
              }
            }}
            className={`absolute left-[20.6%] top-[33%] -translate-x-1/2 -translate-y-1/2 w-[48px] h-[48px] md:w-[54px] md:h-[54px] rounded-full border-2 font-display font-bold text-[9px] md:text-[10px] tracking-wide uppercase flex flex-col items-center justify-center shadow-lg touch-none cursor-pointer ${
              pressHeld
                ? 'bg-amber-500/85 border-white text-slate-950 scale-95'
                : 'bg-[#09121e]/64 border-amber-400/75 text-white active:bg-amber-500/80'
            }`}
          >
            <span className="leading-none">DÉFENSE</span>
            <span className="text-[7px] opacity-75 font-sans leading-none mt-0.5">T</span>
          </button>
        </div>
      </div>
    </div>
  );
}
