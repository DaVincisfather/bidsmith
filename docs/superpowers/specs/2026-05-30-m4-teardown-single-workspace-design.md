# M4 Teardown → Single-Workspace (Pass 1)

**Datum:** 2026-05-30
**Status:** Design — väntar på godkännande
**Kontext:** Open source-förberedelse för Bidsmith. Multi-org-lagret (M4) byggdes för en SaaS-vision med många kundorganisationer i samma databas. För ett self-hostat enskilt bolag är det dödvikt. Detta pass river M4 och ersätter org-skopning med användar-attribution i en gemensam arbetsyta.

Radar-rewiren (härled relevans från konsultbanken istället för `organization_competencies`) är **explicit out-of-scope** här — den är Pass 2, en egen feature-PR efter denna städning.

---

## Mål och framgångskriterier

**Mål:** Bidsmith blir single-workspace. Magic-link-login behålls som grind mot omvärlden. Alla inloggade användare delar en gemensam, transparent arbetsyta (ser och redigerar allt). `user_id` används enbart för attribution — vem skapade/äger ett anbud, och vem som genererar vilken API-kostnad.

**Framgångskriterier:**
1. Ingen kod refererar `organization_id`, `getOrgId`, `getCurrentProfile`, `super_user`, invites eller seats.
2. `npm run build` (tsc) rent, `npm test` grönt.
3. `supabase/migrations/` består av EN ren `001_initial_schema.sql` utan org-lager, som sätter upp hela schemat för single-workspace från noll.
4. En ny self-hostare kan: klona → `.env.local` → kör en migration → magic-link-login → använda appen.
5. `ai_call_logs` och `bids` attribuerar mot `user_id`.
6. Hela det fungerande M4-tillståndet är återfinnbart via git-taggen `pre-m4-teardown`.

---

## Designbeslut (låsta i brainstorm 2026-05-30)

| Fråga | Beslut |
|---|---|
| Auth-nivå | Magic-link-login KVAR. Org-träd/invites/seats/roller BORT. |
| Synlighet | Gemensam arbetsyta — alla inloggade ser och redigerar allt. |
| Attribution | `user_id` på `bids` (created_by/owner) + `ai_call_logs`. |
| Migrationer | Squasha 001–019 → en ren baseline. Migrations-regeln avstås medvetet (publik artefakt, färsk DB). |
| Gammal Supabase | Överges. OSS + framtida skarp körning startar från färsk DB. |
| M4-bevarande | Git-tagg `pre-m4-teardown` före rivning. Ingen separat lokal kopia (git räcker). |
| Radar-rewire | Out-of-scope → Pass 2. |

---

## Vad som tas bort

**UI:**
- `src/app/organisation/` (page, settings)
- `src/app/team/`
- `src/app/invites/` (accept-flöde, om fil finns)
- `src/components/organisation/` (OrgDropdown, OrgBanner, SettingsForm, AccentSwatches)
- `src/components/team/` (InviteForm, MemberRow, InviteRow)

**Lib:**
- `src/lib/organisations.ts` (branding-helpers)
- `src/lib/invites.ts`
- Org-actions: `src/app/organisation/settings/actions.ts`, `src/app/team/actions.ts`

**Borttagna koncept:** profiles-tabell, organization_invites, billing_plan, seat_limit, super_user/user-roller, per-tenant RLS, org-branding (display_name/logo/accent), `org-assets`-bucket.

## Vad som ändras

**`src/lib/org.ts` → krymper kraftigt:**
- Ta bort `getCurrentProfile`, `getOrgId`, `bootstrapProfileFromInvite`, `NoOrganizationError`, `OrgRole`, `Profile`.
- Behåll/ersätt med:
  ```ts
  export class NotAuthenticatedError extends Error { /* … */ }

  export async function getUserId(supabase?: SupabaseClient): Promise<string> {
    const client = supabase ?? (await createClient());
    const { data: { user } } = await client.auth.getUser();
    if (!user) throw new NotAuthenticatedError();
    return user.id;
  }
  ```
  (Övervägt filnamn: byt till `src/lib/auth.ts` för tydlighet. Beslut tas i plan-passet; ändrar bara importsökvägar.)

**`src/middleware.ts`:**
- Behåll session-skyddet oförändrat i princip.
- Ta bort `/invites/accept` ur `PUBLIC_PATHS`.
- `/api/radar/*` förblir publika (cron via CRON_SECRET).

