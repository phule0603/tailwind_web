"use client";

import { useMemo, useState } from "react";
import { formatPercent, formatVnd, formatVndShort } from "@/lib/pm/format";
import { COST_CATEGORIES, COST_CATEGORY_LABEL, type CostCategory, type WbsItem } from "@/lib/pm/types";
import { addItem, indentItem, moveItem, outdentItem, removeItem, updateItem } from "@/lib/pm/wbs";
import { Button, Card, cx, NumberInput, TextInput } from "../ui";
import { visibleRows, type TabProps } from "./shared";

export default function WbsTab({ project, analysis, update, collapsed, toggleCollapsed }: TabProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const rows = visibleRows(project, analysis, collapsed);
  const sel = selected && project.wbs.some((i) => i.id === selected) ? selected : null;
  const { values, totals } = analysis;

  const edit = (id: string, patch: Partial<WbsItem>) => update((p) => ({ ...p, wbs: updateItem(p.wbs, id, patch) }));
  const structural = (fn: (items: WbsItem[]) => WbsItem[]) => update((p) => ({ ...p, wbs: fn(p.wbs) }), true);
  const add = (opts: Parameters<typeof addItem>[1]) => {
    let newId = "";
    update((p) => {
      const r = addItem(p.wbs, opts);
      newId = r.id;
      return { ...p, wbs: r.items };
    }, true);
    if (newId) setSelected(newId);
    if (opts.parentId && collapsed.has(opts.parentId)) toggleCollapsed(opts.parentId);
  };

  const selItem = sel ? project.wbs.find((i) => i.id === sel) : undefined;
  const remove = () => {
    if (!selItem) return;
    const hasKids = !analysis.schedule.tree.isLeaf(selItem.id);
    if (!confirm(`Xoá "${selItem.name}"${hasKids ? " cùng toàn bộ hạng mục con" : ""}?`)) return;
    structural((w) => removeItem(w, selItem.id));
    setSelected(null);
  };

  const topLevel = useMemo(
    () =>
      (analysis.schedule.tree.children.get(null) ?? []).map((id) => ({
        id,
        label: `${analysis.schedule.tree.code.get(id)}. ${analysis.schedule.tree.byId.get(id)!.name}`,
        value: values.get(id)?.bac ?? 0,
      })),
    [analysis, values],
  );
  const categories = COST_CATEGORIES.map((c) => ({ id: c, label: COST_CATEGORY_LABEL[c], value: analysis.byCategory[c] })).filter((c) => c.value > 0);

  return (
    <div className="space-y-4">
      <Card
        title="Cấu trúc phân chia công việc (WBS) và ngân sách"
        actions={
          <>
            <Button size="sm" variant="primary" onClick={() => add({ parentId: null, patch: { name: "Hạng mục mới" } })}>
              + Hạng mục cấp 1
            </Button>
            <Button size="sm" disabled={!sel} onClick={() => sel && add({ parentId: sel, patch: { name: "Công việc mới" } })}>
              + Công việc con
            </Button>
            <Button size="sm" disabled={!sel} onClick={() => sel && add({ afterId: sel, patch: { name: "Công việc mới" } })}>
              + Cùng cấp
            </Button>
            <span className="mx-1 h-5 w-px bg-slate-200" />
            <Button size="sm" disabled={!sel} title="Lùi cấp (outdent)" onClick={() => sel && structural((w) => outdentItem(w, sel))}>
              ⇤
            </Button>
            <Button size="sm" disabled={!sel} title="Thụt cấp (indent)" onClick={() => sel && structural((w) => indentItem(w, sel))}>
              ⇥
            </Button>
            <Button size="sm" disabled={!sel} title="Lên" onClick={() => sel && structural((w) => moveItem(w, sel, -1))}>
              ↑
            </Button>
            <Button size="sm" disabled={!sel} title="Xuống" onClick={() => sel && structural((w) => moveItem(w, sel, 1))}>
              ↓
            </Button>
            <Button size="sm" variant="danger" disabled={!sel} onClick={remove}>
              Xoá
            </Button>
          </>
        }
      >
        {project.wbs.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">
            WBS đang trống. Bấm <b>+ Hạng mục cấp 1</b> để bắt đầu (VD: Phần móng, Phần thân, Hoàn thiện…), sau đó thêm các công việc con.
          </div>
        ) : (
          <div className="-mx-4 -mb-4 overflow-x-auto">
            <table className="w-full min-w-[1080px] text-sm">
              <thead className="border-y border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <tr>
                  <th className="w-20 px-3 py-2">Mã WBS</th>
                  <th className="px-3 py-2">Hạng mục / công việc</th>
                  <th className="w-20 px-2 py-2">ĐVT</th>
                  <th className="w-32 px-2 py-2 text-right">Khối lượng</th>
                  <th className="w-36 px-2 py-2 text-right">Đơn giá (₫)</th>
                  <th className="w-40 px-3 py-2 text-right">Thành tiền (₫)</th>
                  <th className="w-36 px-2 py-2">Loại chi phí</th>
                  <th className="w-20 px-3 py-2 text-right">Tỷ trọng</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ item, code, depth, leaf }) => {
                  const v = values.get(item.id)!;
                  const isSel = item.id === sel;
                  return (
                    <tr
                      key={item.id}
                      onClick={() => setSelected(item.id)}
                      aria-selected={isSel}
                      className={cx("border-b border-slate-100", isSel ? "bg-brand-50" : leaf ? "hover:bg-slate-50" : "bg-slate-50/70 hover:bg-slate-100/70")}
                    >
                      <td className="px-3 py-1 font-mono text-xs text-slate-500">{code}</td>
                      <td className="py-1 pr-2">
                        <div className="flex items-center" style={{ paddingLeft: depth * 18 }}>
                          {leaf ? (
                            <span className="w-5" />
                          ) : (
                            <button
                              className="w-5 text-xs text-slate-500"
                              aria-label={collapsed.has(item.id) ? "Mở rộng" : "Thu gọn"}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleCollapsed(item.id);
                              }}
                            >
                              {collapsed.has(item.id) ? "▸" : "▾"}
                            </button>
                          )}
                          <TextInput
                            ariaLabel={`Tên ${code}`}
                            className={cx(!leaf && "font-semibold")}
                            value={item.name}
                            onCommit={(name) => name.trim() && edit(item.id, { name: name.trim() })}
                          />
                        </div>
                      </td>
                      {leaf ? (
                        <>
                          <td className="px-1 py-1">
                            <TextInput ariaLabel={`ĐVT ${code}`} value={item.unit} placeholder="m³" onCommit={(unit) => edit(item.id, { unit: unit.trim() })} />
                          </td>
                          <td className="px-1 py-1">
                            <NumberInput ariaLabel={`Khối lượng ${code}`} value={item.quantity} onCommit={(quantity) => edit(item.id, { quantity })} />
                          </td>
                          <td className="px-1 py-1">
                            <NumberInput ariaLabel={`Đơn giá ${code}`} value={item.unitPrice} integer onCommit={(unitPrice) => edit(item.id, { unitPrice })} />
                          </td>
                          <td className="tabular px-3 py-1 text-right">{v.bac ? formatVnd(v.bac).replace(" ₫", "") : item.duration === 0 ? <span className="text-slate-400">mốc</span> : <span className="text-warn">chưa có</span>}</td>
                          <td className="px-1 py-1">
                            <select
                              aria-label={`Loại chi phí ${code}`}
                              className="cell-input"
                              value={item.category}
                              onChange={(e) => edit(item.id, { category: e.target.value as CostCategory })}
                            >
                              {COST_CATEGORIES.map((c) => (
                                <option key={c} value={c}>
                                  {COST_CATEGORY_LABEL[c]}
                                </option>
                              ))}
                            </select>
                          </td>
                        </>
                      ) : (
                        <>
                          <td colSpan={3} className="px-3 py-1 text-xs text-slate-400">
                            tổng hợp từ {analysis.schedule.tree.children.get(item.id)?.length} mục con
                          </td>
                          <td className="tabular px-3 py-1 text-right font-semibold">{formatVnd(v.bac).replace(" ₫", "")}</td>
                          <td />
                        </>
                      )}
                      <td className="tabular px-3 py-1 text-right text-xs text-slate-500">{totals.bac ? formatPercent((100 * v.bac) / totals.bac) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="text-sm">
                <tr className="border-b border-slate-100">
                  <td colSpan={5} className="px-3 py-2 text-right text-slate-600">
                    Tổng chi phí trực tiếp (BAC)
                  </td>
                  <td className="tabular px-3 py-2 text-right font-semibold">{formatVnd(totals.bac)}</td>
                  <td colSpan={2} />
                </tr>
                <tr className="border-b border-slate-100">
                  <td colSpan={5} className="px-3 py-2 text-right text-slate-600">
                    Dự phòng phí ({formatPercent(project.contingencyPct)})
                  </td>
                  <td className="tabular px-3 py-2 text-right">{formatVnd(analysis.contingency)}</td>
                  <td colSpan={2} />
                </tr>
                <tr>
                  <td colSpan={5} className="px-3 py-2 text-right font-semibold text-slate-800">
                    Tổng ngân sách dự án
                  </td>
                  <td className="tabular px-3 py-2 text-right text-base font-bold text-brand-700">{formatVnd(analysis.totalBudget)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {totals.bac > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Ngân sách theo hạng mục">
            <Bars rows={topLevel} total={totals.bac} />
          </Card>
          <Card title="Ngân sách theo loại chi phí">
            <Bars rows={categories} total={totals.bac} />
          </Card>
        </div>
      )}
      <p className="text-xs text-slate-500">
        Mẹo: nhập số theo kiểu Việt Nam (1.250.000 hoặc 1,5). Thành tiền = khối lượng × đơn giá; hạng mục tổng hợp cộng dồn từ các mục con. Thời lượng và quan hệ
        công việc được nhập ở tab Tiến độ.
      </p>
    </div>
  );
}

/** Single-series horizontal bars with direct value labels. */
function Bars({ rows, total }: { rows: { id: string; label: string; value: number }[]; total: number }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.id} className="text-sm" title={`${r.label}: ${formatVnd(r.value)}`}>
          <div className="mb-1 flex justify-between gap-3">
            <span className="truncate text-slate-700">{r.label}</span>
            <span className="tabular shrink-0 text-slate-600">
              {formatVndShort(r.value)} · {formatPercent((100 * r.value) / total)}
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-pv" style={{ width: `${(100 * r.value) / max}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
