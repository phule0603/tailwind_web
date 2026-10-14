"use client";

import { useRouter } from "next/navigation";
import { deleteProject } from "@/lib/pm/client";
import { diffDays, formatDate, isIsoDate } from "@/lib/pm/dates";
import { formatNumber, formatPercent, formatVnd, formatVndShort } from "@/lib/pm/format";
import { planningSteps } from "@/lib/pm/planning";
import CalendarEditor from "../CalendarEditor";
import { Button, Card, cx, Field, inputClass, NumberInput, Stat, TextInput } from "../ui";
import type { TabProps } from "./shared";

export default function OverviewTab({ project, analysis, update, goTo }: TabProps) {
  const router = useRouter();
  const steps = planningSteps(project, analysis);
  const doneCount = steps.filter((s) => s.done).length;
  const nextStep = steps.find((s) => !s.done);
  const { schedule, totals } = analysis;
  const leaves = project.wbs.filter((i) => schedule.tree.isLeaf(i.id));
  const criticalCount = leaves.filter((l) => schedule.items.get(l.id)?.critical).length;
  const set = <K extends keyof typeof project>(k: K, v: (typeof project)[K]) => update((p) => ({ ...p, [k]: v }));

  const remove = async () => {
    if (!confirm(`Xoá dự án "${project.name}"? Thao tác này không thể hoàn tác.`)) return;
    await deleteProject(project.id);
    router.push("/");
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Stat label="Tổng ngân sách (gồm dự phòng)" value={formatVndShort(analysis.totalBudget)} sub={`Trực tiếp ${formatVndShort(totals.bac)} + dự phòng ${formatPercent(project.contingencyPct)}`} />
          <Stat
            label="Thời gian thi công"
            value={`${formatNumber(schedule.duration)} ngày LV`}
            sub={leaves.length ? `${formatDate(schedule.start)} → ${formatDate(schedule.finish)} (${diffDays(schedule.finish, schedule.start) + 1} ngày lịch)` : "Chưa có công việc"}
          />
          <Stat label="Khối lượng thực hiện" value={formatPercent(totals.percent)} sub={`Kế hoạch đến ${formatDate(project.statusDate)}: ${formatPercent(totals.plannedPercent)}`} tone={totals.bac === 0 ? null : totals.percent >= totals.plannedPercent ? "good" : "bad"} />
          <Stat label="Gói công việc" value={formatNumber(leaves.length)} sub={`${criticalCount} công việc găng`} />
        </div>

        <Card
          title={`Quy trình lập kế hoạch — ${doneCount}/${steps.length} bước`}
          actions={nextStep && <Button size="sm" variant="primary" onClick={() => goTo(nextStep.tab)}>Làm bước tiếp theo →</Button>}
        >
          <div className="mb-4 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={doneCount} aria-valuemax={steps.length}>
            <div className="h-full rounded-full bg-good transition-all" style={{ width: `${(100 * doneCount) / steps.length}%` }} />
          </div>
          <ol className="space-y-2">
            {steps.map((s, i) => (
              <li key={s.id} className={cx("flex items-start gap-3 rounded-md border p-3", s.done ? "border-slate-100 bg-slate-50" : s === nextStep ? "border-brand-100 bg-brand-50" : "border-slate-100")}>
                <span
                  className={cx(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    s.done ? "bg-good text-white" : "bg-white text-slate-500 ring-1 ring-slate-300",
                  )}
                  aria-label={s.done ? "Đã xong" : "Chưa xong"}
                >
                  {s.done ? "✓" : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-800">{s.title}</div>
                  <div className="text-xs text-slate-500">{s.description}</div>
                  {s.hint && <div className="mt-0.5 text-xs text-warn">{s.hint}</div>}
                </div>
                <Button size="sm" variant="ghost" onClick={() => goTo(s.tab)}>
                  Mở
                </Button>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <div className="space-y-4">
        <Card title="Thông tin dự án">
          <div className="space-y-3">
            <Field label="Tên dự án">
              <TextInput boxed value={project.name} onCommit={(v) => v.trim() && set("name", v.trim())} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mã dự án">
                <TextInput boxed value={project.code} onCommit={(v) => set("code", v.trim())} />
              </Field>
              <Field label="Ngày khởi công">
                <input
                  type="date"
                  className={inputClass}
                  value={project.startDate}
                  onChange={(e) => isIsoDate(e.target.value) && set("startDate", e.target.value)}
                />
              </Field>
            </div>
            <Field label="Chủ đầu tư">
              <TextInput boxed value={project.client} onCommit={(v) => set("client", v.trim())} />
            </Field>
            <Field label="Địa điểm">
              <TextInput boxed value={project.location} onCommit={(v) => set("location", v.trim())} />
            </Field>
            <Field label="Giám đốc / chỉ huy trưởng dự án">
              <TextInput boxed value={project.manager} onCommit={(v) => set("manager", v.trim())} />
            </Field>
            <Field label="Dự phòng phí (%)" hint={`= ${formatVnd(analysis.contingency)}`}>
              <NumberInput boxed value={project.contingencyPct} max={100} onCommit={(v) => set("contingencyPct", v)} />
            </Field>
            <Field label="Mô tả, phạm vi">
              <textarea
                className={cx(inputClass, "min-h-20")}
                defaultValue={project.description}
                onBlur={(e) => e.target.value !== project.description && set("description", e.target.value)}
              />
            </Field>
          </div>
        </Card>
        <Card title="Lịch làm việc">
          <CalendarEditor value={project.calendar} onChange={(c) => set("calendar", c)} />
        </Card>
        <Button variant="danger" className="w-full" onClick={remove}>
          Xoá dự án
        </Button>
      </div>
    </div>
  );
}
