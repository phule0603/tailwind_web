"use client";

import { NameField } from "@/components/MainMenu";
import { Button, fmt, HeroCrest, Panel, Screen } from "@/components/ui";
import type { MatchResult, SyncStatus } from "@/hooks/useProfile";
import { TROPHY_LABELS, type Stage } from "@/lib/career";
import type { HeroLine, MatchSummary, ShotType } from "@/lib/engine/match";
import { SHOT_LABELS } from "@/lib/engine/render";
import {
  ASSIST_POINTS,
  BALLON_DOR_POINTS,
  GOAL_POINTS,
  TROPHY_POINTS,
} from "@/lib/game-config";
import { HEROES } from "@/lib/heroes";
import { carryIndex, multiGoalBonus } from "@/lib/leaderboard/shared";

const ERRORS: Record<string, string> = {
  offline: "Không kết nối được máy chủ — kết quả đã lưu trên thiết bị.",
  rate_limited: "Gửi quá nhiều lần — thử lại sau ít phút.",
  store_unavailable: "Bảng xếp hạng đang bảo trì — kết quả đã lưu trên thiết bị.",
};

function SyncLine({ sync, name, onName }: { sync: SyncStatus | null; name: string; onName: (n: string) => boolean }) {
  if (!sync) return null;
  switch (sync.state) {
    case "saving":
      return <p className="animate-pulse text-xs text-slate-300">Đang gửi lên bảng xếp hạng…</p>;
    case "saved":
      return (
        <p className="text-sm font-bold text-gold">
          {sync.rank === 1 ? "🏆 HẠNG #1 THẾ GIỚI!" : `🌐 Hạng toàn cầu #${fmt(sync.rank)}`}
          <span className="ml-2 text-xs font-normal text-slate-300">
            {sync.improved ? "kỷ lục cá nhân mới" : `kỷ lục của bạn: ${fmt(sync.best)}`}
          </span>
        </p>
      );
    case "local-only":
      return <p className="text-xs text-slate-400">Kết quả đã lưu trên thiết bị này.</p>;
    case "needs-name":
      return (
        <div className="flex w-full max-w-sm flex-col gap-1">
          <p className="text-xs font-bold text-gold">Nhập tên để lên bảng xếp hạng toàn cầu</p>
          <NameField name={name} onSave={onName} />
        </div>
      );
    case "error":
      return <p className="text-xs text-red-400">{ERRORS[sync.error] ?? `Không được ghi nhận (${sync.error}).`}</p>;
  }
}

function Types({ line }: { line: HeroLine }) {
  const entries = Object.entries(line.types) as [ShotType, number][];
  if (!entries.length) return null;
  return (
    <div className="flex flex-wrap justify-center gap-1">
      {entries.map(([t, n]) => (
        <span key={t} className="rounded-full bg-white/10 px-2 py-0.5 text-[11px]">
          {SHOT_LABELS[t].replace("!", "")} ×{n}
        </span>
      ))}
    </div>
  );
}

function HeroStats({ line, highlight }: { line: HeroLine; highlight?: boolean }) {
  const h = HEROES[line.hero];
  return (
    <Panel className={`flex flex-1 flex-col items-center gap-2 text-center ${highlight ? "ring-2 ring-gold" : ""}`}>
      <HeroCrest hero={line.hero} size={56} />
      <p className="font-bold italic" style={{ color: h.accent }}>
        {h.short}
      </p>
      <div className="grid w-full grid-cols-3 gap-1 text-center">
        {[
          ["⚽", line.goals, "Bàn"],
          ["🅰", line.assists, "Kiến tạo"],
          ["🎯", `${line.onTarget}/${line.shots}`, "Trúng đích"],
          ["🪄", line.dribbles, "Qua người"],
          ["🛡", line.tackles, "Tắc bóng"],
          ["🔥", carryIndex(line), "Gánh team"],
        ].map(([icon, v, label]) => (
          <div key={String(label)} className="rounded-md bg-black/30 px-1 py-1.5">
            <p className="text-lg font-bold tabular-nums">
              <span className="mr-1 text-sm">{icon}</span>
              {v}
            </p>
            <p className="text-[10px] text-slate-400">{label}</p>
          </div>
        ))}
      </div>
      <Types line={line} />
    </Panel>
  );
}

