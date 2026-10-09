"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CareerScreen from "@/components/CareerScreen";
import LegacyScreen from "@/components/LegacyScreen";
import MainMenu, { type MenuTarget } from "@/components/MainMenu";
import ResultScreen from "@/components/ResultScreen";
import { PvpSetup, QuickSetup } from "@/components/SetupScreens";
import TouchControls from "@/components/TouchControls";
import { Button } from "@/components/ui";
import { useMatch } from "@/hooks/useMatch";
import { useProfile, type MatchResult } from "@/hooks/useProfile";
import { stagesFor, type Stage } from "@/lib/career";
import { emptyPad, type Match, type MatchConfig, type MatchSummary, type Pad } from "@/lib/engine/match";
import { HEROES, type HeroId } from "@/lib/heroes";
import { attractConfig, careerConfig, pvpConfig, quickConfig } from "@/lib/setup";

type Screen = "menu" | "career" | "quick" | "pvp" | "legacy" | "match" | "result";

type Fixture =
  | { kind: "career"; stage: Stage }
  | { kind: "quick"; hero: HeroId; level: number }
  | { kind: "pvp"; p1: HeroId };

interface Outcome {
  summary: MatchSummary;
  teams: [string, string];
  result: MatchResult | null;
  pvpWinner: "cr7" | "lm10" | "draws" | null;
}

