# Agentic Dealflow — Sessionsstatus 2026-03-31

## Var vi är

M0 E2E-testad. Arkitektur dokumenterad. Modellstrategi beslutad. Roadmap utökad med M1.5 (Go/No-Go) och M3 (RFP-radar). Väntar på referensmaterial från Stefan.

## Gjort denna session

1. E2E-test lyckades — fixade modell-ID till `claude-opus-4-6`
2. Modellstrategi: Sonnet (extraction/matchning), Opus (anbudsskrivning), Haiku (pre-filter)
3. Arkitekturdokumentation: `docs/architecture.html` med 6 sektioner
4. Kontextbloat-strategi: trattfiltrering (SQL → sammanfattning → Haiku → prompt)
5. M1.5 Go/No-Go-agent: vinstprediktion + beslutsunderlag, ~$0.03/analys
6. M3 RFP-radar: proaktiv scanning av upphandlingsplattformar

## Nästa session

1. Stefan laddar upp referensmaterial (riktiga CV:n, anbud, RFP:er)
2. Skapa syntetisk data baserad på referensmaterialet
3. Planera M1 (konsultprofiler + matchning)
4. Byt RFP-analys från Opus till Sonnet (per modellstrategi)

## Kod att committa

- `src/lib/rfp-analyzer.ts` — modell ändrad till `claude-opus-4-6`
- `docs/architecture.html` — ny arkitekturdokumentation

## Milstolpar

- M0: Kravanalys ✅
- M1: Konsultmatchning
- M1.5: Go/No-Go-agent
- M2: Anbudsgenerering
- M3: RFP-radar (extern scanning)
