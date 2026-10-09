"use client";

import { RefObject, useCallback, useEffect, useRef, useState } from "react";
import { Sfx } from "@/lib/engine/audio";
import { commentate } from "@/lib/engine/commentary";
import { emptyPad, Match, type MatchConfig, type MatchEvent, type MatchSummary, type Pad } from "@/lib/engine/match";
import { Renderer } from "@/lib/engine/render";
import { HEROES } from "@/lib/heroes";

/* Game loop, input and sound around a Match: fixed 1/120 s steps, render every frame. */

const STEP = 1 / 120;

/** Solo: WASD/arrows + J/Space/K/L. PvP: P1 WASD + F/G/Shift, P2 arrows + / . RightShift. */
const KEYS = {
  solo: {
    up: ["KeyW", "ArrowUp"],
    down: ["KeyS", "ArrowDown"],
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    shoot: ["KeyJ", "Space"],
    pass: ["KeyK"],
    skill: ["KeyL", "ShiftLeft", "ShiftRight"],
  },
  p1: {
    up: ["KeyW"],
    down: ["KeyS"],
    left: ["KeyA"],
    right: ["KeyD"],
    shoot: ["KeyF"],
    pass: ["KeyG"],
    skill: ["ShiftLeft", "KeyR"],
  },
  p2: {
    up: ["ArrowUp"],
    down: ["ArrowDown"],
    left: ["ArrowLeft"],
    right: ["ArrowRight"],
    shoot: ["Slash", "Numpad0"],
    pass: ["Period", "NumpadDecimal"],
    skill: ["ShiftRight", "Comma"],
  },
} as const;

type KeyMap = (typeof KEYS)[keyof typeof KEYS];
const GAME_CODES = new Set<string>(Object.values(KEYS).flatMap((m) => Object.values(m).flat()));

export interface MatchHandlers {
  onEnd?: (summary: MatchSummary, match: Match) => void;
  onEvent?: (e: MatchEvent, match: Match) => void;
}

export interface UseMatchOptions extends MatchHandlers {
  /** null: attract mode (AI vs AI in the background of the menus) */
  config: MatchConfig | null;
  attract: MatchConfig;
  /** touch controls write the player's pad here */
  touchPadRef: RefObject<Pad>;
  /** names shown over the controlled heroes */
  labels: { p1?: string; p2?: string };
  /** while true, keys don't reach the match (dialogs, menus) */
  inputBlockedRef?: RefObject<boolean>;
}

