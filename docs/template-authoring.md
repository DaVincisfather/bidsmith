# Författa en anbudsmall för Bidsmith

Den här guiden beskriver hur du gör din egen anbuds-PPTX till en mall som Bidsmith kan
fylla automatiskt. Målet är att onboarding ska vara så enkel som möjligt: kopiera
designmallen, byt ut det visuella mot ert eget varumärke, behåll placeholder-tokens —
klart.

Bidsmith hittar och fyller fält genom att leta efter `{Token}`-textplaceholders i din
presentation. Den rör aldrig din design (färger, fonter, logotyp, bakgrunder, bilder) —
bara texten i de tokens den känner igen. Allt annat följer med exporten orört.

> Källsanning för exakta tokensträngar är koden:
> `src/lib/pptx-template/introspect/identify-slides.ts` (signaturer),
> `src/lib/pptx-template/introspect/compute-budgets.ts` (budgettak) och
> applicatorerna i `src/lib/pptx-template/applicators/*.ts` (fullständiga
> token-listor per slide). Den här guiden speglar dem; vid avvikelse är koden facit.

---

## 1. Konventionen

En anbudsmall är en vanlig PPTX där **varje AI-fyllt fält är en `{Token}`-textplaceholder**.
Tokens skrivs ordagrant i ett textfält, inklusive klamrarna `{ }`. När Bidsmith genererar
ett anbud byts varje känd token mot AI-skriven eller deterministisk text.

### Två slags tokens

- **Identifierande tokens (KRÄVS):** dessa utgör slidens *signatur*. Bidsmith känner igen
  vilken slide-typ en sida är genom att en uppsättning obligatoriska tokens finns på sidan.
  Saknas någon av dem matchar inte sliden — den hamnar under "okända placeholders".
- **Övriga tokens (fylls om de finns):** resten av tokens på sliden fylls när de
  förekommer, men deras närvaro avgör inte identifieringen. Saknas de lämnas bara det
  fältet ofyllt.

### Identifiering är signaturbaserad — en slide per semantisk typ

Bidsmith matchar varje sida mot en tabell av signaturer. **Den första sidan som matchar en
viss typ blir den kanoniska mallen** för den typen; ytterligare sidor som matchar samma
signatur exkluderas som dubletter (se §4). Signaturtabellen är disjunkt: en sida får inte
matcha flera typer samtidigt (då stoppar introspektionen med ett fel — ta bort
överlappande tokens).

### Exakt unicode spelar roll

Flera tokens innehåller specialtecken. De måste skrivas med exakt rätt tecken — fel
streck-variant är det vanligaste felet (se §7):

| Tecken | Unicode | Namn | Förekommer i |
|---|---|---|---|
| `—` | U+2014 | em-streck (långt) | separatorn ` — ` i de flesta tokens, t.ex. `{Fas 1 — namn}` |
| `–` | U+2013 | en-streck (kort) | Gantt-spann, t.ex. `{M1–M2}`, `{M2–M5}` |
| `§` | U+00A7 | paragraftecken | `{OSL kap X §Y}` |
| `”` | U+201D | höger citattecken | `{Referens 1 — kort kontextrad, t.ex. ”…”}` |
| `Å Ä Ö å ä ö` | — | svenska tecken | `{Mål}`, `{Värför …}`, `{Höger}`, `{Vänster}` m.fl. |

Tumregel: separatorn mellan en etikett och ett begrepp (`Fas 1 — namn`) är **em-streck**;
ett intervall mellan två punkter (`M1–M2`) är **en-streck**.

### Token-tabell per slide-typ

Nedan listas alla slide-typer Bidsmith känner igen. **Fet** = token KRÄVS för
identifiering (slidens signatur). Övriga tokens fylls om de finns. `{Bolagsnamn}` och
`{Diarienummer}` är *footer-tokens* — de får finnas på alla slides utom cover och fylls
överallt de förekommer (de räknas inte som innehåll vid identifiering, se §1 och §4).

#### cover (omslag)

| Token | Roll |
|---|---|
| **`{Upphandlingens namn}`** | signatur |
| **`{Kundnamn}`** | signatur |
| **`{Anbudsdatum}`** | signatur (får stå på två ställen på omslaget — alla fylls) |
| `{Bolagsnamn}` | fylls |
| `{Diarienummer}` | fylls |

