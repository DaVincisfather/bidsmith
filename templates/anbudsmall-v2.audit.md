# anbudsmall-v2 — placeholder audit

Generated 2026-04-19 from `data/design mockups/Anbudsmall-v2.pptx`.
Used by `src/lib/pptx-template/applicators/*` to know what placeholders exist on each source slide.

> **Convention:** `{...}` = placeholder (applicator replaces at runtime). ALL-CAPS = static label (never replaced). Footer pattern `{Bolagsnamn} | {Diarienummer}` appears on slides 2–17 and is replaced globally. Slide counter `NN / 17` appears on slides 2–17 and must be replaced per slide at runtime.

---

## Deviation from plan

The plan assumed slide 1 contained `{Anbud}` and `{Datum}`. Actual XML shows:
- `{Anbud}` does **not** exist — the title field is `{Upphandlingens namn}`
- `{Datum}` does **not** exist — it is `{Anbudsdatum}` (appears twice: once standalone top-right, once in the ANBUDSDATUM label row)
- Plan also assumed `{Bolagsnamn}` was used only in footer — on slide 1 it appears as `ANBUDSGIVARE / {Bolagsnamn}` (no footer row on cover)

Slides 8, 9, 10 are **not** truly empty illustrative copies — they contain full unique placeholder text (Fas 2, Fas 3, Fas 4 variants). Slide 15 (Referens 02) similarly has full placeholders. See per-slide notes.

---

## Slide 1 — Cover

- **Type:** cover (single instance)
- **Placeholders:**
  - `{Bolagsnamn}` — applicator: `master.companyName` (appears in ANBUDSGIVARE row)
  - `{Anbudsdatum}` — applicator: `master.bidDate` (appears TWICE: standalone top-right area AND in ANBUDSDATUM label row — replace both)
  - `{Kundnamn}` — applicator: `master.clientName`
  - `{Upphandlingens namn}` — applicator: `master.bidName` (main title of the tender)
  - `{Diarienummer}` — applicator: `master.diaryNumber`
- **Static labels (no replacement):** `ANBUD`, `TILL`, `DIARIENUMMER`, `ANBUDSDATUM`, `ANBUDSGIVARE`
- **Footer:** No standard footer row on cover — `{Bolagsnamn}` and `{Diarienummer}` appear inline in the body, not as footer.
- **WARNING:** `{Anbudsdatum}` must be replaced in two separate text frames. Applicator must replace all occurrences, not just first.

---

## Slide 2 — TOC (Innehållsförteckning)

- **Type:** toc (STATIC — all 17 entries are hard-coded in the template; rows are NOT cloned)
- **Placeholders:** None — all TOC entry text is static in the mockup.
- **Static content (17 entries, two-column layout):**
  - `01 Försättssida`, `02 Innehåll`, `03 Vår förståelse — Kunden idag`, `04 Vår förståelse — Uppdraget`, `05 Vår förståelse — Utmaningar och värde`, `06 Genomförande — översikt`, `07 Fas 1 — detalj`, `08 Fas 2 — detalj`, `09 Fas 3 — detalj`
  - `10 Fas 4 — detalj`, `11 Kvalitetssäkring`, `12 Team, omfattning och pris`, `13 Uppfyllelse av ska-krav`, `14 Referensuppdrag 1`, `15 Referensuppdrag 2`, `16 Anbudssekretess`, `17 Certifieringar`
- **Static section label:** `02 · INNEHÅLL`, `Innehållsförteckning`
- **Footer (replace):** `{Bolagsnamn}`, `{Diarienummer}`, slide counter `02 / 17`
- **Note for applicator:** Since TOC entries are static, no row-cloning needed. The applicator only needs to replace the footer placeholders.

---

## Slide 3 — Kunden idag

- **Type:** prose (two sections: A ORGANISATION OCH SYSTEM + B SMÄRTPUNKTER)
- **Placeholders — Section A (Organisation och system):**
  - `{Kundens nuläge — organisation: förvaltningar, antal anställda, geografi}` — applicator: `section.organisation`
  - `{Kundens nuläge — system: nuvarande verksamhetssystem, integrationer, leverantörer}` — applicator: `section.system`
  - `{Kundens nuläge — processer: arbetssätt, styrning, beslutsvägar}` — applicator: `section.processer`
