import type { Metadata, Viewport } from "next";
import { Chakra_Petch } from "next/font/google";
import "./globals.css";

// Self-hosted at build time; the Vietnamese subset renders the commentary and
// player names with stacked diacritics correctly on every OS.
const chakraPetch = Chakra_Petch({
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
  subsets: ["latin", "vietnamese"],
  display: "swap",
  variable: "--font-chakra",
});

export const metadata: Metadata = {
  title: "GOAT Race: Clash of Titans",
  description:
    "Ronaldo vs Messi — the race for the GOAT title. Career Mode, PvP Rivalry and a live Legacy leaderboard.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#020617",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={chakraPetch.variable}>
      <body className="bg-void font-display text-white antialiased">{children}</body>
    </html>
  );
}
