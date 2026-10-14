# QLDA Xây dựng — Hệ thống quản lý dự án xây dựng

Ứng dụng web lập kế hoạch và theo dõi dự án xây dựng.
Xây dựng bằng **Next.js (App Router) + TypeScript + Tailwind CSS**, unit test bằng **Vitest**, lưu trữ bằng **Upstash Redis** và deploy tự động lên **Vercel** qua GitHub Actions (cùng stack và CI/CD với nhánh `claude/zen-archimedes-f7jkcn` của repo One-More-Run-FG).

## Giai đoạn 1 — phạm vi và điều kiện nghiệm thu

| Yêu cầu | Đáp ứng ở đâu |
| --- | --- |
| Tạo dự án | **Tạo dự án**: thông tin dự án, ngày khởi công, lịch làm việc (ngày làm việc trong tuần, ngày lễ), dự phòng phí; chọn khởi tạo WBS từ *dự án trống*, *khung WBS nhà dân dụng* hoặc *dự án mẫu có số liệu* |
| Quy trình lập kế hoạch | Tab **Tổng quan & quy trình**: 6 bước *Khởi tạo → WBS → Ngân sách → Tiến độ → Baseline → Theo dõi*; mỗi bước tự đánh dấu hoàn thành theo dữ liệu thật và chỉ ra còn thiếu gì |
| Tạo WBS | Tab **WBS & Ngân sách**: cây hạng mục nhiều cấp, mã WBS tự đánh số (1, 1.1, 1.1.2…); thêm hạng mục/công việc con/cùng cấp, thụt/lùi cấp, di chuyển lên/xuống, xoá, thu gọn/mở rộng |
| Ngân sách từng hạng mục | Thành tiền = khối lượng × đơn giá cho từng gói công việc, cộng dồn lên hạng mục cha; tỷ trọng; tổng chi phí trực tiếp (BAC) + dự phòng phí = tổng ngân sách; biểu đồ ngân sách theo hạng mục và theo loại chi phí (vật liệu, nhân công, máy, thầu phụ, khác) |
| PV, AV (AC), EV | Tab **Giá trị thu được**: PV, EV, AC (*AV – actual value*), SV, CV, SPI, CPI, EAC, ETC, VAC, TCPI cho toàn dự án và từng hạng mục tại ngày cập nhật số liệu; đường cong S; lịch sử các kỳ báo cáo |
| Tiến độ, Gantt chart | Tab **Tiến độ (Gantt)**: thời lượng (ngày làm việc), quan hệ FS/SS/FF/SF có độ trễ, ràng buộc "bắt đầu không sớm hơn", tính tiến độ bằng CPM (đường găng, dự trữ toàn phần), biểu đồ Gantt thang ngày/tuần/tháng có mũi tên liên kết, baseline, % hoàn thành, mốc |

### Cách dùng nhanh

1. **Tạo dự án** → chọn *Dự án mẫu có số liệu* để xem ngay toàn bộ tính năng (nhà phố 5 tầng, ~4,9 tỷ, 26 gói công việc, đã có baseline và 3 kỳ báo cáo), hoặc *Dự án trống* để tự lập.
2. **WBS & Ngân sách**: bấm **+ Hạng mục cấp 1** (VD *Phần móng*), chọn dòng rồi **+ Công việc con**; nhập ĐVT, khối lượng, đơn giá. Số nhập theo kiểu Việt Nam: `1.250.000`, `1,5`.
3. **Tiến độ**: nhập thời lượng và cột *CV trước* theo mã WBS, ví dụ `1.1`, `2.1SS+3`, `3.4FF-1` (độ trễ tính bằng ngày làm việc). Tiến độ, đường găng và Gantt cập nhật tức thì. Bấm **Lưu baseline (phê duyệt)** để chốt kế hoạch cơ sở.
4. **Giá trị thu được**: đặt *ngày cập nhật số liệu*, nhập *% hoàn thành* và *chi phí thực tế* từng công việc, bấm **Chốt số liệu kỳ báo cáo** để thêm một điểm EV/AC lên đường cong S.

Mọi thay đổi được **tự động lưu** (chỉ báo *Đã lưu* ở góc phải). Nếu hai người cùng sửa một dự án, người lưu sau được hỏi giữ bản nào (khóa phiên bản lạc quan).

### Công thức

| Chỉ số | Công thức |
| --- | --- |
| BAC | Σ khối lượng × đơn giá của các gói công việc |
| PV (tại ngày t) | Σ BAC × (số ngày làm việc của công việc đã qua đến t / tổng số ngày làm việc) — theo **baseline** nếu đã lưu |
| EV | Σ BAC × % hoàn thành |
| AC (AV) | Σ chi phí thực tế |
| SV, CV | EV − PV, EV − AC |
| SPI, CPI | EV / PV, EV / AC |
| EAC, ETC, VAC | BAC / CPI, EAC − AC, BAC − EAC |
| TCPI | (BAC − EV) / (BAC − AC) |

Tiến độ: CPM trên lịch làm việc của dự án. FS: `ES ≥ EF(trước) + trễ`, SS: `ES ≥ ES(trước) + trễ`, FF: `EF ≥ EF(trước) + trễ`, SF: `EF ≥ ES(trước) + trễ`. Dự trữ toàn phần = LS − ES; công việc găng có dự trữ = 0. Vòng lặp quan hệ được phát hiện và cảnh báo.

## Chạy local

