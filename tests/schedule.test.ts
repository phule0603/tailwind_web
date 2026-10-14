import { describe, expect, it } from "vitest";
import { computeSchedule } from "@/lib/pm/schedule";
import { idOf, project } from "./helpers";

const sched = (...args: Parameters<typeof project>) => computeSchedule(project(...args));
const at = (s: ReturnType<typeof computeSchedule>, k: string) => s.items.get(idOf(k))!;

describe("CPM schedule", () => {
  it("chains finish-to-start tasks over weekends", () => {
    const s = sched([
      { key: "a", dur: 3 },
      { key: "b", dur: 4, preds: "a" },
    ]);
    expect(at(s, "a")).toMatchObject({ start: "2026-10-12", finish: "2026-10-14", es: 0, ef: 3 });
    expect(at(s, "b")).toMatchObject({ start: "2026-10-15", finish: "2026-10-20" });
    expect(s.finish).toBe("2026-10-20");
    expect(s.duration).toBe(7);
  });

  it("supports SS, FF, SF links and lags/leads", () => {
    const s = sched([
      { key: "a", dur: 5 },
      { key: "b", dur: 3, preds: "aSS+2" },
      { key: "c", dur: 2, preds: "aFF" },
      { key: "d", dur: 2, preds: "aFS-1" },
      { key: "e", dur: 2, preds: "aSF+3" },
    ]);
    expect(at(s, "b").es).toBe(2);
    expect(at(s, "c").ef).toBe(5);
    expect(at(s, "d").es).toBe(4);
    expect(at(s, "e").ef).toBe(3);
  });

  it("honours start-no-earlier-than constraints", () => {
    const s = sched([{ key: "a", dur: 2, snet: "2026-10-17" }]);
    expect(at(s, "a").start).toBe("2026-10-19");
  });

  it("finds the critical path and total float", () => {
    const s = sched([
      { key: "a", dur: 2 },
      { key: "long", dur: 10, preds: "a" },
      { key: "short", dur: 3, preds: "a" },
      { key: "end", dur: 1, preds: "long, short" },
    ]);
    expect(at(s, "a").critical).toBe(true);
    expect(at(s, "long").critical).toBe(true);
    expect(at(s, "end").critical).toBe(true);
    expect(at(s, "short")).toMatchObject({ critical: false, float: 7 });
  });

  it("rolls summary dates up from children", () => {
    const s = sched([
      { key: "p" },
      { key: "x", parent: "p", dur: 2 },
      { key: "y", parent: "p", dur: 3, preds: "x" },
      { key: "q" },
      { key: "z", parent: "q", dur: 1, preds: "y" },
    ]);
    expect(at(s, "p")).toMatchObject({ start: "2026-10-12", finish: "2026-10-16", duration: 5, milestone: false });
    expect(at(s, "q").start).toBe("2026-10-19");
  });

  it("puts a milestone at the end of its predecessor's last day", () => {
    const s = sched([
      { key: "a", dur: 5 },
      { key: "m", dur: 0, preds: "a" },
    ]);
    expect(at(s, "m")).toMatchObject({ start: "2026-10-16", finish: "2026-10-16", milestone: true });
    expect(s.finish).toBe("2026-10-16");
  });

  it("survives dependency loops and reports them", () => {
    const s = sched([
      { key: "a", dur: 2, preds: "b" },
      { key: "b", dur: 2, preds: "a" },
      { key: "c", dur: 1 },
    ]);
    expect(s.cycle.sort()).toEqual([idOf("a"), idOf("b")].sort());
    expect(at(s, "a").start).toBeDefined();
    expect(at(s, "c").es).toBe(0);
  });

  it("handles an empty WBS", () => {
    const s = sched([]);
    expect(s.items.size).toBe(0);
    expect(s.start).toBe("2026-10-12");
    expect(s.finish).toBe("2026-10-12");
  });
});
