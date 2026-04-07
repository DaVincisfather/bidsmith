# M2: Bid Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate PowerPoint bid proposals from RFP analysis + team + Go/No-Go assessment, with section-level preview and regeneration.

**Architecture:** Opus 4.6 generates AI sections individually. Data-driven sections (cover, TOC, requirement matrix) are built from structured data. pptxgenjs renders all sections to .pptx with organization branding. The UI shows a preview list with per-section regeneration, then exports to downloadable PowerPoint.

**Tech Stack:** Next.js 16 (App Router), Anthropic SDK (Opus 4.6), pptxgenjs, Supabase, Tailwind v4, vitest

**Spec:** `docs/superpowers/specs/2026-04-07-m2-bid-generation-design.md`

---

### Task 1: Types and Database Migration

**Files:**
- Modify: `src/lib/types.ts` (append after line 136)
- Create: `supabase/migrations/004_bids.sql`

- [ ] **Step 1: Add bid types to types.ts**

Append to `src/lib/types.ts` after the existing `GoNoGoAssessment` interface:

```typescript
// --- M2: Bid Generation ---

export interface ExecutionPhase {
  name: string;
  objective: string;
  activities: string[];
  deliverables: string[];
  duration: string;
}

export interface TeamPresentation {
  consultantId: string;
  name: string;
  role: string;
  relevantExperience: string;
  keyCompetencies: string[];
}

export interface BidReference {
  title: string;
  client: string;
  year: number;
  description: string;
  relevance: string;
}

export interface RequirementRow {
  requirement: string;
  priority: "must" | "should" | "nice-to-have";
  coverage: Record<string, boolean>;
}

export type BidSectionContent =
  | { format: "prose"; text: string }
  | { format: "bullets"; items: string[] }
  | { format: "phases"; phases: ExecutionPhase[] }
  | { format: "team"; members: TeamPresentation[] }
  | { format: "references"; references: BidReference[] }
  | { format: "requirement-matrix"; rows: RequirementRow[]; consultantNames: Record<string, string> }
  | { format: "cover"; title: string; client: string; date: string }
  | { format: "placeholder"; instruction: string };

export interface BidSection {
  type: "ai" | "data" | "placeholder";
  key: string;
  title: string;
  content: BidSectionContent;
  generatedAt: string;
}

export type BidStatus = "generating" | "draft" | "exported";
export type BidOutcome = "won" | "lost" | "no-bid";

export interface Bid {
  id: string;
  analysisId: string;
  assessmentId: string | null;
  organizationId: string;
  teamConsultantIds: string[];
  sections: BidSection[];
  status: BidStatus;
  outcome: BidOutcome | null;
  exportedAt: string | null;
  createdAt: string;
}

export interface StyleGuide {
  colors: {
    primary: string;
    primaryLight: string;
    secondary: string;
    secondaryLight: string;
    accent: string;
    dark: string;
    light: string;
    muted: string;
  };
  font: string;
  logoUrl: string;
}
```

- [ ] **Step 2: Create migration 004_bids.sql**

Create `supabase/migrations/004_bids.sql`:

```sql
create table bids (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid references analyses(id) not null,
  assessment_id uuid references go_no_go_assessments(id),
  organization_id uuid references organizations(id),
  team_consultant_ids uuid[] not null,
  sections jsonb not null default '[]',
  status text not null default 'generating'
    check (status in ('generating', 'draft', 'exported')),
  outcome text check (outcome in ('won', 'lost', 'no-bid')),
  exported_at timestamptz,
  created_at timestamptz default now() not null
);

create index idx_bids_analysis on bids(analysis_id);
create index idx_bids_org on bids(organization_id);
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts supabase/migrations/004_bids.sql
git commit -m "feat: add bid types and database migration for M2"
```

---

### Task 2: Bid Section Prompts

**Files:**
- Create: `src/lib/bid-section-prompts.ts`

- [ ] **Step 1: Create bid-section-prompts.ts**

This file defines the system prompt and user prompt builder for each AI-generated section. Create `src/lib/bid-section-prompts.ts`:

```typescript
import {
  RfpAnalysis,
  Consultant,
  ScoredConsultant,
  GoNoGoResult,
} from "./types";

export interface BidContext {
  analysis: RfpAnalysis;
  teamConsultants: Consultant[];
  scoredConsultants: ScoredConsultant[];
  goNoGoResult: GoNoGoResult;
}

function formatContext(ctx: BidContext): string {
  const teamSummary = ctx.teamConsultants
    .map((c) => {
      const score = ctx.scoredConsultants.find(
        (s) => s.consultantId === c.id
      );
      const comps = c.competencies.map((co) => co.competency).join(", ");
      const refs = c.references
        .map((r) => `${r.title} (${r.year}, ${r.sector})`)
        .join("; ");
      return `- ${c.name} (${c.level}, score: ${score?.score ?? "N/A"})\n  Kompetenser: ${comps}\n  Uppdrag: ${refs}\n  AI-bedömning: ${score?.reasoning ?? "N/A"}`;
    })
    .join("\n\n");

  return `## Förfrågningsunderlag (RFP)
${JSON.stringify(ctx.analysis, null, 2)}

## Team
${teamSummary}

## Go/No-Go-bedömning
- Rekommendation: ${ctx.goNoGoResult.recommendation}
- Vinstchans: ${ctx.goNoGoResult.winProbability}%
- Styrkor: ${ctx.goNoGoResult.strengths.join(", ")}
- Luckor: ${ctx.goNoGoResult.gaps.join(", ")}
- Motivering: ${ctx.goNoGoResult.reasoning}`;
}

interface SectionPrompt {
  system: string;
  user: (ctx: BidContext) => string;
}

const SECTION_PROMPTS: Record<string, SectionPrompt> = {
  understanding: {
    system: `Du skriver sektionen "Uppdragsförståelse" i ett konsultanbud.
Visa att ni förstår kundens behov, utmaningar och mål — inte bara kraven.
Ton: professionell, empatisk, specifik. Undvik generiska påståenden.
Svara med giltig JSON: { "text": "Löpande text, 200-400 ord" }`,
    user: (ctx) =>
      `Skriv Uppdragsförståelse baserat på:\n\n${formatContext(ctx)}`,
  },

  "value-proposition": {
    system: `Du skriver sektionen "Identifierat värde" i ett konsultanbud.
Koppla varje värdepunkt till ett specifikt område i RFP:en.
Svara med giltig JSON: { "items": ["Punkt 1", "Punkt 2", ...] }
Varje punkt: 1-2 meningar. 4-6 punkter totalt.`,
    user: (ctx) =>
      `Identifiera värde vi kan leverera baserat på:\n\n${formatContext(ctx)}`,
  },

  "execution-plan": {
    system: `Du skriver sektionen "Genomförandeplan" i ett konsultanbud.
Bryt ner genomförandet i 3-5 faser med tydliga mål, aktiviteter och leverabler.
Svara med giltig JSON:
{
  "phases": [
    {
      "name": "Fas 1: Nulägesanalys",
      "objective": "Förstå nuvarande processer och identifiera förbättringsmöjligheter",
      "activities": ["Intervjuer med nyckelintressenter", "Dokumentanalys"],
      "deliverables": ["Nulägesrapport", "Gap-analys"],
      "duration": "2 veckor"
    }
  ]
}
Anpassa antalet faser efter uppdragets komplexitet. Varje fas ska ha konkreta, mätbara leverabler.`,
    user: (ctx) =>
      `Skapa en genomförandeplan baserat på:\n\n${formatContext(ctx)}`,
  },

  quality: {
    system: `Du skriver sektionen "Kvalitetssäkring och samverkan" i ett konsultanbud.
Beskriv hur ni säkerställer kvalitet: avstämningspunkter, rapportering, eskalering, kunskapsöverföring.
Svara med giltig JSON: { "text": "Löpande text, 150-250 ord" }`,
    user: (ctx) =>
      `Beskriv kvalitetssäkring för detta uppdrag:\n\n${formatContext(ctx)}`,
  },

  risks: {
    system: `Du skriver sektionen "Risker och hantering" i ett konsultanbud.
