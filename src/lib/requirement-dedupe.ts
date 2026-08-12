import { trigramSimilarity } from "@/lib/text-similarity";

// Calibrated against the real near-dupe class: "…leverantör … samt prisbilaga"
// vs "…leverantören … och prisbilaga" measures 0.8636 — inflection + stopword
// variants of the same requirement. Dedupe additionally requires identical
// priority AND kind, which keeps the false-positive risk low at this level;
// eval:analyzer precision is the guard against over-collapsing.
const DUPLICATE_THRESHOLD = 0.85;

function normalized(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function digitTokens(s: string): string[] {
  return normalized(s).match(/\d+(?:\.\d+)*/g) ?? [];
}

function sameDigitTokens(a: string, b: string): boolean {
  const ta = digitTokens(a);
  const tb = digitTokens(b);
  if (ta.length !== tb.length) return false;
  return ta.every((token, i) => token === tb[i]);
}

/**
 * Deterministic near-exact dedupe of extracted requirements, keep-first.
 * Two rows are duplicates only when priority AND kind match and the
 * descriptions are identical after normalization or trigram-similar at or
 * above DUPLICATE_THRESHOLD — near-dupes that disagree on classification are
 * deliberately kept, because collapsing them would silently guess which
 * classification is right.
 * Runs BEFORE the evidence guard: the guard's write-back is index-aligned,
 * so the array must have its final shape before verification starts.
 */
export function dedupeRequirements<
  T extends { description: string; priority: string; kind?: string },
>(requirements: T[]): T[] {
  const kept: T[] = [];
  for (const candidate of requirements) {
    const isDupe = kept.some((existing) => {
      if (existing.priority !== candidate.priority) return false;
      if ((existing.kind ?? "qualification") !== (candidate.kind ?? "qualification")) return false;
      // Digit-reference boilerplate is a measured false-positive class: rows that
      // differ only in a numeric reference collapse at the trigram threshold —
      // "…bifoga ifylld och undertecknad bilaga 3…" vs "…bilaga 4…" measures
      // 0.9091, "…krav enligt avsnitt 3.2…" vs "…avsnitt 3.4…" measures 0.9592.
      // Both are must+qualification, so priority/kind don't protect. If the
      // digit-token sequences differ, these are different requirements — skip
      // both the equality and trigram checks. True duplicates that happen to
      // contain digits still have identical token arrays and still collapse.
      if (!sameDigitTokens(existing.description, candidate.description)) return false;
      const a = normalized(existing.description);
      const b = normalized(candidate.description);
      return a === b || trigramSimilarity(a, b) >= DUPLICATE_THRESHOLD;
    });
    if (!isDupe) kept.push(candidate);
  }
  return kept;
}
