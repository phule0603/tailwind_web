"use client";

import { useState } from "react";
import { Button, HeroCrest, Panel, Screen } from "@/components/ui";
import { careerPoints, isGoat, type Profile } from "@/hooks/useProfile";
import { HEROES, HERO_IDS, type HeroId } from "@/lib/heroes";
import { NAME_MAX_LENGTH } from "@/lib/leaderboard/shared";

export type MenuTarget = "career" | "quick" | "pvp" | "legacy";

export function NameField({ name, onSave }: { name: string; onSave: (name: string) => boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const value = draft ?? name;
  const commit = () => {
    if (draft === null) return;
    if (onSave(draft)) {
      setDraft(null);
      setBad(false);
    } else setBad(true);
  };
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        commit();
        (document.activeElement as HTMLElement | null)?.blur();
      }}
    >
      <input
        value={value}
        onChange={(e) => {
          setDraft(e.target.value);
          setBad(false);
        }}
        onBlur={commit}
        maxLength={NAME_MAX_LENGTH * 2}
        placeholder="Tên của bạn"
        aria-label="Tên người chơi"
        className={`min-w-0 flex-1 rounded-lg border bg-black/50 px-3 py-2 text-sm font-semibold outline-none focus:border-gold ${
          bad ? "border-red-500" : "border-white/20"
        }`}
      />
      <Button type="submit" tone="gold" className="px-3">
        Lưu
      </Button>
    </form>
  );
}

const MODES: { id: MenuTarget; title: string; text: string; icon: string }[] = [
  { id: "career", title: "Career Mode", text: "Tái hiện những đêm huyền thoại: El Clásico, Champions League, World Cup.", icon: "📜" },
  { id: "pvp", title: "PvP Rivalry", text: "1v1 trên cùng bàn phím — Messi đối đầu Ronaldo, ai gánh team tốt hơn?", icon: "⚔️" },
  { id: "legacy", title: "Legacy Mode", text: "Bảng thống kê kỷ lục toàn cầu cập nhật theo thời gian thực.", icon: "📊" },
  { id: "quick", title: "Đá nhanh", text: "Một trận 90 giây với độ khó tuỳ chọn.", icon: "⚡" },
];

export default function MainMenu({
  profile,
  onName,
  onOpen,
}: {
  profile: Profile;
  onName: (name: string) => boolean;
  onOpen: (target: MenuTarget) => void;
}) {
  return (
    <Screen className="justify-center">
      <div className="text-center">
        <p className="text-xs font-semibold tracking-[0.5em] text-slate-300 sm:text-sm">CLASH OF TITANS</p>
        <h1 className="gold-text text-6xl font-bold italic leading-none tracking-tight sm:text-8xl short:text-5xl">
          GOAT RACE
        </h1>
        <p className="mt-2 text-sm text-slate-300">Thế giới bóng đá chia làm hai nửa — nhưng chỉ có một đỉnh cao.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {HERO_IDS.map((id: HeroId) => {
          const h = HEROES[id];
          const c = profile.career[id];
          const t = profile.totals[id];
          return (
            <Panel key={id} className="flex items-center gap-3 p-3!">
              <HeroCrest hero={id} size={52} />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold" style={{ color: h.accent }}>
                  {h.short} <span className="text-slate-400">· {h.nickname}</span>
                </p>
                <p className="text-xs text-slate-300">
                  ⚽ {t.goals} · 🅰 {t.assists} · 🏆 {t.trophies}
                </p>
                <p className="text-[11px] text-slate-400">
                  {isGoat(c) ? <span className="font-bold text-gold">👑 THE GOAT</span> : `${careerPoints(c)} điểm sự nghiệp`}
                </p>
              </div>
            </Panel>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onOpen(m.id)}
            className="group flex items-start gap-3 rounded-xl border border-white/10 bg-slate-950/80 p-4 text-left transition hover:border-gold/70 hover:bg-slate-900"
          >
            <span className="text-3xl">{m.icon}</span>
            <span>
              <span className="block text-lg font-bold italic group-hover:text-gold">{m.title}</span>
              <span className="block text-xs text-slate-300">{m.text}</span>
            </span>
          </button>
        ))}
      </div>

      <Panel className="flex flex-col gap-2 p-3! sm:flex-row sm:items-center">
        <p className="text-xs font-semibold text-slate-300 sm:w-56">Tên trên bảng xếp hạng toàn cầu</p>
        <div className="flex-1">
          <NameField name={profile.name} onSave={onName} />
        </div>
      </Panel>
    </Screen>
  );
}