#### prose — variant `kunden-idag` (kundens nuläge)

| Token | Roll |
|---|---|
| **`{Nuläge}`** | signatur |
| **`{Smärtpunkter}`** | signatur |
| `{Bolagsnamn}`, `{Diarienummer}` | footer |

#### prose — variant `uppdraget` (uppdragsbeskrivning)

| Token | Roll |
|---|---|
| **`{Stycken}`** | signatur |
| `{Bolagsnamn}`, `{Diarienummer}` | footer |

#### prose — variant `vision` (utmaningar och värde)

| Token | Roll |
|---|---|
| **`{Utmaningar}`** | signatur |
| **`{Värden}`** | signatur |
| `{Bolagsnamn}`, `{Diarienummer}` | footer |

Prose-sliderna identifieras på sin token-signatur, inte på slidnummer. Du kan lägga dem i
valfri ordning i din mall — varianten avgörs av tokens, inte av position.

#### phases-overview (fasöversikt med Gantt)

| Token | Roll |
|---|---|
| **`{Fas 1 — namn}`** | signatur |
| **`{Fas 1}`** | signatur |
| **`{Fas 2 — namn}`** | signatur |
| `{Fas 1 — kort beskrivning. Detaljer på nästa slide.}` | fylls (kort-text Fas 1) |
| `{Fas 2 — beskrivning}`, `{Fas 3 — beskrivning}`, `{Fas 4 — beskrivning}` | fylls |
| `{Fas 3 — namn}`, `{Fas 4 — namn}` | fylls |
| `{M1–M2}`, `{M2–M5}`, `{M5–M9}`, `{M9–M12}` | Gantt-spann (en-streck!) |
| `{Fas 2}`, `{Fas 3}`, `{Fas 4}` | Gantt-etiketter |
| `{Bolagsnamn}`, `{Diarienummer}` | footer |

Fyra fasplatser är fasta (Fas 1–4). `{Fas N — namn}` är en supersträng av `{Fas N}` —
applicatorn hanterar ersättningsordningen åt dig, men håll båda formerna intakta i mallen.

#### phase-detail (fasdetalj, klonas per fas)

| Token | Roll |
|---|---|
| **`{Mål}`** | signatur |
| **`{Aktiviteter}`** | signatur |
| **`{Leveranser}`** | signatur |
| **`{Beslut}`** | signatur |
| `{Fas 1 — namn}` | fasnamn (alltid "Fas 1"-varianten i XML, även på kloner) |
| `{M1–M2}` | period (en-streck) |
| `{Antal veckor}` | varaktighet — **familjemarkör**, se §4 |
| `{Risker}` | fylls (riskpunkter) |
| `{Bolagsnamn}`, `{Diarienummer}` | footer |

Den kanoniska phase-detail-sliden klonas en gång per fas vid generering. Item-cap:
aktiviteter 4, leveranser 3, beslut 3.

#### quality-assurance (kvalitetssäkring)

| Token | Roll |
|---|---|
| **`{QA-process}`** | signatur |
| **`{Kvalitetsledare}`** | signatur |
| **`{Eskalering}`** | signatur |
| `{Avstämning 1 — tidpunkt och innehåll}` | fylls (budgeterat fält) |
| `{Avstämning 2}`, `{Avstämning 3}`, `{Avstämning 4}` | fylls (avstämningsplatser, cap 4) |
| `{Bolagsnamn}`, `{Diarienummer}` | footer |

#### team-pricing (team och pris)

| Token | Roll |
|---|---|
| **`{Konsult 1 — namn}`** | signatur |
| **`{Summa timmar}`** | signatur |
| `{Konsult 2–5 — namn}` | fylls (5 radplatser) |
| `{Roll N}`, `{Omfattning N %}`, `{Timpris N}`, `{Timmar N}`, `{Total N}` (N=1–5) | fylls (tabellceller) |
| `{Anbudspris totalt}` | fylls (summarad) |
| `{Bolagsnamn}`, `{Diarienummer}` | footer |

Tabell med 5 konsultradplatser + summarad. Outnyttjade rader fylls med tom sträng.

#### requirement-matrix (kravmatris)

