# Noll-hallucinationsloop — 2026-07-03T20:45:53.664Z

Etikett: `eval:zero-halluc`

**Status: ❌ 3 miss(ar) över 4 fixture(s)**

## Per fixture

| Fixture | Krav (golden) | Verifierade | Coverage | Missar |
|---|---|---|---|---|
| chalmers-healthtech | 18 (17) | 17 | 94.4% | 1 |
| eskilstuna-lokalforsorjning | 17 (15) | 15 | 88.2% | 2 |
| orebro-utredning | 16 (17) | 16 | 100.0% | 0 |
| sormland-verksamhetsstod | 24 (19) | 24 | 100.0% | 0 |

Totalt: 75 krav, 3 missar.

## Missar (för diagnos: prompt vs schema vs fixture)

### chalmers-healthtech

- **[not-found]** krav: Referensuppdrag: Anbudsgivaren ska presentera ett referensuppdrag som omfattat minst 200 timmar och genomförts inom de senaste tre åren
  - citat: `omfattat minst 200 timmar•genomförts inom de senaste tre (3) åren räknat från sista anbudsdag.`

### eskilstuna-lokalforsorjning

- **[not-found]** krav: Kompetens: Konsulten ska ha relevant examen/utbildning, erfarenhet av workshops, dialogprocesser och förändringsarbete samt flytande svenska
  - citat: `Konsulten ska ha: 
För uppdraget relevant examen eller utbildning (t.ex ekonomi, fastighet, offentlig förvaltning eller motsvarande)
Dokumenterad erfarenhet att leda workshops, genomföra dialogprocesser och driva förändringsarbete.
Behärska svenska språket flytande i tal och skrift.`
- **[not-found]** krav: Kvalitet: Rapport och presentation ska vara välstrukturerad, bygga på verifierbara uppgifter och vara kvalitetssäkrad
  - citat: `Vara välstrukturerad, tydlig och fackmässigt utformad.
Bygga på verifierbara uppgifter och transparenta analysmetoder.
Vara kvalitetssäkrad innan leverans, inklusive språkgranskning och faktagranskning.`

## Kostnad

- Kumulativ loop-kostnad (all-time, `eval:zero-halluc`): **$1.1075**
- Budgettak (BIDSMITH_LOOP_BUDGET_USD): $20.00
- Kvar av budget: $18.8925