Yêu cầu: Node.js 24 (cố định trong `engines` để Vercel build bằng Node 24 thay vì phiên bản cũ trong cài đặt project).

```bash
npm install
npm run dev
```

Mở <http://localhost:3000>. Khi chạy local, dữ liệu lưu trong bộ nhớ của server (mất khi tắt server), không cần cấu hình gì.

```bash
npm test            # unit test (Vitest)
npm run typecheck   # kiểm tra TypeScript
npm run build       # build production
npm start           # chạy bản production
```

## Lưu trữ trên Vercel (Upstash Redis — miễn phí)

1. Vào project trên Vercel → tab **Storage** → **Create Database** → chọn **Upstash** (Redis, gói Free) → **Connect** vào project (chọn tất cả môi trường).
2. Vercel tự thêm biến môi trường `KV_REST_API_URL` và `KV_REST_API_TOKEN`.
3. **Redeploy** (hoặc push một commit mới).

Chưa thiết lập Redis thì ứng dụng vẫn chạy: dự án được lưu **trên trình duyệt** (localStorage) và có thông báo nhắc trên giao diện.

| Biến môi trường | Bắt buộc | Ý nghĩa |
| --- | --- | --- |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Có (để lưu tập trung) | Do tích hợp Upstash của Vercel tự thêm. Cũng nhận `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` |
| `PROJECT_STORE=memory` | Không | Dùng bộ nhớ tạm cả ở production (chỉ để thử nghiệm) |

> **Lưu ý bảo mật (giai đoạn 1):** chưa có đăng nhập/phân quyền — ai có đường link đều xem và sửa được dữ liệu. Không nên đưa dữ liệu nhạy cảm lên bản deploy công khai trước khi có giai đoạn phân quyền. Server luôn kiểm tra và làm sạch dữ liệu gửi lên (giới hạn kích thước, kiểu dữ liệu, cấu trúc cây WBS, liên kết công việc).

## Deploy tự động (GitHub Actions → Vercel)

File `.github/workflows/ci-deploy.yml` chạy mỗi lần push:

1. **Kiểm tra:** `npm ci` → typecheck → unit test → build. Lỗi ở bước nào thì không deploy.
2. **Deploy:** push lên nhánh `main` → **Production**; nhánh khác → bản **Preview** riêng. Link deploy hiện trong trang tóm tắt của lần chạy (tab *Actions*).

Thiết lập một lần:

1. Trên máy của bạn, trong thư mục dự án:
   ```bash
   npx vercel login
   npx vercel link            # tạo / liên kết project, sinh file .vercel/project.json
   cat .vercel/project.json   # lấy "orgId" và "projectId"
   ```
2. Tạo token tại <https://vercel.com/account/tokens>.
3. Trên GitHub: repo → **Settings** → **Secrets and variables** → **Actions** → thêm 3 secret `VERCEL_TOKEN`, `VERCEL_ORG_ID` (= `orgId`), `VERCEL_PROJECT_ID` (= `projectId`).
4. Push lên GitHub — mọi lần push sau đều tự deploy.

Chưa thêm secrets thì workflow vẫn chạy kiểm tra và chỉ bỏ qua bước deploy. Đổi nhánh production: sửa `PRODUCTION_BRANCH` trong workflow.

> **Chỉ dùng một cách deploy tự động.** Nếu đã import repo bằng Git Integration của Vercel, hãy xoá job `deploy` trong workflow để tránh deploy hai lần.

## Cấu trúc thư mục

```
app/
  page.tsx                       # danh sách dự án
  projects/new/page.tsx          # tạo dự án
  projects/[id]/page.tsx         # không gian làm việc của dự án
  api/projects/route.ts          # GET danh sách · POST tạo dự án
  api/projects/[id]/route.ts     # GET · PUT (kiểm tra phiên bản) · DELETE
components/
  workspace/                     # các tab: Tổng quan, WBS, Tiến độ + Gantt, EVM + đường cong S
  ProjectList.tsx, NewProjectForm.tsx, CalendarEditor.tsx, ui.tsx
hooks/useProject.ts              # tải dự án, sửa cục bộ, tự động lưu, xử lý xung đột
lib/pm/
  types.ts                       # mô hình dữ liệu
  dates.ts                       # ngày ISO, lịch ngày làm việc
  wbs.ts                         # cây WBS: mã, thêm/xoá/thụt/lùi/di chuyển, cú pháp "CV trước"
  schedule.ts                    # CPM: tiến độ, đường găng, dự trữ
  evm.ts                         # ngân sách cộng dồn, PV/EV/AC và các chỉ số, đường cong S
  planning.ts                    # các bước của quy trình lập kế hoạch
  project.ts                     # làm sạch dữ liệu, baseline, chốt kỳ báo cáo
  templates.ts                   # khung WBS và dự án mẫu
  store.ts                       # lưu trữ: Redis (Upstash REST) hoặc bộ nhớ tạm
  client.ts                      # phía trình duyệt: gọi API hoặc localStorage
tests/                           # unit test: lịch, WBS, CPM, EVM, dự án, store, API (+ giả lập Upstash)
public/                          # trang tĩnh cũ (landing.html, about-us.html) vẫn truy cập được
.github/workflows/ci-deploy.yml  # CI/CD
```

## Hướng phát triển (giai đoạn sau)

Đăng nhập và phân quyền; nhật ký công trường; quản lý hợp đồng, thanh toán theo giai đoạn; nhập/xuất Excel (dự toán, WBS); phân bổ nguồn lực; báo cáo PDF.
