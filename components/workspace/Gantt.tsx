"use client";

import { useMemo, useState } from "react";
import { addDays, diffDays, formatDate, maxDate, minDate, toDayNumber, weekday } from "@/lib/pm/dates";
import { formatPercent } from "@/lib/pm/format";
import type { Schedule } from "@/lib/pm/schedule";
import type { Baseline, WorkCalendar } from "@/lib/pm/types";
import type { VisibleRow } from "./shared";

export type Zoom = "day" | "week" | "month";
export const ROW_H = 34;
export const HEADER_H = 48;
const PX_PER_DAY: Record<Zoom, number> = { day: 26, week: 9, month: 3 };
const MONTHS = ["Th1", "Th2", "Th3", "Th4", "Th5", "Th6", "Th7", "Th8", "Th9", "Th10", "Th11", "Th12"];

interface Props {
  rows: VisibleRow[];
  schedule: Schedule;
  baseline: Baseline | null;
  calendar: WorkCalendar;
  percent: Map<string, number>;
  statusDate: string;
  zoom: Zoom;
  showBaseline: boolean;
  showCritical: boolean;
  selected: string | null;
  onSelect: (id: string) => void;
}

interface Tip {
  x: number;
  y: number;
  row: VisibleRow;
}

/**
 * Gantt chart as one SVG: calendar header, bars (work packages), summary
 * brackets, milestones, baseline ghosts, dependency arrows and the status
 * date line. Rows line up with the schedule table (same ROW_H / HEADER_H).
 */
