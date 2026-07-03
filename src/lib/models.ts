// Central modellkonfiguration. Roller, inte strängar — call-sites importerar
// MODELS.<roll> så att ett modellbyte är en enradsändring här. Grind per byte:
// samma familj uppåt = smoke + stickprov; familjebyte eller writing-rollen =
// eval (se CLAUDE.md-policyn, ändrad 2026-07-03). Prisrader för varje modell
// ska finnas i ai-cost.ts (testat i models.test.ts).
//
// writing avgörs av A/B-harnessen i fas 1 (Opus 4.8 vs Fable 5) — se
// docs/superpowers/plans/2026-06-10-utvecklingsplan-master.md.

export const MODELS = {
  // RFP-analys och konsult-CV-extraktion — mekanisk JSON-strukturering.
  // Sonnet 5 sedan 2026-07-03 (samma-familj-uppgradering utan eval). OBS:
  // temperature 0 ger reproducerbarhet INOM en modell — samma RFP ger en annan
  // kravlista efter bytet än före.
  extraction: "claude-sonnet-5",
  // Matchning steg 1: scorar hela poolen, endast siffror.
  prefilter: "claude-haiku-4-5-20251001",
  // Matchning steg 2: motiveringar för kortlistan.
  matching: "claude-sonnet-5",
  // Go/No-Go-bedömning.
  gonogo: "claude-sonnet-5",
  // TED-radar, scoring av upphandlingsnotiser.
  radar: "claude-haiku-4-5-20251001",
  // Kvalitetskritiska skrivbundles: understanding, phases, quality.
  // Env-overriden finns för eval:bid-compare (barnprocess per modell).
  // NODE_ENV-gatad + ||: en kvarglömd/tom env-var i produktion (t.ex. Vercel)
  // kan inte byta skrivmodell i smyg. Default är beslutet från A/B-testet.
  // OBS: en override-modell måste ha prisrad i ai-cost.ts (CLAUDE.md-regeln) —
  // claude-fable-5 täcks redan via writingChallenger.
  writing:
    (process.env.NODE_ENV !== "production" && process.env.BIDSMITH_WRITING_MODEL) ||
    "claude-opus-4-8",
  // Övriga skrivbundles: team, requirement-matrix. (reference är deterministisk
  // tom mall sedan PR #12 — ingen modell.)
  writingSupport: "claude-sonnet-5",
  // Fallback-prosa för okända mall-sektioner (generic-prose-bundlen). Egen roll
  // så fallbacken kan kalibreras oberoende av kärnskrivningen — Sonnet 5 i st.f.
  // Opus per beslut 2026-07-03 (kostnad: en främmande mall kan ha 30+ okända
  // slots = 30+ anrop per anbud). Kvalitetskontroll = ögonkoll i 5-UI-testningen.
  writingGeneric: "claude-sonnet-5",
  // Utmanare i A/B-test av anbudstext (fas 1) — ingen produktionsanvändning.
  writingChallenger: "claude-fable-5",
  // LLM-judge i evals. Får aldrig vara samma modell som jämförs. MEDVETET kvar
  // på 4-6 vid Sonnet 5-uppgraderingen: blindfacit-kalibreringen (fas 1, 8
  // människomärkta par) gjordes mot 4-6-judgen — ny judge-modell = omkalibrering
  // innan tally får beslutsvikt (CLAUDE.md-regeln).
  judge: "claude-sonnet-4-6",
} as const;

export type ModelRole = keyof typeof MODELS;
