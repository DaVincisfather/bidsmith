import { z } from "zod";
import { CAPABILITY_IDS } from "../template-profile";

/**
 * Onboarding-utkastet — det persisterade tillståndet mellan klassificering och
 * slutförande (templates.onboarding_draft, migration 012). Wizarden läser det,
 * varje slot-beslut PATCH:as in i det, complete bygger injektioner + slutprofil
 * ur det. Zod-validerat åt båda håll (spegling av profile-store-principen).
 *
 * Kolumnen bär även två icke-utkast-payloads som INTE valideras av detta schema:
 * { precount: { slides, candidates } } (satt av upload, läses av startsidan) och
 * { error: string } (satt när klassificeringsjobbet faller). Läsare kollar de
 * nycklarna före parseOnboardingDraft — och måste även tåla ett KORRUPT utkast
 * (objekt utan de nycklarna som ändå inte matchar schemat): parseOnboardingDraft
 * kastar ZodError, så route-läsare fångar och mappar till ett fel-payload i
 * st.f. att låta undantaget bli en icke-JSON-500.
 */

/** Samma kontrakt som instrumentTemplates interna validering. */
export const TOKEN_RE = /^\{[^{}]+\}$/;

export const DraftSlotSchema = z.object({
  /** Adressering — speglar ProposedSlot/TokenInjection exakt. */
  source: z.number().int().positive(),
  shapeIndex: z.number().int().nonnegative(),
  /** Shapens befintliga text — visas i panelen som kontext. */
  shapeText: z.string(),
  token: z.string().regex(TOKEN_RE),
  /** Klassificerarens förmåge-gissning — info-etikett i UI, INTE valbar i v1. */
  capability: z.enum(CAPABILITY_IDS),
  intent: z.string().max(500),
  confidence: z.enum(["high", "low"]),
  decision: z.enum(["confirmed", "skipped", "pending"]),
});
export type DraftSlot = z.infer<typeof DraftSlotSchema>;

export const WireframeShapeSchema = z.object({
  shapeIndex: z.number().int().nonnegative(),
  /** EMU ur readPptxSlides; null = ärvd geometri → kan inte placeras rumsligt. */
  geometry: z
    .object({ x: z.number(), y: z.number(), cx: z.number(), cy: z.number() })
    .nullable(),
  /** Trunkerat textutdrag för wireframe-etiketten. */
  text: z.string(),
  /** true = har en DraftSlot (klickbar i wireframen). */
  candidate: z.boolean(),
});
export type WireframeShape = z.infer<typeof WireframeShapeSchema>;

export const WireframeSlideSchema = z.object({
  source: z.number().int().positive(),
  shapes: z.array(WireframeShapeSchema),
});
export type WireframeSlide = z.infer<typeof WireframeSlideSchema>;

export const OnboardingDraftSchema = z.object({
  draftVersion: z.literal(1),
  /** Slide-yta i EMU (presentation.xml sldSz) — wireframens viewBox. */
  slideSize: z.object({
    cx: z.number().int().positive(),
    cy: z.number().int().positive(),
  }),
  slots: z.array(DraftSlotSchema),
  wireframe: z.array(WireframeSlideSchema).min(1),
});
export type OnboardingDraft = z.infer<typeof OnboardingDraftSchema>;

export function parseOnboardingDraft(raw: unknown): OnboardingDraft {
  return OnboardingDraftSchema.parse(raw);
}

export interface DraftPrecount {
  slides: number;
  candidates: number;
}

/** Plockar ut { precount } ur en rå onboarding_draft-kolumnvärde, om den bär en.
 *  Delad av propose-routen (bevara precount över CAS/klassificeringsfel) och
 *  GET-routens draftPayload (visa precount-raden bredvid ett klassificeringsfel). */
export function extractPrecount(raw: unknown): DraftPrecount | undefined {
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (obj.precount && typeof obj.precount === "object") {
      return obj.precount as DraftPrecount;
    }
  }
  return undefined;
}
