import { HERO_IDS } from "@/lib/heroes";
import { admitMatch, fail, json, readJson } from "@/lib/leaderboard/http";
import {
  carryIndex,
  checkRivalry,
  parseRivalryRequest,
  totalsDelta,
  type RivalryResponse,
} from "@/lib/leaderboard/shared";
import { getLeaderboard } from "@/lib/leaderboard/store";

const RIVALRY_LIMIT = 20; // per IP per window

/** POST /api/rivalry — a finished PvP match: adds both heroes' stats to Legacy and counts the winner. */
export async function POST(req: Request) {
  const lb = getLeaderboard();
  if (!lb) return fail("disabled", 404);

  const body = parseRivalryRequest(await readJson(req));
  if (!body) return fail("bad_request", 400);
  if (checkRivalry(body)) return fail("implausible_match", 422);

  // the scoreline isn't sent: each hero's goals are a lower bound, so the
  // winner is decided by the "carry index" both players saw on screen
  const diff = carryIndex(body.cr7) - carryIndex(body.lm10);
  const winner = diff > 0 ? "cr7" : diff < 0 ? "lm10" : "draw";

  try {
    const rejected = await admitMatch(lb, req, body.token, body.durationMs, "rivalry", RIVALRY_LIMIT);
    if (rejected) return rejected;
    for (const hero of HERO_IDS) {
      await lb.store.addTotals(hero, totalsDelta(body[hero].goals, body[hero].assists, null, winner === hero));
    }
    await lb.store.addRivalry(winner);
    return json<RivalryResponse>({ ok: true });
  } catch (err) {
    console.error("[rivalry] POST failed", err);
    return fail("store_unavailable", 503);
  }
}
