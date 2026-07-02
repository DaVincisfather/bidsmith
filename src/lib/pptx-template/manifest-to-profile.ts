import type { SlideType } from "./types";
import type { TemplateManifest } from "./manifest-types";
import type { CapabilityId, SlotFormat, TemplateProfile } from "./template-profile";

/**
 * Slice 2 of template upload: derive a TemplateProfile from a template's
 * manifest by mapping each slide's type to a content capability. This is the
 * deterministic backbone for OUR own template — an arbitrary customer template
 * will reach the same profile shape via LLM auto-classification + an onboarding
 * interview (later slices). See notes/2026-07-02-template-upload-architecture.md.
 */

// OUR known slide types → content capabilities.
const SLIDE_TYPE_TO_CAPABILITY: Record<SlideType, CapabilityId> = {
  cover: "cover",
  toc: "toc",
  prose: "understanding",
  "phases-overview": "execution-plan",
  "phase-detail": "execution-plan",
  "quality-assurance": "quality-assurance",
  "team-pricing": "team-pricing",
  "requirement-matrix": "requirement-matrix",
  reference: "references",
  confidentiality: "secrecy",
  certifications: "certifications",
  static: "static",
};

// Manifest cloneFrom keys → the capability whose data drives the repeat.
const CLONE_TO_CAPABILITY: Record<string, CapabilityId> = {
  phases: "execution-plan",
  references: "references",
  "requirement-matrix": "requirement-matrix",
};

// Primary render shape per capability. Approximate — refined per-slot when the
// profile-driven renderer lands (slice 3); the capability is the load-bearing
// classification here.
const CAPABILITY_DEFAULT_FORMAT: Record<CapabilityId, SlotFormat> = {
  cover: "field",
  toc: "field",
  understanding: "prose",
  "execution-plan": "bullets",
  "quality-assurance": "prose",
  "team-pricing": "table-rows",
  "requirement-matrix": "table-rows",
  "go-no-go": "prose",
  references: "field",
  secrecy: "table-rows",
  certifications: "field",
  "generic-prose": "prose",
  static: "field",
};

// Footer tokens appear on every slide and are filled deterministically by the
// footer applicator, not by a content capability — excluded from slot profiles.
const FOOTER_TOKENS = new Set(["{Bolagsnamn}", "{Diarienummer}"]);

export function manifestToProfile(
  manifest: TemplateManifest,
  opts: { templateId: string; version?: number },
): TemplateProfile {
  const slides = manifest.slides.map((s) => {
    const capability = SLIDE_TYPE_TO_CAPABILITY[s.type];
    const format = CAPABILITY_DEFAULT_FORMAT[capability];
    const slots = s.placeholders
      .filter((p) => !FOOTER_TOKENS.has(p))
      .map((placeholder) => ({
        placeholder,
        capability,
        format,
        intent: "",
        status: "mapped" as const,
      }));
    const cloneFrom = s.cloneFrom
      ? CLONE_TO_CAPABILITY[s.cloneFrom]
      : undefined;
    return {
      source: s.source,
      capability,
      slots,
      ...(cloneFrom ? { cloneFrom } : {}),
    };
  });

  return {
    profileVersion: 1,
    templateId: opts.templateId,
    name: manifest.name,
    version: opts.version ?? 1,
    slides,
  };
}
