# Bid-editor-slimning — design

_2026-07-15. Brainstormad med Stefan (beslut nedan är hans). Spår: "BID-EDITOR-SLIMNING"
i ROADMAP.md. Implementationsplan följer separat._

## Problem

För onboardade (foreign) mallar är varje profil-slot en egen `generic-prose`-sektion i
bid-editorn: en rå placeholder-token + en textarea, platt i en lista. Radrum = 137 rutor
i rad — ogranskbar (smoke 2026-07-07). Kortfält (diarienummer, datum) ser ut som
prosa-rutor, standardslides (sekretess, kvalitetssäkring, referenscase) genereras om per
anbud trots att de borde vara samma varje gång, och inget i vyn visar vilken slide en
ruta hör till.

## Beslut (Stefan, brainstorm 2026-07-15)

1. **Standardslides = mallens egen text står kvar.** Den som laddar upp mallen ska kunna
   säga "slide 11–13 är fasta och samma för alla anbud" i onboarding-wizarden. Ingen
   AI-generering, ingen editor-yta; slidens originaltext följer med i varje export.
2. **Kortfält (budgetChars ≤ 80) döljs helt i editorn.** De genereras och exporteras som
   idag men har ingen UI-yta ("hopfällt detaljblock" övervägdes och avfärdades — bloat).
   Rättningar görs i PowerPoint efter export.
3. **Slimningen gäller ENDAST bid-editorn.** Onboardingen är engångsjobbet som äger
   mallbesluten (klassificering, budget-kalibrering, fasta slides); editorn konsumerar
   dem. Genereringen och kalibreringsloopen rörs inte. Inbyggda mallens editor
   (specialiserade renderers) är orörd.
4. **Kvarvarande prosa-rutor grupperas per slide**, navigeringen visar slides.
   Teckenräknare per ruta: MED.
