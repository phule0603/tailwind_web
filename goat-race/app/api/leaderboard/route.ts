import { isHeroId } from "@/lib/heroes";
import { admitMatch, clientIp, fail, json, readJson, WINDOW_SEC } from "@/lib/leaderboard/http";
import {
  checkMatch,
  isPlayerId,
  LEADERBOARD_SIZE,
  outcomeOf,
  parseSubmitRequest,
  sanitizeName,
  scoreMatch,
  totalsDelta,
  type LeaderboardResponse,
  type RenameResponse,
  type SubmitResponse,
} from "@/lib/leaderboard/shared";
import { getLeaderboard } from "@/lib/leaderboard/store";

const SUBMIT_LIMIT = 30; // per IP per window
const RENAME_LIMIT = 10;

/** GET /api/leaderboard?hero=cr7&limit=10&playerId=… — best matches with a hero, plus the caller's rank. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const heroParam = params.get("hero");
  const hero = isHeroId(heroParam) ? heroParam : "cr7";
  const lb = getLeaderboard();
  if (!lb) return json<LeaderboardResponse>({ enabled: false, hero, entries: [], you: null });

  const limit = Math.min(50, Math.max(1, Math.floor(Number(params.get("limit"))) || LEADERBOARD_SIZE));
  const playerId = params.get("playerId");
  try {
    const [top, you] = await Promise.all([
      lb.store.top(hero, limit),
      isPlayerId(playerId) ? lb.store.rankOf(hero, playerId) : null,
    ]);
    return json<LeaderboardResponse>({
      enabled: true,
      hero,
      entries: top.map((e, i) => ({
        rank: i + 1,
        name: e.name,
        score: e.score,
        goals: e.goals,
        assists: e.assists,
        at: e.at,
        you: e.playerId === playerId,
      })),
      you,
    });
  } catch (err) {
    console.error("[leaderboard] GET failed", err);
    return json<LeaderboardResponse>(
      { enabled: true, hero, entries: [], you: null, error: "store_unavailable" },
      503,
    );
  }
}

/** POST /api/leaderboard — submit a finished match: Legacy totals always, the board if it is a personal best. */
export async function POST(req: Request) {
  const lb = getLeaderboard();
  if (!lb) return fail("disabled", 404);

  const body = parseSubmitRequest(await readJson(req));
  if (!body) return fail("bad_request", 400);
  if (!isPlayerId(body.playerId)) return fail("invalid_player", 400);
  const name = sanitizeName(body.name);
  if (!name) return fail("invalid_name", 400);
  if (checkMatch(body)) return fail("implausible_match", 422);

  try {
    const rejected = await admitMatch(lb, req, body.token, body.durationMs, "submit", SUBMIT_LIMIT);
    if (rejected) return rejected;

    const outcome = outcomeOf(body);
    const score = scoreMatch(body.goals, body.assists, outcome);
    await lb.store.addTotals(body.hero, totalsDelta(body.goals, body.assists, outcome, !!outcome?.trophy));
    const result = await lb.store.submit(body.hero, {
      playerId: body.playerId,
      name,
      score,
      goals: body.goals,
      assists: body.assists,
      at: Date.now(),
    });
    return json<SubmitResponse>({
      ok: true,
      score,
      ...result,
      trophy: outcome?.trophy ?? null,
      ballonDor: outcome?.ballonDor ?? false,
    });
  } catch (err) {
    console.error("[leaderboard] POST failed", err);
    return fail("store_unavailable", 503);
  }
}

/** PATCH /api/leaderboard — change the display name of a player already on a board. */
export async function PATCH(req: Request) {
  const lb = getLeaderboard();
  if (!lb) return fail("disabled", 404);

  const body = (await readJson(req)) as { playerId?: unknown; name?: unknown } | null;
  if (!body || !isPlayerId(body.playerId)) return fail("invalid_player", 400);
  const name = sanitizeName(body.name);
  if (!name) return fail("invalid_name", 400);

  try {
    if (!(await lb.store.hit(`rename:${clientIp(req)}`, RENAME_LIMIT, WINDOW_SEC))) {
      return fail("rate_limited", 429);
    }
    const renamed = await lb.store.rename(body.playerId, name);
    return json<RenameResponse>({ ok: true, renamed });
  } catch (err) {
    console.error("[leaderboard] PATCH failed", err);
    return fail("store_unavailable", 503);
  }
}