export default function ResultScreen({
  summary,
  teams,
  result,
  stage,
  nextStage,
  pvpWinner,
  sync,
  name,
  onName,
  onAgain,
  onNext,
  onMenu,
}: {
  summary: MatchSummary;
  teams: [string, string];
  result: MatchResult | null;
  stage: Stage | null;
  nextStage: Stage | null;
  pvpWinner: "cr7" | "lm10" | "draws" | null;
  sync: SyncStatus | null;
  name: string;
  onName: (name: string) => boolean;
  onAgain: () => void;
  onNext: () => void;
  onMenu: () => void;
}) {
  const line = summary.heroes[0];
  const outcome = result?.outcome;
  const title = pvpWinner
    ? pvpWinner === "draws"
      ? "HOÀ!"
      : `${HEROES[pvpWinner].short} THẮNG!`
    : stage
      ? outcome?.trophy
        ? "VÔ ĐỊCH!"
        : "CHƯA ĐẠT MỤC TIÊU"
      : "HẾT TRẬN";
  return (
    <Screen className="items-center justify-center text-center">
      <p className="text-xs tracking-[0.4em] text-slate-300">{stage ? `${stage.year} · ${stage.title}` : "KẾT QUẢ"}</p>
      <h2 className="gold-text text-5xl font-bold italic sm:text-6xl">{title}</h2>
      <p className="text-2xl font-bold">
        <span className="text-slate-300">{teams[0]}</span>
        <span className="mx-3 text-white">
          {summary.score[0]} – {summary.score[1]}
        </span>
        <span className="text-slate-300">{teams[1]}</span>
      </p>

      {pvpWinner ? (
        <div className="flex w-full max-w-2xl gap-3">
          {summary.heroes.map((h) => (
            <HeroStats key={h.hero} line={h} highlight={pvpWinner === h.hero} />
          ))}
        </div>
      ) : (
        line && (
          <div className="flex w-full max-w-md flex-col gap-3">
            <HeroStats line={line} />
            {result && (
              <Panel className="flex flex-col gap-1 text-left text-sm">
                <p className="flex justify-between">
                  <span className="text-slate-300">Bàn thắng × {GOAL_POINTS}</span>
                  <b>{line.goals * GOAL_POINTS}</b>
                </p>
                <p className="flex justify-between">
                  <span className="text-slate-300">Kiến tạo × {ASSIST_POINTS}</span>
                  <b>{line.assists * ASSIST_POINTS}</b>
                </p>
                {multiGoalBonus(line.goals) > 0 && (
                  <p className="flex justify-between">
                    <span className="text-slate-300">{line.goals >= 3 ? "Hat-trick" : "Cú đúp"}</span>
                    <b>+{multiGoalBonus(line.goals)}</b>
                  </p>
                )}
                {outcome?.trophy && (
                  <p className="flex justify-between text-gold">
                    <span>
                      {TROPHY_LABELS[outcome.trophy].icon} {TROPHY_LABELS[outcome.trophy].name}
                    </span>
                    <b>+{TROPHY_POINTS}</b>
                  </p>
                )}
                {outcome?.ballonDor && (
                  <p className="flex justify-between text-gold">
                    <span>⚽ Quả bóng Vàng</span>
                    <b>+{BALLON_DOR_POINTS}</b>
                  </p>
                )}
                <p className="mt-1 flex justify-between border-t border-white/10 pt-1 text-base">
                  <span className="font-bold">Điểm GOAT</span>
                  <b className="text-gold">
                    {fmt(result.score)} {result.newBest && <span className="text-xs">· KỶ LỤC MỚI</span>}
                  </b>
                </p>
                {result.pointsEarned > 0 && (
                  <p className="text-xs text-emerald-400">+{result.pointsEarned} điểm tập luyện</p>
                )}
                {stage && !outcome?.trophy && (
                  <p className="text-xs text-slate-400">
                    Mục tiêu: {stage.objective.goals} bàn
                    {stage.objective.assists ? ` + ${stage.objective.assists} kiến tạo` : ""}. Thử lại nhé!
                  </p>
                )}
              </Panel>
            )}
          </div>
        )
      )}

      <SyncLine sync={sync} name={name} onName={onName} />

      <div className="flex flex-wrap justify-center gap-2">
        {nextStage && outcome?.trophy && (
          <Button tone={nextStage.hero} onClick={onNext}>
            Chặng tiếp: {nextStage.year} ▶
          </Button>
        )}
        <Button tone="gold" onClick={onAgain}>
          ↻ Đá lại
        </Button>
        <Button onClick={onMenu}>Menu</Button>
      </div>
    </Screen>
  );
}
