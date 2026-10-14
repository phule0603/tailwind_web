"use client";

import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { formatDecimal, parseVietNumber } from "@/lib/pm/format";
import { PROJECT_STATUS_LABEL, type ProjectStatus } from "@/lib/pm/types";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        size === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3.5 text-sm",
        variant === "primary" && "bg-brand-600 text-white hover:bg-brand-700",
        variant === "secondary" && "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
        variant === "ghost" && "text-slate-600 hover:bg-slate-100",
        variant === "danger" && "border border-red-200 bg-white text-red-700 hover:bg-red-50",
        className,
      )}
    />
  );
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-lg border border-slate-200 bg-white shadow-sm", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          {title && <h2 className="text-sm font-semibold text-slate-800">{title}</h2>}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block text-sm", className)}>
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

const STATUS_STYLE: Record<ProjectStatus, string> = {
  planning: "bg-amber-50 text-amber-800 ring-amber-200",
  approved: "bg-brand-50 text-brand-700 ring-brand-100",
  executing: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  closed: "bg-slate-100 text-slate-600 ring-slate-200",
};

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1", STATUS_STYLE[status])}>
      {PROJECT_STATUS_LABEL[status]}
    </span>
  );
}

/**
 * A number cell that shows Vietnamese formatting ("1.250.000") and accepts
 * either separator style while editing. Commits on blur or Enter.
 */
export function NumberInput({
  value,
  onCommit,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  integer = false,
  className,
  ariaLabel,
  format = formatDecimal,
  boxed,
}: {
  value: number;
  onCommit: (v: number) => void;
  min?: number;
  max?: number;
  integer?: boolean;
  className?: string;
  ariaLabel?: string;
  format?: (v: number) => string;
  boxed?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = parseVietNumber(draft);
    setDraft(null);
    if (n === null) return;
    const v = Math.min(max, Math.max(min, integer ? Math.round(n) : n));
    if (v !== value) onCommit(v);
  };
  return (
    <input
      inputMode="decimal"
      aria-label={ariaLabel}
      className={cx(boxed ? inputClass : "cell-input text-right", "tabular", className)}
      value={draft ?? (value === 0 ? "" : format(value))}
      placeholder="0"
      onFocus={(e) => {
        setDraft(value === 0 ? "" : format(value));
        requestAnimationFrame(() => e.target.select());
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(null);
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
        }
      }}
    />
  );
}

/** A text cell that commits on blur or Enter (so autosave isn't hit per keystroke). */
export function TextInput({
  value,
  onCommit,
  className,
  placeholder,
  ariaLabel,
  invalid,
  boxed,
}: {
  value: string;
  onCommit: (v: string) => void;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
  invalid?: boolean;
  /** a regular form field instead of a borderless table cell */
  boxed?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null && draft !== value) onCommit(draft);
    setDraft(null);
  };
  return (
    <input
      aria-label={ariaLabel}
      placeholder={placeholder}
      className={cx(boxed ? inputClass : "cell-input", invalid && "!border-red-400", className)}
      value={draft ?? value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(null);
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
        }
      }}
    />
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "good" | "bad" | null }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="tabular mt-1 text-xl font-semibold text-slate-900">{value}</div>
      {sub && (
        <div className={cx("mt-0.5 text-xs", tone === "good" ? "text-good" : tone === "bad" ? "text-critical" : "text-slate-500")}>
          {tone === "good" ? "▲ " : tone === "bad" ? "▼ " : ""}
          {sub}
        </div>
      )}
    </div>
  );
}