export default function Gantt(props: Props) {
  const { rows, schedule, baseline, calendar, percent, statusDate, zoom, showBaseline, showCritical, selected, onSelect } = props;
  const [tip, setTip] = useState<Tip | null>(null);
  const px = PX_PER_DAY[zoom];

  const range = useMemo(() => {
    let lo = schedule.start;
    let hi = schedule.finish;
    if (baseline && showBaseline) {
      for (const b of Object.values(baseline.items)) {
        lo = minDate(lo, b.start);
        hi = maxDate(hi, b.finish);
      }
    }
    lo = minDate(lo, statusDate);
    hi = maxDate(hi, statusDate);
    // start on a Monday / 1st of month so the header grid is tidy
    let from = addDays(lo, -3);
    if (zoom === "month") from = `${from.slice(0, 8)}01`;
    else from = addDays(from, -((weekday(from) + 6) % 7));
    const to = addDays(hi, zoom === "month" ? 45 : 14);
    return { from, days: diffDays(to, from) + 1 };
  }, [schedule.start, schedule.finish, baseline, showBaseline, statusDate, zoom]);

  const width = range.days * px;
  const height = HEADER_H + rows.length * ROW_H;
  const x = (iso: string) => diffDays(iso, range.from) * px;
  const xEnd = (iso: string) => (diffDays(iso, range.from) + 1) * px;
  const rowIndex = new Map(rows.map((r, i) => [r.item.id, i]));
  const yMid = (i: number) => HEADER_H + i * ROW_H + ROW_H / 2;

  // header ticks
  const header = useMemo(() => {
    const months: { x: number; w: number; label: string }[] = [];
    const ticks: { x: number; label: string }[] = [];
    const nonWorking: number[] = [];
    const workweek = new Set(calendar.workweek);
    const holidays = new Set(calendar.holidays);
    for (let i = 0; i < range.days; i++) {
      const d = addDays(range.from, i);
      const day = Number(d.slice(8, 10));
      if (day === 1 || i === 0) {
        const m = Number(d.slice(5, 7));
        months.push({ x: i * px, w: 0, label: `${MONTHS[m - 1]}/${d.slice(0, 4)}` });
      }
      if (zoom === "day") ticks.push({ x: i * px, label: String(day) });
      else if (zoom === "week" && weekday(d) === 1) ticks.push({ x: i * px, label: `${day}/${Number(d.slice(5, 7))}` });
      if (zoom !== "month" && (!workweek.has(weekday(d)) || holidays.has(d))) nonWorking.push(i);
    }
    months.forEach((m, i) => (m.w = (i + 1 < months.length ? months[i + 1].x : range.days * px) - m.x));
    return { months, ticks, nonWorking };
  }, [range, px, zoom, calendar]);

  const links: { d: string; critical: boolean }[] = [];
  for (const r of rows) {
    if (!r.leaf) continue;
    const ti = rowIndex.get(r.item.id)!;
    const ts = schedule.items.get(r.item.id)!;
    for (const dep of r.item.predecessors) {
      const si = rowIndex.get(dep.id);
      const ps = schedule.items.get(dep.id);
      if (si === undefined || !ps) continue;
      const fromFinish = dep.type === "FS" || dep.type === "FF";
      const toStart = dep.type === "FS" || dep.type === "SS";
      const sx = fromFinish ? (ps.milestone ? xEnd(ps.start) + 5 : xEnd(ps.finish)) : ps.milestone ? xEnd(ps.start) - 5 : x(ps.start);
      const tx = toStart ? (ts.milestone ? xEnd(ts.start) - 6 : x(ts.start)) : ts.milestone ? xEnd(ts.start) + 6 : xEnd(ts.finish);
      const y1 = yMid(si);
      const y2 = yMid(ti);
      const ex = sx + (fromFinish ? 6 : -6);
      const ax = tx + (toStart ? -6 : 6);
      const turn = y2 > y1 ? y2 - ROW_H / 2 : y2 + ROW_H / 2;
      const direct = toStart ? ax >= ex : ax <= ex;
      const d = direct
        ? `M${sx},${y1} H${ex} V${y2} H${tx}`
        : `M${sx},${y1} H${ex} V${turn} H${ax} V${y2} H${tx}`;
      links.push({ d, critical: showCritical && ps.critical && ts.critical && ps.float === 0 && ts.float === 0 });
    }
  }

  const statusX = x(statusDate);
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="relative">
      <svg width={width} height={height} className="block select-none text-[11px]" role="img" aria-label="Biểu đồ Gantt tiến độ dự án">
        <defs>
          <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L8,4 L0,8 z" fill="#64748b" />
          </marker>
          <marker id="arrow-crit" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L8,4 L0,8 z" fill="var(--color-critical)" />
          </marker>
        </defs>

        {/* non-working days and row stripes */}
        {header.nonWorking.map((i) => (
          <rect key={i} x={i * px} y={HEADER_H} width={px} height={height - HEADER_H} fill="#f1f3f6" />
        ))}
        {rows.map((r, i) => (
          <rect
            key={r.item.id}
            x={0}
            y={HEADER_H + i * ROW_H}
            width={width}
            height={ROW_H}
            fill={r.item.id === selected ? "rgba(42,120,214,0.08)" : "transparent"}
            stroke="#eef0f3"
            onClick={() => onSelect(r.item.id)}
          />
        ))}

        {/* header */}
        <rect x={0} y={0} width={width} height={HEADER_H} fill="#f8fafc" />
        {header.months.map((m) => (
          <g key={m.x}>
            <line x1={m.x} x2={m.x} y1={0} y2={height} stroke="#dfe3e8" />
            <text x={m.x + 4} y={17} fill="#475569" fontWeight={600}>
              {m.w > 40 ? m.label : ""}
            </text>
          </g>
        ))}
        {header.ticks.map((t) => (
          <g key={t.x}>
            <line x1={t.x} x2={t.x} y1={24} y2={HEADER_H} stroke="#e5e7eb" />
            <text x={t.x + (zoom === "day" ? px / 2 : 3)} y={40} fill="#64748b" textAnchor={zoom === "day" ? "middle" : "start"}>
              {t.label}
            </text>
          </g>
        ))}
        <line x1={0} x2={width} y1={HEADER_H} y2={HEADER_H} stroke="#cbd5e1" />

        {/* baseline ghosts */}
        {showBaseline &&
          baseline &&
          rows.map((r, i) => {
            const b = baseline.items[r.item.id];
            if (!b || !r.leaf) return null;
            const y = HEADER_H + i * ROW_H + 25;
            return b.duration === 0 ? (
              <rect key={r.item.id} x={xEnd(b.start) - 3} y={y - 1} width={6} height={6} fill="#94a3b8" transform={`rotate(45 ${xEnd(b.start)} ${y + 2})`} />
            ) : (
              <rect key={r.item.id} x={x(b.start)} y={y} width={Math.max(2, xEnd(b.finish) - x(b.start))} height={4} rx={2} fill="#a8b3c2" />
            );
          })}

        {/* dependency links */}
        {links.map((l, i) => (
          <path
            key={i}
            d={l.d}
            fill="none"
            stroke={l.critical ? "var(--color-critical)" : "#94a3b8"}
            strokeWidth={1.2}
            markerEnd={`url(#${l.critical ? "arrow-crit" : "arrow"})`}
          />
        ))}

        {/* bars */}
        {rows.map((r, i) => {
          const s = schedule.items.get(r.item.id);
          if (!s) return null;
          const top = HEADER_H + i * ROW_H;
          const x0 = x(s.start);
          const x1 = xEnd(s.finish);
          const crit = showCritical && s.critical;
          const pct = Math.min(100, Math.max(0, percent.get(r.item.id) ?? 0));
          const hover = {
            onMouseEnter: (e: React.MouseEvent) => setTip({ x: e.nativeEvent.offsetX, y: top, row: r }),
            onMouseMove: (e: React.MouseEvent) => setTip({ x: e.nativeEvent.offsetX, y: top, row: r }),
            onMouseLeave: () => setTip(null),
            onClick: () => onSelect(r.item.id),
          };
          if (!r.leaf) {
            const y = top + 10;
            return (
              <g key={r.item.id} {...hover} className="cursor-pointer">
                <rect x={x0} y={y - 6} width={x1 - x0} height={18} fill="transparent" />
                <path
                  d={`M${x0},${y} H${x1} V${y + 9} L${x1 - 5},${y + 4} H${x0 + 5} L${x0},${y + 9} Z`}
                  fill={crit ? "#7f1d1d" : "#334155"}
                />
                <rect x={x0} y={y} width={((x1 - x0) * pct) / 100} height={4} fill="#94a3b8" opacity={0.9} />
              </g>
            );
          }
          if (s.milestone) {
            const cx0 = x1;
            return (
              <g key={r.item.id} {...hover} className="cursor-pointer">
                <rect x={cx0 - 9} y={top + 5} width={18} height={18} fill="transparent" />
                <path d={`M${cx0},${top + 7} l7,7 l-7,7 l-7,-7 z`} fill={crit ? "var(--color-critical)" : "#0d366b"} />
                <text x={cx0 + 12} y={top + 18} fill="#334155">
                  {formatDate(s.start)}
                </text>
              </g>
            );
          }
          const w = Math.max(3, x1 - x0);
          return (
            <g key={r.item.id} {...hover} className="cursor-pointer">
              <rect x={x0} y={top + 8} width={w} height={15} rx={4} fill={crit ? "#f6c9c9" : "#c3daf6"} />
              <rect x={x0} y={top + 8} width={(w * pct) / 100} height={15} rx={4} fill={crit ? "var(--color-critical)" : "var(--color-pv)"} />
              <rect x={x0} y={top + 8} width={w} height={15} rx={4} fill="none" stroke={crit ? "var(--color-critical)" : "var(--color-pv)"} strokeWidth={1} />
              {pct > 0 && w > 34 && (
                <text x={x0 + 4} y={top + 19.5} fill="white" fontSize={10} fontWeight={600}>
                  {Math.round(pct)}%
                </text>
              )}
            </g>
          );
        })}

        {/* today + status date */}
        {toDayNumber(todayIso) >= toDayNumber(range.from) && diffDays(todayIso, range.from) < range.days && (
          <line x1={x(todayIso)} x2={x(todayIso)} y1={HEADER_H} y2={height} stroke="#eda100" strokeWidth={1.5} strokeDasharray="2 3" />
        )}
        <line x1={statusX} x2={statusX} y1={24} y2={height} stroke="#1c5cab" strokeWidth={1.5} strokeDasharray="5 3" />
        <text x={statusX + 3} y={height - 4} fill="#1c5cab" fontSize={10}>
          Ngày cập nhật {formatDate(statusDate)}
        </text>
      </svg>

      {tip && <GanttTip tip={tip} schedule={schedule} baseline={baseline} percent={percent} width={width} />}
    </div>
  );
}

