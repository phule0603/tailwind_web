import type { WorkCalendar } from "./types";

/*
 * Calendar-day helpers on ISO date strings ("YYYY-MM-DD"), computed in UTC so
 * the result never depends on the viewer's time zone or DST.
 */

const DAY_MS = 86_400_000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const m = ISO_RE.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/** days since 1970-01-01 */
export function toDayNumber(iso: string): number {
  const m = ISO_RE.exec(iso);
  if (!m) throw new Error(`Invalid date: ${iso}`);
  return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY_MS);
}

export function fromDayNumber(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return fromDayNumber(toDayNumber(iso) + days);
}

export function diffDays(a: string, b: string): number {
  return toDayNumber(a) - toDayNumber(b);
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(iso: string): number {
  return (((toDayNumber(iso) + 4) % 7) + 7) % 7; // 1970-01-01 was a Thursday
}

export function todayIso(now = new Date()): string {
  // the user's local calendar day
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function minDate(a: string, b: string) {
  return a <= b ? a : b;
}

export function maxDate(a: string, b: string) {
  return a >= b ? a : b;
}

/**
 * A working-day calendar anchored at the project start. Work-day index 0 is the
 * first working day on or after the anchor; durations and lags are counted in
 * working days, as construction schedules are.
 */
export class Calendar {
  private readonly workweek: boolean[];
  private readonly holidays: Set<number>;
  private readonly anchor: number;
  /** day numbers of working days 0, 1, 2 … (grown on demand) */
  private readonly days: number[] = [];

  constructor(cal: WorkCalendar, anchorIso: string) {
    this.workweek = Array.from({ length: 7 }, (_, i) => cal.workweek.includes(i));
    // a calendar without any working weekday would never end: treat it as 7/7
    if (!this.workweek.some(Boolean)) this.workweek.fill(true);
    this.holidays = new Set(cal.holidays.filter(isIsoDate).map(toDayNumber));
    this.anchor = toDayNumber(anchorIso);
  }

  isWorkday(iso: string) {
    return this.isWorkdayNum(toDayNumber(iso));
  }

  private isWorkdayNum(n: number) {
    return this.workweek[(((n + 4) % 7) + 7) % 7] && !this.holidays.has(n);
  }

  private grow(index: number) {
    let n = this.days.length ? this.days[this.days.length - 1] + 1 : this.anchor;
    while (this.days.length <= index) {
      if (this.isWorkdayNum(n)) this.days.push(n);
      n++;
    }
  }

  /** calendar date of working day `index` (negative indexes clamp to 0) */
  dateOf(index: number): string {
    const i = Math.max(0, Math.floor(index));
    this.grow(i);
    return fromDayNumber(this.days[i]);
  }

  /** index of the first working day on or after `iso` (0 for dates before the anchor) */
  indexOnOrAfter(iso: string): number {
    const n = toDayNumber(iso);
    if (n <= this.anchor) return 0;
    this.grow(0);
    while (this.days[this.days.length - 1] < n) this.grow(this.days.length);
    let lo = 0;
    let hi = this.days.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.days[mid] < n) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** number of working days in [fromIso, toIso] (inclusive, 0 if empty) */
  workdaysBetween(fromIso: string, toIso: string): number {
    const a = toDayNumber(fromIso);
    const b = toDayNumber(toIso);
    let count = 0;
    for (let n = a; n <= b; n++) if (this.isWorkdayNum(n)) count++;
    return count;
  }
}
