import type { SlideShapes } from "../introspect/read-pptx";
import type { TokenInjection } from "../instrument/instrument-template";
import type { ProposedSlot } from "./propose-injection-plan";
import {
  parseTemplateProfile,
  type TemplateProfile,
} from "../template-profile";
import {
  parseOnboardingDraft,
  TOKEN_RE,
  type OnboardingDraft,
  type DraftSlot,
} from "./draft";

/** Wireframe-etiketterna behöver bara igenkänning, inte hela texten. */
const WIREFRAME_TEXT_MAX = 120;

/**
 * Förslag → utkast: hög konfidens förbekräftas (användaren kan fortfarande
 * ändra), låg kräver ställningstagande. Wireframen byggs för ALLA slides
 * (även kandidat-lösa — de visas som statiska i navigeringen).
 */
export function buildDraft(
  slots: ProposedSlot[],
  slides: SlideShapes[],
  slideSize: { cx: number; cy: number },
): OnboardingDraft {
  const candidateKeys = new Set(slots.map((s) => `${s.source}:${s.shapeIndex}`));
  const draftSlots: DraftSlot[] = slots.map((s) => ({
    source: s.source,
    shapeIndex: s.shapeIndex,
    shapeText: s.shapeText,
    token: s.token,
    capability: s.capability,
    intent: s.intent.slice(0, 500),
    confidence: s.confidence,
    decision: s.confidence === "high" ? "confirmed" : "pending",
  }));
  const wireframe = slides.map((slide) => ({
    source: slide.source,
    shapes: slide.shapes.map((shape, shapeIndex) => ({
      shapeIndex,
      geometry: shape.geometry,
      text: shape.paragraphs.join(" ").slice(0, WIREFRAME_TEXT_MAX),
      candidate: candidateKeys.has(`${slide.source}:${shapeIndex}`),
    })),
  }));
  // Validera vår egen hopsättning — fail loud, spegling av proposeInjectionPlan.
  return parseOnboardingDraft({
    draftVersion: 1,
    slideSize,
    slots: draftSlots,
    wireframe,
  });
}

export interface SlotDecisionInput {
  source: number;
  shapeIndex: number;
  decision: "confirmed" | "skipped" | "pending";
  token?: string;
  intent?: string;
}

type ApplyResult =
  | { ok: true; draft: OnboardingDraft }
  | { ok: false; error: string };

/**
 * Ett slot-beslut in i utkastet — ren funktion (muterar inte input) så den kan
 * enhetstestas och återanvändas optimistiskt i UI:t. Validerar adress,
 * tokenformat (instrumentTemplates kontrakt) och token-unikhet över planen
 * (kollision → två shapes fylls med samma innehåll, tyst och svårfelsökt).
 */
export function applyDecision(
  draft: OnboardingDraft,
  input: SlotDecisionInput,
): ApplyResult {
  const idx = draft.slots.findIndex(
    (s) => s.source === input.source && s.shapeIndex === input.shapeIndex,
  );
  if (idx === -1) {
    return { ok: false, error: `okänd slot ${input.source}:${input.shapeIndex}` };
  }
  const token = input.token ?? draft.slots[idx].token;
  if (!TOKEN_RE.test(token)) {
    return { ok: false, error: `ogiltigt tokenformat: ${token}` };
  }
  const collision = draft.slots.some(
    (s, i) => i !== idx && s.token === token,
  );
  if (collision) {
    return { ok: false, error: `token ${token} används redan av en annan textruta` };
  }
  const slots = draft.slots.map((s, i) =>
    i === idx
      ? {
          ...s,
          decision: input.decision,
          token,
          intent: (input.intent ?? s.intent).slice(0, 500),
        }
      : s,
  );
  return { ok: true, draft: { ...draft, slots } };
}

/** Endast bekräftade slots instrumenteras — skippade lämnas orörda i kopian. */
export function buildInjections(draft: OnboardingDraft): TokenInjection[] {
  return draft.slots
    .filter((s) => s.decision === "confirmed")
    .map((s) => ({ source: s.source, shapeIndex: s.shapeIndex, token: s.token }));
}

/**
 * Slutprofilen: en SlideProfile per wireframe-slide (ALLA slides — en utelämnad
 * slide försvinner ur renderade anbud, se proposeInjectionPlan). Bekräftade
 * slots → generic-prose (v1-beslutet: specialiserade applikatorer kräver våra
 * kanoniska tokens); slides utan bekräftade slots → static passthrough.
 */
export function buildFinalProfile(
  draft: OnboardingDraft,
  meta: { templateId: string; name: string; version: number },
): TemplateProfile {
  const confirmed = draft.slots.filter((s) => s.decision === "confirmed");
  if (confirmed.length === 0) {
    throw new Error("minst en textruta måste bekräftas");
  }
  const slides = draft.wireframe.map((slide) => {
    const slideSlots = confirmed
      .filter((s) => s.source === slide.source)
      .map((s) => ({
        placeholder: s.token,
        capability: "generic-prose" as const,
        format: "prose" as const,
        intent: s.intent,
        status: "generic" as const,
      }));
    return slideSlots.length === 0
      ? { source: slide.source, capability: "static" as const, slots: [] }
      : { source: slide.source, capability: "generic-prose" as const, slots: slideSlots };
  });
  return parseTemplateProfile({
    profileVersion: 1,
    templateId: meta.templateId,
    name: meta.name,
    version: meta.version,
    slides,
  });
}