- **Placeholders — Section B (Smärtpunkter):**
  - `{Smärtpunkt 1 — vad som inte fungerar idag och hur det påverkar verksamheten}` — applicator: `section.smärtpunkter[0]`
  - `{Smärtpunkt 2}` — applicator: `section.smärtpunkter[1]`
  - `{Smärtpunkt 3}` — applicator: `section.smärtpunkter[2]`
  - `{Smärtpunkt 4}` — applicator: `section.smärtpunkter[3]`
- **Slot cap:** 4 smärtpunkter. If data has fewer, applicator removes unused rows.
- **Static labels:** `03 · VÅR FÖRSTÅELSE AV UPPDRAGET`, `Kunden idag`, `A`, `ORGANISATION OCH SYSTEM`, `Organisation`, `System`, `Processer`, `B`, `SMÄRTPUNKTER`
- **Footer (replace):** `{Bolagsnamn}`, `{Diarienummer}`, `03 / 17`

---

## Slide 4 — Uppdragsbeskrivning

- **Type:** prose (3 free-text paragraphs)
- **Placeholders:**
  - `{Uppdraget parafraserat med våra ord — stycke 1. Visa att vi har läst kravspecifikationen noggrant genom att beskriva syftet, målet och huvudsakliga leveranser med egna ord.}` — applicator: `section.stycke[0]`
  - `{Uppdraget parafraserat med våra ord — stycke 2. Beskriv omfattning, avgränsningar och förväntat utfall så att upphandlaren ser att vi har förstått uppdraget korrekt.}` — applicator: `section.stycke[1]`
  - `{Uppdraget parafraserat med våra ord — stycke 3. Tydliggör vilka intressenter som berörs och hur uppdraget knyter an till kundens övergripande mål.}` — applicator: `section.stycke[2]`
- **Slot cap:** 3 paragraphs (fixed layout — applicator fills all three).
- **Static labels:** `04 · VÅR FÖRSTÅELSE AV UPPDRAGET`, `Uppdragsbeskrivning`, `Uppdraget parafraserat — så läser vi RFP:n`
- **Footer (replace):** `{Bolagsnamn}`, `{Diarienummer}`, `04 / 17`

---

## Slide 5 — Utmaningar och värde

- **Type:** prose (two sections: A IDENTIFIERADE UTMANINGAR + B VÄRDE UTÖVER SKA-KRAVEN)
- **Placeholders — Section A (Utmaningar):**
  - `{Utmaning 1 — en konkret utmaning vi ser i uppdraget och varför den är viktig att hantera}` — applicator: `section.utmaningar[0]`
  - `{Utmaning 2}` — applicator: `section.utmaningar[1]`
  - `{Utmaning 3}` — applicator: `section.utmaningar[2]`
  - `{Utmaning 4}` — applicator: `section.utmaningar[3]`
- **Placeholders — Section B (Värde):**
  - `{Värde 1 — mervärde vi kan synliggöra som går utöver ska-kraven, konkret och mätbart}` — applicator: `section.värden[0]`
  - `{Värde 2}` — applicator: `section.värden[1]`
  - `{Värde 3}` — applicator: `section.värden[2]`
  - `{Värde 4}` — applicator: `section.värden[3]`
- **Slot caps:** 4 utmaningar, 4 värden. Applicator removes unused rows if data has fewer.
- **Static labels:** `05 · VÅR FÖRSTÅELSE AV UPPDRAGET`, `Vad vi ser`, `A`, `IDENTIFIERADE UTMANINGAR`, `B`, `VÄRDE UTÖVER SKA-KRAVEN`
- **Footer (replace):** `{Bolagsnamn}`, `{Diarienummer}`, `05 / 17`

---

## Slide 6 — Genomförande översikt

- **Type:** phases-overview (4 phase cards + Gantt timeline, single instance)
- **Placeholders — Phase cards (×4):**
  - `{Fas 1 — namn}`, `{Fas 1 — kort beskrivning. Detaljer på nästa slide.}` — applicator: `phases[0].name`, `phases[0].shortDescription`
  - `{Fas 2 — namn}`, `{Fas 2 — beskrivning}` — applicator: `phases[1].name`, `phases[1].shortDescription`
  - `{Fas 3 — namn}`, `{Fas 3 — beskrivning}` — applicator: `phases[2].name`, `phases[2].shortDescription`
  - `{Fas 4 — namn}`, `{Fas 4 — beskrivning}` — applicator: `phases[3].name`, `phases[3].shortDescription`
