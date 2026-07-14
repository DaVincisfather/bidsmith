# Budget-kalibreringsloopen — utvärdering mot Radrum v4 (2026-07-14)

> Utfall av utvärderingskörningen i design-doc `2026-07-14-budget-calibration-loop-design.md`.
> Frågan: räcker kalibrerad längdstyrning + promptfixar för att rädda foreign-mall-vägen?
> **Svar: nej, inte än — men spåret konvergerar bevisligen. Vägbeslut: ENV-FLAGGA + iterera.**

## Kalibreringen (Task 9, $0)

Radrum v4 (templateId `25f9d500-911f-4afb-8fc0-a30f8220c477`), efter Supabase-restore
(free-tier-autopaus efter 7 d inaktivitet — återkommande risk, ~5 min boot efter restore):

- 6 render-varv, ett par minuter väggklocka, **137/137 slots mätta** (0 geometri-fallbacks
  — markörmatchningen höll fullt ut), 0 slots vid MAX-taket 1000.
- Vision-gate på konvergensdecket (= varje ruta fylld till maxbudget): 14,8k tecken,
  0 FAIL / 6 WARN. Två pytterutor spiller även vid 30-golvet — bägge kortfält (mitigeras
  av värde-eller-tomt-regeln).
- `--write` persisterad + DB-verifierad: 137 slots med budgetChars, 109 kortfält (≤80),
  budgetsumma 12 640 (teoretiskt tak).

## Utvärderingskörningen (Task 10, ~$1–2)

Stefan om-genererade anbudet från samma RFP-analys (930bc471, 2026-07-07) + Radrum v4
i appen → export `anbud-c993fa7a.pptx`. Baslinje: katastrofdecket `anbud-378c78a5.pptx`.

| Gate | Ribban | Utfall | Baslinje 378c78a5 |
|---|---|---|---|
| FAIL-slides (inspect-pptx) | 0 | **0** (2 WARN) | 8 FAIL |
| Totalvolym | ≤ ~13k tecken | **12 705** | 45 789 |
| Syskondubbletter ≥0,3 (parvis trigram) | låga | **1 par** | **42 par** |
| deck:dupes (0,5/0,7-gate) | exit 0 | exit 0 | exit 0 (!) |
| Kortfält | värden/tomt, ej ursäktsprosa | ✅ (diarienummer TOMT, datum/roller/belopp värden) | ursäktsprosa |
| Råa {tokens} kvar | 0 | 0 | — |

**Gate-lärdom:** deck:dupes-tröskeln 0,5 är för hög för LLM-parafras — katastrofdecket
passerade gaten trots nio "Om oss"-varianter (parafras ≈ 0,3–0,45 trigram-likhet, inte
ordagrann kopia). Den parvisa mätningen vid 0,3 är den ärliga jämföraren. → kalibrera
trösklarna (WARN ~0,35?) mot fler riktiga deck innan gaten får beslutsvikt.

## Stefans dom: UNDERKÄNT ("kan inte skickas till kund efter lätt redigering — men det börjar bli bättre")

Per-slide (Stefans genomgång, 2026-07-14):
- **OK:** 5, 10, 11, 12 (+1 med reservation).
- **Slide 1:** bolagsnamnsboxen för smal — radbryter "Testbolaget"; gott om yta att bredda (mallgeometri).
- **Slide 2:** vita boxen för långt ner + rejält overflow — text hamnar UTANFÖR sliden.
- **Slide 3:** boxarna bör upp; overflow i box 1 och 3.
- **Slide 4:** overflow i vita boxen; årtals-/statboxarna nere till vänster ser konstiga ut.
- **Slide 6:** radbryt i samtliga "vecka"-rutor; ser olika stora ut.
- **Slide 7:** "Karl Svensson (uppdragsansvarig)"-boxen nere till vänster: mycket overflow — bredda.
- **Slide 8:** "usel" — högerspalten brutalt ful räls; mycket overflow.
- **Slide 9:** mycket overflow; boxarna bör flyttas upp (yta finns).
- **Bugg:** klick i textboxar i PowerPoint ändrar font/storlek.

## Rotorsaksklasser (fynden ovan sorterade)

1. **spAutoFit + slidekant (slide 2, 9 — mätblind fläck):** boxen VÄXER med texten, så
   BoundHeight-mätningen ser "ryms" — men den växta boxen sticker ut under slidekanten.
   Loop v2: mät boxens underkant (Top+Height) mot slidehöjden; overflow när box går
   utanför slide. Exakt det fall slutreviewen förutsade.
2. **Enrads-semantik saknas (slide 6 vecka-rutor):** budgeten tillåter radbryt i boxar
   designade för en rad. Loop v2: box med ~en radhöjd ⇒ kapa budget till en rads
   geometriska kapacitet (jfr maxLines-semantiken i compute-budgets för egna mallen).
3. **No-wrap kicker-rader (slide 3/4/7/8/11 topprader):** horisontellt klipp som varken
   BoundHeight eller fontScale ser. Loop v2: mät BoundWidth mot boxbredd för
   enrads-boxar, alt. detektera wrap="none".
4. **Mallgeometri (slide 1 bolagsnamn, "flytta upp boxarna", slide 4 statboxar, slide 8
   högerspalt):** Radrums egen design — VÅR testmall, får fixas i mallen. OBS för riktiga
   kundmallar är boxplacering kundens design; håll isär mall-fixar från loop-fixar.
5. **Font-/autofit-klickbuggen:** mallen bär M365-cloudfonter (Aptos-klass) som Office
   substituerar lokalt (→ Calibri, se minnesanteckning 2026); klick triggar
   autofit-omräkning med substitutfontens mått. Mallnivå-fix: installerade fonter eller
   slopa autofit i mallen.

## Vägbeslut (Stefan 2026-07-14): ENV-FLAGGA + ITERERA

- Foreign-mall-vägen grindas bakom env-flagga före lansering (ingen kund exponeras för
  okänd kvalitet). Ren revert avfärdad — spåret visade 45,8k→12,7k och 42→1 dubblettpar.
- Loop v2-punkterna (klass 1–3 ovan) + mallfixar + gate-kalibrering läggs i ROADMAP.
- Kalibreringsloopen + promptfixarna mergas (denna PR) — de är generella förbättringar
  som även gynnar egna mallen på sikt.

## Nytt spår ur utvärderingen: BID-EDITOR-SLIMNING (Stefan)

Bid-editorn visar nu SAMTLIGA textboxar som redigerbara — för mycket. Önskat läge:
- Visa endast uppdragsspecifika rutor (inte varje liten box/kortfält).
- Standardslides (referenscase, sekretess, kvalitetssäkring) ska varken genereras om
  eller redigeras i bid-editorn.
- Krymp editorn till det som faktiskt genereras ⇒ mindre kod, mindre hassle i UI:t.
Eget spår — brainstormas innan design. Kortfälts-flaggan (≤80) + static-klassningen är
naturliga byggstenar för "visa inte"-heuristiken.

## Processnoter

- Bygget subagent-drivet (plan Task 0–8): per-task-review fångade 6 äkta buggar varav 5
  ur planens egen exempelkod; Fable-slutreview → READY TO MERGE efter 2 fixar.
- Supabase free-tier-pausen tar ner både dev och driftsatt app efter 7 d inaktivitet —
  betald tier eller veckoping krävs före publik lansering.
