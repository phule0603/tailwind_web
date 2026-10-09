"use client";

import { useRef, useState, type PointerEvent, type RefObject } from "react";
import type { Pad } from "@/lib/engine/match";

/* On-screen joystick + SHOOT / PASS / SKILL buttons; they write into the player's pad. */

export default function TouchControls({ padRef, skillName }: { padRef: RefObject<Pad>; skillName: string }) {
  const baseRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const move = (e: PointerEvent) => {
    const base = baseRef.current;
    if (!base) return;
    const r = base.getBoundingClientRect();
    const max = r.width / 2;
    let dx = e.clientX - (r.left + max);
    let dy = e.clientY - (r.top + max);
    const len = Math.hypot(dx, dy);
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    setKnob({ x: dx, y: dy });
    const pad = padRef.current;
    const dead = len < max * 0.18;
    pad.mx = dead ? 0 : dx / max;
    pad.my = dead ? 0 : dy / max;
  };

  const release = () => {
    pointerRef.current = null;
    setKnob({ x: 0, y: 0 });
    padRef.current.mx = 0;
    padRef.current.my = 0;
  };

  const btn = "grid select-none place-items-center rounded-full border-2 font-bold active:scale-95 touch-none";

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-between p-4 pb-6 [@media(pointer:fine)]:hidden">
      <div
        ref={baseRef}
        className="pointer-events-auto relative h-32 w-32 touch-none rounded-full border-2 border-white/25 bg-black/30"
        onPointerDown={(e) => {
          pointerRef.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          move(e);
        }}
        onPointerMove={(e) => {
          if (pointerRef.current === e.pointerId) move(e);
        }}
        onPointerUp={release}
        onPointerCancel={release}
      >
        <div
          className="absolute left-1/2 top-1/2 h-14 w-14 rounded-full border-2 border-white/60 bg-white/25"
          style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
        />
      </div>
      <div className="pointer-events-auto grid grid-cols-2 gap-3">
        <button
          type="button"
          className={`${btn} col-span-2 h-12 border-sky-300/70 bg-sky-500/30 text-xs`}
          onPointerDown={() => {
            padRef.current.skill = true;
          }}
        >
          {skillName}
        </button>
        <button
          type="button"
          className={`${btn} h-16 w-16 border-emerald-300/70 bg-emerald-500/30 text-xs`}
          onPointerDown={() => {
            padRef.current.pass = true;
          }}
        >
          CHUYỀN
        </button>
        <button
          type="button"
          className={`${btn} h-20 w-20 border-yellow-300/80 bg-yellow-500/35 text-sm`}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            padRef.current.shoot = true;
          }}
          onPointerUp={() => {
            padRef.current.shoot = false;
          }}
          onPointerCancel={() => {
            padRef.current.shoot = false;
          }}
        >
          SÚT
        </button>
      </div>
    </div>
  );
}
