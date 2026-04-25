# 2026-04-25 — PPTX-mallfeedback (post E2E-test)

Stefans feedback efter visuell genomgång av en genererad anbudsmall (slutsteg i E2E-flödet med batch 2-data).

**Övergripande:** "Börjar se bättre ut nu." Referenser + sekretess + certifieringar = kanon, rörs inte.

## Trivialt: bullets + bold (sannolikt mall-styling eller prompt-tweak)

### Slide 3 — Smärtpunkter
- "Organisation", "System" och "Processer" ska vara **fetstilta**
- Smärtpunkter ska vara bulletpoints, inte streck

### Slide 5 — Utmaningar + värde utöver ska-krav
- Båda blocken ska vara bullets

### Slides 7-10 — Fas 1-4
- Aktiviteter, leveranser och beslut i styrgrupp ska vara bullets

## Layout-arbete (kräver iteration-loop-tooling)

### Slide 6
- Visuella buggar — Stefan flaggar att detta är en bra kandidat för agent-PNG-loop

### Slide 11
- Stökig, behöver kortas ned (sannolikt LLM-output, inte mall)

### Slide 12
- Text overlap i rollerna — annars OK

### Slide 13
- Stökig, text overlap. Matrisen behöver göras enklare och mer kortfattad — kombinerat mall- och prompt-fix

## Feature-idé: visuell polish-agent post-mall-generering

**Stefans tes:** Den genererade mallen kan inte hantera variabel textmängd perfekt (t.ex. streck mellan stycken på uppdragsbeskrivning). Lägg till ett **visuellt förbättringssteg som körs efter mall-fyllning**:

1. Rendera till PNG
2. Agent läser av PNG, identifierar visuella problem (overlap, glapp, dålig hierarki)
3. Lägg till visuella element som passar (separators, framing, spacing)
4. Iterera tills tröskel uppnådd

**Befintlig tooling som kan användas:** `scripts/compose-slide-grid.ps1` + `scripts/render-and-verify.ps1` finns redan för manuell iteration → kan inkapslas i agent-loop.

**Storlek:** Större feature, kräver brainstorming + plan innan impl.

## Cover-preview i BidEditor

**Just nu:** CoverRenderer.tsx renderar en hardcoded blå HTML-box — inte alls som mallens cover.

**Beslut 2026-04-25:** Pre-render statisk PNG av `templates/anbudsmall-v2.pptx` slide 1 → `public/templates/anbudsmall-v2-cover.png`. Visa som bakgrund i CoverRenderer + EditableText-overlay för titel/kund/datum (live-edit kvar). Samma PNG återanvänds som thumbnail i framtida mall-väljare.

**Trade-off accepterat:** Statisk skin ≠ WYSIWYG av faktiskt anbud — bid-data syns inte renderad i bakgrunden, bara som overlay-text.

## Future feature: skrollbar full PPTX-preview

**Stefans tes:** "Det hade varit grymt om man kan skrolla igenom hela PDFen i previewen högst upp."

**Approach:** Live-renderad PPTX → PDF/PNG av aktuella anbudet, embedda i editor. Ger WYSIWYG och låter användaren förhandsgranska hela exporten utan att ladda ner.

**Blockerare:** Kräver Vercel-kompatibel PPTX→PDF/PNG-converter (LibreOffice headless via Docker, eller CloudConvert API). Inte trivialt deploy-mässigt.

**Storlek:** Större feature — egen PR efter mall-väljaren.

## Editor ↔ presentation desync (identifierad 2026-04-25)

### Akut: Krav-truncation
- **Symptom:** RFP listar 8 ska-krav + 6 bör-krav (14 totalt). Editor + slide visar bara 6. **Datalöss.**
- **Diagnos:** `src/lib/bid-generator/bundles/requirement-matrix.ts:26` har `.max(6)` på Zod-schemat + prompt säger "1-6 rader per matris (template slot cap)". Mallen (slide 13) är designad för max 6 rader.
- **Severity:** Hög — felaktig anbudsoutput vid >6 krav.
- **Möjliga lösningar:**
  - A) Höj cap + utöka mall-slide-13 till t.ex. 14 rader (kompakt grid)
  - B) Smart prioritering: alltid ALLA ska-krav, bör-krav fyller överskott
  - C) Multipla matris-slides när antalet krav överskrider cap
  - D) Hybrid: lista alla krav i en kompakt tabell på slide 13, behåll detaljerade rader bara för viktigaste — och redovisa coverage separat
- Kräver mall-design — inte quick fix.

### Slide 5 "Vad vi ser" saknas i editor
- Slide 5 (en av understanding-prose-sliderna) renderas i PPTX men har ingen motsvarande sektion i BidEditor.
- **Trolig orsak:** registry har `slide 5: prose` men bid-generator producerar inte sektionen den fyller.
- **Effekt:** Användaren kan inte editera slide 5-innehållet.

### Faser: risker visas i editor men inte i slides
- PhasesRenderer i editorn visar risker per fas. Phase-detail-applicatorn rendererar dem inte i PPTX.
- **Förslag:** lägg till risker i mallens phase-detail-slide.

### "Mål" (editor) vs "Aktiviteter" (slides)
- Editor har "Mål" per fas, slides har "Aktiviteter" — olika terminologi och olika data?
- **Stefans förslag:** lägg till en mål-ruta uppe i högra hörnet av phase-detail-slidesen med kortfattad mening (komplement, inte ersättning).

## Kvalitetssäkring — för mycket text

- **Kvalitetsprocess-rubriken:** stryka eller drastiskt korta
- **Kvalitetsansvarig:** behåll som den är
- **Eskalering:** bra men något väl detaljerad
- **Princip-feedback från Stefan:** "Det är aldrig optimalt att snäva in sig för mycket i hur man gör uppdraget redan i anbudet. Det måste finnas lite flexibilitet i uppdraget också."
- **Trolig fix:** prompt-tweak i quality-assurance-modulen — be om kortare stycken, mindre process-detalj.

## Open questions inför fix-pass

- Ska "ska vara bullets" lösas i mallen (slot-format) eller i LLM-prompten (output-strukturen)?
- För slide 11/13 "kortas ned" — är det max-length i prompt eller summarization-pass?
- Slide 13 matris — ny enklare struktur måste designas av Stefan innan refactor