**API-routes (~13 st):**
- `const orgId = await getOrgId(...)` → `const userId = await getUserId(...)`.
- Ta bort `.eq("organization_id", orgId)` ur queries (alla ser allt).
- POST-routes som skapar `bids` sätter `created_by: userId`.

**`src/lib/ai-client.ts` + `src/lib/ai-call-logger.ts`:**
- `LogAiCallInput.organizationId: string | null` → `userId: string | null`.
- `callClaude(..., organizationId?)` → `callClaude(..., userId?)`.
- Insert mot `ai_call_logs.user_id` istället för `organization_id`.

**`src/app/layout.tsx`:**
- Ta bort `<OrgDropdown>`, org/profil-resolution i RootLayout (redan delvis: super_user-logiken försvinner). Behåll nav + login-state.

**Bid-generator (`src/lib/bid-generator/*`):**
- `BidContext.organizationId` → tas bort eller blir `userId` (endast för cost-loggning; ingen affärslogik beror på det).
- Branding (accent/logo) som tidigare lästes per org: ersätts med konstant/config eller tas bort från PPTX-bygget. **Verifieras i plan-passet** — om PPTX faktiskt konsumerar accent/logo behövs ett litet default-beslut.

## Databas — ny baseline

Ersätt `supabase/migrations/001..019` med en enda `001_initial_schema.sql` som skapar single-workspace-schemat direkt:

- Kärntabeller utan `organization_id`: `documents`, `analyses`, `consultants`, `consultant_competencies`, `consultant_references`, `matches`, `go_no_go_assessments`, `bids`, `rfp_opportunities`, `organization_competencies` (behålls namn-som-är till Pass 2; alternativt döps till `radar_competencies` — beslut i plan).
- `bids` får `created_by uuid` (Supabase `auth.users.id`, ingen FK-constraint mot auth-schemat krävs).
- `ai_call_logs` med `user_id uuid` (nullable — cron/pre-auth-anrop) istället för `organization_id`.
- `bids.structure_eval jsonb` (från gamla 016) och `bids.overflow_flags jsonb` (från 018) — inkluderas i baseline.
- `template_configs` (från 017/019) med `budgets jsonb` + updated_at-trigger — inkluderas.
- RLS: enkel modell — aktivera RLS, policy `authenticated`-roll får full CRUD. Ingen `current_org_id()`.
- Seed: en uppsättning `organization_competencies`/radar-kompetenser + ev. demo-data flyttas till en separat valfri `seed.sql` (körs inte automatiskt) så baseline-schemat är rent.

**Konsekvens:** Stefans nuvarande Supabase matchar inte längre filerna. Det är accepterat — den instansen överges.

## Felhantering
- Oinloggad → middleware redirectar till `/login` (oförändrat).
- `getUserId()` kastar `NotAuthenticatedError` om session saknas; routes returnerar 401 som idag.
- `ai_call_logs`-loggning förblir fire-and-forget (try/catch, non-blocking).

## Testning
- Uppdatera/ta bort tester som mockar org: `invites.test.ts` (bort), `organisations.test.ts` (bort), `ai-client.test.ts` (org→user), `go-no-go-evaluator.test.ts` + `consultant-matcher.test.ts` (ta bort org_id ur fixtures).
- Behåll all kärnlogik-test (bid-generator, evaluator, pptx-template) oförändrad i sak.
- Verifiering: `npm run build` + `npm test` gröna före commit.

## Genomförandeordning (för plan-passet)
1. Tagga `pre-m4-teardown` på nuvarande HEAD.
2. Ta bort UI + lib-filer.
3. Skriv om `org.ts` → `getUserId`.
4. Uppdatera middleware.
5. Sopa API-routes (getOrgId→getUserId, ta bort org-filter, created_by).
6. ai-client/logger org→user.
7. layout.tsx (ta bort OrgDropdown).
8. bid-generator context + branding-default.
9. Squasha migrationer → ren 001.
10. Städa tester.
11. `npm run build` + `npm test` → grönt.
12. Commit på `feat/open-source-prep`.

## Out-of-scope
- Radar-rewire mot konsultbank (Pass 2).
- Mappnamnsbyte `agentic-dealflow/` → `bidsmith/` på disk (separat, pga parallella worktrees).
- Publicering till publikt GitHub-repo (efter Pass 1, på Stefans uttryckliga ok).
- Datamigrering av gammal instans (överges).
