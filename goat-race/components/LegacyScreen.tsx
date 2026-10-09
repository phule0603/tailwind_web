"use client";

import { useCallback, useEffect, useState } from "react";
import { fmt, Header, HeroCrest, Panel, Screen } from "@/components/ui";
import type { Profile } from "@/hooks/useProfile";
import { HEROES, HERO_IDS, type HeroId } from "@/lib/heroes";
import {
  LEADERBOARD_SIZE,
  type HeroTotals,
  type LeaderboardResponse,
  type LegacyResponse,
} from "@/lib/leaderboard/shared";

const POLL_MS = 5000;

const ROWS: { key: keyof HeroTotals; label: string }[] = [
  { key: "goals", label: "Bàn thắng" },
  { key: "assists", label: "Kiến tạo" },
  { key: "hatTricks", label: "Hat-trick" },
  { key: "braces", label: "Cú đúp" },
  { key: "trophies", label: "Danh hiệu" },
  { key: "ballonDor", label: "Quả bóng Vàng" },
  { key: "ucl", label: "Champions League" },
  { key: "worldcup", label: "World Cup" },
  { key: "wins", label: "Trận thắng" },
  { key: "matches", label: "Số trận" },
];

function CompareRow({ label, a, b }: { label: string; a: number; b: number }) {
  const total = a + b;
  const pa = total ? (a / total) * 100 : 50;
  return (
    <div className="grid grid-cols-[3.5rem_1fr_3.5rem] items-center gap-2 text-sm">
      <span className={`text-right font-bold tabular-nums ${a > b ? "text-cr7" : "text-slate-300"}`}>{fmt(a)}</span>
      <div>
        <p className="mb-0.5 text-center text-[11px] tracking-widest text-slate-400">{label.toUpperCase()}</p>
        <div className="flex h-2.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-gradient-to-r from-amber-600 to-cr7 transition-all duration-700" style={{ width: `${pa}%` }} />
          <div className="h-full flex-1 bg-gradient-to-r from-lm10 to-blue-600 transition-all duration-700" />
        </div>
      </div>
      <span className={`font-bold tabular-nums ${b > a ? "text-lm10" : "text-slate-300"}`}>{fmt(b)}</span>
    </div>
  );
}

function Board({ hero, data }: { hero: HeroId; data: LeaderboardResponse | null }) {
  const h = HEROES[hero];
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <Panel className="flex flex-col gap-2 p-3!">
      <div className="flex items-center gap-2">
        <HeroCrest hero={hero} size={28} />
        <h3 className="font-bold italic" style={{ color: h.accent }}>
          Top {LEADERBOARD_SIZE} trận đấu với {h.short}
        </h3>
      </div>
      {!data ? (
        <p className="py-4 text-center text-xs text-slate-400">Đang tải…</p>
      ) : !data.enabled ? (
        <p className="py-4 text-center text-xs text-slate-400">Bảng xếp hạng toàn cầu chưa được bật trên máy chủ này.</p>
      ) : data.entries.length === 0 ? (
        <p className="py-4 text-center text-xs text-slate-400">Chưa có ai — hãy là người đầu tiên!</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {data.entries.map((e) => (
            <li
              key={e.rank}
              className={`grid grid-cols-[2rem_1fr_auto] items-center gap-2 rounded-md px-2 py-1 text-sm ${
                e.you ? "bg-white/10 ring-1 ring-white/40" : ""
              }`}
            >
              <span className="text-center font-bold">{medals[e.rank - 1] ?? e.rank}</span>
              <span className="min-w-0">
                <span className="block truncate font-bold">{e.name}</span>
                <span className="block text-[10px] text-slate-400">
                  ⚽ {e.goals} · 🅰 {e.assists}
                </span>
              </span>
              <span className="font-bold tabular-nums text-gold">{fmt(e.score)}</span>
            </li>
          ))}
        </ol>
      )}
      {data?.you && !data.entries.some((e) => e.you) && (
        <p className="border-t border-white/10 pt-1 text-center text-xs text-slate-300">
          Bạn: <b>#{fmt(data.you.rank)}</b> · <b className="text-gold">{fmt(data.you.score)}</b>
        </p>
      )}
    </Panel>
  );
}

