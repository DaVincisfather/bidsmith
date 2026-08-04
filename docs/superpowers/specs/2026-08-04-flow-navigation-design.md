# Flödesnavigering: analys → go/no-go → editor

**Datum:** 2026-08-04 · **Status:** godkänd design (Stefans beslut i brainstorm-session)
· **Mål:** före lanseringen 2026-08-11

## Problem

Kärnflödet är enkelriktat och tappas vid sidladdning. Teamlås + go/no-go-resultat är
enbart klient-state (`analysis-match-section.tsx`: useState, rehydreras aldrig ur DB
trots att `go_no_go_assessments` persisterar allt). Analysvyn länkar aldrig till
existerande anbud — enda vägarna in i editorn är redirect efter lyckad generering,
"Öppna utkastet ändå" (partial) och Pipens rader för inlämnade anbud. Vägen tillbaka
blir "generera nytt anbud" = ny bid-rad + ny API-kostnad. Dessutom skapar varje
"generera"/"Ändra team" en NY bid-rad — en analys ackumulerar dubblettanbud.

## Beslut (Stefan 2026-08-04)

1. **En analys = ETT anbud.** Omgenerering ersätter anbudet i stället för att skapa
   nya rader. (1:1-regeln upprätthålls framåt av POST-semantiken; ingen migration.)
2. **Utkast ersätts, exporterade fryses.** Draft/failed skrivs om på samma rad
   (id består). Efter MD-export är anbudet fryst — omgenerering blockeras (utfalls-
   loopen spårar det inlämnade anbudet).
3. **Hård reset vid upplåsning.** "Lås upp och ändra team" raderar go/no-go-
   bedömningen OCH utkastet; stegen gråas ut igen. Bekräftelsedialog krävs när ett
   utkast finns ("Detta raderar utkastet — fortsätt?") eftersom betalt AI-innehåll
   slängs. Efter export kan teamet inte låsas upp (fryst = läsläge).
4. **Approach A:** delad stegnav-komponent + egen go/no-go-sida; editorn ligger kvar
   på `/bids/[id]` (befintliga länkar förblir giltiga).

## Sidstruktur

Tre sidor delar en `FlowNav`-komponent överst: **Analys & team → Go/No-Go → Anbud**.

| Sida | Innehåll |
|---|---|
| `/analysis/[id]` | Analysresultat + matchning + teamval (som i dag). Go/no-go-resultatvyn FLYTTAS härifrån. "Lås team (N valda) och kör Go/No-Go" → POST → redirect till go/no-go-sidan. |
| `/analysis/[id]/go-no-go` (NY) | Teamkorten överst (låsta; "Lås upp och ändra team" bakom bekräftelsedialog), go/no-go-resultatet (rehydrerat ur senaste assessment — inga AI-anrop vid sidladdning), "Generera anbud"-knappen (skapar/ersätter). Efter generering → redirect `/bids/[id]`. |
| `/bids/[id]` | Editorn som i dag + FlowNav överst. "Ändra team"-länken pekar på go/no-go-sidan (ersätter dagens `#team`-ankare). |

### FlowNav-stegstatus (härleds server-side, aldrig klient-state)

- **Analys & team:** alltid klickbar.
- **Go/No-Go:** klickbar om senaste assessment finns för analysen; annars utgrå +
  tooltip "Lås teamet först".
- **Anbud:** klickbar om bid finns (inkl. failed — då med "misslyckad"-märkning);
  annars utgrå + tooltip "Kör Go/No-Go och generera först".
- Aktivt steg markerat. Utgråade steg är oklickbara.
- Visuellt: befintliga design-tokens (burgundy/ink/paper). Slutlig polish itereras
  live med Stefan — inga nya visuella beslut i implementationen.

## Dataflöde

Ny delad serverfunktion **`loadFlowState(analysisId)`** — enda sanningskällan för
alla tre sidorna + naven:

```
{ latestMatch, latestAssessment (id, teamConsultantIds, result, decision),
  bid (id, status, exportedAt) | null }
```

- Hämtar: senaste `matches`-raden, senaste `go_no_go_assessments`-raden, senaste
  `bids`-raden per analysis_id (1:1 framåt; "senaste" hanterar befintlig dev-data).
- Analys-sidan: `teamLocked` = assessment finns (ersätter useState-låset).
- Editorn: läser flowstate via bidets `analysis_id` för naven.

## API-ändringar

**`POST /api/bids` (ersättningssemantik):**
- Inget anbud för analysen → skapa (som i dag).
- Utkast finns (draft/failed) → återanvänd samma rad: nollställ `sections`,
  `failed_bundles`, generation-fel; uppdatera `team_consultant_ids` +
  assessment-koppling; kör `runBidGeneration` igen. Id består.
- `status = generating` → `409` "generering pågår".
- `exported_at` satt → `409` "anbudet är inlämnat och fryst".

**`POST /api/analyses/[id]/unlock-team` (NY):** raderar analysens go/no-go-
bedömning(ar) och utkast i en operation. `409` om anbudet är exporterat.
Anropas av go/no-go-sidans upplåsning efter bekräftelsedialogen.

**Städning:** go/no-go-state + `proceedToBid`-logiken lyfts ur
`analysis-match-section.tsx`; komponenten behåller endast matchning + teamval.

## Kantfall

- **Misslyckad generering:** Anbud-steget klickbart med märkning; go/no-go-sidans
  Generera-knapp = omkörning (ersätter utkastet). Stänger backlog-posten
  "omkörningsknapp för fallerade genereringar".
- **Efter export:** hela flödet läsläge — teamet permanent låst, Generera-knappen
  ersätts av "Anbudet är inlämnat"; utfall loggas i Pipen som i dag.
- **Foreign-anbud** (t.ex. 195-kapitelanbuden i dev): rörs inte; naven fungerar
  eftersom bid-raden finns.
- **Befintliga dubblettanbud** (dev-data): naven pekar på senaste; äldre rader
  ligger kvar osynliga; exporterade dubbletter syns i Pipen som förr.

## Utanför scope

- Versionering av anbud (avfärdad — fryst export + ersatt utkast räcker).
- Foreign-flödets visning (parkerad med PPTX-motorn).
- Ny visuell formgivning utöver befintliga tokens.

## Tester & grindar

- Enhetstester: `loadFlowState`-härledningen (alla stegstatus-kombinationer),
  POST /api/bids-vägarna (skapa/ersätt/409 generating/409 exporterad),
  unlock-endpointen (reset + 409), FlowNav-rendering (utgrå/aktiv/klickbar/failed).
- Grindar före "klart": hela sviten + lint + tsc + **`next build`** (nya sidor =
  page/route-exportvakten) + visuell smoke av hela kedjan i dev
  (~$1,5–2 API-kostnad för en full livekörning).
- Process: `feat/flow-navigation` i egen worktree (push till remoten `bidsmith`),
  fräsch code-reviewer före merge (regressionskänsligt kärnflöde), invänta
  PR-routinen.