| Token | Roll |
|---|---|
| **`{Ska-krav 1 — formulering enligt upphandlingsunderlag}`** | signatur |
| `{Hur krav 1 uppfylls — konkret beskrivning}` | fylls (rad 1, långform) |
| `{CV/ref 1}` | fylls (rad 1) |
| `{Ska-krav N}`, `{Hur krav N uppfylls}`, `{CV/ref N}` (N=2–6) | fylls (rader 2–6, kortform) |
| `{Bolagsnamn}`, `{Diarienummer}` | footer |

Tabell med 6 kravradplatser. Rad 1 använder långform-tokens; rad 2–6 kortform.

#### reference (referensuppdrag, klonas per referens)

| Token | Roll |
|---|---|
| **`{Referens 1 — kundnamn}`** | signatur (+ **familjemarkör**, se §4) |
| `{Referens 1 — kort kontextrad, t.ex. ”Digitalisering av ärendehantering”}` | fylls (underrubrik, citattecken U+201D) |
| `{Vänster}` | fylls (vänsterkolumn — kund, period, omfattning, kontaktperson) |
| `{Höger}` | fylls (högerkolumn — roll/leverans, resultat) |
| `{Bolagsnamn}`, `{Diarienummer}` | footer |

Den kanoniska referens-sliden klonas en gång per referensuppdrag.

#### confidentiality (sekretess)

| Token | Roll |
|---|---|
| **`{OSL kap X §Y}`** | signatur (§ = U+00A7) |
| `{Slide/Bilaga 1–4}` | fylls (radreferenser) |
| `{Uppgift som omfattas av sekretess}` | fylls (rad 1, unik) |
| `{Värför — skadan som uppstår vid utlämnande}` | fylls (rad 1, em-streck) |
| `{Uppgift som omfattas}` | fylls (rad 2–4, upprepad) |
| `{Motivering}` | fylls (rad 2–4, upprepad) |
| `{Bolagsnamn}`, `{Diarienummer}` | footer |

> Anm: rad 1 har unika tokens; rad 2–4 delar identisk tokentext (`{Uppgift som omfattas}`,
> `{Motivering}`). Applicatorn fyller dem per förekomstordning — behåll en kopia per rad.

#### certifications (certifieringar)

| Token | Roll |
|---|---|
| **`{Certifikatnummer}`** | signatur (förekommer 1×/kort, 4 kort) |
| **`{Giltighetstid}`** | signatur (förekommer 1×/kort, 4 kort) |
| `{Övrig relevant certifiering}` | fylls (kort 4, namn) |
| `{Beskrivning}` | fylls (kort 4, beskrivning — budgeterat fält) |
| `{Bolagsnamn}`, `{Diarienummer}` | footer |

#### toc (innehållsförteckning)

Token-fri innehållssida. Identifieras som `toc` om sidan saknar innehållstokens (endast
footer-tokens räknas inte). Den första token-fria sidan utan bilder blir innehålls­förteckning;
fyller bara footer + sidräknare.

#### static (token-fri bildsida)

Token-fri sida som innehåller bilder (avdelare, collage). Renderas passthrough — bilderna
lämnas orörda, bara footern fylls. Se §3 och §4.

#### Footer-tokens (alla slides utom cover)

| Token | Roll |
|---|---|
| `{Bolagsnamn}` | bolagsnamn i sidfot (och i sekretess-brödtext) |
| `{Diarienummer}` | diarienummer i sidfot |

Sidräknaren (mönstret `NN / 17`) skrivs om automatiskt till aktuell position — du behöver
inte göra något med den.

---

## 2. Teckenbudgetar (hybridmodellen)

AI:n skriver mot en **teckenbudget** per fält: så här många tecken får texten vara innan
korrektorn kortar den. Modellen är hybrid med två lager.

### Lager 1 — redaktionellt tak

Varje budgeterat fält har ett **redaktionellt tak**: en konvention per fält som gäller
*alla* mallar, precis som token-namnen är en konvention. Taket är fältets semantiska
maxlängd (ett fasnamn ryms i ~40 tecken, en period i ~10). **Budgeten kan aldrig överstiga
taket, oavsett hur stor boxen är.**

| Fält | Tak (tecken) | Token i mallen |
|---|---|---|
| Fasnamn | 40 | `{Fas 1 — namn}` |
| Period | 10 | `{M1–M2}` |
| Mål (fasens syfte) | 120 | `{Mål}` |
| Aktivitet (per punkt) | 120 | `{Aktiviteter}` |
| Leverans (per punkt) | 100 | `{Leveranser}` |
| Beslut (per punkt) | 100 | `{Beslut}` |
| Avstämning | 80 | `{Avstämning 1 — tidpunkt och innehåll}` |
| Certifieringsbeskrivning | 80 | `{Beskrivning}` |