export default function GoatRaceGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const touchPadRef = useRef<Pad>(emptyPad());
  const inputBlockedRef = useRef(true);
  const [screen, setScreen] = useState<Screen>("menu");
  const [careerHero, setCareerHero] = useState<HeroId>("cr7");
  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [config, setConfig] = useState<MatchConfig | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [attract] = useState(attractConfig);
  const profile = useProfile();
  const { profile: p } = profile;

  useEffect(() => {
    inputBlockedRef.current = screen !== "match";
  }, [screen]);

  const play = useCallback(
    (f: Fixture) => {
      const training = (hero: HeroId) => p.career[hero].training;
      const next =
        f.kind === "career"
          ? careerConfig(f.stage, training(f.stage.hero))
          : f.kind === "quick"
            ? quickConfig(f.hero, f.level, training(f.hero))
            : pvpConfig(f.p1);
      touchPadRef.current = emptyPad();
      profile.clearSync();
      profile.onKickoff();
      setFixture(f);
      setOutcome(null);
      setConfig(next);
      setScreen("match");
    },
    [p.career, profile],
  );

  const onEnd = useCallback(
    (summary: MatchSummary, match: Match) => {
      const teams: [string, string] = [match.config.teams[0].name, match.config.teams[1].name];
      if (!fixture) return;
      if (fixture.kind === "pvp") {
        const line = (hero: HeroId) => summary.heroes.find((h) => h.hero === hero) ?? { goals: 0, assists: 0 };
        const winner = profile.recordRivalry(line("cr7"), line("lm10"), summary.durationMs);
        setOutcome({ summary, teams, result: null, pvpWinner: winner });
      } else {
        const hero = fixture.kind === "career" ? fixture.stage.hero : fixture.hero;
        const h = summary.heroes.find((l) => l.hero === hero);
        const result = profile.recordMatch({
          hero,
          mode: fixture.kind,
          stageId: fixture.kind === "career" ? fixture.stage.id : null,
          goals: h?.goals ?? 0,
          assists: h?.assists ?? 0,
          durationMs: summary.durationMs,
        });
        setOutcome({ summary, teams, result, pvpWinner: null });
      }
      setScreen("result");
    },
    [fixture, profile],
  );

  const quit = useCallback(() => {
    setConfig(null);
    setScreen(fixture?.kind === "career" ? "career" : "menu");
  }, [fixture]);

  const game = useMatch(canvasRef, {
    config: screen === "match" || screen === "result" ? config : null,
    attract,
    touchPadRef,
    inputBlockedRef,
    labels: fixture?.kind === "pvp" ? { p1: "P1", p2: "P2" } : { p1: p.name || "P1" },
    onEnd,
  });

  const open = (target: MenuTarget) => setScreen(target);
  const stage = fixture?.kind === "career" ? fixture.stage : null;
  const nextStage = stage ? stagesFor(stage.hero)[stagesFor(stage.hero).findIndex((s) => s.id === stage.id) + 1] ?? null : null;
  const soloHero = fixture && fixture.kind !== "pvp" ? (fixture.kind === "career" ? fixture.stage.hero : fixture.hero) : null;

  return (
    <div className="relative h-full w-full select-none">
      <canvas ref={canvasRef} className="block h-full w-full touch-none" aria-label="GOAT Race — sân đấu" />

      {/* sound / pause buttons */}
      <div
        className={`absolute right-3 z-30 flex gap-2 ${screen === "match" ? "top-14 flex-col sm:top-3" : "top-3 flex-row"}`}
      >
        {screen === "match" && (
          <button
            type="button"
            aria-label="Tạm dừng"
            onClick={(e) => {
              game.pause();
              e.currentTarget.blur();
            }}
            className="grid h-10 w-10 place-items-center rounded-lg border border-white/20 bg-black/50 text-lg backdrop-blur"
          >
            ⏸
          </button>
        )}
        <button
          type="button"
          aria-label={game.muted ? "Bật âm thanh" : "Tắt âm thanh"}
          onClick={(e) => {
            game.toggleMute();
            e.currentTarget.blur();
          }}
          className="grid h-10 w-10 place-items-center rounded-lg border border-white/20 bg-black/50 text-lg backdrop-blur"
        >
          {game.muted ? "🔇" : "🔊"}
        </button>
        <button
          type="button"
          aria-label={game.voice ? "Tắt giọng bình luận" : "Bật giọng bình luận"}
          title="Giọng bình luận viên"
          onClick={(e) => {
            game.toggleVoice();
            e.currentTarget.blur();
          }}
          className={`grid h-10 w-10 place-items-center rounded-lg border border-white/20 bg-black/50 text-lg backdrop-blur ${
            game.voice ? "" : "opacity-40"
          }`}
        >
          🎙
        </button>
      </div>

      {screen === "match" && soloHero && !game.paused && (
        <TouchControls padRef={touchPadRef} skillName={HEROES[soloHero].skill.name} />
      )}

      {screen === "match" && (
        <p className="pointer-events-none absolute inset-x-0 bottom-72 z-10 hidden text-center text-xs font-semibold text-white/70 [@media(orientation:portrait)_and_(pointer:coarse)]:block">
          ↻ Xoay ngang điện thoại để chơi tốt hơn
        </p>
      )}

      {screen === "match" && game.paused && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-black/70 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <p className="gold-text text-5xl font-bold italic">TẠM DỪNG</p>
            <Button tone="gold" onClick={game.resume} className="w-56">
              ▶ Tiếp tục
            </Button>
            <Button onClick={() => fixture && play(fixture)} className="w-56">
              ↻ Đá lại từ đầu
            </Button>
            <Button onClick={quit} className="w-56">
              ✕ Bỏ trận
            </Button>
          </div>
        </div>
      )}

      {screen === "menu" && <MainMenu profile={p} onName={profile.setName} onOpen={open} />}
      {screen === "career" && (
        <CareerScreen
          profile={p}
          hero={careerHero}
          onBack={() => setScreen("menu")}
          onPlay={(s) => {
            setCareerHero(s.hero);
            play({ kind: "career", stage: s });
          }}
          onTrain={profile.train}
        />
      )}
      {screen === "quick" && (
        <QuickSetup onBack={() => setScreen("menu")} onStart={(hero, level) => play({ kind: "quick", hero, level })} />
      )}
      {screen === "pvp" && <PvpSetup onBack={() => setScreen("menu")} onStart={(p1) => play({ kind: "pvp", p1 })} />}
      {screen === "legacy" && <LegacyScreen profile={p} onBack={() => setScreen("menu")} />}
      {screen === "result" && outcome && (
        <ResultScreen
          summary={outcome.summary}
          teams={outcome.teams}
          result={outcome.result}
          stage={stage}
          nextStage={nextStage}
          pvpWinner={outcome.pvpWinner}
          sync={profile.sync}
          name={p.name}
          onName={profile.setName}
          onAgain={() => fixture && play(fixture)}
          onNext={() => nextStage && play({ kind: "career", stage: nextStage })}
          onMenu={() => {
            setConfig(null);
            setScreen(fixture?.kind === "career" ? "career" : "menu");
          }}
        />
      )}
    </div>
  );
}
