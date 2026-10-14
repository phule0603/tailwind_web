import { addDays, diffDays } from "./dates";
import { analyzeProject, plannedValueAt } from "./evm";
import { createProject, withBaseline, withStatusSnapshot, type ProjectInfo } from "./project";
import type { CostCategory, DependencyType, Project, WbsItem } from "./types";
import { createItem } from "./wbs";

/*
 * Starting points for a new project's WBS. Rows reference each other by `key`;
 * predecessors use "key", "keySS+3", "keyFS-1" … like the WBS editor does.
 */

interface Row {
  key: string;
  parent?: string;
  name: string;
  unit?: string;
  qty?: number;
  price?: number;
  cat?: CostCategory;
  dur?: number;
  preds?: string;
}

/** Reference house: 5-storey town house, ~100 m² footprint (2026 price level). */
const TOWNHOUSE: Row[] = [
  { key: "1", name: "Công tác chuẩn bị" },
  { key: "1.1", parent: "1", name: "Dọn dẹp mặt bằng, lán trại, rào tạm", unit: "gói", qty: 1, price: 45_000_000, cat: "other", dur: 5 },
  { key: "1.2", parent: "1", name: "Định vị công trình, cắm mốc", unit: "gói", qty: 1, price: 8_000_000, cat: "subcontract", dur: 2, preds: "1.1" },

  { key: "2", name: "Phần ngầm (móng)" },
  { key: "2.1", parent: "2", name: "Ép cọc BTCT 250×250", unit: "m", qty: 960, price: 280_000, cat: "subcontract", dur: 10, preds: "1.2" },
  { key: "2.2", parent: "2", name: "Đào đất hố móng", unit: "m³", qty: 320, price: 120_000, cat: "equipment", dur: 5, preds: "2.1" },
  { key: "2.3", parent: "2", name: "Bê tông lót móng M150", unit: "m³", qty: 18, price: 1_350_000, cat: "material", dur: 2, preds: "2.2" },
  { key: "2.4", parent: "2", name: "Cốt thép, ván khuôn móng và giằng móng", unit: "tấn", qty: 14, price: 24_000_000, cat: "material", dur: 8, preds: "2.3" },
  { key: "2.5", parent: "2", name: "Bê tông móng, giằng móng M300", unit: "m³", qty: 95, price: 1_650_000, cat: "material", dur: 2, preds: "2.4" },
  { key: "2.6", parent: "2", name: "Xây và chống thấm bể ngầm, hố ga", unit: "m²", qty: 140, price: 450_000, cat: "labor", dur: 6, preds: "2.5FS+3" },
  { key: "2.7", parent: "2", name: "Lấp đất, tôn nền tầng 1", unit: "m³", qty: 150, price: 150_000, cat: "equipment", dur: 3, preds: "2.6" },

  { key: "3", name: "Phần thân (kết cấu)" },
  { key: "3.1", parent: "3", name: "Cột, dầm, sàn tầng 1", unit: "m³", qty: 62, price: 3_900_000, cat: "material", dur: 14, preds: "2.7" },
  { key: "3.2", parent: "3", name: "Cột, dầm, sàn tầng 2", unit: "m³", qty: 58, price: 3_900_000, cat: "material", dur: 12, preds: "3.1" },
  { key: "3.3", parent: "3", name: "Cột, dầm, sàn tầng 3", unit: "m³", qty: 58, price: 3_900_000, cat: "material", dur: 12, preds: "3.2" },
  { key: "3.4", parent: "3", name: "Cột, dầm, sàn tầng 4", unit: "m³", qty: 58, price: 3_900_000, cat: "material", dur: 12, preds: "3.3" },
  { key: "3.5", parent: "3", name: "Cột, dầm, sàn tầng 5 và mái", unit: "m³", qty: 66, price: 3_900_000, cat: "material", dur: 14, preds: "3.4" },
  { key: "3.6", parent: "3", name: "Xây tường bao, tường ngăn", unit: "m²", qty: 1450, price: 280_000, cat: "labor", dur: 40, preds: "3.2FS+5" },

  { key: "4", name: "Hệ thống kỹ thuật (MEP)" },
  { key: "4.1", parent: "4", name: "Điện chiếu sáng, ổ cắm, điện nhẹ", unit: "gói", qty: 1, price: 380_000_000, cat: "subcontract", dur: 30, preds: "3.6SS+10" },
  { key: "4.2", parent: "4", name: "Cấp thoát nước", unit: "gói", qty: 1, price: 260_000_000, cat: "subcontract", dur: 25, preds: "4.1SS" },
  { key: "4.3", parent: "4", name: "PCCC, chống sét", unit: "gói", qty: 1, price: 150_000_000, cat: "subcontract", dur: 8, preds: "4.2" },

  { key: "5", name: "Hoàn thiện" },
  { key: "5.1", parent: "5", name: "Trát tường trong, ngoài", unit: "m²", qty: 2900, price: 120_000, cat: "labor", dur: 30, preds: "3.6SS+15" },
  { key: "5.2", parent: "5", name: "Chống thấm mái, sân thượng, WC", unit: "m²", qty: 180, price: 250_000, cat: "subcontract", dur: 5, preds: "3.5" },
  { key: "5.3", parent: "5", name: "Ốp lát nền, tường WC", unit: "m²", qty: 520, price: 380_000, cat: "material", dur: 20, preds: "5.1SS+10, 5.2" },
  { key: "5.4", parent: "5", name: "Bả, sơn hoàn thiện", unit: "m²", qty: 2900, price: 85_000, cat: "subcontract", dur: 18, preds: "5.1, 4.2" },
  { key: "5.5", parent: "5", name: "Cửa, lan can, tay vịn cầu thang", unit: "gói", qty: 1, price: 420_000_000, cat: "subcontract", dur: 15, preds: "5.3SS+5" },
  { key: "5.6", parent: "5", name: "Lắp thiết bị vệ sinh, đèn", unit: "gói", qty: 1, price: 280_000_000, cat: "material", dur: 7, preds: "5.4, 4.3" },

  { key: "6", name: "Nghiệm thu và bàn giao" },
  { key: "6.1", parent: "6", name: "Vệ sinh công nghiệp", unit: "gói", qty: 1, price: 25_000_000, cat: "labor", dur: 3, preds: "5.5, 5.6" },
  { key: "6.2", parent: "6", name: "Nghiệm thu hoàn thành, bàn giao", unit: "", qty: 0, price: 0, cat: "other", dur: 0, preds: "6.1" },
];

