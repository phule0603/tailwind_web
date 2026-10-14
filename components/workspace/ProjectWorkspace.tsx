"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useState } from "react";
import { useProject, type SaveState } from "@/hooks/useProject";
import { PROJECT_STATUS_LABEL, type ProjectStatus } from "@/lib/pm/types";
import StorageNotice from "../StorageNotice";
import { Button, cx, StatusBadge } from "../ui";
import EvmTab from "./EvmTab";
import OverviewTab from "./OverviewTab";
import ScheduleTab from "./ScheduleTab";
import type { TabId, TabProps } from "./shared";
import WbsTab from "./WbsTab";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Tổng quan & quy trình" },
  { id: "wbs", label: "WBS & Ngân sách" },
  { id: "schedule", label: "Tiến độ (Gantt)" },
  { id: "evm", label: "Giá trị thu được (PV – EV – AC)" },
];

const SAVE_LABEL: Record<SaveState, string> = {
  saved: "Đã lưu",
  dirty: "Chưa lưu…",
  saving: "Đang lưu…",
  error: "Lỗi khi lưu",
  conflict: "Xung đột phiên bản",
};

export default function ProjectWorkspace({ id }: { id: string }) {
  return (
    <Suspense fallback={<Loading />}>
      <Workspace id={id} />
    </Suspense>
  );
}

function Loading({ text = "Đang tải dự án…" }: { text?: string }) {
  return <div className="py-20 text-center text-sm text-slate-500">{text}</div>;
}

function Workspace({ id }: { id: string }) {
  const handle = useProject(id);
  const { project, analysis, update, saveState } = handle;
  const router = useRouter();
  const search = useSearchParams();
  const tabParam = search.get("tab") as TabId | null;
  const tab: TabId = TABS.some((t) => t.id === tabParam) ? tabParam! : "overview";
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const goTo = useCallback(
    (t: TabId) => router.replace(`/projects/${id}?tab=${t}`, { scroll: false }),
    [router, id],
  );
  const toggleCollapsed = useCallback(
    (itemId: string) =>
      setCollapsed((s) => {
        const n = new Set(s);
        if (n.has(itemId)) n.delete(itemId);
        else n.add(itemId);
        return n;
      }),
    [],
  );

  if (handle.notFound)
    return (
      <div className="py-20 text-center">
        <p className="text-slate-600">Không tìm thấy dự án.</p>
        <Link href="/" className="mt-2 inline-block text-sm text-brand-700 hover:underline">
          ← Về danh sách dự án
        </Link>
      </div>
    );
  if (handle.loadError) return <Loading text={handle.loadError} />;
  if (!project || !analysis) return <Loading />;

  const props: TabProps = { project, analysis, update, collapsed, toggleCollapsed, goTo };

  return (
    <main className="mx-auto max-w-[1600px] space-y-4 px-4 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/" className="text-xs text-slate-500 hover:text-brand-700">
            ← Danh sách dự án
          </Link>
          <h1 className="mt-0.5 flex flex-wrap items-center gap-2 text-xl font-semibold text-slate-900">
            {project.code && <span className="font-mono text-base text-slate-400">{project.code}</span>}
            <span className="truncate">{project.name}</span>
            <StatusBadge status={project.status} />
          </h1>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <select
            aria-label="Trạng thái dự án"
            className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
            value={project.status}
            onChange={(e) => update((p) => ({ ...p, status: e.target.value as ProjectStatus }), true)}
          >
            {Object.entries(PROJECT_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <span
            role="status"
            className={cx(
              "flex items-center gap-1.5 text-xs",
              saveState === "saved" ? "text-slate-500" : saveState === "error" || saveState === "conflict" ? "text-critical" : "text-warn",
            )}
          >
            <span className={cx("h-2 w-2 rounded-full", saveState === "saved" ? "bg-good" : saveState === "error" || saveState === "conflict" ? "bg-critical" : "bg-warn")} />
            {SAVE_LABEL[saveState]}
          </span>
        </div>
      </div>

      <StorageNotice mode={handle.mode} />

      {saveState === "error" && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {handle.saveError}
          <Button size="sm" onClick={() => void handle.retrySave()}>
            Thử lại
          </Button>
        </div>
      )}
      {saveState === "conflict" && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Dự án vừa được cập nhật ở nơi khác. Chọn bản muốn giữ:
          <Button size="sm" onClick={() => handle.resolveConflict("theirs")}>
            Tải bản mới nhất (bỏ thay đổi của tôi)
          </Button>
          <Button size="sm" variant="danger" onClick={() => handle.resolveConflict("mine")}>
            Ghi đè bằng bản của tôi
          </Button>
        </div>
      )}

      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => goTo(t.id)}
            className={cx(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium",
              tab === t.id ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "overview" && <OverviewTab {...props} />}
      {tab === "wbs" && <WbsTab {...props} />}
      {tab === "schedule" && <ScheduleTab {...props} />}
      {tab === "evm" && <EvmTab {...props} />}
    </main>
  );
}
