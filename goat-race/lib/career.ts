import type { HeroId } from "@/lib/heroes";

/*
 * Career Mode: the historic nights of both careers. Objectives live here so the
 * server can award trophies from a submitted match without trusting the client.
 */

export type TrophyKind = "league" | "cup" | "ucl" | "euro" | "copa" | "worldcup";

export const TROPHY_LABELS: Record<TrophyKind | "ballondor", { name: string; icon: string }> = {
  league: { name: "Vô địch quốc gia", icon: "🏅" },
  cup: { name: "Cúp quốc gia", icon: "🥇" },
  ucl: { name: "Champions League", icon: "🏆" },
  euro: { name: "EURO", icon: "🇪🇺" },
  copa: { name: "Copa América", icon: "🏆" },
  worldcup: { name: "World Cup", icon: "🌍" },
  ballondor: { name: "Quả bóng Vàng", icon: "⚽" },
};

export interface Objective {
  goals: number;
  assists: number;
}

export interface Stage {
  id: string;
  hero: HeroId;
  year: number;
  age: number;
  title: string;
  club: string;
  opponent: string;
  stadium: string;
  /** opponent kit */
  kit: { shirt: string; shorts: string };
  story: string;
  objective: Objective;
  /** beat this as well to win the Ballon d'Or that season */
  ballonDor?: Objective;
  trophy: TrophyKind;
  /** 1 (gentle) … 5 (brutal): defender count, pace and keeper reflexes */
  difficulty: number;
}

const s = (stage: Stage) => stage;

