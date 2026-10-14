import { isIsoDate } from "./dates";
import { analyzeProject, type ProjectAnalysis } from "./evm";
import {
  COST_CATEGORIES,
  type Baseline,
  type CostCategory,
  type Dependency,
  type Project,
  type ProjectStatus,
  type ProjectSummary,
  type StatusSnapshot,
  type WbsItem,
  type WorkCalendar,
} from "./types";
import { cleanDependencies, isDependencyType, newId, normalizeOrder } from "./wbs";

/* Limits that keep one project document comfortably below storage limits. */
export const MAX_WBS_ITEMS = 1500;
export const MAX_HISTORY = 400;
export const MAX_BODY_BYTES = 900_000;

const PROJECT_STATUSES: ProjectStatus[] = ["planning", "approved", "executing", "closed"];
export const DEFAULT_CALENDAR: WorkCalendar = { workweek: [1, 2, 3, 4, 5, 6], holidays: [] };

export interface ProjectInfo {
  code: string;
  name: string;
  client: string;
  location: string;
  manager: string;
  description: string;
  startDate: string;
  contingencyPct: number;
  calendar: WorkCalendar;
}

export function isProjectId(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{16}$/.test(v);
}

/* ------------------------------------------------------------- sanitizing */

const str = (v: unknown, max: number, fallback = "") =>
  typeof v === "string"
    ? v
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
        .trim()
        .slice(0, max)
    : fallback;

const num = (v: unknown, min: number, max: number, fallback = 0) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const date = (v: unknown, fallback: string) => (isIsoDate(v) ? v : fallback);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const MONEY_MAX = 1e15;

export function sanitizeCalendar(v: unknown): WorkCalendar {
  const c = obj(v);
  const workweek = [...new Set(arr(c.workweek).filter((d): d is number => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6))].sort();
  const holidays = [...new Set(arr(c.holidays).filter(isIsoDate))].sort().slice(0, 500);
  return { workweek: workweek.length ? workweek : DEFAULT_CALENDAR.workweek, holidays };
}

export function sanitizeInfo(v: unknown, today: string): ProjectInfo {
  const o = obj(v);
  return {
    code: str(o.code, 40),
    name: str(o.name, 200),
    client: str(o.client, 200),
    location: str(o.location, 300),
    manager: str(o.manager, 120),
    description: str(o.description, 4000),
    startDate: date(o.startDate, today),
    contingencyPct: num(o.contingencyPct, 0, 100, 5),
    calendar: sanitizeCalendar(o.calendar),
  };
}

function sanitizeItem(v: unknown, startDate: string): WbsItem | null {
  const o = obj(v);
  if (typeof o.id !== "string" || !/^[0-9a-f]{16}$/.test(o.id)) return null;
  const category = COST_CATEGORIES.includes(o.category as CostCategory) ? (o.category as CostCategory) : "other";
  const predecessors: Dependency[] = arr(o.predecessors)
    .map(obj)
    .filter((d) => typeof d.id === "string")
    .slice(0, 50)
    .map((d) => ({
      id: d.id as string,
      type: isDependencyType(d.type) ? d.type : "FS",
      lag: Math.round(num(d.lag, -3650, 3650)),
    }));
  return {
    id: o.id,
    parentId: typeof o.parentId === "string" ? o.parentId : null,
    name: str(o.name, 300) || "(chưa đặt tên)",
    unit: str(o.unit, 30),
    quantity: num(o.quantity, 0, 1e12),
    unitPrice: num(o.unitPrice, 0, MONEY_MAX),
    category,
    duration: Math.round(num(o.duration, 0, 3650, 1)),
    predecessors,
    startNoEarlierThan: isIsoDate(o.startNoEarlierThan) && o.startNoEarlierThan >= startDate ? o.startNoEarlierThan : null,
    percentComplete: num(o.percentComplete, 0, 100),
    actualCost: Math.round(num(o.actualCost, 0, MONEY_MAX)),
    owner: str(o.owner, 120),
  };
}

function sanitizeBaseline(v: unknown, ids: Set<string>): Baseline | null {
  if (!v || typeof v !== "object") return null;
  const o = obj(v);
  const items: Baseline["items"] = {};
  for (const [id, raw] of Object.entries(obj(o.items))) {
    if (!ids.has(id)) continue;
    const b = obj(raw);
    if (!isIsoDate(b.start) || !isIsoDate(b.finish) || b.finish < b.start) continue;
    items[id] = {
      start: b.start,
      finish: b.finish,
      budget: Math.round(num(b.budget, 0, MONEY_MAX)),
      duration: Math.round(num(b.duration, 0, 3650)),
    };
  }
  return { savedAt: typeof o.savedAt === "string" ? o.savedAt.slice(0, 40) : new Date().toISOString(), items };
}

