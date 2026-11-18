import { useRef, useState } from 'react';
import { InputManager } from '../controls/inputManager';

interface TouchControlsProps {
  inputManager: InputManager;
  hasBall: boolean;
  shotCharge: number;
}

export function TouchControls({ inputManager, hasBall, shotCharge }: TouchControlsProps) {
  const joyBaseRef = useRef<HTMLDivElement | null>(null);
  const activePointerId = useRef<number | null>(null);
  const [knobOffset, setKnobOffset] = useState({ x: 0, y: 0 });
  const [sprintHeld, setSprintHeld] = useState(false);

  const maxRadius = 42;

  const updateJoystick = (clientX: number, clientY: number) => {
    const el = joyBaseRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }
    setKnobOffset({ x: dx, y: dy });
    inputManager.setTouchJoystick(dx / maxRadius, dy / maxRadius);
  };

  const resetJoystick = () => {
    activePointerId.current = null;
    setKnobOffset({ x: 0, y: 0 });
    inputManager.setTouchJoystick(0, 0);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 flex items-end justify-between px-4 pb-4 sm:px-7 sm:pb-6 pointer-events-none">
      {/* Left Virtual Analog Joystick */}
      <div
        ref={joyBaseRef}
        data-testid="virtual-joystick"
        aria-label="Movement joystick"
        onPointerDown={(e) => {
          e.preventDefault();
          activePointerId.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          updateJoystick(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (activePointerId.current === e.pointerId) {
            updateJoystick(e.clientX, e.clientY);
          }
        }}
        onPointerUp={(e) => {
          if (activePointerId.current === e.pointerId) {
            resetJoystick();
          }
        }}
        onPointerCancel={resetJoystick}
        className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-full border border-white/25 bg-[#09121e]/60 pointer-events-auto flex items-center justify-center touch-none shadow-lg"
      >
        {/* Crosshair guides */}
        <div className="absolute inset-4 rounded-full border border-white/10 pointer-events-none" />
        <div
          style={{
            transform: `translate3d(${knobOffset.x}px, ${knobOffset.y}px, 0)`,
          }}
          className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-sky-400/90 border-2 border-white shadow-md pointer-events-none transition-transform duration-75"
        />
      </div>

      {/* Right Action Buttons Cluster */}
      <div className="grid grid-cols-3 gap-2 sm:gap-2.5 items-end pointer-events-auto touch-none">
        {/* Row 1: Lob Pass, Switch, Sprint */}
        <button
          type="button"
          aria-label="Lob Pass"
          onPointerDown={(e) => {
            e.preventDefault();
            inputManager.triggerLob();
          }}
          className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-[#0b1626]/75 active:bg-sky-500 border border-white/25 text-white font-display font-bold text-xs tracking-wider uppercase flex flex-col items-center justify-center shadow-md touch-none"
        >
          <span>LOB</span>
          <span className="text-[9px] text-slate-300 font-sans">L</span>
        </button>

        <button
          type="button"
          aria-label="Switch Player"
          onPointerDown={(e) => {
            e.preventDefault();
            inputManager.triggerSwitch();
          }}
          className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-[#0b1626]/75 active:bg-indigo-500 border border-white/25 text-white font-display font-bold text-xs tracking-wider uppercase flex flex-col items-center justify-center shadow-md touch-none"
        >
          <span>SWITCH</span>
          <span className="text-[9px] text-slate-300 font-sans">Q</span>
        </button>

        <button
          type="button"
          aria-label="Sprint"
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            setSprintHeld(true);
            inputManager.setTouchSprint(true);
          }}
          onPointerUp={() => {
            setSprintHeld(false);
            inputManager.setTouchSprint(false);
          }}
          onPointerCancel={() => {
            setSprintHeld(false);
            inputManager.setTouchSprint(false);
          }}
          className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full border font-display font-bold text-xs tracking-wider uppercase flex flex-col items-center justify-center shadow-md touch-none ${
            sprintHeld
              ? 'bg-amber-500 border-white text-slate-950'
              : 'bg-[#0b1626]/75 border-white/25 text-white'
          }`}
        >
          <span>SPRINT</span>
          <span className="text-[9px] opacity-75 font-sans">SHIFT</span>
        </button>

        {/* Row 2: Tackle, Pass, Shoot */}
        <button
          type="button"
          aria-label="Tackle"
          onPointerDown={(e) => {
            e.preventDefault();
            inputManager.triggerTackle();
          }}
          className="w-13 h-13 sm:w-15 sm:h-15 rounded-full bg-amber-600/85 active:bg-amber-500 border border-white/30 text-white font-display font-bold text-xs tracking-wider uppercase flex flex-col items-center justify-center shadow-md touch-none"
        >
          <span>TACKLE</span>
          <span className="text-[9px] text-amber-100 font-sans">T</span>
        </button>

        <button
          type="button"
          aria-label="Pass"
          onPointerDown={(e) => {
            e.preventDefault();
            inputManager.triggerPass();
          }}
          className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-sky-600/90 active:bg-sky-400 border-2 border-white/40 text-white font-display font-bold text-sm tracking-wider uppercase flex flex-col items-center justify-center shadow-lg touch-none"
        >
          <span>PASS</span>
          <span className="text-[10px] text-sky-100 font-sans">K</span>
        </button>

        <button
          type="button"
          aria-label="Shoot"
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            inputManager.setTouchShootHeld(true);
          }}
          onPointerUp={() => {
            inputManager.setTouchShootHeld(false);
          }}
          onPointerCancel={() => {
            inputManager.setTouchShootHeld(false);
          }}
          className={`relative overflow-hidden w-15 h-15 sm:w-17 sm:h-17 rounded-full border-2 text-white font-display font-bold text-sm tracking-wider uppercase flex flex-col items-center justify-center shadow-lg touch-none ${
            hasBall
              ? 'bg-emerald-500 active:bg-emerald-400 border-white'
              : 'bg-rose-600/85 active:bg-rose-500 border-white/40'
          }`}
        >
          {shotCharge > 0.02 && (
            <span
              className="absolute inset-x-0 bottom-0 bg-amber-300/55 pointer-events-none"
              style={{ height: `${Math.round(shotCharge * 100)}%` }}
            />
          )}
          <span className="relative z-10">SHOOT</span>
          <span className="relative z-10 text-[10px] text-white/90 font-sans">SPC</span>
        </button>
      </div>
    </div>
  );
}
