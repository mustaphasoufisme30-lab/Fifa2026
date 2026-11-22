import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  ChevronsUp,
  Crosshair,
  RefreshCw,
  Send,
  Shield,
  Target,
  Zap,
} from 'lucide-react';
import { ControlPadMode } from '../core/types';
import { InputManager } from '../controls/inputManager';
import { computeAnalogJoystickVector } from '../controls/joystickMath';

interface TouchControlsProps {
  inputManager: InputManager;
  hasBall: boolean;
  shotCharge: number;
  controlMode: ControlPadMode;
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

export function TouchControls({
  inputManager,
  hasBall,
  shotCharge,
  controlMode,
}: TouchControlsProps) {
  const joyBaseRef = useRef<HTMLDivElement | null>(null);
  const joyPointerId = useRef<number | null>(null);
  const sprintPointerId = useRef<number | null>(null);
  const topPointerId = useRef<number | null>(null);
  const upperLeftPointerId = useRef<number | null>(null);
  const prevModeRef = useRef<ControlPadMode>(controlMode);

  const [knobOffset, setKnobOffset] = useState({ x: 0, y: 0 });
  const [joyActive, setJoyActive] = useState(false);
  const [joyAngleDeg, setJoyAngleDeg] = useState(0);

  const [sprintHeld, setSprintHeld] = useState(false);
  const [pressHeld, setPressHeld] = useState(false);
  const [shootHeld, setShootHeld] = useState(false);
  const [modeTransitioning, setModeTransitioning] = useState(false);

  const isAttack = controlMode === 'ATTACK';

  // Safely release mode-specific held inputs and run a brief non-blocking transition pulse on mode switch.
  useEffect(() => {
    if (prevModeRef.current === controlMode) return;
    prevModeRef.current = controlMode;

    if (controlMode !== 'ATTACK') {
      topPointerId.current = null;
      setShootHeld(false);
      inputManager.setTouchShootHeld(false);
    }
    if (controlMode !== 'DEFENSE') {
      upperLeftPointerId.current = null;
      setPressHeld(false);
      inputManager.setTouchPress(false);
    }

    setModeTransitioning(true);
    const timer = window.setTimeout(() => {
      setModeTransitioning(false);
    }, 150);

    return () => window.clearTimeout(timer);
  }, [controlMode, inputManager]);

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
    upperLeftPointerId.current = null;
    setPressHeld(false);
    inputManager.setTouchPress(false);
  };

  const releaseShoot = () => {
    topPointerId.current = null;
    setShootHeld(false);
    inputManager.setTouchShootHeld(false);
  };

  const transitionScaleClass = modeTransitioning ? 'scale-95 opacity-85' : 'scale-100 opacity-100';

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 flex items-end justify-between px-4 sm:px-6 md:px-8 pb-[max(0.85rem,env(safe-area-inset-bottom))] md:pb-6 pointer-events-none select-none">
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

        {/* Analog Thumbstick Knob */}
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

