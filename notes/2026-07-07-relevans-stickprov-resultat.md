# Relevans-stickprov av källcitat — resultat (2026-07-07)

Stefans manuella granskning av citatens RELEVANS på zero-halluc-körningarna från
2026-07-04 (underlag: verifierade par ur `evals/results/*.md`, RFP + CV). Mekaniken
(`verify-evidence.ts`) garanterar att citaten FINNS ordagrant i källan — detta
stickprov mäter residualen: stödjer citatet faktiskt påståendet?

## Utfall

**143/143 bedömda — Relevant: 111 (78 %) · Tveksam: 15 (10 %) · Ej stöd: 17 (12 %)**

~22 % av claims har alltså täckningsproblem trots grön mekanisk verifiering.
Förtriagens träffsäkerhet: 19 flaggade, 18 bekräftade av Stefan (1 friad) — hög
precision, men Stefan hittade fler därutöver (förtriagen fångar inte allt).

## Mönsteranalys (rotorsaker, i fallande frekvens)

### M1 — Sammansatta claims, fragmentcitat (dominerande, ~20 av 32)
Extraktionen SLÅR IHOP flera källkrav till ett claim, men citatet (ett spann)
täcker bara en del. Typexempel: "minst 200 timmar **och inom tre år**" där citatet
bara har timkravet; "kränkande särbehandling **och sexuella trakasserier**";
"PDF-format **och namngivning**"; "ISO **eller eget system**". Stefans
återkommande kommentar: *"håll dig till källan, don't infer mer än nödvändigt"*.
Delmönster:
- **M1a — kolon-trunkering:** citatet slutar med "…minst innehållande följande:"
  och listan som faktiskt bär claimet klipps bort. Claimet är ofta SANT mot
  källan — det är citatgränsen som är fel. Mekaniskt detekterbar (citat som
  slutar på kolon/"följande:").
- **M1b — flerspanns-krav:** claimets delar finns i källan men på olika ställen;
  schemat bär ETT citat → antingen ska claimet delas i atomära claims eller
  citatet täcka alla led.

### M2 — Ren inferens/hallucination (farligast, ~4 fall)
Innehåll i claimet som inte finns i citatet och sannolikt inte i källan:
**Riskguardian rating 'A'** (starkaste avvikelsen), treårsvillkor "från
ingenstans" (Chalmers referensuppdrag), "mervärden" i CV-kravet, PEPPOL BIS
Billing 3-specificering ("kan säkert stämma, men är det säkert i detta fall?").
Detta är den kategori zero-halluc-spåret finns till för — den överlever i dag
för att citatet i sig är ordagrant.

### M3 — CV-referensernas roll-etiketter saknar nyansering (~5 fall)
Referensernas roll/etikett generaliseras eller omtitulieras i stället för att
härledas ur källans formulering: "Ansvarig analytiker" för en genomlysning
("mer managementkonsultigt uppdrag"), "Lead konsult" utan
molnmigrations-kontexten, "Digitaliseringsstrateg" utan journalsystem-projektet.
Stefan: *"Överlag på referenserna saknas nyansering."* Etiketten ska förankras
i källans egna ord + uppdragskontext.

### M4 — Tolkningsfel (1 fall, värt att bevaka)
Eskilstuna genomlysning: källan säger att *processen* ska genomlysas **med
lokalförsörjningsprocessen som utgångspunkt** — extraktionen läste det som att
lokalförsörjningsprocessen är objektet. Semantisk feltolkning, inte täckning.

## Fixriktning (backloggad i ROADMAP, Stefans prioritering)
1. **Extraktionsprompten:** atomära claims (ett källkrav per claim, slå inte
   ihop); citatet MÅSTE täcka claimets samtliga led; citat som introducerar en
   lista ska inkludera listpunkterna; specificera aldrig utöver källan (inga
   standarder/villkor/kategorier som inte står i citatet).
2. **Mekanisk assist (billig):** flagga citat som slutar på kolon/"följande"
   i verify-evidence eller förtriagen — M1a är lexikalt detekterbar.
