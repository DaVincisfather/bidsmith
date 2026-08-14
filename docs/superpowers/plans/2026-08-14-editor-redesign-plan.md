# Editor-omdesign — implementationsplan

**Spec:** `docs/superpowers/specs/2026-08-14-editor-redesign-design.md`
**Mockup (utseendets sanningskälla):** `notes/2026-08-14-editor-redesign-mockup.html`
**Strategi:** två PR:ar — skalet först (layout/topbar/dashboard), sedan innehållet
(cover/faser/tokenpass). Båda visuellt verifierade mot mockupen före merge
(screenshot i dev, global verifieringsregel). PR-routinen inväntas per PR.

## PR 1 — skalet (`feat/editor-redesign-shell`)

1. **EditorTopbar-komponent** (ny): steg-pills (klickbara, samma mål som FlowNav),
   dnr, dokumentnamn, statuspunkt + "UTKAST/INLÄMNAD · SPARAD HH:MM", export- +
   submit-knapparna (flyttade från dokumentbotten; samma handlers, nudge under
   metadata-raden med role=status). Metadata-raden med dölj-vid-null.
   → verifiera: komponenttest (statuslägen, knappflytt, null-fält) + screenshot.
2. **Sid-props:** bids/[id]/page.tsx slutar rendera FlowNav, hämtar + skickar
   diaryNumber/deadline/avsändare/klient till editorn. `next build`-grind
   (page-ändring).
   → verifiera: tsc + next build + befintliga page-beroende tester.
3. **ChapterDashboard-komponent** (ersätter SectionNav + GeneratingChapterList som
   yta; buildChapterList återanvänds): numrerade rader, statusprickar, N/M-räknare,
   avvikelsenoter under listan, omordning/borttagning bevarad, generating-läget.
   Statusmodellen enligt spec (klar/avvikelse/genereras — "ej granskad" byggs INTE).
   → verifiera: komponenttest per statusklass + generating-fall; BidEditor-testerna
   uppdaterade (navlänks-asserts).
4. **Dokumentytan:** canvas med kortwrapper i SectionRenderer (mono-kicker
   "KAPITEL NN" + Fraunces-h2), pappersbakgrund, footerknapparna borttagna
   (flyttade till topbaren).
   → verifiera: BidEditor-testerna + screenshot mot mockup.

## PR 2 — innehållet (`feat/editor-redesign-renderers`)

5. **CoverRenderer → dokumenthuvud-kort:** slide-bilden bort, kicker + H1 + undertitel,
   EditableText på client/title/date (datamodell orörd).
   → verifiera: renderer-test (redigering + visning) + skarp MD-export oförändrad.
6. **PhasesRenderer → tidslinje:** PHASE_COLORS raderas, tidslinje enligt mockup,
   alla redigerbara fält bevarade (namn/duration/mål/leverabler/risker/timmar/period).
   → verifiera: renderer-test (redigering per fält) + screenshot.
7. **Tokenpass övriga renderers:** gray-* → tokens, inga layoutändringar.
   → verifiera: visuell diff per renderer (screenshots), sviten grön.
8. **Slutverifiering:** full svit + lint + tsc + next build, screenshot-jämförelse
   mot mockupen på riktigt dev-anbud, ROADMAP-uppdatering (smoke-fynd 5 stängs).

## Grindar och regler

- Varje PR: lint + test + tsc (+ next build där page/route rörs), visuell
  verifiering med screenshot i dev (UI-regel), PR-routinen inväntas.
- Surgical: ingen ny mekanik utöver statusmodellen och sparad-tiden; inga ändringar
  i export-/submit-semantik, autosave eller AI-vägar.
- Efter PR 2: Stefans klick-smoke (gränsbeslutet 2026-08-14: omdesign → smoke →
  triagerade justeringar → publiceringschecklista).
