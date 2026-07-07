# Operatörsverifiering: onboarding-wizarden mot riktig kundmall (2026-07-06)

Post-merge-verifieringen av #70, körd av Claude med Stefan som operatör. Kundmall:
"Anbudsmall_Radrum.pptx" — Claude Design-genererad fiktiv kundmall (Rådrum,
verksamhetsutveckling mot offentlig sektor), 12 slides, 16:9 i 150 % storlek,
tokenlös, tabell byggd av textrutor, INGA p:grpSp-grupper.

## Metod
Lokal dev-server mot live-Supabase (migration 012 applicerad). Temporär testanvändare
via admin-API + handbyggd @supabase/ssr-session-cookie (magic-link/PKCE kringgådd) —
mönstret funkar och är återanvändbart för UI-verifiering. Wizarden driven i headless
browser (gstack), API-stegen via cookie-autentiserad curl/PowerShell. Allt städat
efteråt: testanvändare + failat test-anbud raderade, aktiv mall återställd
(anbudsmall-colors v2). Radrum-mallen KVAR som onboardad (id 406190c3…) för omtest.

## Verifierat GRÖNT (hela kedjan t.o.m. complete)
1. **Upload/foreign-detektering:** 200 + `needsOnboarding: true, precount { 12, 221 }`.
2. **Klassificering:** 221 riktiga Sonnet 5-anrop på ~2,5 min; 169 förbekräftade,
   52 pending. I2-fixen verifierad live: toc (25) + static (6) hamnade i pending.
