# Jämförelse: claude-opus-4-8 (A) vs claude-fable-5 (B)

## Vinstandelar per sektionstyp (parvis blind judge, positionsbyte)

| Sektionstyp | A | B | Oavgjort | A-andel exkl. tie | B-andel exkl. tie |
|---|---|---|---|---|---|
| understanding-current | 0 | 10 | 2 | 0.00 | 1.00 |
| understanding-assignment | 0 | 11 | 1 | 0.00 | 1.00 |
| understanding-vision | 0 | 11 | 1 | 0.00 | 1.00 |
| quality-assurance | 0 | 9 | 3 | 0.00 | 1.00 |
| phases | 1 | 9 | 0 | 0.10 | 0.90 |

## Kostnad per modell

| Modell | Totalt (USD) | Per anbud (USD) |
|---|---|---|
| claude-opus-4-8 | 6.12 | 0.51 |
| claude-fable-5 | 15.14 | 1.262 |

## Mänsklig blindgranskning (Stefan, 2026-06-11)

10 par, deterministiskt urval (seed 42), slumpad visningsordning per par, facit dolt.
Rättat med `evals/scripts/score-blind-review.ts`:

| | Opus 4.8 (A) | Fable 5 (B) | Oavgjort | Ej bedömda |
|---|---|---|---|---|
| Stefans röster | **7** | 1 | 0 | 2 |

Fable-rösten (par-3) markerades "knapp, relativt lika beskrivningar". En Fable-text
identifierades i blindo som AI-doftande ("kärnan i leveransen luktar ai"). De två
ej bedömda paren var båda phases-sektioner på ramavtalsupphandlingar — se fynd 2.

## Beslut: OPUS 4.8 BEHÅLLER SKRIVROLLEN

Beslutsregeln krävde samstämmig signal från judge OCH människa för modellbyte.
Utfallet är inte spretigt utan **motriktat**: judgen gav Fable 50–1, människan gav
Opus 7–1. Vid motstridiga signaler väger den mänskliga domänbedömningen tyngst —
`MODELS.writing` förblir `claude-opus-4-8` (ingen kodändring; 2,5× lägre tokenkostnad
än Fable är en bonus, inte ett skäl).

## Fynd ur körningen (utöver modellbeslutet)

1. **LLM-judgen har en stilbias som blindfacit avslöjar.** Sonnet-judgen belönade
   konsekvent en stil som domänexperten dömer ut. Parvisa LLM-domar kan inte ersätta
   mänsklig bedömning av anbudskvalitet. Stefans 8 märkta par är kalibreringsdata —
   en framtida judge måste valideras mot dem innan dess tally tillmäts beslutsvikt.
2. **Sektionsstrukturen passar inte ramavtal.** En genomförandeplan (phases) är fel
   form för ramavtalsanbud, där leveransförmåga vid avrop är poängen. Backlogg:
   sektionsuppsättning per upphandlingstyp.
3. **phases-schemats `min(3)` fäller legitima uppdrag.** Båda modellerna föll
   återkommande på schemavalideringen för uppdragstyper med färre faser (löpande
   rådgivning, ramavtal) — produktfel, inte modellfel. Backlogg: sänk/adaptivera.
4. **Kostnadsbaslinje på riktiga underlag:** Opus $0.51/anbud, Fable $1.26/anbud
   (enbart skrivbundles; 12 anbud per modell, 58 dömda par à 2 judge-anrop).