Övriga tokens (kundnamn, datum, konsultrader, tabellceller) fylls deterministiskt och har
ingen längdbudget.

### Lager 2 — geometrin kan bara sänka budgeten

Hur boxen är satt avgör om geometrin får klampa taket:

- **Box med "krymp text vid spill" (normAutofit):** PowerPoint krymper texten så att den
  ryms. Då säger boxstorleken inget om hur många tecken som får plats → **taket gäller rakt
  av**.
- **Box utan autofit (texten bryts eller klipps):** geometrin är bindande → budgeten blir
  **min(tak, vad boxen rymmer)**. En trång box sänker alltså budgeten under taket.

Formeln för geometrisk kapacitet använder globala kalibreringskonstanter (snitteckenbredd
≈ 0,5 × fontstorlek, ~90 % nyttjandegrad, radhöjd ur radavstånd, avrundning till närmsta
5). Den är ren mätning — det finns inga per-fält- eller per-mall-trim.

### Praktisk konsekvens för dig som mallförfattare

- **Gör budgeterade boxar rymliga.** En trång box utan autofit sänker budgeten och ger
  kortare AI-text än taket tillåter.
- Vill du att taket ska gälla oavsett boxstorlek — sätt **"krymp text vid spill"**
  (normAutofit) på boxen.
- Budgeten överstiger aldrig taket. Att göra en box jättestor höjer inte budgeten över
  takvärdet ovan.
- Budgeterade boxar **utan** autofit **måste ha explicit geometri** (en position/storlek
  satt på själva formen, inte ärvd från layouten). Saknas geometrin kan budgeten inte
  beräknas och introspektionen varnar (se §7).

---

## 3. Bilder

Bidsmith rör **aldrig** bilder. Tre fall:

1. **Placerade bilder** (du har infogat en bild i mallen): följer med exporten orörda.
2. **Tomma bildplaceholders** (Infoga via *layoutens* bildplatshållare): överlever
   exporten och kan fyllas från bildbanken efteråt.
3. **Token-fria slides med bilder** (avdelare, collage): identifieras som typ `static` och
   renderas som de är — bara footern fylls. Hade de inte fått en egen typ skulle bolagets
   bildavdelare tyst försvinna ur anbudet.

Introspektionen *räknar* bildytor per slide (`imageShapes` i manifestet) så att previewn
kan visa dem, men generatorn ändrar dem aldrig.

> Automatisk bildbank-injektion (att Bidsmith fyller tomma bildplaceholders åt dig) finns
> **inte** ännu — det är en framtida fas. Idag fyller konsulterna bilder manuellt efter
> export.

---

## 4. Illustrativa exempel-slides

Designmallen innehåller förifyllda exempelkopior av klon-mallarna (slides 8–10 är kopior av
phase-detail-sliden 7; slide 15 är en kopia av referens-sliden 14). De finns bara för att
visa hur en ifylld fas/referens ser ut — de ska **inte** renderas. Bidsmith exkluderar dem
automatiskt på två sätt:

1. **Familje-igenkänning.** De ifyllda kopiorna har slot-baserade placeholders som inte
   matchar signaturen, men en diskriminerande token avslöjar familjen:
   - phase-detail-kopior känns igen på **`{Antal veckor}`**,
   - referens-kopior känns igen på mönstret **`{Referens N — kundnamn}`**.
   En sådan sida exkluderas som "duplikat … illustrativ kopia" i stället för att felaktigt
   flaggas som "okända placeholders".
2. **Okända placeholders.** Helt förifyllda kopior som inte ens har familjemarkören hamnar
   som "okända placeholders" och renderas inte.

> **VIKTIGT:** Den kanoniska mall-sliden måste ligga **före** sina illustrativa kopior i
> presentationsordningen. Den första sidan som matchar en signatur vinner och blir mallen;
> efterföljande familjeträffar exkluderas som kopior. Ligger en ifylld kopia först blir den
> av misstag mallen.

Vill du slippa exempel-slides helt: ta bort dem ur din mall. De är bara dokumentation.

