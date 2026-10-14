import type { Project, ProjectSummary } from "./types";

/* Request / response shapes of /api/projects. */

export type ApiError = "invalid" | "not_found" | "conflict" | "busy" | "too_large" | "unavailable" | "server";

export type ApiFailure = { ok: false; error: ApiError; message?: string; project?: Project };

export interface ListResponse {
  /** false: no server storage configured — the client stores projects locally */
  enabled: boolean;
  projects: ProjectSummary[];
}

export type ProjectResponse = { ok: true; project: Project } | ApiFailure;
