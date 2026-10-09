import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PATCH, POST } from "@/app/api/leaderboard/route";
import { GET as legacy } from "@/app/api/legacy/route";
import { POST as rivalry } from "@/app/api/rivalry/route";
import { POST as issueToken } from "@/app/api/token/route";
import type { LeaderboardResponse, LegacyResponse } from "@/lib/leaderboard/shared";
import { createFakeRedis } from "./fake-upstash";

const PLAYER_A = "a".repeat(32);
const PLAYER_B = "b".repeat(32);
const T0 = Date.UTC(2026, 9, 9, 12, 0, 0);

const resetBackends = () => {
  const g = globalThis as Record<string, unknown>;
  delete g.__goatMemory;
  delete g.__goatRedis;
};

async function token(): Promise<string> {
  const body = await (await issueToken()).json();
  return body.token;
}

function post(handler: (req: Request) => Promise<Response>, url: string, body: unknown, ip = "203.0.113.1") {
  return handler(
    new Request(`http://localhost${url}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    }),
  );
}

const submit = (body: Record<string, unknown>, ip?: string) => post(POST, "/api/leaderboard", body, ip);

/** Issues a token, lets `elapsedMs` pass, then submits a match of `durationMs`. */
async function playAndSubmit(
  playerId: string,
  name: string,
  goals: number,
  assists: number,
  extra: { hero?: string; mode?: string; stageId?: string; durationMs?: number; elapsedMs?: number; ip?: string } = {},
) {
  const { durationMs = 90_000, elapsedMs = 95_000, ip, hero = "cr7", mode = "quick", stageId } = extra;
  const t = await token();
  vi.setSystemTime(Date.now() + elapsedMs);
  return submit({ playerId, name, token: t, hero, mode, stageId, goals, assists, durationMs }, ip);
}

async function board(hero: string, playerId?: string): Promise<LeaderboardResponse> {
  const qs = new URLSearchParams({ hero, ...(playerId ? { playerId } : {}) });
  return (await GET(new Request(`http://localhost/api/leaderboard?${qs}`))).json();
}

beforeEach(() => {
  resetBackends();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetBackends();
});

describe("leaderboard API (memory store)", () => {
  it("scores matches on the server, ranks players per hero and marks the caller", async () => {
    const a = await playAndSubmit(PLAYER_A, "  Lê  Phú ", 2, 1);
    expect(await a.json()).toEqual({ ok: true, score: 310, improved: true, best: 310, rank: 1, trophy: null, ballonDor: false });
    const b = await playAndSubmit(PLAYER_B, "Neo", 3, 0);
    expect(await b.json()).toMatchObject({ ok: true, score: 450, rank: 1 });
    await playAndSubmit(PLAYER_B, "Neo", 1, 0, { hero: "lm10" });

    const res = await board("cr7", PLAYER_A);
    expect(res.enabled).toBe(true);
    expect(res.entries.map((e) => [e.rank, e.name, e.score, e.goals, e.you])).toEqual([
      [1, "Neo", 450, 3, false],
      [2, "Lê Phú", 310, 2, true],
    ]);
    expect(res.you).toEqual({ rank: 2, score: 310 });
    expect((await board("lm10")).entries.map((e) => e.name)).toEqual(["Neo"]);
    // player ids are secrets: never echoed back
    expect(JSON.stringify(res)).not.toContain(PLAYER_B);
  });

  it("awards career trophies from the stage objectives", async () => {
    const res = await playAndSubmit(PLAYER_A, "A", 3, 2, { hero: "lm10", mode: "career", stageId: "lm10-2022-wc" });
    expect(await res.json()).toMatchObject({ ok: true, trophy: "worldcup", ballonDor: true, score: 300 + 120 + 150 + 200 + 300 });
    const miss = await playAndSubmit(PLAYER_B, "B", 1, 0, { hero: "lm10", mode: "career", stageId: "lm10-2022-wc" });
    expect(await miss.json()).toMatchObject({ ok: true, trophy: null, ballonDor: false, score: 100 });
    // a stage of the other hero gives nothing
    const wrong = await playAndSubmit(PLAYER_B, "B", 3, 2, { hero: "cr7", mode: "career", stageId: "lm10-2022-wc" });
    expect(await wrong.json()).toMatchObject({ ok: true, trophy: null });

    const l = (await (await legacy()).json()) as LegacyResponse;
    expect(l.totals.lm10).toMatchObject({ matches: 2, goals: 4, assists: 2, hatTricks: 1, worldcup: 1, ballonDor: 1, trophies: 2, wins: 1 });
    expect(l.totals.cr7).toMatchObject({ matches: 1, goals: 3, hatTricks: 1, trophies: 0 });
  });

  it("keeps only a player's best match", async () => {
    await playAndSubmit(PLAYER_A, "A", 3, 0);
    const worse = await playAndSubmit(PLAYER_A, "A", 1, 0);
    expect(await worse.json()).toMatchObject({ ok: true, score: 100, improved: false, best: 450, rank: 1 });
  });

  it("rejects a token that was already used", async () => {
    const t = await token();
    vi.setSystemTime(T0 + 20_000);
    const match = { playerId: PLAYER_A, name: "A", token: t, hero: "cr7", mode: "quick", goals: 1, assists: 0, durationMs: 15_000 };
    expect((await submit(match)).status).toBe(200);
    const replay = await submit(match);
    expect(replay.status).toBe(409);
    expect(await replay.json()).toEqual({ ok: false, error: "token_used" });
  });

  it("rejects matches longer than the time since kickoff was signed", async () => {
    const res = await playAndSubmit(PLAYER_A, "A", 1, 0, { durationMs: 60_000, elapsedMs: 10_000 });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ ok: false, error: "implausible_match" });
  });

  it("validates input", async () => {
    const t = await token();
    const base = { playerId: PLAYER_A, name: "A", token: t, hero: "cr7", mode: "quick", goals: 1, assists: 0, durationMs: 5000 };
    const cases: [Record<string, unknown>, number, string][] = [
      [{ ...base, name: "🔥" }, 400, "invalid_name"],
      [{ ...base, playerId: "nope" }, 400, "invalid_player"],
      [{ ...base, goals: 40 }, 422, "implausible_match"],
      [{ ...base, token: "forged.token" }, 401, "invalid_token"],
      [{ ...base, goals: "1" }, 400, "bad_request"],
      [{ ...base, hero: "pele" }, 400, "bad_request"],
    ];
    for (const [body, status, error] of cases) {
      const res = await submit(body);
      expect([res.status, (await res.json()).error]).toEqual([status, error]);
    }
    const malformed = await POST(new Request("http://localhost/api/leaderboard", { method: "POST", body: "{" }));
    expect(malformed.status).toBe(400);
  });

  it("rate-limits submissions per IP", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) {
      const res = await playAndSubmit(PLAYER_A, "A", 0, 0, { durationMs: 1000, elapsedMs: 1000 });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
    expect(statuses[30]).toBe(429);
    const otherIp = await playAndSubmit(PLAYER_B, "B", 0, 0, { durationMs: 1000, elapsedMs: 1000, ip: "198.51.100.7" });
    expect(otherIp.status).toBe(200);
  });

  it("renames players on the boards", async () => {
    await playAndSubmit(PLAYER_A, "Old", 1, 0);
    const rename = (playerId: string, name: string) =>
      PATCH(new Request("http://localhost/api/leaderboard", { method: "PATCH", body: JSON.stringify({ playerId, name }) }));
    expect(await (await rename(PLAYER_A, "New Name")).json()).toEqual({ ok: true, renamed: true });
    expect(await (await rename(PLAYER_B, "Ghost")).json()).toEqual({ ok: true, renamed: false });
    expect((await rename(PLAYER_A, "")).status).toBe(400);
    expect((await board("cr7")).entries[0].name).toBe("New Name");
  });
});

