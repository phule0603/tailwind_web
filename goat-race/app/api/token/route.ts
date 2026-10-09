import type { TokenResponse } from "@/lib/leaderboard/shared";
import { getLeaderboard } from "@/lib/leaderboard/store";
import { createRunToken } from "@/lib/leaderboard/token";

/** POST /api/token — called at kickoff; the signed start time is checked when the match is submitted. */
export async function POST() {
  const lb = getLeaderboard();
  const body: TokenResponse = lb
    ? { enabled: true, token: createRunToken(lb.secret) }
    : { enabled: false };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
