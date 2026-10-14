import type { StorageMode } from "@/lib/pm/client";

export default function StorageNotice({ mode }: { mode: StorageMode | null }) {
  if (mode !== "local") return null;
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      Máy chủ chưa cấu hình cơ sở dữ liệu: dự án đang được lưu <b>trên trình duyệt này</b> (localStorage). Kết nối
      Upstash Redis trên Vercel để lưu tập trung và dùng chung (xem README).
    </div>
  );
}
