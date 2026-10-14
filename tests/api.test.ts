import { beforeEach, describe, expect, it } from "vitest";
import * as collection from "@/app/api/projects/route";
import * as single from "@/app/api/projects/[id]/route";
import type { ListResponse, ProjectResponse } from "@/lib/pm/api";
import type { Project } from "@/lib/pm/types";

const g = globalThis as { __qldaMemory?: unknown };
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (method: string, body?: unknown) =>
  new Request("http://localhost/api/projects", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });

async function create(template = "standard"): Promise<Project> {
  const res = await collection.POST(req("POST", { info: { name: "Nhà A", startDate: "2026-11-02" }, template }));
  expect(res.status).toBe(201);
  return ((await res.json()) as Extract<ProjectResponse, { ok: true }>).project;
}

beforeEach(() => {
  delete g.__qldaMemory; // fresh in-memory store (NODE_ENV=test)
});

describe("/api/projects", () => {
  it("creates and lists projects", async () => {
    const p = await create();
    expect(p).toMatchObject({ name: "Nhà A", startDate: "2026-11-02", version: 1, status: "planning" });
    expect(p.wbs.length).toBeGreaterThan(0);
    const list = (await (await collection.GET()).json()) as ListResponse;
    expect(list.enabled).toBe(true);
    expect(list.projects.map((s) => s.id)).toEqual([p.id]);
  });

  it("rejects a project without a name and bad JSON", async () => {
    expect((await collection.POST(req("POST", { info: { name: " " } }))).status).toBe(400);
    expect((await collection.POST(req("POST", "{nope"))).status).toBe(400);
    expect((await collection.POST(req("POST", "x".repeat(1_000_000)))).status).toBe(413);
  });

  it("saves with version checks and sanitizes the body", async () => {
    const p = await create();
    const res = await single.PUT(req("PUT", { ...p, name: "Nhà B", id: "ignored", version: 1, contingencyPct: -3 }), ctx(p.id));
    expect(res.status).toBe(200);
    const saved = ((await res.json()) as Extract<ProjectResponse, { ok: true }>).project;
    expect(saved).toMatchObject({ id: p.id, name: "Nhà B", version: 2, contingencyPct: 0, createdAt: p.createdAt });

    const stale = await single.PUT(req("PUT", { ...p, name: "Cũ", version: 1 }), ctx(p.id));
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ ok: false, error: "conflict", project: { name: "Nhà B", version: 2 } });

    expect((await single.PUT(req("PUT", { ...p, version: "2" }), ctx(p.id))).status).toBe(400);
    const got = (await (await single.GET(req("GET"), ctx(p.id))).json()) as Extract<ProjectResponse, { ok: true }>;
    expect(got.project.name).toBe("Nhà B");
  });

  it("deletes projects and 404s unknown ids", async () => {
    const p = await create("blank");
    expect((await single.DELETE(req("DELETE"), ctx(p.id))).status).toBe(200);
    expect((await single.GET(req("GET"), ctx(p.id))).status).toBe(404);
    expect((await single.GET(req("GET"), ctx("../../etc"))).status).toBe(404);
    expect((await single.PUT(req("PUT", { ...p, version: 1 }), ctx(p.id))).status).toBe(404);
  });
});