Identifiera 4-6 realistiska risker specifika för detta uppdrag. Koppla till RFP:ens red flags och luckor.
Svara med giltig JSON: { "items": ["Risk: X. Hantering: Y.", ...] }`,
    user: (ctx) =>
      `Identifiera risker och hanteringsstrategier baserat på:\n\n${formatContext(ctx)}`,
  },

  team: {
    system: `Du skriver sektionen "Teamet" i ett konsultanbud.
Presentera varje konsult med fokus på erfarenhet relevant för detta specifika uppdrag.
Svara med giltig JSON:
{
  "members": [
    {
      "consultantId": "uuid",
      "name": "Anna Svensson",
      "role": "Projektledare",
      "relevantExperience": "10 års erfarenhet av...",
      "keyCompetencies": ["Kompetens 1", "Kompetens 2"]
    }
  ]
}
Använd EXAKT namn och ID från teamlistan. Rollen ska vara specifik för detta uppdrag, inte en generell titel.`,
    user: (ctx) =>
      `Presentera teamet för detta uppdrag:\n\n${formatContext(ctx)}`,
  },

  references: {
    system: `Du skriver sektionen "Referensuppdrag" i ett konsultanbud.
Välj de mest relevanta referensuppdragen från teamets historik. Koppla varje referens till specifika krav i RFP:en.
Svara med giltig JSON:
{
  "references": [
    {
      "title": "Uppdragstitel",
      "client": "Kund",
      "year": 2024,
      "description": "Kort beskrivning av uppdraget",
      "relevance": "Relevant för detta uppdrag eftersom..."
    }
  ]
}
Välj 3-5 referensuppdrag. Prioritera nyliga och domänrelevanta.`,
    user: (ctx) =>
      `Välj relevanta referensuppdrag baserat på:\n\n${formatContext(ctx)}`,
  },

  summary: {
    system: `Du skriver sektionen "Sammanfattning — Varför oss" i ett konsultanbud.
Sammanfatta varför ni är rätt partner: teamets styrkor, relevant erfarenhet, och ert unika värde.
Svara med giltig JSON: { "text": "Löpande text, 150-250 ord" }
Avsluta med en framåtblickande mening.`,
    user: (ctx) =>
      `Skriv en sammanfattning av varför vi bör väljas:\n\n${formatContext(ctx)}`,
  },
};

export function getSectionPrompt(
  key: string
): SectionPrompt | undefined {
  return SECTION_PROMPTS[key];
}

export const AI_SECTION_KEYS = Object.keys(SECTION_PROMPTS);
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/bid-section-prompts.ts
git commit -m "feat: add bid section prompts for Opus-generated content"
```

---

### Task 3: Bid Generator — Data and Placeholder Sections

**Files:**
- Create: `src/lib/bid-generator.ts`
- Create: `src/lib/__tests__/bid-generator.test.ts`

- [ ] **Step 1: Write tests for data-driven and placeholder sections**

Create `src/lib/__tests__/bid-generator.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildCoverSection, buildTocSection, buildRequirementMatrix, buildPlaceholderSection } from "../bid-generator";
import { RfpAnalysis, Consultant, BidSection } from "../types";

const mockAnalysis: RfpAnalysis = {
  title: "IT-konsulttjänster för Region Västra Götaland",
  client: "Region Västra Götaland",
  deadline: "2026-05-01",
  summary: "Upphandling av IT-konsulttjänster",
  requirements: [
    { category: "Kompetens", description: "Minst 5 års erfarenhet av projektledning", priority: "must" },
    { category: "Kompetens", description: "Erfarenhet av offentlig sektor", priority: "should" },
    { category: "Certifiering", description: "PMP eller motsvarande", priority: "nice-to-have" },
  ],
  evaluationCriteria: [{ name: "Kompetens", weight: 60, description: "Teamets samlade kompetens" }],
  requiredCompetencies: ["projektledning", "agil metodik"],
  estimatedScope: "3 konsulter, 6 månader",
  redFlags: [],
  domain: "IT",
};

const mockTeam: Consultant[] = [
  {
    id: "c1",
    organizationId: "org1",
    name: "Anna Svensson",
    level: "senior",
    yearsExperience: 12,
    summary: "Senior projektledare",
    rawCvText: null,
    competencies: [
      { competency: "projektledning", category: "methodology" },
      { competency: "agil metodik", category: "methodology" },
    ],
    references: [
      { title: "Digitalisering VGR", description: "Led digital transformation", year: 2024, sector: "public" },
    ],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  },
  {
    id: "c2",
    organizationId: "org1",
    name: "Erik Johansson",
    level: "intermediate",
    yearsExperience: 6,
    summary: "IT-konsult",
    rawCvText: null,
    competencies: [
      { competency: "systemutveckling", category: "technical" },
    ],
    references: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  },
];

describe("buildCoverSection", () => {
  it("creates a cover section from analysis data", () => {
    const section = buildCoverSection(mockAnalysis);
    expect(section.type).toBe("data");
    expect(section.key).toBe("cover");
    expect(section.content.format).toBe("cover");
    if (section.content.format === "cover") {
      expect(section.content.title).toBe("IT-konsulttjänster för Region Västra Götaland");
      expect(section.content.client).toBe("Region Västra Götaland");
      expect(section.content.date).toBeTruthy();
    }
  });
});

describe("buildTocSection", () => {
  it("creates a TOC from section titles", () => {
    const sections: BidSection[] = [
      { type: "data", key: "cover", title: "Framsida", content: { format: "cover", title: "", client: "", date: "" }, generatedAt: "" },
      { type: "ai", key: "understanding", title: "Uppdragsförståelse", content: { format: "prose", text: "" }, generatedAt: "" },
    ];
    const toc = buildTocSection(sections);
    expect(toc.content.format).toBe("bullets");
    if (toc.content.format === "bullets") {
      expect(toc.content.items).toContain("Uppdragsförståelse");
      // Cover should not appear in TOC
      expect(toc.content.items).not.toContain("Framsida");
    }
  });
});

describe("buildRequirementMatrix", () => {
  it("creates a matrix with consultants vs requirements", () => {
    const section = buildRequirementMatrix(mockAnalysis, mockTeam);
    expect(section.type).toBe("data");
    expect(section.key).toBe("requirement-matrix");
    if (section.content.format === "requirement-matrix") {
      // Should have rows for must and should requirements
      expect(section.content.rows.length).toBe(3);
      expect(section.content.rows[0].requirement).toBe("Minst 5 års erfarenhet av projektledning");
      // Coverage should have entries for both consultants
      expect(Object.keys(section.content.rows[0].coverage)).toContain("c1");
      expect(Object.keys(section.content.rows[0].coverage)).toContain("c2");
    }
  });
});

describe("buildPlaceholderSection", () => {
  it("creates a placeholder with instruction text", () => {
    const section = buildPlaceholderSection("pricing", "Pris & omfattning", "Fyll i er prisbild här.");
    expect(section.type).toBe("placeholder");
    expect(section.key).toBe("pricing");
    if (section.content.format === "placeholder") {
      expect(section.content.instruction).toBe("Fyll i er prisbild här.");
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/projects/agentic-dealflow && npx vitest run src/lib/__tests__/bid-generator.test.ts
```

Expected: FAIL — `bid-generator` module not found.

- [ ] **Step 3: Implement data-driven and placeholder section builders**

Create `src/lib/bid-generator.ts`:

```typescript
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

const client = new Anthropic();

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
      // Simple heuristic: consultant covers requirement if any keyword matches
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ~/projects/agentic-dealflow && npx vitest run src/lib/__tests__/bid-generator.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bid-generator.ts src/lib/__tests__/bid-generator.test.ts
git commit -m "feat: add data-driven and placeholder bid section builders with tests"
```

