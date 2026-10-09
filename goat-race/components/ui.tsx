"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { HEROES, type HeroId } from "@/lib/heroes";

/* Small shared UI pieces for the menu screens. */

type Tone = "gold" | "cr7" | "lm10" | "ghost";

const TONES: Record<Tone, string> = {
  gold: "bg-gold text-black hover:bg-yellow-300 border-gold",
  cr7: "bg-gradient-to-r from-yellow-500 to-amber-600 text-black border-yellow-300 hover:brightness-110",
  lm10: "bg-gradient-to-r from-sky-400 to-blue-600 text-white border-sky-200 hover:brightness-110",
  ghost: "bg-white/5 text-white border-white/20 hover:bg-white/10",
};

export function Button({
  tone = "ghost",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return (
    <button
      type="button"
      {...rest}
      className={`rounded-lg border px-4 py-2 text-sm font-bold uppercase tracking-wider transition disabled:cursor-not-allowed disabled:opacity-40 ${TONES[tone]} ${className}`}
    >
      {children}
    </button>
  );
}

/** A full-screen overlay screen that scrolls on small devices. */
export function Screen({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className="absolute inset-0 z-20 overflow-y-auto bg-gradient-to-b from-void/80 via-void/70 to-void/90 backdrop-blur-[2px]">
      <div className={`mx-auto flex min-h-full w-full max-w-5xl flex-col gap-4 px-4 pb-5 pt-16 xl:pt-5 animate-[fadeIn_0.25s_ease-out] ${className}`}>
        {children}
      </div>
    </div>
  );
}

export function Header({ title, onBack, right }: { title: ReactNode; onBack?: () => void; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      {onBack && (
        <Button onClick={onBack} aria-label="Quay lại" className="px-3">
          ←
        </Button>
      )}
      <h2 className="flex-1 text-xl font-bold italic tracking-wide sm:text-2xl">{title}</h2>
      {right}
    </div>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-white/10 bg-slate-950/80 p-4 ${className}`}>{children}</div>;
}

/** A crest with the shirt number in the hero's colours. */
export function HeroCrest({ hero, size = 56 }: { hero: HeroId; size?: number }) {
  const h = HEROES[hero];
  return (
    <div
      className="relative grid shrink-0 place-items-center rounded-full border-2 font-bold italic"
      style={{
        width: size,
        height: size,
        borderColor: h.accent,
        background: `radial-gradient(circle at 35% 30%, ${h.colors.shirt}, ${h.colors.shorts})`,
        color: hero === "cr7" ? "#111827" : "#0f172a",
        boxShadow: `0 0 ${size / 3}px ${h.accent}55`,
        fontSize: size * 0.42,
      }}
    >
      <span style={{ textShadow: `0 0 6px ${h.colors.trim}` }}>{h.number}</span>
    </div>
  );
}

export function StatBar({ label, value, prev, color }: { label: string; value: number; prev?: number; color: string }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr_2rem] items-center gap-2 text-xs">
      <span className="text-slate-300">{label}</span>
      <div className="relative h-2 overflow-hidden rounded-full bg-white/10">
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${value}%`, background: color }} />
        {prev !== undefined && prev < value && (
          <div className="absolute inset-y-0 rounded-full bg-white/70" style={{ left: `${prev}%`, width: `${value - prev}%` }} />
        )}
      </div>
      <span className="text-right font-bold tabular-nums">{value}</span>
    </div>
  );
}

export const fmt = (n: number) => n.toLocaleString("vi-VN");
