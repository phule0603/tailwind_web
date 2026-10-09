import { createHash, randomBytes } from "node:crypto";
import { HERO_IDS, type HeroId } from "@/lib/heroes";
import { emptyTotals, TOTAL_KEYS, type HeroTotals } from "@/lib/leaderboard/shared";

/*
 * Leaderboard + Legacy storage. Production uses Redis through Upstash's REST API
 * (what the Vercel Marketplace "Upstash for Redis" integration provisions); local
 * development falls back to an in-memory store so the game works without setup.
 */

export interface StoredEntry {
  playerId: string;
  name: string;
  score: number;
  goals: number;
  assists: number;
  at: number;
}

export interface SubmitResult {
  improved: boolean;
  best: number;
  rank: number;
}

export type RivalryTotals = { cr7: number; lm10: number; draws: number };
export type RivalryWinner = HeroId | "draw";

export interface LeaderboardStore {
  readonly kind: "redis" | "memory";
  top(hero: HeroId, limit: number): Promise<StoredEntry[]>;
  rankOf(hero: HeroId, playerId: string): Promise<{ rank: number; score: number } | null>;
  /** Keeps each player's best match per hero; always refreshes the display name. */
  submit(hero: HeroId, entry: StoredEntry): Promise<SubmitResult>;
  /** Renames a player that is already on a board. */
  rename(playerId: string, name: string): Promise<boolean>;
  /** Adds to the Legacy totals of a hero. */
  addTotals(hero: HeroId, delta: Partial<HeroTotals>): Promise<void>;
  /** Counts a finished PvP match. */
  addRivalry(winner: RivalryWinner): Promise<void>;
  legacy(): Promise<{ totals: Record<HeroId, HeroTotals>; rivalry: RivalryTotals }>;
  /** Burns a run-token nonce; false if it was already used. */
  claimNonce(nonce: string, ttlSec: number): Promise<boolean>;
  /** Fixed-window rate limit: true while under `limit` hits in the current window. */
  hit(key: string, limit: number, windowSec: number): Promise<boolean>;
}

const rivalryField = (w: RivalryWinner) => (w === "draw" ? "draws" : w);

/* ------------------------------------------------------------------ memory */

export class MemoryStore implements LeaderboardStore {
  readonly kind = "memory";
  private boards: Record<HeroId, Map<string, StoredEntry>> = { cr7: new Map(), lm10: new Map() };
  private totals: Record<HeroId, HeroTotals> = { cr7: emptyTotals(), lm10: emptyTotals() };
  private rivalry: RivalryTotals = { cr7: 0, lm10: 0, draws: 0 };
  private nonces = new Map<string, number>();
  private hits = new Map<string, number>();

  constructor(private now: () => number = Date.now) {}

  private ranked(hero: HeroId) {
    return [...this.boards[hero].values()].sort((a, b) => b.score - a.score || a.at - b.at);
  }

  async top(hero: HeroId, limit: number) {
    return this.ranked(hero)
      .slice(0, limit)
      .map((e) => ({ ...e }));
  }

  async rankOf(hero: HeroId, playerId: string) {
    const list = this.ranked(hero);
    const i = list.findIndex((e) => e.playerId === playerId);
    return i < 0 ? null : { rank: i + 1, score: list[i].score };
  }

  async submit(hero: HeroId, entry: StoredEntry) {
    const board = this.boards[hero];
    const prev = board.get(entry.playerId);
    const improved = !prev || entry.score > prev.score;
    if (improved) board.set(entry.playerId, { ...entry });
    for (const h of HERO_IDS) {
      const p = this.boards[h].get(entry.playerId);
      if (p) p.name = entry.name;
    }
    const { rank, score } = (await this.rankOf(hero, entry.playerId))!;
    return { improved, best: score, rank };
  }

  async rename(playerId: string, name: string) {
    let found = false;
    for (const h of HERO_IDS) {
      const p = this.boards[h].get(playerId);
      if (p) {
        p.name = name;
        found = true;
      }
    }
    return found;
  }

  async addTotals(hero: HeroId, delta: Partial<HeroTotals>) {
    for (const k of TOTAL_KEYS) this.totals[hero][k] += delta[k] ?? 0;
  }

  async addRivalry(winner: RivalryWinner) {
    this.rivalry[rivalryField(winner)] += 1;
  }

