/**
 * Launch gate for the foreign-template path (vägbeslutet 2026-07-14, se
 * notes/2026-07-14-budget-calibration-evaluation.md): upload-detektering →
 * onboarding-wizard döljs tills kalibreringsloopens v2 stänger mätluckorna
 * (spAutoFit/slidekant, enrads-semantik, no-wrap). Opt-in via env, default AV
 * — exakt "on" krävs (fail closed). Redan onboardade mallar fortsätter rendera:
 * flaggan grindar YTAN (upload/wizard/API), inte genererings-/rendervägen.
 */
export function foreignTemplatesEnabled(): boolean {
  return process.env.BIDSMITH_FOREIGN_TEMPLATES === "on";
}
