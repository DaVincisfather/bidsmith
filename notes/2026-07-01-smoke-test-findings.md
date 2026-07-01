# Röktest PR C (fas 2C) — fynd & backlog (2026-07-01)

Röktest av mall-upload + profil på localhost:3000 (migration 005 applicerad).
Profil- och mall-upload **fungerar**. Fem fynd, triage:ade mot vad PR C rörde.

## Triage

| # | Fynd | Hör till | Status |
|---|------|----------|--------|
| 1 | Leveranser hamnar i ska-krav | analys/requirements | Befintlig bugg (ej PR C) — backlog nedan |
| 2 | "Var hittas manifest-previewn?" | — | Orientering: visas i Inställningar efter upload, före aktivera (`TemplateSection.tsx:169`) |
| 3 | Uppladdad mall reflekteras inte i on-screen-preview | mall-feature | By design (editorn visar slots, branding landar i export) + kopplat till #4 |
| 4 | Overflow i PPTX men "ingen overflow" | budget/overflow | **Root cause bekräftad → egen plan nedan** |
| 5 | Analyserad RFP syns inte i dashboarden | dashboard/analys | Befintlig bugg (ej PR C) — backlog nedan |

PR C rörde ingen analys-/dashboard-/requirement-/overflow-kod (verifierat: `git diff --name-only main...HEAD`).

## Root cause #4 (bekräftad med bevis)

Anbud `54fadb8a` kördes mot uppladdad mall `anbudsmall-colors` (DB-verifierat).
- **892/892 textboxar är normAutofit** i det exporterade decket.
- Uppladdad malls budgetar **byte-identiska** med bundlade (editorialCap rakt av, noll geometrisk bindning).
- Längsta runor 252–349 tecken, i **kompetenser/team/kravmatris** — fält som saknar budget helt (`compute-budgets.ts:57-81`).

Två lager, båda i `src/lib/pptx-template/introspect/compute-budgets.ts`:
1. `budget = normAutofit ? editorialCap : min(cap, geometri)` (`:146-149`) antar att normAutofit
   alltid krymper säkert. Håller för enradiga fält, INTE för flerradig prosa (krympning har golv → spill).
2. De värsta fälten (kompetenser/team/kravmatris) finns inte i `BUDGET_TOKENS` → aldrig flaggade.

`overflow.pass` grön för att evalen mäter 8 budgeterade fält mot fixtures+bundlad mall, aldrig riktig PPTX-geometri. **Beslut A står kvar** — evalen mäter smalare än verkligheten, ljuger inte.

## Plan: ärliga mall-budgetar + overflow-varning (Stefan-beslut 2026-07-01)

Produktbeslut:
- **Overflow-beteende:** varna + erbjud auto-korta per ruta (behåll text, knapp "korta ner åt mig").
- **Upload-grind:** varna men tillåt aktivering.

Tasks (TDD, kirurgisk diff, kostnadstrappat):
1. **compute-budgets:** geometrisk bindning även för flerradiga normAutofit-boxar (enradiga namn/period
   oförändrade). Utöka `BUDGET_TOKENS` till kompetenser/team/kravmatris. Omkalibrera bundled 8/8 så inget regrederar.
2. **Ärlig overflow-vy:** lista slide→fält→skrivet vs tak, visas vid mall-upload (varna, tillåt) + vid anbudsgenerering.
3. **Auto-korta per ruta:** API-route som skriver om ett fälts innehåll ≤ tak (writing-modellen); knapp per flaggad ruta i editorn.
4. Tester som fångar "text över tak → varning" + kalibreringsvakt mot bundled.

Landningsfråga: stacka på `fas-2c-profil-ui` (bygger på PR C:s mall-infra) → landar med/före PR C så
mall-upload-löftet håller. Alternativt egen PR efter PR C.

## Backlog — befintliga buggar (ej PR C, egna issues)

- **BUG-A (#1):** Leveranser hamnar i ska-krav i analysvyn. Rör analys/requirement-parsning.
  Repro: analysera en RFP, kolla ska-krav-listan. Finns på `main`.
- **BUG-B (#5):** Analyserad RFP dyker inte upp i dashboarden → går inte tillbaka till analysen.
  Rör dashboard-/analys-persistens/listning. Finns på `main`. Blockerar grundflödet — prioritera.