3. **Wizard-UI:** startsida med precount/kostnadsrad, wireframe med verkliga
   positioner, panelredigering (intent-edit persisterad via PATCH, verifierad i DB),
   sammanfattning med pending-varningen ("52 textrutor är ej beslutade…" —
   routine-fix #70 live), complete → onboarded.
4. **Artefakter:** instrumenterad kopia med 169 tokens (kollisionssuffix funkar:
   `{Upphandlande organisation 2}`), profil 12 slides/169 slots all-generic,
   syntetiskt manifest 12 slides (C1-fixen).
5. **PowerPoint COM:** instrumenterade kopian öppnas UTAN reparation, tokens med
   ärvd formatering i mallens design.
6. **Bid-skapande:** POST /api/bids 202 mot onboardad mall — `loadActiveTemplate`
   passerar med syntetiska manifestet (C1 live-bekräftad på skapande-vägen).

## FYND (verifieringens värde)

### F1 — KRITISKT: generering mot riktig onboardad mall TIMEAR UT
`generate-from-profile.ts` gör ETT AI-anrop per bekräftad slot (SLOT_CONCURRENCY=4).
169 slots ≈ 43 batchar × 10–15 s ≈ 8–10 min > watchdogens 7 min (och > Vercels
300 s-tak i prod). Bid → `failed / "Generation timed out"`, sections tomma.
Kedjan bakom: frikostig candidateSlots (by design) → klassificeraren är säker på
väldesignade deckar → bara static/toc trycks ner till pending → 169 bekräftade →
per-slot-generering spricker. **Fixriktning = Stefan-beslut** (se alternativ i
huvudrapporten: batcha per slide / höj concurrency / wizard-UX som sänker antalet
bekräftade / kombination).

### F2 — UX: klassificeraren bekräftar ETIKETT-rutor
Rubrik-/etikettrutor ("Upphandlande organisation" bredvid värdefältet) klassas med
hög konfidens och förbekräftas → genereringen skulle skriva prosa ÄVEN i etiketterna.
En uppmärksam användare skippar dem manuellt (221 st gör det osannolikt). Behöver
label-heuristik i förslags-lagret eller wizard-UX (bulk-skip per typ).

### F3 — polish: wireframe-textetiketter oläsligt små på stora mallar
Radrum är 18288000 EMU bred (150 % av standard); wireframens fontstorlek är fast i
pt→EMU och skalar inte med slideSize → etiketterna i rutorna syns inte. Kosmetiskt.

### F4 — noterat: "under en dollar" stämde inte
221 kandidater ≈ $1–1.5 klassificering (M6-minorn från slutreviewen, nu belagd).
Plus ~169 writingGeneric-anrop i den failade genereringen (~$1–2; betalda trots
timeout — watchdogen stoppar statusen, inte jobbet).

## Kostnad
Totalt ~$2,5–3,5 för hela verifieringen (klassificering + failad generering).

## Nästa steg
F1 kräver riktningsbeslut innan omtest. F2/F3 → backlog. Radrum-mallen ligger kvar
onboardad för omtest efter fix.

---

# TILLÄGG: Radrum-omtest efter F1/F2-fixen (PR #71, samma kväll)

F1/F2 fixades (per-slide-batchning + label-skydd, mergad #71) och omtestet kördes
som ny upload (re-onboarding av onboardad mall är spärrad — v2/v3 av mallen).

## Verifierat GRÖNT i omtestet
- **F2/label-skyddet:** static-klassningar 6 → **67**, förbekräftade 169 → **132** —
  etikettrubrikerna fångas och kräver ställningstagande i stället för att AI-fyllas.
- **F1/per-slide:** genereringen GÅR IGENOM (ingen timeout): 12 slide-anrop i stället
  för 169, status draft med sektioner persisterade. Ett realistiskt wizard-pass
  (22 prisfält skippade via PATCH, som en riktig användare) gav 116/117 sektioner.
- **Schema-nycklar mot live-API:t:** `{Upphandlande organisation}`/åäö/tankstreck
  accepteras av structured outputs (verifierat FÖRE merge, ~$0.01).
- Export-guarden vägrar korrekt partiella anbud; per-slot-nedgraderingen (routinens
  .min(1)-fynd) visade sig omedelbart vara rätt: prisfält utan underlag blev ärliga
  per-slot-fel i stället för helslide-fel.

## NYA FYND (kvarstår — fixriktning behövs)

### F5: väggklocketid 351–352 s > Vercels 300 s-tak
Två körningar à ~5,9 min lokalt (12 slides, SLIDE_CONCURRENCY=3, effort high,
maxTokens 32000). Lokala watchdogen (7 min) klarar det; Vercel Hobby (300 s) hade
dödat jobbet. Kandidater: höj SLIDE_CONCURRENCY, sänk effort/maxTokens för
writingGeneric, eller båda.

### F6: tomma-slot-lotteriet — modellen lämnar slumpvis nycklar tomma
Ett slide-anrop med 20–30 obligatoriska JSON-nycklar lämnar nondeterministiskt
någon/några tomma: körning 1 → 1 tom ({Risk R3}), körning 2 → 9 tomma (andra slots).
Per-slot-nedgraderingen gör det icke-fatalt, men exporten kräver noll fel →
användaren får köra genereringslotteri. Föreslagen fix (mönster-precedens:
evidence-guardens batchade re-citat): efter slide-anropen, samla tomma/saknade
slots och gör ETT batchat re-ask-anrop; först därefter failedSections.

## Status efter omtest
Onboarding-flödet är produktionsverifierat end-to-end t.o.m. generering; export
väntar på F6-fixen. Radrum v3 (id 9bf84030…, prisfält skippade) ligger onboardad
för nästa varv; v1/v2 + test-anbud + testanvändare städade; anbudsmall-colors v2
åter aktiv. Total verifieringskostnad inkl. omtest: ~$8–10.

---

# TILLÄGG 2 (2026-07-07 natt): fixkedjan F5/F6 → helgrönt varv

Fyra PR:er till innan kedjan höll hela vägen (varje steg drivet av betalda
verifieringsvarv — mönstret var att varje fix exponerade nästa API-verklighet):

- **#72 F6:** batchat re-ask för tomma slots (evidence-guard-mönstret) +
  SLIDE_CONCURRENCY 3→6. Varv: 117/117 sektioner ✓ men 345 s väggklocka.
- **#73 F5:** concurrency 6→12. Varv: EN slide (25 slots) fälld av required-schema
  när modellen utelämnade 2 nycklar — 3 betalda retries, 337 s.
- **#74:** optional-nycklar så utelämnade går till re-ask. Varv: **API-gräns
  upptäckt** — structured outputs 400:ar stora optional-scheman ("too many optional
  parameters (25", "Schema is too complex", "Grammar compilation timed out",
  icke-retrybara, ~185 s häng per försök) → 78 slots föll som block.
- **#75:** nyckel-chunkning ≤12 per anrop. Varv: grammatiken 400:ar ÄNDÅ —
  dynamiska property-namn med långa svenska placeholders är problemet, inte antalet.
- **#76 (slutfixen):** FAST schema `{ sections: [{ placeholder, text }] }` —
  konstant grammatik oavsett mall + identiskt output_config över alla anrop →
  prompt-cachen delar prefix mellan slide-anropen. OBS: PR-routinen triggade
  ALDRIG på #76 (40+ min; #70–#75 tog minuter) — ersattes av dokumenterad lokal
  Opus-granskning (Approved), merge noterad transparent i PR:en. **Kolla routinens
  körlogg.**

## SLUTRESULTAT (varv 5, bid 5120ee1d)
- **117/117 sektioner, 0 failade, väggklocka 150 s** (halva Vercel-taket; ner
  från 345 s — ingen retry-bränning + cache-delning).
- Export ✓ (guard släppte igenom), PowerPoint öppnar utan reparation, innehåll
  ur riktiga RetailTech-analysen i Rådrums design.
- **Visuellt belagd residual:** titel-sloten överflödar sin ruta grovt —
  `budgetChars`-residualen (geometri→budget osatt för foreign slots, ingen
  längdstyrning). Prioritet UPP på backloggen: det är nu den synligaste bristen
  i slutprodukten. Även noterat: modellen ekade "ÅÅÅÅ-MM-DD" i Anbudsdag-fältet
  (intent-eko när underlag saknas — innehållskvalitet, stickprovsyta).

API-lärdomar för framtida structured outputs-design (generaliserbara):
1. Dynamiska property-namn skalar inte — grammatiken kompileras per schema och
   klarar inte långa/många/svenska nycklar. Använd fasta scheman med
   nyckel-som-VÄRDE i stället för nyckel-som-PROPERTY.
2. Optional-parameters har ett hårt tak (~24) och "Grammar compilation timed out"
   kan ta ~3 min per försök INNAN 400:n — icke-retrybart men retryas ändå av
   klienten = minuter av död tid. Överväg att inte retrya 400 invalid_request_error.
3. Fasta scheman återställer dessutom cache-delning över anrop (output_config
   ingår i cache-prefixet).

Total verifieringskostnad hela spåret (varv 1–5 + klassificeringar): ~$18–20.
