// src/lib/pptx-template/manifest-types.ts
import { z } from "zod";
import { FieldBudgetsSchema } from "./budget-types";

// Måste spegla SlideType-unionen i types.ts — testas indirekt via
// identify-slides-testen som matchar mot registryts konfiguration.
export const SLIDE_TYPES = [
  "cover",
  "toc",
  "prose",
  "phases-overview",
  "phase-detail",
  "quality-assurance",
  "team-pricing",
  "requirement-matrix",
  "reference",
  "confidentiality",
  "certifications",
  // Ny i fas 2: token-fri slide med bilder — renderas passthrough (endast footer).
  // Läggs till i types.ts SlideType-unionen i Task 10.
  "static",
] as const;

export const PROSE_VARIANTS = ["kunden-idag", "uppdraget", "vision"] as const;
export type ProseVariant = (typeof PROSE_VARIANTS)[number];

export const ManifestSlideSchema = z
  .object({
    source: z.number().int().positive(),
    type: z.enum(SLIDE_TYPES),
    variant: z.enum(PROSE_VARIANTS).optional(),
    cloneFrom: z.enum(["phases", "references", "requirement-matrix"]).optional(),
    itemCaps: z.record(z.string(), z.number().int().positive()).optional(),
    placeholders: z.array(z.string()),
    imageShapes: z
      .object({
        placed: z.number().int().nonnegative(),
        placeholders: z.number().int().nonnegative(),
      })
      .optional(),
  })
  .refine((s) => s.variant === undefined || s.type === "prose", {
    message: "variant är endast giltig för type 'prose'",
    path: ["variant"],
  });

export const TemplateManifestSchema = z.object({
  manifestVersion: z.literal(1),
  name: z.string().min(1),
  slides: z.array(ManifestSlideSchema).min(1),
  budgets: FieldBudgetsSchema,
  fieldSlides: z.record(z.string(), z.number().int().positive()),
  excludedSlides: z.array(
    z.object({ source: z.number().int().positive(), reason: z.string() }),
  ),
});

export type ManifestSlide = z.infer<typeof ManifestSlideSchema>;
export type TemplateManifest = z.infer<typeof TemplateManifestSchema>;
