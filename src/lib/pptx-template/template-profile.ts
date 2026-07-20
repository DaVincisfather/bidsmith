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
  /** Geometry says the box holds exactly one line (a kicker/label): any wrap is
   *  an overflow, so generation enforces the scaled ask mechanically. Set by
   *  calibration (or the backfill script); omitted = multi-line/unknown. */
  singleLine: z.boolean().optional(),
  /** How onboarding resolved this slot: a known capability (mapped), the
   *  generic generator (generic), or intentionally left blank (skip). */
  status: z.enum(SLOT_STATUSES),
});
export type SlotProfile = z.infer<typeof SlotProfileSchema>;

/** A template's own defect, found by the empty-substrate measurement scan
 *  (onboarding-measure design 2026-07-19). Signature = slide + checkId + shape
 *  — same identity as the overflow-eval's KnownDefect. checkId is a plain
 *  string (CheckId | "gross-overflow") to keep the profile schema decoupled
 *  from the measure module. */
/** Fixed roles a column in a foreign a:tbl requirement-matrix table can play —
 *  see notes/2026-07-19-foreign-table-matrix design. "ignorera" marks a column
 *  the row engine must skip (e.g. a customer's own running-number column). */
export const TABLE_COLUMN_ROLES = ["krav", "uppfyllnad", "referens", "status", "ignorera"] as const;
export type TableColumnRole = (typeof TABLE_COLUMN_ROLES)[number];

/** Maps ONE foreign a:tbl table (read into SlideShapes.tables by the pptx
 *  reader, slice 1) to how the requirement-matrix row engine fills it:
 *  which table on the slide (frameIndex, when a slide has more than one),
 *  how many header rows to skip, which row is the reusable template row to
 *  clone per requirement, and each remaining column's fixed role. */
export const TableMapSchema = z.object({
  frameIndex: z.number().int().nonnegative(),
  headerRows: z.number().int().nonnegative(),
  templateRowIndex: z.number().int().nonnegative(),
  columns: z.array(z.enum(TABLE_COLUMN_ROLES)).min(1),
});
export type TableMap = z.infer<typeof TableMapSchema>;

export const TemplateDefectSchema = z.object({
  slide: z.number().int().positive(),
  checkId: z.string().min(1),
  shape: z.string().min(1),
  note: z.string(),
  baselineBoundHeightPt: z.number().optional(),
  /** Generated operator guidance ("bredda boxen ...") shown in the wizard. */
  suggestion: z.string(),
  /** "open" blocks activation; "accepted" is annotated (not alarmed) in scans. */
  status: z.enum(["open", "accepted"]),
});
export type TemplateDefect = z.infer<typeof TemplateDefectSchema>;

/** Written ONLY on a successful measurement pass (atomic save at the end) —
 *  its presence IS the "measured" state; activation gates on it. */
export const TemplateMeasurementSchema = z.object({
  status: z.literal("complete"),
  measuredAt: z.string().min(1),
  calibrationRounds: z.number().int().nonnegative(),
  /** Tokens that froze on geometry fallback (never measured). */
  unresolved: z.array(z.string()),
  /** token → calibration warnings; informational only, never gates. */
  slotWarnings: z.record(z.string(), z.array(z.string())),
});
export type TemplateMeasurement = z.infer<typeof TemplateMeasurementSchema>;

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
  /** Set when this slide's requirement-matrix content lives in a foreign
   *  a:tbl table (as opposed to our own cloneFrom row-per-slide layout) —
   *  see TableMapSchema. Absent for every other slide/capability. */
  tableMap: TableMapSchema.optional(),
});
export type SlideProfile = z.infer<typeof SlideProfileSchema>;

export const TemplateProfileSchema = z.object({
  profileVersion: z.literal(1),
  /** FK to templates.id (the uploaded template this profile describes). */
  templateId: z.string().min(1),
  name: z.string().min(1),
  version: z.number().int().positive(),
  slides: z.array(SlideProfileSchema).min(1),
  measurement: TemplateMeasurementSchema.optional(),
  knownDefects: z.array(TemplateDefectSchema).optional(),
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

/**
 * Routing predicate (foreign-table-matrix design, slice 2): true for every
 * profile that must route down the FOREIGN path — a pure generic/static
 * profile (isAllGenericProfile, the pre-existing signature) OR one that
 * additionally carries a requirement-matrix slide mapped to a foreign a:tbl
 * table (capability "requirement-matrix" WITH tableMap set). A
 * requirement-matrix slide WITHOUT tableMap is OUR bundled template's own
 * cloneFrom matrix layout, so it fails the predicate and keeps routing down
 * the type-driven path — same as isAllGenericProfile always did for it.
 * This is the seam every routing/export/editor/activation call site must use
 * instead of isAllGenericProfile going forward (that predicate stays exported
 * — used internally here, and by anything that specifically needs the
 * pure-generic signature).
 */
export function isForeignProfile(profile: TemplateProfile): boolean {
  if (isAllGenericProfile(profile)) return true;
  return profile.slides.every(
    (s) =>
      s.capability === "generic-prose" ||
      s.capability === "static" ||
      (s.capability === "requirement-matrix" && s.tableMap !== undefined),
  );
}

/** True when the profile has a requirement-matrix slide mapped to a foreign
 *  a:tbl table. Defined alongside isForeignProfile since both read the same
 *  tableMap signal; the row engine (slice 5+) uses this to pick the foreign
 *  table-fill path over the cloneFrom row-per-slide layout. */
export function hasMappedTable(profile: TemplateProfile): boolean {
  return profile.slides.some(
    (s) => s.capability === "requirement-matrix" && s.tableMap !== undefined,
  );
}
