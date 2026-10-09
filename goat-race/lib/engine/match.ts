import { CELEBRATION_MS } from "@/lib/game-config";
import { HEROES, type HeroId, type Stats } from "@/lib/heroes";

/*
 * Match simulation: a top-down arcade football match. Pure (no DOM), stepped at a
 * fixed rate by the hook, rendered by `render.ts`. Team 0 attacks to the right,
 * team 1 to the left. World units are decimetres: the pitch is 105 × 68 m.
 */

export const PITCH = {
  W: 1050,
  H: 680,
  GOAL_HALF: 37,
  GOAL_H: 24,
  BOX_DEPTH: 165,
  BOX_HALF: 202,
  SPOT: 110,
  R: 11,
  BALL_R: 5,
} as const;
const { W, H, GOAL_HALF, GOAL_H, BOX_DEPTH, BOX_HALF, SPOT, R, BALL_R } = PITCH;
const CY = H / 2;
const GRAVITY = 320;
const KICKOFF_S = 0.6;
const CELEBRATION_S = CELEBRATION_MS / 1000;

/* =============================================================================
 * Types
 * ========================================================================== */

export type Mode = "career" | "quick" | "pvp";
export type Controller = "p1" | "p2" | null;
export type TeamIndex = 0 | 1;
export type Role = "hero" | "mate" | "def" | "gk";

export type ShotType =
  | "header"
  | "penalty"
  | "tapin"
  | "longrange"
  | "knuckle"
  | "finesse"
  | "solo"
  | "normal";

export interface TeamConfig {
  name: string;
  kit: { shirt: string; shorts: string };
  hero: HeroId | null;
  heroStats?: Stats;
  skill?: { durationMs: number; cooldownMs: number };
  controller: Controller;
  /** outfield AI players besides the hero */
  mates: number;
  keeper: boolean;
  /** solo opponents only defend: they clear every ball they win */
  clearOnly?: boolean;
  /** 1 … 5: pace, tackling and keeper reflexes of the AI */
  level: number;
}

export interface MatchConfig {
  mode: Mode;
  seconds: number;
  stadium: string;
  teams: [TeamConfig, TeamConfig];
}

/** One player's controls. `pass` and `skill` are edge-triggered and consumed by the engine. */
export interface Pad {
  mx: number;
  my: number;
  shoot: boolean;
  pass: boolean;
  skill: boolean;
}

export const emptyPad = (): Pad => ({ mx: 0, my: 0, shoot: false, pass: false, skill: false });

export interface Body {
  id: number;
  team: TeamIndex;
  role: Role;
  hero: HeroId | null;
  controller: Controller;
  name: string;
  number: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** desired velocity (AI steering or the stick) */
  tvx: number;
  tvy: number;
  face: number;
  speed: number;
  dribbling: number;
  passing: number;
  shooting: number;
  power: number;
  heading: number;
  tackling: number;
  reflex: number;
  homeX: number;
  homeY: number;
  lane: number;
  stun: number;
  tackleCd: number;
  kickCd: number;
  holdT: number;
  think: number;
  charge: number;
  charging: boolean;
  skillT: number;
  skillCd: number;
  skillMax: number;
  skillCdMax: number;
  assistFrom: Body | null;
  assistAt: number;
  dribbleDist: number;
  /** defenders beaten on this run with the ball */
  beaten: number;
  celebrate: number;
  /** keeper: where the dive is heading, and when it may start */
  diveY: number | null;
  diveAt: number;
  /** a teammate asked this AI player for the ball back (one-two) */
  wantsReturn: boolean;
  /** run animation phase */
  stride: number;
}

export interface Shot {
  by: Body;
  type: ShotType;
  tried: Set<number>;
  /** already counted as on target */
  counted: boolean;
}

export interface Ball {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  owner: Body | null;
  last: Body | null;
  passer: Body | null;
  passAt: number;
  shot: Shot | null;
  curve: number;
  wobble: number;
  spin: number;
}

export interface HeroLine {
  hero: HeroId;
  team: TeamIndex;
  goals: number;
  assists: number;
  shots: number;
  onTarget: number;
  dribbles: number;
  tackles: number;
  types: Partial<Record<ShotType, number>>;
}

export type MatchEvent =
  | { kind: "kickoff"; team: TeamIndex }
  | { kind: "kick"; power: number }
  | { kind: "shot"; by: Body; type: ShotType }
  | { kind: "goal"; team: TeamIndex; scorer: Body | null; assist: Body | null; type: ShotType; ownGoal: boolean }
  | { kind: "save"; keeper: Body; by: Body | null; caught: boolean }
  | { kind: "woodwork"; by: Body | null }
  | { kind: "miss"; by: Body | null }
  | { kind: "tackle"; by: Body; on: Body }
  | { kind: "dribble"; by: Body; past: Body }
  | { kind: "foul"; on: Body }
  | { kind: "penalty"; taker: Body }
  | { kind: "corner"; team: TeamIndex }
  | { kind: "skill"; by: Body }
  | { kind: "assist"; by: Body }
  | { kind: "fulltime" };

export type Phase = "kickoff" | "play" | "goal" | "penalty" | "corner" | "fulltime";

export interface MatchSummary {
  score: [number, number];
  durationMs: number;
  heroes: HeroLine[];
}

/* =============================================================================
 * Helpers
 * ========================================================================== */

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
/** direction a team attacks in */
export const attackDir = (team: TeamIndex) => (team === 0 ? 1 : -1);
/** x of the goal a team attacks */
export const targetGoalX = (team: TeamIndex) => (team === 0 ? W : 0);
const ownGoalX = (team: TeamIndex) => (team === 0 ? 0 : W);
const other = (team: TeamIndex): TeamIndex => (team === 0 ? 1 : 0);

/** true when (x, y) is inside the penalty box a team attacks */
export function inAttackingBox(team: TeamIndex, x: number, y: number) {
  const gx = targetGoalX(team);
  return Math.abs(x - gx) <= BOX_DEPTH && Math.abs(y - CY) <= BOX_HALF;
}

/* =============================================================================
 * Match
 * ========================================================================== */

export class Match {
  readonly config: MatchConfig;
  readonly bodies: Body[] = [];
  readonly ball: Ball;
  readonly heroes: HeroLine[] = [];
  score: [number, number] = [0, 0];
  /** game clock, seconds */
  clock = 0;
  phase: Phase = "kickoff";
  phaseT = 0;
  /** world time scale (La Pausa slows everyone but Messi) */
  slowMo = 0;
  events: MatchEvent[] = [];
  lastGoal: Extract<MatchEvent, { kind: "goal" }> | null = null;
  private kickoffTeam: TeamIndex = 0;
  private penaltyTaker: Body | null = null;
  private cornerTaker: Body | null = null;
  private nextId = 1;
  private prevShoot: [boolean, boolean] = [false, false];

  constructor(
    config: MatchConfig,
    private readonly rng: () => number = Math.random,
  ) {
    this.config = config;
    this.ball = {
      x: W / 2,
      y: CY,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      owner: null,
      last: null,
      passer: null,
      passAt: 0,
      shot: null,
      curve: 0,
      wobble: 0,
      spin: 0,
    };
    config.teams.forEach((tc, i) => this.buildTeam(i as TeamIndex, tc));
    this.resetKickoff(0);
  }

  /* ------------------------------------------------------------- setup */