export const STAGES: Stage[] = [
  /* ------------------------------------------------------------- CR7 */
  s({
    id: "cr7-2008-pl", hero: "cr7", year: 2008, age: 23, title: "Old Trafford rực lửa", club: "Man United",
    opponent: "Aston Villa", stadium: "Old Trafford", kit: { shirt: "#7c2d12", shorts: "#7dd3fc" },
    story: "Mùa giải 42 bàn. Chàng trai Madeira bùng nổ ở Premier League.",
    objective: { goals: 2, assists: 0 }, trophy: "league", difficulty: 1,
  }),
  s({
    id: "cr7-2008-ucl", hero: "cr7", year: 2008, age: 23, title: "Đêm mưa Moscow", club: "Man United",
    opponent: "Chelsea", stadium: "Luzhniki", kit: { shirt: "#1d4ed8", shorts: "#1d4ed8" },
    story: "Chung kết Champions League. Cú đánh đầu mở tỷ số — và Quả bóng Vàng đầu tiên.",
    objective: { goals: 1, assists: 1 }, ballonDor: { goals: 3, assists: 1 }, trophy: "ucl", difficulty: 2,
  }),
  s({
    id: "cr7-2012-clasico", hero: "cr7", year: 2012, age: 27, title: "Calma, calma — Camp Nou", club: "Real Madrid",
    opponent: "Barcelona", stadium: "Camp Nou", kit: { shirt: "#a50044", shorts: "#004d98" },
    story: "Siêu kinh điển quyết định La Liga 100 điểm. Ghi bàn rồi ra hiệu khán đài: bình tĩnh.",
    objective: { goals: 2, assists: 0 }, trophy: "league", difficulty: 3,
  }),
  s({
    id: "cr7-2014-ucl", hero: "cr7", year: 2014, age: 29, title: "La Décima ở Lisbon", club: "Real Madrid",
    opponent: "Atlético Madrid", stadium: "Estádio da Luz", kit: { shirt: "#dc2626", shorts: "#1e3a8a" },
    story: "Chiếc cúp châu Âu thứ 10 cho Real. 17 bàn một mùa Champions League.",
    objective: { goals: 2, assists: 1 }, ballonDor: { goals: 4, assists: 1 }, trophy: "ucl", difficulty: 3,
  }),
  s({
    id: "cr7-2016-euro", hero: "cr7", year: 2016, age: 31, title: "Saint-Denis không thể quên", club: "Bồ Đào Nha",
    opponent: "Pháp", stadium: "Stade de France", kit: { shirt: "#1e40af", shorts: "#f8fafc" },
    story: "Chấn thương từ sớm, nhưng vẫn chỉ đạo đồng đội đến chức vô địch EURO.",
    objective: { goals: 1, assists: 2 }, ballonDor: { goals: 3, assists: 2 }, trophy: "euro", difficulty: 3,
  }),
  s({
    id: "cr7-2017-ucl", hero: "cr7", year: 2017, age: 32, title: "Cú đúp ở Cardiff", club: "Real Madrid",
    opponent: "Juventus", stadium: "Millennium Stadium", kit: { shirt: "#f8fafc", shorts: "#111827" },
    story: "Hai lần chọc thủng Buffon. Real bảo vệ thành công ngôi vương châu Âu.",
    objective: { goals: 2, assists: 0 }, ballonDor: { goals: 4, assists: 0 }, trophy: "ucl", difficulty: 4,
  }),
  s({
    id: "cr7-2019-serie-a", hero: "cr7", year: 2019, age: 34, title: "Turin & Scudetto", club: "Juventus",
    opponent: "Inter", stadium: "Allianz Stadium", kit: { shirt: "#1e3a8a", shorts: "#111827" },
    story: "Vô địch ở Anh, Tây Ban Nha và giờ là Italia.",
    objective: { goals: 3, assists: 0 }, trophy: "league", difficulty: 4,
  }),
  s({
    id: "cr7-2025-spl", hero: "cr7", year: 2025, age: 40, title: "Al-Awwal Park — tuổi 40", club: "Al Nassr",
    opponent: "Al Hilal", stadium: "Al-Awwal Park", kit: { shirt: "#1d4ed8", shorts: "#f8fafc" },
    story: "Tuổi 40 vẫn săn bàn như máy. Chỉ có kỷ luật mới đưa bạn tới đây.",
    objective: { goals: 3, assists: 1 }, trophy: "cup", difficulty: 4,
  }),
  s({
    id: "cr7-2025-nations", hero: "cr7", year: 2025, age: 40, title: "Munich — Nations League", club: "Bồ Đào Nha",
    opponent: "Tây Ban Nha", stadium: "Allianz Arena", kit: { shirt: "#dc2626", shorts: "#1e3a8a" },
    story: "Danh hiệu quốc tế ở tuổi 40. Cột mốc 1000 bàn đã ở ngay trước mắt.",
    objective: { goals: 3, assists: 1 }, ballonDor: { goals: 5, assists: 1 }, trophy: "euro", difficulty: 5,
  }),

  /* ------------------------------------------------------------ LM10 */
  s({
    id: "lm10-2009-clasico", hero: "lm10", year: 2009, age: 21, title: "Bernabéu 2-6", club: "Barcelona",
    opponent: "Real Madrid", stadium: "Santiago Bernabéu", kit: { shirt: "#f8fafc", shorts: "#f8fafc" },
    story: "Số 9 ảo lần đầu xuất hiện. Siêu kinh điển đi vào lịch sử.",
    objective: { goals: 1, assists: 1 }, trophy: "league", difficulty: 1,
  }),
  s({
    id: "lm10-2009-ucl", hero: "lm10", year: 2009, age: 21, title: "Cú đánh đầu ở Rome", club: "Barcelona",
    opponent: "Man United", stadium: "Stadio Olimpico", kit: { shirt: "#f8fafc", shorts: "#111827" },
    story: "Chung kết Champions League. Bàn đánh đầu bay người — và Quả bóng Vàng đầu tiên.",
    objective: { goals: 1, assists: 1 }, ballonDor: { goals: 2, assists: 2 }, trophy: "ucl", difficulty: 2,
  }),
  s({
    id: "lm10-2011-ucl", hero: "lm10", year: 2011, age: 23, title: "Wembley hoàn hảo", club: "Barcelona",
    opponent: "Man United", stadium: "Wembley", kit: { shirt: "#dc2626", shorts: "#f8fafc" },
    story: "Đội bóng hay nhất mọi thời đại. Tiki-taka xé nát hàng thủ.",
    objective: { goals: 1, assists: 2 }, ballonDor: { goals: 2, assists: 3 }, trophy: "ucl", difficulty: 2,
  }),
  s({
    id: "lm10-2012-91", hero: "lm10", year: 2012, age: 25, title: "Năm 91 bàn", club: "Barcelona",
    opponent: "Real Betis", stadium: "Camp Nou", kit: { shirt: "#15803d", shorts: "#f8fafc" },
    story: "Phá kỷ lục ghi bàn trong một năm dương lịch của Gerd Müller.",
    objective: { goals: 3, assists: 0 }, ballonDor: { goals: 4, assists: 1 }, trophy: "cup", difficulty: 3,
  }),
  s({
    id: "lm10-2015-ucl", hero: "lm10", year: 2015, age: 27, title: "MSN ở Berlin", club: "Barcelona",
    opponent: "Juventus", stadium: "Olympiastadion", kit: { shirt: "#111827", shorts: "#111827" },
    story: "Messi – Suárez – Neymar. Cú ăn ba thứ hai.",
    objective: { goals: 1, assists: 2 }, ballonDor: { goals: 3, assists: 2 }, trophy: "ucl", difficulty: 3,
  }),
  s({
    id: "lm10-2021-copa", hero: "lm10", year: 2021, age: 34, title: "Maracanã cuối cùng cũng mỉm cười", club: "Argentina",
    opponent: "Brazil", stadium: "Maracanã", kit: { shirt: "#facc15", shorts: "#1d4ed8" },
    story: "Danh hiệu lớn đầu tiên cùng đội tuyển, ngay trên đất Brazil.",
    objective: { goals: 1, assists: 2 }, ballonDor: { goals: 2, assists: 3 }, trophy: "copa", difficulty: 4,
  }),
  s({
    id: "lm10-2022-wc", hero: "lm10", year: 2022, age: 35, title: "Lusail — giấc mơ vàng", club: "Argentina",
    opponent: "Pháp", stadium: "Lusail Stadium", kit: { shirt: "#1e3a8a", shorts: "#f8fafc" },
    story: "Chung kết World Cup vĩ đại nhất lịch sử. Hoàn tất sự nghiệp.",
    objective: { goals: 2, assists: 1 }, ballonDor: { goals: 3, assists: 2 }, trophy: "worldcup", difficulty: 5,
  }),
  s({
    id: "lm10-2023-miami", hero: "lm10", year: 2023, age: 36, title: "Hồng ở Miami", club: "Inter Miami",
    opponent: "Nashville", stadium: "Geodis Park", kit: { shirt: "#facc15", shorts: "#111827" },
    story: "Leagues Cup — danh hiệu đầu tiên trong lịch sử Inter Miami.",
    objective: { goals: 2, assists: 2 }, trophy: "cup", difficulty: 4,
  }),
];

export const stagesFor = (hero: HeroId) => STAGES.filter((st) => st.hero === hero);

export function findStage(id: unknown): Stage | null {
  return typeof id === "string" ? STAGES.find((st) => st.id === id) ?? null : null;
}

const meets = (o: Objective, goals: number, assists: number) => goals >= o.goals && assists >= o.assists;

export interface StageOutcome {
  trophy: TrophyKind | null;
  ballonDor: boolean;
}

/** Trophies a match result earns on a stage. */
export function evaluateStage(stage: Stage, goals: number, assists: number): StageOutcome {
  const won = meets(stage.objective, goals, assists);
  return {
    trophy: won ? stage.trophy : null,
    ballonDor: won && !!stage.ballonDor && meets(stage.ballonDor, goals, assists),
  };
}
