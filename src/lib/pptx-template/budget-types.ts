import { z } from "zod";

export const FieldBudgetsSchema = z.record(z.string(), z.number().int().positive());

export type FieldBudgets = z.infer<typeof FieldBudgetsSchema>;

export interface BudgetPlan {
  budgets: FieldBudgets;
  /** fältsökväg → 1-indexerad deck-slide (ur manifestet; ersätter FIELD_METADATA.slide) */
  fieldSlides: Record<string, number>;
}

export const OverflowFlagSchema = z.object({
  slide: z.number().int().nonnegative(),
  fieldPath: z.string(),
  fieldLabel: z.string(),
  length: z.number().int().nonnegative(),
  budget: z.number().int().positive(),
});

export type OverflowFlag = z.infer<typeof OverflowFlagSchema>;

// Redaktionella tak per fält (fältsemantik, gäller ALLA mallar). ENDA sanningskällan
// för taken — BUDGET_TOKENS i compute-budgets.ts refererar hit. Ligger här (inga
// server-deps) så både budgetmotorn och klient-UI:t kan läsa dem.
export const EDITORIAL_CAPS: Record<string, number> = {
  "phases[*].name": 40,
  "phases[*].period": 10,
  "phases[*].objective": 120,
  "phases[*].activities[*]": 120,
  "phases[*].deliverables[*]": 100,
  "phases[*].decisions[*]": 100,
  "checkpoints[*]": 80,
  "certs[*].description": 80,
  "rows[*].requirement": 160,
  "rows[*].hurUppfylls": 160,
  "rows[*].referens": 70,
  "members[*].role": 60,
};

// Läsbara fält-etiketter för mall-upload-vyn (fältnivå, utan {N}-numrering).
const FIELD_DISPLAY_LABELS: Record<string, string> = {
  "phases[*].name": "Fas – Namn",
  "phases[*].period": "Fas – Period",
  "phases[*].objective": "Fas – Mål",
  "phases[*].activities[*]": "Fas – Aktivitet",
  "phases[*].deliverables[*]": "Fas – Leverabel",
  "phases[*].decisions[*]": "Fas – Beslut",
  "checkpoints[*]": "Avstämningspunkt",
  "certs[*].description": "Cert – Beskrivning",
  "rows[*].requirement": "Ska-krav",
  "rows[*].hurUppfylls": "Ska-krav – Uppfyllnad",
  "rows[*].referens": "Ska-krav – Referens",
  "members[*].role": "Team – Roll",
};

/** Läsbar etikett för ett budgetfält; okänd väg → vägen själv (fallback). */
export function fieldDisplayLabel(fieldPath: string): string {
  return FIELD_DISPLAY_LABELS[fieldPath] ?? fieldPath;
}

// Ett fält är "trångt" när mallens ruta tvingar budgeten under detta förhållande av
// det redaktionella taket. 0.9 speglar ±10 %-kalibreringstoleransen, så en bundlad
// mall inom toleransen (t.ex. activities 115/120) inte flaggas som falsklarm.
export const TIGHT_RATIO = 0.9;

export interface TightField {
  fieldPath: string;
  budget: number;
  editorialCap: number;
}

/**
 * Fält vars budget klämts trångt av mallens geometri (budget < TIGHT_RATIO × tak).
 * Fält utan känt tak ignoreras; editorialOnly-fält (budget = tak) blir aldrig trånga.
 */
export function tightBudgetFields(budgets: FieldBudgets): TightField[] {
  const tight: TightField[] = [];
  for (const [fieldPath, budget] of Object.entries(budgets)) {
    const editorialCap = EDITORIAL_CAPS[fieldPath];
    if (editorialCap === undefined) continue;
    if (budget < TIGHT_RATIO * editorialCap) {
      tight.push({ fieldPath, budget, editorialCap });
    }
  }
  return tight;
}
