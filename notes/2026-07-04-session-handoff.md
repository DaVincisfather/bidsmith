# Session-handoff 2026-07-03/04 — noll-hallucinationsspåret + UX-pass

Megasession. Detta är loggen för att återuppta rent imorgon. **Statuskällan är
`notes/ROADMAP.md` + `git log` — läs dem, inte detta minne.** Denna fil = vad vi
gjorde, varför, och exakt var vi står.

## Vad som drev sessionen
**Pivot (Stefan 2026-07-03):** konsultmatchningen mot RFP är den verkliga
pain pointen utan kundkalibrering och ska "sitta som en smäck". Mål: NOLL
hallucinationer i CV-extraktion + RFP-krav/analys. PPT-export-perfektion
nedprioriterad.

## Levererat (mergat #47–#68)
Slice 3–5b av mall-uppladdning (#47–#52) + hela noll-hallucinationskedjan
(#54–#68). Kedjan: ordagrant källcitat per påstående (schema-tvingat) → mekanisk
verifiering (`src/lib/verify-evidence.ts`, ingen LLM-judge) → runtime-vakt
(`src/lib/evidence-guard.ts`, delad av `analyzeRfp` + `extractConsultant`) →
persistens (migr. 009) → förlustfri redigering (server-återverifierad) → UI
(trust-receipt → källa-chip → källvisare m. täckningskarta → originalfil, migr.
010 + bucket `consultant-cvs`) → fas C: flaggade claims exkluderas ur all AI-input
(`grounded-claims.ts`) → extraktions-versions-diskriminator (migr. 011).
Modellbyte #53: Sonnet-roller → Sonnet 5 + ny `writingGeneric`; judge kvar på 4-6.
Profil-driven generering #68 (onboardad kundmall genererar anbud).

## Beslut som är låsta (relitiga inte)
- Fas C = policy A (EXKLUDERA flaggade, inte nedvikta).
- PII: self-hosted OSS → kunden är egen datakontrollant; källvisaren får visa hela
  källtexten bakom auth+klick; CV-original persisteras. Kvarvarande PII-gränser:
  vad som skickas till LLM-API:t + serialiserings-hygien i default-läsvägar.
- Onboarding-UI = GUIDAD WIZARD, slide-för-slide (valt över checklista/hybrid).
- Modell-grind-policy (CLAUDE.md): samma familj uppåt = smoke+stickprov; familjebyte/
  writing = eval; judge = aldrig utan omkalibrering.

## Migrationer körda av operatören (Stefan)
008 (template_profiles), 009 (consultant evidence), 010 (consultant cv_file_path),
011 (consultant extraction_version) + privat bucket `consultant-cvs`. Alla applicerade.

## NÄSTA (imorgon)
1. **Onboarding-wizarden** — sista biten. All backend finns; wizarden är UI:t som
   binder ihop upload → proposeInjectionPlan → bekräfta/skippa → instrumentTemplate
   → spara profil. Bygger på #68:s all-generic-routing.
2. **Stickprov** — relevans-stickprov av citaten (underlag: `evals/results/*.md`).
   Mekaniken garanterar ORDAGRANNHET; relevans är residualen människan verifierar.

## Öppna trådar / backlog-höjdpunkter (i ROADMAP)
- Per-mall structure-eval (v2-facit gäller inte foreign mallar — #68 satte null där).
- `consultant.summary` = nästa overifierade AI-input-yta.
- `applicatorForCapability` kastar på odefinierad capability — akut först i slice 6
  (redigerbara profiler); INTE nåbart via #68:s routing.
- npm ci failar på main (lockfile-drift, @emnapi/*) — egen fix vid tillfälle.

## Arbetssätt som funkade (behåll)
- Kostnadstrappa: Fable (jag) speccar + reviewar; Opus-subagenter skriver bulk-kod
  (noll live-API i byggen); operatör kör betalda steg under $20-tak.
- Varje PR: subagent bygger → jag reviewar + oberoende verifierar → PR → PR-routinen
  (aktiv på bidsmith, triggar på NYA PR:er) → justera fynd → merge → junction-först-städa.
- ⚠️ Junction-footgun bet TVÅ gånger: aldrig batcha worktree-städning; ta bort
  node_modules-junctionen FÖRST, verifiera BORTA, sen `git worktree remove`.
