import path from "path";
import type { TemplateConfig } from "./types";

const TEMPLATES_DIR = path.resolve("templates");

const ANBUDSMALL_V2: TemplateConfig = {
  id: "anbudsmall-v2",
  templateFile: path.join(TEMPLATES_DIR, "anbudsmall-v2.pptx"),
  slides: [
    { source: 1,  type: "cover" },
    { source: 2,  type: "toc" },
    { source: 3,  type: "prose" },
    { source: 4,  type: "prose" },
    { source: 5,  type: "prose" },
    { source: 6,  type: "phases-overview", itemCaps: { phases: 4 } },
    { source: 7,  type: "phase-detail", cloneFrom: "phases",
      itemCaps: { activities: 4, deliverables: 3, decisions: 3 } },
    // Slides 8-10 are illustrative copies in the mockup — not rendered
    { source: 11, type: "quality-assurance" },
    { source: 12, type: "team-pricing" },
    { source: 13, type: "requirement-matrix" },
    { source: 14, type: "reference", cloneFrom: "references" },
    // Slide 15 is illustrative copy — not rendered
    { source: 16, type: "confidentiality" },
    { source: 17, type: "certifications" },
  ],
};

const REGISTRY: Record<string, TemplateConfig> = {
  "anbudsmall-v2": ANBUDSMALL_V2,
};

export function getTemplate(id: string): TemplateConfig {
  const cfg = REGISTRY[id];
  if (!cfg) throw new Error(`unknown template id: ${id}`);
  return cfg;
}

export function listTemplates(): TemplateConfig[] {
  return Object.values(REGISTRY);
}
