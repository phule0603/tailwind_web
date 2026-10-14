import type { ApiError, ApiFailure } from "@/lib/pm/api";
import { MAX_BODY_BYTES } from "@/lib/pm/project";

export const json = <T,>(body: T, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export const fail = (error: ApiError, status: number, extra: Partial<ApiFailure> = {}) =>
  json<ApiFailure>({ ok: false, error, ...extra }, status);

/** Parsed JSON body, "too_large" when over the limit, null when not JSON. */
export async function readJson(req: Request): Promise<unknown | "too_large" | null> {
  const declared = Number(req.headers.get("content-length"));
  if (declared > MAX_BODY_BYTES) return "too_large";
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return "too_large";
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