---

### Task 4: Bid Generator — AI Section Generation

**Files:**
- Modify: `src/lib/bid-generator.ts`
- Create: `src/lib/__tests__/bid-ai-sections.test.ts`

- [ ] **Step 1: Write test for AI section generation**

Create `src/lib/__tests__/bid-ai-sections.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateAiSection } from "../bid-generator";
import { BidContext } from "../bid-section-prompts";
import {
  RfpAnalysis,
  GoNoGoResult,
} from "../types";

// Mock Anthropic SDK
vi.mock("@anthropic-ai/sdk", () => {
  const mockCreate = vi.fn();
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: { create: mockCreate },
    })),
    __mockCreate: mockCreate,
  };
});

import Anthropic from "@anthropic-ai/sdk";
// @ts-expect-error — accessing test mock
const mockCreate = Anthropic.__mockCreate as ReturnType<typeof vi.fn>;

const mockContext: BidContext = {
  analysis: {
    title: "Test RFP",
    client: "Test Client",
    deadline: null,
    summary: "Test summary",
    requirements: [],
    evaluationCriteria: [],
    requiredCompetencies: [],
    estimatedScope: "3 months",
    redFlags: [],
    domain: "IT",
  },
  teamConsultants: [
    {
      id: "c1",
      organizationId: "org1",
      name: "Anna Svensson",
      level: "senior",
      yearsExperience: 10,
      summary: "Senior consultant",
      rawCvText: null,
      competencies: [],
      references: [],
      createdAt: "",
      updatedAt: "",
    },
  ],
  scoredConsultants: [
    {
      consultantId: "c1",
      consultantName: "Anna Svensson",
      level: "senior",
      score: 85,
      reasoning: "Strong match",
    },
  ],
  goNoGoResult: {
    mustRequirements: [],
    winProbability: 75,
    winProbabilityReasoning: "Good fit",
    strengths: ["Strong team"],
    gaps: [],
    improvements: [],
    recommendation: "go",
    reasoning: "Recommended",
  },
};

describe("generateAiSection", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("generates an understanding section with prose format", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: '{ "text": "Vi förstår att ni söker en partner som kan..." }',
        },
      ],
    });

    const section = await generateAiSection("understanding", mockContext);
    expect(section.type).toBe("ai");
    expect(section.key).toBe("understanding");
    expect(section.title).toBe("Uppdragsförståelse");
    expect(section.content.format).toBe("prose");
    if (section.content.format === "prose") {
      expect(section.content.text).toContain("Vi förstår");
    }

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-opus-4-6",
      })
    );
  });

  it("generates an execution-plan section with phases format", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            phases: [
              {
                name: "Fas 1: Nulägesanalys",
                objective: "Kartlägg nuläget",
                activities: ["Intervjuer"],
                deliverables: ["Nulägesrapport"],
                duration: "2 veckor",
              },
            ],
          }),
        },
      ],
    });

    const section = await generateAiSection("execution-plan", mockContext);
    expect(section.content.format).toBe("phases");
    if (section.content.format === "phases") {
      expect(section.content.phases).toHaveLength(1);
      expect(section.content.phases[0].name).toBe("Fas 1: Nulägesanalys");
    }
  });

  it("throws for unknown section key", async () => {
    await expect(generateAiSection("nonexistent", mockContext)).rejects.toThrow(
      "Unknown AI section key: nonexistent"
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/projects/agentic-dealflow && npx vitest run src/lib/__tests__/bid-ai-sections.test.ts
```

Expected: FAIL — `generateAiSection` not exported.

- [ ] **Step 3: Implement AI section generation**

Add to `src/lib/bid-generator.ts`, after the placeholder section builder:

```typescript
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

  const message = await client.messages.create({
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ~/projects/agentic-dealflow && npx vitest run src/lib/__tests__/bid-ai-sections.test.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bid-generator.ts src/lib/__tests__/bid-ai-sections.test.ts
git commit -m "feat: add AI section generation with Opus 4.6"
```

---

### Task 5: Bid Generator — Orchestrator

**Files:**
- Modify: `src/lib/bid-generator.ts`
- Create: `src/lib/__tests__/bid-orchestrator.test.ts`

- [ ] **Step 1: Write test for the orchestrator**

Create `src/lib/__tests__/bid-orchestrator.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateAllSections } from "../bid-generator";
import { BidContext } from "../bid-section-prompts";

// Mock the AI calls — we only test orchestration logic
vi.mock("@anthropic-ai/sdk", () => {
  let callCount = 0;
  const responses: Record<string, string> = {
    understanding: '{ "text": "Uppdragsförståelse text" }',
    "value-proposition": '{ "items": ["Värde 1", "Värde 2"] }',
    "execution-plan": '{ "phases": [{ "name": "Fas 1", "objective": "Mål", "activities": ["A1"], "deliverables": ["D1"], "duration": "2v" }] }',
    quality: '{ "text": "Kvalitetstext" }',
    risks: '{ "items": ["Risk 1"] }',
    team: '{ "members": [{ "consultantId": "c1", "name": "Anna", "role": "Lead", "relevantExperience": "10 år", "keyCompetencies": ["PM"] }] }',
    references: '{ "references": [{ "title": "Ref1", "client": "Kund", "year": 2024, "description": "Desc", "relevance": "Relevant" }] }',
    summary: '{ "text": "Sammanfattning text" }',
  };

  const mockCreate = vi.fn().mockImplementation(({ system }) => {
    callCount++;
    // Match system prompt to section key
    for (const [key, resp] of Object.entries(responses)) {
      if (
        (key === "understanding" && system.includes("Uppdragsförståelse")) ||
        (key === "value-proposition" && system.includes("Identifierat värde")) ||
        (key === "execution-plan" && system.includes("Genomförandeplan")) ||
        (key === "quality" && system.includes("Kvalitetssäkring")) ||
        (key === "risks" && system.includes("Risker och hantering")) ||
        (key === "team" && system.includes("Teamet")) ||
        (key === "references" && system.includes("Referensuppdrag")) ||
        (key === "summary" && system.includes("Sammanfattning"))
      ) {
        return Promise.resolve({
          content: [{ type: "text", text: resp }],
        });
      }
    }
    return Promise.resolve({
      content: [{ type: "text", text: '{ "text": "fallback" }' }],
    });
  });

  return {
    default: vi.fn().mockImplementation(() => ({
      messages: { create: mockCreate },
    })),
  };
});

const mockContext: BidContext = {
  analysis: {
    title: "Test RFP",
    client: "Test Client",
    deadline: null,
    summary: "Test",
    requirements: [
      { category: "Kompetens", description: "Projektledning", priority: "must" },
    ],
    evaluationCriteria: [],
    requiredCompetencies: [],
    estimatedScope: "3 months",
    redFlags: [],
    domain: "IT",
  },
  teamConsultants: [
    {
      id: "c1",
      organizationId: "org1",
      name: "Anna",
      level: "senior",
      yearsExperience: 10,
      summary: "Lead",
      rawCvText: null,
      competencies: [{ competency: "projektledning", category: "methodology" }],
      references: [],
      createdAt: "",
      updatedAt: "",
    },
  ],
  scoredConsultants: [
    { consultantId: "c1", consultantName: "Anna", level: "senior", score: 90, reasoning: "Great" },
  ],
  goNoGoResult: {
    mustRequirements: [{ requirement: "Projektledning", met: true, coveredBy: "Anna" }],
    winProbability: 80,
    winProbabilityReasoning: "Strong",
    strengths: ["Experienced team"],
    gaps: [],
    improvements: [],
    recommendation: "go",
    reasoning: "Go ahead",
  },
};

describe("generateAllSections", () => {
  it("returns all section types in correct order", async () => {
    const { sections } = await generateAllSections(mockContext);

    // Check we have cover, AI sections, data sections, and placeholders
    const keys = sections.map((s) => s.key);
    expect(keys[0]).toBe("cover");
    expect(keys[1]).toBe("toc");
    expect(keys).toContain("understanding");
    expect(keys).toContain("execution-plan");
    expect(keys).toContain("team");
    expect(keys).toContain("requirement-matrix");
    expect(keys).toContain("pricing");
    expect(keys).toContain("confidentiality");
    expect(keys).toContain("contact");
  });

  it("calls onSectionComplete callback for progress tracking", async () => {
    const completed: string[] = [];
    await generateAllSections(mockContext, (section) => {
      completed.push(section.key);
    });

    expect(completed.length).toBeGreaterThan(0);
    // Cover should be first completed
    expect(completed[0]).toBe("cover");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/projects/agentic-dealflow && npx vitest run src/lib/__tests__/bid-orchestrator.test.ts
```

