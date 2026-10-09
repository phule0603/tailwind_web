"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { evaluateStage, findStage, type StageOutcome } from "@/lib/career";
import { GOAT_TITLE_POINTS } from "@/lib/game-config";
import { drillCost, HEROES, MAX_DRILL_LEVEL, type HeroId, type TrainingLevels } from "@/lib/heroes";
import {
  carryIndex,
  emptyTotals,
  isPlayerId,
  sanitizeName,
  scoreMatch,
  totalsDelta,
  TOTAL_KEYS,
  type ApiError,
  type HeroTotals,
  type MatchMode,
  type RenameResponse,
  type RivalryResponse,
  type SubmitResponse,
  type TokenResponse,
} from "@/lib/leaderboard/shared";

/* The player's profile on this device: name, career, training, personal Legacy — and the server sync. */

const KEY = "goat:profile:v1";

export interface StageRecord {
  best: number;
  trophy: boolean;
  ballonDor: boolean;
}

export interface CareerState {
  stages: Record<string, StageRecord>;
  training: TrainingLevels;
  /** unspent training points */
  points: number;
}

export interface Profile {
  playerId: string;
  name: string;
  career: Record<HeroId, CareerState>;
  totals: Record<HeroId, HeroTotals>;
  rivalry: { cr7: number; lm10: number; draws: number };
  quickBest: Record<HeroId, number>;
}

export interface MatchReport {
  hero: HeroId;
  mode: MatchMode;
  stageId: string | null;
  goals: number;
  assists: number;
  durationMs: number;
}

export type SyncStatus =
  | { state: "saving" }
  | { state: "saved"; rank: number; improved: boolean; best: number }
  | { state: "local-only" }
  | { state: "needs-name" }
  | { state: "error"; error: ApiError | "offline" };

export interface MatchResult {
  report: MatchReport;
  score: number;
  outcome: StageOutcome | null;
  firstClear: boolean;
  pointsEarned: number;
  newBest: boolean;
}

const emptyCareer = (): CareerState => ({ stages: {}, training: {}, points: 0 });

const fresh = (): Profile => ({
  playerId: "",
  name: "",
  career: { cr7: emptyCareer(), lm10: emptyCareer() },
  totals: { cr7: emptyTotals(), lm10: emptyTotals() },
  rivalry: { cr7: 0, lm10: 0, draws: 0 },
  quickBest: { cr7: 0, lm10: 0 },
});

function newPlayerId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function load(): Profile {
  const base = fresh();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Profile> | null;
    if (raw && typeof raw === "object") {
      for (const hero of ["cr7", "lm10"] as const) {
        const c = raw.career?.[hero];
        if (c) base.career[hero] = { stages: c.stages ?? {}, training: c.training ?? {}, points: Number(c.points) || 0 };
        const t = raw.totals?.[hero];
        if (t) for (const k of TOTAL_KEYS) base.totals[hero][k] = Number(t[k]) || 0;
        base.quickBest[hero] = Number(raw.quickBest?.[hero]) || 0;
      }
      if (raw.rivalry) base.rivalry = { ...base.rivalry, ...raw.rivalry };
      base.name = sanitizeName(raw.name) ?? "";
      if (isPlayerId(raw.playerId)) base.playerId = raw.playerId;
    }
  } catch {
    /* corrupt or blocked storage: start fresh */
  }
  if (!base.playerId) base.playerId = newPlayerId();
  return base;
}

function save(p: Profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable: the game still works, it just won't remember */
  }
}

/** Career GOAT points: the best score on every stage of a hero's career. */
export function careerPoints(c: CareerState) {
  return Object.values(c.stages).reduce((sum, s) => sum + s.best, 0);
}

export function isGoat(c: CareerState) {
  return careerPoints(c) >= GOAT_TITLE_POINTS;
}

async function requestToken(): Promise<string | null> {
  try {
    const res = await fetch("/api/token", { method: "POST" });
    const data = (await res.json()) as TokenResponse;
    return data.enabled ? data.token : null;
  } catch {
    return null;
  }
}