---

## 5. Designmall-specifika förhöjningar (no-op på andra mallar)

Designmallen har två geometriska finesser som är **koordinat-gated** — de aktiveras bara
på boxar/former som sitter på designmallens exakta koordinater och gör tyst ingenting på
andra mallar:

- **Timeline-highlight på phase-detail.** På designmallen flyttas en markeringsstapel i den
  nedre tidslinjen så den matchar varje fas. På en främmande mall hittas inte den exakta
  koordinaten → ingen flytt. Din mall får en statisk tidslinje, vilket inte är ett fel.
- **Footer-breddning.** På designmallen breddas footer-textboxen så att bolagsnamn +
  diarienummer ryms på en rad. Gated på footer-formens exakta position → no-op på andra
  mallar.

Du behöver inte göra något särskilt för dessa. De är valbara förhöjningar för den som vill
återskapa designmallens exakta beteende.

---

## 6. Arbetsflöde

1. **Kopiera designmallen.** Utgå från `templates/anbudsmall-v2.pptx`.
2. **Styla om.** Byt färger, fonter, logotyp, bakgrunder och bilder mot ert varumärke.
   Det visuella är fritt — Bidsmith rör bara texten i kända tokens.
3. **Behåll tokens.** Lämna `{Token}`-placeholders intakta (exakt stavning och rätt
   streck-/specialtecken, §1). Det är de som gör mallen ifyllbar.
4. **Verifiera lokalt:**

   ```bash
   npm run template:introspect <din-mall.pptx>
   ```

   CLI:t skriver ett `<din-mall>.manifest.json` bredvid din PPTX och rapporterar till
   terminalen:
   - hur många slides som renderas och hur många som exkluderas (med orsak per slide),
   - beräknade budgetar per fält,
   - bildytor per slide (placerade bilder + tomma placeholders),
   - varningar (t.ex. budgeterad box som saknar geometri).

   Gå igenom rapporten: matchade rätt slides? Stämmer budgetarna? Finns oväntade "okända
   placeholders"? Se §7 om något ser fel ut.
5. *(Kommande i fas 2C:)* Ladda upp mallen via `/installningar` med förhandsvisning och
   **aktivera** den. Aktiveringssteget kommer i en senare fas; idag verifierar du via CLI:t.

---

## 7. Felsökning

| Symptom | Orsak | Åtgärd |
|---|---|---|
| Slide hamnar under "okända placeholders" | Token felstavad, eller fel streck-variant (em-streck `—` vs en-streck `–` vs bindestreck `-`). **Vanligaste felet.** | Kontrollera tokens mot tabellerna i §1, särskilt streck och `§`/citattecken. Kopiera tokensträngen ordagrant. |
| Slide exkluderad som dublett (men du ville ha den) | Två slides matchar samma signatur — bara den första blir mall, resten exkluderas | Ta bort den extra sliden, eller gör dem till olika typer. Kontrollera att den kanoniska mallen ligger *före* sina kopior (§4). |
| Budget lägre än väntat | Trång box utan autofit klampar taket via geometrin (§2) | Förstora boxen, eller sätt "krymp text vid spill" (normAutofit) så taket gäller rakt av. |
| Varning: `{Mål}` (eller annat budgeterat fält) "saknar explicit geometri — budget kan inte beräknas" | Boxen utan autofit ärver position/storlek från layouten i stället för att ha egen geometri | Sätt explicit position och storlek på själva textformen, eller ge boxen "krymp text vid spill" (då behövs ingen geometri). |
| "ingen slide matchade någon känd signatur" (introspektionen stoppar) | Mallen följer inte token-konventionen alls (inga kända tokens hittades) | Utgå från `templates/anbudsmall-v2.pptx` och lägg in `{Token}`-placeholders enligt §1. |
| Slide matchar flera signaturer (introspektionen stoppar med fel) | Sidan har tokens från två olika slide-typer (signaturtabellen ska vara disjunkt) | Dela upp innehållet på två slides, eller ta bort de tokens som hör till fel typ. |
| Bild försvinner ur exporten | (Bör inte hända — Bidsmith rör aldrig bilder.) Om en token-fri bildsida saknas: den klassades som tom statisk slide | Kontrollera att bildsidan faktiskt innehåller en bild (placerad bild eller bildplaceholder) så den blir typ `static` (§3–4). |