3. **CV-referenser:** roll-etikett ska härledas ur källans formulering och bära
   uppdragskontexten (M3).
4. **Om-mätning:** kör om stickprovet på ett mindre sample efter fixen —
   målnivå att sätta då (dagens baslinje: 78 % relevant).

Fallen nedan är färdiga testfixturer för fixarbetet.

---

## Bilaga: Stefans fullständiga granskningsexport

Bedömda: 143/143 — Relevant: 111 · Tveksam: 15 · Ej stöd: 17

### Tveksamma (15)
- **[rfp/chalmers-healthtech] Kvalitetssäkring: Anbudsgivaren ska tillämpa rutiner för ständiga förbättringar inklusive kvalitetspolicy och kvalitetsmanual**
  - citat: `Anbudsgivaren ska tillämpa rutiner som säkerställer att företaget arbetar med ständiga förbättringar för att uppfylla kundkrav och lagkrav enligt minst nedanstående punkter`
  - förtriage: citatet nämner varken kvalitetspolicy eller kvalitetsmanual — de kan finnas i punktlistan citatet refererar till, men täcks inte av citatet självt
  - anteckning: Källcitatet måste baseras inklusive de nedanstående punkterna, påståeendet riskerar hamna snett.
- **[rfp/chalmers-healthtech] Mervärde - akademisk bakgrund: Disputerad inom biomedicin eller bioteknik**
  - citat: `Disputerad inom biomedicin eller bioteknik`
- **[rfp/eskilstuna-lokalforsorjning] Miljöledning: Anbudsgivaren ska arbeta systematiskt med miljö och kunna styrka detta med certifikat eller beskrivning av miljöarbete inklusive miljöpolicy samt mål och handlingsplaner.**
  - citat: `Anbudsgivaren ska arbeta systematiskt med miljö.`
  - förtriage: styrkandet (certifikat/beskrivning, policy, mål, handlingsplaner) täcks inte av citatet
  - anteckning: Igen, följ källan här. Det är kunden som bestämmer vad som krävs.
- **[rfp/eskilstuna-lokalforsorjning] Kvalitetsledning: Anbudsgivaren ska arbeta systematiskt med kvalitet och kunna styrka detta med certifikat eller beskrivning inklusive kvalitetspolicy samt mål och handlingsplaner.**
  - citat: `Anbudsgivaren ska arbeta systematiskt med kvalitet.`
  - förtriage: samma mönster som miljöledning — styrkandet täcks inte av citatet
  - anteckning: Igen, följ källan här. Det är kunden som bestämmer vad som krävs.
- **[rfp/orebro-utredning] Leverabel - Utbildning: Utbildningsinsatser ska minst innehålla förslag på förebyggande åtgärder samt information om styrande lagar, författningar, förordningar och föreskrifter inom området samt offentlighet och sekretess.**
  - citat: `Minst innehållande: Förslag på förebyggandeåtgärder/insatser, Styrande lagar, Författningar, Förordningar och Föreskrifter inom området, offentlighet och sekretess.`
- **[rfp/sormland-verksamhetsstod] Miljöledning: Leverantören ska redovisa rutiner för ett systematiskt miljöarbete vid genomförandet av uppdraget**
  - citat: `Leverantören ska redovisa rutiner för ett systematiskt miljöarbete vid genomförandet av uppdraget som minst innehåller följande:`
- **[rfp/sormland-verksamhetsstod] Erfarenhet delområde 3: Leverantören ska ha dokumenterad erfarenhet av uppdrag som avser stöd för ansökningar om externa medel och/eller kvalificerat skrivstöd**
  - citat: `ha dokumenterad erfarenhet av uppdrag som avser stöd för ansökningar om externa medel och/eller kvalificerat skrivstöd inom regional utveckling,`
- **[rfp/sormland-verksamhetsstod] Konsulters språkkunskaper: Konsulterna ska ha mycket god förmåga att uttrycka sig på svenska i tal och skrift**
  - citat: `Konsulterna ska ha mycket god förmåga att uttrycka sig på svenska i tal och skrift samt god förmåga att kommunicera på engelska i tal och skrift när uppdraget kräver det.`
