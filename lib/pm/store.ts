import type { Project, ProjectSummary } from "./types";

/*
 * Project storage. Production uses Redis through Upstash's REST API (what the
 * Vercel Marketplace "Upstash for Redis" integration provisions); local
 * development falls back to an in-memory store so the app works without setup.
 * Without either, the API reports `enabled: false` and the browser keeps the
 * projects in localStorage.
 */

export type SaveResult =
  | { ok: true; project: Project }
  | { ok: false; reason: "not_found" | "conflict" | "busy"; current?: Project };

export interface ProjectStore {
  readonly kind: "redis" | "memory";
  list(): Promise<ProjectSummary[]>;
  get(id: string): Promise<Project | null>;
  create(project: Project, summary: ProjectSummary): Promise<void>;
  /**
   * Replaces a project if its stored version still equals `expectedVersion`;
   * the saved copy gets version + 1.
   */
  save(
    project: Project,
    expectedVersion: number,
    summarize: (p: Project) => ProjectSummary,
  ): Promise<SaveResult>;
  remove(id: string): Promise<boolean>;
}

const byUpdated = (a: ProjectSummary, b: ProjectSummary) => (a.updatedAt < b.updatedAt ? 1 : -1);

/* ------------------------------------------------------------------ memory */

export class MemoryStore implements ProjectStore {
  readonly kind = "memory";
  private projects = new Map<string, string>();
  private summaries = new Map<string, ProjectSummary>();

  async list() {
    return [...this.summaries.values()].sort(byUpdated);
  }

  async get(id: string) {
    const raw = this.projects.get(id);
    return raw ? (JSON.parse(raw) as Project) : null;
  }

  async create(project: Project, summary: ProjectSummary) {
    this.projects.set(project.id, JSON.stringify(project));
    this.summaries.set(project.id, summary);
  }

  async save(project: Project, expectedVersion: number, summarize: (p: Project) => ProjectSummary): Promise<SaveResult> {
    const current = await this.get(project.id);
    if (!current) return { ok: false, reason: "not_found" };
    if (current.version !== expectedVersion) return { ok: false, reason: "conflict", current };
    const saved = { ...project, version: current.version + 1 };
    this.projects.set(saved.id, JSON.stringify(saved));
    this.summaries.set(saved.id, summarize(saved));
    return { ok: true, project: saved };
  }

  async remove(id: string) {
    this.summaries.delete(id);
    return this.projects.delete(id);
  }
}

/* ------------------------------------------------------------------- redis */

type Command = (string | number)[];

/**
 * Redis via the Upstash REST API (`POST {url}/pipeline`). Keys:
 * `qlda:projects` hash id → project JSON, `qlda:summaries` hash id → summary
 * JSON, `qlda:lock:{id}` short-lived write lock for compare-and-save.
 */
export class RedisRestStore implements ProjectStore {
  readonly kind = "redis";
  private readonly endpoint: string;

  constructor(
    url: string,
    private readonly token: string,
    private readonly prefix = "qlda:",
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

  async list() {
    const [flat] = (await this.pipeline([["HGETALL", this.key("summaries")]])) as [string[] | null];
    const out: ProjectSummary[] = [];
    for (let i = 1; flat && i < flat.length; i += 2) {
      try {
        out.push(JSON.parse(flat[i]) as ProjectSummary);
      } catch {
        // skip a corrupt row rather than failing the whole list
      }
    }
    return out.sort(byUpdated);
  }

  async get(id: string) {
    const [raw] = await this.pipeline([["HGET", this.key("projects"), id]]);
    return typeof raw === "string" ? (JSON.parse(raw) as Project) : null;
  }

  async create(project: Project, summary: ProjectSummary) {
    await this.pipeline([
      ["HSET", this.key("projects"), project.id, JSON.stringify(project)],
      ["HSET", this.key("summaries"), project.id, JSON.stringify(summary)],
    ]);
  }

  async save(project: Project, expectedVersion: number, summarize: (p: Project) => ProjectSummary): Promise<SaveResult> {
    const lock = this.key(`lock:${project.id}`);
    const [locked] = await this.pipeline([["SET", lock, 1, "NX", "PX", 5000]]);
    if (locked !== "OK") return { ok: false, reason: "busy" };
    try {
      const current = await this.get(project.id);
      if (!current) return { ok: false, reason: "not_found" };
      if (current.version !== expectedVersion) return { ok: false, reason: "conflict", current };
      const saved = { ...project, version: current.version + 1 };
      await this.create(saved, summarize(saved));
      return { ok: true, project: saved };
    } finally {
      await this.pipeline([["DEL", lock]]);
    }
  }

  async remove(id: string) {
    const [n] = await this.pipeline([
      ["HDEL", this.key("projects"), id],
      ["HDEL", this.key("summaries"), id],
    ]);
    return Number(n) > 0;
  }
}

/* ----------------------------------------------------------------- factory */

const cache = globalThis as typeof globalThis & {
  __qldaRedis?: { id: string; store: ProjectStore };
  __qldaMemory?: ProjectStore;
};

/**
 * The configured store, or null when server storage is disabled (production
 * without Redis credentials — the browser then keeps projects locally).
 */
export function getProjectStore(): ProjectStore | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) {
    const id = `${url}|${token}`;
    if (cache.__qldaRedis?.id !== id) cache.__qldaRedis = { id, store: new RedisRestStore(url, token) };
    return cache.__qldaRedis.store;
  }
  if (process.env.NODE_ENV !== "production" || process.env.PROJECT_STORE === "memory") {
    cache.__qldaMemory ??= new MemoryStore();
    return cache.__qldaMemory;
  }
  return null;
}
