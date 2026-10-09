# GOAT RACE: Clash of Titans

Thế giới bóng đá chia làm hai nửa, nhưng chỉ có một đỉnh cao. Game bóng đá arcade góc nhìn từ trên xuống: dẫn dắt **Cristiano Ronaldo** hoặc **Lionel Messi** qua những đêm huyền thoại, đối đầu 1v1 với bạn bè và đua nhau trên bảng kỷ lục toàn cầu.

Xây dựng bằng **Next.js (App Router) + HTML5 Canvas + Tailwind CSS**, lưu trữ bằng **Upstash Redis**, deploy tự động lên **Vercel** qua GitHub Actions — cùng stack và quy trình CI/CD với game *Tam Thái Tử* (nhánh `claude/zen-archimedes-f7jkcn` của `One-More-Run-FG`).

## Lối chơi

### Tam giác tối thượng: Bàn thắng – Kiến tạo – Danh hiệu

- **Bàn thắng** — mỗi bàn được phân loại: *đánh đầu*, *sút xa*, *knuckleball* (CR7), *cứa lòng* (LM10, bóng cong vào góc xa), *đệm bóng cận thành*, *penalty*, *solo* (qua ≥ 2 người rồi ghi bàn).
- **Kiến tạo** — chuyền cho đồng đội ghi bàn. Messi chọc khe dẫn trước bước chạy đồng đội; Ronaldo đòi bóng *làm tường* (1-2).
- **Danh hiệu** — mỗi chặng Career có mục tiêu; đạt mục tiêu là giành cúp (VĐQG, Cúp, Champions League, EURO, Copa América, World Cup), vượt mục tiêu “xuất sắc” là giành **Quả bóng Vàng**.

**Điểm GOAT** của một trận = bàn × 100 + kiến tạo × 60 + cú đúp 50 / hat-trick 150 + danh hiệu 200 + Quả bóng Vàng 300. Tổng điểm cao nhất của mọi chặng ≥ 6000 mở khoá danh xưng **THE GOAT**.

### Hai phong cách — hai lộ trình

| | Tuyến CR7 — *The Machine* | Tuyến LM10 — *The Magician* |
| --- | --- | --- |
| Thế mạnh | Tốc độ, lực sút, đánh đầu, thể lực | Rê bóng, chuyền bóng, nhãn quan |
| Kỹ năng | **TURBO** — bứt tốc ×1,45 trong 2,2 s | **LA PAUSA** — thời gian chậm lại 2,5 s, chỉ Messi di chuyển bình thường |
| Nội tại | Knuckleball khi sút xa căng hết lực | Chọc khe, cứa lòng, đồng đội dứt điểm tốt hơn |
| Giáo án | Gym 5h sáng, chạy nước rút, dứt điểm 1000 quả, **bồn đá & ngủ 5 giấc** (chống lão hoá, giữ phong độ qua tuổi 40) | Rondo La Masia, rê bóng qua cọc, cứa lòng sút phạt, đọc trận đấu |

Sau 32 tuổi tốc độ, thể lực và lực sút giảm 2 điểm/năm; các bài tập “longevity” làm chậm quá trình này. Điểm tập nhận được khi giành danh hiệu (+3 lần đầu, +1 khi đá lại, +2 cho Quả bóng Vàng đầu tiên của chặng).

### Chế độ chơi

- **Career Mode** — 9 chặng của CR7 (Old Trafford 2008 → Al-Awwal Park & Nations League 2025, tuổi 40) và 8 chặng của LM10 (Bernabéu 2-6 → Lusail 2022 → Miami 2023). Mở khoá tuần tự, độ khó tăng dần (số hậu vệ, tốc độ, phản xạ thủ môn).
- **PvP Rivalry** — 2 người trên cùng bàn phím, mỗi bên một siêu sao + 2 đồng đội + thủ môn, 120 giây. Người thắng có **Chỉ số gánh team** (bàn × 3 + kiến tạo × 2) cao hơn; kết quả cộng vào bảng Rivalry toàn cầu.
- **Legacy Mode** — so sánh trực quan bàn thắng, kiến tạo, hat-trick, cú đúp, danh hiệu, Quả bóng Vàng… của hai huyền thoại (toàn cầu và của riêng bạn), cùng top 10 trận đấu với mỗi siêu sao. Tự cập nhật mỗi 5 giây.
- **Đá nhanh** — một trận 90 giây, chọn siêu sao và 5 mức độ khó.

