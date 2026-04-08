import Anthropic from "@anthropic-ai/sdk";
import {
  RfpAnalysis,
  Consultant,
  ScoredConsultant,
  GoNoGoResult,
  BidSection,
  BidSectionContent,
} from "./types";
import { BidContext, getSectionPrompt, AI_SECTION_KEYS } from "./bid-section-prompts";
import { AI_SECTION_SCHEMAS } from "./ai-schemas";

// Lazy-initialized to avoid instantiation in browser-like test environments.
// AI generation functions (Task 4) will call getClient() when needed.
let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

// --- Data-driven section builders ---

export function buildCoverSection(analysis: RfpAnalysis): BidSection {
  return {
    type: "data",
    key: "cover",
    title: "Framsida",
    content: {
      format: "cover",
      title: analysis.title,
      client: analysis.client,
      date: new Date().toISOString().split("T")[0],
    },
    generatedAt: new Date().toISOString(),
  };
}

export function buildTocSection(allSections: BidSection[]): BidSection {
  const items = allSections
    .filter((s) => s.key !== "cover" && s.key !== "toc")
    .map((s) => s.title);

  return {
    type: "data",
    key: "toc",
    title: "Innehållsförteckning",
    content: { format: "bullets", items },
    generatedAt: new Date().toISOString(),
  };
}

export function buildRequirementMatrix(
  analysis: RfpAnalysis,
  team: Consultant[]
): BidSection {
  const rows = analysis.requirements.map((req) => {
    const coverage: Record<string, boolean> = {};
    for (const c of team) {
      const competencies = c.competencies.map((co) =>
        co.competency.toLowerCase()
      );
      const refTexts = c.references.map(
        (r) => `${r.title} ${r.description ?? ""}`.toLowerCase()
      );
      const allText = [...competencies, ...refTexts].join(" ");
      const keywords = req.description.toLowerCase().split(/\s+/);
      coverage[c.id] = keywords.some(
        (kw) => kw.length > 3 && allText.includes(kw)
      );
    }
    return {
      requirement: req.description,
      priority: req.priority,
      coverage,
    };
  });

  const consultantNames: Record<string, string> = {};
  for (const c of team) {
    consultantNames[c.id] = c.name;
  }

  return {
    type: "data",
    key: "requirement-matrix",
    title: "Kravmatris",
    content: { format: "requirement-matrix", rows, consultantNames },
    generatedAt: new Date().toISOString(),
  };
}

export function buildPlaceholderSection(
  key: string,
  title: string,
  instruction: string
): BidSection {
  return {
    type: "placeholder",
    key,
    title,
    content: { format: "placeholder", instruction },
    generatedAt: new Date().toISOString(),
  };
}

// --- AI section builders ---

const SECTION_TITLES: Record<string, string> = {
  understanding: "Uppdragsförståelse",
  "value-proposition": "Identifierat värde",
  "execution-plan": "Genomförandeplan",
  quality: "Kvalitetssäkring och samverkan",
  risks: "Risker och hantering",
  team: "Teamet",
  references: "Referensuppdrag",
  summary: "Sammanfattning — Varför oss",
};

const SECTION_FORMAT: Record<string, BidSectionContent["format"]> = {
  understanding: "prose",
  "value-proposition": "bullets",
  "execution-plan": "phases",
  quality: "prose",
  risks: "bullets",
  team: "team",
  references: "references",
  summary: "prose",
};

export async function generateAiSection(
  key: string,
  ctx: BidContext
): Promise<BidSection> {
  const prompt = getSectionPrompt(key);
  if (!prompt) {
    throw new Error(`Unknown AI section key: ${key}`);
  }

  const message = await getClient().messages.create({
    model: "claude-opus-4-6",
    max_tokens: 4000,
    system: prompt.system,
    messages: [{ role: "user", content: prompt.user(ctx) }],
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error(`Unexpected response type for section ${key}`);
  }

  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`No JSON found in response for section ${key}`);
  }

  const rawParsed = JSON.parse(jsonMatch[0]);

  const schema = AI_SECTION_SCHEMAS[key];
  if (schema) {
    const validated = schema.safeParse(rawParsed);
    if (!validated.success) {
      throw new Error(`Invalid AI response for section ${key}: ${validated.error.message}`);
    }
  }

  const parsed = rawParsed;
  const format = SECTION_FORMAT[key];

  let sectionContent: BidSectionContent;
  switch (format) {
    case "prose":
      sectionContent = { format: "prose", text: parsed.text };
      break;
    case "bullets":
      sectionContent = { format: "bullets", items: parsed.items };
      break;
    case "phases":
      sectionContent = { format: "phases", phases: parsed.phases };
      break;
    case "team":
      sectionContent = { format: "team", members: parsed.members };
      break;
    case "references":
      sectionContent = { format: "references", references: parsed.references };
      break;
    default:
      throw new Error(`Unsupported format for section ${key}: ${format}`);
  }

  return {
    type: "ai",
    key,
    title: SECTION_TITLES[key] ?? key,
    content: sectionContent,
    generatedAt: new Date().toISOString(),
  };
}

// --- Orchestrator ---

const PLACEHOLDER_SECTIONS = [
  { key: "pricing", title: "Pris & omfattning", instruction: "Fyll i er prisbild, timmar och eventuella förbehåll." },
  { key: "confidentiality", title: "Sekretess & certifieringar", instruction: "Lägg till era standardslides om anbudssekretess, ISO-certifieringar och kvalitetsarbete." },
  { key: "contact", title: "Kontakt", instruction: "Lägg till kontaktuppgifter för ansvarig säljare och uppdragsledare." },
];

const SECTION_ORDER = [
  "cover",
  "toc",
  "understanding",
  "value-proposition",
  "execution-plan",
  "quality",
  "risks",
  "team",
  "requirement-matrix",
  "references",
  "summary",
  "pricing",
  "confidentiality",
  "contact",
];

export async function generateAllSections(
  ctx: BidContext,
  onSectionComplete?: (section: BidSection) => void
): Promise<{ sections: BidSection[] }> {
  const sectionsMap = new Map<string, BidSection>();

  // 1. Cover (data-driven)
  const cover = buildCoverSection(ctx.analysis);
  sectionsMap.set("cover", cover);
  onSectionComplete?.(cover);

  // 2. AI sections (sequential — each saved after completion)
  for (const key of AI_SECTION_KEYS) {
    const section = await generateAiSection(key, ctx);
    sectionsMap.set(key, section);
    onSectionComplete?.(section);
  }

  // 3. Requirement matrix (data-driven)
  const matrix = buildRequirementMatrix(ctx.analysis, ctx.teamConsultants);
  sectionsMap.set("requirement-matrix", matrix);
  onSectionComplete?.(matrix);

  // 4. Placeholders
  for (const ph of PLACEHOLDER_SECTIONS) {
    const section = buildPlaceholderSection(ph.key, ph.title, ph.instruction);
    sectionsMap.set(ph.key, section);
    onSectionComplete?.(section);
  }

  // 5. TOC (needs all other sections)
  const allExceptToc = SECTION_ORDER.filter((k) => k !== "toc")
    .map((k) => sectionsMap.get(k)!)
    .filter(Boolean);
  const toc = buildTocSection(allExceptToc);
  sectionsMap.set("toc", toc);

  // Assemble in order
  const sections = SECTION_ORDER.map((k) => sectionsMap.get(k)!).filter(Boolean);

  return { sections };
}