describe("rivalry API", () => {
  it("adds both heroes to Legacy and counts the carry-index winner", async () => {
    const t = await token();
    vi.setSystemTime(T0 + 125_000);
    const body = { token: t, durationMs: 120_000, cr7: { goals: 2, assists: 0 }, lm10: { goals: 1, assists: 2 } };
    const res = await post(rivalry, "/api/rivalry", body);
    expect(await res.json()).toEqual({ ok: true });
    expect((await post(rivalry, "/api/rivalry", body)).status).toBe(409);

    const l = (await (await legacy()).json()) as LegacyResponse;
    // carry index 6 vs 7: Messi wins
    expect(l.rivalry).toEqual({ cr7: 0, lm10: 1, draws: 0 });
    expect(l.totals.cr7).toMatchObject({ matches: 1, goals: 2, braces: 1, wins: 0 });
    expect(l.totals.lm10).toMatchObject({ matches: 1, goals: 1, assists: 2, wins: 1 });
  });

  it("rejects impossible scorelines", async () => {
    const t = await token();
    vi.setSystemTime(T0 + 30_000);
    const res = await post(rivalry, "/api/rivalry", { token: t, durationMs: 20_000, cr7: { goals: 9, assists: 0 }, lm10: { goals: 0, assists: 0 } });
    expect([res.status, (await res.json()).error]).toEqual([422, "implausible_match"]);
  });
});

describe("API configuration", () => {
  it("is disabled in production without Redis credentials", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("KV_REST_API_URL", "");
    expect(await board("cr7")).toEqual({ enabled: false, hero: "cr7", entries: [], you: null });
    expect(await (await issueToken()).json()).toEqual({ enabled: false });
    expect(await (await legacy()).json()).toMatchObject({ enabled: false });
    const res = await submit({});
    expect([res.status, (await res.json()).error]).toEqual([404, "disabled"]);
  });

  it("uses Redis when Vercel/Upstash credentials are set", async () => {
    const fake = createFakeRedis("kv-token");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("KV_REST_API_URL", "https://example.upstash.io");
    vi.stubEnv("KV_REST_API_TOKEN", "kv-token");
    vi.stubGlobal("fetch", fake.fetch);

    const res = await playAndSubmit(PLAYER_A, "Redis Runner", 2, 1, { hero: "lm10" });
    expect(await res.json()).toMatchObject({ ok: true, score: 310, rank: 1 });
    expect(fake.zsets.get("goat:lb:lm10")?.get(PLAYER_A)).toBe(310);
    const top = await board("lm10", PLAYER_A);
    expect(top.entries[0]).toMatchObject({ name: "Redis Runner", score: 310, goals: 2, assists: 1, you: true });
    const l = (await (await legacy()).json()) as LegacyResponse;
    expect(l.totals.lm10).toMatchObject({ goals: 2, assists: 1, braces: 1, matches: 1 });
  });

  it("reports an unreachable store as 503 instead of crashing", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://down.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "t");
    vi.stubGlobal("fetch", async () => new Response("bad gateway", { status: 502 }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET(new Request("http://localhost/api/leaderboard?hero=cr7"));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ enabled: true, error: "store_unavailable" });
    expect((await legacy()).status).toBe(503);
  });
});