  async legacy() {
    return {
      totals: { cr7: { ...this.totals.cr7 }, lm10: { ...this.totals.lm10 } },
      rivalry: { ...this.rivalry },
    };
  }

  async claimNonce(nonce: string, ttlSec: number) {
    const now = this.now();
    for (const [k, expires] of this.nonces) if (expires <= now) this.nonces.delete(k);
    if (this.nonces.has(nonce)) return false;
    this.nonces.set(nonce, now + ttlSec * 1000);
    return true;
  }

  async hit(key: string, limit: number, windowSec: number) {
    const k = `${key}:${Math.floor(this.now() / (windowSec * 1000))}`;
    if (this.hits.size > 10_000) this.hits.clear();
    const count = (this.hits.get(k) ?? 0) + 1;
    this.hits.set(k, count);
    return count <= limit;
  }
}

/* ------------------------------------------------------------------- redis */

type Command = (string | number)[];

function parseRun(raw: unknown): { goals: number; assists: number; at: number } {
  try {
    const r = JSON.parse(String(raw)) as Record<string, unknown>;
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    return { goals: num(r.goals), assists: num(r.assists), at: num(r.at) };
  } catch {
    return { goals: 0, assists: 0, at: 0 };
  }
}

/** HGETALL replies come back from the REST API as a flat [field, value, …] array. */
function hashToNumbers(flat: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (Array.isArray(flat)) {
    for (let i = 0; i + 1 < flat.length; i += 2) out[String(flat[i])] = Number(flat[i + 1]) || 0;
  } else if (flat && typeof flat === "object") {
    for (const [k, v] of Object.entries(flat)) out[k] = Number(v) || 0;
  }
  return out;
}

/**
 * Redis via the Upstash REST API (`POST {url}/pipeline` with a JSON array of
 * commands). Keys: `goat:lb:<hero>` sorted sets of best match scores,
 * `goat:runs:<hero>` hashes of match details, `goat:names` hash of display
 * names, `goat:totals:<hero>` and `goat:rivalry` counter hashes.
 */
export class RedisRestStore implements LeaderboardStore {
  readonly kind = "redis";
  private readonly endpoint: string;

