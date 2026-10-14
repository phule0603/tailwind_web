import { createProject, DEFAULT_CALENDAR } from "@/lib/pm/project";
import type { DependencyType, Project, WbsItem, WorkCalendar } from "@/lib/pm/types";
import { createItem } from "@/lib/pm/wbs";

/** Monday */
export const START = "2026-10-12";
export const MON_FRI: WorkCalendar = { workweek: [1, 2, 3, 4, 5], holidays: [] };

export interface Row {
  key: string;
  parent?: string;
  dur?: number;
  qty?: number;
  price?: number;
  pct?: number;
  ac?: number;
  /** "a", "bSS+2", … */
  preds?: string;
  snet?: string;
}

/** Builds WBS items from compact rows; ids are readable: "id-<key>" padded to 16 hex. */
export function rows(list: Row[]): WbsItem[] {
  const id = (k: string) => Buffer.from(k).toString("hex").padEnd(16, "0").slice(0, 16);
  return list.map((r) =>
    createItem(r.parent ? id(r.parent) : null, {
      id: id(r.key),
      name: r.key,
      duration: r.dur ?? 1,
      quantity: r.qty ?? 0,
      unitPrice: r.price ?? 0,
      percentComplete: r.pct ?? 0,
      actualCost: r.ac ?? 0,
      startNoEarlierThan: r.snet ?? null,
      predecessors: (r.preds ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          const m = /^([a-z0-9]+?)(FS|SS|FF|SF)?([+-]\d+)?$/.exec(s)!;
          return { id: id(m[1]), type: (m[2] ?? "FS") as DependencyType, lag: m[3] ? Number(m[3]) : 0 };
        }),
    }),
  );
}

export const idOf = (k: string) => Buffer.from(k).toString("hex").padEnd(16, "0").slice(0, 16);

export function project(list: Row[], calendar: WorkCalendar = MON_FRI, extra: Partial<Project> = {}): Project {
  return {
    ...createProject(
      {
        code: "T",
        name: "Test",
        client: "C",
        location: "",
        manager: "M",
        description: "",
        startDate: START,
        contingencyPct: 10,
        calendar: calendar ?? DEFAULT_CALENDAR,
      },
      rows(list),
      new Date("2026-10-01T00:00:00Z"),
    ),
    ...extra,
  };
}
