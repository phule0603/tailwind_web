import { HEROES } from "@/lib/heroes";
import { PITCH, type Body, type Match, type MatchEvent, type ShotType } from "@/lib/engine/match";

/*
 * Canvas renderer: stadium, pitch, players, ball, effects and the in-match HUD.
 * Keeps its own effect state (particles, banners, camera) fed by match events.
 */

const { W, H, GOAL_HALF, BOX_DEPTH, BOX_HALF, SPOT, R, BALL_R } = PITCH;
const CY = H / 2;

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  color: string;
  size: number;
}

interface Banner {
  text: string;
  sub?: string;
  color: string;
  life: number;
  max: number;
  size: number;
}

export const SHOT_LABELS: Record<ShotType, string> = {
  header: "ĐÁNH ĐẦU!",
  penalty: "PENALTY!",
  tapin: "ĐỆM BÓNG CẬN THÀNH!",
  longrange: "SÚT XA!",
  knuckle: "KNUCKLEBALL!",
  finesse: "CỨA LÒNG MA THUẬT!",
  solo: "SOLO KINH ĐIỂN!",
  normal: "DỨT ĐIỂM!",
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class Renderer {
  private particles: Particle[] = [];
  private banners: Banner[] = [];
  private camX = W / 2;
  private camY = CY;
  private shake = 0;
  private flash = 0;
  private excitement = 0;
  private time = 0;
  private trail: { x: number; y: number; z: number }[] = [];
  private crowd: { x: number; y: number; c: string; p: number }[] = [];
  commentary = "";
  private commentaryT = 0;

  constructor(private readonly homeColors: string[], private readonly awayColors: string[]) {
    // crowd dots around the pitch, coloured by the two ends
    for (let i = 0; i < 900; i++) {
      const side = i % 4;
      let x: number;
      let y: number;
      if (side < 2) {
        x = rand(-90, W + 90);
        y = side === 0 ? rand(-118, -46) : rand(H + 46, H + 118);
      } else {
        x = side === 2 ? rand(-118, -52) : rand(W + 52, W + 118);
        y = rand(-90, H + 90);
      }
      const palette = x < W / 2 ? homeColors : awayColors;
      const c = Math.random() < 0.55 ? palette[i % palette.length] : ["#e2e8f0", "#94a3b8", "#334155"][i % 3];
      this.crowd.push({ x, y, c, p: Math.random() * 6.28 });
    }
  }

  say(text: string) {
    this.commentary = text;
    this.commentaryT = 4.5;
  }

  banner(text: string, color: string, size = 1, sub?: string, life = 1.6) {
    this.banners = this.banners.filter((b) => b.life < b.max - 0.05 || b.size !== size);
    this.banners.push({ text, sub, color, life, max: life, size });
  }

  private burst(x: number, y: number, z: number, n: number, colors: string[], speed: number, up = 0) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(speed * 0.3, speed);
      this.particles.push({
        x,
        y,
        z,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        vz: up ? rand(up * 0.4, up) : 0,
        life: rand(0.5, 1.2),
        max: 1.2,
        color: colors[i % colors.length],
        size: rand(1.5, 3.5),
      });
    }
  }

  handle(events: MatchEvent[], match: Match) {
    const ball = match.ball;
    for (const e of events) {
      switch (e.kind) {
        case "kick":
          this.burst(ball.x, ball.y, 0, 4 + Math.round(e.power * 6), ["#86efac", "#4ade80", "#e2e8f0"], 60 * e.power);
          if (e.power > 0.8) this.shake = Math.max(this.shake, 3 * e.power);
          break;
        case "goal": {
          const kit = match.config.teams[e.team].kit;
          this.burst(ball.x, ball.y, 10, 90, [kit.shirt, kit.shorts, "#facc15", "#ffffff"], 340, 260);
          this.shake = 14;
          this.flash = 0.5;
          this.excitement = 1;
          const hero = e.scorer?.hero ? HEROES[e.scorer.hero] : null;
          const sub = e.ownGoal ? "PHẢN LƯỚI NHÀ!" : SHOT_LABELS[e.type];
          if (hero) {
            this.banner(hero.celebration.shout, hero.accent, 1.5, sub, 2.6);
          } else {
            this.banner("GOOOOAL!", "#facc15", 1.4, sub, 2.6);
          }
          break;
        }
        case "save":
          this.burst(ball.x, ball.y, ball.z, 18, ["#ffffff", "#bae6fd"], 160, 80);
          this.shake = Math.max(this.shake, 5);
          this.banner(e.caught ? "BẮT GỌN!" : "CỨU THUA!", "#7dd3fc", 0.8);
          break;
        case "woodwork":
          this.shake = Math.max(this.shake, 8);
          this.burst(ball.x, ball.y, ball.z, 14, ["#ffffff"], 150, 60);
          this.banner("TRÚNG CỘT!", "#f8fafc", 0.9);
          break;
        case "dribble":
          if (e.by.role === "hero") {
            this.burst(e.past.x, e.past.y, 0, 8, ["#facc15", "#fde68a"], 90);
          }
          break;
        case "tackle":
          this.burst(e.on.x, e.on.y, 0, 10, ["#a3e635", "#e2e8f0"], 100);
          break;
        case "foul":
          this.banner("PHẠM LỖI!", "#f87171", 1);
          this.shake = 6;
          break;
        case "penalty":
          this.banner("PENALTY!", "#facc15", 1.2, "Giữ nút SÚT để lấy đà, ↑/↓ để chọn góc", 2.4);
          break;
        case "corner":
          this.banner("PHẠT GÓC", "#e2e8f0", 0.8);
          break;
        case "skill": {
          const hero = e.by.hero ? HEROES[e.by.hero] : null;
          if (hero) {
            this.banner(hero.skill.name, hero.accent, 1);
            this.burst(e.by.x, e.by.y, 0, 26, [hero.accent, "#ffffff"], 180);
          }
          break;
        }
        case "kickoff":
          this.banner("KICK-OFF", "#e2e8f0", 0.9, undefined, 0.9);
          break;
        case "fulltime":
          this.banner("HẾT GIỜ!", "#facc15", 1.3, undefined, 3);
          this.excitement = Math.max(this.excitement, 0.6);
          break;
        default:
          break;
      }
    }
  }

  /* ------------------------------------------------------------ frame */

  draw(
    ctx: CanvasRenderingContext2D,
    m: Match,
    dt: number,
    cw: number,
    ch: number,
    local: { p1?: string; p2?: string },
    view: { dpr: number; touch: boolean },
  ) {
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 30);
    this.flash = Math.max(0, this.flash - dt);
    this.excitement = Math.max(0, this.excitement - dt * 0.25);
    this.commentaryT = Math.max(0, this.commentaryT - dt);

    const ball = m.ball;
    // camera: follows the ball, sees ~700 × 460 units (less width in portrait)
    const scale = ch > cw ? Math.min(cw / 560, ch / 460) : Math.min(cw / 700, ch / 460);
    const viewW = cw / scale;
    const viewH = ch / scale;
    const lookX = ball.x + ball.vx * 0.25;
    const lookY = ball.y + ball.vy * 0.15;
    const k = Math.min(1, dt * 4);
    this.camX += (lookX - this.camX) * k;
    this.camY += (lookY - this.camY) * k;
    const margin = 70;
    const cx = viewW >= W + margin * 2 ? W / 2 : Math.max(viewW / 2 - margin, Math.min(W + margin - viewW / 2, this.camX));
    const cy = viewH >= H + margin * 2 ? CY : Math.max(viewH / 2 - margin, Math.min(H + margin - viewH / 2, this.camY));
    this.camX = cx;
    this.camY = cy;

    ctx.save();
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, cw, ch);
    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;
    ctx.translate(cw / 2 + sx, ch / 2 + sy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);

    this.drawStadium(ctx, m);
    this.drawPitch(ctx);
    this.drawGoal(ctx, 0);
    this.drawGoal(ctx, W);

    // shot trail
    if (ball.shot || Math.hypot(ball.vx, ball.vy) > 500) {
      this.trail.push({ x: ball.x, y: ball.y, z: ball.z });
      if (this.trail.length > 14) this.trail.shift();
    } else if (this.trail.length) this.trail.shift();
    for (let i = 0; i < this.trail.length; i++) {
      const t = this.trail[i];
      ctx.globalAlpha = (i / this.trail.length) * 0.5;
      ctx.fillStyle = ball.wobble ? "#facc15" : ball.curve ? "#7dd3fc" : "#ffffff";
      ctx.beginPath();
      ctx.arc(t.x, t.y - t.z, BALL_R * (i / this.trail.length), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // depth sort: draw bodies and ball by y
    const items: { y: number; draw: () => void }[] = m.bodies.map((b) => ({
      y: b.y,
      draw: () => this.drawBody(ctx, m, b, local),
    }));
    items.push({ y: ball.y + 0.1, draw: () => this.drawBall(ctx, m) });
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw();

    this.drawParticles(ctx, dt);
    ctx.restore();

    // La Pausa: everything drifts blue and slow
    if (m.slowMo > 0) {
      const g = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.25, cw / 2, ch / 2, Math.max(cw, ch) * 0.7);
      g.addColorStop(0, "rgba(56,189,248,0)");
      g.addColorStop(1, "rgba(56,189,248,0.35)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cw, ch);
    }
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.5})`;
      ctx.fillRect(0, 0, cw, ch);
    }
    this.drawHud(ctx, m, cw, ch, dt, local, view);
  }

  /* ------------------------------------------------------------ world */

  private drawStadium(ctx: CanvasRenderingContext2D, m: Match) {
    // stands
    ctx.fillStyle = "#0b1220";
    ctx.fillRect(-140, -140, W + 280, H + 280);
    const jump = this.excitement;
    for (const c of this.crowd) {
      const hop = jump > 0 ? Math.max(0, Math.sin(this.time * 14 + c.p)) * 4 * jump : Math.sin(this.time * 2 + c.p) * 0.4;
      ctx.fillStyle = c.c;
      ctx.fillRect(c.x - 2, c.y - 2 - hop, 4, 4);
    }
    // ad boards
    ctx.fillStyle = "#111827";
    ctx.fillRect(-46, -46, W + 92, 18);
    ctx.fillRect(-46, H + 28, W + 92, 18);
    ctx.font = "bold 11px ui-sans-serif, system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const ads = `GOAT RACE · CLASH OF TITANS · ${m.config.stadium.toUpperCase()} · `;
    const off = (this.time * 30) % 420;
    for (let x = -46 - off; x < W + 46; x += 420) {
      ctx.fillStyle = "#facc15";
      ctx.fillText(ads, x, -37);
      ctx.fillStyle = "#38bdf8";
      ctx.fillText(ads, x + 210, H + 37);
    }
    // grass run-off
    ctx.fillStyle = "#14532d";
    ctx.fillRect(-28, -28, W + 56, H + 56);
  }

  private drawPitch(ctx: CanvasRenderingContext2D) {
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = i % 2 ? "#166534" : "#15803d";
      ctx.fillRect((i * W) / 14, 0, W / 14 + 0.5, H);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, W, H);
    ctx.beginPath();
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2, H);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(W / 2, CY, 91.5, 0, Math.PI * 2);
    ctx.stroke();
    for (const [gx, d] of [
      [0, 1],
      [W, -1],
    ] as const) {
      ctx.strokeRect(Math.min(gx, gx + d * BOX_DEPTH), CY - BOX_HALF, BOX_DEPTH, BOX_HALF * 2);
      ctx.strokeRect(Math.min(gx, gx + d * 55), CY - 91.5, 55, 183);
      ctx.beginPath();
      ctx.arc(gx + d * SPOT, CY, 91.5, d > 0 ? -0.93 : Math.PI - 0.93, d > 0 ? 0.93 : Math.PI + 0.93);
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(gx + d * SPOT, CY, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(W / 2, CY, 2.5, 0, Math.PI * 2);
    ctx.fill();
    for (const [x, y, a] of [
      [0, 0, 0],
      [W, 0, Math.PI / 2],
      [W, H, Math.PI],
      [0, H, -Math.PI / 2],
    ] as const) {
      ctx.beginPath();
      ctx.arc(x, y, 10, a, a + Math.PI / 2);
      ctx.stroke();
    }
  }

  private drawGoal(ctx: CanvasRenderingContext2D, gx: number) {
    const d = gx === 0 ? -1 : 1;
    const depth = 20;
    const x0 = Math.min(gx, gx + d * depth);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(x0, CY - GOAL_HALF, depth, GOAL_HALF * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 0.8;
    for (let y = CY - GOAL_HALF; y <= CY + GOAL_HALF; y += 6) {
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + depth, y);
      ctx.stroke();
    }
    for (let x = x0; x <= x0 + depth; x += 6) {
      ctx.beginPath();
      ctx.moveTo(x, CY - GOAL_HALF);
      ctx.lineTo(x, CY + GOAL_HALF);
      ctx.stroke();
    }
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(gx, CY - GOAL_HALF);
    ctx.lineTo(gx + d * depth, CY - GOAL_HALF);
    ctx.lineTo(gx + d * depth, CY + GOAL_HALF);
    ctx.lineTo(gx, CY + GOAL_HALF);
    ctx.stroke();
  }

  private drawBody(ctx: CanvasRenderingContext2D, m: Match, b: Body, local: { p1?: string; p2?: string }) {
    const team = m.config.teams[b.team];
    const heroDef = b.hero ? HEROES[b.hero] : null;
    const kit = heroDef && b.role === "hero" ? heroDef.colors : null;
    const shirt = b.role === "gk" ? (b.team === 0 ? "#a3e635" : "#f97316") : kit?.shirt ?? team.kit.shirt;
    const shorts = kit?.shorts ?? team.kit.shorts;
    const skin = kit?.skin ?? (b.number % 3 === 0 ? "#8d5524" : b.number % 3 === 1 ? "#e0ac69" : "#c68642");
    const hair = kit?.hair ?? "#1f2937";
    const celebrating = b.celebrate > 0 && m.phase === "goal";
    let lift = 0;
    let spin = 0;
    if (celebrating && b.hero === "cr7") {
      // run, jump, spin, land: SIUUU
      const t = 3 - b.celebrate;
      if (t > 0.9 && t < 1.6) {
        const u = (t - 0.9) / 0.7;
        lift = Math.sin(u * Math.PI) * 26;
        spin = u * Math.PI;
      } else if (t >= 1.6) spin = Math.PI;
    } else if (b.celebrate > 0 && m.phase !== "goal") {
      lift = Math.sin((b.celebrate / 0.35) * Math.PI) * 10; // header jump
    }

    // diving keeper stretches out
    const diving = b.role === "gk" && b.diveY !== null && Math.abs(b.vy) > 50;

    ctx.save();
    ctx.translate(b.x, b.y);
    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(2, 3, R * (1 - lift / 80), R * 0.6 * (1 - lift / 80), 0, 0, Math.PI * 2);
    ctx.fill();

    // hero aura
    if (b.role === "hero" && heroDef) {
      const glow = b.skillT > 0 ? 1 : 0.45;
      ctx.strokeStyle = heroDef.accent;
      ctx.globalAlpha = glow * (0.6 + Math.sin(this.time * 6) * 0.2);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 2, R + 5, (R + 5) * 0.6, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (b.hero === "cr7" && b.skillT > 0) {
        // turbo streaks
        ctx.strokeStyle = "rgba(250,204,21,0.6)";
        for (let i = 0; i < 4; i++) {
          const a = b.face + Math.PI + (i - 1.5) * 0.25;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * R, Math.sin(a) * R);
          ctx.lineTo(Math.cos(a) * (R + 22 + i * 4), Math.sin(a) * (R + 22 + i * 4));
          ctx.stroke();
        }
      }
    }

    ctx.translate(0, -lift);
    ctx.rotate((celebrating ? -Math.PI / 2 : b.face) + spin);
    if (diving) ctx.scale(1, 1.6);

    // legs (stride)
    const moving = Math.hypot(b.vx, b.vy) > 20;
    const swing = moving ? Math.sin(b.stride) * 6 : 0;
    ctx.fillStyle = shorts;
    ctx.fillRect(-2 + swing, -6, 8, 4);
    ctx.fillRect(-2 - swing, 2, 8, 4);
    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.arc(6 + swing, -4, 2.2, 0, Math.PI * 2);
    ctx.arc(6 - swing, 4, 2.2, 0, Math.PI * 2);
    ctx.fill();

    // torso
    ctx.fillStyle = shirt;
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(0, 0, R * 0.62, R, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // arms: pumping, or LM10 pointing at the sky
    ctx.strokeStyle = skin;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    if (celebrating && b.hero === "lm10") {
      ctx.beginPath();
      ctx.moveTo(0, -R * 0.8);
      ctx.lineTo(14, -R - 4);
      ctx.moveTo(0, R * 0.8);
      ctx.lineTo(14, R + 4);
      ctx.stroke();
    } else {
      const arm = moving ? -swing * 0.8 : 0;
      ctx.beginPath();
      ctx.moveTo(0, -R * 0.85);
      ctx.lineTo(arm, -R - 3);
      ctx.moveTo(0, R * 0.85);
      ctx.lineTo(-arm, R + 3);
      ctx.stroke();
    }
    // head
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(1, 0, 5.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.arc(0, 0, 5.2, Math.PI * 0.55, Math.PI * 1.45);
    ctx.fill();
    ctx.restore();

    // number / name tags (screen-aligned)
    const tagY = b.y - lift - R - 8;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    if (b.role === "hero" && heroDef) {
      ctx.font = "bold 9px ui-sans-serif, system-ui, sans-serif";
      ctx.fillStyle = heroDef.accent;
      ctx.fillText(`${heroDef.short} ${heroDef.number}`, b.x, tagY);
      if (b.controller) {
        const label = b.controller === "p1" ? local.p1 ?? "P1" : local.p2 ?? "P2";
        const col = b.controller === "p1" ? "#22d3ee" : "#f472b6";
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(b.x - 5, tagY - 14);
        ctx.lineTo(b.x + 5, tagY - 14);
        ctx.lineTo(b.x, tagY - 8);
        ctx.fill();
        ctx.font = "bold 8px ui-sans-serif, system-ui, sans-serif";
        ctx.fillText(label, b.x, tagY - 17);
      }
      // charge bar
      if (b.charging) {
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(b.x - 16, b.y + R + 6, 32, 5);
        ctx.fillStyle = b.charge > 0.93 ? "#ef4444" : b.charge > 0.7 ? "#facc15" : "#4ade80";
        ctx.fillRect(b.x - 15, b.y + R + 7, 30 * b.charge, 3);
      }
    } else if (b.role !== "def") {
      ctx.font = "bold 7px ui-sans-serif, system-ui, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.fillText(String(b.number), b.x, tagY + 4);
    }
    if (b.stun > 0 && b.role !== "gk") {
      ctx.fillStyle = "#fde68a";
      ctx.font = "bold 9px ui-sans-serif, system-ui, sans-serif";
      ctx.fillText("✦", b.x + Math.sin(this.time * 12) * 5, tagY);
    }
  }

  private drawBall(ctx: CanvasRenderingContext2D, m: Match) {
    const ball = m.ball;
    const s = 1 + ball.z / 50;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(ball.x + 1 + ball.z * 0.15, ball.y + 2, BALL_R, BALL_R * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    const y = ball.y - ball.z;
    ctx.save();
    ctx.translate(ball.x, y);
    ctx.scale(s, s);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(0, 0, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(ball.spin);
    ctx.fillStyle = "#111827";
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 2.6, Math.sin(a) * 2.6, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawParticles(ctx: CanvasRenderingContext2D, dt: number) {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - dt * 2;
      p.vy *= 1 - dt * 2;
      if (p.z > 0 || p.vz) {
        p.vz -= 400 * dt;
        p.z = Math.max(0, p.z + p.vz * dt);
      }
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.z - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    this.particles = this.particles.filter((p) => p.life > 0);
    if (this.particles.length > 600) this.particles.splice(0, this.particles.length - 600);
  }

  /* -------------------------------------------------------------- HUD */

  private drawHud(
    ctx: CanvasRenderingContext2D,
    m: Match,
    cw: number,
    ch: number,
    dt: number,
    local: { p1?: string; p2?: string },
    view: { dpr: number; touch: boolean },
  ) {
    // sizes in CSS pixels, drawn at device resolution
    const cssW = cw / view.dpr;
    const cssH = ch / view.dpr;
    const ui = Math.max(0.75, Math.min(1.35, Math.min(cssW, cssH * 1.6) / 900)) * view.dpr;
    // the sound / pause buttons live in the top-right corner
    const rightInset = 64 * view.dpr;
    // narrow screens: hero panels go below the scoreboard instead of beside it
    const narrow = cssW < 640;
    const portrait = cssH > cssW;
    ctx.save();
    ctx.textBaseline = "middle";

    // scoreboard
    const [t0, t1] = m.config.teams;
    const minute = Math.min(90, Math.floor((m.clock / m.config.seconds) * 90));
    const sbW = 300 * ui;
    const sbH = 34 * ui;
    const sbX = cw / 2 - sbW / 2;
    const sbY = 10 * ui;
    ctx.fillStyle = "rgba(2,6,23,0.82)";
    roundRect(ctx, sbX, sbY, sbW, sbH, 8 * ui);
    ctx.fill();
    ctx.fillStyle = t0.kit.shirt;
    ctx.fillRect(sbX + 8 * ui, sbY + 8 * ui, 5 * ui, sbH - 16 * ui);
    ctx.fillStyle = t1.kit.shirt;
    ctx.fillRect(sbX + sbW - 13 * ui, sbY + 8 * ui, 5 * ui, sbH - 16 * ui);
    ctx.fillStyle = "#e2e8f0";
    ctx.font = `bold ${12 * ui}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText(shortName(t0.name), sbX + 18 * ui, sbY + sbH / 2);
    ctx.textAlign = "right";
    ctx.fillText(shortName(t1.name), sbX + sbW - 18 * ui, sbY + sbH / 2);
    ctx.textAlign = "center";
    ctx.font = `900 ${18 * ui}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`${m.score[0]} – ${m.score[1]}`, cw / 2, sbY + sbH / 2);
    ctx.fillStyle = "#facc15";
    ctx.font = `bold ${11 * ui}px ui-monospace, monospace`;
    ctx.fillText(`${minute}'`, cw / 2, sbY + sbH + 10 * ui);

    // hero lines + skill meters
    m.heroes.forEach((line, i) => {
      const body = m.heroOf(line.team);
      if (!body) return;
      const def = HEROES[line.hero];
      const left = line.team === 0;
      const x = left ? 12 * ui : cw - rightInset;
      const y = narrow ? 70 * ui : 22 * ui;
      ctx.textAlign = left ? "left" : "right";
      ctx.font = `bold ${11 * ui}px ui-sans-serif, system-ui, sans-serif`;
      ctx.fillStyle = def.accent;
      const who = body.controller === "p1" ? local.p1 : body.controller === "p2" ? local.p2 : null;
      ctx.fillText(`${def.short}${who ? ` · ${who}` : ""}`, x, y);
      ctx.fillStyle = "#e2e8f0";
      ctx.font = `bold ${13 * ui}px ui-sans-serif, system-ui, sans-serif`;
      ctx.fillText(`⚽ ${line.goals}   🅰 ${line.assists}`, x, y + 18 * ui);
      // skill meter
      const bw = 110 * ui;
      const bx = left ? x : x - bw;
      const by = y + 32 * ui;
      ctx.fillStyle = "rgba(15,23,42,0.85)";
      ctx.fillRect(bx, by, bw, 8 * ui);
      const ready = body.skillCd <= 0;
      const frac = body.skillT > 0 ? body.skillT / body.skillMax : ready ? 1 : 1 - body.skillCd / (body.skillCdMax + body.skillMax);
      ctx.fillStyle = body.skillT > 0 ? "#ffffff" : ready ? def.accent : "#475569";
      ctx.fillRect(left ? bx : bx + bw * (1 - frac), by, bw * frac, 8 * ui);
      ctx.font = `bold ${9 * ui}px ui-sans-serif, system-ui, sans-serif`;
      ctx.fillStyle = ready ? "#ffffff" : "#94a3b8";
      ctx.fillText(ready ? `${def.skill.name} SẴN SÀNG` : def.skill.name, x, by + 18 * ui);
      void i;
    });

    // banners
    let by = ch * 0.34;
    for (const b of this.banners) {
      b.life -= dt;
      const t = 1 - b.life / b.max;
      const pop = t < 0.12 ? 0.6 + (t / 0.12) * 0.4 : 1;
      ctx.globalAlpha = Math.min(1, b.life / 0.3);
      ctx.textAlign = "center";
      ctx.font = `italic 900 ${42 * ui * b.size * pop}px ui-sans-serif, system-ui, sans-serif`;
      ctx.lineWidth = 6 * ui;
      ctx.strokeStyle = "rgba(2,6,23,0.85)";
      ctx.strokeText(b.text, cw / 2, by);
      ctx.fillStyle = b.color;
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 18;
      ctx.fillText(b.text, cw / 2, by);
      ctx.shadowBlur = 0;
      if (b.sub) {
        ctx.font = `bold ${14 * ui}px ui-sans-serif, system-ui, sans-serif`;
        ctx.lineWidth = 4 * ui;
        ctx.strokeText(b.sub, cw / 2, by + 34 * ui * b.size);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(b.sub, cw / 2, by + 34 * ui * b.size);
      }
      by += 70 * ui * b.size;
    }
    ctx.globalAlpha = 1;
    this.banners = this.banners.filter((b) => b.life > 0);

    // commentary ticker
    if (this.commentaryT > 0 && this.commentary) {
      ctx.globalAlpha = Math.min(1, this.commentaryT / 0.5);
      ctx.font = `bold ${13 * ui}px ui-sans-serif, system-ui, sans-serif`;
      const tw = Math.min(cw - 24, ctx.measureText(this.commentary).width + 40 * ui);
      // on touch screens the bottom belongs to the thumbs
      const ty = !view.touch ? ch - 30 * ui : portrait ? ch - 215 * view.dpr : sbY + sbH + 34 * ui;
      ctx.fillStyle = "rgba(2,6,23,0.8)";
      roundRect(ctx, cw / 2 - tw / 2, ty - 15 * ui, tw, 30 * ui, 15 * ui);
      ctx.fill();
      ctx.fillStyle = "#f8fafc";
      ctx.textAlign = "center";
      ctx.fillText(`🎙 ${this.commentary}`, cw / 2, ty, cw - 40);
      ctx.globalAlpha = 1;
    }

    if (!(narrow && portrait)) this.drawMinimap(ctx, m, cw, ch, ui, view.touch);
    ctx.restore();
  }

  private drawMinimap(ctx: CanvasRenderingContext2D, m: Match, cw: number, ch: number, ui: number, touch: boolean) {
    const mw = 120 * ui;
    const mh = (mw * H) / W;
    // touch: top-left under the hero panel, away from the joystick and buttons
    const x = touch ? 12 * ui : cw - mw - 12 * ui;
    const y = touch ? 80 * ui : ch - mh - 56 * ui;
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "rgba(20,83,45,0.85)";
    ctx.fillRect(x, y, mw, mh);
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, mw, mh);
    ctx.beginPath();
    ctx.moveTo(x + mw / 2, y);
    ctx.lineTo(x + mw / 2, y + mh);
    ctx.stroke();
    const sx = mw / W;
    const sy = mh / H;
    for (const b of m.bodies) {
      ctx.fillStyle = b.role === "hero" && b.hero ? HEROES[b.hero].accent : m.config.teams[b.team].kit.shirt;
      ctx.beginPath();
      ctx.arc(x + b.x * sx, y + b.y * sy, b.role === "hero" ? 3 : 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(x + m.ball.x * sx, y + m.ball.y * sy, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function shortName(name: string) {
  return name.length > 13 ? `${name.slice(0, 12)}…` : name;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