- **Placeholders — Gantt rows (×4, each phase repeated):**
  - `{Fas 1 — namn}`, `{M1–M2}`, `{Fas 1}` — applicator: `phases[0].name`, `phases[0].ganttSpan`, `phases[0].ganttLabel`
  - `{Fas 2 — namn}`, `{M2–M5}`, `{Fas 2}` — applicator: `phases[1].name`, `phases[1].ganttSpan`, `phases[1].ganttLabel`
  - `{Fas 3 — namn}`, `{M5–M9}`, `{Fas 3}` — applicator: `phases[2].name`, `phases[2].ganttSpan`, `phases[2].ganttLabel`
  - `{Fas 4 — namn}`, `{M9–M12}`, `{Fas 4}` — applicator: `phases[3].name`, `phases[3].ganttSpan`, `phases[3].ganttLabel`
- **Note:** `{Fas N — namn}` appears TWICE per phase (once in card, once in Gantt row). The Gantt span placeholders (`{M1–M2}`, `{M2–M5}`, etc.) are literal text nodes — replace them with actual month-range strings from data.
- **Note:** `{Fas 1}`, `{Fas 2}`, `{Fas 3}`, `{Fas 4}` in Gantt are short labels (not the full phase name). Likely phase index label; applicator can keep as-is or set to abbreviated name.
- **Static labels:** `06 · GENOMFÖRANDE`, `Genomförande — översikt`, `FAS 1`, `FAS 2`, `FAS 3`, `FAS 4`, `FAS`, `M1` through `M12`
- **Footer (replace):** `{Bolagsnamn}`, `{Diarienummer}`, `06 / 17`

---

## Slide 7 — Phase detail (CLONE TEMPLATE — Fas 1)

- **Type:** phase-detail (CLONE — this slide is the master template; applicator clones it for Fas 2, 3, 4)
- **WARNING — non-placeholder dynamic text (applicator MUST update after each clone):**
  - Slide tab label: `07 · GENOMFÖRANDE — FAS 1 AV 4` — the `1` and `4` must be updated to the cloned phase number and total. This is NOT `{...}` style — it is literal text. Applicator must do a string replacement: `FAS 1 AV 4` → `FAS N AV M`.
  - Phase number badge: `01` — literal two-digit ordinal. Applicator must replace `01` → `02`, `03`, `04` for each clone.
  - Section label: `FAS 1` — literal. Applicator must replace → `FAS 2`, etc.
  - Timeline label: `TIDSLINJE · FAS 1` — literal. Must replace `FAS 1` → `FAS N`.
- **Placeholders (as written in slide 7 — all literal after clone, applicator replaces with per-phase data):**
  - `{Fas 1 — namn}` — applicator: `phase.name`
  - `{M1–M2}` — applicator: `phase.startMonth` (part of compound `{M1–M2} · {Antal veckor}`)
  - `{Antal veckor}` — applicator: `phase.durationWeeks`
- **Placeholders — Aktiviteter (slot cap: 4):**
  - `{Aktivitet 1 — vad som görs, av vem, hur}` — applicator: `phase.activities[0]`
  - `{Aktivitet 2}` — applicator: `phase.activities[1]`
  - `{Aktivitet 3}` — applicator: `phase.activities[2]`
  - `{Aktivitet 4}` — applicator: `phase.activities[3]`
  - If data has fewer than 4 activities, applicator hides/removes excess rows.
- **Placeholders — Leveranser (slot cap: 3):**
  - `{Leverans 1 — konkret artefakt, format, mottagare}` — applicator: `phase.deliverables[0]`
  - `{Leverans 2}` — applicator: `phase.deliverables[1]`
  - `{Leverans 3}` — applicator: `phase.deliverables[2]`
  - If data has fewer than 3 deliverables, applicator hides/removes excess rows.
- **Placeholders — Beslut (slot cap: 3):**
  - `{Beslut 1 — vad styrgruppen ska ta ställning till vid faslut}` — applicator: `phase.decisions[0]`
  - `{Beslut 2}` — applicator: `phase.decisions[1]`
  - `{Go/no-go till nästa fas}` — applicator: `phase.decisions[2]` (note: this is written as a placeholder-style string but has no `{}` — it IS static guidance text; final phase may read "Godkännande av slutleverans". Treat as replaceable.)
