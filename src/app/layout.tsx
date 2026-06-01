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
        <nav className="border-b border-gray-100">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-6">
            <Link href="/" className="font-bold text-lg">
              Bidsmith
            </Link>
            <Link href="/" className="text-sm text-gray-500 hover:text-gray-900">
              Analysera RFP
            </Link>
            <Link href="/arbetsyta" className="text-sm text-gray-500 hover:text-gray-900">
              Arbetsyta
            </Link>
            <Link href="/radar" className="text-sm text-gray-500 hover:text-gray-900">
              Radar
            </Link>
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
