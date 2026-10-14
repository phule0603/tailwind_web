"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createProject } from "@/lib/pm/client";
import { todayIso } from "@/lib/pm/dates";
import { DEFAULT_CALENDAR, type ProjectInfo } from "@/lib/pm/project";
import { TEMPLATES, type TemplateId } from "@/lib/pm/templates";
import CalendarEditor from "./CalendarEditor";
import { Button, Card, cx, Field, inputClass } from "./ui";

export default function NewProjectForm() {
  const router = useRouter();
  const [info, setInfo] = useState<ProjectInfo>(() => ({
    code: "",
    name: "",
    client: "",
    location: "",
    manager: "",
    description: "",
    startDate: todayIso(),
    contingencyPct: 5,
    calendar: DEFAULT_CALENDAR,
  }));
  const [template, setTemplate] = useState<TemplateId>("standard");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof ProjectInfo>(k: K, v: ProjectInfo[K]) => setInfo((i) => ({ ...i, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!info.name.trim()) {
      setError("Vui lòng nhập tên dự án");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const p = await createProject(info, template);
      router.push(`/projects/${p.id}?tab=${template === "blank" ? "wbs" : "overview"}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Tạo dự án mới</h1>
        <p className="text-sm text-slate-500">Bước 1 của quy trình lập kế hoạch: khởi tạo dự án.</p>
      </div>

      <Card title="Thông tin dự án">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tên dự án *" className="sm:col-span-2">
            <input className={inputClass} value={info.name} onChange={(e) => set("name", e.target.value)} placeholder="VD: Nhà phố 5 tầng – 12 Nguyễn Văn Linh" autoFocus />
          </Field>
          <Field label="Mã dự án">
            <input className={inputClass} value={info.code} onChange={(e) => set("code", e.target.value)} placeholder="VD: NP-2026-01" />
          </Field>
          <Field label="Chủ đầu tư">
            <input className={inputClass} value={info.client} onChange={(e) => set("client", e.target.value)} />
          </Field>
          <Field label="Địa điểm xây dựng">
            <input className={inputClass} value={info.location} onChange={(e) => set("location", e.target.value)} />
          </Field>
          <Field label="Giám đốc / chỉ huy trưởng dự án">
            <input className={inputClass} value={info.manager} onChange={(e) => set("manager", e.target.value)} />
          </Field>
          <Field label="Ngày khởi công">
            <input type="date" required className={inputClass} value={info.startDate} onChange={(e) => set("startDate", e.target.value)} />
          </Field>
          <Field label="Dự phòng phí (%)" hint="Cộng thêm vào tổng chi phí trực tiếp để ra tổng ngân sách.">
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              className={inputClass}
              value={info.contingencyPct}
              onChange={(e) => set("contingencyPct", Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
            />
          </Field>
          <Field label="Mô tả, phạm vi" className="sm:col-span-2">
            <textarea className={cx(inputClass, "min-h-20")} value={info.description} onChange={(e) => set("description", e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card title="Lịch làm việc">
        <CalendarEditor value={info.calendar} onChange={(c) => set("calendar", c)} />
      </Card>

      <Card title="Khởi tạo WBS từ">
        <div className="grid gap-3 sm:grid-cols-3" role="radiogroup">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={template === t.id}
              onClick={() => setTemplate(t.id)}
              className={cx(
                "rounded-lg border p-3 text-left text-sm transition-colors",
                template === t.id ? "border-brand-500 bg-brand-50 ring-2 ring-brand-100" : "border-slate-200 bg-white hover:border-slate-300",
              )}
            >
              <div className="font-medium text-slate-800">{t.title}</div>
              <div className="mt-1 text-xs text-slate-500">{t.description}</div>
            </button>
          ))}
        </div>
      </Card>

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
      <div className="flex justify-end gap-2">
        <Button onClick={() => router.push("/")}>Huỷ</Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Đang tạo…" : "Tạo dự án"}
        </Button>
      </div>
    </form>
  );
}
