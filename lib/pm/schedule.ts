import { Calendar, maxDate, minDate } from "./dates";
import type { Project } from "./types";
import { buildTree, type WbsTree } from "./wbs";

/*
 * Critical Path Method on the work packages, in working days of the project
 * calendar. A task occupying working days [es, ef) starts on day `es` and
 * finishes at the end of day `ef - 1`; a milestone (duration 0) sits on day `es`.
 *
 *   FS: succ.es ≥ pred.ef + lag        SS: succ.es ≥ pred.es + lag
 *   FF: succ.ef ≥ pred.ef + lag        SF: succ.ef ≥ pred.es + lag
 */

export interface ScheduledItem {
  start: string;
  finish: string;
  /** working days */
  duration: number;
  /** early start / finish, latest start / finish (working-day indexes) */
  es: number;
  ef: number;
  ls: number;
  lf: number;
  /** total float in working days */
  float: number;
  critical: boolean;
  milestone: boolean;
}

export interface Schedule {
  tree: WbsTree;
  items: Map<string, ScheduledItem>;
  start: string;
  finish: string;
  /** working days from project start to finish */
  duration: number;
  calendar: Calendar;
  /** work packages caught in a dependency loop (scheduled without those links) */
  cycle: string[];
}

export function computeSchedule(project: Pick<Project, "wbs" | "startDate" | "calendar">): Schedule {
  const tree = buildTree(project.wbs);
  const cal = new Calendar(project.calendar, project.startDate);
  const leaves = project.wbs.filter((i) => tree.isLeaf(i.id));
  const leafIds = new Set(leaves.map((l) => l.id));
  const dur = new Map(leaves.map((l) => [l.id, Math.max(0, Math.round(l.duration))]));

  // successor lists + topological order (Kahn); leftovers are in a cycle
  const succ = new Map<string, string[]>(leaves.map((l) => [l.id, []]));
  const indeg = new Map<string, number>(leaves.map((l) => [l.id, 0]));
  for (const l of leaves) {
    for (const d of l.predecessors) {
      if (!leafIds.has(d.id) || d.id === l.id) continue;
      succ.get(d.id)!.push(l.id);
      indeg.set(l.id, indeg.get(l.id)! + 1);
    }
  }
  const order: string[] = [];
  const queue = leaves.filter((l) => indeg.get(l.id) === 0).map((l) => l.id);
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const s of succ.get(id)!) {
      indeg.set(s, indeg.get(s)! - 1);
      if (indeg.get(s) === 0) queue.push(s);
    }
  }
  const cycle = leaves.filter((l) => !order.includes(l.id)).map((l) => l.id);
  const cyclic = new Set(cycle);
  order.push(...cycle);

  // forward pass
  const es = new Map<string, number>();
  const ef = new Map<string, number>();
  for (const id of order) {
    const it = tree.byId.get(id)!;
    const d = dur.get(id)!;
    let start = it.startNoEarlierThan ? cal.indexOnOrAfter(it.startNoEarlierThan) : 0;
    for (const p of it.predecessors) {
      if (!leafIds.has(p.id) || !es.has(p.id) || (cyclic.has(id) && cyclic.has(p.id))) continue;
      const pes = es.get(p.id)!;
      const pef = ef.get(p.id)!;
      const lag = Math.round(p.lag);
      const bound =
        p.type === "SS" ? pes + lag : p.type === "FF" ? pef + lag - d : p.type === "SF" ? pes + lag - d : pef + lag;
      start = Math.max(start, bound);
    }
    start = Math.max(0, start);
    es.set(id, start);
    ef.set(id, start + d);
  }

  const projectEnd = Math.max(0, ...[...ef.values()]);

  // backward pass
  const ls = new Map<string, number>();
  const lf = new Map<string, number>();
  for (const id of [...order].reverse()) {
    const d = dur.get(id)!;
    let finish = projectEnd;
    for (const s of succ.get(id)!) {
      if (!ls.has(s) || (cyclic.has(id) && cyclic.has(s))) continue;
      const dep = tree.byId.get(s)!.predecessors.find((p) => p.id === id)!;
      const lag = Math.round(dep.lag);
      const sls = ls.get(s)!;
      const slf = lf.get(s)!;
      const bound =
        dep.type === "SS" ? sls - lag + d : dep.type === "FF" ? slf - lag : dep.type === "SF" ? slf - lag + d : sls - lag;
      finish = Math.min(finish, bound);
    }
    lf.set(id, finish);
    ls.set(id, finish - d);
  }

  const items = new Map<string, ScheduledItem>();
  for (const id of order) {
    const d = dur.get(id)!;
    const s = es.get(id)!;
    const float = ls.get(id)! - s;
    // a milestone marks the end of the working day before it (e.g. "handover")
    const start = d === 0 ? cal.dateOf(Math.max(0, s - 1)) : cal.dateOf(s);
    items.set(id, {
      start,
      finish: d === 0 ? start : cal.dateOf(s + d - 1),
      duration: d,
      es: s,
      ef: s + d,
      ls: ls.get(id)!,
      lf: lf.get(id)!,
      float,
      critical: float <= 0,
      milestone: d === 0,
    });
  }

  // summaries span their children
  const merge = (a: ScheduledItem, c: ScheduledItem): ScheduledItem => ({
    ...a,
    start: minDate(a.start, c.start),
    finish: maxDate(a.finish, c.finish),
    es: Math.min(a.es, c.es),
    ef: Math.max(a.ef, c.ef),
    ls: Math.min(a.ls, c.ls),
    lf: Math.max(a.lf, c.lf),
    float: Math.min(a.float, c.float),
    critical: a.critical || c.critical,
  });
  const rollup = (id: string): ScheduledItem | undefined => {
    const kids = tree.children.get(id) ?? [];
    if (kids.length === 0) return items.get(id);
    const parts = kids.map(rollup).filter((c): c is ScheduledItem => c !== undefined);
    if (parts.length === 0) return undefined;
    const acc = parts.slice(1).reduce(merge, { ...parts[0], milestone: false });
    acc.duration = acc.ef - acc.es;
    items.set(id, acc);
    return acc;
  };
  for (const id of tree.children.get(null) ?? []) rollup(id);

  const start = cal.dateOf(0);
  return {
    tree,
    items,
    start,
    finish: projectEnd > 0 ? cal.dateOf(projectEnd - 1) : start,
    duration: projectEnd,
    calendar: cal,
    cycle,
  };
}
