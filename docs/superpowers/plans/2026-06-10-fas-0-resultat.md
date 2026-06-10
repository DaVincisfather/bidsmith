# Fas 0 — Resultat (2026-06-10)

Utfall av fas 0 (modellbas & API-modernisering), levererad som PR A (#16, mergad)
och PR B (`fas-0b-structured-outputs-caching`). Baslinjerna här är referensen för
fas 1 (A/B-test Opus 4.8 vs Fable 5) och fas 6 (Batch API).

## Vad som skeppades

- **PR A:** centralt modellregistry (`src/lib/models.ts`), 10 call-sites → `MODELS.<roll>`,
  skrivbundles Opus 4.7 → 4.8, Fable 5-prisrad, budget-loader till service-klient
  (eval-grinden kunde aldrig köras innan — `cookies()` utanför request-scope).
- **PR B:** structured outputs (`output_config.format` med sanerade Zod-JSON-scheman,
  nödlucka `BIDSMITH_STRUCTURED_OUTPUTS=off`) + `cachedContext` (delad anbudskontext som
  cachat system-block). **Cross-bundle-prewarmen ur planen utgick** — se upptäckten nedan.

## Huvudupptäckt: output_config.format deltar i cache-prefixet

Empiriskt verifierat (Opus 4.8, kontext ~21k tokens över cache-minimum):

| Scenario | cache_read | cache_creation |
|---|---|---|
| prewarm (utan format) → callClaude **med** format, samma kontext | **0** | 21 217 (full omskrivning, +215 tokens schema-overhead) |
| prewarm (utan format) → callClaude **utan** format (SO=off), samma kontext | **21 001** | 0 |
| callClaude med format → callClaude med **samma schema**, muterad bundle-prompt (retry-simulering) | **22 717** | 0 |

Slutsats: schemat injiceras i promptprefixet (som tools). Bundles med olika scheman kan
aldrig läsa varandras cache, och en formatlös prewarm kan inte värma åt formaterade anrop.
Planens "en max_tokens 0-värmning per modellgrupp" är därför ogiltig i kombination med
structured outputs — prewarmen implementerades, motbevisades och togs bort (`16e77e8`).

**Kvarvarande cachevärde (verifierat):** overflow-/format-retries och regenerering inom
5-min-TTL läser cachen (samma schema → samma prefix; `withBudgetRetry` muterar bara
system-block 2 som ligger efter cache-brytpunkten). Kostnad happy path: +25 % på
kontextdelen av input (cache-write 1,25×) — försumbart mot outputkostnaden, och
intjänat vid första retry.

Övriga API-empiri: `max_tokens: 0`-prewarm accepterades av API:t (planens risk föll inte ut);
Sonnet 4.6 cachade prefix på ~1 055 tokens (planens antagna minimum 2 048 är för högt);
schema-injektionen kostar ~215 tokens/anrop för ett trivialt schema.

## Eval-grindar

Alla körningar på `_stub`-fixturer — de enda som finns; se kalibreringsbackloggen.

- **Format-retries: 0** i samtliga körningar (varje bundle exakt 1 API-anrop när API:t
  svarade). Structured outputs eliminerade extraktionsfelklassen utan kvalitetstapp.
- **Bid-generator (SO på):** structure 1.00, coverage.recall 1.00 (upp från 0.50 i
  icke-SO-baslinjen), slot_format/empty_fields 1.00.
- **hallucination.pass FAIL i alla körningar:** 2 av 3 claims är teamallokeringar
  (omfattning %/timmar — team-bundlens definitionsmässiga output, judge-kalibreringslucka),
  1 av 3 var en äkta Sonnet-hallucination ("Bertil har offentlig sektor-erfarenhet" när
  CV:t säger motsatsen) — oförändrad modell i fas 0, känd felklass från PR #37-arbetet.
- **Analyzer/matcher:** FAIL-mönstret är identiskt med SO på och av (A/B-isolerat) →
  stub-golden/judge-strikthet, inte SO. Exempel: golden-kravet "Flytande svenska" parades
  inte med outputens "Flytande svenska i tal och skrift" (räknas som både miss och extra).
- **529 Overloaded fällde phases-bundlen i 2 av 3 bid-generator-körningar** (18:38, 18:57).
  Transient Opus-kapacitet, inte kod — callClaudes 3 försök med backoff räckte inte.

## Kostnadsbaslinje (stub-fixtur, SO på, utan cacheläsningar)

| Modul | Modell | Input | Output | Kostnad |
|---|---|---|---|---|
| understanding | opus-4-8 | 2 230 | 5 298 | $0.144 |
| phases | opus-4-8 | 2 002 | 4 438 | $0.121 |
| quality | opus-4-8 | 2 020 | 3 274 | $0.092 |
| requirement-matrix | sonnet-4-6 | 1 555 | 495 | $0.012 |
| team | sonnet-4-6 | 1 122 | 68 | $0.004 |
| **Totalt bundles/anbud** | | | | **$0.373** |

OBS: stub-kontexten är liten (~1–2k tokens). Verkliga RFP:er (jämför ai_call_logs
2026-06-04: input 7–8k/bundle) skalar inputdelen ~4×; outputdelen dominerar ändå.
Run-dumparna i `evals/runs/` saknar kostnadsfält — siffrorna ovan kommer ur `ai_call_logs`.

## Backlogg ur fas 0 (ej åtgärdat här)

1. **529-tålighet:** phases (längst wall-time av bundlarna) dog 2 ggr på overloaded trots
   3 försök. Överväg fler försök/längre backoff specifikt för `overloaded_error`.
2. **Eval-kalibrering (fas 1):** hallucination-judgen ska undanta anbudsdatum (deterministisk
   `cover.ts`-stämpel) och teamallokeringar; språkfält saknas i `parsed_profile`
   (finns bara i `cv_text`); requirement-parning för strikt i analyzer-judgen;
   **overflow-flaggor kastas av eval-harnessen** (`runModule` ignorerar dem — Stefans
   observation, grinden är blind för overflow); riktiga fixtures utöver `_stub`.
3. **Judge-rollen okopplad:** `evals/harness/core/judges.ts` hårdkodar modeller
   (review-fynd på PR #16, medvetet utanför fas 0).
4. `npm ci` trasig (lockfilen saknar @emnapi-paket) + `scripts/generate-bids.ts` har
   ogiltigt modell-ID — follow-ups från PR #16-reviewn, egna PR:ar.