- **Placeholder — Mål (upper-right goal box, single sentence):**
  - `{Mål}` — applicator: `phase.objective` (one-sentence summary of phase goal; complement to AKTIVITETER, not replacement).
- **Placeholder — Risker (free-form risk list):**
  - `{Risker}` — applicator: `phase.risks` joined with newlines, each row prefixed with red `⚠ ` (U+26A0 + U+FE0E text variation selector). Empty string when phase has no risks. Icon color is post-applied via run split — see `colorRiskIcons()` in `phase-detail.ts`.
- **Static labels:** `A`, `AKTIVITETER`, `B`, `LEVERANSER`, `C`, `BESLUT I STYRGRUPP`, `M1`–`M12`
- **Footer (replace per clone):** `{Bolagsnamn}`, `{Diarienummer}`, `07 / 17` (update counter to `08 / 17`, etc.)
- **Cloning plan:** Source = slide 7. Applicator clones 3 times (for Fas 2, 3, 4) and inserts as slides 8, 9, 10. The illustrative copies already in the mockup at positions 8–10 are either removed before rendering or overwritten.

---

## Slides 8, 9, 10 — Phase detail illustrative copies (Fas 2, 3, 4)

- **Type:** phase-detail (ILLUSTRATIVE — these are pre-filled copies of slide 7 in the mockup for visual reference only)
- **IMPORTANT:** These slides will NOT be rendered from the mockup directly. The applicator clones slide 7 for each additional phase and inserts at these positions. Slides 8, 9, 10 from the mockup are discarded/skipped.
- **For the record — slide 8 (Fas 2) contains:** Same structure as slide 7 but with `{Fas 2 — namn}`, `{M2–M5} · {Antal veckor}`, `{Aktivitet 1}`–`{Aktivitet 4}`, `{Leverans 1}`–`{Leverans 3}`, `{Beslut 1}`, `{Beslut 2}`, `{Go/no-go till nästa fas}`, header `08 · GENOMFÖRANDE — FAS 2 AV 4`, badge `02`
- **For the record — slide 9 (Fas 3):** Same structure, `{Fas 3 — namn}`, `{M5–M9}`, header `09 · GENOMFÖRANDE — FAS 3 AV 4`, badge `03`
- **For the record — slide 10 (Fas 4):** Same structure, `{Fas 4 — namn}`, `{M9–M12}`, header `10 · GENOMFÖRANDE — FAS 4 AV 4`, badge `04`. Deliverables and decisions have more descriptive text: `{Leverans 1 — slutleverans}`, `{Leverans 2 — överlämning}`, `{Leverans 3 — slutrapport}`, `{Beslut 1 — godkännande av slutleverans}`, `{Beslut 2 — förvaltningsöverlämning}`, `{Avslut av uppdrag}`
- **No audit needed beyond this note.**

---

## Slide 11 — Kvalitetssäkring

- **Type:** quality-assurance (3 sections + review points grid, single instance)
- **Placeholders — Section A (QA-process):**
  - `{QA-process — övergripande beskrivning av vårt kvalitetsarbete: metodik, standarder och verktyg.}` — applicator: `section.qaProcess[0]`
  - `{QA-process — granskningsrutiner, peer review och dokumentationskrav.}` — applicator: `section.qaProcess[1]`
- **Placeholders — Section B (Kvalitetsledare):**
  - `{Namn, kvalitetsledare}` — applicator: `section.qualityLead.name`
  - `{Roll, erfarenhet och mandat}` — applicator: `section.qualityLead.roleAndMandate`
  - `{Kontakt — e-post och telefon}` — applicator: `section.qualityLead.contact`
- **Placeholders — Section C (Eskalering):**
  - `{Hur avvikelser hanteras och eskaleras till beställare}` — applicator: `section.escalation.process`
  - `{Rapporteringsfrekvens och format — månads­rapport, avvikelse­rapport}` — applicator: `section.escalation.reporting`
- **Placeholders — Avstämningspunkter (slot cap: 4):**
  - `{Avstämning 1 — tidpunkt och innehåll}` — applicator: `section.checkpoints[0]`
  - `{Avstämning 2}` — applicator: `section.checkpoints[1]`
  - `{Avstämning 3}` — applicator: `section.checkpoints[2]`
  - `{Avstämning 4}` — applicator: `section.checkpoints[3]`