      {/* Right Dynamic 4-Button Circular Action Pad (Auto ATTACK / DEFENSE) */}
      <div className="flex items-end pointer-events-auto touch-none">
        <div
          data-testid="touch-action-circle"
          data-control-mode={controlMode}
          className="relative w-[178px] h-[178px] md:w-[206px] md:h-[206px] shrink-0"
        >
          {/* SLOT 1 — TOP-RIGHT (RED): TIR [ATTACK] <-> TACLE [DEFENSE] */}
          <button
            type="button"
            aria-label={isAttack ? 'Tir' : 'Tacle'}
            data-testid="touch-btn-top"
            data-action={isAttack ? 'shoot' : 'tackle'}
            onPointerDown={(e) => {
              e.preventDefault();
              if (isAttack) {
                if (topPointerId.current !== null) return;
                topPointerId.current = e.pointerId;
                safeSetPointerCapture(e.currentTarget, e.pointerId);
                setShootHeld(true);
                inputManager.setTouchShootHeld(true);
              } else {
                inputManager.triggerTackle();
              }
            }}
            onPointerUp={(e) => {
              if (topPointerId.current === e.pointerId) {
                releaseShoot();
              }
            }}
            onPointerCancel={(e) => {
              if (topPointerId.current === e.pointerId) {
                releaseShoot();
              }
            }}
            className={`absolute left-[78%] top-[24%] -translate-x-1/2 -translate-y-1/2 overflow-hidden w-[56px] h-[56px] md:w-[64px] md:h-[64px] rounded-full border-2 text-white font-display font-extrabold tracking-wider uppercase flex flex-col items-center justify-center shadow-[0_6px_18px_rgba(0,0,0,0.45)] touch-none cursor-pointer transition-all duration-150 ease-out ${transitionScaleClass} ${
              isAttack
                ? shootHeld
                  ? 'bg-rose-500/85 border-amber-300 scale-95'
                  : hasBall
                    ? 'bg-rose-950/65 border-rose-400/95 active:bg-rose-500/80'
                    : 'bg-[#1a0d14]/65 border-rose-400/75 active:bg-rose-500/80'
                : 'bg-red-950/65 border-red-400/95 active:bg-red-500/85 active:scale-95'
            }`}
          >
            {/* Concentric APEX tactical ring */}
            <span className="absolute inset-1 rounded-full border border-white/15 pointer-events-none" />
            {isAttack && shotCharge > 0.02 && (
              <span
                className="absolute inset-x-0 bottom-0 bg-amber-400/65 pointer-events-none"
                style={{ height: `${Math.round(shotCharge * 100)}%` }}
              />
            )}
            <span className="relative z-10 flex flex-col items-center justify-center">
              {isAttack ? (
                <Target className="w-3.5 h-3.5 md:w-4 md:h-4 text-rose-200 mb-0.5" />
              ) : (
                <Zap className="w-3.5 h-3.5 md:w-4 md:h-4 text-red-200 mb-0.5" />
              )}
              <span className="text-[10px] md:text-[11px] leading-none">
                {isAttack ? 'TIR' : 'TACLE'}
              </span>
            </span>
          </button>

          {/* SLOT 2 — UPPER-LEFT (AMBER): PROFOND. [ATTACK] <-> PRESSING [DEFENSE] */}
          <button
            type="button"
            aria-label={isAttack ? 'Passe en profondeur' : 'Pressing'}
            data-testid="touch-btn-upper-left"
            data-action={isAttack ? 'through' : 'press'}
            onPointerDown={(e) => {
              e.preventDefault();
              if (isAttack) {
                inputManager.triggerLob();
              } else {
                if (upperLeftPointerId.current !== null) return;
                upperLeftPointerId.current = e.pointerId;
                safeSetPointerCapture(e.currentTarget, e.pointerId);
                setPressHeld(true);
                inputManager.setTouchPress(true);
              }
            }}
            onPointerUp={(e) => {
              if (upperLeftPointerId.current === e.pointerId) {
                releasePress();
              }
            }}
            onPointerCancel={(e) => {
              if (upperLeftPointerId.current === e.pointerId) {
                releasePress();
              }
            }}
            className={`absolute left-[33%] top-[36%] -translate-x-1/2 -translate-y-1/2 overflow-hidden w-[56px] h-[56px] md:w-[64px] md:h-[64px] rounded-full border-2 font-display font-extrabold tracking-wide uppercase flex flex-col items-center justify-center shadow-[0_6px_18px_rgba(0,0,0,0.45)] touch-none cursor-pointer transition-all duration-150 ease-out ${transitionScaleClass} ${
              isAttack
                ? 'bg-amber-950/65 border-amber-400/90 text-white active:bg-amber-500/85 active:scale-95'
                : pressHeld
                  ? 'bg-amber-400/90 border-white text-slate-950 scale-95'
                  : 'bg-orange-950/68 border-orange-400/95 text-white active:bg-orange-500/85'
            }`}
          >
            <span className="absolute inset-1 rounded-full border border-white/15 pointer-events-none" />
            <span className="relative z-10 flex flex-col items-center justify-center">
              {isAttack ? (
                <Send className="w-3.5 h-3.5 md:w-4 md:h-4 text-amber-200 mb-0.5" />
              ) : (
                <Crosshair
                  className={`w-3.5 h-3.5 md:w-4 md:h-4 mb-0.5 ${
                    pressHeld ? 'text-slate-950' : 'text-orange-200'
                  }`}
                />
              )}
              <span className="text-[8.5px] md:text-[9.5px] leading-none">
                {isAttack ? 'PROFOND.' : 'PRESSING'}
              </span>
            </span>
          </button>

