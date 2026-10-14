import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import Link from "next/link";
import "./globals.css";

// Self-hosted at build time; designed for Vietnamese diacritics.
const beVietnam = Be_Vietnam_Pro({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin", "vietnamese"],
  display: "swap",
  variable: "--font-be-vietnam",
});

export const metadata: Metadata = {
  title: { default: "Quản lý dự án xây dựng", template: "%s · QLDA Xây dựng" },
  description: "Lập kế hoạch dự án xây dựng: WBS, ngân sách, tiến độ Gantt, PV – EV – AC.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0d366b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={beVietnam.variable}>
      <body className="min-h-screen font-sans antialiased">
        <header className="bg-brand-900 text-white">
          <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-6 px-4">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6" />
              </svg>
              QLDA Xây dựng
            </Link>
            <nav className="flex gap-4 text-sm text-white/80">
              <Link href="/" className="hover:text-white">
                Dự án
              </Link>
              <Link href="/projects/new" className="hover:text-white">
                Tạo dự án
              </Link>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