export function useMatch(canvasRef: RefObject<HTMLCanvasElement | null>, opts: UseMatchOptions) {
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [voice, setVoice] = useState(true);
  const sfxRef = useRef<Sfx | null>(null);
  const optsRef = useRef(opts);
  const pausedRef = useRef(false);
  const voiceRef = useRef(true);
  const matchRef = useRef<Match | null>(null);
  useEffect(() => {
    optsRef.current = opts;
  });

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  useEffect(() => {
    voiceRef.current = voice;
    if (!voice && typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  }, [voice]);

  // persisted sound settings
  useEffect(() => {
    try {
      setMuted(localStorage.getItem("goat:muted") === "1");
      setVoice(localStorage.getItem("goat:voice") !== "0");
    } catch {
      /* storage blocked */
    }
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      sfxRef.current?.setMuted(next);
      if (next && typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
      try {
        localStorage.setItem("goat:muted", next ? "1" : "0");
      } catch {}
      return next;
    });
  }, []);

  const toggleVoice = useCallback(() => {
    setVoice((v) => {
      try {
        localStorage.setItem("goat:voice", v ? "0" : "1");
      } catch {}
      return !v;
    });
  }, []);

  const { config, attract } = opts;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const sfx = (sfxRef.current ??= new Sfx());
    sfx.setMuted(muted);

    const live = config ?? attract;
    const isAttract = !config;
    const match = new Match(live);
    matchRef.current = isAttract ? null : match;
    const [home, away] = live.teams;
    const renderer = new Renderer(
      [home.hero ? HEROES[home.hero].colors.shirt : home.kit.shirt, home.kit.shorts],
      [away.hero ? HEROES[away.hero].colors.shirt : away.kit.shirt, away.kit.shorts],
    );
    const pads: [Pad, Pad] = [emptyPad(), emptyPad()];
    const held = new Set<string>();
    const pvp = live.mode === "pvp";
    let ended = false;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    sfx.crowd(isAttract ? 0.05 : 0.15);
    if (!isAttract) sfx.whistle();

    const speak = (text: string) => {
      if (isAttract || !voiceRef.current || sfx.muted || typeof speechSynthesis === "undefined") return;
      const u = new SpeechSynthesisUtterance(text.replace(/[☝🅰⚽🎙]/gu, ""));
      u.lang = "vi-VN";
      u.rate = 1.12;
      u.pitch = 1.05;
      const vi = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith("vi"));
      if (vi) u.voice = vi;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    };

    const readPad = (pad: Pad, map: KeyMap, prev: { shoot: boolean }) => {
      const on = (codes: readonly string[]) => codes.some((c) => held.has(c));
      pad.mx = (on(map.right) ? 1 : 0) - (on(map.left) ? 1 : 0);
      pad.my = (on(map.down) ? 1 : 0) - (on(map.up) ? 1 : 0);
      pad.shoot = on(map.shoot) || prev.shoot;
    };

    const onEvent = (e: MatchEvent) => {
      switch (e.kind) {
        case "kick":
          sfx.kick(e.power);
          break;
        case "goal":
          sfx.roar(1);
          if (e.scorer?.hero === "cr7") sfx.siuuu();
          break;
        case "save":
          sfx.save();
          sfx.groan();
          break;
        case "woodwork":
          sfx.post();
          sfx.groan();
          break;
        case "miss":
          sfx.groan();
          break;
        case "foul":
        case "corner":
          sfx.whistle();
          break;
        case "kickoff":
          if (!isAttract && match.clock > 0.1) sfx.whistle();
          break;
        case "skill":
          sfx.skill(e.by.hero === "cr7");
          break;
        case "fulltime":
          sfx.whistle(true);
          sfx.roar(0.7);
          break;
      }
      if (isAttract) return;
      const line = commentate(e, match);
      if (line) {
        renderer.say(line);
        if (["goal", "foul", "fulltime", "skill"].includes(e.kind) || (e.kind === "kickoff" && match.clock < 0.1)) {
          speak(line);
        }
      }
      optsRef.current.onEvent?.(e, match);
    };

    const touch = window.matchMedia("(pointer: coarse)").matches;
    let dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
    };
    resize();

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const blocked = optsRef.current.inputBlockedRef?.current === true;
      if (!pausedRef.current || isAttract) {
        if (isAttract || blocked) {
          pads[0] = emptyPad();
          pads[1] = emptyPad();
        } else {
          const touch = optsRef.current.touchPadRef.current ?? emptyPad();
          readPad(pads[0], pvp ? KEYS.p1 : KEYS.solo, { shoot: !pvp && touch.shoot });
          if (!pvp && (touch.mx || touch.my)) {
            pads[0].mx = touch.mx;
            pads[0].my = touch.my;
          }
          if (!pvp && touch.pass) pads[0].pass = true;
          if (!pvp && touch.skill) pads[0].skill = true;
          touch.pass = touch.skill = false;
          if (pvp) readPad(pads[1], KEYS.p2, { shoot: false });
        }
        acc += dt;
        while (acc >= STEP) {
          match.step(STEP, pads);
          acc -= STEP;
        }
        const events = match.drainEvents();
        renderer.handle(events, match);
        for (const e of events) onEvent(e);
        if (isAttract && match.phase === "fulltime") {
          // keep the background match going forever
          match.clock = 0;
          match.score = [0, 0];
          match.forcePhase("play");
        }
        if (!isAttract && match.phase === "fulltime" && !ended && match.phaseT === 0) {
          ended = true;
          window.setTimeout(() => optsRef.current.onEnd?.(match.summary(), match), 1800);
        }
      } else {
        last = now;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      renderer.draw(ctx, match, pausedRef.current && !isAttract ? 0 : dt, canvas.width, canvas.height, optsRef.current.labels, {
        dpr,
        touch,
      });
    };
    raf = requestAnimationFrame(frame);

    const isTyping = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

    const onKeyDown = (e: KeyboardEvent) => {
      sfx.unlock();
      if (isTyping(e.target)) return;
      if (e.code === "KeyM") {
        toggleMuteRef.current();
        return;
      }
      if (isAttract || optsRef.current.inputBlockedRef?.current) return;
      if (e.code === "Escape" || e.code === "KeyP") {
        setPaused((p) => !p);
        return;
      }
      if (!GAME_CODES.has(e.code)) return;
      e.preventDefault();
      if (e.repeat) return;
      held.add(e.code);
      const map = pvp ? [KEYS.p1, KEYS.p2] : [KEYS.solo];
      map.forEach((m, i) => {
        if ((m.pass as readonly string[]).includes(e.code)) pads[i].pass = true;
        if ((m.skill as readonly string[]).includes(e.code)) pads[i].skill = true;
      });
    };
    const onKeyUp = (e: KeyboardEvent) => held.delete(e.code);
    const onBlur = () => held.clear();
    const onPointer = () => sfx.unlock();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("resize", resize);
      if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
      sfx.crowd(0.05);
    };
    // the loop restarts only when a new match (or the attract scene) begins
  }, [config, attract, canvasRef]);

  const toggleMuteRef = useRef(toggleMute);
  useEffect(() => {
    toggleMuteRef.current = toggleMute;
  }, [toggleMute]);

  const resume = useCallback(() => setPaused(false), []);
  const pause = useCallback(() => setPaused(true), []);

  useEffect(() => {
    setPaused(false);
  }, [config]);

  return { paused, pause, resume, muted, toggleMute, voice, toggleVoice, matchRef };
}
