# Go/No-Go: cirkulär swap-rekommendation

**Upptäckt:** 2026-04-30 smoke-test efter PR #40-merge (structure-judget). Inte relaterat till PR #40 — pre-existing bug.

## Symtom

Agent föreslog "Byt Sofia Nilsson → Maria Bergström, +6%". Stefan accepterade.
Direkt efter accept föreslog agenten "Byt Maria Bergström → Sofia Nilsson, +10%".

Andra rekommendationens motivering (verbatim):
> Sofia Nilsson har direkt erfarenhet av organisationsöversyner och förvaltningsutredningar i kommunal och regional sektor, masterexamen i offentlig förvaltning och ett gemensamt referensuppdrag med Anna Lindström (Region Mellansverige 2024). Det förstärker kriteriet Referensuppdrag och erfarenhet (20 %) och Nyckelkompetenser (15 %) väsentligt jämfört med Maria Bergströms ekonomisk-juridiska profil. Benchmarkingkompetens och intervjumetodik täcker en befintlig lucka i teamet. Juridiktäckningen (Maria Bergströms bör-krav) är delvis möjlig att kompensera via Magnus juridiska förvaltningskompetens och Annas erfarenhet av delegationsordningar. Sammantaget bedöms winProbability öka till ca 78 %.

## Hypotes

1. **Symmetri-felet:** Båda swaps "förbättrar" winProbability matematiskt omöjligt om ranking är konsistent. Antingen är A bättre eller B bättre — inte båda.
2. **Stochastic ranking:** Sonnet-judgment har inbyggd variance på subjektiva bedömningar. Bid-evaluator såg ±50% på `coverage.recall` mellan körningar på samma fixture (`project_bid_evaluator.md`). Samma mekanism rimligt här.
3. **Ingen iterations-historik:** Agentens prompt-context saknar info om vad som tidigare rekommenderats och accepterats. Den optimerar lokalt mot nuvarande team-state, blint för historik.

## Var ligger koden (att verifiera vid debug)

Förmodligen någonstans i:
- `src/lib/go-no-go-agent.ts` (om den finns) eller liknande
- `src/lib/team-planner.ts` / `src/lib/bid-planner.ts`
- API-route under `src/app/api/go-no-go/` eller `src/app/api/matches/`

Hitta via grep efter `winProbability`, `swap`, `byt`, `consultant.*replace`.

## Möjliga fix (välj en eller kombinera)

### A. Stabilitetsfilter (statistik-fix)
Kör go/no-go-judgment N=3 gånger för samma team-konfig, returnera median + visa variance som "låg/medel/hög konfidens" i UI. Om föreslagen delta < variance → ingen rekommendation visas.

- Pros: adresserar rotorsak (stochasticitet)
- Cons: 3x kostnad för judgment-call (~$0.06 → $0.18 per analys)

### B. Iterations-historik (logik-fix)
Spara accepterade swap-rekommendationer på bid- eller analysis-record. Agent får dem i context: "Tidigare accepterade swaps: Sofia → Maria (2 min sedan). Föreslå inte motsatsen om inte ny information motiverar det."

- Pros: matchar mental modell — agenten "minns"
- Cons: kräver schema-ändring + prompt-uppdatering

### C. Hård guard (cheapest)
Om föreslagen swap är A→B där (B,A) finns i historik senaste 10 min → undertryck rekommendationen helt.

- Pros: 1 kvälls-fix
- Cons: döljer symptom, fixar inte rotorsaken

### D. Recompute-stale-detektion
Visa rekommendationen som "färsk" eller "stale" baserat på senaste team-ändring. Efter swap → invalidera tidigare rekommendation tills ny körs aktivt av användaren.

- Pros: UX-tydlighet
- Cons: lägger UI-state-komplexitet

## Rekommendation till nästa session

1. **Reproducera:** kör samma scenario igen — är det deterministiskt?
2. **Mät variance:** kör samma go/no-go N=10 mot fixerad team-konfig, mät spread i winProbability och rekommendationer.
3. **Välj fix baserat på variance:**
   - Variance > 5% → A (stabilitetsfilter) är rätt fix, B är overkill
   - Variance < 5% → B (iterations-historik) — buggen är faktiskt logisk, inte stochastic
4. **Lägga till i bid-evaluator:** evaluator borde också kunna fånga "instabila ranking" som metric.

**Estimat:** 1-2h diagnos + 2-4h implementation av vald fix.