  private makeBody(team: TeamIndex, role: Role, extra: Partial<Body>): Body {
    const level = this.config.teams[team].level;
    const b: Body = {
      id: this.nextId++,
      team,
      role,
      hero: null,
      controller: null,
      name: "",
      number: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      tvx: 0,
      tvy: 0,
      face: team === 0 ? 0 : Math.PI,
      speed: 230,
      dribbling: 65,
      passing: 65,
      shooting: 60,
      power: 65,
      heading: 60,
      tackling: 0.3 + level * 0.07,
      reflex: 55 + level * 8,
      homeX: 0,
      homeY: CY,
      lane: CY,
      stun: 0,
      tackleCd: 0,
      kickCd: 0,
      holdT: 0,
      think: this.rng() * 0.2,
      charge: 0,
      charging: false,
      skillT: 0,
      skillCd: 0,
      skillMax: 0,
      skillCdMax: 0,
      assistFrom: null,
      assistAt: 0,
      dribbleDist: 0,
      beaten: 0,
      celebrate: 0,
      diveY: null,
      diveAt: 0,
      wantsReturn: false,
      stride: this.rng() * 10,
      ...extra,
    };
    this.bodies.push(b);
    return b;
  }

  private buildTeam(team: TeamIndex, tc: TeamConfig) {
    const d = attackDir(team);
    const heroDef = tc.hero ? HEROES[tc.hero] : null;
    if (tc.hero && heroDef) {
      const s = tc.heroStats ?? heroDef.base;
      const heroBody = this.makeBody(team, "hero", {
        hero: tc.hero,
        controller: tc.controller,
        name: heroDef.short,
        number: heroDef.number,
        speed: 165 + s.pace * 1.45,
        dribbling: s.dribbling,
        passing: s.passing,
        shooting: s.shooting,
        power: s.power,
        heading: s.heading,
        tackling: 0.25 + (s.pace + s.power) / 600,
        skillMax: (tc.skill?.durationMs ?? heroDef.skill.durationMs) / 1000,
        skillCdMax: (tc.skill?.cooldownMs ?? heroDef.skill.cooldownMs) / 1000,
      });
      this.heroes.push({
        hero: tc.hero,
        team,
        goals: 0,
        assists: 0,
        shots: 0,
        onTarget: 0,
        dribbles: 0,
        tackles: 0,
        types: {},
      });
      heroBody.homeX = W / 2 - d * 40;
    }
    // Messi makes the players around him better
    const mateBoost = tc.hero === "lm10" ? 10 : 0;
    const lanes = [CY - 170, CY + 170, CY];
    for (let i = 0; i < tc.mates; i++) {
      const lane = lanes[i % lanes.length];
      if (tc.clearOnly) {
        this.makeBody(team, "def", {
          name: tc.name,
          number: 2 + i,
          speed: 196 + tc.level * 15,
          dribbling: 55,
          passing: 55,
          shooting: 50,
        });
      } else {
        this.makeBody(team, "mate", {
          name: "",
          number: [9, 11, 8, 19][i % 4],
          lane,
          speed: 250 + tc.level * 6,
          dribbling: 70 + mateBoost * 0.5,
          passing: 74 + mateBoost * 0.5,
          shooting: 70 + mateBoost,
          power: 72,
          heading: 72 + mateBoost * 0.5,
          homeX: W / 2 - d * 110,
          homeY: lane,
        });
      }
    }
    if (tc.keeper) {
      this.makeBody(team, "gk", { name: "GK", number: 1, speed: 210, passing: 60, reflex: tc.clearOnly ? 55 + tc.level * 8 : 80 });
    }
    // defensive shape for defend-only teams: a back line plus a screen in front
    const defs = this.bodies.filter((b) => b.team === team && b.role === "def");
    const back = Math.min(defs.length, 4);
    defs.forEach((b, i) => {
      const goal = ownGoalX(team);
      if (i < back) {
        b.homeX = goal + (team === 1 ? -130 : 130);
        b.homeY = CY + ((i + 0.5) / back - 0.5) * 380;
      } else {
        const j = i - back;
        const n = defs.length - back;
        b.homeX = goal + (team === 1 ? -270 : 270);
        b.homeY = CY + ((j + 0.5) / n - 0.5) * 300;
      }
    });
  }

  team(team: TeamIndex) {
    return this.bodies.filter((b) => b.team === team);
  }

  heroOf(team: TeamIndex) {
    return this.bodies.find((b) => b.team === team && b.role === "hero") ?? null;
  }

  lineOf(body: Body | null) {
    return body?.hero ? this.heroes.find((h) => h.hero === body.hero && h.team === body.team) ?? null : null;
  }

  private emit(e: MatchEvent) {
    this.events.push(e);
  }

  drainEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }

  private placeAll() {
    for (const b of this.bodies) {
      const d = attackDir(b.team);
      const back = ownGoalX(b.team);
      switch (b.role) {
        case "gk":
          b.x = back + d * 16;
          b.y = CY;
          break;
        case "def":
          b.x = b.homeX;
          b.y = b.homeY;
          break;
        case "hero":
          b.x = W / 2 - d * 60;
          b.y = CY;
          break;
        case "mate":
          b.x = W / 2 - d * 110;
          b.y = b.lane;
          break;
      }
      b.vx = b.vy = 0;
      b.face = d > 0 ? 0 : Math.PI;
      b.stun = b.charge = 0;
      b.charging = false;
      b.celebrate = 0;
      b.diveY = null;
      b.wantsReturn = false;
    }
  }

  private resetKickoff(team: TeamIndex) {
    this.placeAll();
    this.kickoffTeam = team;
    const taker = this.heroOf(team) ?? this.team(team).find((b) => b.role === "mate") ?? null;
    if (taker) {
      taker.x = W / 2 - attackDir(team) * 12;
      taker.y = CY;
    }
    this.resetBall(W / 2, CY);
    if (taker) this.giveBall(taker);
    this.phase = "kickoff";
    this.phaseT = 0;
    this.emit({ kind: "kickoff", team });
  }

  private resetBall(x: number, y: number) {
    const b = this.ball;
    Object.assign(b, { x, y, z: 0, vx: 0, vy: 0, vz: 0, owner: null, shot: null, curve: 0, wobble: 0, spin: 0 });
  }

  private giveBall(body: Body) {
    const ball = this.ball;
    const prev = ball.last;
    if (prev && prev.team !== body.team) {
      // possession changed: the attack that was building is over
      for (const b of this.bodies) b.assistFrom = null;
      ball.passer = null;
    } else if (ball.passer && ball.passer !== body && ball.passer.team === body.team) {
      body.assistFrom = ball.passer;
      body.assistAt = this.clock;
    }
    ball.owner = body;
    ball.last = body;
    ball.passer = null;
    ball.shot = null;
    ball.curve = ball.wobble = 0;
    ball.z = ball.vz = 0;
    body.holdT = 0;
    body.dribbleDist = 0;
    body.beaten = 0;
    body.wantsReturn = false;
    if (body.role === "gk") body.face = body.team === 0 ? 0 : Math.PI;
  }

  /* -------------------------------------------------------------- step */

  step(dt: number, pads: [Pad, Pad]) {
    if (this.phase === "fulltime") return;
    this.clock += dt;
    this.phaseT += dt;

    const slow = this.slowMo > 0;
    if (slow) this.slowMo -= dt;
    const worldDt = slow ? dt * 0.4 : dt;

    if (this.phase === "goal") {
      for (const b of this.bodies) b.celebrate = Math.max(0, b.celebrate - dt);
      this.moveBodies(dt, true);
      this.stepBall(dt);
      if (this.phaseT >= CELEBRATION_S) {
        if (this.clock >= this.config.seconds) return this.finish();
        this.resetKickoff(this.config.mode === "pvp" ? other(this.lastGoal?.team ?? 1) : 0);
      }
      return;
    }

    if (this.phase === "kickoff") {
      this.consumePads(pads);
      if (this.phaseT >= KICKOFF_S) {
        this.phase = "play";
        this.phaseT = 0;
      }
      return;
    }

    if (this.phase === "corner") {
      this.consumePads(pads);
      if (this.phaseT >= 1.1 && this.cornerTaker) this.takeCorner(this.cornerTaker);
      return;
    }

    if (this.phase === "penalty") {
      this.stepPenalty(dt, pads);
      return;
    }

    // ---- play
    this.handleHumans(dt, pads);
    this.thinkAI(worldDt);
    for (const b of this.bodies) {
      const own = b.hero === "lm10" && this.slowMo > 0 && b.skillT > 0;
      this.timers(b, own ? dt : worldDt);
    }
    this.moveBodies(worldDt, false, dt);
    this.stepBall(this.ball.owner?.hero === "lm10" && slow ? dt : worldDt);
    this.checkPickups();
    if (this.clock >= this.config.seconds && this.phase === "play") this.finish();
  }

  private timers(b: Body, dt: number) {
    b.stun = Math.max(0, b.stun - dt);
    b.tackleCd = Math.max(0, b.tackleCd - dt);
    b.kickCd = Math.max(0, b.kickCd - dt);
    b.skillCd = Math.max(0, b.skillCd - dt);
    b.skillT = Math.max(0, b.skillT - dt);
    b.think -= dt;
    if (this.ball.owner === b) b.holdT += dt;
  }

  private finish() {
    this.phase = "fulltime";
    this.phaseT = 0;
    this.emit({ kind: "fulltime" });
  }

  summary(): MatchSummary {
    return {
      score: [...this.score] as [number, number],
      durationMs: Math.round(Math.min(this.clock, this.config.seconds) * 1000),
      heroes: this.heroes.map((h) => ({ ...h, types: { ...h.types } })),
    };
  }

  /* ------------------------------------------------------------ humans */

  private consumePads(pads: [Pad, Pad]) {
    for (const p of pads) p.pass = p.skill = false;
    this.prevShoot = [pads[0].shoot, pads[1].shoot];
  }

  private padFor(b: Body, pads: [Pad, Pad]) {
    return b.controller === "p1" ? pads[0] : b.controller === "p2" ? pads[1] : null;
  }

  private handleHumans(dt: number, pads: [Pad, Pad]) {
    for (const b of this.bodies) {
      const pad = this.padFor(b, pads);
      if (!pad) continue;
      const idx = b.controller === "p1" ? 0 : 1;
      const wasShoot = this.prevShoot[idx];
      const ball = this.ball;
      const hasBall = ball.owner === b;
      this.setStick(b, pad.mx, pad.my);

      // skill
      if (pad.skill && b.skillCd <= 0 && b.hero) {
        b.skillT = b.skillMax;
        b.skillCd = b.skillCdMax + b.skillMax;
        if (b.hero === "lm10") this.slowMo = b.skillMax;
        this.emit({ kind: "skill", by: b });
      }

      if (hasBall) {
        if (pad.shoot) {
          b.charging = true;
          b.charge = Math.min(1, b.charge + dt / 0.75);
        } else if (wasShoot && b.charging) {
          this.shoot(b, b.charge, pad.my);
        }
        if (pad.pass) this.humanPass(b, pad);
      } else {
        b.charging = false;
        b.charge = 0;
        const carrier = ball.owner;
        const pressed = pad.pass || (pad.shoot && !wasShoot);
        if (carrier && carrier.team === b.team && carrier !== b) {
          // ask the teammate: pass = give it back (one-two), shoot = cross or shoot
          if (pad.pass) carrier.wantsReturn = true;
          if (pad.shoot && !wasShoot) this.mateShootOrCross(carrier, b);
        } else if (carrier && carrier.team !== b.team && pressed) {
          this.tryTackle(b, carrier);
        } else if (!carrier && pad.shoot && !wasShoot && ball.z > 6 && dist(b.x, b.y, ball.x, ball.y) < R + 22) {
          this.header(b);
        } else if (!carrier && pressed && dist(b.x, b.y, ball.x, ball.y) < R + 18 && ball.z < 10) {
          // first-time strike on a loose ball
          this.giveBall(b);
          this.shoot(b, 0.55, pad.my);
        }
      }
      pad.pass = false;
      pad.skill = false;
      this.prevShoot[idx] = pad.shoot;
    }
  }

  private humanPass(b: Body, pad: Pad) {
    const mates = this.team(b.team).filter((m) => m !== b && m.role !== "gk");
    if (!mates.length) return;
    const d = attackDir(b.team);
    const hasDir = Math.hypot(pad.mx, pad.my) > 0.3;
    const dirX = hasDir ? pad.mx : d;
    const dirY = hasDir ? pad.my : 0;
    const len = Math.hypot(dirX, dirY) || 1;
    let best: Body | null = null;
    let bestScore = -Infinity;
    for (const m of mates) {
      const dx = m.x - b.x;
      const dy = m.y - b.y;
      const dd = Math.hypot(dx, dy) || 1;
      const align = (dx * dirX + dy * dirY) / (dd * len);
      const open = this.nearestOpponentDist(m);
      const score = align * 2 - dd / 500 + Math.min(open, 120) / 120 + (dx * d > 0 ? 0.3 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    }
    if (best) this.pass(b, best);
  }

  /* -------------------------------------------------------------- kicks */

  private nearestOpponentDist(b: Body) {
    let min = Infinity;
    for (const o of this.bodies) if (o.team !== b.team) min = Math.min(min, dist(o.x, o.y, b.x, b.y));
    return min;
  }

  private release(b: Body) {
    const ball = this.ball;
    ball.owner = null;
    ball.last = b;
    b.kickCd = 0.3;
    b.charging = false;
    b.charge = 0;
    b.holdT = 0;
    ball.x = b.x + Math.cos(b.face) * (R + BALL_R + 1);
    ball.y = b.y + Math.sin(b.face) * (R + BALL_R + 1);
  }

  /** Pass to a teammate. Messi (and his through balls) lead the receiver's run. */
  pass(from: Body, to: Body, opts: { lofted?: boolean; lead?: number } = {}) {
    const ball = this.ball;
    const visionary = from.hero === "lm10";
    const d0 = dist(from.x, from.y, to.x, to.y);
    const lead = opts.lead ?? (visionary ? 0.55 : 0.25);
    const t = d0 / 520 + 0.1;
    const fwd = attackDir(to.team) * (visionary ? 45 : 15);
    let tx = clamp(to.x + to.vx * t * lead * 2 + fwd, 20, W - 20);
    let ty = clamp(to.y + to.vy * t * lead * 2, 20, H - 20);
    const err = ((100 - from.passing) / 100) * 0.12;
    const ang = Math.atan2(ty - from.y, tx - from.x) + (this.rng() - 0.5) * 2 * err;
    const dd = dist(from.x, from.y, tx, ty);
    tx = from.x + Math.cos(ang) * dd;
    ty = from.y + Math.sin(ang) * dd;

    this.release(from);
    const lofted = opts.lofted ?? dd > 420;
    ball.passer = from;
    ball.passAt = this.clock;
    ball.shot = null;
    if (lofted) {
      const speed = clamp(dd * 1.05, 300, 640);
      const time = dd / speed;
      ball.vx = Math.cos(ang) * speed;
      ball.vy = Math.sin(ang) * speed;
      ball.vz = (GRAVITY * time) / 2;
      ball.z = 1;
    } else {
      // rolling friction k: speed to cover dd with some pace left on arrival
      const speed = clamp(dd * 1.15 + 220, 280, 820);
      ball.vx = Math.cos(ang) * speed;
      ball.vy = Math.sin(ang) * speed;
      ball.vz = 0;
    }
    this.emit({ kind: "kick", power: 0.4 });
  }

  /** Strike at goal. `aim` (-1 … 1) is the vertical stick: near/far post. */
  shoot(b: Body, charge: number, aim: number, forced?: ShotType) {
    const ball = this.ball;
    const d = attackDir(b.team);
    const gx = targetGoalX(b.team);
    const distGoal = dist(b.x, b.y, gx, CY);
    const side = Math.abs(aim) > 0.25 ? Math.sign(aim) : b.y < CY ? 1 : -1;
    let aimY = CY + side * (GOAL_HALF - 9);
    if (forced === "penalty") aimY = CY + (Math.abs(aim) > 0.25 ? Math.sign(aim) * (GOAL_HALF - 8) : 0);

    const skillErr = (100 - b.shooting) * 0.32 + distGoal * 0.025 + (charge < 0.2 ? 8 : 0);
    aimY += this.gauss() * skillErr;
    let type: ShotType = forced ?? "normal";
    if (!forced) {
      if (b.beaten >= 2 && b.dribbleDist > 300 && b.role === "hero") type = "solo";
      else if (distGoal < 120) type = "tapin";
      else if (distGoal > 260 && b.hero === "cr7" && charge > 0.8) type = "knuckle";
      else if (b.hero === "lm10" && charge > 0.25 && charge < 0.85 && distGoal < 300) type = "finesse";
      else if (distGoal > 260) type = "longrange";
    }

    const speed =
      (380 + b.power * 4.3 * (0.35 + 0.65 * charge)) * (type === "knuckle" ? 1.18 : 1) * (type === "finesse" ? 0.9 : 1);
    let ang = Math.atan2(aimY - b.y, gx + d * 6 - b.x);
    let curve = 0;
    if (type === "finesse") {
      // aim outside the post and let it bend back in
      const bend = -side * 0.16;
      ang += bend;
      curve = -bend * speed * 2.6;
    }
    const time = Math.max(0.08, Math.abs(gx - b.x) / Math.max(120, Math.abs(Math.cos(ang) * speed)));
    let h = 3 + charge * 14 + Math.abs(this.gauss()) * (100 - b.shooting) * 0.12;
    if (charge > 0.93) h += ((charge - 0.93) / 0.07) * 9; // leaning back: it can fly over
    if (type === "tapin") h = Math.min(h, 8);

    this.release(b);
    ball.passer = null;
    ball.vx = Math.cos(ang) * speed;
    ball.vy = Math.sin(ang) * speed;
    ball.vz = (h + 0.5 * GRAVITY * time * time) / time;
    ball.z = 1;
    ball.curve = curve;
    ball.wobble = type === "knuckle" ? 1 : 0;
    ball.shot = { by: b, type, tried: new Set(), counted: false };
    const line = this.lineOf(b);
    if (line) line.shots++;
    this.emit({ kind: "kick", power: 0.6 + charge * 0.4 });
    this.emit({ kind: "shot", by: b, type });
  }

  /** Redirect a ball in the air towards goal. */
  private header(b: Body) {
    const ball = this.ball;
    const gx = targetGoalX(b.team);
    const aimY = CY + (this.rng() < 0.5 ? -1 : 1) * (GOAL_HALF - 10) + this.gauss() * (100 - b.heading) * 0.35;
    const speed = 380 + b.heading * 3.6;
    const ang = Math.atan2(aimY - b.y, gx - b.x);
    ball.owner = null;
    ball.last = b;
    ball.x = b.x;
    ball.y = b.y;
    ball.z = 16;
    ball.vx = Math.cos(ang) * speed;
    ball.vy = Math.sin(ang) * speed;
    ball.vz = -20;
    ball.curve = ball.wobble = 0;
    if (ball.passer && ball.passer.team === b.team && ball.passer !== b) {
      b.assistFrom = ball.passer;
      b.assistAt = this.clock;
    }
    ball.passer = null;
    ball.shot = { by: b, type: "header", tried: new Set(), counted: false };
    b.kickCd = 0.3;
    b.celebrate = 0.35; // the jump
    const line = this.lineOf(b);
    if (line) line.shots++;
    this.emit({ kind: "kick", power: 0.7 });
    this.emit({ kind: "shot", by: b, type: "header" });
  }

  private mateShootOrCross(carrier: Body, hero: Body) {
    if (carrier.controller) return;
    if (inAttackingBox(hero.team, hero.x, hero.y) && !inAttackingBox(carrier.team, carrier.x, carrier.y)) {
      this.pass(carrier, hero, { lofted: true, lead: 0.2 });
    } else {
      this.shoot(carrier, 0.7, 0);
    }
  }

  private tryTackle(tackler: Body, carrier: Body) {
    if (tackler.tackleCd > 0 || tackler.stun > 0) return;
    if (dist(tackler.x, tackler.y, carrier.x, carrier.y) > R * 2 + 12) {
      tackler.tackleCd = 0.25;
      return;
    }
    tackler.tackleCd = 0.9;
    const pausa = carrier.hero === "lm10" && carrier.skillT > 0 ? 0.45 : 0;
    const turbo = carrier.hero === "cr7" && carrier.skillT > 0 ? 0.15 : 0;
    const evade = (carrier.dribbling / 100) * 0.55 + pausa + turbo;
    const p = clamp(tackler.tackling - evade + 0.35, 0.04, 0.92);
    if (this.rng() < p) {
      const line = this.lineOf(tackler);
      if (line) line.tackles++;
      // AI tackles on a hero inside the box can give away a penalty
      const box = inAttackingBox(carrier.team, carrier.x, carrier.y);
      if (box && carrier.role === "hero" && !tackler.controller && this.rng() < 0.24) {
        this.emit({ kind: "foul", on: carrier });
        this.startPenalty(carrier);
        return;
      }
      this.emit({ kind: "tackle", by: tackler, on: carrier });
      if (this.rng() < 0.55) {
        this.giveBall(tackler);
      } else {
        // poked loose
        const ball = this.ball;
        ball.owner = null;
        ball.last = tackler;
        ball.passer = null;
        const a = Math.atan2(carrier.y - tackler.y, carrier.x - tackler.x) + (this.rng() - 0.5) * 1.6;
        ball.vx = Math.cos(a) * 220;
        ball.vy = Math.sin(a) * 220;
        carrier.kickCd = 0.35;
      }
      carrier.stun = 0.3;
    } else {
      tackler.stun = 0.5;
      carrier.beaten++;
      const line = this.lineOf(carrier);
      if (line) line.dribbles++;
      this.emit({ kind: "dribble", by: carrier, past: tackler });
    }
  }

  /* ------------------------------------------------------------ penalty */

  private startPenalty(taker: Body) {
    this.phase = "penalty";
    this.phaseT = 0;
    this.penaltyTaker = taker;
    const team = taker.team;
    const d = attackDir(team);
    const gx = targetGoalX(team);
    for (const b of this.bodies) {
      b.vx = b.vy = 0;
      b.stun = 0;
      b.charging = false;
      b.charge = 0;
      if (b.role === "gk" && b.team !== team) {
        b.x = gx - d * 8;
        b.y = CY;
        b.diveY = null;
      } else if (b !== taker) {
        b.x = clamp(gx - d * (BOX_DEPTH + 40 + this.rng() * 80), 30, W - 30);
        b.y = clamp(b.y, 60, H - 60);
      }
    }
    taker.x = gx - d * (SPOT + 16);
    taker.y = CY;
    taker.face = d > 0 ? 0 : Math.PI;
    this.resetBall(gx - d * SPOT, CY);
    this.emit({ kind: "penalty", taker });
  }

  private stepPenalty(dt: number, pads: [Pad, Pad]) {
    const taker = this.penaltyTaker;
    if (!taker) {
      this.phase = "play";
      return;
    }
    const pad = this.padFor(taker, pads);
    const idx = taker.controller === "p1" ? 0 : 1;
    let kick = false;
    let aim = 0;
    let charge = 0.6;
    if (pad) {
      if (pad.shoot && this.phaseT > 0.5) {
        taker.charging = true;
        taker.charge = Math.min(1, taker.charge + dt / 0.75);
      } else if (this.prevShoot[idx] && taker.charging) {
        kick = true;
        aim = pad.my;
        charge = taker.charge;
      }
      this.prevShoot[idx] = pad.shoot;
      pad.pass = pad.skill = false;
      if (this.phaseT > 8 && !kick) kick = true;
    } else if (this.phaseT > 1.4) {
      kick = true;
      aim = [-1, 0, 1][Math.floor(this.rng() * 3)];
    }
    // the other side's pad is idle during a penalty
    for (const p of pads) if (p !== pad) p.pass = p.skill = false;
    if (!kick) return;

    // the keeper guesses
    const keeper = this.bodies.find((b) => b.role === "gk" && b.team !== taker.team);
    const ball = this.ball;
    const d = attackDir(taker.team);
    taker.x = ball.x - d * (R + BALL_R + 1);
    taker.y = ball.y;
    this.giveBall(taker);
    this.shoot(taker, charge, aim, "penalty");
    if (keeper) {
      const guess = this.rng();
      keeper.diveY = CY + (guess < 0.4 ? -1 : guess < 0.6 ? 0 : 1) * (GOAL_HALF - 8);
      keeper.diveAt = this.clock + 0.05;
    }
    this.penaltyTaker = null;
    this.phase = "play";
    this.phaseT = 0;
  }

  /* ------------------------------------------------------------- corner */

  private startCorner(team: TeamIndex, nearY: number) {
    const takers = this.team(team).filter((b) => b.role === "mate" && !b.controller);
    if (!takers.length) {
      this.goalKick(other(team));
      return;
    }
    this.phase = "corner";
    this.phaseT = 0;
    const d = attackDir(team);
    const gx = targetGoalX(team);
    const cy = nearY < CY ? 4 : H - 4;
    const taker = takers[0];
    for (const b of this.bodies) {
      b.vx = b.vy = 0;
      b.stun = 0;
      if (b === taker || b.role === "gk") continue;
      if (b.team === team) {
        b.x = gx - d * (60 + this.rng() * 90);
        b.y = CY + (this.rng() - 0.5) * 200;
      } else {
        b.x = gx - d * (30 + this.rng() * 110);
        b.y = CY + (this.rng() - 0.5) * 240;
      }
    }
    taker.x = gx - d * 6;
    taker.y = cy + (cy < CY ? -6 : 6);
    this.resetBall(gx - d * 4, cy);
    this.giveBall(taker);
    taker.face = Math.atan2(CY - taker.y, -d * 40);
    this.cornerTaker = taker;
    this.emit({ kind: "corner", team });
  }

  private takeCorner(taker: Body) {
    this.cornerTaker = null;
    this.phase = "play";
    this.phaseT = 0;
    const hero = this.heroOf(taker.team);
    const target =
      hero ??
      this.team(taker.team)
        .filter((b) => b !== taker && b.role !== "gk")
        .sort((a, b) => Math.abs(a.y - CY) - Math.abs(b.y - CY))[0];
    if (target) this.pass(taker, target, { lofted: true, lead: 0 });
  }

  private goalKick(team: TeamIndex) {
    const keeper = this.team(team).find((b) => b.role === "gk");
    const taker =
      keeper ??
      this.team(team)
        .filter((b) => b.role !== "hero" || !b.controller)
        .sort((a, b) => Math.abs(a.x - ownGoalX(team)) - Math.abs(b.x - ownGoalX(team)))[0] ??
      this.team(team)[0];
    if (!taker) return;
    const d = attackDir(team);
    taker.x = ownGoalX(team) + d * 50;
    taker.y = CY;
    this.resetBall(taker.x + d * (R + BALL_R + 1), CY);
    this.giveBall(taker);
    taker.holdT = -0.4;
  }

  /* ------------------------------------------------------------------ AI */

  private thinkAI(dt: number) {
    const ball = this.ball;
    const carrier = ball.owner;
    // the chaser of a loose ball: closest outfield AI per team
    const chasers = new Set<Body>();
    if (!carrier) {
      for (const team of [0, 1] as TeamIndex[]) {
        let best: Body | null = null;
        let bestT = Infinity;
        for (const b of this.team(team)) {
          if (b.role === "gk" || b.controller) continue;
          const t = dist(b.x, b.y, ball.x + ball.vx * 0.25, ball.y + ball.vy * 0.25) / b.speed;
          if (t < bestT) {
            bestT = t;
            best = b;
          }
        }
        if (best) chasers.add(best);
      }
    }

    // defend-only teams: pressers and man-markers
    const marks = new Map<Body, Body>();
    const pressers = new Set<Body>();
    if (carrier) {
      const defenders = this.team(other(carrier.team)).filter((b) => b.role === "def" || b.role === "mate");
      const byDist = [...defenders]
        .filter((b) => !b.controller)
        .sort((a, b) => dist(a.x, a.y, carrier.x, carrier.y) - dist(b.x, b.y, carrier.x, carrier.y));
      const level = this.config.teams[other(carrier.team)].level;
      const nPress = level >= 4 && byDist.length > 3 ? 2 : 1;
      byDist.slice(0, nPress).forEach((b) => pressers.add(b));
      const free = byDist.filter((b) => !pressers.has(b) && b.role === "def");
      const attackers = this.team(carrier.team).filter((b) => b !== carrier && b.role !== "gk");
      for (const a of attackers) {
        let best: Body | null = null;
        let bd = Infinity;
        for (const f of free) {
          if ([...marks.values()].includes(f)) continue;
          const dd = dist(f.x, f.y, a.x, a.y);
          if (dd < bd) {
            bd = dd;
            best = f;
          }
        }
        if (best) marks.set(a, best);
      }
    }
    const markOf = new Map<Body, Body>();
    for (const [a, f] of marks) markOf.set(f, a);

    for (const b of this.bodies) {
      if (b.controller) continue;
      if (b.stun > 0) {
        this.steer(b, b.x, b.y, 0.2);
        continue;
      }
      if (b.role === "gk") {
        this.keeperAI(b, dt);
        continue;
      }
      if (carrier === b) {
        this.carrierAI(b);
        continue;
      }
      if (!carrier) {
        if (chasers.has(b)) this.steer(b, ball.x + ball.vx * 0.2, ball.y + ball.vy * 0.2, 1);
        else this.shapeAI(b, null);
        continue;
      }
      if (carrier.team === b.team) {
        this.supportAI(b, carrier);
      } else if (pressers.has(b)) {
        const towardOwn = ownGoalX(b.team) > carrier.x ? 1 : -1;
        this.steer(b, carrier.x + towardOwn * 8, carrier.y, 1);
        if (dist(b.x, b.y, carrier.x, carrier.y) < R * 2 + 8 && b.tackleCd <= 0 && b.think <= 0) {
          b.think = 0.15;
          this.tryTackle(b, carrier);
        }
      } else if (markOf.has(b)) {
        const a = markOf.get(b)!;
        const g = ownGoalX(b.team);
        const k = 30 / Math.max(30, dist(a.x, a.y, g, CY));
        this.steer(b, a.x + (g - a.x) * k, a.y + (CY - a.y) * k, 0.9);
      } else {
        this.shapeAI(b, carrier);
      }
    }
  }

  /** Off-the-ball positioning: formation slots shifted towards the ball. */
  private shapeAI(b: Body, carrier: Body | null) {
    const ball = this.ball;
    if (b.role === "def") {
      const g = ownGoalX(b.team);
      const d = attackDir(b.team);
      // step up when the ball is far, always stay goal-side of it
      let x = b.homeX + (ball.x - b.homeX) * 0.25;
      const goalSide = (bx: number) => (d < 0 ? Math.max(bx, ball.x + 25) : Math.min(bx, ball.x - 25));
      x = goalSide(x);
      x = d < 0 ? Math.min(x, g - 20) : Math.max(x, g + 20);
      const y = b.homeY + (ball.y - CY) * 0.3;
      this.steer(b, x, clamp(y, 30, H - 30), 0.75);
      return;
    }
    // AI attackers without the ball: own half when defending, support otherwise
    const d = attackDir(b.team);
    if (carrier && carrier.team !== b.team) {
      const g = ownGoalX(b.team);
      this.steer(b, (ball.x + g) / 2 + d * 30, (ball.y + b.lane) / 2, 0.85);
    } else {
      this.steer(b, clamp(ball.x + d * 90, 60, W - 60), b.lane, 0.8);
    }
  }

  private supportAI(b: Body, carrier: Body) {
    const d = attackDir(b.team);
    const gx = targetGoalX(b.team);
    const finalThird = Math.abs(gx - carrier.x) < 380;
    let x: number;
    let y: number;
    if (b.role === "hero") {
      // an AI hero (never in this game, but keep it sane)
      x = carrier.x + d * 120;
      y = CY;
    } else if (finalThird) {
      x = gx - d * (100 + (b.number % 3) * 30);
      y = b.lane < CY ? CY - 110 : b.lane > CY ? CY + 110 : CY;
    } else {
      x = carrier.x + d * 140;
      y = b.lane;
    }
    // don't stand right next to the carrier
    if (dist(x, y, carrier.x, carrier.y) < 90) y += y < carrier.y ? -80 : 80;
    this.steer(b, clamp(x, 40, W - 40), clamp(y, 40, H - 40), 0.95);
  }

  private carrierAI(b: Body) {
    const d = attackDir(b.team);
    const gx = targetGoalX(b.team);
    const tc = this.config.teams[b.team];

    if (b.role === "def" || tc.clearOnly) {
      // defend-only side: get rid of it
      this.steer(b, b.x - d * 0, b.y, 0.2);
      if (b.holdT > 0.25) this.clear(b);
      return;
    }

    const hero = this.heroOf(b.team);
    if (b.wantsReturn && hero && hero !== b) {
      b.wantsReturn = false;
      this.pass(b, hero, { lead: 0.6 });
      return;
    }

    const distGoal = dist(b.x, b.y, gx, CY);
    const pressure = this.nearestOpponentDist(b);
    if (b.think <= 0) {
      b.think = 0.18;
      // the star is free: give him the ball
      if (hero?.controller && hero !== b && b.holdT > 0.6 && this.nearestOpponentDist(hero) > 55 && this.rng() < 0.5) {
        this.pass(b, hero);
        return;
      }
      // with a human hero on the team, mates look for him first
      const shootChance = hero?.controller ? 0.14 : 0.45;
      if (distGoal < 230 && Math.abs(b.y - CY) < 190 && this.rng() < shootChance) {
        this.shoot(b, 0.55 + this.rng() * 0.35, this.rng() * 2 - 1);
        return;
      }
      const mustPass = pressure < 42 || b.holdT > 2.4 || (hero?.controller && b.holdT > 1.4);
      if (mustPass && this.rng() < 0.65) {
        const target = this.pickPassTarget(b, hero);
        if (target) {
          this.pass(b, target);
          return;
        }
      }
    }
    // dribble at goal, sliding away from the closest opponent
    let tx = gx - d * 60;
    let ty = CY + (b.y - CY) * 0.5;
    for (const o of this.bodies) {
      if (o.team === b.team) continue;
      const dd = dist(o.x, o.y, b.x, b.y);
      if (dd < 70 && (o.x - b.x) * d > 0) ty += (b.y >= o.y ? 1 : -1) * (70 - dd) * 2;
    }
    this.steer(b, tx, clamp(ty, 40, H - 40), 0.9);
  }

  private pickPassTarget(b: Body, hero: Body | null) {
    const mates = this.team(b.team).filter((m) => m !== b && m.role !== "gk");
    let best: Body | null = null;
    let bestScore = -Infinity;
    const d = attackDir(b.team);
    for (const m of mates) {
      const open = Math.min(this.nearestOpponentDist(m), 140) / 140;
      const forward = ((m.x - b.x) * d) / 400;
      const len = dist(m.x, m.y, b.x, b.y);
      const score = open + forward - len / 900 + (m === hero ? 0.6 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    }
    return best;
  }

  private clear(b: Body) {
    const d = attackDir(b.team);
    const ball = this.ball;
    const tx = b.x + d * (260 + this.rng() * 220);
    const ty = 60 + this.rng() * (H - 120);
    const ang = Math.atan2(ty - b.y, tx - b.x);
    const dd = dist(b.x, b.y, tx, ty);
    this.release(b);
    b.kickCd = 0.6;
    ball.passer = null;
    ball.shot = null;
    const speed = clamp(dd * 1.1, 300, 600);
    ball.vx = Math.cos(ang) * speed;
    ball.vy = Math.sin(ang) * speed;
    ball.vz = (GRAVITY * (dd / speed)) / 2;
    ball.z = 1;
    this.emit({ kind: "kick", power: 0.5 });
  }

  private keeperAI(k: Body, dt: number) {
    const ball = this.ball;
    const g = ownGoalX(k.team);
    const inward = k.team === 0 ? 1 : -1;
    const lineX = g + inward * 14;

    if (ball.owner === k) {
      this.steer(k, lineX + inward * 30, CY, 0.4);
      if (k.holdT > 0.8) {
        const tc = this.config.teams[k.team];
        const mates = this.team(k.team).filter((b) => b !== k && !b.controller);
        const hero = this.heroOf(k.team);
        const options = [...mates, ...(hero && hero.controller ? [hero] : [])];
        if (tc.clearOnly || !options.length) this.clear(k);
        else {
          const target = options.sort((a, b) => this.nearestOpponentDist(b) - this.nearestOpponentDist(a))[0];
          this.pass(k, target, { lofted: dist(k.x, k.y, target.x, target.y) > 300 });
        }
      }
      return;
    }

    // incoming shot: dive to where it crosses the line
    const shot = ball.shot;
    if (shot && shot.by.team !== k.team && Math.sign(ball.vx) === -inward && k.diveY === null) {
      const t = (lineX - ball.x) / ball.vx;
      if (t > 0 && t < 1.5) {
        const cross = ball.y + ball.vy * t;
        const reaction = 0.32 - k.reflex * 0.0024 + (ball.wobble ? 0.14 : 0) + (ball.curve ? 0.06 : 0);
        k.diveY = clamp(cross, CY - GOAL_HALF - 10, CY + GOAL_HALF + 10);
        k.diveAt = this.clock + reaction;
      }
    }
    if (k.diveY !== null) {
      if (this.clock >= k.diveAt) {
        const diveSpeed = 230 + k.reflex * 2.2;
        const dy = k.diveY - k.y;
        const step = Math.min(Math.abs(dy), diveSpeed * dt);
        k.y += Math.sign(dy) * step;
        k.vy = Math.sign(dy) * diveSpeed;
        k.vx = 0;
        k.x += (lineX - k.x) * Math.min(1, dt * 6);
      }
      if (!ball.shot || ball.owner) k.diveY = null;
      return;
    }

    // sweep up a loose ball in the box
    const loose = !ball.owner;
    const inBox = Math.abs(ball.x - g) < BOX_DEPTH - 20 && Math.abs(ball.y - CY) < BOX_HALF - 40;
    if (loose && inBox && ball.z < 20) {
      let closest = true;
      const myD = dist(k.x, k.y, ball.x, ball.y);
      for (const b of this.bodies) {
        if (b !== k && b.team !== k.team && dist(b.x, b.y, ball.x, ball.y) < myD * 0.8) closest = false;
      }
      if (closest) {
        this.steer(k, ball.x, ball.y, 1);
        return;
      }
    }
    const y = CY + clamp((ball.y - CY) * 0.35, -GOAL_HALF + 6, GOAL_HALF - 6);
    const out = Math.abs(ball.x - g) < 300 ? 12 : 22;
    this.steer(k, lineX + inward * out, y, 0.7);
  }

  /* ------------------------------------------------------------ physics */

  /** Sets a body's desired velocity towards a point. */
  private steer(b: Body, tx: number, ty: number, urgency: number) {
    const dx = tx - b.x;
    const dy = ty - b.y;
    const dd = Math.hypot(dx, dy);
    const sp = this.maxSpeed(b) * urgency * clamp(dd / 30, 0, 1);
    b.tvx = dd > 0.5 ? (dx / dd) * sp : 0;
    b.tvy = dd > 0.5 ? (dy / dd) * sp : 0;
  }

  private maxSpeed(b: Body) {
    let s = b.speed;
    if (this.ball.owner === b) s *= 0.84 + b.dribbling * 0.0013;
    if (b.hero === "cr7" && b.skillT > 0) s *= 1.45;
    if (b.charging) s *= 0.75;
    return s;
  }

  /** Human players' desired velocity comes from their stick. */
  private setStick(b: Body, mx: number, my: number) {
    const len = Math.hypot(mx, my);
    const k = len > 1 ? 1 / len : 1;
    const sp = b.stun > 0 ? 0 : this.maxSpeed(b);
    b.tvx = mx * k * sp;
    b.tvy = my * k * sp;
  }

  private moveBodies(dt: number, frozen: boolean, realDt = dt) {
    for (const b of this.bodies) {
      const own = b.hero === "lm10" && this.slowMo > 0 && b.skillT > 0;
      const bdt = own ? realDt : dt;
      if (!frozen && b.role === "gk" && b.diveY !== null && this.clock >= b.diveAt) continue; // diving
      const tvx = frozen ? 0 : b.tvx;
      const tvy = frozen ? 0 : b.tvy;
      const accel = b.controller ? 14 : 8;
      const k = Math.min(1, accel * bdt);
      b.vx += (tvx - b.vx) * k;
      b.vy += (tvy - b.vy) * k;
      b.x += b.vx * bdt;
      b.y += b.vy * bdt;
      b.x = clamp(b.x, -20, W + 20);
      b.y = clamp(b.y, -20, H + 20);
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 20) b.face = Math.atan2(b.vy, b.vx);
      b.stride += sp * bdt * 0.06;
      if (this.ball.owner === b) b.dribbleDist += sp * bdt;
    }
    // separation
    for (let i = 0; i < this.bodies.length; i++) {
      for (let j = i + 1; j < this.bodies.length; j++) {
        const a = this.bodies[i];
        const c = this.bodies[j];
        const dx = c.x - a.x;
        const dy = c.y - a.y;
        const dd = Math.hypot(dx, dy);
        const min = R * 2 - 2;
        if (dd > 0 && dd < min) {
          const push = (min - dd) / 2;
          a.x -= (dx / dd) * push;
          a.y -= (dy / dd) * push;
          c.x += (dx / dd) * push;
          c.y += (dy / dd) * push;
        }
      }
    }
  }

  private stepBall(dt: number) {
    const ball = this.ball;
    if (this.phase === "goal") {
      const f = Math.exp(-3 * dt);
      ball.vx *= f;
      ball.vy *= f;
      ball.x = clamp(ball.x + ball.vx * dt, -18, W + 18);
      ball.y = clamp(ball.y + ball.vy * dt, CY - GOAL_HALF + 4, CY + GOAL_HALF - 4);
      ball.z = Math.max(0, ball.z - 30 * dt);
      return;
    }
    const owner = ball.owner;
    if (owner) {
      const touch = Math.sin(owner.stride * 2) * 2;
      ball.x = owner.x + Math.cos(owner.face) * (R + BALL_R + 2 + touch);
      ball.y = owner.y + Math.sin(owner.face) * (R + BALL_R + 2 + touch);
      ball.vx = owner.vx;
      ball.vy = owner.vy;
      ball.z = 0;
      ball.spin += Math.hypot(owner.vx, owner.vy) * dt * 0.1;
      this.checkBounds();
      return;
    }
    const px = ball.x;
    // bend (finesse) and wobble (knuckleball)
    if (ball.curve) {
      const sp = Math.hypot(ball.vx, ball.vy) || 1;
      const nx = -ball.vy / sp;
      const ny = ball.vx / sp;
      ball.vx += nx * ball.curve * dt;
      ball.vy += ny * ball.curve * dt;
      ball.curve *= Math.exp(-1.2 * dt);
    }
    if (ball.wobble) ball.vy += Math.sin(this.clock * 40) * 260 * dt;

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    if (ball.z > 0 || ball.vz > 0) {
      ball.vz -= GRAVITY * dt;
      ball.z += ball.vz * dt;
      if (ball.z <= 0) {
        ball.z = 0;
        if (Math.abs(ball.vz) > 40) ball.vz = -ball.vz * 0.4;
        else ball.vz = 0;
        ball.vx *= 0.82;
        ball.vy *= 0.82;
        ball.wobble = 0;
      }
    } else {
      const f = Math.exp(-1.25 * dt);
      ball.vx *= f;
      ball.vy *= f;
      // a slow, rolling shot is just a loose ball again
      if (ball.shot && Math.hypot(ball.vx, ball.vy) < 200) ball.shot = null;
    }
    ball.spin += Math.hypot(ball.vx, ball.vy) * dt * 0.1;
    this.keeperSaves(px);
    this.checkBounds(px);
  }

  /** Keepers get one save attempt per shot, when the ball reaches their plane. */
  private keeperSaves(prevX: number) {
    const ball = this.ball;
    const shot = ball.shot;
    if (!shot) return;
    for (const k of this.bodies) {
      if (k.role !== "gk" || k.team === shot.by.team || shot.tried.has(k.id)) continue;
      const crossed = (prevX - k.x) * (ball.x - k.x) <= 0;
      if (!crossed) continue;
      shot.tried.add(k.id);
      const reach = R + 16;
      if (Math.abs(ball.y - k.y) > reach || ball.z > GOAL_H + 8) continue;
      const speed = Math.hypot(ball.vx, ball.vy);
      const corner = Math.abs(ball.y - CY) / GOAL_HALF;
      const p = clamp(
        0.3 + (k.reflex / 100) * 0.85 - (speed - 480) / 1100 - corner * 0.12 - (ball.wobble ? 0.15 : 0),
        0.08,
        0.95,
      );
      if (this.rng() >= p) continue;
      const by = shot.by;
      this.countOnTarget(shot);
      if (speed < 520 && ball.z < GOAL_H) {
        this.giveBall(k);
        k.holdT = 0;
        this.emit({ kind: "save", keeper: k, by, caught: true });
      } else {
        const inward = k.team === 0 ? 1 : -1;
        ball.vx = inward * Math.abs(ball.vx) * (0.25 + this.rng() * 0.2);
        ball.vy = (this.rng() - 0.5) * 420;
        ball.vz = 60;
        ball.z = Math.max(ball.z, 1);
        ball.curve = ball.wobble = 0;
        ball.x = k.x + inward * (R + BALL_R + 2);
        ball.last = k;
        ball.shot = null;
        ball.passer = null;
        for (const b of this.bodies) b.assistFrom = null;
        this.emit({ kind: "save", keeper: k, by, caught: false });
      }
      return;
    }
  }

  private countOnTarget(shot: Shot | null) {
    if (!shot || shot.counted) return;
    shot.counted = true;
    const line = this.lineOf(shot.by);
    if (line) line.onTarget++;
  }

  private checkBounds(prevX = this.ball.x) {
    const ball = this.ball;
    // goal lines
    for (const team of [0, 1] as TeamIndex[]) {
      const gx = targetGoalX(team);
      const crossed = team === 0 ? ball.x >= gx && prevX < gx + 1e-9 : ball.x <= gx && prevX > gx - 1e-9;
      const beyond = team === 0 ? ball.x > gx : ball.x < gx;
      if (!crossed && !beyond) continue;
      if (ball.owner) {
        // nobody dribbles over a goal line: they stop at it
        const back = attackDir(team) * (BALL_R + 1);
        ball.x = gx - back;
        ball.owner.x = Math.min(Math.max(ball.owner.x, 0), W) - back;
        return;
      }
      const inMouth = Math.abs(ball.y - CY) < GOAL_HALF - BALL_R / 2;
      const onPost = Math.abs(Math.abs(ball.y - CY) - GOAL_HALF) < BALL_R + 2;
      const underBar = ball.z < GOAL_H - 1;
      const onBar = Math.abs(ball.z - GOAL_H) < 3;
      const goalAllowed = this.config.teams[other(team)].keeper || team === 0;
      if ((onPost && ball.z < GOAL_H + 2) || (inMouth && onBar)) {
        ball.vx = -ball.vx * 0.5;
        ball.vy += (this.rng() - 0.5) * 160;
        ball.x = gx - attackDir(team) * 2;
        if (onBar) ball.vz = -Math.abs(ball.vz) * 0.4;
        ball.shot = null;
        if (ball.owner) ball.owner = null;
        this.emit({ kind: "woodwork", by: ball.last });
        return;
      }
      if (inMouth && underBar && goalAllowed) {
        this.scoreGoal(team);
        return;
      }
      // over the line, wide or over: corner or goal kick
      if (ball.shot) this.emit({ kind: "miss", by: ball.shot.by });
      const lastTeam = ball.last?.team ?? team;
      ball.owner = null;
      if (lastTeam === team || (this.config.mode !== "pvp" && team === 1)) this.goalKick(other(team));
      else this.startCorner(team, ball.y);
      return;
    }
    // touchlines: throw-in to the side that didn't touch it last
    if (ball.y < -2 || ball.y > H + 2) {
      const team = ball.last ? other(ball.last.team) : 0;
      const y = ball.y < 0 ? 6 : H - 6;
      const x = clamp(ball.x, 30, W - 30);
      const takers = this.team(team).filter((b) => b.role !== "gk" && !b.controller);
      const pool = takers.length ? takers : this.team(team).filter((b) => b.role !== "gk");
      const taker = pool.sort((a, b) => dist(a.x, a.y, x, y) - dist(b.x, b.y, x, y))[0];
      if (!taker) return;
      taker.x = x;
      taker.y = y + (y < CY ? -8 : 8);
      this.resetBall(x, y);
      this.giveBall(taker);
      taker.face = y < CY ? Math.PI / 2 : -Math.PI / 2;
      taker.holdT = -0.3;
    }
  }

  private scoreGoal(team: TeamIndex) {
    const ball = this.ball;
    const shooter = ball.shot?.by ?? ball.last;
    const ownGoal = !!shooter && shooter.team !== team;
    const scorer = ownGoal ? null : shooter;
    const type: ShotType = ball.shot?.type ?? "normal";
    let assist: Body | null = null;
    if (scorer?.assistFrom && scorer.assistFrom.team === team && this.clock - scorer.assistAt < 12) {
      assist = scorer.assistFrom;
    }
    this.score[team]++;
    const sLine = this.lineOf(scorer);
    if (ball.shot?.by === scorer) this.countOnTarget(ball.shot);
    if (sLine) {
      sLine.goals++;
      sLine.types[type] = (sLine.types[type] ?? 0) + 1;
    }
    const aLine = this.lineOf(assist);
    if (aLine) aLine.assists++;
    if (scorer) scorer.celebrate = CELEBRATION_S;
    for (const b of this.bodies) {
      b.assistFrom = null;
      b.charging = false;
      b.charge = 0;
      b.diveY = null;
    }
    ball.owner = null;
    ball.shot = null;
    ball.passer = null;
    ball.vx *= 0.15;
    ball.vy *= 0.15;
    ball.curve = ball.wobble = 0;
    const event = { kind: "goal", team, scorer, assist, type, ownGoal } as const;
    this.lastGoal = event;
    this.phase = "goal";
    this.phaseT = 0;
    this.emit(event);
    if (assist) this.emit({ kind: "assist", by: assist });
  }

  private checkPickups() {
    const ball = this.ball;
    if (ball.owner || this.phase !== "play") return;
    const speed = Math.hypot(ball.vx, ball.vy);
    let best: Body | null = null;
    let bd = Infinity;
    for (const b of this.bodies) {
      if (b.kickCd > 0 || b.stun > 0) continue;
      const reach = b.role === "gk" ? R + BALL_R + 8 : R + BALL_R + 3;
      const maxZ = b.role === "gk" ? GOAL_H + 4 : 14;
      if (ball.z > maxZ) continue;
      const dd = dist(b.x, b.y, ball.x, ball.y);
      if (dd > reach || dd >= bd) continue;
      // shots fly past outfield players most of the time
      if (ball.shot && b.role !== "gk" && b.team !== ball.shot.by.team && speed > 420 && this.rng() < 0.6) continue;
      if (ball.shot && b.team === ball.shot.by.team) continue;
      // keepers deal with shots in keeperSaves(), which rolls for the save
      if (ball.shot && b.role === "gk" && b.team !== ball.shot.by.team && speed > 300) continue;
      best = b;
      bd = dd;
    }
    if (!best) return;
    if (best.role === "gk" && ball.shot && ball.shot.by.team !== best.team) {
      const by = ball.shot.by;
      this.countOnTarget(ball.shot);
      this.emit({ kind: "save", keeper: best, by, caught: true });
    }
    this.giveBall(best);
  }

  private gauss() {
    let u = 0;
    let v = 0;
    while (u === 0) u = this.rng();
    while (v === 0) v = this.rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /* ----------------------------------------------------- test helpers */

  /** Places the ball and a body (test / scripted scenes). */
  debugPlace(body: Body, x: number, y: number, withBall: boolean) {
    body.x = x;
    body.y = y;
    if (withBall) {
      this.resetBall(x, y);
      this.giveBall(body);
    }
  }

  forcePhase(phase: Phase) {
    this.phase = phase;
    this.phaseT = 0;
  }
}
