# Bid editor MD-first — design

_2026-08-03. Brainstormad med Stefan (besluten nedan är hans). Följer MD-first-pivoten
(#101): Markdown är den formella leveransen, PPTX-motorn parkerad bakom flagga.
Implementationsplan följer separat._

## Problem

Bid-editorn är byggd för PPTX-pipen: textbudgetar per ruta (`budgets`/`fieldSlides`,
overflow-omräkning vid varje tangenttryck, `OverflowChecklist`, `/shorten`-LLM-kortning,
teckenräknare), slide-gruppering för onboardade mallar (`SlideNav`,
`SlideGroupedSections`, slot-metadata), hälsorapport-länk och strukturjudge-badge.
Efter pivoten är exporten en Markdown-fil utan geometri — hela den mekaniken saknar
syfte i editorn, och `BidEditor.tsx` (425 rader) bär den i varje interaktion.
Användarens efterarbete sker dessutom downstream: MD-filen matas till valfri AI och
valfritt slutverktyg (Word, PPT, designprogram).

## Beslut (Stefan, brainstorm 2026-08-03)

1. **Editorns jobb = överblick + export.** Granskningsyta: se kapitel och innehåll,
   fylla obligatoriska luckor (timpris), justera småfel i prosa, exportera. Tyngre
   omarbetning sker medvetet i användarens egna verktyg.
2. **Avsnitt/kapitel är enda strukturen.** Slide-begreppet försvinner helt ur editorn.
   Foreign-anbud (bakom flaggan) renderas i samma kapitelvy.
3. **Kapitelindelningen ÄR överblicken.** Inga ord-/tecken-/sidmått — de ger ingen alfa.
4. **Förväntade kapitel visas från genereringsstart** ("detta kommer anbudet innehålla"),
   med per-kapitel-status under generering.
5. **Nedströms-instruktion inbakad i exporten**, formatoberoende (HTML-kommentar) —
   ingen kundinställning, inget formatval vid export (v2-väg om behov uppstår:
   val vid exportknappen, aldrig dold workspace-state).
6. **Godkänt uttryckligen:** (a) per-bundle-persist i genereringen (ändrar NÄR sektioner
   sparas, inte vad som genereras), (b) strukturjudge-anropet tas bort ur genereringen.

## Design

### 1. Editorns form — dokumentvyn

`BidEditor` får EN vy (flat-/grupperad-branchen försvinner):

- **Vänsterspalt:** kapitellistan i dokumentordning via befintliga `SectionNav`
  (klick-scroll, dra-omordna, ta bort kapitel).
- **Mittspalt:** kapitlen via befintliga `SectionRenderer`-renderers med kvarvarande
  inline-redigering (`EditableText`). Budget-props och teckenräknare strippas ur
  renderers.
- **Fotknapp:** "Exportera anbud (Markdown)" — oförändrad, enda exporten.
- **Behålls oförändrat:** autosave (debounce + PATCH), genererings-polling,
  timpris-varningen, misslyckade-sektioner-varningen, ForgeLoader.

**Raderas (filer tas bort, inte flaggas):**

| Vad | Var |
|---|---|
| Overflow-panelen | `src/components/bid-editor/OverflowChecklist.tsx` + tester |
| Slide-nav | `src/components/bid-editor/SlideNav.tsx` |
| Slide-gruppering | `src/components/bid-editor/SlideGroupedSections.tsx` |
| Strukturbadgen | `src/components/bid-editor/StructureEvalBadge.tsx` + tester |
| Slot-gruppering | `src/lib/bid-editor/slot-meta.ts` (verifiera inga andra konsumenter) |
| Kortnings-API:t | `src/app/api/bids/[id]/shorten/route.ts` + editorns `onShorten`-flöde |

`src/lib/bid-editor/field-path.ts` används idag av overflow/shorten-flödet — raderas
om planens konsument-koll bekräftar att inget annat använder den.

**Props-bantning:** `budgets`, `fieldSlides`, `initialOverflowFlags`,
`initialStructureEval`, `slotMeta`, `templateId` (hälsorapport-länken) försvinner ur
`BidEditorProps`; `bids/[id]/page.tsx` slutar ladda/beräkna dem åt editorn.
PATCH-schemat i `api-schemas.ts` slutar ta emot `overflowFlags`. DB-kolumner
(`overflow_flags`, `structure_eval`) lämnas orörda — ingen migration, de blir oskrivna.

**Genererings-sidan rörs INTE av rivningen:** budget-retry-mekaniken
(`with-budget-retry`, `shorten-field.ts`, `budget-rules.ts`) styr fortsatt
textlängderna vid generering och behålls. `verifyFieldBudgets` behålls i lib om
genereringen använder den (planen verifierar); editorns import försvinner.

### 2. Förväntade kapitel från start

Ny liten modul `src/lib/bid-editor/expected-chapters.ts`:

- Härleder förväntad kapitellista ur `RUNTIME_MANDATORY_SECTIONS`
  (`src/lib/eval/bid-structure.ts` — inbyggda mallens 11 obligatoriska format;
  konstanten behålls och får ny konsument) mappad till standardrubriker, plus
  format→bundle-ägarskap via `BUNDLE_LABELS` (deterministiska sektioner ägs av
  "deterministic").
- Under `status === "generating"` visar nav:en unionen: landade sektioner (faktisk
  rubrik) + ännu ej landade förväntade kapitel (standardrubrik, väntande-stil).
  Fallerad bundle ⇒ dess kapitel märks misslyckade (ur `failedBundles`).
- Efter genereringen (draft/exported/failed): nav:en visar enbart faktiska sektioner.
  Den förväntade listan persisteras aldrig — rent visnings-överlägg.
- Foreign-anbud (profilväg, bakom flaggan): ingen förväntad lista (manifest-bunden);
  kapitlen dyker upp när de landar, som idag.

**Per-bundle-persist (godkänd genererings-ändring):** i `generateAllSections` flyttas
`onSectionComplete`-anropen från efter-allt-klart till per enhet: deterministiska
sektioner persisteras direkt vid start, varje bundles sektioner när den settlar.
VIKTIGT: `persistSection` är read-modify-write mot bid-raden — samtidiga persists kan
tappa varandras appends. Persists serialiseras därför via en promise-kedja (mutex) i
`run-bid-generation.ts`. Slutskrivningen sätter som idag HELA arrayen i korrekt
v2-dokumentordning (mellanlägets DB-ordning får vara settle-ordning; nav:en sorterar
via den förväntade planen under generering). Innehåll, prompter, modeller, retry:er:
noll ändring ⇒ ingen eval-grind.

**Strukturjudgen bort ur runtime (godkänt; RÄTTAD MOTIVERING):** `judgeBidStructure`/
`buildStructureEvalSummary`-anropet + `structure_eval`-skrivningen tas bort ur
`run-bid-generation.ts`. RÄTTELSE efter kodläsning (2026-08-03, planfasen): judgen är
en MEKANISK kontroll (format-närvaro/tomma fält), INTE ett AI-anrop — $0.
Kostnadsargumentet i brainstormen var fel; borttagningen motiveras enbart av död
konsument (badgen ryker ⇒ kolumnen blir oläst). `src/lib/eval/bid-structure.ts`
behålls för offline-evals. GET-routen slutar returnera `structureEval`.

### 3. Instruktionsblocket i MD-exporten

`bidToMarkdown` prependar en statisk konstant `BID_MD_PREAMBLE` som HTML-kommentar
(`<!-- … -->`) överst i filen, före cover-H1:an. Osynlig vid rendering/konvertering
(ren leverabel för mänskliga ögon), fullt läsbar för varje AI som får råtexten.
Svenska, ~20–25 rader, tre delar:

1. **Dokumentsemantik:** `#` = anbudets titel, `##` = kapitel, `---` = kapitelgräns;
   dokumentordningen är anbudets ordning; tabeller är data (team/pris ska förbli
   tabell), punktlistor är uppräkningar.
2. **Fakta-låst-invarianten:** namn, priser, timmar, datum, referenser, citat,
   kravsvar och certifikat får omformas men ALDRIG ändras, kompletteras eller
   "förbättras"; vid osäkerhet behåll originalformuleringen. (Förlänger Bidsmiths
   evidenskedja över överlämningen till nästa AI.)
3. **Formatgrenar:** textdokument (Word: rubrikhierarki → styles, tabeller förblir
   tabeller) · presentation (ett `##`-kapitel ≈ en slide-sektion; kondensera prosa
   till punkter utan att ändra sakinnehåll) · annat verktyg (behåll struktur och
   fakta, formen är fri).

Enhetstester: preamblen är exportens första rad, är en giltig HTML-kommentar,
innehåller inte `-->` i brödtexten, och dokument-H1:an följer direkt efter.

### 4. Testning och verifiering

- **Ny** `BidEditor.test.tsx` (stänger backlog-posten "BidEditor saknar testfil"):
  kapitellistan under generering (väntande/klar/misslyckad-status), rendering av
  faktiska sektioner efter generering, exportknappens tillstånd.
- `expected-chapters.test.ts`: format→rubrik-mappningen, unions-logiken,
  failed-bundle-märkningen.
- Preamble-tester i `bid-markdown.test.ts` (§3 ovan).
- Persist-serialiseringen: test på att samtidiga persists inte tappar sektioner.
- Tester för raderade komponenter tas bort; renderer-tester rensas från budget-props.
- **Grindar före "klart":** lint + test + `tsc --noEmit` + riktigt `next build`
  (page/route-typvakten lever bara där) + visuell verifiering mot dev-servern på ett
  riktigt anbud + en faktisk MD-export öppnad och läst (preamble + innehåll).

### 5. Rörs inte

Genereringens innehåll (bundles, prompter, budget-retry), PPTX-motorn och dess
export-route (parkerade bakom `BIDSMITH_FOREIGN_TEMPLATES`, rivning =
post-launch-beslut med användardata), MD-sektionsserialiserarna i `bid-markdown.ts`,
DB-schemat (ingen migration), onboarding-wizarden (mallmekanik bakom flaggan).

## Verifierbara framgångskriterier

1. Editorn visar ett genererande anbud med full förväntad kapitellista från sekund ett,
   och kapitel flippar väntande→klar löpande (inte i en skur på slutet).
2. Fallerad bundle syns som misslyckade kapitel i listan.
3. Färdigt anbud: kapitelnav + renderers + inline-redigering + autosave fungerar;
   inga budgeträknare, ingen overflow-panel, ingen slide-terminologi, ingen
   hälsorapport-länk, ingen strukturbadge någonstans i editorn.
4. MD-exporten inleds med HTML-kommentars-preamblen och renderar rent (preamblen
   osynlig) i en MD-viewer.
5. `BidEditor.tsx` väsentligt bantad (~425 → riktvärde ≤ 200 rader).
6. Ingen generering anropar strukturjudgen (verifieras i kod — mekanisk kontroll,
   ingen kostnadspåverkan).
7. Lint + test + tsc + `next build` gröna; visuell verifiering genomförd.