- **Static labels:** `11 · KVALITETSSÄKRING`, `Kvalitetssäkring`, `A`, `QA-PROCESS`, `B`, `ANSVARIG KVALITETSLEDARE`, `C`, `ESKALERING OCH RAPPORTERING`, `AVSTÄMNINGSPUNKTER MOT BESTÄLLARE`, `AP 1`, `AP 2`, `AP 3`, `AP 4`
- **Footer (replace):** `{Bolagsnamn}`, `{Diarienummer}`, `11 / 17`

---

## Slide 12 — Team, omfattning och pris

- **Type:** team-pricing (table with 5 consultant rows + summary row, single instance)
- **Placeholders — Column headers:** Static (`KONSULT`, `ROLL`, `OMFATTNING`, `TIMPRIS (SEK)`, `TIMMAR`, `TOTAL VOLYM (SEK)`)
- **Placeholders — Rows (slot cap: 5 consultant rows):**
  - Row 1: `{Konsult 1 — namn}`, `{Roll 1}`, `{Omfattning 1 %}`, `{Timpris 1}`, `{Timmar 1}`, `{Total 1}`
  - Row 2: `{Konsult 2 — namn}`, `{Roll 2}`, `{Omfattning 2 %}`, `{Timpris 2}`, `{Timmar 2}`, `{Total 2}`
  - Row 3: `{Konsult 3 — namn}`, `{Roll 3}`, `{Omfattning 3 %}`, `{Timpris 3}`, `{Timmar 3}`, `{Total 3}`
  - Row 4: `{Konsult 4 — namn}`, `{Roll 4}`, `{Omfattning 4 %}`, `{Timpris 4}`, `{Timmar 4}`, `{Total 4}`
  - Row 5: `{Konsult 5 — namn}`, `{Roll 5}`, `{Omfattning 5 %}`, `{Timpris 5}`, `{Timmar 5}`, `{Total 5}`
- **Placeholders — Summary row:**
  - `{Summa timmar}` — applicator: computed sum of hours
  - `{Anbudspris totalt}` — applicator: computed total price
- **Static text in summary row:** `Summa — anbudspris exkl. moms`
- **Static footnote:** `Samtliga priser anges i SEK exklusive moms. Omfattning anger del av heltid under uppdragstiden.`
- **Note:** If data has fewer than 5 consultants, applicator removes unused rows. Table is a PPTX table element — applicator must iterate table rows, not text frames.
- **Footer (replace):** `{Bolagsnamn}`, `{Diarienummer}`, `12 / 17`

---

## Slide 13 — Uppfyllelse av ska-krav

- **Type:** requirement-matrix (table with 6 requirement rows, single instance)
- **Placeholders — Column headers:** Static (`NR`, `SKA-KRAV`, `UPPFYLLT`, `HUR KRAVET UPPFYLLS`, `REFERENS (CV / ERFARENHET)`)
- **Placeholders — Rows (slot cap: 6 rows):**
  - Row 1: `01`, `{Ska-krav 1 — formulering enligt upphandlingsunderlag}`, `JA`, `{Hur krav 1 uppfylls — konkret beskrivning}`, `{CV/ref 1}`
  - Row 2: `02`, `{Ska-krav 2}`, `JA`, `{Hur krav 2 uppfylls}`, `{CV/ref 2}`
  - Row 3: `03`, `{Ska-krav 3}`, `JA`, `{Hur krav 3 uppfylls}`, `{CV/ref 3}`
  - Row 4: `04`, `{Ska-krav 4}`, `JA`, `{Hur krav 4 uppfylls}`, `{CV/ref 4}`
  - Row 5: `05`, `{Ska-krav 5}`, `JA`, `{Hur krav 5 uppfylls}`, `{CV/ref 5}`
  - Row 6: `06`, `{Ska-krav 6}`, `JA`, `{Hur krav 6 uppfylls}`, `{CV/ref 6}`
- **Note:** Row numbers (`01`–`06`) are static in template. `JA` is static — if a requirement is NOT met, applicator must override. Applicator should handle >6 rows by cloning rows or warn that data exceeds cap.
- **Note:** This is a PPTX table element — iterate table rows.
- **Footer (replace):** `{Bolagsnamn}`, `{Diarienummer}`, `13 / 17`

