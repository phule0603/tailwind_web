"use client";

import { useMemo } from "react";
import { formatDate, isIsoDate } from "@/lib/pm/dates";
import { curveStep, indices, plannedValueCurve } from "@/lib/pm/evm";
import { formatIndex, formatPercent, formatVnd, formatVndShort } from "@/lib/pm/format";
import { withStatusSnapshot } from "@/lib/pm/project";
import type { StatusSnapshot } from "@/lib/pm/types";
import { updateItem } from "@/lib/pm/wbs";
import { Button, Card, cx, inputClass, NumberInput, Stat } from "../ui";
import SCurve from "./SCurve";
import { visibleRows, type TabProps } from "./shared";

const signed = (v: number) => (v > 0 ? "+" : "") + formatVndShort(v);
const tone = (good: boolean | null) => (good === null ? null : good ? "good" : "bad");

export default function EvmTab({ project, analysis, update, collapsed, toggleCollapsed, goTo }: TabProps) {
  const { totals, values, schedule } = analysis;
  const rows = visibleRows(project, analysis, collapsed);

  const curve = useMemo(
    () => plannedValueCurve(project, schedule, curveStep(schedule.start, schedule.finish)),
    [project, schedule],
  );
  // recorded periods + the live figures at the status date
  const points = useMemo<StatusSnapshot[]>(() => {
    const live = { date: project.statusDate, pv: totals.pv, ev: totals.ev, ac: totals.ac };
    return [...project.history.filter((h) => h.date !== live.date && h.date < live.date), live];
  }, [project.history, project.statusDate, totals]);

  const snapshotExists = project.history.some((h) => h.date === project.statusDate);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Ngày cập nhật số liệu (data date)</span>
            <input
              type="date"
              className={cx(inputClass, "w-44")}
              value={project.statusDate}
              onChange={(e) => isIsoDate(e.target.value) && update((p) => ({ ...p, statusDate: e.target.value }))}
            />
          </label>
          <Button variant="primary" disabled={totals.bac === 0} onClick={() => update((p) => withStatusSnapshot(p, analysis), true)}>
            {snapshotExists ? "Cập nhật số liệu kỳ này" : "Chốt số liệu kỳ báo cáo"}
          </Button>
          <p className="max-w-xl text-xs text-slate-500">
            Nhập <b>% hoàn thành</b> và <b>chi phí thực tế</b> của từng công việc ở bảng bên dưới, rồi chốt số liệu để lưu lại một điểm trên đường cong S.
            {!project.baseline && (
              <>
                {" "}
                <span className="text-warn">Chưa có baseline: PV đang tính theo kế hoạch hiện hành.</span>{" "}
                <button className="text-brand-700 underline" onClick={() => goTo("schedule")}>
                  Lưu baseline
                </button>
              </>
            )}
          </p>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Stat label="BAC – ngân sách khi hoàn thành" value={formatVndShort(totals.bac)} sub={formatVnd(totals.bac)} />
        <Stat label="PV – giá trị kế hoạch" value={formatVndShort(totals.pv)} sub={`${formatPercent(totals.plannedPercent)} BAC theo kế hoạch`} />
        <Stat label="EV – giá trị thu được" value={formatVndShort(totals.ev)} sub={`${formatPercent(totals.percent)} khối lượng hoàn thành`} />
        <Stat label="AC (AV) – chi phí thực tế" value={formatVndShort(totals.ac)} sub={formatVnd(totals.ac)} />
        <Stat label="SV = EV − PV" value={signed(totals.sv)} sub={totals.sv >= 0 ? "Vượt / đúng tiến độ" : "Chậm tiến độ"} tone={tone(totals.pv ? totals.sv >= 0 : null)} />
        <Stat label="CV = EV − AC" value={signed(totals.cv)} sub={totals.cv >= 0 ? "Tiết kiệm / đúng chi phí" : "Vượt chi phí"} tone={tone(totals.ac ? totals.cv >= 0 : null)} />
        <Stat label="SPI = EV / PV" value={formatIndex(totals.spi)} sub={totals.spi === null ? "Chưa có PV" : totals.spi >= 1 ? "≥ 1: đúng / vượt tiến độ" : "< 1: chậm tiến độ"} tone={tone(totals.spi === null ? null : totals.spi >= 1)} />
        <Stat label="CPI = EV / AC" value={formatIndex(totals.cpi)} sub={totals.cpi === null ? "Chưa có AC" : totals.cpi >= 1 ? "≥ 1: trong ngân sách" : "< 1: vượt ngân sách"} tone={tone(totals.cpi === null ? null : totals.cpi >= 1)} />
        <Stat label="EAC – dự báo tổng chi phí" value={formatVndShort(totals.eac)} sub="= BAC / CPI" />
        <Stat label="ETC – chi phí còn lại" value={formatVndShort(totals.etc)} sub="= EAC − AC" />
        <Stat label="VAC = BAC − EAC" value={signed(totals.vac)} sub={totals.vac >= 0 ? "Dự kiến trong ngân sách" : "Dự kiến vượt ngân sách"} tone={tone(totals.ac ? totals.vac >= 0 : null)} />
        <Stat label="TCPI" value={formatIndex(totals.tcpi)} sub="Hiệu suất chi phí cần đạt để về đích đúng BAC" />
      </div>

      <Card title="Đường cong S — PV, EV, AC lũy kế">
        <SCurve curve={curve} points={points} bac={totals.bac} statusDate={project.statusDate} />
      </Card>

      <Card title={`Giá trị thu được theo hạng mục tại ngày ${formatDate(project.statusDate)}`}>
        <div className="-mx-4 -mb-4 overflow-x-auto">
          <table className="w-full min-w-[1180px] text-sm">
            <thead className="border-y border-slate-200 bg-slate-50 text-right text-xs font-semibold text-slate-500">
              <tr>
                <th className="w-16 px-3 py-2 text-left">Mã</th>
                <th className="px-3 py-2 text-left">Hạng mục / công việc</th>
                <th className="px-3 py-2">BAC</th>
                <th className="w-20 px-2 py-2">% KH</th>
                <th className="w-24 px-2 py-2">% TT</th>
                <th className="px-3 py-2">PV</th>
                <th className="px-3 py-2">EV</th>
                <th className="w-40 px-2 py-2">AC (AV)</th>
                <th className="px-3 py-2">SV</th>
                <th className="px-3 py-2">CV</th>
                <th className="w-16 px-2 py-2">SPI</th>
                <th className="w-16 px-3 py-2">CPI</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ item, code, depth, leaf }) => {
                const v = values.get(item.id)!;
                const ix = indices(v.bac, v.pv, v.ev, v.ac);
                return (
                  <tr key={item.id} className={cx("tabular border-b border-slate-100 text-right", !leaf && "bg-slate-50/70 font-semibold")}>
                    <td className="px-3 py-1 text-left font-mono text-xs font-normal text-slate-500">{code}</td>
                    <td className="max-w-80 truncate py-1 pr-2 text-left" title={item.name}>
                      <span className="flex items-center" style={{ paddingLeft: depth * 14 }}>
                        {!leaf ? (
                          <button className="w-4 shrink-0 text-xs text-slate-500" aria-label={collapsed.has(item.id) ? "Mở rộng" : "Thu gọn"} onClick={() => toggleCollapsed(item.id)}>
                            {collapsed.has(item.id) ? "▸" : "▾"}
                          </button>
                        ) : (
                          <span className="w-4 shrink-0" />
                        )}
                        <span className="truncate">{item.name}</span>
                      </span>
                    </td>
                    <td className="px-3 py-1">{formatVndShort(v.bac)}</td>
                    <td className="px-2 py-1 text-slate-500">{formatPercent(v.plannedPercent, 0)}</td>
                    <td className="px-1 py-1">
                      {leaf ? (
                        <NumberInput ariaLabel={`% hoàn thành ${code}`} value={item.percentComplete} max={100} onCommit={(percentComplete) => update((p) => ({ ...p, wbs: updateItem(p.wbs, item.id, { percentComplete }) }))} />
                      ) : (
                        formatPercent(v.percent, 0)
                      )}
                    </td>
                    <td className="px-3 py-1">{formatVndShort(v.pv)}</td>
                    <td className="px-3 py-1">{formatVndShort(v.ev)}</td>
                    <td className="px-1 py-1">
                      {leaf ? (
                        <NumberInput ariaLabel={`Chi phí thực tế ${code}`} value={item.actualCost} integer format={(n) => formatVnd(n).replace(" ₫", "")} onCommit={(actualCost) => update((p) => ({ ...p, wbs: updateItem(p.wbs, item.id, { actualCost }) }))} />
                      ) : (
                        <span className="pr-1.5">{formatVndShort(v.ac)}</span>
                      )}
                    </td>
                    <td className={cx("px-3 py-1", ix.sv < -0.5 && "text-critical")}>{v.pv || v.ev ? signed(ix.sv) : "—"}</td>
                    <td className={cx("px-3 py-1", ix.cv < -0.5 && "text-critical")}>{v.ac || v.ev ? signed(ix.cv) : "—"}</td>
                    <td className={cx("px-2 py-1", ix.spi !== null && ix.spi < 1 && "text-critical")}>{formatIndex(ix.spi)}</td>
                    <td className={cx("px-3 py-1", ix.cpi !== null && ix.cpi < 1 && "text-critical")}>{formatIndex(ix.cpi)}</td>
                  </tr>
                );
              })}
              <tr className="tabular border-t-2 border-slate-200 text-right font-bold">
                <td />
                <td className="px-3 py-2 text-left">Toàn dự án</td>
                <td className="px-3 py-2">{formatVndShort(totals.bac)}</td>
                <td className="px-2 py-2">{formatPercent(totals.plannedPercent, 0)}</td>
                <td className="px-2 py-2">{formatPercent(totals.percent, 0)}</td>
                <td className="px-3 py-2">{formatVndShort(totals.pv)}</td>
                <td className="px-3 py-2">{formatVndShort(totals.ev)}</td>
                <td className="px-3 py-2">{formatVndShort(totals.ac)}</td>
                <td className="px-3 py-2">{signed(totals.sv)}</td>
                <td className="px-3 py-2">{signed(totals.cv)}</td>
                <td className="px-2 py-2">{formatIndex(totals.spi)}</td>
                <td className="px-3 py-2">{formatIndex(totals.cpi)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Lịch sử các kỳ báo cáo">
        {project.history.length === 0 ? (
          <p className="text-sm text-slate-500">Chưa chốt kỳ báo cáo nào.</p>
        ) : (
          <div className="-mx-4 -mb-4 overflow-x-auto">
            <table className="tabular w-full min-w-[720px] text-right text-sm">
              <thead className="border-y border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Ngày</th>
                  <th className="px-3 py-2">PV</th>
                  <th className="px-3 py-2">EV</th>
                  <th className="px-3 py-2">AC (AV)</th>
                  <th className="px-3 py-2">SPI</th>
                  <th className="px-3 py-2">CPI</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {[...project.history].reverse().map((h) => {
                  const ix = indices(totals.bac, h.pv, h.ev, h.ac);
                  return (
                    <tr key={h.date} className="border-b border-slate-100">
                      <td className="px-3 py-1.5 text-left">{formatDate(h.date)}</td>
                      <td className="px-3 py-1.5">{formatVnd(h.pv)}</td>
                      <td className="px-3 py-1.5">{formatVnd(h.ev)}</td>
                      <td className="px-3 py-1.5">{formatVnd(h.ac)}</td>
                      <td className={cx("px-3 py-1.5", ix.spi !== null && ix.spi < 1 && "text-critical")}>{formatIndex(ix.spi)}</td>
                      <td className={cx("px-3 py-1.5", ix.cpi !== null && ix.cpi < 1 && "text-critical")}>{formatIndex(ix.cpi)}</td>
                      <td className="px-3 py-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Xoá kỳ ${formatDate(h.date)}`}
                          onClick={() => update((p) => ({ ...p, history: p.history.filter((x) => x.date !== h.date) }), true)}
                        >
                          Xoá
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
