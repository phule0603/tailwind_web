import { describe, expect, it } from "vitest";
import {
  addItem,
  buildTree,
  cleanDependencies,
  formatPredecessors,
  indentItem,
  moveItem,
  normalizeOrder,
  outdentItem,
  parsePredecessors,
  removeItem,
} from "@/lib/pm/wbs";
import { idOf, rows } from "./helpers";

const base = () =>
  rows([
    { key: "a" },
    { key: "a1", parent: "a" },
    { key: "a2", parent: "a", preds: "a1" },
    { key: "b" },
    { key: "b1", parent: "b", preds: "a2SS+2" },
  ]);

const codes = (items: ReturnType<typeof base>) => {
  const t = buildTree(items);
  return items.map((i) => `${t.code.get(i.id)} ${i.name}`);
};

describe("WBS tree", () => {
  it("numbers items hierarchically", () => {
    expect(codes(base())).toEqual(["1 a", "1.1 a1", "1.2 a2", "2 b", "2.1 b1"]);
    const t = buildTree(base());
    expect(t.isLeaf(idOf("a"))).toBe(false);
    expect(t.isLeaf(idOf("a1"))).toBe(true);
    expect(t.depth.get(idOf("b1"))).toBe(1);
  });

  it("adds children at the end of the parent and siblings after a subtree", () => {
    let { items, id } = addItem(base(), { parentId: idOf("a") });
    expect(codes(items)[3]).toBe("1.3 Hạng mục mới");
    ({ items } = addItem(items, { afterId: idOf("a"), patch: { name: "x" } }));
    expect(codes(items)).toContain("2 x");
    expect(codes(items)).toContain("3 b");
    expect(id).toHaveLength(16);
  });

  it("turning a work package into a summary drops its links", () => {
    const { items } = addItem(base(), { parentId: idOf("a2") });
    const t = buildTree(items);
    expect(t.byId.get(idOf("a2"))!.predecessors).toEqual([]);
    expect(t.byId.get(idOf("b1"))!.predecessors).toEqual([]); // pointed at a2
  });

  it("indents, outdents and moves subtrees", () => {
    let items = indentItem(base(), idOf("b"));
    expect(codes(items)).toEqual(["1 a", "1.1 a1", "1.2 a2", "1.3 b", "1.3.1 b1"]);
    items = outdentItem(items, idOf("b"));
    expect(codes(items)).toEqual(["1 a", "1.1 a1", "1.2 a2", "2 b", "2.1 b1"]);
    items = moveItem(items, idOf("b"), -1);
    expect(codes(items)).toEqual(["1 b", "1.1 b1", "2 a", "2.1 a1", "2.2 a2"]);
    expect(moveItem(items, idOf("b"), -1)).toBe(items);
    expect(indentItem(items, idOf("b"))).toBe(items); // no previous sibling
  });

  it("outdent moves the item after its parent's whole subtree", () => {
    const items = outdentItem(base(), idOf("a1"));
    expect(codes(items)).toEqual(["1 a", "1.1 a2", "2 a1", "3 b", "3.1 b1"]);
  });

  it("removes a subtree and the links into it", () => {
    const items = removeItem(base(), idOf("a"));
    expect(codes(items)).toEqual(["1 b", "1.1 b1"]);
    expect(items[1].predecessors).toEqual([]);
  });

  it("repairs order and parent cycles", () => {
    const [a, a1, a2, b, b1] = base();
    const looped = [b1, { ...a, parentId: a2.id }, a2, a1, b];
    const fixed = normalizeOrder(looped);
    expect(fixed).toHaveLength(5);
    const t = buildTree(fixed);
    // every item comes after its parent
    fixed.forEach((it, i) => {
      if (it.parentId) expect(fixed.findIndex((x) => x.id === it.parentId)).toBeLessThan(i);
    });
    expect(t.children.get(null)!.length).toBeGreaterThan(0);
  });

  it("cleans self, duplicate and dangling links", () => {
    const items = rows([{ key: "x", preds: "x, y, y, zz" }, { key: "y" }]);
    expect(cleanDependencies(items)[0].predecessors.map((d) => d.id)).toEqual([idOf("y")]);
  });
});

describe("predecessor text", () => {
  it("parses codes with types and lags, and formats them back", () => {
    const items = base();
    const t = buildTree(items);
    const { deps, errors } = parsePredecessors("1.1, 1.2ss+3; 1.1ff-1, 2, 9.9, abc, 2.1", t, idOf("b1"));
    expect(deps).toEqual([
      { id: idOf("a1"), type: "FS", lag: 0 },
      { id: idOf("a2"), type: "SS", lag: 3 },
    ]);
    expect(errors).toHaveLength(5);
    expect(formatPredecessors({ ...items[4], predecessors: deps }, t)).toBe("1.1, 1.2SS+3");
  });
});