---

## Slide 14 — Referensuppdrag 1 (CLONE TEMPLATE)

- **Type:** reference (CLONE — slide 14 is the master template; applicator clones for additional references)
- **Placeholders:**
  - `{Referens 1 — kundnamn}` — applicator: `reference.clientName` (large heading)
  - `{Referens 1 — kort kontextrad, t.ex. "Digitalisering av ärendehantering"}` — applicator: `reference.contextLine` (subtitle)
  - `{Kund — organisation}` — applicator: `reference.organisation`
  - `{Start MM/ÅÅÅÅ}` — applicator: `reference.startDate`
  - `{Slut MM/ÅÅÅÅ}` — applicator: `reference.endDate`
  - `{Omfattning — antal timmar, konsulter och total volym}` — applicator: `reference.scope`
  - `{Namn}` — applicator: `reference.contact.name`
  - `{Titel} · {Telefon} · {E-post}` — applicator: `reference.contact.titlePhoneEmail` (compound — replace full text frame or split)
  - `{Roll/leverans — vilken roll vi hade och vad vi levererade, konkret och verifierbart}` — applicator: `reference.roleAndDelivery`
  - `{Resultat — mätbart utfall av uppdraget, gärna med siffror och tidsbesparing}` — applicator: `reference.result`
- **WARNING — non-placeholder dynamic text:**
  - Slide tab label: `14 · REFERENS 01` — literal. Applicator must update `01` → `02`, `03`, etc. per clone.
- **Static labels:** `KUND`, `PERIOD`, `—` (separator between dates), `OMFATTNING`, `KONTAKTPERSON`, `ROLL OCH LEVERANS`, `RESULTAT`
- **Footer (replace per clone):** `{Bolagsnamn}`, `{Diarienummer}`, `14 / 17` (update counter per clone)
- **Cloning plan:** Source = slide 14. Clone for each reference beyond the first. The illustrative copy at slide 15 is discarded.
- **Note on contact field:** `{Namn}` and `{Titel} · {Telefon} · {E-post}` are in SEPARATE text frames. Applicator handles them individually.

---

## Slide 15 — Referensuppdrag 2 (illustrative copy)

- **Type:** reference (ILLUSTRATIVE — pre-filled reference 2 copy for visual mockup purposes only)
- **IMPORTANT:** This slide will NOT be rendered from the mockup directly. Applicator clones slide 14 for all references including #2. Slide 15 from the mockup is discarded/skipped.
- **For the record:** Contains same structure as slide 14 with `{Referens 2 — kundnamn}`, `{Referens 2 — kort kontextrad}`, same field labels, footer `{Bolagsnamn}`, `{Diarienummer}`, `15 / 17`.
- **No audit needed beyond this note.**

---

## Slide 16 — Anbudssekretess

- **Type:** confidentiality (static structure + 4 secrecy rows, single instance)
- **Placeholders — Prose paragraph:**
  - `{Bolagsnamn}` — applicator: `master.companyName` (inline in body paragraph)
  - `{OSL kap X §Y}` — applicator: `section.oslReference` (legal reference, e.g. "19 kap 3 §")
- **Placeholders — Secrecy table (slot cap: 4 rows):**
  - Row 1: `{Slide/Bilaga 1}`, `{Uppgift som omfattas av sekretess}`, `{Varför — skadan som uppstår vid utlämnande}`
  - Row 2: `{Slide/Bilaga 2}`, `{Uppgift som omfattas}`, `{Motivering}`
  - Row 3: `{Slide/Bilaga 3}`, `{Uppgift som omfattas}`, `{Motivering}`
  - Row 4: `{Slide/Bilaga 4}`, `{Uppgift som omfattas}`, `{Motivering}`
  - Applicator field mapping: `section.secrecyRows[N].reference`, `section.secrecyRows[N].scope`, `section.secrecyRows[N].justification`
- **Static prose:** `Begäran om sekretess enligt offentlighets- och sekretesslagen`, `begär härmed att följande uppgifter i anbudet omfattas av sekretess enligt`, `. Ett offentliggörande av nedanstående uppgifter bedöms medföra sådan skada att uppgifterna inte bör lämnas ut.`
- **Static table headers:** `REFERENS`, `OMFATTAR`, `MOTIVERING`
- **Note:** `{Bolagsnamn}` in the prose paragraph is a DIFFERENT text frame from the footer `{Bolagsnamn}`. Both must be replaced but they are separate nodes.
- **Footer (replace):** `{Bolagsnamn}`, `{Diarienummer}`, `16 / 17`

