import { duplicatePairs } from "@/lib/text-similarity";
import { DUP_PAIR_THRESHOLD } from "./gates";
import type { DuplicatePair, FillEntry } from "./types";
import type { SlotMeta } from "@/lib/bid-editor/slot-meta";
import type { BidSection } from "@/lib/types";

/** Same minimum text length as scripts/check-deck-duplication.ts (deck:dupes)
 *  — duplicated deliberately: that script has no importable module boundary
 *  for CLI use, so the constant is mirrored here rather than shared. */
const MIN_TEXT_CHARS = 120;

/** Duplicate pairs among generic-prose sections, grouped per slide (from
 *  meta) and filtered to the gates.ts DUP_PAIR_THRESHOLD (0.3) — the metric
 *  reports all pairs at/above that bar, gates.ts decides whether they fail. */
export function collectDuplicates(sections: BidSection[], meta: SlotMeta): DuplicatePair[] {
  const bySlide = new Map<number, { label: string; text: string }[]>();
  for (const section of sections) {
    const content = section.content;
    if (!content || content.format !== "generic-prose") continue;
    const entry = meta[content.placeholder];
    if (!entry) continue;
    if (content.text.length < MIN_TEXT_CHARS) continue;
    const items = bySlide.get(entry.slide) ?? [];
    items.push({ label: content.placeholder, text: content.text });
    bySlide.set(entry.slide, items);
  }

  const pairs: DuplicatePair[] = [];
  for (const [slide, items] of bySlide) {
    for (const p of duplicatePairs(items, DUP_PAIR_THRESHOLD)) {
      pairs.push({ a: p.a, b: p.b, slide, similarity: p.similarity });
    }
  }
  return pairs;
}

/** Slots whose intent explicitly sanctions emptiness are exempt from fill
 *  measurement: near-empty is the slot's CORRECT state per the profile's own
 *  declaration, not loop-starved text (beslut B,
 *  notes/2026-07-16-overflow-loop-slutrapport.md — {Sektionsnummer 3}:
 *  "Lämnas tom för generation, vi fyller på med referensuppdrag" min-fill-bröt
 *  4–5/5 per varv trots att tomhet är avsett). Matchar profilens eget språk. */
export const EMPTY_SANCTIONED_INTENT = /lämnas tom/i;

/** Fill ratio (text/budget) for prose boxes only — short fields (e.g. a
 *  diary number), slots with no meaningful budget (<= 80 chars) and slots
 *  whose intent sanctions emptiness are excluded, matching the bid-editor's
 *  own short-field filtering. */
export function collectFill(sections: BidSection[], meta: SlotMeta): FillEntry[] {
  const entries: FillEntry[] = [];
  for (const section of sections) {
    const content = section.content;
    if (!content || content.format !== "generic-prose") continue;
    const entry = meta[content.placeholder];
    if (!entry || entry.shortField) continue;
    if (EMPTY_SANCTIONED_INTENT.test(entry.intent)) continue;
    const budgetChars = entry.budgetChars;
    if (budgetChars === undefined || budgetChars <= 80) continue;
    const textChars = content.text.length;
    entries.push({ placeholder: content.placeholder, budgetChars, textChars, ratio: textChars / budgetChars });
  }
  return entries;
}

/** Total generated prose volume across all generic-prose sections. */
export function totalProseChars(sections: BidSection[]): number {
  let total = 0;
  for (const section of sections) {
    const content = section.content;
    if (content && content.format === "generic-prose") total += content.text.length;
  }
  return total;
}
