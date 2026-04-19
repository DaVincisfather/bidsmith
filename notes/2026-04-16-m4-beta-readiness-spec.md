# 2026-04-16 — M4 Beta Readiness spec

## Bakgrund

Code review (Opus 4.7, 2026-04-16) hittade fyra CRITICAL-fynd som alla handlar om samma sak: appen saknar tenant-isolation och auth. Vi kör en öppen prototyp mot Supabase med `DEFAULT_ORG_ID`-stubb och publika storage-URLs. Fungerar för demo till Ekan, men får aldrig se riktig kundkod eller CV-data.

Parallellt finns två återkommande behov: **cost-tracking per kund** (för prissättning av betaversionen) och **PII-scrubbing** (svensk VPS-strategi från tidigare). Alla fyra kräver `organization_id` på varje relevant tabell → därför bundlas de som M4.

## Mål

Efter M4 ska appen vara säker nog att köra mot en första betakund — inte produktionshärdad, men inte längre en öppen prototyp.

Verifierbara framgångskriterier:
1. Inloggad användare kan bara se sin orgs RFPer, matches, bids, konsulter
2. Ingen API-route returnerar data utan authenticated session
3. Storage-objekt (uppladdade RFPer, genererade PPTX) är inte publikt åtkomliga via URL
4. Per org: totalkostnad (USD) och token usage kan avläsas för valt tidsintervall
5. Fritext som skickas till LLM har namngivna personer + org.nr maskerade

## Bundle

### 1. Auth (Supabase Auth, magic link)
- Slå på `@supabase/auth-helpers-nextjs` middleware
- Skydda alla `src/app/api/*` och sidvyer utom `/login` + `/invites/accept`
- `profiles` tabell (user_id → organization_id, role: "super_user" | "user")
- First-time login → skapa org + profil som super_user
- Roles: `super_user` kan bjuda in + ta bort medlemmar + se billing; `user` kan bara använda appen

### 2. Multi-org datamodell
- Migration: lägg till `organization_id uuid not null` på: `rfp_analyses`, `matches`, `bids`, `consultants`, `rfp_opportunities`, `ai_call_logs` (ny)
- Ny `organizations` tabell (id, name, billing_plan, seat_limit, created_at)
- Ny `organization_invites` tabell (org_id, email, role, token, invited_by, expires_at, accepted_at)
- Byt ut `DEFAULT_ORG_ID`-stubb mot `getOrgId(session)`
- Backfill befintlig data till ett seed-org

### 2b. Invite-flöde
- Super_user skapar invite via `/team` UI → genererar token + sparar row i `organization_invites`
- Email skickas via Supabase Auth `inviteUserByEmail()` med redirect-URL innehållande token
- `/invites/accept?token=xxx` → verifierar token + kopplar user till org med rätt role
- Enforce `seat_limit` (default 5 super_users per org i basabonnemang)
- Pending/expired invites visas i `/team` för super_user

### 3. RLS policies
- Enable RLS på alla org-scoped tabeller
- Policy: `auth.uid() in (select user_id from profiles where organization_id = row.organization_id)`
- Service-role client bypassar RLS (för cron + bakgrundsjobb)

### 4. Storage-policies
- Flytta RFP/PPTX-bucket från public → authenticated
- Generera signed URLs (expiry 1h) i UI istället för direct-link

### 5. Cost tracking (internt)
- Ny tabell `ai_call_logs` (organization_id, model, input_tokens, output_tokens, cost_usd, feature, created_at)
- Wrapa `ai-client.ts` — logga varje anrop (cache hit/miss med, om prompt caching implementeras)
- Intern admin-vy (ej exponerad för kund) med: per-org månadsspend, per-feature breakdown, margin vs kundavgift
- **Prismodell (beslutad 2026-04-16):** 99 kr/månad per konsult-CV i systemet, 5 super_users inkluderade i basen. Over-the-top avgift för fler super_users tas senare.
- **Målmarginal:** LLM-kostnad ska hållas under ~30% av intäkt per kund. Cost-tracking ger datan för att validera eller justera.

### 6. PII-scrubbing
- Server-side wrapper runt `callClaude()`: regex-maska personnummer, org.nr, e-post innan prompt skickas
- Första iteration: regex-baserad. Presidio/spaCy senare om behov.
- Osynligt för UI (matchar tidigare beslut i `feedback_no_design_autonomy` / `project_pii_strategy`)

## Ordning

Auth + datamodell + RLS måste merges tillsammans i en stor bundle — annars brytbar mellanstatus. Invite-flöde, storage, cost tracking, PII kan komma efter i separata PRs.

Estimate (reviderat 2026-04-16 efter beslut om invite-flöde):
- Session 1 (~3h): auth + datamodell + RLS
- Session 2 (~2h): invite-flöde (tabell, UI, email, accept-route)
- Session 3 (~2h): storage-policies + cost tracking (intern admin-vy)
- Session 4 (~1h): PII-scrubbing

Totalt ~8h arbetstid → 4 sessioner.

## Beslutade frågor (2026-04-16)

1. **Invite-flöde från start** — inte solo-org. Pricing är per-CV med 5 super_users inkl → invite-funktion är core till kundvärdet, inte nice-to-have.
2. **Magic link** — börja där. SSO adderas när första enterprise-kund kräver det.
3. **Cost tracking internt** — ingen kund-dashboard i M4. Används för prissättning/marginvalidering.

## Ej med i M4 (deferred)

- SSO/Entra ID (väntar på enterprise-kund)
- Kund-facing billing-dashboard (internt räcker för beta)
- Over-seat-limit-pricing (lös när första kund hittar taket)
- Opus→Sonnet-split i bid-generator (HIGH, kostnadsfråga — blockeras inte av M4)
- Prompt caching i `ai-client` (HIGH, kopplat till cost tracking men separerbart)
- Haiku pre-filter (scale-fråga, inte beta-blocker)
- Global LLM-timeout (teknisk skuld, inte beta-blocker men lätt att ta i samma session)
