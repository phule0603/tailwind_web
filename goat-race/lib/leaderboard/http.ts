import type { ApiError } from "@/lib/leaderboard/shared";
import type { LeaderboardBackend } from "@/lib/leaderboard/store";
import { TOKEN_TTL_MS, verifyRunToken } from "@/lib/leaderboard/token";

/* Helpers shared by the API route handlers. */

export const WINDOW_SEC = 600;
/** the token is fetched a moment after kickoff, so allow for network latency */
const DURATION_GRACE_MS = 3_000;

export const json = <T,>(body: T, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export const fail = (error: ApiError, status: number) => json({ ok: false as const, error }, status);

export function clientIp(req: Request) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

/**
 * Verifies a run token for a match of `durationMs`, applies the per-IP rate limit
 * and burns the token. Returns an error Response, or null when the match may be stored.
 */
export async function admitMatch(
  lb: LeaderboardBackend,
  req: Request,
  token: string,
  durationMs: number,
  bucket: string,
  limit: number,
): Promise<Response | null> {
  const verified = verifyRunToken(token, lb.secret);
  if (!verified.ok) return fail(verified.error, 401);
  // a match can't have lasted longer than the time since its kickoff was signed
  if (durationMs > Date.now() - verified.iat + DURATION_GRACE_MS) return fail("implausible_match", 422);
  if (!(await lb.store.hit(`${bucket}:${clientIp(req)}`, limit, WINDOW_SEC))) return fail("rate_limited", 429);
  if (!(await lb.store.claimNonce(verified.nonce, Math.ceil(TOKEN_TTL_MS / 1000)))) {
    return fail("token_used", 409);
  }
  return null;
}
