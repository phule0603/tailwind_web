/* Vietnamese number and money formatting. */

const intFmt = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const decFmt = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });

/** 1234567 → "1.234.567" */
export const formatNumber = (n: number) => intFmt.format(Math.round(n));

export const formatDecimal = (n: number) => decFmt.format(n);

/** full amount: "1.234.567 ₫" */
export const formatVnd = (n: number) => `${intFmt.format(Math.round(n))} ₫`;

/** compact amount for KPIs and charts: "1,25 tỷ", "350 tr", "12 nghìn" */
export function formatVndShort(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  const f = (v: number) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: v >= 100 ? 0 : v >= 10 ? 1 : 2 }).format(v);
  if (a >= 1e9) return `${sign}${f(a / 1e9)} tỷ`;
  if (a >= 1e6) return `${sign}${f(a / 1e6)} tr`;
  if (a >= 1e3) return `${sign}${f(a / 1e3)} nghìn`;
  return `${sign}${intFmt.format(a)}`;
}

export const formatPercent = (n: number, digits = 1) =>
  `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: digits }).format(n)}%`;

export const formatIndex = (n: number | null) => (n === null ? "—" : decFmt.format(n));

/** parses "1.234.567", "1234567", "1,5" (Vietnamese separators) and "2.5" */
export function parseVietNumber(text: string): number | null {
  let t = text.trim().replace(/[\s₫đ]/gi, "");
  if (!t) return 0;
  if (/^-?\d{1,3}(,\d{3}){2,}$/.test(t)) t = t.replace(/,/g, "");
  else if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
