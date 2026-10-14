import { describe, expect, it } from "vitest";
import { summarize } from "@/lib/pm/project";
import { MemoryStore, RedisRestStore, type ProjectStore } from "@/lib/pm/store";
import { createFakeRedis } from "./fake-upstash";
import { project } from "./helpers";

const backends: [string, () => ProjectStore][] = [
  ["MemoryStore", () => new MemoryStore()],
  ["RedisRestStore", () => new RedisRestStore("https://fake.upstash.io/", "test-token", "qlda:", createFakeRedis().fetch)],
];

describe.each(backends)("%s", (_, make) => {
  it("creates, lists, reads and deletes projects", async () => {
    const store = make();
    const a = { ...project([{ key: "x", dur: 1 }]), name: "A", updatedAt: "2026-10-01T00:00:00Z" };
    const b = { ...project([]), name: "B", updatedAt: "2026-10-02T00:00:00Z" };
    await store.create(a, summarize(a));
    await store.create(b, summarize(b));
    expect((await store.list()).map((s) => s.name)).toEqual(["B", "A"]);
    expect(await store.get(a.id)).toEqual(a);
    expect(await store.get("ffffffffffffffff")).toBeNull();
    expect(await store.remove(a.id)).toBe(true);
    expect(await store.remove(a.id)).toBe(false);
    expect((await store.list()).map((s) => s.name)).toEqual(["B"]);
  });

  it("saves with optimistic concurrency", async () => {
    const store = make();
    const p = project([]);
    await store.create(p, summarize(p));
    const first = await store.save({ ...p, name: "v2" }, 1, summarize);
    expect(first).toMatchObject({ ok: true, project: { name: "v2", version: 2 } });
    const stale = await store.save({ ...p, name: "stale" }, 1, summarize);
    expect(stale).toMatchObject({ ok: false, reason: "conflict", current: { name: "v2", version: 2 } });
    expect((await store.list())[0].name).toBe("v2");
    expect(await store.save({ ...p, id: "ffffffffffffffff" }, 1, summarize)).toMatchObject({ ok: false, reason: "not_found" });
  });
});

describe("RedisRestStore", () => {
  it("refuses a save while another save holds the lock", async () => {
    const redis = createFakeRedis();
    const store = new RedisRestStore("https://fake.upstash.io", "test-token", "qlda:", redis.fetch);
    const p = project([]);
    await store.create(p, summarize(p));
    redis.exec(["SET", `qlda:lock:${p.id}`, "1", "NX", "PX", "5000"]);
    expect(await store.save(p, 1, summarize)).toEqual({ ok: false, reason: "busy" });
    redis.exec(["DEL", `qlda:lock:${p.id}`]);
    expect(await store.save(p, 1, summarize)).toMatchObject({ ok: true });
    expect(redis.strings.has(`qlda:lock:${p.id}`)).toBe(false);
  });

  it("surfaces Redis errors", async () => {
    const store = new RedisRestStore("https://fake.upstash.io", "wrong", "qlda:", createFakeRedis().fetch);
    await expect(store.list()).rejects.toThrow(/HTTP 401/);
  });
});
