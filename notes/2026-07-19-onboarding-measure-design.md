# Onboarding-mätpasset — defektdetektion + kalibrering i onboardingflödet — design

_2026-07-19. Brainstormad med Stefan efter kicker-enforcement (PR #88). Alla vägval nedan
är hans. Bakgrund: "vi behöver inte fixa Rådrum specifikt, vi behöver fixa processen för
onboarding och tokenization" — de tre kvarvarande grova overflow-klasserna är mallens egna
defekter, och processen ska upptäcka och hantera dem för GODTYCKLIGA mallar i stället för
att vi handpatchar testmallen._

## Problemet (evidens ur kodkartläggningen 2026-07-19)

Alla tre kvarvarande defektklasser ligger i ytor processen inte ser i dag:

1. **Master-/layout-boxar läses aldrig** — introspektionen öppnar bara slide-XML:erna
   (`read-pptx.ts`), så Rådrum-boxen (slide 2 "Text 36") blir aldrig kandidat, aldrig
   tokeniserad, aldrig mätt. COM-renderingen SER den dock (den finns i deck:scan-utfallet).
2. **"Box för liten"-signalen når ingen** — kalibreringen varnar redan (`"overflowed at
   minimum budget"` m.fl. i `buildSlotResult`) men bara som CLI-sträng; lagras aldrig,
   visas aldrig i wizarden. Statboxarna slide 4 är exakt den klassen.
3. **Defektlistan är eval-intern** — `evals/overflow/known-template-defects.json`
   genereras av `overflow:bootstrap` ur tomma mallen men konsumeras BARA av
   overflow-evalen; deck:scan och appen känner inte till kända malldefekter.
4. **Foreign-slots får inga budgetar vid onboarding** — kalibreringen är ett separat,
   PowerPoint-bundet CLI-steg efteråt; wizarden ger ingen kvalitetsfeedback alls.

## Beslut (Stefan 2026-07-19)

- **Omfattning:** malldefekt-detektion + kalibrering in i onboardingflödet ("mätspåret",
  detta dokument) → därefter tabeller (slice 6, eget spår). "Bredare tokenisering"
  (tokenisera master/layout, statisk text + token) valdes BORT.
- **Var mäts det:** HYBRID — servern gör en geometri-screen vid upload (gratis,
  preliminär); det skarpa mätpasset (COM) körs som operatörssteg lokalt.
- **CLI-kontext:** kommandot körs i en vanlig terminal i repo-katalogen på maskinen med
  PowerPoint (operatören själv eller en Claude Code-session). Appen kan aldrig köra det
  (Vercel saknar PowerPoint) — den visar kommandot och upptäcker resultatet.
  Rimligt produktantagande: Bidsmith är open source/self-hosted — den som kör appen har
  repot. **Angreppssätt 2 (lokal agent som wizarden fjärrstyr) är backup på sikt** om
  PowerPoint-/terminalkravet blir ett riktigt hinder.
- **Grind:** HÅRD — foreign-mall kan inte aktiveras utan genomfört mätpass och
  adresserade defekter (fail closed, samma filosofi som env-flaggan; okända budgetar
  ger bevisligen katastrofdeck).
- **Defekt-utfall:** RAPPORT + ÅTGÄRDSFÖRSLAG i wizarden; operatören väljer per defekt
  *fixa i mallen* eller *acceptera*. Accepterade defekter lagras som signaturer i
  profilen och annoteras (larmar inte) i deck:scan.

## Operatörsflödet

1. **Upload** (foreign pptx): som i dag (introspektion, precount, klassificering) PLUS
   geometri-screen (nedan). Screen-fynd lagras i `onboarding_draft` och visas i wizarden
   per slide, märkta "preliminär bedömning".
2. **Wizard + complete:** oförändrade (bekräfta slots → instrumenterad kopia skapas).
3. **Mätsteget (nytt wizard-moment efter complete):** kort med kommandot
   `npm run onboarding:measure -- <templateId>` att köra lokalt; wizarden pollar
   (samma mönster som klassificeringen) tills `profile.measurement` finns.
4. **Hälsorapporten (nytt wizard-moment):** listar defekter med konkret förslag
   ("Text 36 slide 2: rymmer ~3 tecken, innehållet kräver ~15 — bredda boxen eller
   acceptera"). Val per defekt: **acceptera** (PATCH → `status: "accepted"`) eller
   **fixa i mallen** (= redigera pptx:en och ladda upp på nytt; om-instrumentering mot
   befintlig profil är en känd backlogpost och ingår INTE i v1).
5. **Aktivering:** `activate`-routen kräver för foreign-mallar (isAllGenericProfile):
   `measurement.status === "complete"` OCH inga defekter med `status: "open"`.
   `slotWarnings` är enbart informativa (visas i rapporten) och grindar ALDRIG —
   det är defektsignaturerna som kräver ställningstagande.

## Datamodell — allt i profilen, ingen migration

Profilen är jsonb och `saveTemplateProfile` Zod-validerar redan. `TemplateProfileSchema`
utökas med två OPTIONELLA fält (gamla profiler parsar oförändrat):

```ts
measurement?: {
  status: "complete";           // skrivs bara vid lyckat pass (atomiskt i slutet)
  measuredAt: string;           // ISO
  calibrationRounds: number;
  unresolved: string[];         // tokens som frös på geometri-fallback
  slotWarnings: Record<string, string[]>;  // token → kalibreringsvarningar
}
knownDefects?: Array<{
  slide: number;                // signatur = slide + checkId + shape
  checkId: CheckId;             //   (samma som evalens KnownDefect)
  shape: string;
  baselineBoundHeightPt?: number;
  suggestion: string;           // genererad åtgärdstext (textmall per checkId ur mätdata)
  status: "open" | "accepted";
}>
```

Mätstatus bor i profilen — `onboarding_status`-enumen rörs inte (ingen migration).
Om-mätning ersätter `measurement` + `knownDefects` men **accept överlever**: merge på
signaturen (slide+checkId+shape); defekt som försvunnit efter mallfix faller ur listan.

## Mätpassets CLI — `npm run onboarding:measure -- <templateId> [--write]`

Ett pass, tre steg (dry-run default, `--write` persisterar — kalibreringsmönstret):

1. **Defektscan:** rendera den TOMMA instrumenterade mallen → COM-mät
   (`measure-overflow.ps1`) → de sju checkarna → FAIL- + grov-overflow-signaturer med
   baselineBoundHeight. Logiken generaliseras UT ur `scripts/overflow-bootstrap.ts` till
   `src/lib/pptx-template/measure/` (enhetstestbar, delas av bootstrap och mätpasset).
   Renderingen ser allt PowerPoint ritar — master-ärvda boxar (Text 36-klassen) fångas.
2. **Budgetkalibrering:** befintliga `calibrateTemplate` (binärsökning, `singleLine`),
   oförändrad.
3. **Skrivning:** ETT atomiskt `saveTemplateProfile` med budgetar + flaggor +
   `measurement` + `knownDefects` (förslagstext genereras här). Avbrott/COM-fel ⇒
   profilen orörd. Omkörning idempotent (accept-mergen ovan). CLI vägrar mall utan
   instrumenterad kopia; PowerPoint måste vara stängt (samma krav som kalibreringen).

## Geometri-screen på servern (upload-tid)

Körs i upload-routen efter introspektionen (där precount redan beräknas), ren XML-matte
via `compute-budgets` — inga nya beroenden, ingen COM:

- Statisk text vars längd överskrider boxens geometriska kapacitet ⇒ "ryms inte"-flagga.
- Kandidatbox med kapacitet under ~20 tecken ⇒ "trång box"-flagga.

Fynden lagras i `onboarding_draft` och visas i wizarden som PRELIMINÄRA (skarpa domen
kommer från COM-passet — geometri-matten ser inte autofit, det är känt och avsiktligt).
Master/layout ingår INTE i screenen (XML-läsning av masters = bortvald tokenisering);
den klassen fångas av COM-passet.

## Konsumenter

- **`deck:scan --profile <templateId>`:** träffar som matchar ACCEPTERADE signaturer
  rapporteras som "känd malldefekt" (INFO) i stället för FAIL/WARN — anbudsgranskning
  larmar bara på nytt. (Backloggens "--profile budget-checkar" är en annan, större sak
  och ingår inte.)
- **Overflow-evalen:** fryst JSON-fil RÖRS INTE (eval-integritet). Bootstrap kan i
  framtiden generera ur profilen — utanför v1.
- **Generering/enforcement:** orörda.

## Wizard/API-ytor

- `GET .../onboarding`: svaret utökas med `measurement`/`knownDefects` när status är
  onboarded (profil-join).
- Ny PATCH-yta för defekt-accept (foreign-flag-grindad som syskonen):
  signatur + `status: "accepted"` → uppdaterar profilen.
- `activate`-routen: grinden ovan.
- Wizard: mätsteg-kortet + hälsorapporten (poll-mönstret återanvänds).

## Avgränsningar (v1)

- Om-instrumentering av fixad mall mot befintlig profil: INTE i v1 (fixa = ladda upp på
  nytt genom wizarden; backlogpost finns).
- Tabeller (slice 6): nästa spår, eget dokument.
- Bredare tokenisering (master/layout, statisk text + token): bortvald.
- Lokal agent (fjärrstyrd mätning): backup på sikt, byggs inte nu.
- Overflow-evalens defektfil: oförändrad.

## Test & verifiering

- **Enhetstester:** defekt-generaliseringen (bootstrap-logik i lib), signatur-mergen
  (accept överlever om-mätning, försvunna defekter faller ur), schema-roundtrip
  (measurement/knownDefects optionella), aktiveringsgrinden (öppen defekt blockerar;
  komplett + accepterat släpper), geometri-screenens flaggor, förslagstext-generatorn.
- **Live-verifiering mot Radrum v4:** mätpasset ska hitta de kända klasserna (Text 36,
  statboxarna slide 4, bolagsnamnsboxen slide 1) med vettiga förslag; efter accept ska
  `deck:scan --profile` på ett skarpt genererat anbud ge 0 FAIL och 0 oannoterade grova
  — dvs. 5/5 PASS-vägen utan att Rådrum handpatchas.
- Grinden före "klart": svit + tsc + lint med output; PR mot main; invänta routinen.