### Điều khiển

| Thao tác | Bàn phím (1 người) | Cảm ứng | PvP — P1 | PvP — P2 |
| --- | --- | --- | --- | --- |
| Di chuyển | WASD / mũi tên | Cần ảo | W A S D | ↑ ← ↓ → |
| Sút (giữ để lấy đà; ↑/↓ chọn góc) | J / Space | SÚT | F | / |
| Chuyền (theo hướng cần) | K | CHUYỀN | G | . |
| Kỹ năng | L / Shift | TURBO / LA PAUSA | Shift trái / R | Shift phải / , |
| Tạm dừng · Tắt tiếng | Esc · M | ⏸ · 🔊 | Esc | |

Không có bóng: nhấn SÚT khi bóng bổng tới gần để **đánh đầu**; nhấn CHUYỀN khi đồng đội giữ bóng để đòi **làm tường**; nhấn SÚT khi đang đứng trong vòng cấm để đồng đội **tạt bóng**; áp sát đối thủ cầm bóng rồi nhấn SÚT/CHUYỀN để **xoạc**. Bị phạm lỗi trong vòng cấm có thể được hưởng **penalty**.

### Đồ hoạ & âm thanh

- Cầu thủ vẽ bằng canvas: sải chân, vung tay, thủ môn bay người; ăn mừng **SIUUU** (bật nhảy xoay người) và **chỉ tay lên trời**.
- Khán đài theo màu áo hai đội, bảng LED chạy tên sân (Santiago Bernabéu, Camp Nou, Lusail, Al-Awwal Park…), khán giả nhảy lên khi có bàn thắng.
- Âm thanh tổng hợp bằng WebAudio (không cần file): tiếng hò reo, “ooh” tiếc nuối, còi trọng tài, tiếng sút, trúng cột, tiếng hô SIUUU của khán đài.
- **Bình luận viên** tiếng Việt theo từng pha bóng (dòng chữ dưới màn hình) và đọc bằng giọng nói (Web Speech API, nút 🎙 để bật/tắt).

## Chạy local

Yêu cầu: Node.js 24 (`engines` trong `package.json` là `24.x`; Vercel dùng giá trị này thay cho cài đặt Node.js của project).

```bash
cd goat-race
npm install
npm run dev
```

Mở <http://localhost:3000>. Khi chạy local, bảng xếp hạng và Legacy dùng bộ nhớ tạm (mất khi tắt server) nên chơi thử được ngay.

```bash
npm test            # unit test (Vitest): luật điểm, career, store, API, engine
npm run typecheck   # kiểm tra TypeScript
npm run build       # build production
npm start           # chạy bản production
```

## Bảng xếp hạng & Legacy toàn cầu (Upstash Redis — miễn phí)

1. Vercel → project → **Storage** → **Create Database** → **Upstash** (Redis, gói Free) → **Connect** vào project.
2. Vercel tự thêm `KV_REST_API_URL` và `KV_REST_API_TOKEN`.
3. Redeploy.

Chưa thiết lập Redis thì game vẫn chạy: mọi thứ lưu trên thiết bị, tab toàn cầu ghi rõ là chưa bật.

| Biến môi trường | Bắt buộc | Ý nghĩa |
| --- | --- | --- |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Có (để bật bảng toàn cầu) | Do tích hợp Upstash của Vercel tự thêm. Cũng nhận `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` |
| `LEADERBOARD_SECRET` | Không | Khoá ký run token; mặc định suy ra từ token Redis |
| `LEADERBOARD_STORE=memory` | Không | Dùng bộ nhớ tạm cả ở production (chỉ để thử nghiệm) |

**Chống gian lận** (game chạy trên trình duyệt nên không thể tuyệt đối):

