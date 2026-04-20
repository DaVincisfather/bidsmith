import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase";
import { getCurrentProfile } from "@/lib/org";
import {
  countActiveSuperUsers,
  getOrgSeatLimit,
  listMembers,
  listPendingInvites,
} from "@/lib/invites";
import { InviteForm } from "@/components/team/InviteForm";
import { MemberRow } from "@/components/team/MemberRow";
import { InviteRow } from "@/components/team/InviteRow";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const supabase = await createClient();
  const { userId, profile } = await getCurrentProfile(supabase);

  if (profile.role !== "super_user") {
    redirect("/");
  }

  const service = createServiceClient();
  const [members, invites, superUsed, seatLimit] = await Promise.all([
    listMembers(service, profile.organization_id),
    listPendingInvites(service, profile.organization_id),
    countActiveSuperUsers(service, profile.organization_id),
    getOrgSeatLimit(service, profile.organization_id),
  ]);

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-8">
        <h1 className="text-2xl font-bold">Team</h1>

        <InviteForm seatInfo={{ used: superUsed, limit: seatLimit }} />

        <section>
          <h2 className="text-sm font-semibold mb-2">
            Medlemmar ({members.length})
          </h2>
          {members.length === 0 ? (
            <p className="text-sm text-gray-500">Inga medlemmar ännu.</p>
          ) : (
            <ul className="border border-gray-200 rounded-lg px-4">
              {members.map((m) => (
                <MemberRow
                  key={m.user_id}
                  userId={m.user_id}
                  email={m.email}
                  role={m.role}
                  isSelf={m.user_id === userId}
                />
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="text-sm font-semibold mb-2">
            Väntande inbjudningar ({invites.length})
          </h2>
          {invites.length === 0 ? (
            <p className="text-sm text-gray-500">Inga väntande inbjudningar.</p>
          ) : (
            <ul className="border border-gray-200 rounded-lg px-4">
              {invites.map((inv) => (
                <InviteRow
                  key={inv.id}
                  id={inv.id}
                  email={inv.email}
                  role={inv.role}
                  expiresAt={inv.expires_at}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
