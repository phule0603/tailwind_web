import { describe, expect, it } from "vitest";
import { stagesFor } from "@/lib/career";
import { emptyPad, Match, PITCH, type MatchConfig, type MatchEvent, type Pad } from "@/lib/engine/match";
import { MIN_MS_PER_GOAL } from "@/lib/game-config";
import { checkMatch, checkRivalry } from "@/lib/leaderboard/shared";
import { careerConfig, pvpConfig, quickConfig } from "@/lib/setup";

/** Seeded PRNG so every simulated match is reproducible. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A greedy bot: run at goal, shoot inside 260, tackle the carrier, use the skill when ready. */
function bot(m: Match, team: 0 | 1, pad: Pad) {
  const hero = m.heroOf(team)!;
  const ball = m.ball;
  const gx = team === 0 ? PITCH.W : 0;
  pad.pass = false;
  pad.skill = hero.skillCd <= 0 && ball.owner === hero;
  if (ball.owner === hero) {
    const dx = gx - hero.x;
    const dy = PITCH.H / 2 - hero.y;
    const d = Math.hypot(dx, dy);
    pad.mx = dx / d;
    pad.my = dy / d;
    pad.shoot = d < 260 ? !pad.shoot || hero.charge < 0.7 : false;
  } else {
    const dx = ball.x - hero.x;
    const dy = ball.y - hero.y;
    const d = Math.hypot(dx, dy) || 1;
    pad.mx = dx / d;
    pad.my = dy / d;
    pad.shoot = false;
    if (ball.owner && ball.owner.team !== team && d < 30) pad.pass = true;
  }
}

function play(config: MatchConfig, seed: number) {
  const m = new Match(config, mulberry32(seed));
  const pads: [Pad, Pad] = [emptyPad(), emptyPad()];
  const events: MatchEvent[] = [];
  const goalTimes: number[] = [];
  for (let i = 0; i < 120 * (config.seconds + 10) && m.phase !== "fulltime"; i++) {
    bot(m, 0, pads[0]);
    if (config.mode === "pvp") bot(m, 1, pads[1]);
    m.step(1 / 120, pads);
    for (const e of m.drainEvents()) {
      events.push(e);
      if (e.kind === "goal") goalTimes.push(m.clock);
    }
  }
  return { m, events, goalTimes, summary: m.summary() };
}

describe("match engine", () => {
  it("plays career matches to full time and every result passes the server checks", () => {
    for (const hero of ["cr7", "lm10"] as const) {
      for (const stage of stagesFor(hero)) {
        const { m, summary, goalTimes } = play(careerConfig(stage, {}), stage.year);
        expect(m.phase).toBe("fulltime");
        expect(summary.durationMs).toBe(90_000);
        const line = summary.heroes[0];
        expect(line.hero).toBe(hero);
        expect(line.goals + line.assists).toBeLessThanOrEqual(summary.score[0]);
        expect(checkMatch({ goals: line.goals, assists: line.assists, durationMs: summary.durationMs })).toBeNull();
        // the opponents only defend in solo matches
        expect(summary.score[1]).toBe(0);
        for (let i = 1; i < goalTimes.length; i++) {
          expect((goalTimes[i] - goalTimes[i - 1]) * 1000).toBeGreaterThanOrEqual(MIN_MS_PER_GOAL);
        }
      }
    }
  });

  it("gets harder with the difficulty level", () => {
    const goals = (level: number) =>
      [1, 2, 3, 4, 5, 6].reduce((sum, seed) => sum + play(quickConfig("cr7", level, {}), seed).summary.score[0], 0);
    expect(goals(1)).toBeGreaterThan(goals(5));
  });

  it("plays PvP matches with two human sides", () => {
    for (const seed of [1, 2, 3]) {
      const { m, summary, events } = play(pvpConfig(seed % 2 ? "cr7" : "lm10", "Camp Nou"), seed);
      expect(m.phase).toBe("fulltime");
      expect(summary.heroes.map((h) => h.hero).sort()).toEqual(["cr7", "lm10"]);
      const side = (hero: string) => summary.heroes.find((h) => h.hero === hero)!;
      expect(
        checkRivalry({ token: "t", durationMs: summary.durationMs, cr7: side("cr7"), lm10: side("lm10") }),
      ).toBeNull();
      expect(events.some((e) => e.kind === "shot")).toBe(true);
    }
  });

  it("credits an assist when the hero's pass is scored", () => {
    const m = new Match(quickConfig("lm10", 1, {}), mulberry32(7));
    const hero = m.heroOf(0)!;
    const mate = m.team(0).find((b) => b.role === "mate")!;
    m.forcePhase("play");
    // clear the way: defenders far away, keeper out of position
    for (const b of m.team(1)) {
      b.x = 100;
      b.y = 40;
    }
    m.debugPlace(hero, 760, 340, true);
    m.debugPlace(mate, 960, 360, false);
    m.pass(hero, mate, { lead: 0 });
    const pads: [Pad, Pad] = [emptyPad(), emptyPad()];
    for (let i = 0; i < 240 && m.ball.owner !== mate; i++) m.step(1 / 120, pads);
    expect(m.ball.owner).toBe(mate);
    m.shoot(mate, 0.6, 0);
    for (let i = 0; i < 240 && m.phase === "play"; i++) m.step(1 / 120, pads);
    const goal = m.drainEvents().find((e) => e.kind === "goal");
    expect(goal).toMatchObject({ kind: "goal", team: 0, scorer: mate, assist: hero });
    expect(m.summary().heroes[0]).toMatchObject({ goals: 0, assists: 1 });
  });

  it("gives a penalty that the hero can score", () => {
    let scored = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const m = new Match(quickConfig("cr7", 1, {}), mulberry32(seed));
      const hero = m.heroOf(0)!;
      m.forcePhase("play");
      // a defender brings the hero down in the box until the referee gives it
      const def = m.team(1).find((b) => b.role === "def")!;
      for (let tries = 0; tries < 200 && m.phase !== "penalty"; tries++) {
        m.debugPlace(hero, 900, 340, true);
        def.x = 912;
        def.y = 340;
        def.tackleCd = 0;
        def.think = 0;
        def.stun = 0;
        m.step(1 / 120, [emptyPad(), emptyPad()]);
      }
      expect(m.phase).toBe("penalty");
      const pads: [Pad, Pad] = [emptyPad(), emptyPad()];
      for (let i = 0; i < 120 * 4 && m.phase !== "goal"; i++) {
        pads[0].shoot = i > 70 && i < 140;
        pads[0].my = -1;
        m.step(1 / 120, pads);
      }
      if (m.phase === "goal") {
        scored++;
        expect(m.lastGoal?.type).toBe("penalty");
      }
    }
    expect(scored).toBeGreaterThan(8);
  });
});