- **[rfp/sormland-verksamhetsstod] Elektronisk fakturering: Leverantören ska senast vid avtalsstart kunna sända elektronisk faktura enligt PEPPOL BIS Billing 3 eller annat överenskommet format**
  - citat: `Leverantören ska senast vid avtalsstart kunna sända elektronisk faktura (E-faktura) enligt följande:`
  - anteckning: Peppol kan säkert stämma, men är det säkert i detta fall? Vissa friheter i formulering här
- **[rfp/sormland-verksamhetsstod] Leverabel: Uppdraget ska leverera kunskaps- och beslutsunderlag, planerings- och genomförandeunderlag samt samverkans- och utvecklingsprocesser**
  - citat: `Uppdragen kan exempelvis avse framtagande av kunskaps- och beslutsunderlag, planerings- och genomförandeunderlag, samverkans- och utvecklingsprocesser, process- och verksamhetsutveckling, kompetensutvecklingsinsatser samt, där det är relevant, administrativt stöd kopplat till dessa uppdrag`
  - anteckning: Saknar process och verksamhetsutveckling och kompetensutveckling och adm stöd
- **[rfp/sormland-verksamhetsstod] Leverabel delområde 3: Uppdraget kan omfatta utbildningssatsningar och kompetenshöjande insatser inom ansökningsskrivning**
  - citat: `Det omfattar också utbildningssatsningar och kompetenshöjande insatser, inklusive utbildning i att skriva ansökningar om externa medel, för personal inom delområdet`
  - anteckning: saknar nyanseringen om externa medel
- **[cv/anna_svensson] referens: Lead konsult**
  - citat: `Anna anlitades som lead konsult i ett av stadens största digitaliseringsinitiativ, en molnmigration som omfattade tolv olika förvaltningar.`
  - anteckning: Överlag på referenserna saknas nyansering. Referensen här bör vara Lead konsult inom en stor molnmigration
- **[cv/anna_svensson] referens: Digitaliseringsstrateg**
  - citat: `Som digitaliseringsstrateg hos Region Skåne arbetade Anna med ett omfattande journalsystem-projekt inom ramen för regionens digitala transformation.`
  - anteckning: Överlag på referenserna saknas nyansering. Referensen här bör vara Digitaliseringsstrateg för ett omfattande journalsystem-projekt inom regionen.
- **[cv/david_lindqvist] kompetens: Internhyresmodeller**
  - citat: `Internhyresmodeller för fastighetsförvaltning i kommunal och regional regi`
  - anteckning: Överlag på referenserna saknas nyansering. Referensen här bör vara Inhyrningsmodeller inom fastighetsförvaltning i kommunal/regional regi.
- **[cv/gunilla_ekstrom] referens: Utredare**
  - citat: `Under tre år genomförde Gunilla en omfattande arbetsmiljökartläggning av en av regionens förvaltningar.`
  - anteckning: Arbetsmiljökartläggning av regionens förvaltningar. Åter igen, referenserna är lite felriktade.

### Ej stöd (17)
- **[rfp/chalmers-healthtech] Referensuppdrag: Ett referensuppdrag ska presenteras som omfattat minst 200 timmar och genomförts inom de senaste tre åren**
  - citat: `omfattat minst 200 timmar`
  - förtriage: treårsvillkoret finns inte i citatet — bara timkravet är belagt
  - anteckning: Treårscitatet kommer från ingenstans.
- **[rfp/chalmers-healthtech] CV/Meritförteckning: CV ska bifogas och tydligt visa att obligatoriska krav uppfylls samt i vilken omfattning mervärden uppfylls**
  - citat: `CV/Meritförteckning ska bifogas för erbjuden konsult.`
  - förtriage: citatet täcker bara att CV ska bifogas — inte kravet att det ska visa obligatoriska krav och mervärden
  - anteckning: Mervärden kommer från ingenstans, källan anger bara att säkerställa att cv ska bifogas.
