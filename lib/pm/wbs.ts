import type { Dependency, DependencyType, WbsItem } from "./types";

/*
 * WBS structure: the items are kept as a flat array in pre-order (each item
 * after its parent, siblings in display order), so every subtree is one
 * contiguous slice. All edit operations are pure and keep that invariant.
 */

export function newId(): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function createItem(parentId: string | null, patch: Partial<WbsItem> = {}): WbsItem {
  return {
    id: newId(),
    parentId,
    name: "Hạng mục mới",
    unit: "",
    quantity: 0,
    unitPrice: 0,
    category: "material",
    duration: 1,
    predecessors: [],
    startNoEarlierThan: null,
    percentComplete: 0,
    actualCost: 0,
    owner: "",
    ...patch,
  };
}

export interface WbsTree {
  byId: Map<string, WbsItem>;
  children: Map<string | null, string[]>;
  /** "1", "1.2", "1.2.3" … */
  code: Map<string, string>;
  depth: Map<string, number>;
  isLeaf: (id: string) => boolean;
}

export function buildTree(items: WbsItem[]): WbsTree {
  const byId = new Map(items.map((i) => [i.id, i]));
  const children = new Map<string | null, string[]>([[null, []]]);
  for (const it of items) {
    const parent = it.parentId !== null && byId.has(it.parentId) ? it.parentId : null;
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent)!.push(it.id);
  }
  const code = new Map<string, string>();
  const depth = new Map<string, number>();
  const walk = (parent: string | null, prefix: string, d: number) => {
    (children.get(parent) ?? []).forEach((id, i) => {
      const c = prefix ? `${prefix}.${i + 1}` : String(i + 1);
      code.set(id, c);
      depth.set(id, d);
      walk(id, c, d + 1);
    });
  };
  walk(null, "", 0);
  return {
    byId,
    children,
    code,
    depth,
    isLeaf: (id) => (children.get(id)?.length ?? 0) === 0,
  };
}

export const itemBudget = (it: Pick<WbsItem, "quantity" | "unitPrice">) =>
  Math.round(it.quantity * it.unitPrice);

/** Reorders items into pre-order, keeping sibling order; drops parent cycles. */
export function normalizeOrder(items: WbsItem[]): WbsItem[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  // break parent cycles and dangling parents by lifting the item to top level
  const fixed = items.map((it) => {
    const seen = new Set([it.id]);
    let p = it.parentId;
    while (p !== null) {
      const parent = byId.get(p);
      if (!parent || seen.has(p)) return { ...it, parentId: null };
      seen.add(p);
      p = parent.parentId;
    }
    return it;
  });
  const tree = buildTree(fixed);
  const out: WbsItem[] = [];
  const walk = (parent: string | null) => {
    for (const id of tree.children.get(parent) ?? []) {
      out.push(tree.byId.get(id)!);
      walk(id);
    }
  };
  walk(null);
  return out;
}

/** [start, end) of the subtree rooted at `id` */
export function subtreeRange(items: WbsItem[], id: string): [number, number] {
  const start = items.findIndex((i) => i.id === id);
  if (start < 0) return [-1, -1];
  const inside = new Set([id]);
  let end = start + 1;
  while (end < items.length && items[end].parentId !== null && inside.has(items[end].parentId!)) {
    inside.add(items[end].id);
    end++;
  }
  return [start, end];
}

/**
 * Only work packages carry schedule logic: drops links that point to missing
 * items, to summaries or to the item itself, duplicates, and the links of
 * summary items.
 */
export function cleanDependencies(items: WbsItem[]): WbsItem[] {
  const tree = buildTree(items);
  return items.map((it) => {
    if (!tree.isLeaf(it.id)) {
      return it.predecessors.length ? { ...it, predecessors: [] } : it;
    }
    const seen = new Set<string>();
    const preds = it.predecessors.filter((d) => {
      if (d.id === it.id || !tree.byId.has(d.id) || !tree.isLeaf(d.id) || seen.has(d.id)) return false;
      seen.add(d.id);
      return true;
    });
    return preds.length === it.predecessors.length ? it : { ...it, predecessors: preds };
  });
}

/**
 * Adds an item. With `afterId` it becomes the next sibling of that item;
 * otherwise it is appended as the last child of `parentId`.
 */
export function addItem(
  items: WbsItem[],
  opts: { parentId?: string | null; afterId?: string; patch?: Partial<WbsItem> },
): { items: WbsItem[]; id: string } {
  let parentId = opts.parentId ?? null;
  let insertAt = items.length;
  if (opts.afterId) {
    const after = items.find((i) => i.id === opts.afterId);
    if (after) {
      parentId = after.parentId;
      insertAt = subtreeRange(items, after.id)[1];
    }
  } else if (parentId !== null) {
    const [s, e] = subtreeRange(items, parentId);
    if (s < 0) parentId = null;
    else insertAt = e;
  }
  const item = createItem(parentId, opts.patch);
  const next = [...items.slice(0, insertAt), item, ...items.slice(insertAt)];
  // a work package that just got its first child became a summary
  return { items: cleanDependencies(next), id: item.id };
}

