# Bidsmith — Roadmap & Status

> **Enda sanningskällan för "vad är gjort / vad härnäst".** Uppdatera denna fil i
> SAMMA PR som ändringen. Lita ALDRIG på assistent-minne för status — läs här och
> verifiera mot `git log` / koden. (Minnet driftar; denna fil följer koden.)

_Senast uppdaterad: 2026-07-02 — main @ `03e3394`_

---

## 🔜 NÄSTA (börja här)
- [ ] **Slice 4 — `generic-prose`-bundle** + prose/field-format (täcker främmande sektioner).
      Första formatet i B; A:s fallback samtidigt.
- [x] **Kör migration 008** (`template_profiles`) — applicerad manuellt i Supabase 2026-07-03.

## Mall-uppladdning (godtyckliga bolagsmallar) — aktiv feature
Design-doc: `notes/2026-07-02-template-upload-architecture.md` (A+C-combo, B inkrementellt).
Beslut: kapabilitets-baserad motor, onboarding ≠ rendering, durabel mall-profil.
- [x] Slice 1 — mall-profil-schema + migration 008 (#42, merged)
- [x] Slice 2 — `manifestToProfile`: manifest → capability-klassificering (#44, merged)
- [x] Slice 3 — profil-driven renderare bakom `BIDSMITH_PROFILE_RENDER`, golden-bitparitet grön
- [ ] Slice 4 — `generic-prose`-bundle + prose/field-format (täcker främmande sektioner)
- [ ] Slice 5 — onboarding-UI (introspektion + intervju + redigerbar profil)
- [ ] Slice 6 — B inkrementellt: bullets, sedan godtyckliga table-rows

## Öppna PR:er (väntar review)
_Inga just nu._

## Backlog (verifiera mot kod före start — kan vara inaktuellt)
- Statisk TOC-sidnumrering desyncar (hårdkodad; matris-paginering + tomma referenser förskjuter riktiga nummer)
- `met`/JA-fältet vestigialt i matris-schemat (coverage = sanningskälla) — städbar
- ai-client detekterar inte `stop_reason: "max_tokens"` → alla bundles re-trunkerar identiskt (bredare härdning)
- `consultants/upload` sanerar inte filnamn (ingen storage-nyckel-yta idag, men om det ändras)
- Profil-renderarens `variant` castas `as ProseVariant` utan validering (render-from-profile.ts) — härda när slice 5/6 låter främmande mallar sätta godtyckliga variant-strängar
- **BUG-A:** leveranser hamnar i ska-krav i analysvyn
- **BUG-B:** analyserad RFP syns inte i dashboarden → svårt att gå tillbaka till analysen
- "Ändra team" skapar nytt anbud (POST /api/bids) i st.f. att regenerera — semantik att se över
- T15 manuell smoke + runtime hallucination/coverage-kalibrering (kräver riktig RFP-data / Ekan-adoption)

## Strategiska spår (större, senare)
- Kapacitetsgap-kartan (vilka ska-krav firman återkommande inte uppfyller)
- Anbudshistorik / feedbackloop (win-rate per köpartyp/CPV, win-loss-vy)
- Mall-importören (del av mall-uppladdning ovan)

## Levererat 2026-07-02 (dagens pass)
- #34 API-härdning · #35 matcher-tester · #36 SSRF + upload-säkerhet · #37 OOM-guard
- #38–40 kravmatris (paginering / innehållsmedveten layout / JA-NEJ-DELVIS-status)
- #41 städpack (export-guard + ai-client kostnadstak + RFP-injektions-delimiters)
- #42 mall-profil-schema · #43 bid-editor-nav · #44 manifest→profil · #45 denna ROADMAP

## Arbetsnoter / gotchas
- **PPTX visuell iteration:** rendera via `renderTemplate` → exportera slides→PNG via PowerPoint
  COM (`Presentations.Open(...).Slides.Item(i).Export(png,"PNG",w,h)`) → titta. Slide 50.8×28.575 cm.
  Layout-konstanter i `applicators/requirement-matrix.ts` kalibrerade mot mallens font/kolumner.
- **Ingen PR-review-bot på bidsmith** → kör lokal `/code-review` (adversariell) före merge på
  regressionskänsliga ändringar.
- Migreringar appliceras MANUELLT via Supabase SQL Editor; redigera aldrig en applicerad migration.
