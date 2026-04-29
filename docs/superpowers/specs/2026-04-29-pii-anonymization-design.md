# PII-anonymization arkitektur

**Status:** På bänken. Skriven 2026-04-29 efter brainstorm. Inte planerad implementation. Aktiveras när första betakund konkret kräver det.

**Bakgrund:** Vi övervägde att bygga en PII-scrubbing-wrapper runt `callClaude()` med Presidio + spaCy. Brainstorm 2026-04-29 visade att det är fel scope — vi försvarar fel boundary med fel teknik vid fel tillfälle. Den verkliga risken är inte konsultens personuppgifter, det är konsultens *kunders* projektkontext (klientnamn, projektnamn, system, geografi). Originalbeslutet i `project_pii_strategy.md` (2026-04-12) bör läsas som tidigare iteration som denna spec ersätter.

## Hotmodell

**Vad vi primärt skyddar:** Konsulternas slutkunders projektkontext.

- Klientnamn ("Volvo", "Skåne Region", "Klarna")
- Projektnamn ("S/4HANA-migrationen 2024")
- Tekniska val som triangulerar projektet ("ersatte legacy-Oracle, integrerade Klarna betalsystem")
- Geografi och tidpunkter som tillsammans identifierar projektet

**Vad vi sekundärt skyddar:** Konsultens personuppgifter (namn, mejl, telefon, personnummer). Viktigt men inte primärt — det här är väl trampad mark juridiskt och Anthropic Enterprise-villkor + DPA räcker långt.

**Hotaktörer i prioritetsordning:**

1. Framtida AI-leverantör — vi kan byta från Anthropic till annan modell, då följer historiska promptar med
2. Anthropic — loggning, potentiell breach, subpoena från US-myndighet
3. Mellanled (Vercel) — datapassage även om de inte lagrar
4. Konsultfirmans egna användare som ser mer än sin roll motiverar
5. Konkurrerande konsultfirmor som råkar hyra samma slutkund

**Vad designen INTE skyddar mot:**

- Insider på konsultfirman som med flit exfiltrerar
- Slutkund som hackar konsultfirmans Supabase
- Output-läckage (Claude svarar med PII från träningsdata) — separat problem för bid-evaluator
- End-to-end-kryptering till Anthropic — tekniskt inte möjligt via deras API

## Arkitektur

### Två datavyer per CV

| Vy | Innehåll | Lagring | Tillgång |
|---|---|---|---|
| **Original** | Fulltext med klientnamn, projektdetaljer | Krypterad, svensk infra | Konsultfirmans interna användare + slutkund vid PPTX-export |
| **AI-Safe** | Strukturerad kompetensvektor + k-anonym fritext | Klartext, kan ligga var som helst | All AI-pipeline (matcher, scorer, bid-generator) |

K-anonym fritext = entiteter ersätts med kategorier, **inte med pseudonymer som mappas tillbaka**. Kategorier är icke-reversibla — vi vet att "tier-1 fordonstillverkare" var Volvo bara via Original-vyn, inte via AI-Safe-vyn.

Exempel:

- "Ledde digitaliseringen av Volvos servicebokningssystem 2023" → "Ledde digitaliseringen av tier-1 fordonstillverkares servicebokningssystem"
- "Ansvarig för Skåne Regions S/4HANA-migration" → "Ansvarig för svensk regional myndighets ERP-migration"
- "Implementerade Klarnas betalintegration mot Stripe" → "Implementerade nordisk fintechs betalintegration"

### Upload-pipeline

Körs en gång per CV vid upload, inte per AI-anrop. All AI-trafik nedströms läser AI-Safe.

1. **Parsing** — markitdown → text (oförändrat från idag)
2. **Strukturell PII-strip** — Presidio + spaCy strippar PERSON, EMAIL, PHONE, personnummer, postadresser
3. **Kontextuell anonymisering** — lokal/EU-LLM (~7-13B) skriver om fritext med kategorier istället för entiteter
4. **Strukturerad extraktion** — separat LLM-call producerar JSON: `{skills, years_experience, industries, role_archetypes, seniority, certifications}`
5. **Granskning** — konsultfirman ser preview vid första uppladdning per konsult: "Det här är vad AI:n kommer se av Anna." Godkännande/redigering. Auto-godkänd vid efterföljande uppdateringar (med spot-check-sample möjlig).
6. **Lagring** — Original krypterad i svensk-infra-bucket, AI-Safe i Postgres med foreign key till Original.

### `callClaude()`-wrapper

Wrappern blir en **assertion**, inte en scrubber:

- Caller skickar payload + ursprungstagg ("from AI-Safe view of consultant X")
- Wrapper verifierar att payload kommer från AI-Safe-källa
- Om någon kodgren råkar skicka Original → throw + log + larma

Det här fångar regressioner när någon bygger en ny feature som råkar hämta `consultant.original_text` istället för `consultant.ai_safe_view`.

### PPTX-export-undantag

Vid anbudsgenerering används **Original-vyn** för konsult-CV-sektionen. Det är OK eftersom:

- Output går direkt till slutkund som har rätt att se sin egen projektkontext
- Men output passerar Claude på vägen för bid-generation, så Claude måste promptas med AI-Safe — sen renderas Original in i PPTX-templaten i post-Claude-steget

Konkret: `bid-generator` producerar text utifrån AI-Safe. PPTX-applicator injicerar Original-uppdragsbeskrivningar i template-rendering efter att Claude returnerat sitt utkast. Aldrig Original i en Claude-prompt.

### Audit-vy

