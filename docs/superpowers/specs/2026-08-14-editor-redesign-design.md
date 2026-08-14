# Editor-omdesign — design-spec

**Datum:** 2026-08-14
**Beslut:** Stefans mockup-val (smoke-fynd 5, 2026-08-12): bas = variant A "Dokumentet",
vita sektionskort från variant B, kapiteldashboard + topbar från variant C.
**Godkänd referens:** `notes/2026-08-14-editor-redesign-mockup.html` (+ `.png`) —
mockupen är sanningskällan för utseendet; denna spec är sanningskällan för beteendet.

## Varför

Editorn bär PPTX-arv som skaver mot MD-first-beslutet: covern är en bokstavlig
slide-bild med absolutpositionerad text, fasvyn har slide-färgbalkar med vit text och
grå Tailwind-färger utanför tokensystemet, headern är två mono-länkar, och kapitelnaven
är en platt lista utan status. Stefans dom i klick-smoken: "editor-UI:t ska designas om".

## Målbild (ur mockupen)

1. **Topbar (C):** en rad — flödesstegen (1 ANALYS · 2 GO/NO-GO · 3 ANBUD) som
   kompakta steg-pills, dnr i mono, dokumentnamn, spacer, statuspunkt + "UTKAST ·
   SPARAD HH:MM", knapparna "Markera som inlämnad" + "Exportera (MD)".
   ERSÄTTER FlowNav + BidEditors interna länkrad PÅ ANBUDSSIDAN (FlowNav förblir
   orörd på analys-/go-no-go-sidorna). Stegen är klickbara som FlowNav är i dag.
2. **Metadata-rad** under topbaren: Avsändare / Sista anbudsdag / Anbudsdatum i mono
   (dnr bor i topbaren). Fält utan värde döljs.
3. **Kapiteldashboard (C):** header "KAPITEL | N/M KLARA", numrerade rader (00–10)
   med statusprick till höger, aktiv rad = accent-soft + vänsterkant, och
   **avvikelsenoter direkt under listan** (Stefans justering 2026-08-14).
4. **Dokumentyta (A i B:s kort):** pappersbakgrund, max-w ~47rem, varje sektion i
   ett vitt kort (hårlinje, radius 14, mjuk skugga) med mono-kicker "KAPITEL NN" +
   Fraunces-rubrik.
5. **Dokumenthuvud ersätter PPTX-covern:** kort med kicker "ANBUD · <datum>",
   kundnamn som stor Fraunces-H1, upphandlingens namn som undertitel. Fälten
   (client/title/date) förblir redigerbara via EditableText — datamodellen
   (cover-sektionens content) är orörd, bara renderingen byts.
6. **Fasvyn = vertikal tidslinje:** numrerade noder på accent-linje, per fas:
   Fraunces-rubrik + periodchip + timmar till höger, måltext, leverabler med
   accent-bock, risker som diskret varningsrad. Alla i dag redigerbara fält
   (namn, duration/period, mål, leverabler, risker, timmar) förblir redigerbara.
   Slide-färgbalkarna (PHASE_COLORS) raderas.

## Statusmodell för dashboarden (ärlig, härledbar — INTE mockupens fyllnadstext)

- **Klar (grön ●):** sektionen finns med innehåll.
- **Avvikelse (orange ◐):** mekaniskt detekterbar brist, med not under listan:
  - team-pricing med `timpris === null` på någon medlem → "timpris saknas"
    (samma predikat som dagens needsTimpris-banner)
  - kapitel vars bundle ligger i `failed_bundles` → "kunde inte genereras"
  - OBS (rättad under bygget): "saknas"-fallet för ej-landade förväntade kapitel
    utan failad bundle byggs INTE — borttagning av sektioner är en supportad
    handling och foreign-anbud är inte v2-bundna; flaggan hade spammat båda.
- **Genereras (under generation):** GeneratingChapterLists väntande/klar/misslyckad-
  semantik flyttar in i dashboardens rader (befintlig buildChapterList återanvänds).
- MEDVETET UTANFÖR: mockupens "ej granskad" — granskningsspårning är en ny feature,
  inte omstyling. Byggs inte.

## Övriga renderers (team/kravmatris/referenser/QA/certifieringar/sekretess/prosa)

Får kortramen + rubriksystemet från SectionRenderer-wrappern och ett TOKENPASS
(gray-* → ink/ink-soft/ink-mute/rule; slide-artefakter bort), men ingen
layoutombyggnad i detta pass — de är redan tabell-/listformade och fungerar.

## Bevaras oförändrat

- All redigeringsmekanik (EditableText, debounced autosave, sectionsRef-mönstret)
- Poll under generering, failed-banner, ForgeLoader, felbanners
- Export-/submit-flödena (#116): knapparna FLYTTAR till topbaren; export-nudgen
  (role=status) renderas under metadata-raden; exported-läget visar inlämnad-rad
  i topbaren i stället för knappen
- SectionNav:s omordning/borttagning av sektioner (flyttar in i dashboarden)
- Foreign-vägens platta kapitellista (experimentell yta, orörd)

## Datakällor för nya fält

- dnr: `analysis.diaryNumber` (optional — dölj när null)
- Sista anbudsdag: `analysis.deadline`
- Avsändare: aktiva org-profilens companyName (samma källa som cover-generering);
  null → dölj
- Anbudsdatum: cover-sektionens date-fält
- Dokumentnamn i topbar: `analysis.client` — `analysis.title` som fallback
- "SPARAD HH:MM": tid för senast lyckade autosave (ny liten state i BidEditor);
  "Sparar..." under pågående save (ersätter dagens fixed-bottom-pill)
