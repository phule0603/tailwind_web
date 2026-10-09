import { json } from "@/lib/leaderboard/http";
import { emptyTotals, type LegacyResponse } from "@/lib/leaderboard/shared";
import { getLeaderboard } from "@/lib/leaderboard/store";

const empty = (): LegacyResponse["totals"] => ({ cr7: emptyTotals(), lm10: emptyTotals() });
const noRivalry = { cr7: 0, lm10: 0, draws: 0 };

/** GET /api/legacy — every goal, assist and trophy of both heroes, summed over all players. */
export async function GET() {
  const lb = getLeaderboard();
  if (!lb) return json<LegacyResponse>({ enabled: false, totals: empty(), rivalry: noRivalry });
  try {
    const { totals, rivalry } = await lb.store.legacy();
    return json<LegacyResponse>({ enabled: true, totals, rivalry });
  } catch (err) {
    console.error("[legacy] GET failed", err);
    return json<LegacyResponse>(
      { enabled: true, totals: empty(), rivalry: noRivalry, error: "store_unavailable" },
      503,
    );
  }
}