export type TemplateId = "blank" | "standard" | "sample";

export const TEMPLATES: { id: TemplateId; title: string; description: string }[] = [
  { id: "blank", title: "Dự án trống", description: "Tự xây dựng WBS từ đầu." },
  {
    id: "standard",
    title: "Khung WBS nhà dân dụng",
    description: "6 hạng mục, 26 gói công việc và trình tự thi công chuẩn; chưa có khối lượng, đơn giá.",
  },
  {
    id: "sample",
    title: "Dự án mẫu có số liệu",
    description: "Nhà phố 5 tầng: đủ khối lượng, đơn giá, baseline và số liệu thực hiện minh họa.",
  },
];

function fromRows(rows: Row[], withNumbers: boolean): WbsItem[] {
  const ids = new Map<string, string>();
  const items = rows.map((r) => {
    const it = createItem(null, {
      name: r.name,
      unit: r.unit ?? "",
      quantity: withNumbers ? (r.qty ?? 0) : 0,
      unitPrice: withNumbers ? (r.price ?? 0) : 0,
      category: r.cat ?? "material",
      duration: r.dur ?? 1,
    });
    ids.set(r.key, it.id);
    return it;
  });
  return rows.map((r, i) => ({
    ...items[i],
    parentId: r.parent ? ids.get(r.parent)! : null,
    predecessors: (r.preds ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => {
        const m = /^([\d.]+?)(FS|SS|FF|SF)?([+-]\d+)?$/.exec(t)!;
        return { id: ids.get(m[1])!, type: (m[2] ?? "FS") as DependencyType, lag: m[3] ? Number(m[3]) : 0 };
      }),
  }));
}

export function templateWbs(id: TemplateId): WbsItem[] {
  if (id === "blank") return [];
  return fromRows(TOWNHOUSE, id === "sample");
}

/**
 * Turns a freshly created project into a demo: saves the baseline, moves the
 * status date ~45 % into the schedule and fills in progress and actual cost
 * that run slightly behind schedule and over budget, with monthly snapshots.
 */
export function withSampleProgress(project: Project): Project {
  let p = withBaseline(project, analyzeProject(project));
  const a = analyzeProject(p);
  const total = diffDays(a.schedule.finish, a.schedule.start);
  const status = addDays(a.schedule.start, Math.round(total * 0.45));
  const cal = a.schedule.calendar;
  const wbs = p.wbs.map((it) => {
    if (!a.schedule.tree.isLeaf(it.id)) return it;
    const s = a.schedule.items.get(it.id)!;
    const planned = plannedValueAt({ budget: 1, start: s.start, finish: s.finish, duration: s.duration }, status, cal);
    const pct = Math.round(Math.min(100, planned * (planned >= 1 ? 100 : 88)));
    const budget = it.quantity * it.unitPrice;
    return { ...it, percentComplete: pct, actualCost: Math.round((budget * pct * 1.06) / 100 / 1000) * 1000 };
  });
  p = { ...p, wbs };
  // monthly reporting periods up to the status date, at today's SPI
  const now = analyzeProject(p, status).totals;
  const f = now.pv > 0 ? Math.min(1, now.ev / now.pv) : 1;
  for (let d = addDays(a.schedule.start, 30); d < status; d = addDays(d, 30)) {
    const at = analyzeProject(p, d).totals;
    p = {
      ...p,
      history: [...p.history, { date: d, pv: Math.round(at.pv), ev: Math.round(at.pv * f), ac: Math.round(at.pv * f * 1.06) }],
    };
  }
  p = { ...p, statusDate: status };
  return withStatusSnapshot(p, analyzeProject(p));
}

export function isTemplateId(v: unknown): v is TemplateId {
  return TEMPLATES.some((t) => t.id === v);
}

export function newProject(info: ProjectInfo, template: TemplateId, now = new Date()): Project {
  const p = createProject(info, templateWbs(template), now);
  return template === "sample" ? withSampleProgress(p) : p;
}
