# M4 Session 3 — Storage Lockdown + AI Cost Tracking — Design

**Date:** 2026-04-27
**Branch:** `feat/m4-session-3`
**Plan:** `docs/superpowers/plans/2026-04-27-m4-session-3-storage-cost-tracking.md`

## Goal

Close the last two beta-readiness gaps before Ekan-demo:

1. **Storage lockdown.** Move `rfp-documents` from a public bucket to authenticated-only access via signed URLs, so RFP source material isn't reachable by unauthenticated visitors who guess a URL.
2. **AI cost tracking.** Persist token usage and USD cost for every Claude API call so we can monitor LLM-margin per organisation as the beta scales.

Success criteria:
- A logged-out visitor cannot fetch any object in `rfp-documents`.
- A logged-in user on `/analysis/[id]` can still view the source RFP file.
- After running one analysis end-to-end, `ai_call_logs` contains rows with non-zero `cost_usd` attributed to the user's `organization_id`.

## Scope

**In:** `rfp-documents` bucket lockdown, `documents.file_path` column, signed URL helper, `ai_call_logs` table, pricing calculator, fire-and-forget logger, `callClaude` instrumentation, callsite forwarding of `organizationId`.

**Out:**
- `org-assets` bucket — stays public; tenant logos render in pre-auth contexts.
- PII-scrubbing wrapper — Session 4.
- A cost-attribution dashboard / per-org views — future work; this session only writes the data.
- Backfilling cost data for past calls — impossible (we never logged it).

## Architecture

### 1. Storage Lockdown

**Path convention.** All new uploads go to `<organization_id>/<timestamp>-<file_name>` — same prefix scheme as `org-assets` in migration 011. Storage RLS policies key on the org-id prefix, so multi-tenant isolation falls out of the path.

**Schema change.** `documents` gains a nullable `file_path` column. The legacy `file_url` column stays `NOT NULL` (a placeholder `supabase://rfp-documents/<path>` is written for new rows; `ted://...` synthetic rows from the radar flow keep their existing format). A future session can drop `file_url` once every consumer reads `file_path`.

**Wipe legacy rows.** Migration 013 deletes existing rows from `documents`, `analyses`, and `bids` (same pattern as migration 010). Existing data is dev-test material with at most one real RFP, kept locally if Stefan needs it. Public URLs in `documents.file_url` would die when the bucket flips anyway, so a clean wipe avoids stale references.

**Read flow.** `/analysis/[id]` reads `documents.file_path`, calls `getSignedFileUrl(supabase, "rfp-documents", path, 86400)` — a 1-hour-default helper invoked here with a 24h TTL — and renders the resulting URL. If `file_path` is null (synthetic `ted://`-row) the page falls back to the existing `file_url`.

**Why 24h TTL:** Public procurement notices are open-records material under Swedish offentlighetsprincipen; the dataminimeringskostnad is not high. 24h covers a full workday including internally shared analysis links between Ekan colleagues without forcing reload-loops. Each page render still mints a fresh URL.

**Why keep `org-assets` public:** Pre-auth rendering on `/login` PipelineRail and possible future public bid-PDF flows need direct image URLs. Logos are public branding, not sensitive. URLs are gissnings-säkra (random org-id UUID prefix).

### 2. Cost Tracking

**Table.** `ai_call_logs` — one row per `callClaude` invocation. Columns: `id`, `organization_id` (nullable, FK with `ON DELETE SET NULL`), `model`, `label`, `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_creation_tokens`, `cost_usd numeric(10,6)`, `latency_ms`, `error text`, `created_at`. Indexes on `(organization_id, created_at DESC)` and `(label, created_at DESC)` for future dashboard queries. RLS: members read their own org's rows; only the service role inserts.

