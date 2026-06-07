# Matchning: modelljämförelse (Opus / Sonnet / Haiku)

Sandbox: 20 syntetiska konsulter × 2 RFP:er. Samma prompt, samma pool — bara modellen byts.
Ranking-facit = Opus. Motiveringskvalitet = blind Opus-domare (n=40, randomiserad ordning).
Kör: `source ~/projects/bidsmith-main/.env.local && npx tsx evals/scripts/sandbox-matching-compare.ts`
samt `... sandbox-reasoning-judge.ts`.

| Mått | Opus (tak) | Sonnet (idag) | Haiku |
|---|---|---|---|
| **Matchningskvalitet** | | | |
| Spearman vs Opus | 1.000 | 0.970 | 0.966 |
| Topp-3/nivå-överlapp vs Opus | 24/24 | 22/24 | **24/24** |
| Exakt #1-val vs Opus | 8/8 | **7/8** | 5/8 |
| **Motiveringskvalitet** (blind domare) | (domare) | 28% vinst | **65% vinst** |
| Specificitet (1–5) | (domare) | 3.20 | **3.55** |
| Hallucinationer | (domare) | 0/40 | 0/40 |
| **Hastighet** (latens/anrop) | ~28s | ~29s | **~13s** |
| **Kostnad** (per matchning) | ~$0.21 | ~$0.034 | **~$0.012** |

## Tolkning

- **Haiku rankar likvärdigt med Sonnet** (0.966 vs 0.970), och får topp-3 per nivå exakt rätt (24/24).
- **Haiku skriver bättre motiveringar** än Sonnet enligt blind domare (65% vs 28%), högre specificitet, noll hallucination.
- **Haiku är ~3× billigare och ~2× snabbare.**
- **Enda stället Sonnet vinner:** exakt #1-val stämmer oftare med Opus (7/8 vs 5/8). Men rätt person är alltid i topp-3 hos Haiku — bara inte alltid rankad etta.
- **Opus är inte värt det** för matchning: 6× kostnaden, ingen rankningsvinst.
- **Two-stage (Haiku→Sonnet) sparar inget vid 20 konsulter** — samma kostnad, 12% långsammare. Lönar sig först >50.

## Skalningstest: 100 profiler (det avgörande)

`POOL_SIZE=100`. 100 profiler × 2–3 meningar överstiger 8000 output-tokens → dagens produktionskod
(`maxTokens: 8000`) **trunkerar**. Taket höjt till 20000 i sandboxen.

| Mått | Opus | Sonnet (idag) | Haiku |
|---|---|---|---|
| Spearman vs Opus | 1.000 | 0.970 | 0.956 |
| Topp-3/nivå vs Opus | 24/24 | 24/24 | 20/24 |
| Exakt #1 vs Opus | 8/8 | 8/8 | 8/8 |
| **Motivering: blind vinst** | – | **63%** | 21% (tie 16%) |
| Specificitet (1–5) | – | 3.15 | 2.84 |
| **Hallucinationer** | – | **0/67** | **6/67** |
| Latens (sum 2 RFP) | 138s | 189s | **85s** |
| Kostnad (sum 2 RFP) | $1.33 | $0.32 | **$0.099** |
| Output-tokens @100 | ~7500 | **9508 (>8000-tak!)** | ~9000 |

### Vad som ändrades från 20 → 100

- **Rankning håller:** Haiku 0.956 vs Sonnet 0.970, exakt #1 perfekt (8/8). Liten dipp i topp-3 (20/24).
- **Motiveringskvalitet VÄNDER:** vid 20 vann Haiku (65%); vid 100 vinner Sonnet (63%), och **Haiku börjar
  hallucinera (6/67 mot 0).** Haikus uppmärksamhet tunnas ut över en lång lista.
- **Kostnad/hastighet:** Haiku-alla 69% billigare, 55% snabbare än Sonnet-alla vid 100.
- **Takbugg bekräftad:** Sonnet-alla emitterade 9508 tokens → dagens 8000-tak trunkerar vid ~70+ konsulter.

## Slutsats (reviderad efter 100-test)

**Haiku rakt igenom är AV bordet.** Vid skala hallucinerar Haiku i motiveringarna och skriver vagare text —
en correctness-risk i anbud, inte bara polish. Men Haiku är en utmärkt *rankare*.

Rätt design: **Haiku rankar hela poolen** (billigt, snabbt, rankning håller) **→ Sonnet skriver
motiveringarna för kortlistan** (de som går in i anbudet: specifika, noll hallucination). Detta är
two-stage-arkitekturen — motiverad av *kvalitet/hallucination vid skala*, inte av kostnad vid 20.

**Oberoende av modellval: höj `maxTokens` från 8000.** Dagens kod trunkerar vid stora pooler.

## Förbehåll

- Syntetiska profiler. Riktiga, röriga CV:n kan ändra bilden — verifiera på anonymiserade riktiga CV:n.
- En domare (Opus). Riktningen (Haiku-text degraderar + hallucinerar vid skala) är dock konsistent och stark.
