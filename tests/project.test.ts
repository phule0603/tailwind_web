import { describe, expect, it } from "vitest";
import { analyzeProject } from "@/lib/pm/evm";
import { planningSteps } from "@/lib/pm/planning";
import { sanitizeProject, summarize, withBaseline, withStatusSnapshot } from "@/lib/pm/project";
import { newProject, templateWbs } from "@/lib/pm/templates";
import { buildTree } from "@/lib/pm/wbs";
import { idOf, project } from "./helpers";

const server = { id: "00000000000000aa", createdAt: "2026-01-01T00:00:00.000Z", version: 3, updatedAt: "2026-10-14T00:00:00.000Z" };
const info = {
  code: "NP-01",
  name: "Nhà phố",
  client: "Ông A",
  location: "Q.7",
  manager: "Bà B",
  description: "",
  startDate: "2026-11-02",
  contingencyPct: 5,
  calendar: { workweek: [1, 2, 3, 4, 5, 6], holidays: [] },
};

describe("sanitizeProject", () => {
  it("keeps a valid project as is (except server-owned fields)", () => {
    const p = project([{ key: "s" }, { key: "a", parent: "s", dur: 3, qty: 2, price: 5, preds: "" }]);
    const clean = sanitizeProject(p, server);
    expect(clean).toEqual({ ...p, ...server });
  });

  it("clamps junk and repairs the tree", () => {
    const clean = sanitizeProject(
      {
        name: "  X\u0000 ",
        contingencyPct: 500,
        startDate: "2026-02-30",
        status: "hacked",
        calendar: { workweek: [9, 1, "2"], holidays: ["x", "2026-12-31"] },
        wbs: [
          { id: idOf("a"), parentId: idOf("zz"), name: "", quantity: -5, unitPrice: "12", duration: 1e9, percentComplete: 150, predecessors: [{ id: idOf("a") }, { id: idOf("b"), type: "XX", lag: 2.4 }] },
          { id: idOf("b"), parentId: null, name: "b", category: "nope" },
          { id: idOf("b"), name: "duplicate" },
          { id: "not-hex" },
        ],
        baseline: { savedAt: "x", items: { [idOf("a")]: { start: "2026-01-02", finish: "2026-01-01", budget: 1 }, [idOf("b")]: { start: "2026-01-01", finish: "2026-01-03", budget: 9 } } },
        history: [{ date: "2026-03-01", pv: 1, ev: 2, ac: 3 }, { date: "bad" }],
      },
      server,
    );
    expect(clean.name).toBe("X");
    expect(clean.contingencyPct).toBe(100);
    expect(clean.startDate).toBe("2026-10-14");
    expect(clean.status).toBe("planning");
    expect(clean.calendar).toEqual({ workweek: [1], holidays: ["2026-12-31"] });
    expect(clean.wbs.map((i) => i.name)).toEqual(["(chưa đặt tên)", "b"]);
    const a = clean.wbs[0];
    expect(a).toMatchObject({ parentId: null, quantity: 0, unitPrice: 12, duration: 3650, percentComplete: 100, category: "other" });
    expect(a.predecessors).toEqual([{ id: idOf("b"), type: "FS", lag: 2 }]);
    expect(clean.wbs[1].category).toBe("other");
    expect(Object.keys(clean.baseline!.items)).toEqual([idOf("b")]);
    expect(clean.history).toEqual([{ date: "2026-03-01", pv: 1, ev: 2, ac: 3 }]);
  });
});

describe("project lifecycle", () => {
  it("creates projects from templates", () => {
    expect(newProject(info, "blank").wbs).toEqual([]);
    const std = newProject(info, "standard");
    expect(std.wbs).toHaveLength(32);
    expect(std.wbs.every((i) => i.unitPrice === 0)).toBe(true);
    const tree = buildTree(std.wbs);
    expect(tree.children.get(null)).toHaveLength(6);
    // the template's links are all valid
    expect(analyzeProject(std).schedule.cycle).toEqual([]);
    expect(templateWbs("sample").filter((i) => i.unitPrice > 0)).toHaveLength(25);
  });

  it("builds a coherent demo project", () => {
    const p = newProject(info, "sample", new Date("2026-10-14T00:00:00Z"));
    const a = analyzeProject(p);
    expect(p.baseline).not.toBeNull();
    expect(p.status).toBe("executing");
    expect(p.statusDate > a.schedule.start && p.statusDate < a.schedule.finish).toBe(true);
    expect(a.totals.bac).toBeGreaterThan(3e9);
    expect(a.totals.spi!).toBeLessThan(1);
    expect(a.totals.cpi!).toBeLessThan(1);
    expect(p.history.length).toBeGreaterThan(1);
    expect(p.history.at(-1)!.date).toBe(p.statusDate);
    expect(planningSteps(p, a).every((s) => s.done)).toBe(true);
    // round-trips through the server's sanitizer unchanged
    expect(sanitizeProject(p, { id: p.id, createdAt: p.createdAt, version: p.version, updatedAt: p.updatedAt })).toEqual(p);
  });

  it("tracks the planning workflow", () => {
    let p = project([{ key: "s" }, { key: "a", parent: "s", dur: 2 }, { key: "b", parent: "s", dur: 2 }]);
    let steps = planningSteps(p, analyzeProject(p));
    expect(steps.map((s) => [s.id, s.done])).toEqual([
      ["charter", true],
      ["wbs", true],
      ["budget", false],
      ["schedule", false],
      ["baseline", false],
      ["tracking", false],
    ]);
    p = project([{ key: "s" }, { key: "a", parent: "s", dur: 2, qty: 1, price: 1 }, { key: "b", parent: "s", dur: 2, qty: 1, price: 1, preds: "a" }]);
    p = withBaseline(p, analyzeProject(p));
    p = withStatusSnapshot(p, analyzeProject(p));
    steps = planningSteps(p, analyzeProject(p));
    expect(steps.every((s) => s.done)).toBe(true);
    expect(p.status).toBe("executing");
  });

  it("replaces a snapshot of the same date", () => {
    let p = project([{ key: "a", dur: 2, qty: 1, price: 100, pct: 50, ac: 70 }], undefined, { statusDate: "2026-10-12" });
    p = withStatusSnapshot(p, analyzeProject(p));
    p = withStatusSnapshot({ ...p, wbs: p.wbs.map((i) => ({ ...i, actualCost: 90 })) }, analyzeProject({ ...p, wbs: p.wbs.map((i) => ({ ...i, actualCost: 90 })) }));
    expect(p.history).toEqual([{ date: "2026-10-12", pv: 50, ev: 50, ac: 90 }]);
  });

  it("summarizes a project for the list", () => {
    const p = project([{ key: "a", dur: 5, qty: 1, price: 1000, pct: 20 }]);
    expect(summarize(p)).toMatchObject({ budget: 1100, percentComplete: 20, finishDate: "2026-10-16", itemCount: 1 });
  });
});
