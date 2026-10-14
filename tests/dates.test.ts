import { describe, expect, it } from "vitest";
import { addDays, Calendar, diffDays, isIsoDate, weekday } from "@/lib/pm/dates";
import { MON_FRI, START } from "./helpers";

describe("ISO dates", () => {
  it("validates real calendar days", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2026-1-01")).toBe(false);
    expect(isIsoDate(20260101)).toBe(false);
  });

  it("adds and diffs days across months and years", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(diffDays("2027-03-01", "2027-02-01")).toBe(28);
    expect(weekday(START)).toBe(1);
    expect(weekday("2026-10-18")).toBe(0);
  });
});

describe("Calendar", () => {
  it("counts working days Monday–Friday", () => {
    const cal = new Calendar(MON_FRI, START);
    expect(cal.dateOf(0)).toBe("2026-10-12");
    expect(cal.dateOf(4)).toBe("2026-10-16");
    expect(cal.dateOf(5)).toBe("2026-10-19"); // skips the weekend
    expect(cal.indexOnOrAfter("2026-10-17")).toBe(5); // Saturday → next Monday
    expect(cal.indexOnOrAfter("2026-10-01")).toBe(0);
    expect(cal.workdaysBetween("2026-10-12", "2026-10-25")).toBe(10);
  });

  it("skips holidays and starts on the first working day after the anchor", () => {
    const cal = new Calendar({ workweek: [1, 2, 3, 4, 5, 6], holidays: ["2026-10-13"] }, "2026-10-11");
    expect(cal.dateOf(0)).toBe("2026-10-12");
    expect(cal.dateOf(1)).toBe("2026-10-14");
    expect(cal.dateOf(5)).toBe("2026-10-19"); // Saturday 17th works, Sunday doesn't
    expect(cal.isWorkday("2026-10-17")).toBe(true);
    expect(cal.isWorkday("2026-10-13")).toBe(false);
  });

  it("treats an empty workweek as every day", () => {
    const cal = new Calendar({ workweek: [], holidays: [] }, START);
    expect(cal.dateOf(6)).toBe("2026-10-18");
  });
});
