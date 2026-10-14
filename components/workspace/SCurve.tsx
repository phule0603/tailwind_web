"use client";

import { useRef, useState } from "react";
import { diffDays, formatDate } from "@/lib/pm/dates";
import type { CurvePoint } from "@/lib/pm/evm";
import { formatVnd, formatVndShort } from "@/lib/pm/format";
import type { StatusSnapshot } from "@/lib/pm/types";

const W = 900;
const H = 320;
const M = { top: 16, right: 92, bottom: 30, left: 64 };

function niceStep(max: number, count = 5) {
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}

function pvAt(curve: CurvePoint[], date: string): number {
  if (curve.length === 0 || date < curve[0].date) return 0;
  for (let i = 1; i < curve.length; i++) {
    if (date <= curve[i].date) {
      const a = curve[i - 1];
      const b = curve[i];
      const t = diffDays(date, a.date) / Math.max(1, diffDays(b.date, a.date));
      return a.pv + (b.pv - a.pv) * t;
    }
  }
  return curve[curve.length - 1].pv;
}

/**
 * Cumulative cost S-curve: planned value over time (from the baseline), with
 * the EV and AC recorded at each reporting date. One y-axis (VND).
 */
export default function SCurve({ curve, points, bac, statusDate }: { curve: CurvePoint[]; points: StatusSnapshot[]; bac: number; statusDate: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  if (curve.length < 2) return <div className="py-10 text-center text-sm text-slate-500">Chưa có dữ liệu ngân sách và tiến độ để vẽ đường cong S.</div>;

  const first = [curve[0].date, points[0]?.date ?? curve[0].date].sort()[0];
  const last = [curve[curve.length - 1].date, statusDate].sort()[1];
  const span = Math.max(1, diffDays(last, first));
  const maxY = Math.max(bac, ...points.map((p) => Math.max(p.ac, p.ev)), 1) * 1.08;
  const step = niceStep(maxY);
  const ticks = Array.from({ length: Math.floor(maxY / step) + 1 }, (_, i) => i * step);

  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;
  const x = (d: string) => M.left + (diffDays(d, first) / span) * iw;
  const y = (v: number) => M.top + ih - (v / maxY) * ih;
  const line = (pts: { date: string; v: number }[]) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");

  // month ticks on the x axis (thinned to ~8 labels)
  const months: string[] = [];
  for (let d = `${first.slice(0, 8)}01`; d <= last; ) {
    if (d >= first) months.push(d);
    const [yy, mm] = d.split("-").map(Number);
    d = mm === 12 ? `${yy + 1}-01-01` : `${yy}-${String(mm + 1).padStart(2, "0")}-01`;
  }
  const every = Math.max(1, Math.ceil(months.length / 8));

  const pvLine = line(curve.map((c) => ({ date: c.date, v: c.pv })));
  const evLine = line(points.map((p) => ({ date: p.date, v: p.ev })));
  const acLine = line(points.map((p) => ({ date: p.date, v: p.ac })));
  const lastPt = points[points.length - 1];

  const onMove = (e: React.MouseEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const t = Math.min(1, Math.max(0, (px - M.left) / iw));
    const day = Math.round(t * span);
    const d = new Date(Date.parse(`${first}T00:00:00Z`) + day * 86_400_000).toISOString().slice(0, 10);
    setHover(d);
  };

  const snap = hover ? points.reduce<StatusSnapshot | null>((best, p) => (Math.abs(x(p.date) - x(hover)) < 14 && (!best || Math.abs(diffDays(p.date, hover)) < Math.abs(diffDays(best.date, hover))) ? p : best), null) : null;

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-slate-600">
        <Key color="var(--color-pv)" label="PV – giá trị kế hoạch (lũy kế)" />
        <Key color="var(--color-ev)" label="EV – giá trị thu được" dot />
        <Key color="var(--color-ac)" label="AC – chi phí thực tế (AV)" dot />
      </div>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full touch-none text-[11px]" onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label="Đường cong S: PV, EV, AC lũy kế theo thời gian">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke="#eef0f3" />
            <text x={M.left - 6} y={y(t) + 4} textAnchor="end" fill="#64748b">
              {formatVndShort(t)}
            </text>
          </g>
        ))}
        {months.map((m, i) =>
          i % every === 0 ? (
            <text key={m} x={x(m)} y={H - 10} textAnchor="middle" fill="#64748b">
              {`${Number(m.slice(5, 7))}/${m.slice(2, 4)}`}
            </text>
          ) : null,
        )}
        <line x1={M.left} x2={W - M.right} y1={y(0)} y2={y(0)} stroke="#94a3b8" />

        {/* BAC */}
        <line x1={M.left} x2={W - M.right} y1={y(bac)} y2={y(bac)} stroke="#94a3b8" strokeDasharray="4 4" />
        <text x={W - M.right + 6} y={y(bac) + 4} fill="#475569">
          BAC {formatVndShort(bac)}
        </text>

        {/* status date */}
        <line x1={x(statusDate)} x2={x(statusDate)} y1={M.top} y2={y(0)} stroke="#1c5cab" strokeDasharray="5 3" />
        <text x={x(statusDate) + 4} y={M.top + 10} fill="#1c5cab">
          {formatDate(statusDate)}
        </text>

        <path d={pvLine} fill="none" stroke="var(--color-pv)" strokeWidth={2} strokeLinejoin="round" />
        {points.length > 0 && (
          <>
            <path d={acLine} fill="none" stroke="var(--color-ac)" strokeWidth={2} strokeLinejoin="round" />
            <path d={evLine} fill="none" stroke="var(--color-ev)" strokeWidth={2} strokeLinejoin="round" />
            {points.map((p) => (
              <g key={p.date}>
                <circle cx={x(p.date)} cy={y(p.ac)} r={4} fill="var(--color-ac)" stroke="white" strokeWidth={2} />
                <circle cx={x(p.date)} cy={y(p.ev)} r={4} fill="var(--color-ev)" stroke="white" strokeWidth={2} />
              </g>
            ))}
            <text x={x(lastPt.date) + 8} y={y(lastPt.ac) + (lastPt.ac >= lastPt.ev ? -4 : 12)} fill="#334155" fontWeight={600}>
              AC
            </text>
            <text x={x(lastPt.date) + 8} y={y(lastPt.ev) + (lastPt.ac >= lastPt.ev ? 12 : -4)} fill="#334155" fontWeight={600}>
              EV
            </text>
          </>
        )}
        <text x={x(curve[curve.length - 1].date) + 6} y={y(curve[curve.length - 1].pv) + 14} fill="#334155" fontWeight={600}>
          PV
        </text>

        {hover && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={y(0)} stroke="#334155" strokeWidth={1} />
            <circle cx={x(hover)} cy={y(pvAt(curve, hover))} r={4} fill="var(--color-pv)" stroke="white" strokeWidth={2} />
          </g>
        )}
      </svg>
      <div className="tabular mt-1 min-h-5 text-xs text-slate-600" aria-live="polite">
        {hover ? (
          <>
            <b>{formatDate(snap?.date ?? hover)}</b> · PV {formatVnd(snap ? snap.pv : pvAt(curve, hover))}
            {snap && (
              <>
                {" "}
                · EV {formatVnd(snap.ev)} · AC {formatVnd(snap.ac)}
              </>
            )}
          </>
        ) : (
          "Rê chuột trên biểu đồ để xem giá trị theo ngày."
        )}
      </div>
    </div>
  );
}

function Key({ color, label, dot }: { color: string; label: string; dot?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="22" height="10" aria-hidden>
        <line x1="1" x2="21" y1="5" y2="5" stroke={color} strokeWidth="2" />
        {dot && <circle cx="11" cy="5" r="3.5" fill={color} stroke="white" strokeWidth="1.5" />}
      </svg>
      {label}
    </span>
  );
}