---

## Slide 17 — Certifieringar

- **Type:** certifications (4 certification cards, single instance)
- **Placeholders — Card 1 (ISO 9001 — Kvalitetsledningssystem):**
  - `{Certifikatnummer}` — applicator: `section.certs[0].number`
  - `{Giltighetstid}` — applicator: `section.certs[0].validUntil`
- **Placeholders — Card 2 (ISO 27001 — Ledningssystem för informationssäkerhet):**
  - `{Certifikatnummer}` — applicator: `section.certs[1].number`
  - `{Giltighetstid}` — applicator: `section.certs[1].validUntil`
- **Placeholders — Card 3 (ISO 14001 — Miljöledningssystem):**
  - `{Certifikatnummer}` — applicator: `section.certs[2].number`
  - `{Giltighetstid}` — applicator: `section.certs[2].validUntil`
- **Placeholders — Card 4 (Övrig certifiering):**
  - `{Övrig relevant certifiering}` — applicator: `section.certs[3].name`
  - `{Beskrivning}` — applicator: `section.certs[3].description`
  - `{Certifikatnummer}` — applicator: `section.certs[3].number`
  - `{Giltighetstid}` — applicator: `section.certs[3].validUntil`
- **WARNING:** `{Certifikatnummer}` and `{Giltighetstid}` appear 4 times each (once per card). Since placeholder text is identical across cards, a global string replace would corrupt all cards. Applicator MUST replace by text frame position/index, NOT by string matching globally.
- **Static card titles:** `ISO 9001`, `Kvalitetsledningssystem`, `ISO 27001`, `Ledningssystem för informationssäkerhet`, `ISO 14001`, `Miljöledningssystem`
- **Static labels within cards:** `CERTIFIKATNR`, `GILTIG T.O.M.`
- **Static footnote:** `Kopior av samtliga certifikat bifogas anbudet som separata bilagor.`
- **Note:** If a cert is not applicable (e.g., company lacks ISO 14001), applicator hides the entire card. The "Övrig" card (card 4) is always optional.
- **Footer (replace):** `{Bolagsnamn}`, `{Diarienummer}`, `17 / 17`

---

## Global footer pattern

Slides 2–17 all contain a footer with three elements in separate text runs:
- `{Bolagsnamn}` — replace with `master.companyName`
- `|` — static separator
- `{Diarienummer}` — replace with `master.diaryNumber`
- Slide counter `NN / 17` — replace with correct slide number at runtime

The footer is NOT on slide 1 (cover). The cover has `{Bolagsnamn}` and `{Diarienummer}` inline in the body content.

## Placeholder collision risks

| Risk | Slides affected | Mitigation |
|------|----------------|------------|
| `{Certifikatnummer}` × 4, `{Giltighetstid}` × 4 | 17 | Replace by text frame index, not string-match |
| `{Bolagsnamn}` in body + footer (slide 16) | 16 | Replace all occurrences — both are correct |
| `{Anbudsdatum}` × 2 (slide 1) | 1 | Replace all occurrences |
| `{Fas N — namn}` in cards AND Gantt (slide 6) | 6 | Replace all occurrences — both should match |
| Slide counter `NN / 17` hardcoded per slide | 2–17 | Applicator patches counter string per slide |

## Literal-text replacements (non-`{...}` style)

These appear as static text in the template but must be updated dynamically:

| Text in template | Slides | Applicator action |
|------------------|--------|-------------------|
| `FAS 1 AV 4` in tab label | 7 (clones → 8–10) | Replace `FAS 1` → `FAS N` per clone |
| `01` (phase badge) | 7 (clones → 8–10) | Replace `01` → `02`, `03`, `04` |
| `FAS 1` (section label) | 7 (clones → 8–10) | Replace per clone |
| `TIDSLINJE · FAS 1` | 7 (clones → 8–10) | Replace `FAS 1` → `FAS N` per clone |
| `14 · REFERENS 01` (tab label) | 14 (clones → 15+) | Replace `01` → `02`, `03`, etc. per clone |
| `JA` in ska-krav table | 13 | Override if requirement not fully met |
