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

export interface ModelLimits {
  /** Modellens tak för output-tokens. Täcker tänkande OCH svarstext. */
  maxOutputTokens: number;
  /**
   * Lägsta maxTokens som får kombineras med effort "max"/"xhigh"; null för
   * modeller som inte tar effort alls (ett golv där vore påhittat).
   *
   * Varför ett golv behövs: max_tokens är ett hårt tak på tänkande PLUS
   * svarstext. Vid hög effort tar tänkandet en stor del av budgeten, så ett tak
   * dimensionerat för enbart svaret klipper svaret mitt i. Anthropics
   * migrationsguide för Opus 4.7/4.8 anger 64000 som golv. Symptomet är
   * förrädiskt: stop_reason "max_tokens" på EXAKT takets värde, vilket läses
   * som ett skenande anrop i stället för som trunkering (bidsmith 2026-08-02,
   * phases-bundlen: 3 av 4 skarpa genereringar).
   */
  highEffortFloor: number | null;
}

/**
 * Kapabiliteter per modell. Bor bredvid MODELS med flit: ett modellbyte ska
 * förbli en enradsändring, och det förutsätter att tokentaken är DATA i stället
 * för magiska tal utspridda i bundlarna. models.test.ts kräver en rad per modell
 * registryt kan peka på, så ett byte som glömmer taken fälls av sviten i stället
 * för att visa sig som trunkerad output i drift.
 *
 * Nya modeller får läggas in innan de tas i bruk — då är själva bytet en rad i
 * MODELS. Ett byte av `writing`-rollen kräver ändå eval (CLAUDE.md-policyn).
 */
export const MODEL_LIMITS: Record<string, ModelLimits> = {
  "claude-opus-5": { maxOutputTokens: 128000, highEffortFloor: 64000 },
  "claude-opus-4-8": { maxOutputTokens: 128000, highEffortFloor: 64000 },
  "claude-fable-5": { maxOutputTokens: 128000, highEffortFloor: 64000 },
  "claude-sonnet-5": { maxOutputTokens: 128000, highEffortFloor: 64000 },
  "claude-sonnet-4-6": { maxOutputTokens: 128000, highEffortFloor: 64000 },
  // Haiku avvisar effort-parametern — inget golv att sätta.
  "claude-haiku-4-5-20251001": { maxOutputTokens: 64000, highEffortFloor: null },
};

/** Kapabiliteter för en modell, eller undefined när modellen är okänd. */
export function limitsFor(model: string): ModelLimits | undefined {
  return MODEL_LIMITS[model];
}
