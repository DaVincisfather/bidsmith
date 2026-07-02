# Spec: Ärlig overflow-vy vid mall-upload (mall-overflow Task 2)

**Datum:** 2026-07-02 · **Branch:** `feat/upload-overflow-preview`

## Bakgrund

Task 1 gjorde budgetarna ärliga (geometrisk bindning + editorialOnly-tabellfält).
Genereringstidens overflow-vy finns redan (`OverflowChecklist` i bid-editorn: per slide,
`fältetikett (skrivet/tak)`, hoppa-till-fält, persistad på `bid.overflow_flags`) och får
Task 1-fälten automatiskt. **Task 2:s kvarvarande lucka = mall-upload-vyn.**

`TemplatePreview` (i `TemplateSection.tsx`) visar idag en rå `Teckenbudgetar`-tabell
(fältväg `phases[*].name` → tal, platt, font-mono) + introspektions-varningar + aktivera-
knapp. Det är inte "ärligt/läsbart" och varnar inte för trånga rutor.

## Mål

Vid mall-upload (före aktivering): visa budgetarna **läsbart, grupperat per slide**, och
**varna för trånga fält** — fält där mallens ruta tvingar kortare text än fältets norm —
men **tillåt aktivering ändå** (varna + tillåt, Stefan-beslut 2026-07-01).

## Design

### Trång-definition
Ett fält är "trångt" om `budget < TIGHT_RATIO * editorialCap` med `TIGHT_RATIO = 0.9`
(återanvänder ±10 %-kalibreringstoleransen). Bundlade mallens `activities` (115/120 =
95,8 %) flaggas alltså inte → inga falsklarm. Uppladdade mallar med små rutor flaggas.
`editorialOnly`-fält (kravmatris/team) har alltid budget = tak → aldrig trånga.

### Client-säkra konstanter (`src/lib/pptx-template/budget-types.ts`)
Redan klient-importerad, inga server-deps (JSZip/xmldom). Lägg till:
- `EDITORIAL_CAPS: Record<string, number>` — fältväg → redaktionellt tak. **Enda
  sanningskällan** för taken; `BUDGET_TOKENS` i `compute-budgets.ts` refererar den (så
  budgetvärdena är oförändrade — befintliga kalibrerings-/paritetstester vaktar).
- `FIELD_DISPLAY_LABELS: Record<string, string>` — fältväg → läsbar etikett utan `{N}`
  (t.ex. `phases[*].objective` → "Fas – Mål", `rows[*].requirement` → "Ska-krav").
  Okänd väg → fältvägen själv (fallback).
- `TIGHT_RATIO = 0.9`.

### UI (`TemplatePreview`)
Ersätt den råa budgettabellen med:
- Budgetar **grupperade per slide** (via `manifest.fieldSlides`; fält utan slide → sist),
  varje rad: läsbar etikett + teckentak. Trånga fält markeras (t.ex. amber text + "trångt").
- **Amber varnings-banner** överst när ≥1 trångt fält: rubrik "N fält är trånga i den här
  mallen — anbud mot den tvingar kortare text. Du kan aktivera ändå." + lista
  "{etikett} — mallen rymmer {budget} tecken (normalt {cap})".
- Aktivera-knappen oförändrad (ingen hård blockering).

Trånghet räknas i previewn från `manifest.budgets` + `EDITORIAL_CAPS` (klientsidan).

### Ingen migration / schemaändring
Taket är fält-semantik (samma för alla mallar) → previewn räknar trånghet lokalt.
Manifestet (disk + DB) rörs inte. Uppladdade mallars budgetar introspekteras redan färskt.

## Icke-mål (YAGNI)
- Ingen dry-run-simulering av innehåll vid upload (ingen text finns då).
- Ingen ändring av genereringstidens `OverflowChecklist` (redan klar).
- Ingen auto-korta (det är Task 3).

## Testning (TDD)
- `EDITORIAL_CAPS`-refaktor: befintliga kalibrerings-/introspekt-paritetstester ska
  fortsatt hålla (budgetvärden oförändrade).
- Enhetstest för trång-detektion (budget < 0.9×cap; editorialOnly aldrig trång; activities
  115/120 ej trång).
- Render-test för `TemplatePreview`: trångt fält → varning syns + aktivera-knapp finns kvar;
  inga trånga → ingen varning.
- Hela sviten + `tsc --noEmit` grön.
