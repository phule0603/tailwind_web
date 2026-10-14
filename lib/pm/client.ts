"use client";

import type { ApiFailure, ListResponse, ProjectResponse } from "./api";
import { sanitizeProject, summarize, type ProjectInfo } from "./project";
import { newProject, type TemplateId } from "./templates";
import type { Project, ProjectSummary } from "./types";

/*
 * Where projects live, seen from the browser: the server API when it has
 * storage (Redis, or memory in development), otherwise this browser's
 * localStorage. The mode is decided once per page load from GET /api/projects.
 */

export type StorageMode = "server" | "local";

export class SaveConflict extends Error {
  constructor(readonly current: Project | undefined) {
    super("Dự án đã được người khác cập nhật");
  }
}

const LOCAL_KEY = "qlda:projects:v1";
let modePromise: Promise<StorageMode> | null = null;

function readLocal(): Record<string, Project> {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as Record<string, Project>) : {};
  } catch {
    return {};
  }
}

function writeLocal(all: Record<string, Project>) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(all));
  } catch {
    throw new Error("Không lưu được vào bộ nhớ trình duyệt (có thể đã đầy)");
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as T | ApiFailure | null;
  if (res.status === 409 && body && (body as ApiFailure).error === "conflict") {
    throw new SaveConflict((body as ApiFailure).project);
  }
  if (!res.ok || !body) {
    const msg = (body as ApiFailure | null)?.message;
    throw new Error(msg || `Lỗi máy chủ (HTTP ${res.status})`);
  }
  return body as T;
}

async function list(): Promise<{ mode: StorageMode; projects: ProjectSummary[] }> {
  try {
    const r = await call<ListResponse>("/api/projects");
    if (r.enabled) return { mode: "server", projects: r.projects };
  } catch (err) {
    if (modePromise && (await modePromise) === "server") throw err;
  }
  const projects = Object.values(readLocal())
    .map((p) => summarize(p))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return { mode: "local", projects };
}

export function storageMode(): Promise<StorageMode> {
  modePromise ??= list()
    .then((r) => r.mode)
    .catch(() => "local" as const);
  return modePromise;
}

export async function listProjects() {
  const r = await list();
  modePromise = Promise.resolve(r.mode);
  return r;
}

export async function createProject(info: ProjectInfo, template: TemplateId): Promise<Project> {
  if ((await storageMode()) === "server") {
    const r = await call<Extract<ProjectResponse, { ok: true }>>("/api/projects", {
      method: "POST",
      body: JSON.stringify({ info, template }),
    });
    return r.project;
  }
  const p = newProject(info, template);
  writeLocal({ ...readLocal(), [p.id]: p });
  return p;
}

export async function loadProject(id: string): Promise<Project | null> {
  if ((await storageMode()) === "server") {
    const res = await fetch(`/api/projects/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (res.status === 404) return null;
    const body = (await res.json()) as ProjectResponse;
    if (!body.ok) throw new Error(body.message || "Không tải được dự án");
    return body.project;
  }
  return readLocal()[id] ?? null;
}

/** Saves and returns the stored copy (with its new version). */
export async function saveProject(project: Project): Promise<Project> {
  if ((await storageMode()) === "server") {
    const r = await call<Extract<ProjectResponse, { ok: true }>>(`/api/projects/${project.id}`, {
      method: "PUT",
      body: JSON.stringify(project),
    });
    return r.project;
  }
  const all = readLocal();
  const current = all[project.id];
  if (current && current.version !== project.version) throw new SaveConflict(current);
  const saved = sanitizeProject(project, {
    id: project.id,
    createdAt: project.createdAt,
    version: project.version + 1,
    updatedAt: new Date().toISOString(),
  });
  writeLocal({ ...all, [saved.id]: saved });
  return saved;
}

export async function deleteProject(id: string): Promise<void> {
  if ((await storageMode()) === "server") {
    await call(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
    return;
  }
  const all = readLocal();
  delete all[id];
  writeLocal(all);
}
