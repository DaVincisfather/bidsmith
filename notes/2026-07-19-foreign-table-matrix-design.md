# Kravmatris i främmande tabeller (slice 6, tabelldelen) — design

_2026-07-19. Brainstormad med Stefan efter onboarding-mätpasset (PR #89). Alla vägval
nedan är hans. Bygger på kodkartläggningen samma dag: tabeller (`a:tbl` i
`p:graphicFrame`) är i dag osynliga för HELA foreign-pipelinen — inte kandidat, inte i
wireframe, inte instrumenterbara, inte mätta — så kravmatris-liknande slides blir
statiska (dokumenterad begränsning i #70)._

## Beslut (Stefan 2026-07-19)

1. **Ambition: full radgenerering direkt** — inte bara cell-fyllning eller synlighet.
   AI/pipeline producerar raderna och kundens tabell fylls.
2. **Endast kravmatris-semantik i v1.** Kolumnroller är FASTA (krav / uppfyllnad /
   referens / status / ignorera); wizarden pekar bara ut vilken mallkolumn som är
   vilken. Pris-/bemanningstabeller förblir statiska (framtida spår).
3. **Paginering: klona sliden per sida.** Alla ska-krav ska med, alltid — kravtäckning
   är produktens vallgrav. Kapning/fontkrympning avfärdade.
4. **Stefans medskick om generering:**
   - Max antal rader per slide ska STÄLLAS MOT antalet krav: sidor = ⌈N/radersPerSida⌉,
     där radersPerSida härleds ur KUNDENS radgeometri (aldrig våra konstanter).
   - Kolumnerna är alltid desamma (fasta roller, punkt 2).
   - **Svaren är FORMULAISKA, inte fri prosa:** uppfyllnad-cellen är
     "Ja — se [konsult X:s] CV", "Delvis — se [referens Y]" eller "Nej" — byggd
     deterministiskt ur coverage-datan (rowStatus + referens). Förutsägbart
     cellinnehåll ⇒ förutsägbara radhöjder ⇒ pålitlig paginering.

## Angreppssätt (valt: 1)

**Direktskrivande matris-applikator, ingen cell-tokenisering.** Tokens finns för att
överleva prosa-rendering; en kravmatris fylls ur strukturerad data (rows[] +
kolumnkarta), så applikatorn skriver cellinnehåll direkt i XML. Instrumenteringen rörs
inte alls — mallens tabell lämnas orörd som render-substrat och profilen bär en
`tableMap`. (Alternativ 2, cell-tokenisering, avfärdad: hela adresserings-sömmen för
noll extra värde, och radkloning skulle duplicera tokens och bryta
unikhetsvalideringen. Alternativ 3, två PR:ar, avfärdat: fundamentet ensamt flyttar
ingen kapacitetsgräns och integrationsrisken vill man ha i samma granskade helhet.)

## Datamodell (profilen, ingen migration)

Tabellsliden i en foreign-profil får `capability: "requirement-matrix"` och ett nytt
OPTIONELLT `tableMap`-fält på `SlideProfileSchema` (Zod; gamla profiler parsar orört):

```ts
tableMap?: {
  /** graphicFrame-index på sliden (dokumentordning bland graphicFrames). */
  frameIndex: number;
  /** Antal rubrikrader överst som lämnas orörda. */
  headerRows: number;
  /** Radindex (0-baserat, inkl. rubrikrader) för MALLRADEN som klonas per krav. */
  templateRowIndex: number;
  /** Roll per kolumn, samma längd som gridCol-listan. */
  columns: Array<"krav" | "uppfyllnad" | "referens" | "status" | "ignorera">;
}
```

Radhöjder/kolumnbredder läses ur mallens XML vid render (inte lagrade — geometrin
följer alltid filen).

**Diskriminatorn:** routing/gates använder i dag `isAllGenericProfile`. Den ersätts på
anropsställena av `isForeignProfile` = alla SLOTS är generic-prose OCH varje slide är
generic-prose/static/requirement-matrix-med-tableMap. `isAllGenericProfile` behålls
(intern), men VARJE befintligt anropsställe (run-bid-generation-routing, export,
bid-sidans editor-join, aktiveringsgrinden i activationBlockReason, onboarding-GET)
gås igenom explicit i planen och byter till rätt predikat medvetet.

## Introspektion + wizard

- `read-pptx` får ett NYTT additivt fält `SlideShapes.tables[]`: per graphicFrame —
  geometri (xfrm), kolumnbredder (`a:gridCol@w`), rader med höjd (`a:tr@h`) och
  celltext (`a:tc/a:txBody` — återanvänder befintlig paragraf/text-läsning).
  `shapes[]` RÖRS INTE ⇒ `shapeIndex`-adresseringen i drafts/instrumentering är
  stabil per konstruktion.
- Wizarden: tabellen ritas i wireframen (grid-box). Nytt tabellsteg per tabell:
  dropdown per kolumn (de fasta rollerna), antal rubrikrader, mallrads-val,
  förhandsvisning av cellinnehåll (första raderna). Kravet för bekräftelse: exakt en
  krav-kolumn och minst en av uppfyllnad/status; annars förblir tabellen statisk.
  Beslutet lagras i draften (additivt fält) → `tableMap` + capability i profilen vid
  complete.
- Geometri-screen och precount rörs inte i v1.

## Generering + routing

- Foreign-generering kör som i dag prosa-vägen, PLUS `requirementMatrixBundle`
  (befintlig) när profilen har en mappad tabell — samma
  `requirement-matrix-v2`-sektionsformat, samma coverage-roll-up (`rowStatus`),
  kravlistan ur analysen precis som för vår mall. Ingen ny AI-yta.
- **Formulaiska celler (medskicket):** applikatorn bygger uppfyllnad-cellen
  deterministiskt: `Ja — se {referens}` / `Delvis — se {referens}` / `Nej` (referens
  utelämnad när den saknas: bara "Nej"). `hurUppfylls`-prosan ur bundeln används INTE
  i tabellcellen (den finns kvar i sektionens data för editor/framtid).
  Status-kolumnen (om mappad) får JA/DELVIS/NEJ som ren text — pills är vår malls
  formspråk.

## Rendering — radmotorn

Ny applikator för äkta `a:tbl` (foreign matris-tabell):

1. **Rader per sida ur kundens geometri:** tillgänglig höjd = slidehöjd − tabelltopp −
   rubrikradernas höjd − bottenmarginal; radhöjd = mallradens `a:tr@h` justerad med
   radbrytnings-estimat (tecken-per-rad ur krav-kolumnens `gridCol`-bredd, samma
   teckenmatte som compute-budgets — kundens geometri, aldrig våra konstanter).
   Formulaiska svar gör icke-krav-kolumnerna enradiga i normalfallet; kravtexten är
   den enda radbrytaren.
2. **Sidor = ⌈N krav / radersPerSida⌉** — alla krav placeras, alltid.
3. **Slide-kloning i lockstep:** loadern klonar tabellsliden till N sidor och
   applikatorn fyller sida för sida — samma lockstep-mönster som vår
   matris-paginering (`getCloneItems`), men driven av profilens tableMap.
4. **Radfyllning:** per krav klonas mall-`a:tr`, celler skrivs per roll (befintlig
   txBody-skrivning: första radens formatering bevaras som i injectToken-mönstret);
   mallraden tas bort ur varje sida; rubrikrader orörda; `ignorera`-kolumner lämnas
   med mallradens innehåll.

## Mätning + verifiering

- `measure-overflow.ps1` får en `HasTable`-gren: tabellramen emitteras som
  pseudo-shape (top/left/width/height ur COM; boundHeight = summan av faktiska
  radhöjder) så outside-slide-checken ser genererade tabeller. Cellnivå-mätning = v2.
- **Testmall:** en äkta `a:tbl`-testmall byggs (generate-sample-pptx-mönstret) med
  rubrikrad + mallrad + kända kolumnbredder — enhets-/integrationstester mot den.
- **Live-verifiering:** onboarda testmallen → mappa kolumner i wizarden → generera mot
  riktig analys (~$1) → deck-rutinen (inspect + dupes + scan) → alla krav ska finnas i
  tabellen över rätt antal sidor, formulaiska svar, inga rader utanför slidekanten →
  Stefans dom.

## EFTERSKRIFT (live-verifieringen 2026-07-19, commit 474755e + 58f8114)

Två live-fynd ändrade detaljer ovan — koden är facit:

1. **Formulaiska formatet skärptes:** bundelns `referens`-fält är verbos evidensprosa
   (~150 tecken) — att bädda in den i svaret sprängde radhöjderna (COM-mätt: tabellbotten
   1739pt på 810pt-slide). Per medskickets anda ("se x konsult cv") är formatet nu
   `Ja — se CV: {konsultnamn}` / `Delvis — se CV: {namn}` / `Nej` (första täckande
   konsulten ur coverage; "se CV:"-formen vald för att slippa svensk genitiv), och
   referens-KOLUMNEN bär de täckande konsulternas namn (join ", "), inte bundel-strängen.
2. **Pagineringen max-wrappar över ALLA mappade innehållskolumner** (krav/uppfyllnad/
   referens) med det faktiska cellinnehållet, via delad `wrapCellsFor` så estimat och
   utskrift aldrig driftar — inte bara krav-kolumnen som ovan.
3. **Geometri-lös tabell (ärvd xfrm) kan inte bekräftas** — `applyTableDecision` avvisar
   (paginering utan tabelltopp vore en andra off-slide-väg).
4. **Testmall-fixturen måste vara OPC-ren:** kvarlämnade föräldralösa slide-parts
   kolliderade med automizers part-namngivning → dubbla Content_Types-overrides →
   PowerPoint 0x80CB8001. Fixturen strippas nu helt (2 slides, inga orphans).

## Avgränsningar (v1)

- Endast kravmatris-roller; pris-/bemanningstabeller statiska.
- Ingen cell-tokenisering; ingen cellnivå-mätning (v2).
- Inga pills/formatering utöver mallradens egna.
- Matrisredigering i slimmade editorn endast om den faller ut gratis ur befintligt
  sektionsformat — annars backlogpost.
- En mappad tabell per mall räcker i v1 (fler stöds i datamodellen men UI:t optimeras
  inte för det).