**Pricing calculator (`src/lib/ai-cost.ts`).** Pure function `calculateCostUsd({ model, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens })`. Hardcoded pricing table for Opus 4.7, Sonnet 4.6, Haiku 4.5; falls back to Sonnet pricing for unknown models. Cache-aware: cache-read tokens cost 0.1× input price, 5-min cache writes cost 1.25× input price. 1h cache tier is out of scope (we don't use it).

**Logger (`src/lib/ai-call-logger.ts`).** `logAiCall({ organizationId, model, label, inputTokens, ..., latencyMs, error? })` — writes one row via the service client. Internally calls `calculateCostUsd`. Catches and `console.warn`s every error (DB outage, network blip, schema drift) so it can never break an inference call.

**Instrumentation (`src/lib/ai-client.ts`).** `callClaude` options gain optional `organizationId?: string | null`. After `stream.finalMessage()` resolves, the function reads `message.usage` and fires `void logAiCall(...)` (fire-and-forget — no await). On terminal error (after retries exhausted), the same logger is fired with the error string and zero token counts so failed calls are still attributed.

**Callsite forwarding.** Every existing `callClaude` consumer (rfp-analyzer, consultant-extractor, consultant-matcher, go-no-go-evaluator, opportunity-scorer, six bid-generator bundles) gains an optional `organizationId` parameter that forwards to `callClaude`. API routes already resolve `orgId` via `getOrgId()` — they pass it through. Routes that don't yet (cron-radar) get a follow-up if needed.

**Why fire-and-forget:** Loggning är observability, inte business logic. Vercel serverless flushar typiskt utan stalled awaits; en tappad rad är acceptabel kostnad mot risken att en logger-bug bryter en lyckad analys.

**Why hardcoded pricing:** Anthropic-priser ändras sällan; git-historik blir spårbar; ingen miljöskillnad mellan dev/prod. När prislistan ändras: PR mot `ai-cost.ts`, en mening i CHANGELOG.

## Decisions Log

| Beslut | Val | Skäl |
|---|---|---|
| Org-id-flow till `callClaude` | Explicit optional param på options | Synligt i typer; AsyncLocalStorage gör testning + nya callsites tricky för 1-3h-sessions |
| Befintliga `documents`-rader | Wipe (migration 013) | Allt är dev-data + en RFP som kan sparas lokalt; public URLs blir ändå döda vid privat-flippen |
| `org-assets`-bucket | Lämna publik | Inga logos uppladdade idag; pre-auth-rendering på `/login` behövs |
| Logger-blocking | Fire-and-forget (`void logAiCall`) | Loggning får aldrig blocka inference; tappade rader är acceptabel kostnad |
| Pricing-källa | Hardcoded i `ai-cost.ts` | Anthropic ändrar sällan; git-historik > env-konfiguration |
| Cache-multipliers | Bara 5-min (1.25x write, 0.1x read) | 1h-tier används inte idag — YAGNI |
| `documents.file_url` framtid | Behåll `NOT NULL`, skriv `supabase://`-placeholder | Drop-kolumn-migration är riskabel; placeholder är 1 rads kod |
| Signed URL TTL | 24 timmar | Upphandlingar är offentliga; intern delning inom Ekan utan reload-loop |

## Risks & Open Questions

- **Anthropic adaptive thinking + token-räkning.** Opus 4.7 med `effort: "max"` returnerar `thinking`-blocks i `message.content`. Anthropics SDK bör räkna thinking-tokens som `output_tokens`, men det är värt att verifiera mot dokumentation/SDK-typer i Task 4. Om de räknas separat behöver `ai_call_logs` ett `thinking_tokens`-fält.
- **Cron-routes utan `getOrgId`.** Radar-cron (`POST /api/radar/score`) kallar Haiku på alla orgs. Den skickar idag ingen `organizationId` — loggas som `null`. Acceptabelt: cron-kostnader fördelas inte per-org tills vi bygger en explicit org-loop.
- **`file_url`-konsumenter.** Förutom `analysis/[id]/page.tsx` kan andra konsumenter läsa `file_url` direkt (komponenter, framtida API-endpoints). En grep-pass i Task 8 säkerställer att inga andra läspunkter behöver patchas i denna session.
- **Pris-drift.** Om Anthropic ändrar prislistan utan att vi uppdaterar `ai-cost.ts` blir `cost_usd` fel. Mitigering: dashboard kan parallellt visa rå token-summor, vilka aldrig blir fel.

## Out of Scope (Explicit, för att undvika scope-creep)

- Cost-dashboard / per-org-vyer (UI-arbete för senare session).
- 1h-cache-tier-pricing.
- Backfill av historiska kostnader.
- `file_url`-kolumn-drop.
- `org-assets`-lockdown.
- PII-scrubbing (Session 4).
- Per-användare attribution (`user_id` i `ai_call_logs`) — kan adderas i Session 4 utan att bryta existing schema.
