// Central modellkonfiguration. Roller, inte strängar — call-sites importerar
// MODELS.<roll> så att ett modellbyte är en enradsändring här plus eval-körning.
// Prisrader för varje modell ska finnas i ai-cost.ts (testat i models.test.ts).
//
// writing avgörs av A/B-harnessen i fas 1 (Opus 4.8 vs Fable 5) — se
// docs/superpowers/plans/2026-06-10-utvecklingsplan-master.md.

export const MODELS = {
  // RFP-analys och konsult-CV-extraktion — mekanisk JSON-strukturering.
  extraction: "claude-sonnet-4-6",
  // Matchning steg 1: scorar hela poolen, endast siffror.
  prefilter: "claude-haiku-4-5-20251001",
  // Matchning steg 2: motiveringar för kortlistan.
  matching: "claude-sonnet-4-6",
  // Go/No-Go-bedömning.
  gonogo: "claude-sonnet-4-6",
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
  writingSupport: "claude-sonnet-4-6",
  // Utmanare i A/B-test av anbudstext (fas 1) — ingen produktionsanvändning.
  writingChallenger: "claude-fable-5",
  // LLM-judge i evals. Får aldrig vara samma modell som jämförs.
  judge: "claude-sonnet-4-6",
} as const;

export type ModelRole = keyof typeof MODELS;
