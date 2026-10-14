import type { ListResponse, ProjectResponse } from "@/lib/pm/api";
import { sanitizeInfo, summarize } from "@/lib/pm/project";
import { getProjectStore } from "@/lib/pm/store";
import { isTemplateId, newProject } from "@/lib/pm/templates";
import { fail, json, readJson } from "@/lib/http";

/** GET /api/projects — summaries of all projects, newest first. */
export async function GET() {
  const store = getProjectStore();
  if (!store) return json<ListResponse>({ enabled: false, projects: [] });
  try {
    return json<ListResponse>({ enabled: true, projects: await store.list() });
  } catch (err) {
    console.error("project list failed", err);
    return fail("server", 500);
  }
}

/** POST /api/projects { info, template } — creates a project. */
export async function POST(req: Request) {
  const store = getProjectStore();
  if (!store) return fail("unavailable", 503);
  const body = await readJson(req);
  if (body === "too_large") return fail("too_large", 413);
  if (!body || typeof body !== "object") return fail("invalid", 400);
  const { info: rawInfo, template } = body as { info?: unknown; template?: unknown };
  const now = new Date();
  const info = sanitizeInfo(rawInfo, now.toISOString().slice(0, 10));
  if (!info.name) return fail("invalid", 400, { message: "Tên dự án là bắt buộc" });
  const project = newProject(info, isTemplateId(template) ? template : "blank", now);
  try {
    await store.create(project, summarize(project));
    return json<ProjectResponse>({ ok: true, project }, 201);
  } catch (err) {
    console.error("project create failed", err);
    return fail("server", 500);
  }
}
