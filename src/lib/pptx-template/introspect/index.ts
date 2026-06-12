// src/lib/pptx-template/introspect/index.ts
import { readPptxSlides } from "./read-pptx";
import { identifySlides } from "./identify-slides";
import { computeBudgets } from "./compute-budgets";
import { TemplateManifestSchema, type TemplateManifest } from "../manifest-types";

export interface IntrospectionResult {
  manifest: TemplateManifest;
  warnings: string[];
}

export async function introspectTemplate(
  buffer: Buffer,
  name: string,
): Promise<IntrospectionResult> {
  const slides = await readPptxSlides(buffer);
  const { included, excluded } = identifySlides(slides);
  if (included.length === 0) {
    throw new Error(
      "ingen slide matchade någon känd signatur — följer mallen token-konventionen? Se docs/template-authoring.md",
    );
  }
  const { budgets, fieldSlides, warnings } = computeBudgets(slides, included);

  const manifest = TemplateManifestSchema.parse({
    manifestVersion: 1,
    name,
    slides: included,
    budgets,
    fieldSlides,
    excludedSlides: excluded,
  });
  return { manifest, warnings };
}
