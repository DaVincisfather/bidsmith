import {
  RfpAnalysis,
  Consultant,
  BidSection,
} from "./types";
import { BidContext, FORMAT_PROMPTS } from "./bid-section-prompts";
import { FORMAT_SCHEMAS } from "./ai-schemas";
import { callClaude } from "./ai-client";
import type { PlannedSection } from "./bid-planner";
import { planBidOrFallback } from "./bid-planner";
import type { BidPlan } from "./bid-planner";
import { validateAndRepair } from "./bid-plan-validator";

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

// Swedish stop words that match too broadly in keyword matching
const STOP_WORDS = new Set([
  "alla", "andra", "arbete", "även", "bara", "behov", "bild", "både",
  "denna", "dessa", "dock", "efter", "eller", "finns", "från", "föra",
  "före", "genom", "gäller", "hade", "hade", "hela", "inte", "inom",
  "krav", "kunna", "många", "måste", "möjlig", "nära", "några", "också",
  "samt", "sedan", "sina", "skall", "skapa", "stor", "till", "under",
  "uppd", "vara", "vill", "visa", "värd", "över",
]);

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
        (kw) => kw.length > 4 && !STOP_WORDS.has(kw) && allText.includes(kw)
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

// --- buildSection dispatcher (new architecture) ---

