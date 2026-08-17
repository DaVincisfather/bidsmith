import type { TemplateProfile } from "@/lib/pptx-template/template-profile";
import { isShortBudget } from "@/lib/bid-generator/short-field";

/**
 * Slot-metadata ur mallprofilen — konsumeras av overflow-evalen
 * (scripts/overflow-eval.ts + lib/overflow-eval/text-metrics: kortfältsklassning,
 * budget per placeholder). Editorn slutade konsumera metan i MD-first-ombyggnaden
 * (#102). Ursprungsdesign: notes/2026-07-15-bid-editor-slim-design.md.
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
