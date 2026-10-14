import { describe, expect, it } from "vitest";
import { analyzeProject, indices, plannedValueCurve } from "@/lib/pm/evm";
import { withBaseline } from "@/lib/pm/project";
import { idOf, project } from "./helpers";

// a: 10 days × 1.000.000/day budget = 10tr, b: 5 days, 5tr, after a
const p = (extra: Parameters<typeof project>[2] = {}) =>
  project(
    [
      { key: "s" },
      { key: "a", parent: "s", dur: 10, qty: 10, price: 1_000_000, pct: 50, ac: 6_000_000 },
      { key: "b", parent: "s", dur: 5, qty: 1, price: 5_000_000, preds: "a" },
    ],
    undefined,
    extra,
  );

describe("budget and EVM", () => {
  it("rolls budgets up the WBS and adds contingency", () => {
    const a = analyzeProject(p());
    expect(a.values.get(idOf("a"))!.bac).toBe(10_000_000);
    expect(a.values.get(idOf("s"))!.bac).toBe(15_000_000);
    expect(a.totals.bac).toBe(15_000_000);
    expect(a.contingency).toBe(1_500_000);
    expect(a.totalBudget).toBe(16_500_000);
    expect(a.byCategory.material).toBe(15_000_000);
  });

  it("spreads PV linearly over working days", () => {
    // status Friday of week 1: 5 of a's 10 working days elapsed
    const a = analyzeProject(p({ statusDate: "2026-10-16" }));
    expect(a.values.get(idOf("a"))!.pv).toBe(5_000_000);
    expect(a.values.get(idOf("b"))!.pv).toBe(0);
    // weekend adds nothing
    expect(analyzeProject(p({ statusDate: "2026-10-18" })).totals.pv).toBe(5_000_000);
    expect(analyzeProject(p({ statusDate: "2026-10-01" })).totals.pv).toBe(0);
    expect(analyzeProject(p({ statusDate: "2027-01-01" })).totals.pv).toBe(15_000_000);
  });

  it("computes EV, AC and the indices", () => {
    const a = analyzeProject(p({ statusDate: "2026-10-16" }));
    expect(a.totals).toMatchObject({ pv: 5_000_000, ev: 5_000_000, ac: 6_000_000, sv: 0, cv: -1_000_000 });
    expect(a.totals.spi).toBe(1);
    expect(a.totals.cpi).toBeCloseTo(5 / 6);
    expect(a.totals.eac).toBeCloseTo(18_000_000);
    expect(a.totals.vac).toBeCloseTo(-3_000_000);
    expect(a.values.get(idOf("s"))!.percent).toBeCloseTo(100 / 3);
    expect(a.values.get(idOf("a"))!.plannedPercent).toBe(50);
  });

  it("measures PV against the baseline, not the current plan", () => {
    const planned = p({ statusDate: "2026-10-16" });
    const based = withBaseline(planned, analyzeProject(planned));
    expect(based.status).toBe("approved");
    // the work package slips one week and gets more expensive after the baseline
    const slipped = {
      ...based,
      wbs: based.wbs.map((i) => (i.id === idOf("a") ? { ...i, startNoEarlierThan: "2026-10-19", unitPrice: 2_000_000 } : i)),
    };
    const a = analyzeProject(slipped);
    expect(a.schedule.items.get(idOf("a"))!.start).toBe("2026-10-19");
    expect(a.values.get(idOf("a"))!.pv).toBe(5_000_000); // baseline dates + budget
    expect(a.values.get(idOf("a"))!.bac).toBe(20_000_000);
  });

  it("guards the indices against zero denominators", () => {
    expect(indices(100, 0, 0, 0)).toMatchObject({ spi: null, cpi: null, eac: 100, etc: 100, vac: 0, tcpi: 1 });
  });

  it("builds a non-decreasing S-curve ending at BAC", () => {
    const proj = p();
    const a = analyzeProject(proj);
    const curve = plannedValueCurve(proj, a.schedule, 2);
    expect(curve[0].pv).toBe(0);
    expect(curve.at(-1)).toEqual({ date: a.schedule.finish, pv: 15_000_000 });
    for (let i = 1; i < curve.length; i++) expect(curve[i].pv).toBeGreaterThanOrEqual(curve[i - 1].pv);
  });
});