5. **Slide-first visuell representation** ("editorn ska kännas som slides, inte
   textmassa") = senare spår. `SlideWireframe` från wizarden finns som byggsten.

## Vägval

Tre angreppssätt övervägdes: (A) profil-join vid rendering, (B) metadata bakas in i
sektionerna vid generering, (C) editorn ritas från profilen (slide-first). **A valdes:**
inga migrationer, ingen genererings-ändring, funkar retroaktivt på befintliga anbud, och
grupperingen är substratet C behöver den dag den byggs. B avfärdad (rör genereringen och
persisterat schema; bara framtida anbud får effekten), C avfärdad som nu (drar in det
Stefan flaggat som senare fix).

## Design

### Del 1 — Wizarden: "Markera sliden som fast"

En knapp per slide i onboarding-wizardens slidevy. Klick sätter alla slidens rutor till
`skipped` i utkastet — samma decision-mekanik som per-ruta-hanteringen, i bulk. Ångerbar
under wizarden: klick igen sätter rutorna till `pending` (obeslutade) — utkastet minns
INTE tidigare beslut, så en av-markerad slide kräver nytt ställningstagande per ruta.
(Wizard-klienten får minnas besluten under sessionen som polish, men det är inget krav.)
Sammanfattningsvyn före "slutför" listar vilka slides som är fasta.

Verifierad befintlig mekanik som gör resten (`draft-logic.ts`):
- `buildInjections` instrumenterar ENDAST bekräftade rutor — skippade lämnas orörda i
  den instrumenterade kopian ⇒ kundens originaltext står kvar.
- `buildFinalProfile`: slide utan bekräftade rutor ⇒ static passthrough ⇒ genereras
  aldrig (`generateSectionsFromProfile` hoppar static), renderas oförändrad i export.

Ingen ny datamodell. Backloggens "Godkänn slidens förslag"-bulkknapp (spec §3, ej byggd)
är samma handgrepp åt andra hållet — kan dela implementation om den byggs samtidigt.

### Del 2 — Dataflödet: profilen in i editorn

`src/app/bids/[id]/page.tsx` laddar redan anbudets mall (`loadTemplateForBid`); den får
också ladda mallprofilen (`loadTemplateProfile`). Ur profilen byggs server-side en
uppslagstabell:

```
SlotMeta: placeholder → { slide: number, shortField: boolean, intent: string,
                          budgetChars?: number }
```

- `shortField` = `budgetChars ≤ 80` (samma gräns som generatorns
  `SHORT_FIELD_MAX_CHARS` — importeras därifrån, dupliceras inte).
- Skickas som prop till `BidEditor`. Aktiveras ENDAST när anbudets mall är en onboardad
  foreign-mall (`isAllGenericProfile(profile)` — befintlig diskriminator). Saknad
  profil/inbyggd mall ⇒ ingen slotMeta ⇒ dagens beteende exakt.
- Join-logiken (bygg tabell, filtrera, gruppera) ligger som rena funktioner i ny
  `src/lib/bid-editor/slot-meta.ts` — enhetstestbar utan React.

### Del 3 — Editorn: filtrering, gruppering, räknare

Gäller endast när slotMeta finns (foreign-anbud):

- **Filtrering:** sektioner vars placeholder är `shortField` visas inte. De ligger kvar
  i state, autosparas och exporteras som idag — bara UI-ytan försvinner. En slide vars
  samtliga rutor är kortfält försvinner helt ur vyn.
- **Gruppering:** kvarvarande prosa-rutor grupperas under sliderubriker i mallens
  ordning: "Slide 5 · 3 rutor". Varje ruta får sin **intent som etikett** (fallback:
  placeholder-token när intent är tom).
- **Navigeringen:** `SectionNav` visar slides (inte enskilda rutor); klick scrollar till
  slidegruppen. Omordning och borttagning stängs av för foreign-anbud — ordning och
  existens ägs av mallen (platshållar-bundet; omordning påverkar inte exporten idag,
  den var bara vilseledande).
- **Teckenräknare:** varje synlig ruta visar `textlängd/budgetChars` (t.ex. "312/540"),
  markerad röd när budgeten överskrids. Rutor utan budgetChars visar ingen räknare.
  Första gången längdstyrningen syns i editorn i stället för först i exporten.
- **Kantfall — fallback:** en sektion vars placeholder INTE finns i slotMeta (t.ex.
  om-onboardad mall efter generering) visas som idag: synlig, platt, under en egen
  "Övriga rutor"-grupp sist. Inget innehåll kan tyst försvinna på ett trasigt uppslag.
- BidEditor.tsx är 335 rader (över 300-gränsen) — grupperingsvyn bryts ut till egen
  komponent i stället för att växa filen.

### Orört

Genereringen, kalibreringsloopen, export, sparlogik (PATCH skickar alla sektioner som
idag), felbanners, inbyggda mallens renderers, overflow-checklistan (fieldPath-baserad,
inert för foreign-anbud — teckenräknaren är foreign-sidans motsvarighet).

## Verifiering

- **Enhetstester** (rena funktioner): slotMeta-bygget ur profil, kortfältsfiltreringen,
  grupperingen (ordning, tomma slides), fallback för okänd placeholder, wizardens
  bulk-skip/återställning i draft-logic.
- **Visuell verifiering** (arbetsregeln: UI verifieras med screenshot, inte kodläsning):
  Radrum-anbudet i dev — före: 137 platta rutor; efter: endast prosa-rutor grupperade
  per slide, kortfält borta, räknare synliga. Wizard: screenshot på fast-knappen +
  sammanfattningsvyn.
- lint + test + typecheck med visad output innan något kallas klart.

## Senare / utanför spåret

- Slide-first-UI (vägval C) ovanpå grupperingen; `SlideWireframe` som byggsten.
- "Godkänn slidens förslag"-bulkknappen (backlog) — delar mekanik med fast-knappen.
- Soft-cap vid rendering för generic-prose (backlog) — räknaren är editor-sidan av
  samma problem, renderings-sidan kvarstår.
