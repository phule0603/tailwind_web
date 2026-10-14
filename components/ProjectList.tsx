"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { deleteProject, listProjects, type StorageMode } from "@/lib/pm/client";
import { formatDate } from "@/lib/pm/dates";
import { formatPercent, formatVndShort } from "@/lib/pm/format";
import type { ProjectSummary } from "@/lib/pm/types";
import StorageNotice from "./StorageNotice";
import { Button, StatusBadge } from "./ui";

export default function ProjectList() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [mode, setMode] = useState<StorageMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    listProjects()
      .then((r) => {
        setProjects(r.projects);
        setMode(r.mode);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));

  useEffect(() => {
    void refresh();
  }, []);

  const remove = async (p: ProjectSummary) => {
    if (!confirm(`Xoá dự án "${p.name}"? Thao tác này không thể hoàn tác.`)) return;
    try {
      await deleteProject(p.id);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Danh sách dự án</h1>
          <p className="text-sm text-slate-500">Giai đoạn 1: khởi tạo dự án, lập WBS, ngân sách, tiến độ và theo dõi PV – EV – AC.</p>
        </div>
        <Link href="/projects/new" className="inline-flex h-9 items-center rounded-md bg-brand-600 px-3.5 text-sm font-medium text-white hover:bg-brand-700">
          + Tạo dự án
        </Link>
      </div>
      <StorageNotice mode={mode} />
      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
      {projects === null && !error && <div className="py-12 text-center text-sm text-slate-500">Đang tải…</div>}
      {projects?.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white py-16 text-center">
          <p className="text-slate-600">Chưa có dự án nào.</p>
          <p className="mt-1 text-sm text-slate-500">Tạo dự án đầu tiên — có thể bắt đầu từ dự án mẫu có sẵn số liệu.</p>
          <Link href="/projects/new" className="mt-4 inline-flex h-9 items-center rounded-md bg-brand-600 px-3.5 text-sm font-medium text-white hover:bg-brand-700">
            + Tạo dự án
          </Link>
        </div>
      )}
      {projects && projects.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Mã</th>
                <th className="px-4 py-2.5">Tên dự án</th>
                <th className="px-4 py-2.5">Chủ đầu tư</th>
                <th className="px-4 py-2.5">Trạng thái</th>
                <th className="px-4 py-2.5">Khởi công</th>
                <th className="px-4 py-2.5">Hoàn thành</th>
                <th className="px-4 py-2.5 text-right">Ngân sách</th>
                <th className="px-4 py-2.5 text-right">Hoàn thành</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {projects.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.code || "—"}</td>
                  <td className="px-4 py-3">
                    <Link href={`/projects/${p.id}`} className="font-medium text-brand-700 hover:underline">
                      {p.name}
                    </Link>
                    {p.location && <div className="text-xs text-slate-500">{p.location}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{p.client || "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="tabular px-4 py-3">{formatDate(p.startDate)}</td>
                  <td className="tabular px-4 py-3">{formatDate(p.finishDate)}</td>
                  <td className="tabular px-4 py-3 text-right">{formatVndShort(p.budget)}</td>
                  <td className="tabular px-4 py-3 text-right">{formatPercent(p.percentComplete)}</td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="ghost" onClick={() => remove(p)} aria-label={`Xoá ${p.name}`}>
                      Xoá
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
