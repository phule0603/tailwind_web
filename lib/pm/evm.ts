import { addDays, Calendar, diffDays, maxDate, minDate } from "./dates";
import { computeSchedule, type Schedule } from "./schedule";
import type { CostCategory, Project } from "./types";
import { itemBudget } from "./wbs";

/*
 * Budget roll-up and Earned Value Management.
 *
 *   BAC  budget at completion   = Σ quantity × unit price of the work packages
 *   PV   planned value at date t = Σ BAC × share of the task's working days ≤ t
 *        (uses the baseline schedule/budget when one was saved)
 *   EV   earned value           = Σ BAC × % complete
 *   AC   actual cost            = Σ actual cost entered ("AV – actual value")
 *   SV = EV − PV, CV = EV − AC, SPI = EV / PV, CPI = EV / AC
 *   EAC = BAC / CPI, ETC = EAC − AC, VAC = BAC − EAC, TCPI = (BAC − EV) / (BAC − AC)
 */

export interface ItemValues {
  bac: number;
  pv: number;
  ev: number;
  ac: number;
  /** % complete (summaries: budget-weighted) */
  percent: number;
  /** % of budget planned to be done by the status date */
  plannedPercent: number;
}

export interface EvmIndices {
  sv: number;
  cv: number;
  spi: number | null;
  cpi: number | null;
  eac: number;
  etc: number;
  vac: number;
  tcpi: number | null;
}

export interface ProjectAnalysis {
  schedule: Schedule;
  values: Map<string, ItemValues>;
  totals: ItemValues & EvmIndices;
  contingency: number;
  /** BAC + contingency */
  totalBudget: number;
  byCategory: Record<CostCategory, number>;
  hasBaseline: boolean;
}

interface PlanSpan {
  budget: number;
  start: string;
  finish: string;
  duration: number;
}

/** PV of one work package at `date` (inclusive) */
export function plannedValueAt(span: PlanSpan, date: string, cal: Calendar): number {
  if (span.budget === 0 || date < span.start) return 0;
  if (date >= span.finish || span.duration === 0) return span.budget;
  const total = cal.workdaysBetween(span.start, span.finish);
  if (total === 0) return span.budget;
  return (span.budget * cal.workdaysBetween(span.start, date)) / total;
}

export function indices(bac: number, pv: number, ev: number, ac: number): EvmIndices {
  const spi = pv > 0 ? ev / pv : null;
  const cpi = ac > 0 ? ev / ac : null;
  const eac = cpi && cpi > 0 ? bac / cpi : bac;
  return {
    sv: ev - pv,
    cv: ev - ac,
    spi,
    cpi,
    eac,
    etc: Math.max(0, eac - ac),
    vac: bac - eac,
    tcpi: bac - ac > 0 ? (bac - ev) / (bac - ac) : null,
  };
}

function planSpans(project: Project, schedule: Schedule): Map<string, PlanSpan> {
  const spans = new Map<string, PlanSpan>();
  for (const it of project.wbs) {
    if (!schedule.tree.isLeaf(it.id)) continue;
    const base = project.baseline?.items[it.id];
    const s = schedule.items.get(it.id)!;
    spans.set(
      it.id,
      base
        ? { budget: base.budget, start: base.start, finish: base.finish, duration: base.duration }
        : { budget: itemBudget(it), start: s.start, finish: s.finish, duration: s.duration },
    );
  }
  return spans;
}

export function analyzeProject(project: Project, statusDate = project.statusDate): ProjectAnalysis {
  const schedule = computeSchedule(project);
  const { tree, calendar } = schedule;
  const spans = planSpans(project, schedule);
  const values = new Map<string, ItemValues>();
  const byCategory: Record<CostCategory, number> = {
    material: 0,
    labor: 0,
    equipment: 0,
    subcontract: 0,
    other: 0,
  };

  const visit = (id: string): ItemValues => {
    const kids = tree.children.get(id) ?? [];
    let v: ItemValues;
    if (kids.length === 0) {
      const it = tree.byId.get(id)!;
      const bac = itemBudget(it);
      const span = spans.get(id)!;
      const pct = Math.min(100, Math.max(0, it.percentComplete));
      byCategory[it.category] += bac;
      v = {
        bac,
        pv: plannedValueAt(span, statusDate, calendar),
        ev: (bac * pct) / 100,
        ac: it.actualCost,
        percent: pct,
        plannedPercent: 0,
      };
      // planned % is about time for a work package (independent of its price)
      v.plannedPercent = 100 * plannedValueAt({ ...span, budget: 1 }, statusDate, calendar);
    } else {
      const parts = kids.map(visit);
      const sum = (k: keyof ItemValues) => parts.reduce((a, p) => a + p[k], 0);
      const bac = sum("bac");
      v = {
        bac,
        pv: sum("pv"),
        ev: sum("ev"),
        ac: sum("ac"),
        percent: 0,
        plannedPercent: 0,
      };
      v.percent = bac > 0 ? (100 * v.ev) / bac : parts.reduce((a, p) => a + p.percent, 0) / parts.length;
      v.plannedPercent = bac > 0 ? (100 * v.pv) / bac : parts.reduce((a, p) => a + p.plannedPercent, 0) / parts.length;
    }
    values.set(id, v);
    return v;
  };

  const roots = (tree.children.get(null) ?? []).map(visit);
  const bac = roots.reduce((a, r) => a + r.bac, 0);
  const pv = roots.reduce((a, r) => a + r.pv, 0);
  const ev = roots.reduce((a, r) => a + r.ev, 0);
  const ac = roots.reduce((a, r) => a + r.ac, 0);
  const contingency = Math.round((bac * Math.max(0, project.contingencyPct)) / 100);
  return {
    schedule,
    values,
    totals: {
      bac,
      pv,
      ev,
      ac,
      percent: bac > 0 ? (100 * ev) / bac : 0,
      plannedPercent: bac > 0 ? (100 * pv) / bac : 0,
      ...indices(bac, pv, ev, ac),
    },
    contingency,
    totalBudget: bac + contingency,
    byCategory,
    hasBaseline: project.baseline !== null,
  };
}

export interface CurvePoint {
  date: string;
  /** cumulative planned value */
  pv: number;
}

/**
 * Cumulative PV (the S-curve) sampled every `stepDays` calendar days from the
 * first planned start to the last planned finish, always including both ends.
 */
export function plannedValueCurve(project: Project, schedule: Schedule, stepDays = 7): CurvePoint[] {
  const spans = [...planSpans(project, schedule).values()];
  if (spans.length === 0) return [];
  const first = spans.reduce((a, s) => minDate(a, s.start), spans[0].start);
  const last = spans.reduce((a, s) => maxDate(a, s.finish), spans[0].finish);
  const step = Math.max(1, stepDays);
  const dates: string[] = [addDays(first, -1)];
  for (let d = first; d < last; d = addDays(d, step)) dates.push(d);
  dates.push(last);
  return dates.map((date) => ({
    date,
    pv: spans.reduce((a, s) => a + plannedValueAt(s, date, schedule.calendar), 0),
  }));
}

/** a sampling step that keeps the curve around 60 points */
export function curveStep(start: string, finish: string): number {
  return Math.max(1, Math.ceil(Math.max(1, diffDays(finish, start)) / 60));
}
