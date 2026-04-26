import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { PipelineRail } from "@/components/pipeline/PipelineRail";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, NotAuthenticatedError, NoOrganizationError } from "@/lib/org";
import { OrgDropdown } from "@/components/organisation/OrgDropdown";
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let isSuperUser = false;
  try {
    const supabase = await createClient();
    const { profile } = await getCurrentProfile(supabase);
    isSuperUser = profile.role === "super_user";
  } catch (err) {
    if (
      !(err instanceof NotAuthenticatedError) &&
      !(err instanceof NoOrganizationError)
    ) {
      throw err;
    }
  }
  return (
    <html
      lang="sv"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <nav className="border-b border-gray-100">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-6">
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
              href="/radar"
              className="text-sm text-gray-500 hover:text-gray-900"
            >
              Radar
            </Link>
            <OrgDropdown isSuperUser={isSuperUser} />
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
