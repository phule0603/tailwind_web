import { describe, expect, it } from "vitest";
import { evaluateStage, STAGES, stagesFor } from "@/lib/career";
import { MATCH_SECONDS } from "@/lib/game-config";
import { effectiveStats, HEROES, HERO_IDS, MAX_DRILL_LEVEL, skillTiming } from "@/lib/heroes";
import { maxGoalsFor } from "@/lib/leaderboard/shared";

describe("career stages", () => {
  it("have unique ids and run in chronological order per hero", () => {
    expect(new Set(STAGES.map((s) => s.id)).size).toBe(STAGES.length);
    for (const hero of HERO_IDS) {
      const years = stagesFor(hero).map((s) => s.year);
      expect(years.length).toBeGreaterThanOrEqual(6);
      expect([...years].sort((a, b) => a - b)).toEqual(years);
    }
  });

  it("set objectives a single match can reach", () => {
    for (const s of STAGES) {
      expect(s.difficulty).toBeGreaterThanOrEqual(1);
      expect(s.difficulty).toBeLessThanOrEqual(5);
      const hardest = s.ballonDor ?? s.objective;
      expect(hardest.goals + hardest.assists).toBeLessThanOrEqual(maxGoalsFor(MATCH_SECONDS * 1000));
      if (s.ballonDor) {
        expect(s.ballonDor.goals).toBeGreaterThanOrEqual(s.objective.goals);
        expect(s.ballonDor.assists).toBeGreaterThanOrEqual(s.objective.assists);
      }
    }
  });

  it("awards the trophy for the objective and the Ballon d'Or for the excellence target", () => {
    const lusail = STAGES.find((s) => s.id === "lm10-2022-wc")!;
    expect(evaluateStage(lusail, 1, 1)).toEqual({ trophy: null, ballonDor: false });
    expect(evaluateStage(lusail, 2, 1)).toEqual({ trophy: "worldcup", ballonDor: false });
    expect(evaluateStage(lusail, 3, 2)).toEqual({ trophy: "worldcup", ballonDor: true });
  });
});

describe("hero attributes", () => {
  it("fade after 32 unless the longevity drills are done", () => {
    const young = effectiveStats("cr7", 28);
    const old = effectiveStats("cr7", 40);
    expect(old.pace).toBeLessThan(young.pace);
    expect(old.shooting).toBe(young.shooting);
    const trained = effectiveStats("cr7", 40, { recovery: MAX_DRILL_LEVEL });
    expect(trained.pace).toBeGreaterThan(old.pace);
  });

  it("apply drill boosts and stay within 40…99", () => {
    const s = effectiveStats("lm10", 25, { rondo: 5, cones: 5, freekick: 99 });
    expect(s.passing).toBe(Math.min(99, HEROES.lm10.base.passing + 10));
    for (const v of Object.values(s)) {
      expect(v).toBeGreaterThanOrEqual(40);
      expect(v).toBeLessThanOrEqual(99);
    }
  });

  it("give each hero a distinct identity", () => {
    expect(HEROES.cr7.base.heading).toBeGreaterThan(HEROES.lm10.base.heading);
    expect(HEROES.lm10.base.dribbling).toBeGreaterThan(HEROES.cr7.base.dribbling);
    const t = skillTiming("lm10", effectiveStats("lm10", 25), { vision: 5 });
    expect(t.durationMs).toBeGreaterThan(HEROES.lm10.skill.durationMs);
  });
});
