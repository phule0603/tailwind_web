"use client";

import { useState } from "react";
import { formatDate, isIsoDate } from "@/lib/pm/dates";
import type { WorkCalendar } from "@/lib/pm/types";
import { Button, cx, inputClass } from "./ui";

const DAYS = [
  [1, "T2"],
  [2, "T3"],
  [3, "T4"],
  [4, "T5"],
  [5, "T6"],
  [6, "T7"],
  [0, "CN"],
] as const;

export default function CalendarEditor({ value, onChange }: { value: WorkCalendar; onChange: (c: WorkCalendar) => void }) {
  const [holiday, setHoliday] = useState("");
  const toggle = (d: number) => {
    const has = value.workweek.includes(d);
    const workweek = has ? value.workweek.filter((x) => x !== d) : [...value.workweek, d].sort();
    if (workweek.length) onChange({ ...value, workweek });
  };
  const addHoliday = () => {
    if (!isIsoDate(holiday) || value.holidays.includes(holiday)) return;
    onChange({ ...value, holidays: [...value.holidays, holiday].sort() });
    setHoliday("");
  };
  return (
    <div className="space-y-3 text-sm">
      <div>
        <div className="mb-1 font-medium text-slate-700">Ngày làm việc trong tuần</div>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map(([d, label]) => (
            <button
              key={d}
              type="button"
              aria-pressed={value.workweek.includes(d)}
              onClick={() => toggle(d)}
              className={cx(
                "h-8 w-10 rounded-md border text-xs font-medium",
                value.workweek.includes(d) ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-300 bg-white text-slate-400",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-slate-500">Thời lượng và độ trễ tính theo ngày làm việc.</p>
      </div>
      <div>
        <div className="mb-1 font-medium text-slate-700">Ngày nghỉ (lễ, Tết)</div>
        <div className="flex gap-2">
          <input type="date" className={cx(inputClass, "max-w-44")} value={holiday} onChange={(e) => setHoliday(e.target.value)} />
          <Button onClick={addHoliday} disabled={!isIsoDate(holiday)}>
            Thêm
          </Button>
        </div>
        {value.holidays.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {value.holidays.map((h) => (
              <span key={h} className="tabular inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                {formatDate(h)}
                <button
                  type="button"
                  aria-label={`Bỏ ngày nghỉ ${formatDate(h)}`}
                  className="text-slate-400 hover:text-red-600"
                  onClick={() => onChange({ ...value, holidays: value.holidays.filter((x) => x !== h) })}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
