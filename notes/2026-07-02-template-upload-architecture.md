# Design: Mall-uppladdning för godtyckliga bolagsmallar

Genererad via office-hours 2026-07-02
Status: UTKAST (godkänt angreppssätt: A+C, B inkrementellt)
Repo: bidsmith

## Problem

Bidsmith renderar idag mot EN mall vi själva känner igen: fasta slides med
`{platshållare}`, hårdkodade applikatorer per slide-typ (cover, prose, phases,
requirement-matrix, team-pricing, reference, confidentiality, certifications),
och en bundle per sektionstyp. Bundle-output ↔ applikator ↔ platshållare ↔
manifest är tätt kopplade.

Problem: en kund laddar upp sin egen mall med andra sektioner, annan struktur,
andra platshållare — kanske sektioner vi aldrig kodat en bundle för
("Hållbarhetsredogörelse", "Riskregister", "Prismodell enligt bilaga 4").
Renderingen vet då inte vad som ska fyllas var.

**Beslut (Stefan 2026-07-02):** Bidsmith ska kunna generera för godtyckliga
mallar — inte bara våra fasta sektionstyper.

## Premisser (överenskomna)

1. **Moaten är genereringen, inte mallen.** Värdet är den domänspecifika
   intelligensen (kravextraktion, matchning, coverage-roll-up, go/no-go). En ren
   generisk "skriv prosa i rutan" är commodity. → Motorn ska vara
   **kapabilitets-baserad**: ett bibliotek av förmågor matchas mot kundens slots;
   generisk prosa är FALLBACK, inte default.
2. **Onboarding ≠ rendering.** Mallar laddas upp sällan, anbud genereras ofta. Gör
   den dyra AI-förståelsen EN gång vid uppladdning; per-anbud-rendering är
   deterministisk och snabb mot en sparad profil.
3. **Den durabla artefakten är en mall-profil**, inte "AI läser mallen varje gång".
   Inspekterbar, redigerbar, återanvändbar.

## Rekommenderat angreppssätt: A + C (B inkrementellt)

- **A — Kapabilitets-mappning:** behåll de specialiserade bundlarna; onboarding
  klassificerar varje slot till en känd förmåga (eller generisk prosa / skip);
  renderaren blir förmåge-driven. Bevarar moaten, minst bygg.
- **C — Intervju-assisterad onboarding:** introspektionen SEEDAR ett guidat
  slot-för-slot-samtal där Claude föreslår och kunden bekräftar. Hög
  mappnings-kvalitet; människo-jobbet sker bara en gång per mall.
- **B — Generisk sektionsmotor (senare, inkrementellt):** börja med prosa-box-
  formatet (täcker ~80% av främmande sektioner), lägg till lista/tabell vid behov.

Flöde: kund laddar upp mall → guidad onboarding (Claude föreslår, kund bekräftar)
→ sparad mall-profil → varje framtida anbud renderas deterministiskt mot profilen.

## Mall-profil (schema — första byggstenen)

Per uppladdad mall, en profil som mappar varje slot till hur den ska fyllas.
Utgår från befintlig introspektion (`identify-slides` / `compute-budgets`) men
generaliserar bort de hårdkodade slide-typerna.

```
TemplateProfile {
  templateId, name, version
  slides: SlideProfile[]
}

SlideProfile {
  source: number            // slide-index i pptx
  slots: SlotProfile[]
  cloneFrom?: capabilityId  // upprepad sektion (per fas/referens/rad)
}

SlotProfile {
  placeholder: string       // "{Vår metod}" — nyckeln i pptx
  capability: CapabilityId  // vilken förmåga fyller den (se nedan)
  format: "prose" | "bullets" | "table-rows" | "field"
  intent: string            // härlett/bekräftat syfte, matas till generisk generator
  budgetChars?: number      // ur geometrin (compute-budgets återanvänds)
  status: "mapped" | "generic" | "skip"  // hur onboarding löste sloten
}
```

CapabilityId = ett stabilt id per förmåga (se biblioteket nedan). Profilen är
JSON, sparas per mall (Supabase), och är REDIGERBAR i UI:t (kund kan rätta en
felmappad slot utan att ladda upp om).

## Kapabilitets-bibliotek (mappa dagens bundles → förmågor)

Varje nuvarande bundle blir en "förmåga" med ett deklarerat kontrakt
(input = anbudskontext, output = strukturerad data + format den kan rendera i):

