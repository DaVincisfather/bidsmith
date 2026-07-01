import type { Metadata } from "next";
import { Fraunces, Inter_Tight, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import { PipelineRail } from "@/components/pipeline/PipelineRail";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["SOFT"],
  style: ["normal", "italic"],
});
const interTight = Inter_Tight({ variable: "--font-inter-tight", subsets: ["latin"] });
const jetbrainsMono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Bidsmith",
  description: "AI-driven RFP analysis and consultant matching",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="sv"
      className={`${fraunces.variable} ${interTight.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <nav className="border-b border-rule">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2.5">
              <svg viewBox="0 0 200 200" aria-hidden className="w-7 h-7 text-accent">
                <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="100" cy="100" r="92" strokeWidth="2" />
                  <circle cx="100" cy="100" r="80" strokeWidth="1" />
                  <path d="M62 82 L120 82 L138 84 L152 91 L138 96 L120 98 L116 98 L116 104 L122 104 L118 118 L126 118 L132 132 L68 132 L74 118 L82 118 L78 104 L84 104 L84 90 L62 90 Z" />
                </g>
              </svg>
              <span className="font-display text-xl tracking-tight">Bidsmith</span>
            </Link>
            <div className="flex items-center gap-6 font-mono text-xs uppercase tracking-wider text-ink-mute">
              <Link href="/" className="hover:text-ink">Analysera RFP</Link>
              <Link href="/arbetsyta" className="hover:text-ink">Arbetsyta</Link>
              <Link href="/radar" className="hover:text-ink">Radar</Link>
              <Link href="/installningar" className="hover:text-ink">Inställningar</Link>
            </div>
          </div>
        </nav>
        <div className="flex-1 grid grid-cols-[1fr_260px] min-h-0">
          <div className="min-w-0">{children}</div>
          <PipelineRail />
        </div>
      </body>
    </html>
  );
}
