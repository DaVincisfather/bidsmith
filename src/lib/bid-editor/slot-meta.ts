import type { BidSection } from "@/lib/types";
import type { TemplateProfile } from "@/lib/pptx-template/template-profile";
import { isShortBudget } from "@/lib/bid-generator/short-field";

/**
 * Slot-metadata ur mallprofilen — byggs server-side på bid-sidan, konsumeras av
 * editorn (gruppering per slide, kortfältsfiltrering, intent-etiketter,
 * teckenräknare). Plain object: korsar server→client-propgränsen.
 * Design: notes/2026-07-15-bid-editor-slim-design.md.
 */
export interface SlotMetaEntry {
  slide: number;
  shortField: boolean;
  intent: string;
  budgetChars?: number;
}
export type SlotMeta = Record<string, SlotMetaEntry>;

export function buildSlotMeta(profile: TemplateProfile): SlotMeta {
  const meta: SlotMeta = {};
  for (const slide of profile.slides) {
    for (const slot of slide.slots) {
      if (slot.capability !== "generic-prose") continue;
      meta[slot.placeholder] = {
        slide: slide.source,
        shortField: isShortBudget(slot.budgetChars),
        intent: slot.intent,
        ...(slot.budgetChars !== undefined ? { budgetChars: slot.budgetChars } : {}),
      };
    }
  }
  return meta;
}

export interface SlideGroup {
  source: number;
  sections: BidSection[];
}

export interface GroupedSections {
  slides: SlideGroup[];
  /** Sektioner utan träff i metan (okänd placeholder, oväntat format, saknat
   *  content) — visas synligt sist under "Övriga rutor", döljs ALDRIG tyst. */
  other: BidSection[];
  /** Antal dolda kortfälts-sektioner (kvar i state, sparas och exporteras). */
  hiddenShortFields: number;
}

export function groupSectionsBySlide(
  sections: BidSection[],
  meta: SlotMeta,
): GroupedSections {
  const bySlide = new Map<number, BidSection[]>();
  const other: BidSection[] = [];
  let hiddenShortFields = 0;
  for (const section of sections) {
    const content = section.content;
    if (!content || content.format !== "generic-prose") {
      other.push(section);
      continue;
    }
    const entry = meta[content.placeholder];
    if (!entry) {
      other.push(section);
      continue;
    }
    if (entry.shortField) {
      hiddenShortFields += 1;
      continue;
    }
    const list = bySlide.get(entry.slide) ?? [];
    list.push(section);
    bySlide.set(entry.slide, list);
  }
  const slides = [...bySlide.entries()]
    .sort(([a], [b]) => a - b)
    .map(([source, secs]) => ({ source, sections: secs }));
  return { slides, other, hiddenShortFields };
}