export default function LegacyScreen({ profile, onBack }: { profile: Profile; onBack: () => void }) {
  const [scope, setScope] = useState<"global" | "local">("global");
  const [legacy, setLegacy] = useState<LegacyResponse | null>(null);
  const [boards, setBoards] = useState<Record<HeroId, LeaderboardResponse | null>>({ cr7: null, lm10: null });
  const [updated, setUpdated] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const playerId = profile.playerId;

  const refresh = useCallback(async () => {
    try {
      const [l, ...b] = await Promise.all([
        fetch("/api/legacy", { cache: "no-store" }).then((r) => r.json() as Promise<LegacyResponse>),
        ...HERO_IDS.map((hero) =>
          fetch(`/api/leaderboard?${new URLSearchParams({ hero, playerId, limit: String(LEADERBOARD_SIZE) })}`, {
            cache: "no-store",
          }).then((r) => r.json() as Promise<LeaderboardResponse>),
        ),
      ]);
      setLegacy(l);
      setBoards({ cr7: b[0], lm10: b[1] });
      setUpdated(Date.now());
      setError(!!l.error);
    } catch {
      setError(true);
    }
  }, [playerId]);

  useEffect(() => {
    // live: poll while the screen is open and the tab is visible
    void refresh();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  const totals = scope === "global" ? legacy?.totals : profile.totals;
  const rivalry = scope === "global" ? legacy?.rivalry : profile.rivalry;
  const globalOff = scope === "global" && legacy && !legacy.enabled;

  return (
    <Screen>
      <Header
        title="📊 Legacy Mode — Kỷ lục bất tử"
        onBack={onBack}
        right={
          <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <span className={`h-2 w-2 rounded-full ${error ? "bg-red-500" : "animate-pulse bg-emerald-400"}`} />
            {error ? "Mất kết nối" : updated ? "LIVE" : "…"}
          </span>
        }
      />
      <div className="flex gap-1 rounded-lg bg-white/5 p-1">
        {(["global", "local"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setScope(s)}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-bold tracking-widest transition ${
              scope === s ? "bg-gold text-black" : "text-slate-300 hover:bg-white/10"
            }`}
          >
            {s === "global" ? "🌐 TOÀN CẦU" : "📱 CỦA BẠN"}
          </button>
        ))}
      </div>

      <Panel className="flex flex-col gap-3">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="flex items-center gap-2">
            <HeroCrest hero="cr7" size={44} />
            <span className="font-bold italic text-cr7">RONALDO</span>
          </div>
          <span className="text-xs font-bold tracking-[0.3em] text-slate-400">VS</span>
          <div className="flex items-center justify-end gap-2">
            <span className="font-bold italic text-lm10">MESSI</span>
            <HeroCrest hero="lm10" size={44} />
          </div>
        </div>
        {globalOff ? (
          <p className="py-6 text-center text-sm text-slate-400">
            Thống kê toàn cầu chưa được bật trên máy chủ này (cần Upstash Redis). Xem tab “Của bạn”.
          </p>
        ) : !totals ? (
          <p className="py-6 text-center text-sm text-slate-400">Đang tải…</p>
        ) : (
          <div className="flex flex-col gap-2">
            {ROWS.map((r) => (
              <CompareRow key={r.key} label={r.label} a={totals.cr7[r.key]} b={totals.lm10[r.key]} />
            ))}
          </div>
        )}
        {rivalry && !globalOff && (
          <div className="mt-1 rounded-lg border border-white/10 bg-black/30 p-3 text-center">
            <p className="text-[11px] tracking-[0.3em] text-slate-400">PVP RIVALRY</p>
            <p className="text-2xl font-bold italic">
              <span className="text-cr7">{fmt(rivalry.cr7)}</span>
              <span className="mx-3 text-sm text-slate-400">hoà {fmt(rivalry.draws)}</span>
              <span className="text-lm10">{fmt(rivalry.lm10)}</span>
            </p>
          </div>
        )}
      </Panel>

      <div className="grid gap-3 md:grid-cols-2">
        <Board hero="cr7" data={boards.cr7} />
        <Board hero="lm10" data={boards.lm10} />
      </div>
      <p className="text-center text-[11px] text-slate-500">
        Bảng xếp hạng giữ trận đấu có điểm GOAT cao nhất của mỗi người chơi với mỗi siêu sao. Tự động cập nhật mỗi{" "}
        {POLL_MS / 1000} giây.
      </p>
    </Screen>
  );
}