          {/* SLOT 3 — BOTTOM-LEFT (BLUE): PASSE [ATTACK] <-> SÉLECT. [DEFENSE] */}
          <button
            type="button"
            aria-label={isAttack ? 'Passe' : 'Sélectionner joueur'}
            data-testid="touch-btn-lower-left"
            data-action={isAttack ? 'pass' : 'select'}
            onPointerDown={(e) => {
              e.preventDefault();
              if (isAttack) {
                inputManager.triggerPass();
              } else {
                inputManager.triggerSwitch();
              }
            }}
            className={`absolute left-[22%] top-[79%] -translate-x-1/2 -translate-y-1/2 overflow-hidden w-[56px] h-[56px] md:w-[64px] md:h-[64px] rounded-full border-2 text-white font-display font-extrabold tracking-wide uppercase flex flex-col items-center justify-center shadow-[0_6px_18px_rgba(0,0,0,0.45)] touch-none cursor-pointer transition-all duration-150 ease-out ${transitionScaleClass} ${
              isAttack
                ? 'bg-sky-950/65 border-sky-400/95 active:bg-sky-500/85 active:scale-95'
                : 'bg-indigo-950/68 border-sky-300/90 active:bg-indigo-500/85 active:scale-95'
            }`}
          >
            <span className="absolute inset-1 rounded-full border border-white/15 pointer-events-none" />
            <span className="relative z-10 flex flex-col items-center justify-center">
              {isAttack ? (
                <ArrowUpRight className="w-3.5 h-3.5 md:w-4 md:h-4 text-sky-200 mb-0.5" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 md:w-4 md:h-4 text-indigo-200 mb-0.5" />
              )}
              <span className="text-[9.5px] md:text-[10.5px] leading-none">
                {isAttack ? 'PASSE' : 'SÉLECT.'}
              </span>
            </span>
          </button>

          {/* SLOT 4 — BOTTOM-RIGHT ANCHOR (GREEN): SPRINT [ATTACK] <-> DÉFENSE [DEFENSE] */}
          <button
            type="button"
            aria-label={isAttack ? 'Sprint' : 'Défense'}
            data-testid="touch-btn-bottom"
            data-action={isAttack ? 'sprint' : 'defense'}
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
            className={`absolute left-[76%] top-[76%] -translate-x-1/2 -translate-y-1/2 overflow-hidden w-[68px] h-[68px] md:w-[78px] md:h-[78px] rounded-full border-2 font-display font-extrabold tracking-wider uppercase flex flex-col items-center justify-center shadow-[0_8px_22px_rgba(0,0,0,0.5)] touch-none cursor-pointer transition-all duration-150 ease-out ${transitionScaleClass} ${
              sprintHeld
                ? 'bg-emerald-400/90 border-white text-slate-950 scale-95'
                : isAttack
                  ? 'bg-emerald-950/68 border-emerald-400/95 text-white active:bg-emerald-500/85'
                  : 'bg-teal-950/68 border-emerald-300/90 text-white active:bg-teal-500/85'
            }`}
          >
            <span className="absolute inset-1.5 rounded-full border border-white/15 pointer-events-none" />
            <span className="relative z-10 flex flex-col items-center justify-center">
              {isAttack ? (
                <ChevronsUp
                  className={`w-4 h-4 md:w-5 md:h-5 mb-0.5 ${
                    sprintHeld ? 'text-slate-950' : 'text-emerald-200'
                  }`}
                />
              ) : (
                <Shield
                  className={`w-4 h-4 md:w-5 md:h-5 mb-0.5 ${
                    sprintHeld ? 'text-slate-950' : 'text-teal-200'
                  }`}
                />
              )}
              <span className="text-[10px] md:text-[11px] leading-none">
                {isAttack ? 'SPRINT' : 'DÉFENSE'}
              </span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