export function useProfile() {
  const [profile, setProfile] = useState<Profile>(fresh);
  const [ready, setReady] = useState(false);
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const profileRef = useRef(profile);
  const tokenRef = useRef<Promise<string | null> | null>(null);
  const pendingRef = useRef<{ report: MatchReport; token: Promise<string | null> } | null>(null);
  const enabledRef = useRef<boolean | null>(null);

  useEffect(() => {
    const p = load();
    save(p);
    profileRef.current = p;
    // hydrate from localStorage after mount (the page itself is prerendered)
    setProfile(p);
    setReady(true);
  }, []);

  const update = useCallback((fn: (p: Profile) => Profile) => {
    const next = fn(profileRef.current);
    profileRef.current = next;
    save(next);
    setProfile(next);
  }, []);

  /** Kickoff: ask the server to sign the start of this match. */
  const onKickoff = useCallback(() => {
    tokenRef.current = enabledRef.current === false ? Promise.resolve(null) : requestToken();
  }, []);

  const submit = useCallback(async (report: MatchReport, token: Promise<string | null>) => {
    const p = profileRef.current;
    setSync({ state: "saving" });
    const t = await token;
    if (!t) {
      enabledRef.current = enabledRef.current ?? false;
      setSync({ state: "local-only" });
      return;
    }
    try {
      const res = await fetch("/api/leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: p.playerId, name: p.name, token: t, ...report }),
      });
      const data = (await res.json()) as SubmitResponse;
      if (!data.ok) setSync({ state: "error", error: data.error });
      else setSync({ state: "saved", rank: data.rank, improved: data.improved, best: data.best });
    } catch {
      setSync({ state: "error", error: "offline" });
    }
  }, []);

  /** A solo match is over: update career + personal Legacy, then sync. */
  const recordMatch = useCallback(
    (report: MatchReport): MatchResult => {
      const stage = report.mode === "career" ? findStage(report.stageId) : null;
      const outcome = stage ? evaluateStage(stage, report.goals, report.assists) : null;
      const score = scoreMatch(report.goals, report.assists, outcome);
      let firstClear = false;
      let pointsEarned = 0;
      let newBest = false;
      update((prev) => {
        const p: Profile = structuredClone(prev);
        const hero = report.hero;
        const delta = totalsDelta(report.goals, report.assists, outcome, !!outcome?.trophy);
        for (const k of TOTAL_KEYS) p.totals[hero][k] += delta[k];
        if (stage) {
          const career = p.career[hero];
          const rec = career.stages[stage.id] ?? { best: 0, trophy: false, ballonDor: false };
          firstClear = !!outcome?.trophy && !rec.trophy;
          pointsEarned = (outcome?.trophy ? (firstClear ? 3 : 1) : 0) + (outcome?.ballonDor && !rec.ballonDor ? 2 : 0);
          newBest = score > rec.best;
          career.stages[stage.id] = {
            best: Math.max(rec.best, score),
            trophy: rec.trophy || !!outcome?.trophy,
            ballonDor: rec.ballonDor || !!outcome?.ballonDor,
          };
          career.points += pointsEarned;
        } else {
          newBest = score > p.quickBest[hero];
          p.quickBest[hero] = Math.max(p.quickBest[hero], score);
        }
        return p;
      });

      const token = tokenRef.current ?? Promise.resolve(null);
      tokenRef.current = null;
      if (enabledRef.current === false) setSync({ state: "local-only" });
      else if (!profileRef.current.name) {
        pendingRef.current = { report, token };
        setSync({ state: "needs-name" });
      } else void submit(report, token);
      return { report, score, outcome, firstClear, pointsEarned, newBest };
    },
    [submit, update],
  );

  /** A PvP match is over: personal Legacy + the global rivalry count. */
  const recordRivalry = useCallback(
    (cr7: { goals: number; assists: number }, lm10: { goals: number; assists: number }, durationMs: number) => {
      const diff = carryIndex(cr7) - carryIndex(lm10);
      const winner = diff > 0 ? "cr7" : diff < 0 ? "lm10" : "draws";
      update((prev) => {
        const p: Profile = structuredClone(prev);
        for (const [hero, s] of [
          ["cr7", cr7],
          ["lm10", lm10],
        ] as const) {
          const d = totalsDelta(s.goals, s.assists, null, winner === hero);
          for (const k of TOTAL_KEYS) p.totals[hero][k] += d[k];
        }
        p.rivalry[winner] += 1;
        return p;
      });
      const token = tokenRef.current ?? Promise.resolve(null);
      tokenRef.current = null;
      void (async () => {
        const t = await token;
        if (!t) return;
        try {
          const res = await fetch("/api/rivalry", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: t, durationMs, cr7, lm10 }),
          });
          (await res.json()) as RivalryResponse;
        } catch {
          /* the local record is kept either way */
        }
      })();
      return winner;
    },
    [update],
  );

  /** Saves the display name; returns false if it has no letters or digits. */
  const setName = useCallback(
    (raw: string) => {
      const clean = sanitizeName(raw);
      if (!clean) return false;
      const changed = clean !== profileRef.current.name;
      update((p) => ({ ...p, name: clean }));
      const pending = pendingRef.current;
      if (pending) {
        pendingRef.current = null;
        void submit(pending.report, pending.token);
      } else if (changed) {
        void fetch("/api/leaderboard", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId: profileRef.current.playerId, name: clean }),
        })
          .then((res) => res.json() as Promise<RenameResponse>)
          .catch(() => {});
      }
      return true;
    },
    [submit, update],
  );

  /** Spends training points on a drill level. */
  const train = useCallback(
    (hero: HeroId, drillId: string) => {
      const drill = HEROES[hero].drills.find((d) => d.id === drillId);
      if (!drill) return false;
      const career = profileRef.current.career[hero];
      const level = career.training[drillId] ?? 0;
      const cost = drillCost(level + 1);
      if (level >= MAX_DRILL_LEVEL || career.points < cost) return false;
      update((prev) => {
        const p: Profile = structuredClone(prev);
        p.career[hero].training[drillId] = level + 1;
        p.career[hero].points -= cost;
        return p;
      });
      return true;
    },
    [update],
  );

  const clearSync = useCallback(() => setSync(null), []);

  return { profile, ready, sync, clearSync, onKickoff, recordMatch, recordRivalry, setName, train };
}