function sanitizeHistory(v: unknown): StatusSnapshot[] {
  const byDate = new Map<string, StatusSnapshot>();
  for (const raw of arr(v)) {
    const s = obj(raw);
    if (!isIsoDate(s.date)) continue;
    byDate.set(s.date, {
      date: s.date,
      pv: num(s.pv, 0, MONEY_MAX),
      ev: num(s.ev, 0, MONEY_MAX),
      ac: num(s.ac, 0, MONEY_MAX),
    });
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-MAX_HISTORY);
}

/**
 * Turns untrusted JSON into a valid project: clamps every field, repairs the
 * WBS tree (pre-order, no parent cycles) and drops invalid dependency links.
 * Server-owned fields (id, createdAt, version) are taken from `server`.
 */
export function sanitizeProject(
  v: unknown,
  server: { id: string; createdAt: string; version: number; updatedAt: string },
): Project {
  const o = obj(v);
  const today = server.updatedAt.slice(0, 10);
  const info = sanitizeInfo(o, today);
  const seen = new Set<string>();
  const items: WbsItem[] = [];
  for (const raw of arr(o.wbs).slice(0, MAX_WBS_ITEMS)) {
    const it = sanitizeItem(raw, info.startDate);
    if (it && !seen.has(it.id)) {
      seen.add(it.id);
      items.push(it);
    }
  }
  const wbs = cleanDependencies(normalizeOrder(items));
  return {
    ...info,
    id: server.id,
    status: PROJECT_STATUSES.includes(o.status as ProjectStatus) ? (o.status as ProjectStatus) : "planning",
    statusDate: date(o.statusDate, info.startDate),
    wbs,
    baseline: sanitizeBaseline(o.baseline, seen),
    history: sanitizeHistory(o.history),
    createdAt: server.createdAt,
    updatedAt: server.updatedAt,
    version: server.version,
  };
}

/* ------------------------------------------------------------- lifecycle */

export function createProject(info: ProjectInfo, wbs: WbsItem[], now = new Date()): Project {
  const iso = now.toISOString();
  return {
    ...info,
    id: newId(),
    status: "planning",
    statusDate: info.startDate,
    wbs,
    baseline: null,
    history: [],
    createdAt: iso,
    updatedAt: iso,
    version: 1,
  };
}

/** Freezes the current schedule and budget of every work package as the baseline. */
export function withBaseline(project: Project, a: ProjectAnalysis, now = new Date()): Project {
  const items: Baseline["items"] = {};
  for (const it of project.wbs) {
    if (!a.schedule.tree.isLeaf(it.id)) continue;
    const s = a.schedule.items.get(it.id)!;
    items[it.id] = { start: s.start, finish: s.finish, budget: a.values.get(it.id)!.bac, duration: s.duration };
  }
  return {
    ...project,
    baseline: { savedAt: now.toISOString(), items },
    status: project.status === "planning" ? "approved" : project.status,
  };
}

/** Records PV/EV/AC at the status date (replacing an earlier record of that date). */
export function withStatusSnapshot(project: Project, a: ProjectAnalysis): Project {
  const snap: StatusSnapshot = {
    date: project.statusDate,
    pv: Math.round(a.totals.pv),
    ev: Math.round(a.totals.ev),
    ac: Math.round(a.totals.ac),
  };
  const history = [...project.history.filter((h) => h.date !== snap.date), snap]
    .sort((x, y) => (x.date < y.date ? -1 : 1))
    .slice(-MAX_HISTORY);
  return { ...project, history, status: project.status === "approved" ? "executing" : project.status };
}

export function summarize(project: Project, a: ProjectAnalysis = analyzeProject(project)): ProjectSummary {
  return {
    id: project.id,
    code: project.code,
    name: project.name,
    client: project.client,
    location: project.location,
    status: project.status,
    startDate: project.startDate,
    finishDate: project.wbs.length ? a.schedule.finish : null,
    budget: a.totalBudget,
    percentComplete: a.totals.percent,
    itemCount: project.wbs.length,
    updatedAt: project.updatedAt,
  };
}
