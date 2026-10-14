"use client";

import { useMemo, useState } from "react";
import { diffDays, formatDate, isIsoDate } from "@/lib/pm/dates";
import { formatNumber } from "@/lib/pm/format";
import { withBaseline } from "@/lib/pm/project";
import { formatPredecessors, parsePredecessors, updateItem } from "@/lib/pm/wbs";
import { Button, Card, cx, NumberInput, Stat, TextInput } from "../ui";
import Gantt, { HEADER_H, ROW_H, type Zoom } from "./Gantt";
import { visibleRows, type TabProps } from "./shared";

export default function ScheduleTab({ project, analysis, update, collapsed, toggleCollapsed }: TabProps) {
  const [zoom, setZoom] = useState<Zoom>("week");
  const [showBaseline, setShowBaseline] = useState(true);
  const [showCritical, setShowCritical] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [predErrors, setPredErrors] = useState<Record<string, string>>({});
  const { schedule } = analysis;
  const rows = visibleRows(project, analysis, collapsed);
  const percent = useMemo(() => new Map([...analysis.values].map(([id, v]) => [id, v.percent])), [analysis]);
  const leaves = project.wbs.filter((i) => schedule.tree.isLeaf(i.id));

  const saveBaseline = () => {
    if (project.baseline && !confirm("Ghi đè baseline hiện tại bằng kế hoạch hiện hành? PV sẽ được tính lại theo baseline mới.")) return;
    update((p) => withBaseline(p, analysis), true);
  };

  const setPreds = (id: string, text: string) => {
    const { deps, errors } = parsePredecessors(text, schedule.tree, id);
    setPredErrors((e) => {
      const n = { ...e };
      if (errors.length) n[id] = errors.join("; ");
      else delete n[id];
      return n;
    });
    update((p) => ({ ...p, wbs: updateItem(p.wbs, id, { predecessors: deps }) }));
  };

  const critical = leaves.filter((l) => schedule.items.get(l.id)?.critical).length;
  const baselineFinish = project.baseline
    ? Object.values(project.baseline.items).reduce((a, b) => (b.finish > a ? b.finish : a), "")
    : null;
  const slip = baselineFinish && leaves.length ? diffDays(schedule.finish, baselineFinish) : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Khởi công → hoàn thành" value={leaves.length ? `${formatDate(schedule.start)} → ${formatDate(schedule.finish)}` : "—"} />
        <Stat label="Tổng thời gian" value={`${formatNumber(schedule.duration)} ngày làm việc`} sub={leaves.length ? `${diffDays(schedule.finish, schedule.start) + 1} ngày lịch` : undefined} />
        <Stat label="Đường găng" value={`${critical} / ${leaves.length} công việc`} sub="Dự trữ toàn phần = 0" />
        <Stat
          label="Baseline (ngày lưu)"
          value={project.baseline ? formatDate(project.baseline.savedAt.slice(0, 10)) : "Chưa lưu"}
          sub={project.baseline ? (slip > 0 ? `Trễ ${slip} ngày so với baseline` : slip < 0 ? `Sớm ${-slip} ngày so với baseline` : "Đúng hạn baseline") : "Lưu để chốt kế hoạch cơ sở"}
          tone={project.baseline ? (slip > 0 ? "bad" : "good") : null}
        />
      </div>

      {schedule.cycle.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Quan hệ công việc bị vòng lặp ở:{" "}
          {schedule.cycle.map((id) => schedule.tree.code.get(id)).join(", ")}. Các liên kết trong vòng lặp đang bị bỏ qua khi tính tiến độ.
        </div>
      )}

      <Card
        title="Tiến độ thi công — biểu đồ Gantt"
        actions={
          <>
            <div className="flex overflow-hidden rounded-md border border-slate-300 text-xs" role="group" aria-label="Thang thời gian">
              {(["day", "week", "month"] as Zoom[]).map((z) => (
                <button key={z} aria-pressed={zoom === z} onClick={() => setZoom(z)} className={cx("h-8 px-2.5", zoom === z ? "bg-brand-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50")}>
                  {z === "day" ? "Ngày" : z === "week" ? "Tuần" : "Tháng"}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" checked={showCritical} onChange={(e) => setShowCritical(e.target.checked)} /> Đường găng
            </label>
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" checked={showBaseline} disabled={!project.baseline} onChange={(e) => setShowBaseline(e.target.checked)} /> Baseline
            </label>
            <Button size="sm" variant="primary" disabled={leaves.length === 0} onClick={saveBaseline}>
              {project.baseline ? "Cập nhật baseline" : "Lưu baseline (phê duyệt)"}
            </Button>
          </>
        }
      >
        {project.wbs.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">Chưa có công việc. Hãy lập WBS trước.</div>
        ) : (
          <div className="-mx-4 -mb-4 flex border-t border-slate-200">
            <div className="max-w-[55%] shrink-0 overflow-x-auto border-r border-slate-300">
              <table className="w-[700px] table-fixed text-sm">
                <thead className="text-left text-xs font-semibold text-slate-500">
                  <tr style={{ height: HEADER_H }} className="bg-slate-50">
                    <th className="w-16 px-2">Mã</th>
                    <th className="px-2">Công việc</th>
                    <th className="w-16 px-1 text-right" title="Thời lượng, ngày làm việc">TG</th>
                    <th className="w-[84px] px-2">Bắt đầu</th>
                    <th className="w-[84px] px-2">Kết thúc</th>
                    <th className="w-28 px-1" title="VD: 1.2, 2.1SS+3, 3.4FF-1">CV trước</th>
                    <th className="w-[92px] px-1" title="Ràng buộc: bắt đầu không sớm hơn ngày">Không sớm hơn</th>
                    <th className="w-14 px-2 text-right" title="Dự trữ toàn phần (ngày)">Dự trữ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ item, code, depth, leaf }) => {
                    const s = schedule.items.get(item.id);
                    const crit = showCritical && s?.critical;
                    return (
                      <tr
                        key={item.id}
                        style={{ height: ROW_H }}
                        onClick={() => setSelected(item.id)}
                        className={cx("border-t border-slate-100", item.id === selected ? "bg-brand-50" : !leaf && "bg-slate-50/70")}
                      >
                        <td className="truncate px-2 font-mono text-xs text-slate-500">{code}</td>
                        <td className="truncate px-2" title={item.name}>
                          <span className="flex items-center" style={{ paddingLeft: depth * 14 }}>
                            {!leaf ? (
                              <button className="w-4 shrink-0 text-xs text-slate-500" aria-label={collapsed.has(item.id) ? "Mở rộng" : "Thu gọn"} onClick={() => toggleCollapsed(item.id)}>
                                {collapsed.has(item.id) ? "▸" : "▾"}
                              </button>
                            ) : (
                              <span className="w-4 shrink-0" />
                            )}
                            <span className={cx("truncate", !leaf && "font-semibold", crit && leaf && "text-critical")}>{item.name}</span>
                          </span>
                        </td>
                        <td className="px-1">
                          {leaf ? (
                            <NumberInput ariaLabel={`Thời lượng ${code}`} value={item.duration} integer max={3650} format={(v) => String(v)} onCommit={(duration) => update((p) => ({ ...p, wbs: updateItem(p.wbs, item.id, { duration }) }))} />
                          ) : (
                            <span className="tabular block pr-1.5 text-right text-xs text-slate-500">{s?.duration ?? ""}</span>
                          )}
                        </td>
                        <td className="tabular px-2 text-xs">{s ? formatDate(s.start) : ""}</td>
                        <td className="tabular px-2 text-xs">{s ? formatDate(s.finish) : ""}</td>
                        <td className="px-1">
                          {leaf && (
                            <span title={predErrors[item.id]}>
                              <TextInput
                                ariaLabel={`Công việc trước ${code}`}
                                className="font-mono text-xs"
                                placeholder="—"
                                invalid={!!predErrors[item.id]}
                                value={formatPredecessors(item, schedule.tree)}
                                onCommit={(t) => setPreds(item.id, t)}
                              />
                            </span>
                          )}
                        </td>
                        <td className="px-1">
                          {leaf && (
                            <DateCell
                              label={`Bắt đầu không sớm hơn ${code}`}
                              min={project.startDate}
                              value={item.startNoEarlierThan}
                              onChange={(v) =>
                                update((p) => ({
                                  ...p,
                                  wbs: updateItem(p.wbs, item.id, { startNoEarlierThan: v && v >= p.startDate ? v : null }),
                                }))
                              }
                            />
                          )}
                        </td>
                        <td className={cx("tabular px-2 text-right text-xs", crit ? "font-semibold text-critical" : "text-slate-500")}>{s && leaf ? s.float : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="min-w-0 flex-1 overflow-x-auto">
              <Gantt
                rows={rows}
                schedule={schedule}
                baseline={project.baseline}
                calendar={project.calendar}
                percent={percent}
                statusDate={project.statusDate}
                zoom={zoom}
                showBaseline={showBaseline && !!project.baseline}
                showCritical={showCritical}
                selected={selected}
                onSelect={setSelected}
              />
            </div>
          </div>
        )}
      </Card>

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
        <Legend swatch={<span className="h-2.5 w-6 rounded-sm border border-pv bg-[#c3daf6]" />} label="Công việc (phần đậm = đã hoàn thành)" />
        <Legend swatch={<span className="h-2.5 w-6 rounded-sm bg-critical" />} label="Công việc găng" />
        <Legend swatch={<span className="h-1 w-6 rounded-sm bg-[#a8b3c2]" />} label="Baseline" />
        <Legend swatch={<span className="h-2.5 w-2.5 rotate-45 bg-brand-900" />} label="Mốc (milestone, thời lượng 0)" />
        <Legend swatch={<span className="h-3 w-0 border-l-2 border-dashed border-brand-700" />} label="Ngày cập nhật số liệu" />
        <span>
          Quan hệ: <b>FS</b> kết thúc–bắt đầu (mặc định), <b>SS</b>, <b>FF</b>, <b>SF</b>; độ trễ theo ngày làm việc, VD <code>2.1SS+3</code>.
        </span>
      </div>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      {swatch}
      {label}
    </span>
  );
}

/** Shows the constraint date compactly; becomes a date picker when clicked. */
function DateCell({ value, min, label, onChange }: { value: string | null; min: string; label: string; onChange: (v: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  if (!editing)
    return (
      <button type="button" aria-label={label} className="cell-input tabular text-left text-xs" onClick={() => setEditing(true)}>
        {value ? formatDate(value) : <span className="text-slate-300">—</span>}
      </button>
    );
  return (
    <input
      type="date"
      autoFocus
      aria-label={label}
      className="cell-input text-xs"
      min={min}
      defaultValue={value ?? ""}
      onBlur={(e) => {
        setEditing(false);
        const v = e.target.value;
        if ((isIsoDate(v) ? v : null) !== value) onChange(isIsoDate(v) ? v : null);
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}
