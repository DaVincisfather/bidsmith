# PPTX full audit — findings

Audit av `templates/anbudsmall-v2.pptx` + `tmp/sample-bid.pptx` 2026-04-29.
Renderade via `scripts/render-and-verify.ps1 -Force`, jämfört per slide.

Findings här är **rådata**. Prioritering, gruppering och exekveringsordning beslutas i designspec efter audit.

---

## Slide 1 — Cover

Skippad i denna audit (Stefan har redan koll).

## Slide 2 — TOC

Skippad i denna audit.

## Slide 3 — Kunden idag

**Section A — Organisation och system:**
- Rubrikerna "Organisation", "System", "Processer" ska vara **bold**
- Styckesindelning: varje rubriks text på egen rad **under** rubriken (inte inline-flow)

**Section B — Smärtpunkter:**
- **Bullets** för smärtpunkterna (4 st, slot cap)

## Slide 4 — Uppdragsbeskrivning

OK — inga ändringar.

## Slide 5 — Vad vi ser

- **Bullets** för utmaningar (Section A, 4 st) och värden (Section B, 4 st).

## Slide 6 — Genomförande översikt

- **Fas-kort (övre raden):** `{Fas N — namn}` spiller över på `{Fas N — beskrivning}` när fasnamnet är längre än mockup-platshållaren ("Förankra uppdrag och kartlägg nuläge" hamnar i beskrivnings-zonen).
  - Fix: större textbox för fasnamn ELLER mindre fontstorlek på namnet ELLER auto-shrink.
- **Gantt-rader:** span-label (`{M1–M2}` etc) hamnar **under** fasrubriken vid styckesindelning — textboxen för spanen är för smal så texten wrap:ar in i raden ovan.
  - Fix: bredare textbox för Gantt-span ELLER kortare formatsträng.

## Slide 7 — Genomförande Fas 1 (clone-mall)

- **Bullets** för AKTIVITETER (4), LEVERANSER (3), BESLUT (3) — alla tre kolumnerna.
- **Syftesbox (`{Mål}`, upper-right):** snyggare styling + minska text — spillover ofta. Auto-shrink eller hard cap på antal tecken.
- **Risker:** saknas i denna sample-render (fixturen verkar inte exercise:a risker). Fungerar enligt Stefan i senaste prod-dump → ingen åtgärd, men flagga: sample-fixture bör täcka risker så regressioner syns i framtida audits.

## Slide 8-10 — Genomförande Fas 2/3/4 (kloner av slide 7)

Samma som slide 7. Eftersom applikatorn klonar slide 7 fortplantar fixar sig automatiskt — fixarna görs i mall-slide 7 + phase-detail-applikatorn.

## Slide 11 — Kvalitetssäkring

- **Section A (QA-process):** bullet points
- **Section B (Kvalitetsledare):** `{Namn, kvalitetsledare}` ska vara **fetstil**
- **Section C (Eskalering):** bullet points
- **Avstämningspunkt-boxarna (AP 1-4) längst ner:** designen ser bra ut men extrem spill ofta. Större boxar ELLER hard cap på text-längd ELLER auto-shrink.

## Slide 12 — Team, omfattning och pris

OK — inga ändringar.

## Slide 13 — Uppfyllelse av ska-krav

- **Krav truncation (känd):** RFP har ofta 14+ ska/bör-krav, slot cap 6 → datalöss. Stefans backlog: spara till sist, kräver mall-redesign.
- **Text overflow ALLTID** i kravbeskrivning + uppfyllelse-kolumnerna. Inte ett edge-case — händer varje gång.
- **REDESIGN-beslut:** Stefan vill ersätta hela kravmatrisen. Refererar till en *tidigare bättre tabell* för kraven (källa att lokalisera — git history? gammal mall? mockup?).
- **Beroende:** denna slide blockas av Stefan-design-input. Lyfts ur bullets-pass-spec, hanteras separat när tidigare-tabellen lokaliserats.

## Slide 14-16 — Referensuppdrag (clone-mall + kloner)

- **Ingen polering.** Stefan vill INTE polera referenserna alls.
- **Rubriker behålls** (KUND, PERIOD, OMFATTNING, KONTAKTPERSON, ROLL OCH LEVERANS, RESULTAT).
- **Placeholders förblir tomma `{...}`-text** — bid-generatorn ska sluta AI-generera referenser, konsulten fyller själv efter export.
- **Konsekvens:** ändring i bid-generator (`bundles/reference.ts`) + reference-applikator. Konsekvent med `project_reference_bundle_future.md`.
- **Lyfts ur bullets-pass-spec** — egen ticket / ihop med reference-bundle-strategin.

## Slide 17 — Anbudssekretess (= mockup slide 16)

- Visuellt OK.
- **Strategi:** ska bli **fast slide per kund** i framtiden — inte AI-genereras vid varje output. Placeholders kvar, kunden fyller en gång och återanvänder. Konsekvent med referens-strategin.
- **Lyfts ur bullets-pass-spec** — egen ticket / ihop med "kund-egna fasta slides"-strategin.

## Slide 18 — Certifieringar (= mockup slide 17)

- **Text overflow** är enda problemet — annars OK design.
- Större cert-kort ELLER hard cap på beskrivnings-text ELLER auto-shrink.

---

## Cross-cutting / hela decket

### Verifieringsmetod

- **PNG-rendering är otillräckligt för overflow-bedömning** — PowerPoint COM Export skalar text vid render (autofit shrink). Faktisk pptx-fil visar overflow som inte syns i PNG.
- **Sample-fixturen är för snäll** — placeholder-text är kortare än vad bid-generatorn producerar i prod. Behöver hårdare fixtures som matchar prod-text-längd.
- **Implementationsverifiering:** öppna `tmp/sample-bid.pptx` i PowerPoint efter varje fix, inte bara PNG-render. Eller: bygg "stress-fixture" med långa strängar för regressionsskydd.

### Återkommande mönster (från slide-findings)

1. **Text overflow / spillover** — slide 6 (fas-kort + Gantt-span), slide 7 (syftesbox/Mål), slide 11 (avstämningspunkter), slide 13 (kravmatris ALLTID), slide 18 (cert-kort).
   - Generic fix-mönster: större textbox, hard cap på text-längd, eller auto-shrink. Beslut per slide.
2. **Bullets** — slide 3 (smärtpunkter), slide 5 (utmaningar+värden), slide 7 (akt/lev/beslut → kloner 8-10), slide 11 (QA-process+eskalering).
3. **Bold-rubriker** — slide 3 (Org/Sys/Processer), slide 11 (kvalitetsledare-namn).

### Parallellt designspår

Stefan tar denna output (sample-render + audit-findings) till **Claude Design** för att generera alternativa mockups/stilar. Resultatet kan påverka vissa fixar — särskilt redesign-kandidaterna nedan.

### Strategi-flaggor (lyfts ur bullets-pass-spec)

- **Slide 13 (kravmatris)** — kräver redesign + Stefan-design-input + lokalisering av tidigare bättre tabell.
- **Slide 14-16 (referenser)** — ska bli tomma placeholders, bid-generatorn slutar AI-generera. Kopplas till `project_reference_bundle_future.md`.
- **Slide 17 (anbudssekretess)** — ska bli kund-egen fast slide, AI-genereras inte.