Expected: FAIL — `generateAllSections` not exported.

- [ ] **Step 3: Implement the orchestrator**

Add to `src/lib/bid-generator.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ~/projects/agentic-dealflow && npx vitest run src/lib/__tests__/bid-orchestrator.test.ts
```

Expected: All 2 tests PASS.

- [ ] **Step 5: Run all bid tests together**

```bash
cd ~/projects/agentic-dealflow && npx vitest run src/lib/__tests__/
```

Expected: All 9 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/bid-generator.ts src/lib/__tests__/bid-orchestrator.test.ts
git commit -m "feat: add bid generation orchestrator with progress callbacks"
```

---

### Task 6: PPTX Renderer

**Files:**
- Create: `src/lib/pptx-renderer.ts`
- Create: `src/lib/__tests__/pptx-renderer.test.ts`

- [ ] **Step 1: Install pptxgenjs**

```bash
cd ~/projects/agentic-dealflow && npm install pptxgenjs
```

- [ ] **Step 2: Write test for PPTX renderer**

Create `src/lib/__tests__/pptx-renderer.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { renderBidToPptx } from "../pptx-renderer";
import { BidSection, StyleGuide } from "../types";

const mockStyleGuide: StyleGuide = {
  colors: {
    primary: "#1A2B4A",
    primaryLight: "#2D4A7A",
    secondary: "#E8913A",
    secondaryLight: "#F4B76E",
    accent: "#2E8B57",
    dark: "#1A1A1A",
    light: "#F5F5F0",
    muted: "#6B7280",
  },
  font: "Calibri",
  logoUrl: "",
};

const mockSections: BidSection[] = [
  {
    type: "data",
    key: "cover",
    title: "Framsida",
    content: { format: "cover", title: "Test Proposal", client: "Test Client", date: "2026-04-07" },
    generatedAt: "2026-04-07",
  },
  {
    type: "ai",
    key: "understanding",
    title: "Uppdragsförståelse",
    content: { format: "prose", text: "Vi förstår att ni söker en partner för att stödja er digitala transformation." },
    generatedAt: "2026-04-07",
  },
  {
    type: "ai",
    key: "value-proposition",
    title: "Identifierat värde",
    content: { format: "bullets", items: ["Effektivisering av processer", "Ökad digital mognad"] },
    generatedAt: "2026-04-07",
  },
  {
    type: "ai",
    key: "execution-plan",
    title: "Genomförandeplan",
    content: {
      format: "phases",
      phases: [
        { name: "Fas 1: Analys", objective: "Kartlägg nuläge", activities: ["Intervjuer", "Dokumentanalys"], deliverables: ["Nulägesrapport"], duration: "2 veckor" },
      ],
    },
    generatedAt: "2026-04-07",
  },
  {
    type: "ai",
    key: "team",
    title: "Teamet",
    content: {
      format: "team",
      members: [
        { consultantId: "c1", name: "Anna Svensson", role: "Projektledare", relevantExperience: "10 års erfarenhet", keyCompetencies: ["PM", "Agile"] },
      ],
    },
    generatedAt: "2026-04-07",
  },
  {
    type: "data",
    key: "requirement-matrix",
    title: "Kravmatris",
    content: {
      format: "requirement-matrix",
      rows: [
        { requirement: "Projektledning", priority: "must", coverage: { c1: true } },
      ],
      consultantNames: { c1: "Anna Svensson" },
    },
    generatedAt: "2026-04-07",
  },
  {
    type: "ai",
    key: "references",
    title: "Referensuppdrag",
    content: {
      format: "references",
      references: [
        { title: "Digital transformation", client: "Region VGR", year: 2024, description: "Led project", relevance: "Same domain" },
      ],
    },
    generatedAt: "2026-04-07",
  },
  {
    type: "placeholder",
    key: "pricing",
    title: "Pris & omfattning",
    content: { format: "placeholder", instruction: "Fyll i er prisbild här." },
    generatedAt: "2026-04-07",
  },
];