- **[rfp/eskilstuna-lokalforsorjning] Ekonomisk status: Anbudsgivaren ska ha lägst rating 'A' hos Riskguardian samt sakna oreglerade skatteskulder, vara momsregistrerad och F-skatteregistrerad.**
  - citat: `Anbudsgivaren ska:    · Inte ha oreglerade skatteskulder eller socialförsäkringsavgifter    · Vara registrerad för moms (undantaget skattefria verksamheter)   · Vara registrerad för F-skatt`
  - förtriage: rating 'A' hos Riskguardian finns inte i citatet — starkaste avvikelsen i hela underlaget
  - anteckning: Håller med om triaget, här är källan mycket tydlig. Följ källan
- **[rfp/eskilstuna-lokalforsorjning] Sanktioner: Leverantören får inte tillhöra någon av de personkategorier som omfattas av sanktioner mot Ryssland och Belarus.**
  - citat: `Leverantören intygar att leverantören inte omfattas av någon av de personkategorier som anges ovan.`
  - förtriage: citatet är självrefererande ('som anges ovan') — Ryssland/Belarus syns inte i citatet
  - anteckning: Triagen säger det mesta
- **[rfp/eskilstuna-lokalforsorjning] Kompetens och erfarenhet: Konsulten ska ha relevant examen/utbildning, dokumenterad erfarenhet av att leda workshops och driva förändringsarbete, samt behärska svenska flytande i tal och skrift.**
  - citat: `Konsulten ska ha:  För uppdraget relevant examen eller utbildning (t.ex ekonomi, fastighet, offentlig förvaltning eller motsvarande)`
  - förtriage: workshops, förändringsarbete och svenskkravet täcks inte av citatet — bara examensdelen
  - anteckning: straight upp fel
- **[rfp/eskilstuna-lokalforsorjning] Uppdragsstart: Vid uppdragsstart ska anbudsgivaren presentera projektorganisation, redovisa metod, arbetssätt och tidplan, säkerställa åtkomst till information samt fastställa kommunikation med köparen.**
  - citat: `Anbudsgivaren ska presentera sin projektorganisation, redovisa metod, arbetssätt och tidplan.`
  - förtriage: informationsåtkomst och kommunikation med köparen täcks inte av citatet
  - anteckning: förtraige stämmer
- **[rfp/eskilstuna-lokalforsorjning] Leverans - genomlysning: Genomlysning av lokalförsörjningsprocessen ska omfatta kartläggning av roller, ansvar, mandat, lokalbankens funktion, beslutsunderlag, styrning och jämförelser med god praxis.**
  - citat: `Genomlysning av processen inklusive roller, ansvar, mandat och befogenheter, med den beslutade lokalförsörjningsprocessen som utgångspunkt.`
  - förtriage: lokalbanken, beslutsunderlag, styrning och god praxis-jämförelser täcks inte av citatet
  - anteckning: Fel, samt fel tolkning av process. Här ska "processen" genomlysas, med lokalförsöljningsprocessen som utgångspunkt.
- **[rfp/eskilstuna-lokalforsorjning] Leverans - hyresmodell: Ny hyresmodell ska tas fram som är enkel, förutsägbar, administrativt enkel och kostnadseffektiv samt innehåller principer för investeringshantering.**
  - citat: `Anbudsgivaren ska ta fram förslag på en ny modell som skapar bra planeringsförutsättningar och som bidrar till ett effektivt lokalutnyttjande.`
  - förtriage: egenskaperna (enkel, förutsägbar, kostnadseffektiv, investeringsprinciper) finns inte i citatet
  - anteckning: Samma i alla, håll dig till källan bara, dont infer mer än nödvändigt
- **[rfp/orebro-utredning] Referenser: Anbudsgivaren ska inkomma med två referenser för kränkande särbehandling och två referenser avseende sexuella trakasserier/trakasserier, utförda under de tre senaste åren.**
  - citat: `två (2) referenser för kränkande särbehandling`
  - förtriage: referenserna för sexuella trakasserier och treårsvillkoret täcks inte av citatet
  - anteckning: Samma i alla, håll dig till källan bara, dont infer mer än nödvändigt
