import { z } from "zod";

/**
 * Template profile — the durable, editable artifact produced ONCE when a
 * customer uploads their own bid template. It maps every fillable slot in the
 * template to HOW it should be filled (which content capability, what shape,
 * what it's for, how much fits), so per-bid rendering is deterministic against
 * the profile instead of re-understanding an arbitrary template every time.
 *
 * See notes/2026-07-02-template-upload-architecture.md. This is slice 1: the
 * schema + storage only. Introspection/auto-classification (slice 2) and the
 * profile-driven renderer (slice 3) build on this datamodel.
 */

/**
 * Content-generation capability that fills a slot. Stable ids map today's
 * specialised bundles; "generic-prose" is the fallback for a section we have no
 * specialised generator for; "static" is a passthrough (branding/images, footer
 * only). Extend this list as new capabilities land — it is the seam between the
 * template's slots and the generation engine.
 */
export const CAPABILITY_IDS = [
  "cover", // bid metadata (title/client/date/diary)
  "toc", // auto table of contents
  "understanding", // our take on the assignment (prose)
  "execution-plan", // phases / genomförandeplan
  "quality-assurance", // QA process + checkpoints
  "team-pricing", // team & pris table
  "requirement-matrix", // kravmatris (coverage roll-up)
  "go-no-go", // go/no-go assessment
  "references", // referensuppdrag
  "secrecy", // OSL / sekretess
  "certifications", // certifieringar
  "generic-prose", // fallback: LLM prose for an unknown section
  "static", // passthrough — footer only, no generated content
] as const;
export type CapabilityId = (typeof CAPABILITY_IDS)[number];

/** How a slot's content is shaped into the slide. */
export const SLOT_FORMATS = ["prose", "bullets", "table-rows", "field"] as const;
export type SlotFormat = (typeof SLOT_FORMATS)[number];

/** How template onboarding resolved a slot. */
export const SLOT_STATUSES = ["mapped", "generic", "skip"] as const;
export type SlotStatus = (typeof SLOT_STATUSES)[number];

export const SlotProfileSchema = z.object({
  /** The pptx placeholder token this slot fills, e.g. "{Vår metod}". */
  placeholder: z.string().min(1),
  /** Which generation capability produces this slot's content. */
  capability: z.enum(CAPABILITY_IDS),
  /** The shape the content is rendered in. */
  format: z.enum(SLOT_FORMATS),
  /** Derived/confirmed purpose of the slot, fed to the generic generator when
   *  the capability is generic-prose. Empty for fully-specialised slots. */
  intent: z.string(),
  /** Character budget from the slot geometry (compute-budgets), when known. */
  budgetChars: z.number().int().positive().optional(),
  /** How onboarding resolved this slot: a known capability (mapped), the
   *  generic generator (generic), or intentionally left blank (skip). */
  status: z.enum(SLOT_STATUSES),
});
export type SlotProfile = z.infer<typeof SlotProfileSchema>;

export const SlideProfileSchema = z.object({
  /** Slide index in the source pptx (1-based). */
  source: z.number().int().positive(),
  /** The slide's primary capability. Set for whole-slide/auto capabilities that
   *  have no fillable content slots (e.g. toc, a static passthrough); content
   *  slides carry the capability per slot instead (a slide may mix capabilities). */
  capability: z.enum(CAPABILITY_IDS).optional(),
  slots: z.array(SlotProfileSchema),
  /** Set when the slide is repeated once per item of a capability's data
   *  (e.g. one slide per phase / per reference / per matrix page). */
  cloneFrom: z.enum(CAPABILITY_IDS).optional(),
  /** Content selector when several slides share one capability but fill from
   *  different data (our template: prose variant kunden-idag/uppdraget/vision).
   *  Free-form so arbitrary templates can carry their own discriminator. */
  variant: z.string().min(1).optional(),
});
export type SlideProfile = z.infer<typeof SlideProfileSchema>;

export const TemplateProfileSchema = z.object({
  profileVersion: z.literal(1),
  /** FK to templates.id (the uploaded template this profile describes). */
  templateId: z.string().min(1),
  name: z.string().min(1),
  version: z.number().int().positive(),
  slides: z.array(SlideProfileSchema).min(1),
});
export type TemplateProfile = z.infer<typeof TemplateProfileSchema>;

/** Parses + validates a stored profile (jsonb from template_profiles.profile). */
export function parseTemplateProfile(raw: unknown): TemplateProfile {
  return TemplateProfileSchema.parse(raw);
}

/**
 * Routing discriminator: true when EVERY slide's capability is generic-prose or
 * static — the signature of a FOREIGN template onboarded via the proposal layer,
 * which deliberately maps every slot to generic-prose fill (see
 * onboarding/propose-injection-plan.ts). OUR own template's derived profile
 * carries specialised slide capabilities (cover/understanding/…), so it returns
 * false. This is the seam that sends a foreign template down the profile-driven
 * generation + render path (its near-empty manifest can't drive the type path),
 * while OUR template keeps the type-driven bundle path. A slide with no
 * capability set returns false (routes to the type path — the safe default).
 */
export function isAllGenericProfile(profile: TemplateProfile): boolean {
  return profile.slides.every(
    (s) => s.capability === "generic-prose" || s.capability === "static",
  );
}