describe("renderBidToPptx", () => {
  it("returns a Buffer containing valid PPTX data", async () => {
    const buffer = await renderBidToPptx(mockSections, mockStyleGuide);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
    // PPTX files are ZIP archives — they start with PK header
    expect(buffer[0]).toBe(0x50); // 'P'
    expect(buffer[1]).toBe(0x4b); // 'K'
  });

  it("creates one slide per section", async () => {
    // We can't easily inspect slide count from the binary,
    // but we verify the function doesn't throw with all section types
    const buffer = await renderBidToPptx(mockSections, mockStyleGuide);
    expect(buffer.length).toBeGreaterThan(1000);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd ~/projects/agentic-dealflow && npx vitest run src/lib/__tests__/pptx-renderer.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement PPTX renderer**

Create `src/lib/pptx-renderer.ts`:

```typescript
import PptxGenJS from "pptxgenjs";
import { BidSection, StyleGuide } from "./types";

function hexToRgb(hex: string): string {
  // pptxgenjs wants hex without '#'
  return hex.replace("#", "");
}

function addCoverSlide(pptx: PptxGenJS, section: BidSection, style: StyleGuide) {
  if (section.content.format !== "cover") return;
  const slide = pptx.addSlide();
  slide.background = { color: hexToRgb(style.colors.primary) };

  slide.addText(section.content.title, {
    x: 0.5,
    y: 1.5,
    w: 9,
    h: 1.5,
    fontSize: 28,
    fontFace: style.font,
    color: hexToRgb(style.colors.light),
    bold: true,
    align: "center",
  });

  slide.addText(section.content.client, {
    x: 0.5,
    y: 3.2,
    w: 9,
    h: 0.6,
    fontSize: 18,
    fontFace: style.font,
    color: hexToRgb(style.colors.secondaryLight),
    align: "center",
  });

  slide.addText(section.content.date, {
    x: 0.5,
    y: 4.2,
    w: 9,
    h: 0.5,
    fontSize: 14,
    fontFace: style.font,
    color: hexToRgb(style.colors.muted),
    align: "center",
  });
}

function addProseSlide(pptx: PptxGenJS, section: BidSection, style: StyleGuide) {
  if (section.content.format !== "prose") return;
  const slide = pptx.addSlide();

  slide.addText(section.title, {
    x: 0.5,
    y: 0.3,
    w: 9,
    h: 0.6,
    fontSize: 22,
    fontFace: style.font,
    color: hexToRgb(style.colors.primary),
    bold: true,
  });

  slide.addText(section.content.text, {
    x: 0.5,
    y: 1.1,
    w: 9,
    h: 4.2,
    fontSize: 13,
    fontFace: style.font,
    color: hexToRgb(style.colors.dark),
    valign: "top",
    lineSpacingMultiple: 1.3,
  });
}

function addBulletsSlide(pptx: PptxGenJS, section: BidSection, style: StyleGuide) {
  if (section.content.format !== "bullets") return;
  const slide = pptx.addSlide();

  slide.addText(section.title, {
    x: 0.5,
    y: 0.3,
    w: 9,
    h: 0.6,
    fontSize: 22,
    fontFace: style.font,
    color: hexToRgb(style.colors.primary),
    bold: true,
  });

  const bulletRows = section.content.items.map((item) => ({
    text: item,
    options: {
      fontSize: 13,
      fontFace: style.font,
      color: hexToRgb(style.colors.dark),
      bullet: { code: "2022" },
      paraSpaceAfter: 8,
    },
  }));

  slide.addText(bulletRows, {
    x: 0.5,
    y: 1.1,
    w: 9,
    h: 4.2,
    valign: "top",
  });
}

function addPhasesSlides(pptx: PptxGenJS, section: BidSection, style: StyleGuide) {
  if (section.content.format !== "phases") return;

  for (const phase of section.content.phases) {
    const slide = pptx.addSlide();

    slide.addText(phase.name, {
      x: 0.5,
      y: 0.3,
      w: 9,
      h: 0.6,
      fontSize: 20,
      fontFace: style.font,
      color: hexToRgb(style.colors.primary),
      bold: true,
    });

    slide.addText(phase.objective, {
      x: 0.5,
      y: 1.0,
      w: 9,
      h: 0.5,
      fontSize: 14,
      fontFace: style.font,
      color: hexToRgb(style.colors.secondary),
      italic: true,
    });

    const activities = phase.activities
      .map((a) => ({ text: a, options: { bullet: { code: "2022" }, fontSize: 12, fontFace: style.font, color: hexToRgb(style.colors.dark), paraSpaceAfter: 4 } }));
    slide.addText([
      { text: "Aktiviteter", options: { fontSize: 13, fontFace: style.font, color: hexToRgb(style.colors.primary), bold: true, paraSpaceAfter: 4 } },
      ...activities,
    ], { x: 0.5, y: 1.7, w: 4.2, h: 3.0, valign: "top" });

    const deliverables = phase.deliverables
      .map((d) => ({ text: d, options: { bullet: { code: "2022" }, fontSize: 12, fontFace: style.font, color: hexToRgb(style.colors.dark), paraSpaceAfter: 4 } }));
    slide.addText([
      { text: "Leverabler", options: { fontSize: 13, fontFace: style.font, color: hexToRgb(style.colors.primary), bold: true, paraSpaceAfter: 4 } },
      ...deliverables,
    ], { x: 5.3, y: 1.7, w: 4.2, h: 3.0, valign: "top" });

    slide.addText(`Tidsåtgång: ${phase.duration}`, {
      x: 0.5,
      y: 4.9,
      w: 9,
      h: 0.4,
      fontSize: 11,
      fontFace: style.font,
      color: hexToRgb(style.colors.muted),
    });
  }
}

function addTeamSlide(pptx: PptxGenJS, section: BidSection, style: StyleGuide) {
  if (section.content.format !== "team") return;
  const slide = pptx.addSlide();

  slide.addText(section.title, {
    x: 0.5,
    y: 0.3,
    w: 9,
    h: 0.6,
    fontSize: 22,
    fontFace: style.font,
    color: hexToRgb(style.colors.primary),
    bold: true,
  });

  let yPos = 1.1;
  for (const member of section.content.members) {
    slide.addText(`${member.name} — ${member.role}`, {
      x: 0.5,
      y: yPos,
      w: 9,
      h: 0.4,
      fontSize: 14,
      fontFace: style.font,
      color: hexToRgb(style.colors.dark),
      bold: true,
    });

    slide.addText(member.relevantExperience, {
      x: 0.5,
      y: yPos + 0.4,
      w: 9,
      h: 0.3,
      fontSize: 11,
      fontFace: style.font,
      color: hexToRgb(style.colors.dark),
    });

    const comps = member.keyCompetencies.join("  |  ");
    slide.addText(comps, {
      x: 0.5,
      y: yPos + 0.7,
      w: 9,
      h: 0.3,
      fontSize: 10,
      fontFace: style.font,
      color: hexToRgb(style.colors.muted),
    });

    yPos += 1.2;
  }
}

function addRequirementMatrixSlide(pptx: PptxGenJS, section: BidSection, style: StyleGuide) {
  if (section.content.format !== "requirement-matrix") return;
  const slide = pptx.addSlide();

  slide.addText(section.title, {
    x: 0.5,
    y: 0.3,
    w: 9,
    h: 0.6,
    fontSize: 22,
    fontFace: style.font,
    color: hexToRgb(style.colors.primary),
    bold: true,
  });

  const rows = section.content.rows;
  if (rows.length === 0) return;

  // Get consultant IDs from first row
  const consultantIds = Object.keys(rows[0].coverage);

  // Build table: header row + data rows
  const tableRows: PptxGenJS.TableRow[] = [];

  // Header
  const headerCells: PptxGenJS.TableCell[] = [
    { text: "Krav", options: { bold: true, fontSize: 10, fontFace: style.font, color: hexToRgb(style.colors.light), fill: { color: hexToRgb(style.colors.primary) } } },
    { text: "Prio", options: { bold: true, fontSize: 10, fontFace: style.font, color: hexToRgb(style.colors.light), fill: { color: hexToRgb(style.colors.primary) } } },
    ...consultantIds.map((id) => ({
      text: section.content.consultantNames?.[id] ?? id.substring(0, 8),
      options: { bold: true, fontSize: 10, fontFace: style.font, color: hexToRgb(style.colors.light), fill: { color: hexToRgb(style.colors.primary) }, align: "center" as const },
    })),
  ];
  tableRows.push(headerCells);

  // Data rows
  for (const row of rows) {
    const cells: PptxGenJS.TableCell[] = [
      { text: row.requirement, options: { fontSize: 9, fontFace: style.font } },
      { text: row.priority, options: { fontSize: 9, fontFace: style.font, align: "center" } },
      ...consultantIds.map((id) => ({
        text: row.coverage[id] ? "\u2713" : "\u2717",
        options: {
          fontSize: 12,
          fontFace: style.font,
          align: "center" as const,
          color: row.coverage[id] ? hexToRgb(style.colors.accent) : hexToRgb("#CC3333"),
        },
      })),
    ];
    tableRows.push(cells);
  }

  const colW = [3.5, 0.8, ...consultantIds.map(() => (9 - 4.3) / consultantIds.length)];

  slide.addTable(tableRows, {
    x: 0.5,
    y: 1.1,
    w: 9,
    colW,
    fontSize: 10,
    border: { type: "solid", pt: 0.5, color: hexToRgb(style.colors.muted) },
  });
}

function addReferencesSlide(pptx: PptxGenJS, section: BidSection, style: StyleGuide) {
  if (section.content.format !== "references") return;
  const slide = pptx.addSlide();

  slide.addText(section.title, {
    x: 0.5,
    y: 0.3,
    w: 9,
    h: 0.6,
    fontSize: 22,
    fontFace: style.font,
    color: hexToRgb(style.colors.primary),
    bold: true,
  });

  let yPos = 1.1;
  for (const ref of section.content.references) {
    slide.addText(`${ref.title} — ${ref.client} (${ref.year})`, {
      x: 0.5,
      y: yPos,
      w: 9,
      h: 0.35,
      fontSize: 13,
      fontFace: style.font,
      color: hexToRgb(style.colors.dark),
      bold: true,
    });

    slide.addText(ref.description, {
      x: 0.5,
      y: yPos + 0.35,
      w: 9,
      h: 0.3,
      fontSize: 11,
      fontFace: style.font,
      color: hexToRgb(style.colors.dark),
    });

    slide.addText(`Relevans: ${ref.relevance}`, {
      x: 0.5,
      y: yPos + 0.65,
      w: 9,
      h: 0.25,
      fontSize: 10,
      fontFace: style.font,
      color: hexToRgb(style.colors.accent),
      italic: true,
    });

    yPos += 1.1;
  }
}

function addPlaceholderSlide(pptx: PptxGenJS, section: BidSection, style: StyleGuide) {
  if (section.content.format !== "placeholder") return;
  const slide = pptx.addSlide();

  slide.addText(section.title, {
    x: 0.5,
    y: 0.3,
    w: 9,
    h: 0.6,
    fontSize: 22,
    fontFace: style.font,
    color: hexToRgb(style.colors.primary),
    bold: true,
  });

  slide.addText(section.content.instruction, {
    x: 1,
    y: 2,
    w: 8,
    h: 2,
    fontSize: 16,
    fontFace: style.font,
    color: hexToRgb(style.colors.muted),
    align: "center",
    valign: "middle",
    italic: true,
  });
}

const SLIDE_RENDERERS: Record<string, (pptx: PptxGenJS, section: BidSection, style: StyleGuide) => void> = {
  cover: addCoverSlide,
  prose: addProseSlide,
  bullets: addBulletsSlide,
  phases: addPhasesSlides,
  team: addTeamSlide,
  "requirement-matrix": addRequirementMatrixSlide,
  references: addReferencesSlide,
  placeholder: addPlaceholderSlide,
};

export async function renderBidToPptx(
  sections: BidSection[],
  styleGuide: StyleGuide
): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 inches
  pptx.author = "Agentic Dealflow";

  for (const section of sections) {
    const renderer = SLIDE_RENDERERS[section.content.format];
    if (renderer) {
      renderer(pptx, section, styleGuide);
    }
  }

  // pptxgenjs write returns base64 string when type is 'nodebuffer'
  const output = await pptx.write({ outputType: "nodebuffer" });
  return output as Buffer;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd ~/projects/agentic-dealflow && npx vitest run src/lib/__tests__/pptx-renderer.test.ts
```

Expected: Both tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pptx-renderer.ts src/lib/__tests__/pptx-renderer.test.ts package.json package-lock.json
git commit -m "feat: add PPTX renderer with branded slide layouts"
```

---

### Task 7: API Routes — Create and Fetch Bids

**Files:**
- Create: `src/app/api/bids/route.ts`
- Create: `src/app/api/bids/[id]/route.ts`

- [ ] **Step 1: Create POST /api/bids route**

Create `src/app/api/bids/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { generateAllSections } from "@/lib/bid-generator";
import {
  RfpAnalysis,
  Consultant,
  ScoredConsultant,
  GoNoGoResult,
  CompetencyCategory,
  Sector,
  BidSection,
} from "@/lib/types";
import { BidContext } from "@/lib/bid-section-prompts";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { analysisId, assessmentId, teamConsultantIds } = body as {
    analysisId: string;
    assessmentId: string;
    teamConsultantIds: string[];
  };

  if (!analysisId || !teamConsultantIds?.length) {
    return NextResponse.json(
      { error: "analysisId and teamConsultantIds are required" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  // Fetch analysis
  const { data: analysisRow, error: analysisError } = await supabase
    .from("analyses")
    .select("analysis")
    .eq("id", analysisId)
    .single();

  if (analysisError || !analysisRow) {
    return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
  }

  const rfpAnalysis = analysisRow.analysis as RfpAnalysis;

  // Fetch Go/No-Go assessment
  let goNoGoResult: GoNoGoResult | null = null;
  if (assessmentId) {
    const { data: assessmentRow } = await supabase
      .from("go_no_go_assessments")
      .select("result")
      .eq("id", assessmentId)
      .single();

    if (assessmentRow) {
      goNoGoResult = assessmentRow.result as GoNoGoResult;
    }
  }

  // Fetch latest match (scored consultants)
  const { data: matchRows } = await supabase
    .from("matches")
    .select("team_proposal")
    .eq("analysis_id", analysisId)
    .order("created_at", { ascending: false })
    .limit(1);

  const allScoredConsultants = matchRows?.[0]?.team_proposal as ScoredConsultant[] ?? [];

  // Fetch full consultant data for the team
  const { data: consultantRows, error: consultantError } = await supabase
    .from("consultants")
    .select(`
      *,
      consultant_competencies (id, competency, category),
      consultant_references (id, title, description, year, sector)
    `)
    .in("id", teamConsultantIds);

  if (consultantError || !consultantRows?.length) {
    return NextResponse.json(
      { error: "Could not fetch team consultants" },
      { status: 500 }
    );
  }

  const teamConsultants: Consultant[] = consultantRows.map(
    (row: Record<string, unknown>) => ({
      id: row.id as string,
      organizationId: row.organization_id as string,
      name: row.name as string,
      level: row.level as Consultant["level"],
      yearsExperience: row.years_experience as number | null,
      summary: row.summary as string | null,
      rawCvText: null,
      competencies:
        (row.consultant_competencies as Array<{
          competency: string;
          category: CompetencyCategory;
        }>) || [],
      references:
        (row.consultant_references as Array<{
          title: string;
          description: string;
          year: number;
          sector: Sector;
        }>) || [],
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    })
  );

  // Create bid record with status 'generating'
  const { data: bid, error: bidError } = await supabase
    .from("bids")
    .insert({
      analysis_id: analysisId,
      assessment_id: assessmentId || null,
      organization_id: DEFAULT_ORG_ID,
      team_consultant_ids: teamConsultantIds,
      status: "generating",
    })
    .select()
    .single();

  if (bidError || !bid) {
    return NextResponse.json({ error: bidError?.message ?? "Failed to create bid" }, { status: 500 });
  }

  // Build context for AI generation
  const ctx: BidContext = {
    analysis: rfpAnalysis,
    teamConsultants,
    scoredConsultants: allScoredConsultants,
    goNoGoResult: goNoGoResult ?? {
      mustRequirements: [],
      winProbability: 0,
      winProbabilityReasoning: "No Go/No-Go assessment available",
      strengths: [],
      gaps: [],
      improvements: [],
      recommendation: "go-with-reservations",
      reasoning: "No assessment performed",
    },
  };

  // Generate sections, saving progress to DB after each
  const { sections } = await generateAllSections(ctx, async (section: BidSection) => {
    // Update bid with each completed section
    const { data: currentBid } = await supabase
      .from("bids")
      .select("sections")
      .eq("id", bid.id)
      .single();

    const currentSections = (currentBid?.sections as BidSection[]) ?? [];
    currentSections.push(section);

    await supabase
      .from("bids")
      .update({ sections: currentSections })
      .eq("id", bid.id);
  });

  // Mark as draft
  await supabase
    .from("bids")
    .update({ sections, status: "draft" })
    .eq("id", bid.id);

  return NextResponse.json({
    id: bid.id,
    status: "draft",
    sections,
  });
}
```

- [ ] **Step 2: Create GET/PATCH /api/bids/[id] route**

Create `src/app/api/bids/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("bids")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Bid not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    id: data.id,
    analysisId: data.analysis_id,
    assessmentId: data.assessment_id,
    teamConsultantIds: data.team_consultant_ids,
    sections: data.sections,
    status: data.status,
    outcome: data.outcome,
    exportedAt: data.exported_at,
    createdAt: data.created_at,
  });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const body = await request.json();
  const { outcome } = body as { outcome?: string };

  const supabase = createServiceClient();

  const updates: Record<string, unknown> = {};
  if (outcome) {
    if (!["won", "lost", "no-bid"].includes(outcome)) {
      return NextResponse.json(
        { error: "outcome must be 'won', 'lost', or 'no-bid'" },
        { status: 400 }
      );
    }
    updates.outcome = outcome;
  }

  const { data, error } = await supabase
    .from("bids")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Bid not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ id: data.id, outcome: data.outcome, status: data.status });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/bids/route.ts src/app/api/bids/\[id\]/route.ts
git commit -m "feat: add bid creation and fetch API routes"
```

---

### Task 8: API Routes — Regenerate and Export

**Files:**
- Create: `src/app/api/bids/[id]/regenerate/[sectionKey]/route.ts`
- Create: `src/app/api/bids/[id]/export/route.ts`

- [ ] **Step 1: Create POST /api/bids/[id]/regenerate/[sectionKey] route**

Create `src/app/api/bids/[id]/regenerate/[sectionKey]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { generateAiSection } from "@/lib/bid-generator";
import {
  RfpAnalysis,
  Consultant,
  ScoredConsultant,
  GoNoGoResult,
  BidSection,
  CompetencyCategory,
  Sector,
} from "@/lib/types";
import { BidContext } from "@/lib/bid-section-prompts";

interface RouteContext {
  params: Promise<{ id: string; sectionKey: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteContext) {
  const { id, sectionKey } = await params;
  const supabase = createServiceClient();

  // Fetch bid
  const { data: bid, error: bidError } = await supabase
    .from("bids")
    .select("*")
    .eq("id", id)
    .single();

  if (bidError || !bid) {
    return NextResponse.json({ error: "Bid not found" }, { status: 404 });
  }

  const sections = bid.sections as BidSection[];
  const sectionIndex = sections.findIndex((s) => s.key === sectionKey);
  if (sectionIndex === -1) {
    return NextResponse.json({ error: `Section '${sectionKey}' not found` }, { status: 404 });
  }

  if (sections[sectionIndex].type !== "ai") {
    return NextResponse.json(
      { error: "Only AI sections can be regenerated" },
      { status: 400 }
    );
  }

  // Fetch analysis
  const { data: analysisRow } = await supabase
    .from("analyses")
    .select("analysis")
    .eq("id", bid.analysis_id)
    .single();

  if (!analysisRow) {
    return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
  }

  // Fetch Go/No-Go assessment
  let goNoGoResult: GoNoGoResult | null = null;
  if (bid.assessment_id) {
    const { data: assessmentRow } = await supabase
      .from("go_no_go_assessments")
      .select("result")
      .eq("id", bid.assessment_id)
      .single();
    if (assessmentRow) {
      goNoGoResult = assessmentRow.result as GoNoGoResult;
    }
  }

  // Fetch scored consultants
  const { data: matchRows } = await supabase
    .from("matches")
    .select("team_proposal")
    .eq("analysis_id", bid.analysis_id)
    .order("created_at", { ascending: false })
    .limit(1);

  const allScoredConsultants = matchRows?.[0]?.team_proposal as ScoredConsultant[] ?? [];

  // Fetch team consultants
  const { data: consultantRows } = await supabase
    .from("consultants")
    .select(`
      *,
      consultant_competencies (id, competency, category),
      consultant_references (id, title, description, year, sector)
    `)
    .in("id", bid.team_consultant_ids);

  const teamConsultants: Consultant[] = (consultantRows ?? []).map(
    (row: Record<string, unknown>) => ({
      id: row.id as string,
      organizationId: row.organization_id as string,
      name: row.name as string,
      level: row.level as Consultant["level"],
      yearsExperience: row.years_experience as number | null,
      summary: row.summary as string | null,
      rawCvText: null,
      competencies:
        (row.consultant_competencies as Array<{
          competency: string;
          category: CompetencyCategory;
        }>) || [],
      references:
        (row.consultant_references as Array<{
          title: string;
          description: string;
          year: number;
          sector: Sector;
        }>) || [],
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    })
  );

  const ctx: BidContext = {
    analysis: analysisRow.analysis as RfpAnalysis,
    teamConsultants,
    scoredConsultants: allScoredConsultants,
    goNoGoResult: goNoGoResult ?? {
      mustRequirements: [],
      winProbability: 0,
      winProbabilityReasoning: "No assessment",
      strengths: [],
      gaps: [],
      improvements: [],
      recommendation: "go-with-reservations",
      reasoning: "No assessment",
    },
  };

  // Regenerate the section
  const newSection = await generateAiSection(sectionKey, ctx);

  // Replace in sections array
  sections[sectionIndex] = newSection;

  await supabase
    .from("bids")
    .update({ sections })
    .eq("id", id);

  return NextResponse.json({ section: newSection });
}
```

- [ ] **Step 2: Create GET /api/bids/[id]/export route**

Create `src/app/api/bids/[id]/export/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { renderBidToPptx } from "@/lib/pptx-renderer";
import { BidSection, StyleGuide } from "@/lib/types";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

const DEFAULT_STYLE_GUIDE: StyleGuide = {
  colors: {
    primary: "#1A2B4A",
    primaryLight: "#2D4A7A",
    secondary: "#E8913A",
    secondaryLight: "#F4B76E",
    accent: "#2E8B57",
    dark: "#1A1A1A",
    light: "#F5F5F0",
    muted: "#6B7280",
  },
  font: "Calibri",
  logoUrl: "",
};

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const supabase = createServiceClient();

  // Fetch bid
  const { data: bid, error: bidError } = await supabase
    .from("bids")
    .select("*")
    .eq("id", id)
    .single();

  if (bidError || !bid) {
    return NextResponse.json({ error: "Bid not found" }, { status: 404 });
  }

  if (bid.status === "generating") {
    return NextResponse.json(
      { error: "Bid is still generating. Wait until status is 'draft'." },
      { status: 409 }
    );
  }

  // Fetch organization style guide
  const { data: org } = await supabase
    .from("organizations")
    .select("style_guide")
    .eq("id", bid.organization_id ?? DEFAULT_ORG_ID)
    .single();

  const styleGuide: StyleGuide = (org?.style_guide as StyleGuide) ?? DEFAULT_STYLE_GUIDE;

  const sections = bid.sections as BidSection[];
  const buffer = await renderBidToPptx(sections, styleGuide);

  // Mark as exported
  await supabase
    .from("bids")
    .update({ status: "exported", exported_at: new Date().toISOString() })
    .eq("id", id);

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="anbud-${id.substring(0, 8)}.pptx"`,
    },
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/bids/\[id\]/regenerate/\[sectionKey\]/route.ts src/app/api/bids/\[id\]/export/route.ts
git commit -m "feat: add bid regenerate and PPTX export API routes"
```

---

### Task 9: UI Components — BidSectionCard and BidPreview

**Files:**
- Create: `src/components/bid-section-card.tsx`
- Create: `src/components/bid-preview.tsx`

- [ ] **Step 1: Create BidSectionCard component**

Create `src/components/bid-section-card.tsx`:

```tsx
"use client";

import { BidSection } from "@/lib/types";

interface BidSectionCardProps {
  section: BidSection;
  onRegenerate?: () => void;
  regenerating?: boolean;
}

function sectionPreview(section: BidSection): string {
  switch (section.content.format) {
    case "prose":
      return section.content.text.substring(0, 120) + (section.content.text.length > 120 ? "..." : "");
    case "bullets":
      return section.content.items.slice(0, 2).join(" | ") + (section.content.items.length > 2 ? " ..." : "");
    case "phases":
      return section.content.phases.map((p) => p.name).join(" → ");
    case "team":
      return section.content.members.map((m) => m.name).join(", ");
    case "references":
      return section.content.references.map((r) => r.title).join(", ");
    case "requirement-matrix": {
      const names = Object.values(section.content.consultantNames ?? {});
      return `${section.content.rows.length} krav × ${names.length || Object.keys(section.content.rows[0]?.coverage ?? {}).length} konsulter`;
    }
    case "cover":
      return `${section.content.title} — ${section.content.client}`;
    case "placeholder":
      return section.content.instruction;
  }
}

function statusIcon(section: BidSection): string {
  if (section.type === "placeholder") return "\u25A1"; // empty square
  return "\u2713"; // checkmark
}

function statusColor(section: BidSection): string {
  if (section.type === "placeholder") return "text-gray-400";
  return "text-green-600";
}

export function BidSectionCard({
  section,
  onRegenerate,
  regenerating,
}: BidSectionCardProps) {
  const canRegenerate = section.type === "ai";

  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <span className={`shrink-0 mt-0.5 ${statusColor(section)}`}>
            {statusIcon(section)}
          </span>
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-gray-900">{section.title}</h4>
            <p className="text-xs text-gray-500 mt-1 truncate">
              {sectionPreview(section)}
            </p>
          </div>
        </div>
        {canRegenerate && onRegenerate && (
          <button
            onClick={onRegenerate}
            disabled={regenerating}
            className="shrink-0 text-xs text-gray-500 hover:text-gray-800 border border-gray-300
                       px-2 py-1 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed
                       transition-colors"
          >
            {regenerating ? "Regenererar..." : "Regenerera"}
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create BidPreview component**

Create `src/components/bid-preview.tsx`:

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { BidSection } from "@/lib/types";
import { BidSectionCard } from "./bid-section-card";

interface BidPreviewProps {
  bidId: string;
  initialSections: BidSection[];
  initialStatus: string;
}

export function BidPreview({ bidId, initialSections, initialStatus }: BidPreviewProps) {
  const [sections, setSections] = useState<BidSection[]>(initialSections);
  const [status, setStatus] = useState(initialStatus);
  const [regeneratingKey, setRegeneratingKey] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Poll for progress while generating
  const poll = useCallback(async () => {
    const res = await fetch(`/api/bids/${bidId}`);
    if (!res.ok) return;
    const data = await res.json();
    setSections(data.sections ?? []);
    setStatus(data.status);
  }, [bidId]);

  useEffect(() => {
    if (status !== "generating") return;
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [status, poll]);

  async function regenerateSection(sectionKey: string) {
    setRegeneratingKey(sectionKey);
    setError(null);
    try {
      const res = await fetch(`/api/bids/${bidId}/regenerate/${sectionKey}`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Regeneration failed");
      }
      const data = await res.json();
      setSections((prev) =>
        prev.map((s) => (s.key === sectionKey ? data.section : s))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setRegeneratingKey(null);
    }
  }

  async function downloadPptx() {
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch(`/api/bids/${bidId}/export`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `anbud-${bidId.substring(0, 8)}.pptx`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus("exported");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setDownloading(false);
    }
  }

  const isReady = status === "draft" || status === "exported";
  const sectionCount = sections.length;
  const aiSectionCount = sections.filter((s) => s.type === "ai").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Anbud</h3>
        <span className="text-sm text-gray-500">
          {status === "generating"
            ? `Genererar... (${sectionCount} sektioner klara)`
            : `${sectionCount} sektioner (${aiSectionCount} AI-genererade)`}
        </span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {sections.map((section) => (
          <BidSectionCard
            key={section.key}
            section={section}
            onRegenerate={
              section.type === "ai"
                ? () => regenerateSection(section.key)
                : undefined
            }
            regenerating={regeneratingKey === section.key}
          />
        ))}
      </div>

      {status === "generating" && sections.length === 0 && (
        <div className="text-center py-8 text-gray-400 text-sm">
          Genererar anbudssektioner...
        </div>
      )}

      <button
        onClick={downloadPptx}
        disabled={!isReady || downloading}
        className="w-full bg-gray-900 text-white px-4 py-3 rounded-lg text-sm font-medium
                   hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
      >
        {downloading
          ? "Genererar PowerPoint..."
          : status === "exported"
            ? "Ladda ner igen"
            : "Ladda ner PowerPoint"}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/bid-section-card.tsx src/components/bid-preview.tsx
git commit -m "feat: add BidPreview and BidSectionCard UI components"
```

---

### Task 10: Integration — Wire Up Bid Flow to Analysis Page

**Files:**
- Modify: `src/components/analysis-match-section.tsx`
- Modify: `src/components/go-no-go-result.tsx`

- [ ] **Step 1: Update analysis-match-section.tsx**

In `src/components/analysis-match-section.tsx`, add imports at the top (after existing imports):

```typescript
import { BidPreview } from "./bid-preview";
import { BidSection } from "@/lib/types";
```

Add bid state after the Go/No-Go state variables (after line 47):

```typescript
// Bid state
const [bidId, setBidId] = useState<string | null>(null);
const [bidSections, setBidSections] = useState<BidSection[]>([]);
const [bidStatus, setBidStatus] = useState<string>("generating");
const [bidLoading, setBidLoading] = useState(false);
```

Replace the `proceedToBid` function (lines 134-143) with:

```typescript
async function proceedToBid() {
  if (goNoGoId) {
    await fetch(`/api/go-no-go/${goNoGoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "go" }),
    });
  }

  setBidLoading(true);
  setError(null);

  try {
    const response = await fetch("/api/bids", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        analysisId,
        assessmentId: goNoGoId,
        teamConsultantIds: Array.from(selectedIds),
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Bid generation failed");
    }

    const data = await response.json();
    setBidId(data.id);
    setBidSections(data.sections ?? []);
    setBidStatus(data.status);
  } catch (err) {
    setError(err instanceof Error ? err.message : "Something went wrong");
  } finally {
    setBidLoading(false);
  }
}
```

Add the BidPreview rendering after the GoNoGoResultView block (after the closing `)}` on line 205, before the closing `</>`):

```tsx
{bidLoading && (
  <div className="text-center py-8 text-gray-400 text-sm">
    Skapar anbud och genererar sektioner...
  </div>
)}