function GanttTip({ tip, schedule, baseline, percent, width }: { tip: Tip; schedule: Schedule; baseline: Baseline | null; percent: Map<string, number>; width: number }) {
  const s = schedule.items.get(tip.row.item.id)!;
  const b = baseline?.items[tip.row.item.id];
  const left = Math.min(tip.x + 14, width - 250);
  return (
    <div
      className="pointer-events-none absolute z-10 w-60 rounded-md border border-slate-200 bg-white p-2.5 text-xs shadow-lg"
      style={{ left: Math.max(0, left), top: tip.y + ROW_H }}
    >
      <div className="font-semibold text-slate-800">
        {tip.row.code} {tip.row.item.name}
      </div>
      <dl className="tabular mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-slate-600">
        <dt>Bắt đầu</dt>
        <dd>{formatDate(s.start)}</dd>
        <dt>Kết thúc</dt>
        <dd>{formatDate(s.finish)}</dd>
        <dt>Thời lượng</dt>
        <dd>{s.milestone ? "Mốc" : `${s.duration} ngày LV`}</dd>
        <dt>Dự trữ</dt>
        <dd>{s.critical ? <span className="font-medium text-critical">0 — công việc găng</span> : `${s.float} ngày`}</dd>
        <dt>Hoàn thành</dt>
        <dd>{formatPercent(percent.get(tip.row.item.id) ?? 0)}</dd>
        {b && (
          <>
            <dt>Baseline</dt>
            <dd>
              {formatDate(b.start)} → {formatDate(b.finish)}
            </dd>
          </>
        )}
      </dl>
    </div>
  );
}
