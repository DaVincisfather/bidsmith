import type { FieldBudgets } from "@/lib/pptx-template/budget-types";

const FIELD_LABELS: Record<string, string> = {
  "phases[*].name": "phase name",
  "phases[*].period": "period",
  "phases[*].objective": "objective",
  "phases[*].activities[*]": "activities (each item)",
  "phases[*].deliverables[*]": "deliverables (each item)",
  "phases[*].decisions[*]": "decisions (each item)",
  "checkpoints[*]": "checkpoints (each item)",
  "certs[*].description": "cert descriptions (each item)",
};

export function renderBudgetTable(allBudgets: FieldBudgets, relevantKeys: string[]): string {
  const lines = relevantKeys
    .filter((k) => allBudgets[k] !== undefined)
    .map((k) => `- ${FIELD_LABELS[k] ?? k}: max ${allBudgets[k]} tecken`);
  if (lines.length === 0) return "";
  return `\n\nTEXT-LIMITS (max tecken):\n${lines.join("\n")}\nSkriv inom dessa gränser. Är ett område långt — komprimera, inte dela.`;
}
