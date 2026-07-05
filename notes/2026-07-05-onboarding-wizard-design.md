# Design: Onboarding-wizard för kundmallar (slice 5-UI)

Godkänd av Stefan 2026-07-05. Sista biten av mall-uppladdningsspåret
(design-doc: `notes/2026-07-02-template-upload-architecture.md`).
Riktning låst sedan 2026-07-04: guidad wizard, slide-för-slide.

## Vad som byggs

UI:t + API-limmet som binder ihop redan levererad backend:
upload → `proposeInjectionPlan` (#52) → människan bekräftar/ändrar/skippar
per slot → `instrumentTemplate` (#51) → profil sparas (`profile-store`) →
mallen körbar via profil-driven generering (#68).

## Beslut (Stefan 2026-07-05)

1. **Ingång: auto-detektering vid upload.** Samma uppladdningsyta som idag.
   Tokenlös pptx sparas som utkast och användaren skickas in i wizarden,
   som börjar med en startsida (antal slides/textrutor + ungefärlig
   AI-kostnad) innan klassificeringen körs.
2. **Slide-vy: wireframe av geometrin.** Sliden ritas som skalenlig yta med
   textrutorna på sina riktiga positioner (data finns i `readPptxSlides`);
   kandidatrutor klickbara. Ingen pptx-bildrendering (PowerPoint finns inte
   på Vercel).
3. **Redigering per slot: intent + tokennamn + skippa.** Klassificerarens
   förmåge-gissning visas som info-etikett men är INTE valbar — v1-profilen
   mappar medvetet allt till generic-prose (specialiserade applikatorer
   kräver våra kanoniska tokens; slide-nivå-dispatch är känd backlog-post).
4. **Utkast persisteras + explicit aktivering.** Förslaget sparas direkt
   efter klassificering (avbrott kostar inget); slutförande instrumenterar
   och sparar profil; aktivering förblir ett separat explicit steg (samma
   semantik som idag — upload aktiverar aldrig).
5. **Angreppssätt A: route-baserad wizard med server-utkast** (valt över
   modal och chat-driven intervju).

## Verifierade kodfakta som styr designen

- Tokenlös mall får idag 422: `introspectTemplate` kastar "ingen slide
  matchade någon känd signatur" (`introspect/index.ts`) → detekteringspunkt.
- `templates.manifest` är `NOT NULL` (migration 004) och en främmande mall
  kan inte producera ett manifest → migration krävs.
- `instrumentTemplate(buffer, TokenInjection[])` adresserar shapes exakt som
  `ProposedSlot` (source + shapeIndex + token) — förslaget matar motorn direkt.
- `classifyForeignSlot` kör `MODELS.matching` (Sonnet 5); 50–100 anrop per
  riktig mall ≈ under en dollar, men för lång väggklocketid för en synkron
  Vercel-request → async-mönster krävs (samma som bid-genereringen,
  migration 002-mönstret).
- Bolagsprofil/tonalitet: inget nytt wizardsteg — generic-prose får redan
  företagsprofilen via `formatContext` (#66/#68).

## 1. Tillstånd & dataflöde

Migration **012** (ny fil, appliceras manuellt via Supabase SQL Editor):
- `templates.manifest` → nullable (`alter column ... drop not null`).
- Ny kolumn `onboarding_status text not null default 'none'`
  (`none` | `needs_onboarding` | `classifying` | `draft` | `onboarded`).
- Ny kolumn `onboarding_draft jsonb` (förslaget + användarens slot-beslut).

`POST /api/templates`: när `introspectTemplate` kastar
"ingen slide matchade" → foreign-väg i stället för 422:
- Filen sparas i storage som idag; **originalet behålls** (behövs för
  framtida re-onboarding-merge, backloggad).
- Rad: `manifest = null`, `onboarding_status = 'needs_onboarding'`.
- Svar: `{ needsOnboarding: true, id }` → klienten navigerar till wizarden.
- Token-bärande mallar går dagens väg orörd.

Aktiverings-endpointen (`POST /api/templates/[id]/activate`) får grind:
vägra status utanför `none`/`onboarded`.

## 2. API — `/api/templates/[id]/onboarding`

- **POST `/propose`** — laddar originalet ur storage, kör
  `proposeInjectionPlan`, sparar utkastet i `onboarding_draft`,
  status → `draft`. Körs asynkront (status `classifying` under tiden,
  UI pollar) enligt bid-genereringens mönster. Idempotent: befintligt
  utkast returneras; `force` kör om.
- **PATCH `/`** — persisterar slot-beslut löpande:
  `{ source, shapeIndex, decision: "confirm"|"skip", token?, intent? }`.
  Server-side-validering (tokenformat mot `instrumentTemplate`s TOKEN_RE,
  adress finns i utkastet).
- **POST `/complete`** — bygger `TokenInjection[]` av bekräftade slots →
  `instrumentTemplate` → instrumenterad pptx laddas upp som NYTT
  storage-objekt (`{name}/v{n}-instrumented.pptx`, originalet kvar) →
  `storage_path` pekas om → slutprofil (endast bekräftade slots, med
  redigerade intents; skippade slots utelämnas — render-sidan blankar
  redan skip, #68) → `saveTemplateProfile` → status `onboarded` →
  `clearTemplateCache`. Ordningen vald så fel mitt i lämnar status `draft`
  — aldrig ett halvt tillstånd.

## 3. Wizard-UI — route `/installningar/mallar/[id]/onboarding`

- **Start:** X slides, Y kandidatrutor, ungefärlig kostnad + tid,
  [Starta klassificering]; pollar tills utkast finns.
- **Slide-för-slide:** wireframe skalad ur shape-geometrin (EMU → px),
  kandidatrutor klickbara, aktuell markerad. Högerpanel per slot:
  tokennamn (redigerbart), intent (redigerbart — generic-proses viktigaste
  styrsignal), förmåge-gissning som info-etikett, konfidens.
  Bekräfta/Skippa per slot + "Godkänn slidens förslag" som bulk.
  Hög konfidens = förbockad; låg konfidens kräver ställningstagande.
  Slides utan kandidater hoppas över (statiska i navigeringsremsan).
  Shapes med text men utan geometri listas under wireframen (kan inte
  placeras rumsligt).
- **Sammanfattning:** tabell över alla beslut, [Slutför onboarding] →
  klart-vy med aktivera-CTA (befintlig endpoint).
- Varje beslut PATCH:as direkt — stängd flik = gratis resume på samma route.

## 4. Felhantering

- `proposeInjectionPlan` kastar "no candidate slots" → ärligt fel på
  startsidan ("mallen har inga fyllbara textrutor").
- Klassificeringsfel → status backar till `needs_onboarding` + retry.
- `complete` med ogiltiga tokens → 422 med fel per slot (validering finns
  i `instrumentTemplate`).
- Profil-sparfel → status förblir `draft`; complete kan köras om.
- `complete` med noll bekräftade slots → 422 ("minst en textruta måste
  bekräftas") — en all-skip-mall kan inte generera något och ska inte
  kunna markeras `onboarded`.

## 5. Test

- Enhetstester: beslut→`TokenInjection[]`/slutprofil-logiken,
  EMU→px-skalningen, PATCH-validering.
- Kedjetest: syntetiska mini-pptx:en (från instrument-testerna) genom
  upload → propose → complete → `loadTemplateProfile`, med MOCKAD
  klassificering — noll live-API i tester (kostnadstrappan).
- Betald verifiering (operatör): riktig kundmall genom wizarden +
  PowerPoint-COM-öppning av instrumenterade kopian (rutinen från
  2026-07-03-smoken).

## Avgränsningar (medvetna, v1)

- Ingen förmåge-mappning i UI:t (allt generic-prose) — slice 6.
- `budgetChars` för främmande slots sätts inte (geometri→budget-kopplingen
  är egen backlog-post) — generic-prose saknar längdstyrning tills dess.
- Re-onboarding av delvis instrumenterad mall: befintliga tokens fylls
  inte (profil-merge backloggad, routine-follow-up #52).
- Per-mall structure-eval saknas (foreign bids får `structure_eval = null`,
  #68).
