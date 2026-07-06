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
