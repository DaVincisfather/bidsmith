import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase";
import { getCurrentProfile } from "@/lib/org";
import { countActiveSuperUsers, getOrgSeatLimit } from "@/lib/invites";
import { OrgBanner } from "@/components/organisation/OrgBanner";

export const dynamic = "force-dynamic";

type Card = {
  href: string;
  title: string;
  description: string;
  stat?: string;
  hidden?: boolean;
};

export default async function OrganisationPage() {
  const supabase = await createClient();
  const { profile } = await getCurrentProfile(supabase);

  const [consultantCountResult, seatUsed, seatLimit, orgRow] = await Promise.all([
    supabase
      .from("consultants")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", profile.organization_id),
    (async () => {
      if (profile.role !== "super_user") return null;
      const service = createServiceClient();
      return countActiveSuperUsers(service, profile.organization_id);
    })(),
    (async () => {
      if (profile.role !== "super_user") return null;
      const service = createServiceClient();
      return getOrgSeatLimit(service, profile.organization_id);
    })(),
    supabase
      .from("organizations")
      .select("name, display_name, logo_url")
      .eq("id", profile.organization_id)
      .single<{ name: string; display_name: string | null; logo_url: string | null }>(),
  ]);

  const consultantCount = consultantCountResult.count ?? 0;
  const orgName = orgRow.data?.display_name ?? orgRow.data?.name ?? "Organisation";
  const logoUrl = orgRow.data?.logo_url ?? null;

  const cards: Card[] = [
    {
      href: "/consultants",
      title: "Konsulter",
      description: "Hantera CV:n och konsultprofiler som matchas mot förfrågningar.",
      stat: `${consultantCount} konsulter`,
    },
    {
      href: "/team",
      title: "Team",
      description: "Bjud in kollegor och hantera vem som har tillgång till organisationens data.",
      stat:
        seatUsed !== null && seatLimit !== null
          ? `${seatUsed}/${seatLimit} super_users`
          : undefined,
      hidden: profile.role !== "super_user",
    },
    {
      href: "/organisation/settings",
      title: "Inställningar",
      description: "Logo, accentfärg och organisationsnamn för PPTX-export.",
      hidden: profile.role !== "super_user",
    },
  ];

  const visibleCards = cards.filter((c) => !c.hidden);

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-8">
        <OrgBanner displayName={orgName} logoUrl={logoUrl} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {visibleCards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="block border border-gray-200 rounded-lg p-5 hover:border-gray-400 transition"
            >
              <h2 className="text-base font-semibold">{card.title}</h2>
              <p className="text-sm text-gray-600 mt-1">{card.description}</p>
              {card.stat && (
                <p className="text-xs text-gray-500 mt-3">{card.stat}</p>
              )}
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
