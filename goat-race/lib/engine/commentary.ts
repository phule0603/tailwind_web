import { HEROES } from "@/lib/heroes";
import type { Body, Match, MatchEvent, ShotType } from "@/lib/engine/match";

/* The commentator: one Vietnamese line for the moments that deserve it. */

const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

function who(m: Match, b: Body | null) {
  if (!b) return "cầu thủ";
  if (b.hero) return HEROES[b.hero].short.charAt(0) + HEROES[b.hero].short.slice(1).toLowerCase();
  if (b.role === "gk") return `thủ thành ${m.config.teams[b.team].name}`;
  return `số ${b.number} ${m.config.teams[b.team].name}`;
}

const GOAL_LINES: Record<ShotType, string[]> = {
  header: ["{s} bay lên như có lò xo — ĐÁNH ĐẦU! VÀOOO!", "Cú đánh đầu như trời giáng của {s}!"],
  penalty: ["{s} lạnh lùng trên chấm 11 mét. VÀO!", "Penalty hoàn hảo của {s}, thủ môn đứng nhìn!"],
  tapin: ["{s} có mặt đúng lúc, đệm bóng cận thành! VÀO!", "Bản năng sát thủ! {s} đệm bóng tung lưới!"],
  longrange: ["Từ khoảng cách rất xa... {s}! KHÔNG THỂ TIN NỔI!", "Một cú sút xa như tên lửa của {s}!"],
  knuckle: ["KNUCKLEBALL! Bóng vặn sườn, thủ môn chỉ biết đứng nhìn!", "Cú sút không xoáy kinh điển của {s}!"],
  finesse: ["Cứa lòng ma thuật! Trái bóng cuộn vào góc xa — {s}!", "Một nét cọ của nghệ sĩ {s}! Đẹp như tranh!"],
  solo: ["{s} qua người như chỗ không người... VÀOOOO! Bàn thắng solo để đời!", "Không ai cản nổi {s}! Một mình xé nát hàng thủ!"],
  normal: ["VÀOOOOO! {s} ghi bàn!", "{s} dứt điểm chuẩn xác! Lưới rung!", "GOOOL! {s} không bỏ lỡ cơ hội!"],
};

export function commentate(e: MatchEvent, m: Match): string | null {
  const stadium = m.config.stadium;
  switch (e.kind) {
    case "kickoff":
      return m.clock < 0.1 ? `Chào mừng quý vị đến với ${stadium}! Trận đấu bắt đầu!` : null;
    case "goal": {
      if (e.ownGoal) return `Phản lưới nhà! Một ngày đáng quên của ${m.config.teams[e.team === 0 ? 1 : 0].name}!`;
      let line = pick(GOAL_LINES[e.type]).replace("{s}", who(m, e.scorer));
      if (e.assist?.hero) line += ` Kiến tạo: ${who(m, e.assist)}.`;
      const hl = m.heroes.find((h) => e.scorer?.hero === h.hero && h.team === e.team);
      if (hl?.goals === 3) line = `HAT-TRICK!!! ${line}`;
      else if (hl?.goals === 2) line += " Cú đúp!";
      return line;
    }
    case "save":
      return e.caught
        ? pick([`${who(m, e.keeper)} bắt gọn gàng.`, "Thủ môn đọc tình huống quá chuẩn!"])
        : pick([`Cứu thua xuất thần của ${who(m, e.keeper)}!`, "Đôi tay thép! Bóng bị đẩy ra!"]);
    case "woodwork":
      return pick(["CỘT DỌC! Khán đài ôm đầu tiếc nuối!", "Trúng khung thành! Chỉ thiếu vài centimet!"]);
    case "miss":
      return e.by?.hero ? pick([`${who(m, e.by)} dứt điểm chệch cột.`, "Bóng đi ra ngoài trong tiếc nuối!"]) : null;
    case "dribble":
      if (!e.by.hero || Math.random() > 0.35) return null;
      return e.by.hero === "lm10"
        ? pick(["Messi lướt qua như cơn gió!", "Bóng như dính vào chân Messi!", "Lại là pha xử lý ma thuật!"])
        : pick(["Ronaldo đảo chân rồi bứt tốc!", "Tốc độ và sức mạnh của CR7!", "Ronaldo vượt qua đối thủ dễ dàng!"]);
    case "skill":
      return e.by.hero === "lm10"
        ? "La Pausa... Messi dừng lại, cả thế giới như ngừng thở."
        : "Ronaldo bật TURBO — không ai theo kịp cỗ máy này!";
    case "foul":
      return `Phạm lỗi với ${who(m, e.on)} trong vòng cấm! Trọng tài chỉ tay vào chấm phạt đền!`;
    case "corner":
      return "Phạt góc. Các trung vệ dâng cao...";
    case "fulltime":
      return `Hồi còi kết thúc! Tỷ số chung cuộc ${m.score[0]} – ${m.score[1]} tại ${stadium}.`;
    default:
      return null;
  }
}
