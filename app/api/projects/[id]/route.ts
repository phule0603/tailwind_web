import type { ProjectResponse } from "@/lib/pm/api";
import { isProjectId, sanitizeProject, summarize } from "@/lib/pm/project";
import { getProjectStore } from "@/lib/pm/store";
import { fail, json, readJson } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/projects/:id */
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const store = getProjectStore();
  if (!store) return fail("unavailable", 503);
  if (!isProjectId(id)) return fail("not_found", 404);
  try {
    const project = await store.get(id);
    return project ? json<ProjectResponse>({ ok: true, project }) : fail("not_found", 404);
  } catch (err) {
    console.error("project read failed", err);
    return fail("server", 500);
  }
}

/**
 * PUT /api/projects/:id — saves the whole project. `version` must be the
 * version the client loaded; a newer stored copy answers 409 with that copy.
 */
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const store = getProjectStore();
  if (!store) return fail("unavailable", 503);
  if (!isProjectId(id)) return fail("not_found", 404);
  const body = await readJson(req);
  if (body === "too_large") return fail("too_large", 413);
  if (!body || typeof body !== "object") return fail("invalid", 400);
  const version = (body as { version?: unknown }).version;
  if (typeof version !== "number" || !Number.isInteger(version)) return fail("invalid", 400);
  try {
    const current = await store.get(id);
    if (!current) return fail("not_found", 404);
    const project = sanitizeProject(body, {
      id,
      createdAt: current.createdAt,
      version,
      updatedAt: new Date().toISOString(),
    });
    if (!project.name) return fail("invalid", 400, { message: "Tên dự án là bắt buộc" });
    const res = await store.save(project, version, (p) => summarize(p));
    if (res.ok) return json<ProjectResponse>({ ok: true, project: res.project });
    if (res.reason === "conflict") return fail("conflict", 409, { project: res.current });
    if (res.reason === "busy") return fail("busy", 409);
    return fail("not_found", 404);
  } catch (err) {
    console.error("project save failed", err);
    return fail("server", 500);
  }
}

/** DELETE /api/projects/:id */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const store = getProjectStore();
  if (!store) return fail("unavailable", 503);
  if (!isProjectId(id)) return fail("not_found", 404);
  try {
    return (await store.remove(id)) ? json({ ok: true }) : fail("not_found", 404);
  } catch (err) {
    console.error("project delete failed", err);
    return fail("server", 500);
  }
}
