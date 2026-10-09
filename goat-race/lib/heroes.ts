/* The two titans: base attributes, signature moves and their training tracks. */

export type HeroId = "cr7" | "lm10";
export const HERO_IDS: readonly HeroId[] = ["cr7", "lm10"];

export function isHeroId(value: unknown): value is HeroId {
  return value === "cr7" || value === "lm10";
}

export type StatKey = "pace" | "shooting" | "power" | "dribbling" | "passing" | "heading" | "stamina";

export type Stats = Record<StatKey, number>;

export interface Drill {
  id: string;
  name: string;
  description: string;
  /** stat bonus per level */
  boosts: Partial<Stats>;
  /** each level also slows the age decline by this fraction (CR7's longevity drills) */
  longevity?: number;
}

export interface HeroDef {
  id: HeroId;
  name: string;
  short: string;
  nickname: string;
  tagline: string;
  number: number;
  /** kit colours: shirt, shorts, trim */
  colors: { shirt: string; shorts: string; trim: string; skin: string; hair: string };
  accent: string;
  base: Stats;
  skill: { name: string; description: string; durationMs: number; cooldownMs: number };
  passive: string;
  celebration: { name: string; shout: string };
  drills: Drill[];
}

export const MAX_DRILL_LEVEL = 5;
/** Training points a drill level costs: level 1 costs 1, level 5 costs 5. */
export const drillCost = (nextLevel: number) => nextLevel;

export const HEROES: Record<HeroId, HeroDef> = {
  cr7: {
    id: "cr7",
    name: "Cristiano Ronaldo",
    short: "RONALDO",
    nickname: "THE MACHINE",
    tagline: "Thể lực · Kỷ luật · Tốc độ · Săn bàn",
    number: 7,
    colors: { shirt: "#f8fafc", shorts: "#f8fafc", trim: "#d4af37", skin: "#d6a77a", hair: "#1c1917" },
    accent: "#facc15",
    base: { pace: 91, shooting: 93, power: 96, dribbling: 85, passing: 80, heading: 96, stamina: 92 },
    skill: {
      name: "TURBO",
      description: "Bứt tốc 2,2 giây, tốc độ ×1,45 — không ai đuổi kịp.",
      durationMs: 2200,
      cooldownMs: 7000,
    },
    passive: "Knuckleball: sút xa căng hết lực bay vặn sườn, thủ môn khó đoán. Đánh đầu cực mạnh.",
    celebration: { name: "SIUUU", shout: "SIUUUUU!" },
    drills: [
      { id: "gym", name: "Phòng gym 5h sáng", description: "+Lực sút, +Đánh đầu", boosts: { power: 2, heading: 1 } },
      { id: "sprint", name: "Chạy nước rút", description: "+Tốc độ", boosts: { pace: 2 } },
      { id: "finishing", name: "Dứt điểm 1000 quả", description: "+Dứt điểm", boosts: { shooting: 2 } },
      {
        id: "recovery",
        name: "Bồn đá & ngủ 5 giấc",
        description: "+Thể lực, chống lão hoá (vượt mốc 40 tuổi)",
        boosts: { stamina: 2 },
        longevity: 0.18,
      },
    ],
  },
  lm10: {
    id: "lm10",
    name: "Lionel Messi",
    short: "MESSI",
    nickname: "THE MAGICIAN",
    tagline: "Nhãn quan · Rê bóng · Sáng tạo · Kiến tạo",
    number: 10,
    colors: { shirt: "#7dd3fc", shorts: "#0f172a", trim: "#f8fafc", skin: "#e0b48a", hair: "#3f2a1d" },
    accent: "#38bdf8",
    base: { pace: 86, shooting: 91, power: 82, dribbling: 98, passing: 94, heading: 70, stamina: 82 },
    skill: {
      name: "LA PAUSA",
      description: "Thời gian chậm lại 2,5 giây — chỉ Messi nhìn thấy khe hở.",
      durationMs: 2500,
      cooldownMs: 9000,
    },
    passive: "Chọc khe: đường chuyền dẫn trước bước chạy đồng đội. Cứa lòng cong vào góc xa. Đồng đội dứt điểm tốt hơn.",
    celebration: { name: "CHỈ TAY LÊN TRỜI", shout: "☝ ☝" },
    drills: [
      { id: "rondo", name: "Rondo La Masia", description: "+Chuyền bóng", boosts: { passing: 2 } },
      { id: "cones", name: "Rê bóng qua cọc", description: "+Rê bóng, +Tốc độ", boosts: { dribbling: 1, pace: 1 } },
      { id: "freekick", name: "Cứa lòng sút phạt", description: "+Dứt điểm, +Lực sút", boosts: { shooting: 2, power: 1 } },
      { id: "vision", name: "Đọc trận đấu", description: "+Thể lực, La Pausa dài hơn", boosts: { stamina: 2 }, longevity: 0.12 },
    ],
  },
};

export type TrainingLevels = Record<string, number>;

/**
 * Attributes at a given age with the training applied. Past 32 the physical
 * attributes fade 2 points a year; longevity drills slow that down.
 */
export function effectiveStats(hero: HeroId, age: number, training: TrainingLevels = {}): Stats {
  const def = HEROES[hero];
  const stats: Stats = { ...def.base };
  let longevity = 0;
  for (const drill of def.drills) {
    const level = Math.max(0, Math.min(MAX_DRILL_LEVEL, Math.floor(training[drill.id] ?? 0)));
    for (const [k, v] of Object.entries(drill.boosts) as [StatKey, number][]) stats[k] += v * level;
    longevity += (drill.longevity ?? 0) * level;
  }
  const years = Math.max(0, age - 32);
  const decline = years * 2 * Math.max(0.1, 1 - longevity);
  for (const k of ["pace", "stamina", "power"] as const) stats[k] -= decline;
  for (const k of Object.keys(stats) as StatKey[]) stats[k] = Math.round(Math.max(40, Math.min(99, stats[k])));
  return stats;
}

export const STAT_LABELS: Record<StatKey, string> = {
  pace: "Tốc độ",
  shooting: "Dứt điểm",
  power: "Lực sút",
  dribbling: "Rê bóng",
  passing: "Chuyền bóng",
  heading: "Đánh đầu",
  stamina: "Thể lực",
};

/** Signature-skill timing: stamina shortens the cooldown, the longevity drills stretch the effect. */
export function skillTiming(hero: HeroId, stats: Stats, training: TrainingLevels = {}) {
  const def = HEROES[hero];
  let longevity = 0;
  for (const drill of def.drills) longevity += (drill.longevity ?? 0) * (training[drill.id] ?? 0);
  return {
    durationMs: Math.round(def.skill.durationMs * (1 + longevity * 0.5)),
    cooldownMs: Math.round(def.skill.cooldownMs * (1.3 - stats.stamina * 0.004)),
  };
}
