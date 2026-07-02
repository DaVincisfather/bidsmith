# Spec: Separera leveranser från ska/bör-krav (BUG-A → feature)

**Datum:** 2026-07-02 · **Branch:** `fix/analysis-deliverables-as-krav`

## Bakgrund

Stefan såg leveranser dyka upp i ska-krav-listan i analysvyn. Systematisk felsökning:
display-vyn är ren (mappar `requirements[]`); rot-orsak = **extraktionen klassar icke-
kvalifikationsposter (leveranser, admin-formaliteter) som `must`-krav**. Analyzer-evalen
bekräftade över-extraktion (precision 0.56–0.79 på 2 fixtures) men reproducerade inte
"leverans → ska-krav" rent — golden-fixturerna behandlar själva leverabler inkonsekvent.

## Krav (Stefan 2026-07-02)

Ska/bör-krav MÅSTE vara äkta ska/bör-kvalifikationskrav. Leveranser (och andra typer) får
finnas i den extraherade listan men **separerade** från ska/bör i analysen, och ska **inte**
med i kravmatrisen i anbudet — utan höra hemma som **leverans i genomförandeplanen (faserna)**.

## Beslut (2026-07-02)
- **Datamodell:** `kind`-flagga på EN `requirements[]`-lista (ej separata arrayer).
- **Scope:** allt i ett — separera i analys + kravmatris OCH föd faserna med RFP-leveranserna.

## Design

### 1. Schema (`ai-schemas.ts` + `types.ts`)
Lägg `kind: z.enum(["qualification", "deliverable"]).default("qualification")` på varje
`requirements[]`-post. `priority` (must/should/nice) är semantiskt meningsfullt bara för
`qualification`. Default = bakåtkompatibelt (gamla analyser utan `kind` → qualification).

### 2. Extraktion (`rfp-analyzer.ts` SYSTEM_PROMPT)
Definiera:
- **qualification** = krav på anbudsgivaren som utvärderas/måste uppfyllas för att kvalificera
  (kompetens, certifieringar, erfarenhet, uteslutningsgrunder, obligatoriska villkor). Får
  `priority` must/should/nice via ska/bör/kan-mappningen.
- **deliverable** = det uppdraget ska PRODUCERA/leverera (rapporter, analyser, workshops som
  output). `kind: deliverable`. (Admin-formaliteter — "anbud på svenska", "CV bifogas",
  "priser i SEK" — är kvalifikation/administrativa, inte leverabler; hålls som qualification
  men prompten avråder från att blåsa upp listan med ren inlämnings-formalia.)
Klassa varje extraherad post. Behåll båda i `requirements[]`.

### 3. Analysvy (`analysis-result.tsx`)
Dela "Kravmatris"-sektionen i två grupper: **Ska-/bör-krav** (kind=qualification, per
prioritet, som idag) + separat **Leveranser** (kind=deliverable, ingen prioritetsbadge).

### 4. Kravmatris-bundlen (`bundles/requirement-matrix.ts`)
Bara `qualification`-krav föder matrisen. Kontext-bygget filtrerar bort deliverables innan
RFP-kravkontexten skickas in; prompten förstärks ("endast kvalifikationskrav, aldrig
leverabler").

### 5. Fas-bundlen / genomförandeplan (`bundles/phases.ts` + kontext)
RFP-leveranserna (kind=deliverable) skickas som hint till fas-bundlen så genomförande-
planens `phases[*].deliverables` grundas i vad RFP:en faktiskt kräver levererat (inte enbart
fri AI-generering). Mjuk hint (modellen fördelar dem på faser), ingen hård mappning.

### 6. Eval (analyzer-fixtures + golden-schema)
`AnalyzerFixtureSchema`/golden får `kind` (default qualification). Om-etikettera de 4
golden-fixturernas leverans-poster → `kind: deliverable`. Kör `npm run eval:analyzer`:
verifiera att `requirements`-precision inte regrederar och att leverabler klassas rätt.

## Verifiering (TDD + eval)
- Schema: parsning med/utan `kind` (default), enum-validering. Unit.
- Analysvy: render-test — qualification under Ska-/bör-krav, deliverable under Leveranser. Unit.
- Kravmatris-kontext: deliverables filtreras bort (unit på kontext-byggaren).
- Fas-kontext: deliverables når fas-hinten (unit).
- Eval: analyzer-precision + manuell inspektion av klassning (live, temp 0).
- Hela sviten + `tsc` grön.

## Icke-mål
- Ingen omskrivning av prioritets-mappningen (ska/bör/kan → must/should/nice oförändrad).
- Ingen ny UI-design utöver grupperingen (Stefan äger visuella beslut).
