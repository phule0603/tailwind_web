import { describe, expect, it } from "vitest";
import { emptyTotals } from "@/lib/leaderboard/shared";
import { MemoryStore, RedisRestStore, type LeaderboardStore } from "@/lib/leaderboard/store";
import { createFakeRedis } from "./fake-upstash";

const id = (n: number) => n.toString(16).padStart(32, "0");
const entry = (n: number, score: number, name = `P${n}`) => ({
  playerId: id(n),
  name,
  score,
  goals: Math.floor(score / 100),
  assists: 1,
  at: 1000 + n,
});

const backends: [string, () => LeaderboardStore][] = [
  ["MemoryStore", () => new MemoryStore()],
  [
    "RedisRestStore",
    () => new RedisRestStore("https://fake.upstash.io/", "test-token", "goat:", createFakeRedis().fetch),
  ],
];

describe.each(backends)("%s", (_, make) => {
  it("ranks players by their best match, separately per hero", async () => {
    const store = make();
    await store.submit("cr7", entry(1, 100));
    await store.submit("cr7", entry(2, 300));
    await store.submit("cr7", entry(3, 200));
    await store.submit("lm10", entry(1, 900));
    const top = await store.top("cr7", 10);
    expect(top.map((e) => [e.name, e.score])).toEqual([
      ["P2", 300],
      ["P3", 200],
      ["P1", 100],
    ]);
    expect(top[0]).toMatchObject({ playerId: id(2), goals: 3, assists: 1, at: 1002 });
    expect(await store.top("cr7", 2)).toHaveLength(2);
    expect(await store.rankOf("cr7", id(3))).toEqual({ rank: 2, score: 200 });
    expect(await store.rankOf("lm10", id(1))).toEqual({ rank: 1, score: 900 });
    expect(await store.rankOf("lm10", id(2))).toBeNull();
  });

  it("keeps the best match but always takes the latest name", async () => {
    const store = make();
    expect(await store.submit("cr7", entry(1, 500))).toEqual({ improved: true, best: 500, rank: 1 });
    expect(await store.submit("cr7", entry(1, 200, "Renamed"))).toEqual({ improved: false, best: 500, rank: 1 });
    const [top] = await store.top("cr7", 1);
    expect(top).toMatchObject({ name: "Renamed", score: 500, goals: 5 });
    expect(await store.submit("cr7", entry(1, 800))).toEqual({ improved: true, best: 800, rank: 1 });
  });

  it("renames only players already on a board", async () => {
    const store = make();
    await store.submit("lm10", entry(1, 50));
    expect(await store.rename(id(1), "Neo")).toBe(true);
    expect(await store.rename(id(2), "Ghost")).toBe(false);
    expect((await store.top("lm10", 5)).map((e) => e.name)).toEqual(["Neo"]);
  });

  it("sums Legacy totals and counts rivalry results", async () => {
    const store = make();
    expect(await store.legacy()).toEqual({
      totals: { cr7: emptyTotals(), lm10: emptyTotals() },
      rivalry: { cr7: 0, lm10: 0, draws: 0 },
    });
    await store.addTotals("cr7", { goals: 3, hatTricks: 1, matches: 1 });
    await store.addTotals("cr7", { goals: 2, braces: 1, matches: 1 });
    await store.addTotals("lm10", { assists: 4, matches: 1, worldcup: 1, trophies: 1 });
    await store.addRivalry("lm10");
    await store.addRivalry("draw");
    const { totals, rivalry } = await store.legacy();
    expect(totals.cr7).toMatchObject({ goals: 5, hatTricks: 1, braces: 1, matches: 2, assists: 0 });
    expect(totals.lm10).toMatchObject({ assists: 4, worldcup: 1, trophies: 1, matches: 1 });
    expect(rivalry).toEqual({ cr7: 0, lm10: 1, draws: 1 });
  });

  it("burns each nonce once", async () => {
    const store = make();
    expect(await store.claimNonce("abc", 60)).toBe(true);
    expect(await store.claimNonce("abc", 60)).toBe(false);
    expect(await store.claimNonce("def", 60)).toBe(true);
  });

  it("rate-limits per key", async () => {
    const store = make();
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await store.hit("ip:1", 3, 600));
    expect(results).toEqual([true, true, true, false]);
    expect(await store.hit("ip:2", 3, 600)).toBe(true);
  });
});

describe("RedisRestStore", () => {
  it("talks to the Upstash pipeline endpoint with the bearer token", async () => {
    const fake = createFakeRedis("secret");
    const store = new RedisRestStore("https://x.upstash.io/", "secret", "goat:", fake.fetch);
    await store.submit("cr7", entry(1, 100));
    expect(fake.zsets.get("goat:lb:cr7")?.get(id(1))).toBe(100);
    expect(fake.hashes.get("goat:names")?.get(id(1))).toBe("P1");

    const wrong = new RedisRestStore("https://x.upstash.io", "nope", "goat:", fake.fetch);
    await expect(wrong.top("cr7", 10)).rejects.toThrow(/HTTP 401/);
  });
});