  constructor(
    url: string,
    private readonly token: string,
    private readonly prefix = "goat:",
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {
    this.endpoint = `${url.replace(/\/+$/, "")}/pipeline`;
  }

  private key(name: string) {
    return this.prefix + name;
  }

  private async pipeline(commands: Command[]): Promise<unknown[]> {
    const res = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands.map((c) => c.map(String))),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Redis REST request failed: HTTP ${res.status}`);
    const out = (await res.json()) as { result?: unknown; error?: string }[];
    if (!Array.isArray(out) || out.length !== commands.length) {
      throw new Error("Redis REST request failed: malformed response");
    }
    return out.map((r) => {
      if (r.error) throw new Error(`Redis error: ${r.error}`);
      return r.result;
    });
  }

  async top(hero: HeroId, limit: number) {
    const [flat] = (await this.pipeline([
      ["ZREVRANGE", this.key(`lb:${hero}`), 0, limit - 1, "WITHSCORES"],
    ])) as [string[]];
    const ids: string[] = [];
    const scores: number[] = [];
    for (let i = 0; i + 1 < flat.length; i += 2) {
      ids.push(flat[i]);
      scores.push(Number(flat[i + 1]));
    }
    if (ids.length === 0) return [];
    const [names, runs] = (await this.pipeline([
      ["HMGET", this.key("names"), ...ids],
      ["HMGET", this.key(`runs:${hero}`), ...ids],
    ])) as [(string | null)[], (string | null)[]];
    return ids.map((playerId, i) => ({
      playerId,
      name: names[i] ?? "???",
      score: scores[i],
      ...parseRun(runs[i]),
    }));
  }

  async rankOf(hero: HeroId, playerId: string) {
    const [score, rank] = await this.pipeline([
      ["ZSCORE", this.key(`lb:${hero}`), playerId],
      ["ZREVRANK", this.key(`lb:${hero}`), playerId],
    ]);
    if (score === null || rank === null) return null;
    return { rank: Number(rank) + 1, score: Number(score) };
  }

  async submit(hero: HeroId, entry: StoredEntry) {
    const lb = this.key(`lb:${hero}`);
    const [changed, , best, rank] = await this.pipeline([
      // GT: only ever raise a player's score; CH: report whether it changed
      ["ZADD", lb, "GT", "CH", entry.score, entry.playerId],
      ["HSET", this.key("names"), entry.playerId, entry.name],
      ["ZSCORE", lb, entry.playerId],
      ["ZREVRANK", lb, entry.playerId],
    ]);
    const improved = Number(changed) === 1;
    if (improved) {
      const run = JSON.stringify({ goals: entry.goals, assists: entry.assists, at: entry.at });
      await this.pipeline([["HSET", this.key(`runs:${hero}`), entry.playerId, run]]);
    }
    return { improved, best: Number(best), rank: Number(rank) + 1 };
  }

  async rename(playerId: string, name: string) {
    const scores = await this.pipeline(HERO_IDS.map((h) => ["ZSCORE", this.key(`lb:${h}`), playerId]));
    if (scores.every((s) => s === null)) return false;
    await this.pipeline([["HSET", this.key("names"), playerId, name]]);
    return true;
  }

  async addTotals(hero: HeroId, delta: Partial<HeroTotals>) {
    const cmds: Command[] = TOTAL_KEYS.filter((k) => delta[k]).map((k) => [
      "HINCRBY",
      this.key(`totals:${hero}`),
      k,
      delta[k]!,
    ]);
    if (cmds.length) await this.pipeline(cmds);
  }

  async addRivalry(winner: RivalryWinner) {
    await this.pipeline([["HINCRBY", this.key("rivalry"), rivalryField(winner), 1]]);
  }

  async legacy() {
    const [cr7, lm10, rivalry] = await this.pipeline([
      ["HGETALL", this.key("totals:cr7")],
      ["HGETALL", this.key("totals:lm10")],
      ["HGETALL", this.key("rivalry")],
    ]);
    const totals = (raw: unknown) => ({ ...emptyTotals(), ...pick(hashToNumbers(raw)) });
    const r = hashToNumbers(rivalry);
    return {
      totals: { cr7: totals(cr7), lm10: totals(lm10) },
      rivalry: { cr7: r.cr7 ?? 0, lm10: r.lm10 ?? 0, draws: r.draws ?? 0 },
    };
  }

  async claimNonce(nonce: string, ttlSec: number) {
    const [res] = await this.pipeline([["SET", this.key(`nonce:${nonce}`), 1, "NX", "EX", ttlSec]]);
    return res === "OK";
  }

  async hit(key: string, limit: number, windowSec: number) {
    const k = this.key(`rl:${key}:${Math.floor(Date.now() / (windowSec * 1000))}`);
    const [count] = await this.pipeline([
      ["INCR", k],
      ["EXPIRE", k, windowSec * 2],
    ]);
    return Number(count) <= limit;
  }
}

/** Keeps only the known Legacy counters from a stored hash. */
function pick(values: Record<string, number>): Partial<HeroTotals> {
  const out: Partial<HeroTotals> = {};
  for (const k of TOTAL_KEYS) if (k in values) out[k] = values[k];
  return out;
}

/* ----------------------------------------------------------------- factory */

export interface LeaderboardBackend {
  store: LeaderboardStore;
  /** HMAC key for run tokens */
  secret: string;
}

const cache = globalThis as typeof globalThis & {
  __goatRedis?: { id: string; backend: LeaderboardBackend };
  __goatMemory?: LeaderboardBackend;
};

/**
 * The configured backend, or null when it is disabled (production without
 * Redis credentials — the game then keeps everything on the device only).
 */
export function getLeaderboard(): LeaderboardBackend | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) {
    const id = `${url}|${token}`;
    if (cache.__goatRedis?.id !== id) {
      const secret =
        process.env.LEADERBOARD_SECRET ||
        createHash("sha256").update(`goat-run-token\0${token}`).digest("hex");
      cache.__goatRedis = { id, backend: { store: new RedisRestStore(url, token), secret } };
    }
    return cache.__goatRedis.backend;
  }
  if (process.env.NODE_ENV !== "production" || process.env.LEADERBOARD_STORE === "memory") {
    cache.__goatMemory ??= {
      store: new MemoryStore(),
      secret: process.env.LEADERBOARD_SECRET || randomBytes(32).toString("hex"),
    };
    return cache.__goatMemory;
  }
  return null;
}
