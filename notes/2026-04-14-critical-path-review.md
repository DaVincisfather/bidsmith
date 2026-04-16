# 2026-04-14 — Critical path post-merge review

## Vad gjordes

Post-merge review av AI-pipeline (M0–M3) på branch `fix/critical-path-bugs`. 5 surgical fixes + 3 regressionstester → PR #4.

Filer genomgångna: `ai-client`, `ai-schemas`, `document-parser`, `rfp-analyzer`, `consultant-extractor`, `consultant-matcher`, `go-no-go-evaluator`, `bid-planner`, `bid-plan-validator`, `bid-section-prompts`, `bid-generator`, `ted-client`, `opportunity-scorer` (1844 rader).

Fresh `superpowers:code-reviewer` verifierade inga regressioner på Analysera/Go-No-Go/Radar-flödena.

## Fixade i PR #4

1. `bid-generator`: hårdkodad `language: "sv"` borttagen, threading från `plan.language`
2. `go-no-go`: post-validera `winProbability=0` om något must-krav unmet
3. `ai-client`: `extractJson` ignorerar nu `}` inuti string literals
4. `bid-generator`: concurrency-limit 5 på Pass A (mot 429 + Vercel 60s)
5. `bid-plan-validator`: normalisera cover-semanticKey efter dedupe

## M4-kandidater (deferred från review)

### Design/produkt-beslut som kräver Stefans input

- **requirement-matrix: keyword→semantisk matchning** — Nuvarande implementation i `bid-generator.ts:41-79` gör boolean keyword-overlap med STOP_WORDS-lista. Falsk positiv/negativ-risk är hög. Alternativ: egen LLM-pass per krav, embedding-cosine, eller hybrid. Produktfråga: hur viktig är matrisens precision för anbudets trovärdighet?
- **`DEFAULT_BID_PLAN` engelsk variant** — Fallback-plan är hårdkodad svenska. Engelskt RFP → planner fail → svensk struktur. Behövs översättning + språkval.
- **Token usage/cost-loggning** — Ingenstans idag. 15 parallella Opus-anrop per anbud × antal anbud = dold spendkurva.

### Teknisk skuld värd att ta

- **Global LLM-timeout** — `ai-client` saknar timeout. Vercel 60s-cap + hängande anrop = riskabelt. Sätt ~45s per anrop med AbortController.
- **consultant-matcher Haiku pre-filter** — Redan på roadmap per projektminne. Skalar inte över 80 konsulter med nuvarande Sonnet-allt-i-ett.
- **`maxTokens`-kalibrering** — Flera filer har tighta gränser (`rfp-analyzer` 4000, `consultant-matcher` 8000, `opportunity-scorer` 300). Behöver mätas mot prod-data för att kalibrera, inte gissas.
- **`ted-client` retry + pagination** — Ingen retry; Vercel hobby = 1 cron/dag → nätfel = 24h utan data. Och ingen pagination bortom limit 100.
- **`regenerate`-routen tappar språk** — Bid-row lagrar inte `plan.language`. Routen defaultar till "sv". Persistera språk på bid eller derivera från analys.
- **`winProbabilityReasoning`-deterministisk prefix** — Minor UX: LLM kan skriva "72% chans"-motivering men vi tvingar 0. Prefix "Ej kvalificerad pga ouppfyllt ska-krav." eller liknande vid forcerat 0.

### Schema-härdning (ai-schemas.ts)

- `deadline` saknar ISO-format-validering
- `evaluationCriteria.weight` utan range (vill ha sum ≈ 100)
- `yearsExperience`, `references.year` utan min/max

## Nästa steg

PR #4 behöver:
- Manuell QA på preview-deploy (Analysera, Go/No-Go, Radar, anbudsgenerering)
- Merge till master

Därefter välja 1–2 M4-kandidater ovan baserat på var Stefan ser mest produktvärde.