- **[rfp/orebro-utredning] Kvalitetsledningssystem: Anbudsgivaren ska tillämpa ett skriftligt kvalitetsledningssystem, antingen genom ISO-certifiering eller eget dokumenterat system.**
  - citat: `Anbudsgivaren ska tillämpa ett skriftligt kvalitetsledningssystem.`
  - förtriage: ISO-alternativet ('antingen ISO eller eget system') täcks inte av citatet
  - anteckning: Samma i alla, håll dig till källan bara, dont infer mer än nödvändigt
- **[rfp/orebro-utredning] Miljöledning: Anbudsgivaren ska ha ett system för att arbeta systematiskt med miljöfrågor, exempelvis enligt ISO 14001 eller eget dokumenterat system.**
  - citat: `Anbudsgivaren ska ha ett system för att arbeta systematiskt med miljöfrågor.`
  - förtriage: exemplen (ISO 14001/eget system) täcks inte av citatet — mild, formulerat som 'exempelvis'
  - anteckning: Samma i alla, håll dig till källan bara, dont infer mer än nödvändigt
- **[rfp/orebro-utredning] Konsultkompetens: Offererade konsulter ska ha relevant akademisk utbildning och minst 5 års arbetslivserfarenhet inom HR, organisationsutveckling eller psykologi/beteendevetenskap, samt ha genomfört minst 3 utredningar av kränkande särbehandling.**
  - citat: `Offererade konsulter ska ha relevant akademisk utbildning (med relevant akademisk utbildning avses utbildning inom psykologi, beteendevetenskap, personal- och arbetslivsfrågor eller motsvarande) och minst 5 års arbetslivserfarenhet`
  - förtriage: kravet på minst 3 genomförda utredningar täcks inte av citatet
  - anteckning: Samma i alla, håll dig till källan bara, dont infer mer än nödvändigt
- **[rfp/orebro-utredning] Arbetsprov: Anbudsgivaren ska bifoga tre anonymiserade rapporter gällande utredningar samt en förbedömning, utförda av offererade konsulter under de senaste tre åren.**
  - citat: `Anbudsgivaren skall bifoga tre anonymiserade rapporter gällande utredningar`
  - förtriage: förbedömningen och treårsvillkoret täcks inte av citatet
  - anteckning: Samma i alla, håll dig till källan bara, dont infer mer än nödvändigt. Tror inte detta är specifikt kopplat till konsulterna?
- **[rfp/orebro-utredning] Leverabel - Anbudspresentation: Anbudsgivaren ska genomföra en presentation på max 90 minuter med kontaktpersoner och presumtiva konsulter.**
  - citat: `Presentation får ta max 90 minuter.`
  - förtriage: deltagarna (kontaktpersoner, presumtiva konsulter) täcks inte av citatet
  - anteckning: Samma i alla, håll dig till källan bara, dont infer mer än nödvändigt
- **[rfp/sormland-verksamhetsstod] Erfarenhet delområde 2: Leverantören ska ha dokumenterad erfarenhet av uppdrag som avser projektledning samt processledning, processtöd och metod- och processutveckling**
  - citat: `ha dokumenterad erfarenhet av uppdrag som avser projektledning samt därutöver erfarenhet av ett eller flera av följande: processledning, processtöd och metod- och processutveckling,`
- **[rfp/sormland-verksamhetsstod] Utvärderingsbilagor format: Bilagor ska lämnas i PDF-format och namnges enligt angiven bilagebeteckning**
  - citat: `Bilagor ska lämnas i PDF-format.`
  - förtriage: namngivningskravet täcks inte av citatet
  - anteckning: Samma i alla, håll dig till källan bara, dont infer mer än nödvändigt
- **[cv/david_lindqvist] referens: Ansvarig analytiker**
  - citat: `David ledde en omfattande genomlysning av fastighetsförvaltningens processer i Vänersta kommun.`
  - anteckning: Genomlysning är inte analytiker. Det är mer managementkonsultigt uppdrag. Processkartläggning/utveckling

### Förtriage-flaggade som friats (1 av 19)
- [cv/elin_marklund] kompetens: Life science och healthtech
