"use client";

import { useState } from "react";
import { Button, Header, HeroCrest, Panel, Screen, StatBar } from "@/components/ui";
import { careerPoints, isGoat, type Profile } from "@/hooks/useProfile";
import { stagesFor, TROPHY_LABELS, type Stage } from "@/lib/career";
import { GOAT_TITLE_POINTS } from "@/lib/game-config";
import {
  drillCost,
  effectiveStats,
  HEROES,
  HERO_IDS,
  MAX_DRILL_LEVEL,
  STAT_LABELS,
  type HeroId,
  type StatKey,
} from "@/lib/heroes";

function Objective({ goals, assists }: { goals: number; assists: number }) {
  const parts = [];
  if (goals) parts.push(`${goals} bàn`);
  if (assists) parts.push(`${assists} kiến tạo`);
  return <>{parts.join(" + ")}</>;
}

function StageCard({
  stage,
  index,
  locked,
  record,
  onPlay,
}: {
  stage: Stage;
  index: number;
  locked: boolean;
  record?: { best: number; trophy: boolean; ballonDor: boolean };
  onPlay: () => void;
}) {
  const accent = HEROES[stage.hero].accent;
  const trophy = TROPHY_LABELS[stage.trophy];
  return (
    <li
      className={`relative flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center ${
        locked ? "border-white/5 bg-slate-950/60 opacity-50" : "border-white/10 bg-slate-950/85"
      }`}
    >
      <div className="flex items-center gap-3 sm:w-24 sm:flex-col sm:items-start sm:gap-0">
        <span className="text-2xl font-bold italic" style={{ color: accent }}>
          {stage.year}
        </span>
        <span className="text-[11px] text-slate-400">
          #{index + 1} · {stage.age} tuổi
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-bold italic">{stage.title}</p>
        <p className="text-xs text-slate-300">
          {stage.club} vs {stage.opponent} · {stage.stadium} · {"★".repeat(stage.difficulty)}
          <span className="text-slate-600">{"★".repeat(5 - stage.difficulty)}</span>
        </p>
        <p className="mt-1 text-xs text-slate-400">{stage.story}</p>
        <p className="mt-1 text-xs">
          <span className="text-slate-400">Mục tiêu: </span>
          <span className="font-bold text-white">
            <Objective {...stage.objective} />
          </span>
          <span className="text-slate-400"> → {trophy.icon} {trophy.name}</span>
          {stage.ballonDor && (
            <>
              <span className="text-slate-400"> · Xuất sắc: </span>
              <span className="font-bold text-gold">
                <Objective {...stage.ballonDor} />
              </span>
              <span className="text-slate-400"> → ⚽ Quả bóng Vàng</span>
            </>
          )}
        </p>
      </div>
      <div className="flex items-center gap-3 sm:flex-col sm:items-end">
        <div className="flex gap-1 text-lg" aria-label="Danh hiệu đã giành">
          <span className={record?.trophy ? "" : "opacity-20 grayscale"}>{trophy.icon}</span>
          {stage.ballonDor && <span className={record?.ballonDor ? "" : "opacity-20 grayscale"}>⚽</span>}
        </div>
        {record?.best ? <span className="text-xs text-slate-400">Kỷ lục {record.best}</span> : null}
        <Button tone={stage.hero} disabled={locked} onClick={onPlay} className="ml-auto sm:ml-0">
          {locked ? "🔒 Khoá" : record?.trophy ? "Đá lại" : "Thi đấu"}
        </Button>
      </div>
    </li>
  );
}

