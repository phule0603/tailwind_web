import type { Stage } from "@/lib/career";
import type { MatchConfig, TeamConfig } from "@/lib/engine/match";
import { MATCH_SECONDS, PVP_SECONDS } from "@/lib/game-config";
import { effectiveStats, HEROES, skillTiming, type HeroId, type TrainingLevels } from "@/lib/heroes";

/* Builds the match configuration for every mode. */

export const STADIUMS = ["Santiago Bernabéu", "Camp Nou", "Lusail Stadium", "Al-Awwal Park"] as const;

export const QUICK_OPPONENTS = [
  { name: "Atlético", kit: { shirt: "#dc2626", shorts: "#1e3a8a" } },
  { name: "Bayern", kit: { shirt: "#b91c1c", shorts: "#b91c1c" } },
  { name: "Liverpool", kit: { shirt: "#c8102e", shorts: "#c8102e" } },
  { name: "PSG", kit: { shirt: "#1e3a8a", shorts: "#1e3a8a" } },
  { name: "Juventus", kit: { shirt: "#f8fafc", shorts: "#111827" } },
  { name: "Brazil", kit: { shirt: "#facc15", shorts: "#1d4ed8" } },
];

export const QUICK_CLUB: Record<HeroId, string> = { cr7: "Real Madrid", lm10: "Barcelona" };

const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

function heroTeam(hero: HeroId, name: string, age: number, training: TrainingLevels, controller: "p1" | "p2", keeper: boolean): TeamConfig {
  const def = HEROES[hero];
  const stats = effectiveStats(hero, age, training);
  return {
    name,
    kit: { shirt: def.colors.shirt, shorts: def.colors.shorts },
    hero,
    heroStats: stats,
    skill: skillTiming(hero, stats, training),
    controller,
    mates: 2,
    keeper,
    level: 3,
  };
}

function defenders(name: string, kit: { shirt: string; shorts: string }, level: number): TeamConfig {
  return { name, kit, hero: null, controller: null, mates: 2 + level, keeper: true, clearOnly: true, level };
}

export function careerConfig(stage: Stage, training: TrainingLevels): MatchConfig {
  return {
    mode: "career",
    seconds: MATCH_SECONDS,
    stadium: stage.stadium,
    teams: [
      heroTeam(stage.hero, stage.club, stage.age, training, "p1", false),
      defenders(stage.opponent, stage.kit, stage.difficulty),
    ],
  };
}

export function quickConfig(hero: HeroId, level: number, training: TrainingLevels, age = 28): MatchConfig {
  const opp = pick(QUICK_OPPONENTS);
  return {
    mode: "quick",
    seconds: MATCH_SECONDS,
    stadium: pick(STADIUMS),
    teams: [heroTeam(hero, QUICK_CLUB[hero], age, training, "p1", false), defenders(opp.name, opp.kit, level)],
  };
}

/** PvP: P1 plays the left side (attacking right). */
export function pvpConfig(p1: HeroId, stadium: string = pick(STADIUMS)): MatchConfig {
  const p2: HeroId = p1 === "cr7" ? "lm10" : "cr7";
  const name = (h: HeroId) => (h === "cr7" ? "Team CR7" : "Team LM10");
  return {
    mode: "pvp",
    seconds: PVP_SECONDS,
    stadium,
    teams: [heroTeam(p1, name(p1), 28, {}, "p1", true), heroTeam(p2, name(p2), 28, {}, "p2", true)],
  };
}

/** The AI-vs-AI match playing behind the menus. */
export function attractConfig(): MatchConfig {
  const config = pvpConfig("lm10", "Lusail Stadium");
  config.mode = "quick";
  config.seconds = 600;
  for (const t of config.teams) t.controller = null;
  return config;
}
