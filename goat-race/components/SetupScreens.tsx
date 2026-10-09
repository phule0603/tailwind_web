"use client";

import { useState } from "react";
import { Button, Header, HeroCrest, Panel, Screen } from "@/components/ui";
import { PVP_SECONDS } from "@/lib/game-config";
import { HEROES, HERO_IDS, type HeroId } from "@/lib/heroes";

const LEVELS = ["Dễ", "Vừa", "Khó", "Rất khó", "Huyền thoại"];

export function QuickSetup({ onBack, onStart }: { onBack: () => void; onStart: (hero: HeroId, level: number) => void }) {
  const [hero, setHero] = useState<HeroId>("cr7");
  const [level, setLevel] = useState(2);
  return (
    <Screen className="justify-center">
      <Header title="⚡ Đá nhanh" onBack={onBack} />
      <div className="grid gap-3 sm:grid-cols-2">
        {HERO_IDS.map((id) => {
          const h = HEROES[id];
          return (
            <button
              key={id}
              type="button"
              onClick={() => setHero(id)}
              className={`flex items-center gap-4 rounded-xl border p-4 text-left transition ${
                hero === id ? "border-white/70 bg-white/10" : "border-white/10 bg-slate-950/80 opacity-70 hover:opacity-100"
              }`}
            >
              <HeroCrest hero={id} size={64} />
              <span>
                <span className="block text-xl font-bold italic" style={{ color: h.accent }}>
                  {h.name}
                </span>
                <span className="block text-xs text-slate-300">{h.nickname} · {h.tagline}</span>
                <span className="mt-1 block text-[11px] text-slate-400">
                  {h.skill.name}: {h.skill.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <Panel className="flex flex-col gap-2">
        <p className="text-sm font-bold">Độ khó</p>
        <div className="grid grid-cols-5 gap-1">
          {LEVELS.map((l, i) => (
            <button
              key={l}
              type="button"
              onClick={() => setLevel(i + 1)}
              className={`rounded-md px-1 py-2 text-xs font-bold transition ${
                level === i + 1 ? "bg-gold text-black" : "bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </Panel>
      <Button tone={hero} onClick={() => onStart(hero, level)} className="py-3 text-base">
        Ra sân ▶
      </Button>
      <Controls />
    </Screen>
  );
}

export function Controls({ pvp = false }: { pvp?: boolean }) {
  const rows = pvp
    ? [
        ["Di chuyển", "W A S D", "↑ ← ↓ →"],
        ["Sút (giữ để lấy đà) / Xoạc", "F", "/"],
        ["Chuyền / Xoạc", "G", "."],
        ["Kỹ năng", "Shift trái / R", "Shift phải / ,"],
      ]
    : [
        ["Di chuyển", "WASD / phím mũi tên", "Cần điều khiển ảo"],
        ["Sút (giữ để lấy đà, ↑/↓ chọn góc)", "J / Space", "Nút SÚT"],
        ["Chuyền (hướng theo cần)", "K", "Nút CHUYỀN"],
        ["Kỹ năng (Turbo / La Pausa)", "L / Shift", "Nút KỸ NĂNG"],
        ["Tạm dừng · Tắt tiếng", "Esc · M", "Nút ⏸"],
      ];
  return (
    <Panel className="p-3!">
      <table className="w-full text-left text-xs">
        <thead className="text-slate-400">
          <tr>
            <th className="pb-1 font-semibold">Thao tác</th>
            <th className="pb-1 font-semibold">{pvp ? "Người chơi 1" : "Bàn phím"}</th>
            <th className="pb-1 font-semibold">{pvp ? "Người chơi 2" : "Cảm ứng"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([a, b, c]) => (
            <tr key={a} className="border-t border-white/5">
              <td className="py-1 pr-2 text-slate-300">{a}</td>
              <td className="py-1 pr-2 font-bold">{b}</td>
              <td className="py-1 font-bold">{c}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-slate-400">
        Không có bóng: nhấn SÚT khi bóng bổng tới gần để <b>đánh đầu</b>; nhấn CHUYỀN khi đồng đội cầm bóng để đòi{" "}
        <b>làm tường</b> (1-2); nhấn SÚT khi bạn đứng trong vòng cấm để đồng đội <b>tạt bóng</b>. Áp sát đối thủ cầm bóng và
        nhấn SÚT/CHUYỀN để <b>xoạc bóng</b>.
      </p>
    </Panel>
  );
}

export function PvpSetup({ onBack, onStart }: { onBack: () => void; onStart: (p1: HeroId) => void }) {
  const [p1, setP1] = useState<HeroId>("lm10");
  const p2: HeroId = p1 === "cr7" ? "lm10" : "cr7";
  const side = (who: string, hero: HeroId, color: string) => (
    <Panel className="flex flex-1 flex-col items-center gap-2 text-center">
      <span className="text-xs font-bold tracking-[0.3em]" style={{ color }}>
        {who}
      </span>
      <HeroCrest hero={hero} size={72} />
      <span className="text-xl font-bold italic" style={{ color: HEROES[hero].accent }}>
        {HEROES[hero].short}
      </span>
      <span className="text-[11px] text-slate-400">{HEROES[hero].skill.name}</span>
    </Panel>
  );
  return (
    <Screen className="justify-center">
      <Header title="⚔️ PvP Rivalry — Đối đầu trực tiếp" onBack={onBack} />
      <p className="text-sm text-slate-300">
        Hai người chơi trên cùng một bàn phím, mỗi người dẫn dắt một siêu sao cùng 2 đồng đội và thủ môn. Trận đấu{" "}
        {PVP_SECONDS} giây; người thắng là người có <b className="text-gold">Chỉ số gánh team</b> cao hơn (bàn thắng × 3 +
        kiến tạo × 2). Kết quả được cộng vào bảng Rivalry toàn cầu.
      </p>
      <div className="flex items-stretch gap-3">
        {side("NGƯỜI CHƠI 1", p1, "#22d3ee")}
        <div className="grid place-items-center">
          <Button onClick={() => setP1(p2)} aria-label="Đổi bên" className="px-3">
            ⇄
          </Button>
        </div>
        {side("NGƯỜI CHƠI 2", p2, "#f472b6")}
      </div>
      <Button tone="gold" onClick={() => onStart(p1)} className="py-3 text-base">
        Bắt đầu đối đầu ▶
      </Button>
      <Controls pvp />
      <p className="text-[11px] text-slate-500">
        PvP cần bàn phím. Đấu trực tuyến qua mạng (netcode thời gian thực) chưa có trong phiên bản này.
      </p>
    </Screen>
  );
}