Konsultfirman kan exportera "vad har AI sett om konsult X?" → returnerar AI-Safe-vyn + log över anbud där den använts. Möjliggör att svara slutkunds compliance-fråga: "Vad har ni delat med AI om uppdraget hos oss?"

## Infrastruktur

**Lokal/EU-LLM hosting:**

- Svensk VPS med GPU: Glesys, Bahnhof, City Network (~3-15k SEK/mån beroende på modellstorlek och utilization)
- AWS Stockholm med Bedrock — kan köra Llama-modeller eller Claude med EU-data-residency
- Mac M2/M3 räcker för dev och tidig beta (16GB+ RAM, 7-13B-modeller)

**Modellkandidater för anonymisering:**

- Llama 3.1 8B Instruct — billig, snabb, OK svenska
- Mistral Nemo 12B — bättre svenska, något långsammare
- Mixtral 8x7B — högre kvalitet, kräver mer VRAM
- KBLab eller AI Swedens svensk-fine-tunade varianter — om generell engelska-tränad missar svensk kontext

**Modellkandidater för strukturerad extraktion:**

- Samma modeller som anonymisering, men 3-7B räcker för JSON-extraktion
- Alt: behåll Claude för extraktionssteget om vi accepterar att kompetenslistor inte är PII (rimligt — "Java", "AWS" är inte hemligt)

## Öppna frågor (löses vid implementation)

1. **Vilken lokal LLM?** Bygg eval med 20 syntetiska CV:n och mät: hur väl kategoriseras klientnamn? Vilken läcker minst kontextuellt?
2. **Schema för AI-Safe.** Förslag: utöka `consultant_profile`-tabellen med `ai_safe_summary` (text) + `ai_safe_skills` (jsonb), eller separat tabell `consultant_ai_safe_view` med foreign key.
3. **Preview-UX.** Diff-vy mellan original och anonymiserad? Inline edit? Hur mycket friktion accepterar konsultfirman vid första uppladdning?
4. **Migration av befintliga CV:n.** Bakgrundsjobb som kör pipelinen mot alla existerande. Vad gör vi med pågående anbud som redan använt original-vyn?
5. **PPTX cross-tenant-säkerhet.** Test: två slutkunder A och B, samma konsult Anna med uppdrag hos A. När Anna föreslås i B:s anbud — Annas uppdrag hos A ska vara k-anonyma i det PPTX:et. Säkerställ via anbud-scope: PPTX-template läser Original *bara* när uppdraget gjordes hos anbuds-mottagaren.
6. **Kostnad.** Vid 100 / 1000 / 10000 CV:n — VRAM-kostnad per månad? Per-CV-kostnad?
7. **Audit-format och granularitet.** Per-CV-export räcker, eller måste vi ha per-anbud-trace?

## Hur den här specen aktiveras

**Trigger:** En konkret betakund (eller stark prospect) säger något av:

- "Standard DPA räcker inte"
- "Data får inte lämna EU i klartext"
- "Vi har slutkunder som kontraktuellt förbjuder spridning av projektdetaljer till tredje part"

**När det händer:**

1. Läs denna spec
2. Validera att premissen fortfarande gäller — har vi vuxit ifrån behovet? Har Anthropic erbjudit en lösning som kortar arkitekturen (t.ex. Claude on Bedrock EU + zero retention + DPA räcker plötsligt)?
3. Skriv implementation plan via writing-plans-skill
4. Bygg

**Tills dess:** Bygg produktfeatures, validera marknad, ha den här i bakfickan.

## Validering vi inte bygger för fantomkrav

Innan denna spec aktiveras bör Stefan:

1. Ringa Ekan IT-ansvarig (eller annan målkundsfirma) och fråga konkret: "Vad krävs för att er IT/jurist ska säga ja till att vi processar era konsult-CV:n med Anthropic-modell?"
2. Mappa svaret mot tre nivåer:

| Nivå | Krav | Lösning |
|---|---|---|
| **1** | Standard DPA + zero-retention räcker | Denna spec stannar på bänken. Adressera med juridisk approach + Anthropic Enterprise-villkor. |
| **2** | EU-data-residency krävs | Börja med Anthropic via AWS Bedrock Stockholm + standard DPA. Eskalera till denna spec om kvalitetsgap mot Claude-direkt blir för stort. |
| **3** | Inget kunduppgift får lämna EU i klartext | Denna spec aktiveras. |

Om vi inte vet svaret bör vi inte bygga något PII-relaterat alls.

## Saker som explicit INTE ingår

- **Pseudonymisering med tillbaka-mappning.** Vi använder kategorisering istället — pseudonymer är reversibla och kräver mapping-store; kategorier är icke-reversibla och enklare att försvara juridiskt.
- **Output-validering.** Vi kontrollerar inte vad Claude svarar. Om Claude hallucinerar en klientnamn fångar vi inte det här — separat problem för bid-evaluator.
- **End-to-end-kryptering till Anthropic.** Anthropic stödjer det inte i sitt API. Inte möjligt utan AWS Bedrock-style enclave.
- **PII-detection i Claude:s svar.** Om Claude returnerar text med PII från sin träningsdata flaggas det inte här. Vi assertar bara på input.

## Relaterade memories

- `project_pii_strategy.md` — original-arkitekturbeslutet 2026-04-12 (Presidio-only utan two-view-design). **Bör uppdateras** för att peka på denna spec som ny iteration.
- `project_dealflow_next_steps.md` — där PII listas som prio 4. **Bör uppdateras** till "på bänken — kräver kund-validering innan implementation".
- `project_pricing_model.md` — om vi tar betalt för "EU strict mode" som premium-tier kan det motivera kostnaden för anonymiserings-pipelinen.