{bidId && !bidLoading && (
  <BidPreview
    bidId={bidId}
    initialSections={bidSections}
    initialStatus={bidStatus}
  />
)}
```

- [ ] **Step 2: Update Go/No-Go result button text during bid generation**

In `src/components/go-no-go-result.tsx`, update the `GoNoGoResultProps` interface to add an optional `bidLoading` prop:

```typescript
interface GoNoGoResultProps {
  result: GoNoGoResult;
  assessmentId: string;
  onUnlock: () => void;
  onProceedToBid: () => void;
  bidLoading?: boolean;
}
```

Update the function signature to destructure `bidLoading`:

```typescript
export function GoNoGoResultView({
  result,
  onUnlock,
  onProceedToBid,
  bidLoading,
}: GoNoGoResultProps) {
```

Update the "Gå vidare till anbud" button (around line 166):

```tsx
<button
  onClick={onProceedToBid}
  disabled={bidLoading}
  className="flex-1 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium
             hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
>
  {bidLoading ? "Genererar anbud..." : "Gå vidare till anbud"}
</button>
```

Then in `analysis-match-section.tsx`, pass `bidLoading` to `GoNoGoResultView`:

```tsx
<GoNoGoResultView
  result={goNoGoResult}
  assessmentId={goNoGoId}
  onUnlock={unlockTeam}
  onProceedToBid={proceedToBid}
  bidLoading={bidLoading}
/>
```

- [ ] **Step 3: Verify build**

```bash
cd ~/projects/agentic-dealflow && npx next build
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/analysis-match-section.tsx src/components/go-no-go-result.tsx
git commit -m "feat: wire bid generation flow into analysis page"
```

---

### Task 11: Seed Style Guide for Dev Organization

**Files:**
- Modify: `supabase/migrations/004_bids.sql`

- [ ] **Step 1: Add style guide seed data to migration**

Append to `supabase/migrations/004_bids.sql`:

```sql
-- Seed style guide for development organization
update organizations
set style_guide = '{
  "colors": {
    "primary": "#1A2B4A",
    "primaryLight": "#2D4A7A",
    "secondary": "#E8913A",
    "secondaryLight": "#F4B76E",
    "accent": "#2E8B57",
    "dark": "#1A1A1A",
    "light": "#F5F5F0",
    "muted": "#6B7280"
  },
  "font": "Calibri",
  "logoUrl": ""
}'::jsonb
where id = '00000000-0000-0000-0000-000000000001';
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/004_bids.sql
git commit -m "feat: seed style guide for dev organization"
```

---

### Task 12: Run All Tests and Verify Build

- [ ] **Step 1: Run all tests**

```bash
cd ~/projects/agentic-dealflow && npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 2: Run build**

```bash
cd ~/projects/agentic-dealflow && npx next build
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Verify git status is clean**

```bash
cd ~/projects/agentic-dealflow && git status
```

Expected: No uncommitted changes (beyond pre-existing untracked files).
