import { RUNTIME_MANDATORY_SECTIONS } from "@/lib/eval/bid-structure";
import type { BidSection } from "@/lib/types";
import type { FailedUnit } from "@/lib/bundle-labels";

// Wait-state labels + owning bundle per mandatory v2 format. Titles are
// placeholders — once a section lands, its actual title is shown instead.
// "deterministic" units are built synchronously and never fail as a bundle.
const FORMAT_META: Record<string, { title: string; bundle: string }> = {
  cover: { title: "Framsida", bundle: "deterministic" },
  "understanding-current": { title: "Nuläge", bundle: "understanding" },
  "understanding-assignment": { title: "Uppdraget", bundle: "understanding" },
  "understanding-vision": { title: "Utmaningar och värde", bundle: "understanding" },
  phases: { title: "Genomförande", bundle: "phases" },
  "quality-assurance": { title: "Kvalitetssäkring", bundle: "quality" },
  "requirement-matrix-v2": { title: "Kravuppfyllnad", bundle: "requirement-matrix" },
  "team-pricing": { title: "Team och pris", bundle: "team" },
  "reference-v2": { title: "Referenser", bundle: "deterministic" },
  confidentiality: { title: "Sekretess", bundle: "deterministic" },
  certifications: { title: "Certifieringar", bundle: "deterministic" },
};

export type ChapterState = "landed" | "pending" | "failed";

export interface ChapterItem {
  /** section.key for landed chapters; `expected:${format}` for the rest. */
  key: string;
  title: string;
  state: ChapterState;
  section?: BidSection;
}

/**
 * Union of landed sections and expected chapters, in v2 document order.
 * Only meaningful while a bundle-path bid is generating; profile-path bids
 * (arbitrary generic-prose formats) fall through to landed-only entries.
 */
export function buildChapterList(
  sections: BidSection[],
  failedUnits: FailedUnit[],
): ChapterItem[] {
  const failedBundles = new Set(
    failedUnits
      .filter((f): f is Extract<FailedUnit, { bundle: string }> => "bundle" in f)
      .map((f) => f.bundle),
  );

  const byFormat = new Map<string, BidSection[]>();
  const extras: BidSection[] = [];
  for (const s of sections) {
    const format = s.content?.format;
    if (format && format in FORMAT_META) {
      const list = byFormat.get(format) ?? [];
      list.push(s);
      byFormat.set(format, list);
    } else {
      extras.push(s);
    }
  }

  const items: ChapterItem[] = [];
  for (const format of RUNTIME_MANDATORY_SECTIONS) {
    const landedSections = byFormat.get(format);
    if (landedSections) {
      for (const s of landedSections) {
        items.push({ key: s.key, title: s.title, state: "landed", section: s });
      }
      continue;
    }
    const meta = FORMAT_META[format];
    items.push({
      key: `expected:${format}`,
      title: meta.title,
      state: failedBundles.has(meta.bundle) ? "failed" : "pending",
    });
  }
  for (const s of extras) {
    items.push({ key: s.key, title: s.title, state: "landed", section: s });
  }
  return items;
}