| CapabilityId        | Idag (bundle/applikator)        | Output-form        |
|---------------------|----------------------------------|--------------------|
| requirement-matrix  | requirement-matrix               | table-rows         |
| execution-plan      | phases / phase-detail            | faser (clone)      |
| go-no-go            | (go/no-go-motorn)                | prosa/fält         |
| team-pricing        | team-pricing                     | table-rows         |
| references          | reference (clone)                | clone per referens |
| secrecy/OSL         | confidentiality                  | prosa/fält         |
| understanding       | understanding (prose-variant)    | prosa              |
| certifications      | certifications                   | fält               |
| **generic-prose**   | NY — fallback                    | prosa (budgeterad) |

"generic-prose" = en enda ny bundle: givet `intent` + anbudskontext + budget,
skriv passande prosa. Detta är B:s första format och A:s fallback samtidigt.

## Onboarding-flöde (introspektion → intervju → spara)

1. **Introspektera** (utökar dagens `identify-slides`): hitta alla `{...}`-slots,
   deras geometri (budget via `compute-budgets`), och format-gissning (tabell vs
   textbox vs fält, från shape-typ — vi vet redan skilja tabellfält från prosa).
2. **Auto-klassificera** (LLM): för varje slot, föreslå `capability` + `intent`
   ur platshållar-etiketten + rubriker/omgivande statisk text på sliden. Hög
   säkerhet → förvald; låg säkerhet → flaggad för intervju.
3. **Intervju** (C): guidat slot-för-slot där Claude visar sitt förslag och kunden
   bekräftar/ändrar/skippar. Fånga även mall-globalt: tonalitet, bolagsprofil
   (återanvänd fas 2C härledd profil).
4. **Spara profil.** Validera att alla slots har status (mapped/generic/skip).

## Rendering-ändring

Renderaren går från slide-TYP-driven (`applicatorFor(slideCfg.type)`) till
PROFIL-driven: för varje slot, kör dess `capability` → få strukturerad data →
rendera i slotens `format`. Format-renderarna är få och generiska:
- `field` / `prose` → platshållar-ersättning (finns redan, `replace*TextNodes`).
- `table-rows` → den innehållsmedvetna radlogiken vi just byggde för kravmatrisen
  (`restackMatrixRows` / `paginateMatrixRows`) generaliseras.
- `bullets` → punktlista (finns delvis i phases).
- `clone` → befintliga `cloneFrom`-mekanismen (fas/referens/kravmatris).

Poäng: vi ÅTERANVÄNDER det vi redan byggt; det nya är (a) profil-lagret som
kopplar slot→capability→format, och (b) generic-prose-fallbacken.

## Inkrementell byggordning

1. **Mall-profil-schema + lagring** (Supabase-tabell + Zod). Ingen UI än.
2. **Introspektion → auto-klassificering** som producerar en profil för VÅR
   egen mall (verifiera att den reproducerar dagens beteende — regressionsgrind).
3. **Profil-driven renderare** bakom feature-flagga; kör vår mall genom den och
   jämför mot golden (bit-paritet = klart).
4. **generic-prose-bundle** + prose/field-format (täcker främmande sektioner).
5. **Onboarding-UI** (introspektion + intervju + redigerbar profil).
6. **B inkrementellt:** bullets, sedan table-rows för godtyckliga tabeller.

Slice 2–3 är den kritiska grinden: om profil-driven rendering reproducerar vår
egen mall bit-för-bit mot golden, vet vi att generaliseringen inte tappade något.

## Öppna frågor / risker

- **Format-detektion från shape.** Kan vi pålitligt skilja tabell/prosa/lista ur
  pptx-XML för godtyckliga mallar? Vår egen mall: ja (vi vet mönstren). Främmande:
  osäkert — intervjun är backstoppen.
- **Kvalitet på generic-prose.** Grundare än specialiserad output. Risk att
  främmande sektioner blir generiska. Mildras av bra `intent` + budget + att kända
  sektioner fortfarande får specialbehandling.
- **Clone-detektion.** "Upprepad sektion" (per fas/referens/rad) är svårare att
  auto-upptäcka i främmande mallar. Troligen intervju-fråga i v1.
- **Kravmatrisen som prejudikat.** All layout-logik (radhöjder, paginering,
  status-pillar) är kalibrerad mot VÅR mall. Godtyckliga tabeller kräver
  om-kalibrering — därför table-rows sist i B.

## Nästa steg

Slice 1: mall-profil-schema + Zod + Supabase-migration. Verifierbart kriterium:
kan serialisera/deserialisera en profil för vår egen anbudsmall-v2 som beskriver
alla dess slots. Det låser datamodellen innan renderaren byggs om.