export async function buildSection(
  planned: PlannedSection,
  ctx: BidContext
): Promise<BidSection> {
  switch (planned.kind) {
    case "cover":
      return buildCoverSection(ctx.analysis);

    case "divider":
      return buildDividerFromPlan(planned);

    case "placeholder":
      return buildPlaceholderFromPlan(planned);

    case "requirement-matrix":
      return buildRequirementMatrixFromPlan(planned, ctx);

    case "prose":
      return buildProseViaAi(planned, ctx);

    case "bullets":
      return buildBulletsViaAi(planned, ctx);

    case "three-column":
      return buildThreeColumnViaAi(planned, ctx);

    case "phases":
      return buildPhasesViaAi(planned, ctx);

    case "team":
      return buildTeamViaAi(planned, ctx);

    case "references":
      return buildReferencesViaAi(planned, ctx);

    case "toc":
    case "gantt": {
      throw new Error(
        `buildSection: ${planned.kind} must be handled in pass B, not direct dispatch`
      );
    }

    default: {
      const _exhaustive: never = planned;
      throw new Error(`Unhandled kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function buildDividerFromPlan(
  planned: Extract<PlannedSection, { kind: "divider" }>
): BidSection {
  return {
    type: "data",
    key: `divider-${planned.number}`,
    title: planned.title,
    content: {
      format: "section-divider",
      sectionNumber: planned.number,
      subtitle: planned.subtitle,
    },
    generatedAt: new Date().toISOString(),
  };
}

function buildPlaceholderFromPlan(
  planned: Extract<PlannedSection, { kind: "placeholder" }>
): BidSection {
  return {
    type: "placeholder",
    key: planned.semanticKey ?? `placeholder-${planned.title.toLowerCase().replace(/\s+/g, "-")}`,
    title: planned.title,
    content: { format: "placeholder", instruction: planned.instruction },
    generatedAt: new Date().toISOString(),
  };
}

function buildRequirementMatrixFromPlan(
  planned: Extract<PlannedSection, { kind: "requirement-matrix" }>,
  ctx: BidContext
): BidSection {
  const base = buildRequirementMatrix(ctx.analysis, ctx.teamConsultants);
  return { ...base, title: planned.title };
}

async function buildProseViaAi(
  planned: Extract<PlannedSection, { kind: "prose" }>,
  ctx: BidContext
): Promise<BidSection> {
  const prompt = FORMAT_PROMPTS.prose;
  const parsed = await callClaude({
    model: "claude-opus-4-6",
    maxTokens: 4000,
    system: prompt.system({
      language: "sv",
      promptHint: planned.promptHint,
      semanticKey: planned.semanticKey,
    }),
    userContent: prompt.userContent(ctx),
    schema: FORMAT_SCHEMAS.prose,
    label: `prose "${planned.title}"`,
  });
  return {
    type: "ai",
    key: planned.semanticKey ?? slugifyTitle(planned.title),
    title: planned.title,
    content: { format: "prose", text: parsed.text },
    generatedAt: new Date().toISOString(),
  };
}

async function buildBulletsViaAi(
  planned: Extract<PlannedSection, { kind: "bullets" }>,
  ctx: BidContext
): Promise<BidSection> {
  const prompt = FORMAT_PROMPTS.bullets;
  const parsed = await callClaude({
    model: "claude-opus-4-6",
    maxTokens: 4000,
    system: prompt.system({
      language: "sv",
      promptHint: planned.promptHint,
      semanticKey: planned.semanticKey,
      minItems: planned.minItems,
    }),
    userContent: prompt.userContent(ctx),
    schema: FORMAT_SCHEMAS.bullets,
    label: `bullets "${planned.title}"`,
  });
  return {
    type: "ai",
    key: planned.semanticKey ?? slugifyTitle(planned.title),
    title: planned.title,
    content: { format: "bullets", items: parsed.items },
    generatedAt: new Date().toISOString(),
  };
}

async function buildThreeColumnViaAi(
  planned: Extract<PlannedSection, { kind: "three-column" }>,
  ctx: BidContext
): Promise<BidSection> {
  const prompt = FORMAT_PROMPTS["three-column"];
  const parsed = await callClaude({
    model: "claude-opus-4-6",
    maxTokens: 4000,
    system: prompt.system({
      language: "sv",
      columnHints: planned.columnHints,
      semanticKey: planned.semanticKey,
    }),
    userContent: prompt.userContent(ctx),
    schema: FORMAT_SCHEMAS["three-column"],
    label: `three-column "${planned.title}"`,
  });
  return {
    type: "ai",
    key: planned.semanticKey ?? slugifyTitle(planned.title),
    title: planned.title,
    content: { format: "three-column", columns: [...parsed.columns] },
    generatedAt: new Date().toISOString(),
  };
}

async function buildPhasesViaAi(
  planned: Extract<PlannedSection, { kind: "phases" }>,
  ctx: BidContext
): Promise<BidSection> {
  const prompt = FORMAT_PROMPTS.phases;
  const parsed = await callClaude({
    model: "claude-opus-4-6",
    maxTokens: 4000,
    system: prompt.system({
      language: "sv",
      promptHint: planned.promptHint,
      semanticKey: planned.semanticKey,
    }),
    userContent: prompt.userContent(ctx),
    schema: FORMAT_SCHEMAS.phases,
    label: `phases "${planned.title}"`,
  });
  return {
    type: "ai",
    key: planned.semanticKey ?? slugifyTitle(planned.title),
    title: planned.title,
    content: { format: "phases", phases: parsed.phases },
    generatedAt: new Date().toISOString(),
  };
}

async function buildTeamViaAi(
  planned: Extract<PlannedSection, { kind: "team" }>,
  ctx: BidContext
): Promise<BidSection> {
  const prompt = FORMAT_PROMPTS.team;
  const parsed = await callClaude({
    model: "claude-opus-4-6",
    maxTokens: 4000,
    system: prompt.system({
      language: "sv",
      preferredSize: planned.preferredSize,
      semanticKey: planned.semanticKey,
    }),
    userContent: prompt.userContent(ctx),
    schema: FORMAT_SCHEMAS.team,
    label: `team "${planned.title}"`,
  });
  return {
    type: "ai",
    key: planned.semanticKey ?? "team",
    title: planned.title,
    content: { format: "team", members: parsed.members },
    generatedAt: new Date().toISOString(),
  };
}

async function buildReferencesViaAi(
  planned: Extract<PlannedSection, { kind: "references" }>,
  ctx: BidContext
): Promise<BidSection> {
  const prompt = FORMAT_PROMPTS.references;
  const parsed = await callClaude({
    model: "claude-opus-4-6",
    maxTokens: 4000,
    system: prompt.system({
      language: "sv",
      minCount: planned.minCount,
      semanticKey: planned.semanticKey,
    }),
    userContent: prompt.userContent(ctx),
    schema: FORMAT_SCHEMAS.references,
    label: `references "${planned.title}"`,
  });
  return {
    type: "ai",
    key: planned.semanticKey ?? "references",
    title: planned.title,
    content: { format: "references", references: parsed.references },
    generatedAt: new Date().toISOString(),
  };
}

function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// --- Orchestrator ---

export async function generateAllSections(
  ctx: BidContext,
  onSectionComplete?: (section: BidSection) => void | Promise<void>
): Promise<{ sections: BidSection[]; plan: BidPlan }> {
  // 1. Plan
  const rawPlan = await planBidOrFallback(ctx);
  console.log("[bid-generator] raw plan:", JSON.stringify(rawPlan, null, 2));

  // 2. Validate + repair
  const plan = validateAndRepair(rawPlan, ctx);
  console.log("[bid-generator] validated plan:", JSON.stringify(plan, null, 2));
  if (plan.unmappedRequirements && plan.unmappedRequirements.length > 0) {
    console.warn("[bid-generator] unmapped requirements:", plan.unmappedRequirements);
  }

  // 3. Pass A — build independent sections in parallel
  const deferredKinds = new Set<PlannedSection["kind"]>(["toc", "gantt"]);
  const passAIndexes: number[] = [];
  const passAPromises: Promise<BidSection>[] = [];

  plan.sections.forEach((planned, idx) => {
    if (deferredKinds.has(planned.kind)) return;
    passAIndexes.push(idx);
    passAPromises.push(buildSectionSafe(planned, ctx));
  });

  const passAResults = await Promise.all(passAPromises);

  const out: (BidSection | undefined)[] = new Array(plan.sections.length).fill(undefined);
  passAIndexes.forEach((origIdx, i) => {
    out[origIdx] = passAResults[i];
  });

  for (const idx of passAIndexes) {
    const section = out[idx];
    if (section && onSectionComplete) {
      await onSectionComplete(section);
    }
  }

  // 4. Pass B — toc and gantt
  for (let idx = 0; idx < plan.sections.length; idx++) {
    const planned = plan.sections[idx];
    if (planned.kind === "toc") {
      const otherTitles = out
        .filter((s): s is BidSection => !!s)
        .filter((s) => s.content.format !== "cover" && s.content.format !== "section-divider")
        .map((s) => s.title);
      out[idx] = {
        type: "data",
        key: "toc",
        title: planned.title,
        content: { format: "bullets", items: otherTitles },
        generatedAt: new Date().toISOString(),
      };
      if (onSectionComplete) await onSectionComplete(out[idx]!);
    } else if (planned.kind === "gantt") {
      const phasesSection = out.find(
        (s): s is BidSection => !!s && s.content.format === "phases"
      );
      if (phasesSection && phasesSection.content.format === "phases") {
        out[idx] = {
          type: "data",
          key: "gantt",
          title: planned.title,
          content: {
            format: "gantt",
            phases: phasesSection.content.phases,
            milestones: [],
          },
          generatedAt: new Date().toISOString(),
        };
      } else {
        out[idx] = {
          type: "placeholder",
          key: "gantt",
          title: planned.title,
          content: { format: "placeholder", instruction: "Ingen fasdata tillgänglig för tidplan" },
          generatedAt: new Date().toISOString(),
        };
      }
      if (onSectionComplete) await onSectionComplete(out[idx]!);
    }
  }

  const sections = out.filter((s): s is BidSection => !!s);
  return { sections, plan };
}

async function buildSectionSafe(
  planned: PlannedSection,
  ctx: BidContext
): Promise<BidSection> {
  try {
    return await buildSection(planned, ctx);
  } catch (err) {
    console.error(
      `[bid-generator] section "${"title" in planned ? planned.title : planned.kind}" failed, using placeholder fallback:`,
      err
    );
    const title = "title" in planned ? planned.title : planned.kind;
    return {
      type: "placeholder",
      key: planned.semanticKey ?? `${planned.kind}-failed`,
      title,
      content: {
        format: "placeholder",
        instruction: "Kunde inte auto-generera sektionen — fyll i manuellt.",
      },
      generatedAt: new Date().toISOString(),
    };
  }
}
