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

  const parsed = JSON.parse(jsonMatch[0]);
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
