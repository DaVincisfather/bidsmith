// evals/harness/core/compare-core.ts
import type { BidSection } from "@/lib/types";

// Sektioner producerade av MODELS.writing — det är bara dessa A/B-testet jämför.
// (team/requirement-matrix skrivs av writingSupport och är inte med i testet.)
export const WRITING_SECTION_KEYS = [
  "understanding-current", "understanding-assignment", "understanding-vision",
  "phases", "quality-assurance",
] as const;

// Rekursiv utplattning av section.content till judge-läsbar text — judgen ska
// bedöma prosa, inte JSON-syntax. (content.format plattas med; filtrera bort
// nyckeln här om stickprov i PR C visar att den stör judgen.)
function flatten(value: unknown, out: string[]): void {
  if (value === null || value === undefined) return;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    out.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) flatten(v, out);
    return;
  }
  if (typeof value === "object") {
    for (const v of Object.values(value)) flatten(v, out);
  }
}

export function renderSectionText(section: BidSection): string {
  const out: string[] = [section.title];
  flatten(section.content, out);
  return out.join("\n");
}

export interface SectionVerdict {
  sectionType: string;
  winner: "A" | "B" | "tie";
  motiveringar: string[];
}

export type WinTally = Record<string, { a: number; b: number; tie: number }>;

export function aggregateVerdicts(verdicts: SectionVerdict[]): WinTally {
  const tally: WinTally = {};
  for (const v of verdicts) {
    tally[v.sectionType] ??= { a: 0, b: 0, tie: 0 };
    if (v.winner === "A") tally[v.sectionType].a++;
    else if (v.winner === "B") tally[v.sectionType].b++;
    else tally[v.sectionType].tie++;
  }
  return tally;
}