- mỗi trận cần *run token* do server ký lúc giao bóng, dùng một lần; thời gian thi đấu khai báo không được dài hơn thời gian thực kể từ lúc cấp token;
- server tự tính điểm GOAT và danh hiệu từ số bàn/kiến tạo và mục tiêu của chặng — client không gửi điểm;
- tổng bàn + kiến tạo bị giới hạn theo thời lượng trận (mỗi chu kỳ bàn thắng ≥ 4 s, test engine đảm bảo mọi trận hợp lệ đều qua được kiểm tra này);
- giới hạn số lần gửi theo IP; tên được lọc ký tự.

## Deploy tự động (GitHub Actions → Vercel)

Workflow `.github/workflows/goat-race.yml` (ở gốc repo) chạy khi có thay đổi trong `goat-race/`:

1. **Kiểm tra:** `npm ci` → typecheck → unit test → build (trong thư mục `goat-race/`).
2. **Deploy:** push lên `main` → **Production**; nhánh khác → **Preview**. Link nằm trong trang tóm tắt của lần chạy.

Thiết lập một lần:

1. Trên máy của bạn:
   ```bash
   cd goat-race
   npx vercel login
   npx vercel link            # tạo / liên kết project (gợi ý tên: goat-race)
   cat .vercel/project.json   # lấy "orgId" và "projectId"
   ```
   Để trống mục **Root Directory** của project trên Vercel — CLI được chạy từ chính thư mục `goat-race/`.
   Nếu Vercel báo `Found invalid or discontinued Node.js Version: "18.x"`: vào **Settings → Build and Deployment → Node.js Version** chọn **24.x** (với `engines` = `24.x` Vercel cũng tự dùng Node 24 khi build từ `goat-race/`).
2. Tạo token tại <https://vercel.com/account/tokens>.
3. GitHub → **Settings** → **Secrets and variables** → **Actions**: thêm `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
4. Push — mọi lần push sau tự deploy.

Chưa có secrets thì workflow vẫn kiểm tra và chỉ bỏ qua bước deploy. Chỉ dùng **một** cách deploy tự động: nếu import repo bằng Vercel Git Integration (Root Directory = `goat-race`) thì xoá job `deploy`.

Deploy thủ công: `cd goat-race && npx vercel` (Preview) hoặc `npx vercel --prod`.

## Cấu trúc thư mục

```
goat-race/
  app/
    page.tsx, layout.tsx, globals.css, icon.svg
    api/token/route.ts          # POST: run token khi giao bóng
    api/leaderboard/route.ts    # GET top 10 theo siêu sao · POST gửi trận · PATCH đổi tên
    api/legacy/route.ts         # GET tổng kỷ lục của hai huyền thoại
    api/rivalry/route.ts        # POST kết quả PvP
  components/
    GoatRaceGame.tsx            # canvas + điều hướng các màn hình
    MainMenu.tsx, CareerScreen.tsx, SetupScreens.tsx, LegacyScreen.tsx, ResultScreen.tsx
    TouchControls.tsx           # cần ảo + nút SÚT / CHUYỀN / KỸ NĂNG
  hooks/
    useMatch.ts                 # vòng lặp game (bước cố định 1/120 s), bàn phím, âm thanh, giọng bình luận
    useProfile.ts               # tên, career, tập luyện, Legacy cá nhân, đồng bộ server
  lib/
    engine/match.ts             # mô phỏng trận đấu: vật lý bóng, AI đồng đội / hậu vệ / thủ môn, sút, chuyền, đánh đầu, penalty, phạt góc
    engine/render.ts            # vẽ sân, khán đài, cầu thủ, hiệu ứng, HUD, minimap
    engine/audio.ts             # âm thanh WebAudio
    engine/commentary.ts        # bình luận viên
    heroes.ts                   # chỉ số, kỹ năng, giáo án, lão hoá
    career.ts                   # các chặng lịch sử, mục tiêu, danh hiệu
    setup.ts                    # cấu hình trận cho từng chế độ
    game-config.ts              # hằng số dùng chung client/server
    leaderboard/                # kiểu dữ liệu & kiểm tra, run token (HMAC), store Redis / bộ nhớ
  tests/                        # Vitest + giả lập Upstash
```
