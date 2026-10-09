import { describe, expect, it } from "vitest";
import { findStage } from "@/lib/career";
import { MATCH_SECONDS, MIN_MS_PER_GOAL, PVP_SECONDS } from "@/lib/game-config";
import {
  carryIndex,
  checkMatch,
  checkRivalry,
  maxGoalsFor,
  outcomeOf,
  parseRivalryRequest,
  parseSubmitRequest,
  sanitizeName,
  scoreMatch,
  totalsDelta,
} from "@/lib/leaderboard/shared";

describe("sanitizeName", () => {
  it("keeps Vietnamese names and trims junk", () => {
    expect(sanitizeName("  Lê   Phú ")).toBe("Lê Phú");
    expect(sanitizeName("Văn A<script>")).toBe("Văn Ascript");
    expect(sanitizeName("CR7_Fan.2026-x")).toBe("CR7_Fan.2026-x");
    expect(sanitizeName("ABCDEFGHIJKLMNOPQRSTU")).toBe("ABCDEFGHIJKLMNOP");
  });

  it("rejects names with nothing usable", () => {
    expect(sanitizeName("🔥🔥")).toBeNull();
    expect(sanitizeName("   ")).toBeNull();
    expect(sanitizeName(42)).toBeNull();
  });
});

describe("checkMatch", () => {
  const full = MATCH_SECONDS * 1000;

  it("accepts plausible matches", () => {
    expect(checkMatch({ goals: 3, assists: 2, durationMs: full })).toBeNull();
    expect(checkMatch({ goals: 0, assists: 0, durationMs: 0 })).toBeNull();
    expect(checkMatch({ goals: 1, assists: 0, durationMs: 1500 })).toBeNull();
  });

  it("bounds goals + assists by the playing time", () => {
    const max = maxGoalsFor(full);
    expect(max).toBe(Math.floor(full / MIN_MS_PER_GOAL) + 1);
    expect(checkMatch({ goals: max, assists: 0, durationMs: full })).toBeNull();
    expect(checkMatch({ goals: max, assists: 1, durationMs: full })).toBe("implausible_match");
    expect(checkMatch({ goals: 2, assists: 0, durationMs: 3000 })).toBe("implausible_match");
  });

  it("rejects malformed numbers and overlong matches", () => {
    expect(checkMatch({ goals: -1, assists: 0, durationMs: 1000 })).toBe("implausible_match");
    expect(checkMatch({ goals: 1.5, assists: 0, durationMs: 9000 })).toBe("implausible_match");
    expect(checkMatch({ goals: 0, assists: 0, durationMs: full + 5000 })).toBe("implausible_match");
  });

  it("bounds PvP matches by their shared clock", () => {
    const r = { token: "t", durationMs: PVP_SECONDS * 1000, cr7: { goals: 10, assists: 5 }, lm10: { goals: 8, assists: 7 } };
    expect(checkRivalry(r)).toBeNull();
    expect(checkRivalry({ ...r, cr7: { goals: 40, assists: 0 } })).toBe("implausible_match");
    expect(checkRivalry({ ...r, durationMs: PVP_SECONDS * 1000 + 9000 })).toBe("implausible_match");
  });
});

describe("scoring", () => {
  it("adds goals, assists, brace / hat-trick and trophies", () => {
    expect(scoreMatch(1, 1, null)).toBe(160);
    expect(scoreMatch(2, 0, null)).toBe(250);
    expect(scoreMatch(3, 0, null)).toBe(450);
    expect(scoreMatch(3, 1, { trophy: "ucl", ballonDor: true })).toBe(300 + 60 + 150 + 200 + 300);
  });

  it("awards trophies only for career stages of the same hero", () => {
    const base = { mode: "career" as const, hero: "cr7" as const, goals: 3, assists: 1 };
    expect(outcomeOf({ ...base, stageId: "cr7-2008-ucl" })).toEqual({ trophy: "ucl", ballonDor: true });
    expect(outcomeOf({ ...base, stageId: "cr7-2008-ucl", goals: 1, assists: 0 })).toEqual({ trophy: null, ballonDor: false });
    expect(outcomeOf({ ...base, stageId: "lm10-2022-wc" })).toBeNull();
    expect(outcomeOf({ ...base, mode: "quick", stageId: "cr7-2008-ucl" })).toBeNull();
    expect(outcomeOf({ ...base, stageId: "nope" })).toBeNull();
  });

  it("turns a match into Legacy counters", () => {
    expect(totalsDelta(3, 1, { trophy: "worldcup", ballonDor: true }, true)).toMatchObject({
      matches: 1,
      goals: 3,
      assists: 1,
      hatTricks: 1,
      braces: 0,
      trophies: 2,
      worldcup: 1,
      ballonDor: 1,
      wins: 1,
    });
    expect(totalsDelta(2, 0, null, false)).toMatchObject({ braces: 1, hatTricks: 0, trophies: 0, wins: 0 });
  });

  it("measures who carried the team", () => {
    expect(carryIndex({ goals: 2, assists: 1 })).toBe(8);
    expect(carryIndex({ goals: 0, assists: 4 })).toBe(8);
  });
});

describe("request parsing", () => {
  it("parses a valid submission", () => {
    const body = { playerId: "a".repeat(32), name: "A", token: "t", hero: "lm10", mode: "career", stageId: "lm10-2022-wc", goals: 2, assists: 1, durationMs: 90000 };
    expect(parseSubmitRequest(body)).toEqual(body);
    expect(parseSubmitRequest({ ...body, stageId: undefined })).toMatchObject({ stageId: null });
    expect(findStage(body.stageId)?.hero).toBe("lm10");
  });

  it("rejects wrong shapes", () => {
    const body = { playerId: "a", name: "A", token: "t", hero: "lm10", mode: "career", goals: 2, assists: 1, durationMs: 9 };
    expect(parseSubmitRequest(null)).toBeNull();
    expect(parseSubmitRequest([])).toBeNull();
    expect(parseSubmitRequest({ ...body, hero: "pele" })).toBeNull();
    expect(parseSubmitRequest({ ...body, mode: "pvp" })).toBeNull();
    expect(parseSubmitRequest({ ...body, goals: "2" })).toBeNull();
    expect(parseSubmitRequest({ ...body, stageId: 5 })).toBeNull();
    expect(parseRivalryRequest({ token: "t", durationMs: 1, cr7: { goals: 1, assists: 0 } })).toBeNull();
    expect(parseRivalryRequest({ token: "t", durationMs: 1, cr7: { goals: 1, assists: 0 }, lm10: { goals: 0, assists: 0 } })).toEqual({
      token: "t",
      durationMs: 1,
      cr7: { goals: 1, assists: 0 },
      lm10: { goals: 0, assists: 0 },
    });
  });
});