export function updateItem(items: WbsItem[], id: string, patch: Partial<WbsItem>): WbsItem[] {
  return items.map((i) => (i.id === id ? { ...i, ...patch, id: i.id, parentId: i.parentId } : i));
}

export function removeItem(items: WbsItem[], id: string): WbsItem[] {
  const [s, e] = subtreeRange(items, id);
  if (s < 0) return items;
  return cleanDependencies([...items.slice(0, s), ...items.slice(e)]);
}

function siblingsOf(items: WbsItem[], id: string) {
  const it = items.find((i) => i.id === id);
  if (!it) return null;
  const sibs = items.filter((i) => i.parentId === it.parentId);
  return { it, sibs, index: sibs.findIndex((s) => s.id === id) };
}

/** Makes the item the last child of its previous sibling. */
export function indentItem(items: WbsItem[], id: string): WbsItem[] {
  const s = siblingsOf(items, id);
  if (!s || s.index <= 0) return items;
  const newParent = s.sibs[s.index - 1].id;
  // pre-order is preserved: the item already follows its new parent's subtree
  return cleanDependencies(items.map((i) => (i.id === id ? { ...i, parentId: newParent } : i)));
}

/** Makes the item the next sibling of its parent. */
export function outdentItem(items: WbsItem[], id: string): WbsItem[] {
  const it = items.find((i) => i.id === id);
  if (!it || it.parentId === null) return items;
  const parent = items.find((i) => i.id === it.parentId)!;
  const [s, e] = subtreeRange(items, id);
  const block = items.slice(s, e).map((i) => (i.id === id ? { ...i, parentId: parent.parentId } : i));
  const rest = [...items.slice(0, s), ...items.slice(e)];
  const insertAt = subtreeRange(rest, parent.id)[1];
  return cleanDependencies([...rest.slice(0, insertAt), ...block, ...rest.slice(insertAt)]);
}

/** Swaps the item (with its subtree) with the previous (-1) or next (+1) sibling. */
export function moveItem(items: WbsItem[], id: string, dir: -1 | 1): WbsItem[] {
  const s = siblingsOf(items, id);
  if (!s) return items;
  const other = s.sibs[s.index + dir];
  if (!other) return items;
  const [first, second] = dir < 0 ? [other.id, id] : [id, other.id];
  const [a0, a1] = subtreeRange(items, first);
  const [b0, b1] = subtreeRange(items, second);
  return [...items.slice(0, a0), ...items.slice(b0, b1), ...items.slice(a0, a1), ...items.slice(b1)];
}

/* ------------------------------------------------------- predecessor text */

const DEP_TYPES: DependencyType[] = ["FS", "SS", "FF", "SF"];

export function formatDependency(dep: Dependency, code: string): string {
  const lag = dep.lag ? (dep.lag > 0 ? `+${dep.lag}` : String(dep.lag)) : "";
  return dep.type === "FS" && !lag ? code : `${code}${dep.type}${lag}`;
}

export function formatPredecessors(item: WbsItem, tree: WbsTree): string {
  return item.predecessors
    .filter((d) => tree.code.has(d.id))
    .map((d) => formatDependency(d, tree.code.get(d.id)!))
    .join(", ");
}

/**
 * Parses MS-Project style predecessor text using WBS codes, e.g.
 * "1.2, 2.1SS+3, 3.4FF-1" (lag in working days).
 */
export function parsePredecessors(
  text: string,
  tree: WbsTree,
  selfId: string,
): { deps: Dependency[]; errors: string[] } {
  const byCode = new Map([...tree.code.entries()].map(([id, c]) => [c, id]));
  const deps: Dependency[] = [];
  const errors: string[] = [];
  for (const raw of text.split(/[,;]/)) {
    const token = raw.trim().toUpperCase().replace(/\s+/g, "");
    if (!token) continue;
    const m = /^(\d+(?:\.\d+)*)(FS|SS|FF|SF)?([+-]\d+)?(?:D|NGÀY)?$/.exec(token);
    if (!m) {
      errors.push(`"${raw.trim()}" không đúng định dạng`);
      continue;
    }
    const id = byCode.get(m[1]);
    if (!id) errors.push(`Không có hạng mục ${m[1]}`);
    else if (id === selfId) errors.push(`${m[1]} là chính hạng mục này`);
    else if (!tree.isLeaf(id)) errors.push(`${m[1]} là hạng mục tổng hợp (chỉ liên kết công việc chi tiết)`);
    else if (deps.some((d) => d.id === id)) errors.push(`${m[1]} bị lặp`);
    else
      deps.push({
        id,
        type: (m[2] as DependencyType | undefined) ?? "FS",
        lag: m[3] ? Number(m[3]) : 0,
      });
  }
  return { deps, errors };
}

export function isDependencyType(v: unknown): v is DependencyType {
  return DEP_TYPES.includes(v as DependencyType);
}