function Training({ hero, profile, onTrain }: { hero: HeroId; profile: Profile; onTrain: (drill: string) => void }) {
  const def = HEROES[hero];
  const career = profile.career[hero];
  const stats = effectiveStats(hero, 28, career.training);
  const at40 = effectiveStats(hero, 40, career.training);
  return (
    <Panel className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold italic" style={{ color: def.accent }}>
          {hero === "cr7" ? "🏋️ Giáo án The Machine" : "🎩 Giáo án The Magician"}
        </h3>
        <span className="rounded-md bg-gold/15 px-2 py-1 text-xs font-bold text-gold">{career.points} điểm tập</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {def.drills.map((d) => {
          const level = career.training[d.id] ?? 0;
          const cost = drillCost(level + 1);
          const maxed = level >= MAX_DRILL_LEVEL;
          return (
            <div key={d.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/30 p-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">{d.name}</p>
                <p className="text-[11px] text-slate-400">{d.description}</p>
                <p className="mt-1 text-[11px] tracking-widest" style={{ color: def.accent }}>
                  {"■".repeat(level)}
                  <span className="text-slate-700">{"■".repeat(MAX_DRILL_LEVEL - level)}</span>
                </p>
              </div>
              <Button
                tone={maxed ? "ghost" : "gold"}
                disabled={maxed || career.points < cost}
                onClick={() => onTrain(d.id)}
                className="px-2 text-xs"
              >
                {maxed ? "MAX" : `+1 (${cost})`}
              </Button>
            </div>
          );
        })}
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-x-6">
        {(Object.keys(STAT_LABELS) as StatKey[]).map((k) => (
          <StatBar key={k} label={STAT_LABELS[k]} value={stats[k]} prev={def.base[k]} color={def.accent} />
        ))}
      </div>
      <p className="text-[11px] text-slate-400">
        Tuổi 40: Tốc độ {at40.pace} · Thể lực {at40.stamina} · Lực sút {at40.power} — sau 32 tuổi chỉ số thể chất giảm dần,
        {hero === "cr7" ? " bài tập Bồn đá & ngủ 5 giấc" : " bài tập Đọc trận đấu"} làm chậm quá trình lão hoá. Hoàn thành chặng
        đấu để nhận điểm tập.
      </p>
    </Panel>
  );
}

export default function CareerScreen({
  profile,
  hero: initialHero,
  onBack,
  onPlay,
  onTrain,
}: {
  profile: Profile;
  hero: HeroId;
  onBack: () => void;
  onPlay: (stage: Stage) => void;
  onTrain: (hero: HeroId, drill: string) => void;
}) {
  const [hero, setHero] = useState<HeroId>(initialHero);
  const [tab, setTab] = useState<"stages" | "training">("stages");
  const def = HEROES[hero];
  const career = profile.career[hero];
  const stages = stagesFor(hero);
  const points = careerPoints(career);
  const goat = isGoat(career);
  const trophies = stages.filter((s) => career.stages[s.id]?.trophy).length;
  const ballons = stages.filter((s) => career.stages[s.id]?.ballonDor).length;

  return (
    <Screen>
      <Header title="📜 Career Mode — Đua tranh lịch sử" onBack={onBack} />
      <div className="grid grid-cols-2 gap-2">
        {HERO_IDS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setHero(id)}
            className={`flex items-center gap-3 rounded-xl border p-2 text-left transition ${
              hero === id ? "border-white/60 bg-white/10" : "border-white/10 bg-slate-950/70 opacity-70 hover:opacity-100"
            }`}
          >
            <HeroCrest hero={id} size={40} />
            <span>
              <span className="block text-sm font-bold" style={{ color: HEROES[id].accent }}>
                Tuyến {id === "cr7" ? "CR7" : "LM10"}
              </span>
              <span className="block text-[11px] text-slate-300">{HEROES[id].nickname}</span>
            </span>
          </button>
        ))}
      </div>

      <Panel className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm text-slate-300">{def.tagline}</p>
          <p className="text-sm">
            🏆 <b>{trophies}</b>/{stages.length} · ⚽ Bóng Vàng <b>{ballons}</b>
          </p>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-600 to-gold"
            style={{ width: `${Math.min(100, (points / GOAT_TITLE_POINTS) * 100)}%` }}
          />
        </div>
        <p className="text-xs text-slate-300">
          {goat ? (
            <span className="font-bold text-gold">👑 Danh xưng THE GOAT đã được mở khoá!</span>
          ) : (
            <>
              <b className="text-white">{points}</b> / {GOAT_TITLE_POINTS} điểm sự nghiệp để mở khoá danh xưng{" "}
              <b className="text-gold">THE GOAT</b> (cộng điểm cao nhất của mỗi chặng).
            </>
          )}
        </p>
        <p className="text-[11px] text-slate-400">
          <b style={{ color: def.accent }}>{def.skill.name}</b>: {def.skill.description} · {def.passive}
        </p>
      </Panel>

      <div className="flex gap-1 rounded-lg bg-white/5 p-1">
        {(["stages", "training"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-bold tracking-widest transition ${
              tab === t ? "bg-gold text-black" : "text-slate-300 hover:bg-white/10"
            }`}
          >
            {t === "stages" ? "CÁC CHẶNG ĐẤU" : `TẬP LUYỆN (${career.points})`}
          </button>
        ))}
      </div>

      {tab === "stages" ? (
        <ol className="flex flex-col gap-2">
          {stages.map((stage, i) => (
            <StageCard
              key={stage.id}
              stage={stage}
              index={i}
              record={career.stages[stage.id]}
              locked={i > 0 && !career.stages[stages[i - 1].id]?.trophy}
              onPlay={() => onPlay(stage)}
            />
          ))}
        </ol>
      ) : (
        <Training hero={hero} profile={profile} onTrain={(drill) => onTrain(hero, drill)} />
      )}
    </Screen>
  );
}
