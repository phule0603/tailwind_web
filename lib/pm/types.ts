/*
 * Data model of a construction project. Only user inputs are stored; everything
 * derived (WBS codes, rolled-up budgets, schedule dates, PV/EV/AC) is computed
 * on the fly by `wbs.ts`, `schedule.ts` and `evm.ts`.
 *
 * Dates are ISO calendar days ("2026-10-14"), money is in VND (integers).
 */

export type DependencyType = "FS" | "SS" | "FF" | "SF";

export interface Dependency {
  /** id of the predecessor (always a work package, never a summary item) */
  id: string;
  type: DependencyType;
  /** working days; negative = lead */
  lag: number;
}

export const COST_CATEGORIES = ["material", "labor", "equipment", "subcontract", "other"] as const;
export type CostCategory = (typeof COST_CATEGORIES)[number];

export const COST_CATEGORY_LABEL: Record<CostCategory, string> = {
  material: "Vật liệu",
  labor: "Nhân công",
  equipment: "Máy thi công",
  subcontract: "Thầu phụ",
  other: "Chi phí khác",
};

export interface WbsItem {
  id: string;
  /** null = top-level item */
  parentId: string | null;
  name: string;
  /*
   * The fields below describe a work package (an item without children).
   * They are kept on summary items too but ignored there: a summary's budget,
   * dates and progress are rolled up from its children.
   */
  unit: string;
  quantity: number;
  /** VND per unit */
  unitPrice: number;
  category: CostCategory;
  /** working days; 0 = milestone */
  duration: number;
  predecessors: Dependency[];
  /** "start no earlier than" constraint */
  startNoEarlierThan: string | null;
  /** physical progress, 0–100 */
  percentComplete: number;
  /** actual cost to date (VND) */
  actualCost: number;
  owner: string;
}

export interface WorkCalendar {
  /** working weekdays, 0 = Sunday … 6 = Saturday */
  workweek: number[];
  /** non-working days (public holidays, Tết …) */
  holidays: string[];
}

export interface BaselineItem {
  start: string;
  finish: string;
  budget: number;
  duration: number;
}

export interface Baseline {
  savedAt: string;
  /** keyed by work-package id */
  items: Record<string, BaselineItem>;
}

/** Totals frozen at a reporting date, so the S-curve can show EV/AC history. */
export interface StatusSnapshot {
  date: string;
  pv: number;
  ev: number;
  ac: number;
}

export type ProjectStatus = "planning" | "approved" | "executing" | "closed";

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: "Lập kế hoạch",
  approved: "Đã phê duyệt",
  executing: "Đang thi công",
  closed: "Đã đóng",
};

export interface Project {
  id: string;
  code: string;
  name: string;
  client: string;
  location: string;
  manager: string;
  description: string;
  status: ProjectStatus;
  startDate: string;
  /** data date of the progress figures (ngày cập nhật số liệu) */
  statusDate: string;
  /** contingency reserve on top of the direct budget, in % */
  contingencyPct: number;
  calendar: WorkCalendar;
  /** pre-order: every item comes after its parent, siblings in display order */
  wbs: WbsItem[];
  baseline: Baseline | null;
  history: StatusSnapshot[];
  createdAt: string;
  updatedAt: string;
  /** optimistic-concurrency counter, bumped by the server on every save */
  version: number;
}

/** What the project list shows; stored next to the full document. */
export interface ProjectSummary {
  id: string;
  code: string;
  name: string;
  client: string;
  location: string;
  status: ProjectStatus;
  startDate: string;
  finishDate: string | null;
  budget: number;
  percentComplete: number;
  itemCount: number;
  updatedAt: string;
}
