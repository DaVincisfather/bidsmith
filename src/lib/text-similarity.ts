/**
 * Character-trigram Jaccard similarity — the mechanical sibling-duplication
 * check from the budget-calibration design (2026-07-14). Deliberately simple:
 * it flags near-copies (the nine-"Om oss" failure), not paraphrase.
 */

function trigrams(text: string): Set<string> {
  const norm = text.toLowerCase().replace(/[^a-zåäöéü0-9]+/gi, " ").trim().replace(/\s+/g, " ");
  const out = new Set<string>();
  for (let i = 0; i + 3 <= norm.length; i++) out.add(norm.slice(i, i + 3));
  return out;
}

export function trigramSimilarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

export interface DuplicatePair {
  a: string;
  b: string;
  /** Raw Jaccard similarity (0–1), unrounded — consumers round for display only. */
  similarity: number;
}

export function duplicatePairs(
  items: { label: string; text: string }[],
  threshold = 0.5,
): DuplicatePair[] {
  const pairs: DuplicatePair[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const similarity = trigramSimilarity(items[i].text, items[j].text);
      if (similarity >= threshold) {
        pairs.push({ a: items[i].label, b: items[j].label, similarity });
      }
    }
  }
  return pairs.sort((x, y) => y.similarity - x.similarity);
}
