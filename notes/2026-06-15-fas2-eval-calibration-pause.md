# Fas 2 — PAUS vid eval-grinden (2026-06-15)

> **Handoff till ny session.** Pausat på Stefans begäran (inväntar Fable-tillgång).
> Detta dokument fångar EXAKT var vi står, varför, och vad det öppna beslutet är.

## Var vi är i fas 2 (Mall & profil som data)

| Del | Status |
|---|---|
| **PR A** — PPTX-introspektion (manifest, signaturer, hybridbudgetar) | ✅ MERGAD (PR #24, squash `0b1eae9`) |
| **PR B** — Manifest-driven generering (templates-tabell, template-store, golden-paritet) | ✅ MERGAD (PR #25, squash `9fdd119`). Migration 004 applicerad + verifierad i prod-DB. |
| **PR C** — Profil + /installningar-UI | 🟡 BYGGD men EJ PR:ad/mergad — **PAUSAD vid eval-grinden** |
| **Eval-grind (Task 17)** | 🔴 PAUSAD — pågående utredning, se nedan |

### PR C — vad som är byggt (branch `fas-2c-profil-ui`, 5 commits, EJ pushad)
- `b7fc10e` eval: syntetisk profil insprutad i bid-generator-eval (tonalitet-only)
- `70f6458` /installningar-UI (mall-upload + manifest-preview + profil-CRUD)
- `054d263` API-routes (templates upload/activate, profiles CRUD/activate)
- `0f6c51c` org-profil injicerad i cachade systemkontexten + master companyName
- `6f52826` migration 005 (org_profiles + active_profile_id + bid-templates-bucket)

**Migration 005 är EJ applicerad** i Supabase (Stefan-gate). UI:t degraderar tyst om
den saknas (tom profillista + hint). Migration 004 ÄR applicerad.

**Återstår i PR C efter att eval-grinden är löst:** Task 17 (kör grind), Task 18
(Testbolaget-demo + masterplan-status + push + PR). Migration 005 ska appliceras före
Task 16/18 live-röktest.

## VARFÖR vi pausar — eval-grindens utredning (det viktiga)

Task 17 körde bid-generator-evalen. `structure.pass` + `overflow.pass` GRÖNA, men
`coverage.recall` 0.12–0.18 (tröskel 0.90) och `hallucination.pass` flippande. Vi
grävde och tre antaganden föll i tur och ordning:

1. **"Stokastiska judgar (±50% varians)"** → FEL om orsaken. Judgarna är
   deterministiska (`JUDGE_TEMPERATURE = 0`, `judges.ts:31`). Variansen kommer från
   GENERATORN (Opus-skrivbundles, ej temp 0) som skriver olika anbud varje körning.

2. **"Tomma referenser sänker coverage"** (PR #12:s deterministiska tom-mall) → FEL,
   MOTBEVISAD AV DATA. Isoleringstest (ETT anbud, coverage dömt med gammal platshållar-
   JSON vs ny deferred-markör): noll krav räddades, coverage 0.18→0.12, ett krav
   flippade fel. Tomma referenser var en **röd sill** — judgen nämnde dem men de var
   inte bärande orsak. **Fixen på denna branch (`a6bfe19`) är alltså motbevisad och
   ska INTE mergas som lösning.** (Den är en marginellt ärligare representation men
   löser inte problemet.)

3. **Den verkliga orsaken** (ur 14 missade krav i chalmers-fixturen, judgen i stort
   sett KORREKT i alla):
   - **~7 krav: konsulterna saknar genuint kompetensen** (fixture-miss). Syntetpoolen
     = generiska affärsutvecklare; chalmers vill ha disputerad biomedicin, cancer-
     forskning, ML/AI i biomed, IP/patent, fundraising, VD-roll. Judgen: "ingen
     konsult uppfyller" — sant.
   - **~4 krav: företags-/kvalificeringskrav generatorn STRUKTURELLT inte kan
     producera** — F-skatt, Creditsafe-rating 40, miljöpolicy. Det är bifogade
     intygsdokument, inte text AI:n skriver ur CV:n. Generatorn har ingen input för dem.
   - **1 krav: referensbevisat** (deferred per design) — referensuppdrag 200h.
   - Plus några "should" vagt nämnda i prosa men utan judge-krävd konkretion (gränsfall).

### Slutsats
`coverage.recall` 0.12–0.18 är en **ärlig mätning** — inte ett judge-fel. 0.90-tröskeln
är onåbar av strukturella skäl: kravmatrisen har 6 slottar mot 17 krav, konsulterna
matchar inte RFP:n, och flera krav ligger helt utanför generatorns räckvidd. Detta är
INTE judge-kalibrering (judgen funkar) — det är en fråga om **vad coverage borde mäta**
och **fixture-kvalitet**. Det är Stefans produktbeslut.

## DET ÖPPNA BESLUTET (vad vi återupptar med)

Stefan ska välja riktning (presenterades, pausade innan svar för att invänta Fable):

- **A (rekommenderad i sessionen): coverage = informationssignal.** Datan visar att
  `coverage.recall` mot godtyckliga RFP-krav inte är en giltig merge-grind för NÅGON
  ändring (fixture/scope-artefakt). Grinda på `structure.pass` + `overflow.pass`
  (båda gröna, fas 2C passerar), coverage informativ. Släng `a6bfe19`. Låter fas 2C
  gå vidare.
- **B: klassificera krav** (golden-täggar: generator-adresserbar vs intygsdok vs
  referens); coverage mäter bara adresserbara; omkalibrera tröskeln. Principiell, större,
  kräver Stefans taxonomi-signoff.
- **C: fixa fixtures** (para matchande konsulter mot varje RFP) — adresserar hink 1,
  inte hink 2.
- **D: brainstorm metrik-design.**

## Branch- & resume-state

- `main` @ `9fdd119` — PR A+B mergade. Rent.
- `fas-2c-profil-ui` @ `b7fc10e` (worktree `bidsmith-fas2c`) — 5 commits, EJ pushad.
  PR C komplett utom eval-grind + Testbolaget-demo. Återuppta här när beslutet är fattat.
- `eval-coverage-reference-fix` @ `a6bfe19` (worktree `bidsmith-calib`, denna branch) —
  1 commit (MOTBEVISAD fix) + detta dokument. EJ pushad. Om beslut A: släng branchen.
- Inga öppna PRs.

## API-kostnad spenderad denna session
~$9 (2 kanariekörningar + 1 isoleringsverifiering). Inga fler betalkörningar gjorda.
Återstående fas 2-evalbudget om vi fortsätter: se [[project-bidsmith-fas2]].
