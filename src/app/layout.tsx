import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Agentic Dealflow",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <nav className="border-b border-gray-100">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-6">
            <Link href="/" className="font-bold text-lg">
              Agentic Dealflow
            </Link>
            <Link
              href="/"
              className="text-sm text-gray-500 hover:text-gray-900"
            >
              Analysera RFP
            </Link>
            <Link
              href="/consultants"
              className="text-sm text-gray-500 hover:text-gray-900"
            >
              Konsulter
            </Link>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
