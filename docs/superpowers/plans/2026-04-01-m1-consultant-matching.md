# M1: Consultant Profiles & Matching — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable consulting firms to import consultant profiles via CV upload (AI-extracted), automatically match consultants to analyzed RFPs with ranked team proposals, and live re-evaluation when swapping consultants.

**Architecture:** Reuses the existing `document-parser.ts` pipeline for CV text extraction. Adds a Sonnet extraction prompt to turn raw CV text into structured consultant profiles. Matching runs Sonnet against RFP analysis + all org consultants to produce ranked team proposals per seniority level. Team swaps trigger lightweight re-evaluation with diff against previous team.

**Tech Stack:** Next.js 16 (App Router), Tailwind v4, Supabase (PostgreSQL + Storage), Claude Sonnet (`claude-sonnet-4-6`), Vitest

**Design Spec:** `docs/superpowers/specs/2026-03-31-m1-consultant-matching-design.md`

**IMPORTANT — Next.js 16 breaking changes:** Before writing any route handler or page component, check the relevant guide in `node_modules/next/dist/docs/01-app/01-getting-started/`. Dynamic route params are `Promise<{ id: string }>` and must be awaited.

---

## File Structure

### New files

```
supabase/migrations/002_consultant_matching.sql  — New tables + indexes + ALTER existing tables
src/lib/types.ts                                  — MODIFY: add consultant/match types
src/lib/consultant-extractor.ts                   — Sonnet prompt for CV → structured JSON
src/lib/consultant-matcher.ts                     — Sonnet prompt for RFP × consultants → team proposal
src/app/api/consultants/upload/route.ts           — POST: multi-file CV upload + extraction
src/app/api/consultants/route.ts                  — GET: list consultants (with filters)
src/app/api/consultants/[id]/route.ts             — GET, PUT, DELETE single consultant
src/app/api/matches/[analysisId]/route.ts         — POST: trigger/re-run matching
src/app/api/matches/[id]/swap/route.ts            — PUT: swap consultant, get re-evaluation
src/app/consultants/page.tsx                      — Consultant list page
src/app/consultants/[id]/page.tsx                 — Consultant profile page
src/components/consultant-list.tsx                — Table component with filters
src/components/consultant-profile.tsx             — Profile view/edit component
src/components/consultant-upload.tsx              — Multi-file upload form
src/components/team-proposal.tsx                  — Team proposal display + swap UI
src/components/team-evaluation.tsx                — Evaluation + comparison display
tests/lib/consultant-extractor.test.ts            — Extraction unit tests
tests/lib/consultant-matcher.test.ts              — Matcher unit tests
```

### Modified files

```
src/lib/types.ts                                  — Add new interfaces
src/app/analysis/[id]/page.tsx                    — Add team proposal section
src/lib/rfp-analyzer.ts                           — Switch from Opus to Sonnet
src/app/page.tsx                                  — Add navigation to /consultants
src/app/layout.tsx                                — Add nav header
```

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/002_consultant_matching.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Organizations
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  style_guide jsonb,
  created_at timestamptz default now() not null
);

-- Consultants
create table consultants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id),
  name text not null,
  level text not null check (level in ('junior', 'intermediate', 'senior', 'expert')),
  years_experience int,
  summary text,
  raw_cv_text text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Consultant competencies
create table consultant_competencies (
  id uuid primary key default gen_random_uuid(),
  consultant_id uuid references consultants(id) on delete cascade not null,
  competency text not null,
  category text not null check (category in ('technical', 'domain', 'methodology', 'certification'))
);

-- Consultant references (past projects)
create table consultant_references (
  id uuid primary key default gen_random_uuid(),
  consultant_id uuid references consultants(id) on delete cascade not null,
  title text not null,
  description text,
  year int,
  sector text check (sector in ('public', 'private'))
);

-- Matches (team proposals per RFP analysis)
create table matches (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid references analyses(id) not null,
  organization_id uuid references organizations(id),
  team_proposal jsonb not null,
  team_evaluation jsonb,
  created_at timestamptz default now() not null
);

-- Indexes
create index idx_consultants_org on consultants(organization_id);
create index idx_consultants_level on consultants(level);
create index idx_competencies_consultant on consultant_competencies(consultant_id);
create index idx_references_consultant on consultant_references(consultant_id);
create index idx_matches_analysis on matches(analysis_id);

-- Add organization_id to existing tables (nullable — no breaking change)
alter table documents add column organization_id uuid references organizations(id);
alter table analyses add column organization_id uuid references organizations(id);

-- Seed a default organization for development
insert into organizations (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'Nordia Management AB');
```

- [ ] **Step 2: Apply the migration**

Run against local Supabase (or remote if no local):
```bash
# If using Supabase CLI locally:
npx supabase db push

# If remote only, run via Supabase SQL editor or:
npx supabase db push --linked
```

Verify: Check Supabase dashboard that all 5 new tables exist and the 2 ALTER columns are present on `documents` and `analyses`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/002_consultant_matching.sql
git commit -m "feat: add M1 database schema — consultants, competencies, references, matches"
```

---

## Task 2: TypeScript Types

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add the new interfaces to types.ts**

Append these after the existing `AnalysisRecord` interface:

```typescript
// --- M1: Consultant Profiles & Matching ---

export type ConsultantLevel = "junior" | "intermediate" | "senior" | "expert";
export type CompetencyCategory = "technical" | "domain" | "methodology" | "certification";
export type Sector = "public" | "private";

export interface ConsultantCompetency {
  id?: string;
  competency: string;
  category: CompetencyCategory;
}

export interface ConsultantReference {
  id?: string;
  title: string;
  description: string;
  year: number;
  sector: Sector;
}

export interface ConsultantExtraction {
  name: string;
  level: ConsultantLevel;
  yearsExperience: number;
  summary: string;
  competencies: ConsultantCompetency[];
  references: ConsultantReference[];
}

export interface Consultant {
  id: string;
  organizationId: string;
  name: string;
  level: ConsultantLevel;
  yearsExperience: number | null;
  summary: string | null;
  rawCvText: string | null;
  competencies: ConsultantCompetency[];
  references: ConsultantReference[];
  createdAt: string;
  updatedAt: string;
}

export interface ConsultantMatch {
  consultantId: string;
  consultantName: string;
  level: ConsultantLevel;
  score: number;
  reasoning: string;
}

export interface RequirementCoverage {
  met: number;
  total: number;
  details: string[];
}

export interface TeamEvaluation {
  overallFit: string;
  gaps: string[];
  requirementCoverage: {
    must: RequirementCoverage;
    should: RequirementCoverage;
    niceToHave: RequirementCoverage;
  };
}

export interface TeamProposal {
  senior: ConsultantMatch[];
  intermediate: ConsultantMatch[];
  junior: ConsultantMatch[];
}

export interface MatchResult {
  teamProposal: TeamProposal;
  teamEvaluation: TeamEvaluation;
}

export interface MatchRecord {
  id: string;
  analysisId: string;
  organizationId: string;
  teamProposal: TeamProposal;
  teamEvaluation: TeamEvaluation;
  createdAt: string;
}

export interface SwapComparison {
  teamProposal: TeamProposal;
  teamEvaluation: TeamEvaluation;
  comparison: string;
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add M1 TypeScript types — consultants, matching, team proposals"
```

---

## Task 3: Consultant Extractor (Sonnet CV → Structured JSON)

**Files:**
- Create: `src/lib/consultant-extractor.ts`
- Create: `tests/lib/consultant-extractor.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/consultant-extractor.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { extractConsultant } from "@/lib/consultant-extractor";
import { ConsultantExtraction } from "@/lib/types";
import { readFileSync } from "fs";
import path from "path";

describe("extractConsultant", () => {
  it("extracts structured profile from a synthetic CV", async () => {
    const cvPath = path.join(
      process.cwd(),
      "data",
      "synthetic",
      "konsult cv",
      "consultant-1.md"
    );
    const cvText = readFileSync(cvPath, "utf-8");

    const result: ConsultantExtraction = await extractConsultant(cvText);

    // Name extracted
    expect(result.name).toBeTruthy();
    expect(result.name).toContain("Anna");

    // Level and experience
    expect(["junior", "intermediate", "senior", "expert"]).toContain(result.level);
    expect(result.yearsExperience).toBeGreaterThanOrEqual(10);

    // Summary
    expect(result.summary).toBeTruthy();
    expect(result.summary.length).toBeGreaterThan(20);

    // Competencies
    expect(result.competencies.length).toBeGreaterThan(0);
    const comp = result.competencies[0];
    expect(comp).toHaveProperty("competency");
    expect(["technical", "domain", "methodology", "certification"]).toContain(
      comp.category
    );

    // References
    expect(result.references.length).toBeGreaterThan(0);
    const ref = result.references[0];
    expect(ref).toHaveProperty("title");
    expect(ref).toHaveProperty("description");
    expect(ref).toHaveProperty("year");
    expect(["public", "private"]).toContain(ref.sector);
  }, 30000);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/consultant-extractor.test.ts`
Expected: FAIL — `Cannot find module '@/lib/consultant-extractor'`

- [ ] **Step 3: Implement consultant-extractor.ts**

Create `src/lib/consultant-extractor.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { ConsultantExtraction } from "./types";

const client = new Anthropic();

const SYSTEM_PROMPT = `Du är expert på att analysera konsult-CV:n och extrahera strukturerad profildata.
Du läser ett CV-dokument och producerar en strukturerad profil i JSON-format.

Svara ALLTID med giltig JSON som matchar detta schema:
{
  "name": "Konsultens fullständiga namn",
  "level": "junior | intermediate | senior | expert",
  "yearsExperience": 12,
  "summary": "2-3 meningars sammanfattning av konsultens profil och styrkor",
  "competencies": [
    {
      "competency": "Kompetensnamn",
      "category": "technical | domain | methodology | certification"
    }
  ],
  "references": [
    {
      "title": "Uppdragstitel",
      "description": "Kort beskrivning av uppdraget och konsultens roll",
      "year": 2024,
      "sector": "public | private"
    }
  ]
}

Regler:
- level: junior (<3 år), intermediate (3-7 år), senior (7-15 år), expert (>15 år)
- Extrahera ALLA kompetenser som nämns (nyckelkompetenser, verktyg, metoder, certifieringar)
- Kategorisera kompetenser: technical (verktyg, programmering, system), domain (bransch, sektor), methodology (metoder, ramverk), certification (certifieringar, utbildningar utöver examen)
- Extrahera ALLA uppdrag/referensprojekt som nämns
- sector: bedöm om kunden är offentlig (kommun, region, myndighet) eller privat
- Om information saknas, gör en rimlig bedömning baserat på context`;

export async function extractConsultant(
  cvText: string
): Promise<ConsultantExtraction> {
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `Analysera följande konsult-CV och returnera en strukturerad JSON-profil:\n\n${cvText}`,
      },
    ],
    system: SYSTEM_PROMPT,
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON found in Claude response");
  }

  return JSON.parse(jsonMatch[0]) as ConsultantExtraction;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/consultant-extractor.test.ts`
Expected: PASS (1 test, ~10-20s due to Sonnet API call)

- [ ] **Step 5: Commit**

```bash
git add src/lib/consultant-extractor.ts tests/lib/consultant-extractor.test.ts
git commit -m "feat: add consultant CV extractor with Sonnet"
```

---

## Task 4: Consultant Matcher (RFP × Consultants → Team Proposal)

**Files:**
- Create: `src/lib/consultant-matcher.ts`
- Create: `tests/lib/consultant-matcher.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/consultant-matcher.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { matchConsultants, reEvaluateTeam } from "@/lib/consultant-matcher";
import { RfpAnalysis, Consultant, MatchResult, SwapComparison, TeamProposal } from "@/lib/types";

// Minimal mock data — enough to test the prompt + parse logic
const mockAnalysis: RfpAnalysis = {
  title: "Organisationsöversyn",
  client: "Göteborgs stad",
  deadline: "2026-05-01",
  summary: "Översyn av organisationsstruktur inom stadsförvaltningen",
  requirements: [
    { category: "Kompetens", description: "Erfarenhet av organisationsöversyner", priority: "must" },
    { category: "Kompetens", description: "Erfarenhet av offentlig sektor", priority: "must" },
    { category: "Kompetens", description: "Förändringsledning", priority: "should" },
  ],
  evaluationCriteria: [
    { name: "Kompetens", weight: 50, description: "Relevant erfarenhet" },
    { name: "Genomförande", weight: 30, description: "Metodik och plan" },
    { name: "Pris", weight: 20, description: "Timpris" },
  ],
  requiredCompetencies: ["Organisationsöversyner", "Offentlig sektor", "Förändringsledning"],
  estimatedScope: "2 konsulter, 3 månader",
  redFlags: [],
};

const mockConsultants: Consultant[] = [
  {
    id: "c1",
    organizationId: "org1",
    name: "Anna Lindström",
    level: "senior",
    yearsExperience: 12,
    summary: "Senior konsult med fokus på organisationsöversyner i offentlig sektor",
    rawCvText: null,
    competencies: [
      { competency: "Organisationsöversyner", category: "domain" },
      { competency: "Ekonomistyrning", category: "domain" },
      { competency: "Förändringsledning", category: "methodology" },
    ],
    references: [
      { title: "Organisationsöversyn Region Mellansverige", description: "Ledde genomlysning", year: 2024, sector: "public" },
    ],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  },
  {
    id: "c2",
    organizationId: "org1",
    name: "Erik Johansson",
    level: "intermediate",
    yearsExperience: 5,
    summary: "Konsult med erfarenhet av ekonomistyrning och dataanalys",
    rawCvText: null,
    competencies: [
      { competency: "Dataanalys", category: "technical" },
      { competency: "Ekonomistyrning", category: "domain" },
    ],
    references: [
      { title: "Ekonomianalys Borås kommun", description: "Stödde ekonomistyrning", year: 2025, sector: "public" },
    ],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  },
];

describe("matchConsultants", () => {
  it("returns a team proposal with ranked consultants and evaluation", async () => {
    const result: MatchResult = await matchConsultants(mockAnalysis, mockConsultants);

    // Team proposal structure
    expect(result.teamProposal).toHaveProperty("senior");
    expect(result.teamProposal).toHaveProperty("intermediate");
    expect(result.teamProposal).toHaveProperty("junior");

    // At least one senior match (Anna)
    expect(result.teamProposal.senior.length).toBeGreaterThan(0);
    const seniorMatch = result.teamProposal.senior[0];
    expect(seniorMatch.consultantId).toBe("c1");
    expect(seniorMatch.score).toBeGreaterThanOrEqual(0);
    expect(seniorMatch.score).toBeLessThanOrEqual(100);
    expect(seniorMatch.reasoning).toBeTruthy();

    // Evaluation
    expect(result.teamEvaluation.overallFit).toBeTruthy();
    expect(result.teamEvaluation.requirementCoverage).toHaveProperty("must");
    expect(result.teamEvaluation.requirementCoverage.must).toHaveProperty("met");
    expect(result.teamEvaluation.requirementCoverage.must).toHaveProperty("total");
  }, 30000);
});

describe("reEvaluateTeam", () => {
  it("returns a comparison when swapping a consultant", async () => {
    const previousProposal: TeamProposal = {
      senior: [{ consultantId: "c1", consultantName: "Anna Lindström", level: "senior", score: 85, reasoning: "Strong fit" }],
      intermediate: [{ consultantId: "c2", consultantName: "Erik Johansson", level: "intermediate", score: 70, reasoning: "Good support" }],
      junior: [],
    };

    const result: SwapComparison = await reEvaluateTeam(
      mockAnalysis,
      mockConsultants,
      previousProposal
    );

    expect(result.teamProposal).toHaveProperty("senior");
    expect(result.teamEvaluation).toHaveProperty("overallFit");
    expect(result.comparison).toBeTruthy();
  }, 30000);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/consultant-matcher.test.ts`
Expected: FAIL — `Cannot find module '@/lib/consultant-matcher'`

- [ ] **Step 3: Implement consultant-matcher.ts**

Create `src/lib/consultant-matcher.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import {
  RfpAnalysis,
  Consultant,
  MatchResult,
  TeamProposal,
  SwapComparison,
} from "./types";

const client = new Anthropic();

const MATCH_SYSTEM_PROMPT = `Du är expert på att matcha konsulter till förfrågningsunderlag (RFP:er).
Du får en RFP-analys och en lista konsulter. Ranka de bästa konsulterna PER erfarenhetsnivå (senior, intermediate, junior).
Juniors tävlar ALDRIG mot seniors — rankning sker enbart inom samma nivå.

Returnera topp 3 konsulter per nivå (eller färre om det finns färre). Om en nivå saknar konsulter, returnera tom lista.

Svara ALLTID med giltig JSON som matchar detta schema:
{
  "teamProposal": {
    "senior": [{ "consultantId": "uuid", "consultantName": "Namn", "level": "senior", "score": 85, "reasoning": "Varför denna konsult passar" }],
    "intermediate": [...],
    "junior": [...]
  },
  "teamEvaluation": {
    "overallFit": "Övergripande bedömning av teamets matchning",
    "gaps": ["Kompetens eller erfarenhet som saknas i teamet"],
    "requirementCoverage": {
      "must": { "met": 3, "total": 4, "details": ["Krav 1: uppfyllt av Anna", "Krav 2: ej uppfyllt"] },
      "should": { "met": 2, "total": 3, "details": [...] },
      "niceToHave": { "met": 1, "total": 2, "details": [...] }
    }
  }
}`;

function formatConsultantsForPrompt(consultants: Consultant[]): string {
  const grouped: Record<string, Consultant[]> = {};
  for (const c of consultants) {
    if (!grouped[c.level]) grouped[c.level] = [];
    grouped[c.level].push(c);
  }

  return Object.entries(grouped)
    .map(([level, cons]) => {
      const entries = cons.map((c) => {
        const comps = c.competencies.map((co) => co.competency).join(", ");
        const refs = c.references
          .map((r) => `${r.title} (${r.year}, ${r.sector})`)
          .join("; ");
        return `  - ${c.name} [id: ${c.id}]: ${c.summary}\n    Kompetenser: ${comps}\n    Uppdrag: ${refs}`;
      });
      return `${level.toUpperCase()}:\n${entries.join("\n")}`;
    })
    .join("\n\n");
}

export async function matchConsultants(
  analysis: RfpAnalysis,
  consultants: Consultant[]
): Promise<MatchResult> {
  const consultantText = formatConsultantsForPrompt(consultants);

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `Matcha följande konsulter mot detta förfrågningsunderlag.

## RFP-analys
${JSON.stringify(analysis, null, 2)}

## Tillgängliga konsulter
${consultantText}`,
      },
    ],
    system: MATCH_SYSTEM_PROMPT,
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON found in Claude response");
  }

  return JSON.parse(jsonMatch[0]) as MatchResult;
}

const REEVALUATE_SYSTEM_PROMPT = `Du är expert på att bedöma konsultteam mot förfrågningsunderlag.
Du får en RFP-analys, ett nytt team, och det tidigare teamförslaget.
Bedöm det nya teamet och jämför mot det tidigare.

Svara ALLTID med giltig JSON:
{
  "teamProposal": { "senior": [...], "intermediate": [...], "junior": [...] },
  "teamEvaluation": {
    "overallFit": "...",
    "gaps": [...],
    "requirementCoverage": { "must": {...}, "should": {...}, "niceToHave": {...} }
  },
  "comparison": "Jämförelse med tidigare team: vad har blivit bättre/sämre, t.ex. 'Tappade Power BI-erfarenhet, fick starkare offentlig-sektor-referenser'"
}`;

export async function reEvaluateTeam(
  analysis: RfpAnalysis,
  consultants: Consultant[],
  previousProposal: TeamProposal
): Promise<SwapComparison> {
  const consultantText = formatConsultantsForPrompt(consultants);

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `Bedöm detta konsultteam mot RFP:en och jämför med det tidigare förslaget.

## RFP-analys
${JSON.stringify(analysis, null, 2)}

## Tillgängliga konsulter (det nya teamet)
${consultantText}

## Tidigare teamförslag
${JSON.stringify(previousProposal, null, 2)}`,
      },
    ],
    system: REEVALUATE_SYSTEM_PROMPT,
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON found in Claude response");
  }

  return JSON.parse(jsonMatch[0]) as SwapComparison;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/consultant-matcher.test.ts`
Expected: PASS (2 tests, ~20-30s due to Sonnet API calls)

- [ ] **Step 5: Commit**

```bash
git add src/lib/consultant-matcher.ts tests/lib/consultant-matcher.test.ts
git commit -m "feat: add consultant matcher with team proposals and re-evaluation"
```

---

## Task 5: Switch RFP Analyzer from Opus to Sonnet

**Files:**
- Modify: `src/lib/rfp-analyzer.ts`

- [ ] **Step 1: Run existing test to confirm baseline**

Run: `npx vitest run tests/lib/rfp-analyzer.test.ts`
Expected: PASS

- [ ] **Step 2: Change the model in rfp-analyzer.ts**

In `src/lib/rfp-analyzer.ts`, change line 42:

```typescript
// Before:
model: "claude-opus-4-6",

// After:
model: "claude-sonnet-4-6",
```

- [ ] **Step 3: Run the test to verify Sonnet works**

Run: `npx vitest run tests/lib/rfp-analyzer.test.ts`
Expected: PASS (should be faster than before)

- [ ] **Step 4: Commit**

```bash
git add src/lib/rfp-analyzer.ts
git commit -m "refactor: switch RFP analyzer from Opus to Sonnet per model strategy"
```

---

## Task 6: CV Upload API Route

**Files:**
- Create: `src/app/api/consultants/upload/route.ts`

- [ ] **Step 1: Implement the upload route**

Create `src/app/api/consultants/upload/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { parseDocument } from "@/lib/document-parser";
import { extractConsultant } from "@/lib/consultant-extractor";
import { createServiceClient } from "@/lib/supabase";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

interface UploadResult {
  fileName: string;
  consultantId: string | null;
  error: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const results: UploadResult[] = [];

    for (const file of files) {
      try {
        const buffer = Buffer.from(await file.arrayBuffer());

        // Parse document text
        const rawText = await parseDocument(buffer, file.name);

        // Extract structured profile with Sonnet
        const extraction = await extractConsultant(rawText);

        // Insert consultant
        const { data: consultant, error: consultantError } = await supabase
          .from("consultants")
          .insert({
            organization_id: DEFAULT_ORG_ID,
            name: extraction.name,
            level: extraction.level,
            years_experience: extraction.yearsExperience,
            summary: extraction.summary,
            raw_cv_text: rawText,
          })
          .select()
          .single();

        if (consultantError) throw new Error(consultantError.message);

        // Insert competencies
        if (extraction.competencies.length > 0) {
          const { error: compError } = await supabase
            .from("consultant_competencies")
            .insert(
              extraction.competencies.map((c) => ({
                consultant_id: consultant.id,
                competency: c.competency,
                category: c.category,
              }))
            );
          if (compError) throw new Error(compError.message);
        }

        // Insert references
        if (extraction.references.length > 0) {
          const { error: refError } = await supabase
            .from("consultant_references")
            .insert(
              extraction.references.map((r) => ({
                consultant_id: consultant.id,
                title: r.title,
                description: r.description,
                year: r.year,
                sector: r.sector,
              }))
            );
          if (refError) throw new Error(refError.message);
        }

        results.push({
          fileName: file.name,
          consultantId: consultant.id,
          error: null,
        });
      } catch (err) {
        results.push({
          fileName: file.name,
          consultantId: null,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    const successful = results.filter((r) => r.consultantId !== null);
    const failed = results.filter((r) => r.error !== null);

    return NextResponse.json({
      total: files.length,
      successful: successful.length,
      failed: failed.length,
      results,
    });
  } catch (error) {
    console.error("Upload failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/consultants/upload/route.ts
git commit -m "feat: add CV upload API route with bulk extraction"
```

---

## Task 7: Consultant CRUD API Routes

**Files:**
- Create: `src/app/api/consultants/route.ts`
- Create: `src/app/api/consultants/[id]/route.ts`

- [ ] **Step 1: Implement the list route**

Create `src/app/api/consultants/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

export async function GET(request: NextRequest) {
  const supabase = createServiceClient();
  const { searchParams } = new URL(request.url);
  const level = searchParams.get("level");
  const competency = searchParams.get("competency");

  let query = supabase
    .from("consultants")
    .select(`
      *,
      consultant_competencies (id, competency, category),
      consultant_references (id, title, description, year, sector)
    `)
    .eq("organization_id", DEFAULT_ORG_ID)
    .order("name");

  if (level) {
    query = query.eq("level", level);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Filter by competency if provided (post-query since it's a nested relation)
  let consultants = data;
  if (competency) {
    consultants = data.filter((c: Record<string, unknown>) =>
      (c.consultant_competencies as Array<{ competency: string }>).some(
        (cc) => cc.competency.toLowerCase().includes(competency.toLowerCase())
      )
    );
  }

  return NextResponse.json(consultants);
}
```

- [ ] **Step 2: Implement the single consultant route**

Create `src/app/api/consultants/[id]/route.ts`:

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
    .from("consultants")
    .select(`
      *,
      consultant_competencies (id, competency, category),
      consultant_references (id, title, description, year, sector)
    `)
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const supabase = createServiceClient();
  const body = await request.json();

  // Update consultant base fields
  const { error: updateError } = await supabase
    .from("consultants")
    .update({
      name: body.name,
      level: body.level,
      years_experience: body.yearsExperience,
      summary: body.summary,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Replace competencies if provided
  if (body.competencies) {
    await supabase
      .from("consultant_competencies")
      .delete()
      .eq("consultant_id", id);

    if (body.competencies.length > 0) {
      const { error: compError } = await supabase
        .from("consultant_competencies")
        .insert(
          body.competencies.map((c: { competency: string; category: string }) => ({
            consultant_id: id,
            competency: c.competency,
            category: c.category,
          }))
        );
      if (compError) {
        return NextResponse.json({ error: compError.message }, { status: 500 });
      }
    }
  }

  // Replace references if provided
  if (body.references) {
    await supabase
      .from("consultant_references")
      .delete()
      .eq("consultant_id", id);

    if (body.references.length > 0) {
      const { error: refError } = await supabase
        .from("consultant_references")
        .insert(
          body.references.map(
            (r: { title: string; description: string; year: number; sector: string }) => ({
              consultant_id: id,
              title: r.title,
              description: r.description,
              year: r.year,
              sector: r.sector,
            })
          )
        );
      if (refError) {
        return NextResponse.json({ error: refError.message }, { status: 500 });
      }
    }
  }

  // Return updated consultant
  const { data } = await supabase
    .from("consultants")
    .select(`
      *,
      consultant_competencies (id, competency, category),
      consultant_references (id, title, description, year, sector)
    `)
    .eq("id", id)
    .single();

  return NextResponse.json(data);
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { error } = await supabase.from("consultants").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/consultants/route.ts src/app/api/consultants/[id]/route.ts
git commit -m "feat: add consultant CRUD API routes"
```

---

## Task 8: Matching API Routes

**Files:**
- Create: `src/app/api/matches/[analysisId]/route.ts`
- Create: `src/app/api/matches/[id]/swap/route.ts`

- [ ] **Step 1: Implement the matching trigger route**

Create `src/app/api/matches/[analysisId]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { matchConsultants } from "@/lib/consultant-matcher";
import { RfpAnalysis, Consultant } from "@/lib/types";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

interface RouteContext {
  params: Promise<{ analysisId: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteContext) {
  const { analysisId } = await params;
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

  // Fetch all consultants for the org
  const { data: consultantRows, error: consultantError } = await supabase
    .from("consultants")
    .select(`
      *,
      consultant_competencies (id, competency, category),
      consultant_references (id, title, description, year, sector)
    `)
    .eq("organization_id", DEFAULT_ORG_ID);

  if (consultantError) {
    return NextResponse.json({ error: consultantError.message }, { status: 500 });
  }

  if (!consultantRows || consultantRows.length === 0) {
    return NextResponse.json(
      { error: "No consultants found. Upload CVs first." },
      { status: 400 }
    );
  }

  // Map DB rows to Consultant type
  const consultants: Consultant[] = consultantRows.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    organizationId: row.organization_id as string,
    name: row.name as string,
    level: row.level as Consultant["level"],
    yearsExperience: row.years_experience as number | null,
    summary: row.summary as string | null,
    rawCvText: null,
    competencies: (row.consultant_competencies as Array<{ competency: string; category: string }>) || [],
    references: (row.consultant_references as Array<{ title: string; description: string; year: number; sector: string }>) || [],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }));

  // Run matching
  const result = await matchConsultants(rfpAnalysis, consultants);

  // Save match
  const { data: matchRecord, error: matchError } = await supabase
    .from("matches")
    .insert({
      analysis_id: analysisId,
      organization_id: DEFAULT_ORG_ID,
      team_proposal: result.teamProposal,
      team_evaluation: result.teamEvaluation,
    })
    .select()
    .single();

  if (matchError) {
    return NextResponse.json({ error: matchError.message }, { status: 500 });
  }

  return NextResponse.json({
    id: matchRecord.id,
    ...result,
  });
}
```

- [ ] **Step 2: Implement the swap route**

Create `src/app/api/matches/[id]/swap/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { reEvaluateTeam } from "@/lib/consultant-matcher";
import { RfpAnalysis, Consultant, TeamProposal } from "@/lib/types";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const supabase = createServiceClient();
  const body = await request.json();

  // body.teamProposal = the new team after swap
  const newTeamProposal = body.teamProposal as TeamProposal;

  // Fetch original match to get analysis_id and previous proposal
  const { data: matchRow, error: matchError } = await supabase
    .from("matches")
    .select("analysis_id, team_proposal")
    .eq("id", id)
    .single();

  if (matchError || !matchRow) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  const previousProposal = matchRow.team_proposal as TeamProposal;

  // Fetch analysis
  const { data: analysisRow } = await supabase
    .from("analyses")
    .select("analysis")
    .eq("id", matchRow.analysis_id)
    .single();

  if (!analysisRow) {
    return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
  }

  const rfpAnalysis = analysisRow.analysis as RfpAnalysis;

  // Fetch all consultants in the new team for full context
  const allIds = [
    ...newTeamProposal.senior,
    ...newTeamProposal.intermediate,
    ...newTeamProposal.junior,
  ].map((c) => c.consultantId);

  const { data: consultantRows } = await supabase
    .from("consultants")
    .select(`
      *,
      consultant_competencies (id, competency, category),
      consultant_references (id, title, description, year, sector)
    `)
    .in("id", allIds);

  const consultants: Consultant[] = (consultantRows || []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    organizationId: row.organization_id as string,
    name: row.name as string,
    level: row.level as Consultant["level"],
    yearsExperience: row.years_experience as number | null,
    summary: row.summary as string | null,
    rawCvText: null,
    competencies: (row.consultant_competencies as Array<{ competency: string; category: string }>) || [],
    references: (row.consultant_references as Array<{ title: string; description: string; year: number; sector: string }>) || [],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }));

  // Re-evaluate
  const result = await reEvaluateTeam(rfpAnalysis, consultants, previousProposal);

  // Save as NEW match row (preserves history)
  const { data: newMatch, error: saveError } = await supabase
    .from("matches")
    .insert({
      analysis_id: matchRow.analysis_id,
      organization_id: DEFAULT_ORG_ID,
      team_proposal: result.teamProposal,
      team_evaluation: result.teamEvaluation,
    })
    .select()
    .single();

  if (saveError) {
    return NextResponse.json({ error: saveError.message }, { status: 500 });
  }

  return NextResponse.json({
    id: newMatch.id,
    previousMatchId: id,
    ...result,
  });
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/matches/
git commit -m "feat: add matching and swap API routes"
```

---

## Task 9: Navigation and Layout

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add a nav header to layout.tsx**

Replace the `<body>` content in `src/app/layout.tsx`:

```typescript
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Agentic Dealflow",
  description: "AI-driven RFP analysis and consultant matching",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="sv"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <nav className="border-b border-gray-100">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-6">
            <Link href="/" className="font-bold text-lg">
              Agentic Dealflow
            </Link>
            <Link
              href="/"
              className="text-sm text-gray-500 hover:text-gray-900"
            >
              Analysera RFP
            </Link>
            <Link
              href="/consultants"
              className="text-sm text-gray-500 hover:text-gray-900"
            >
              Konsulter
            </Link>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Simplify the home page (nav is now in layout)**

Update `src/app/page.tsx` — remove the redundant heading since the nav provides context:

```typescript
import { UploadForm } from "@/components/upload-form";

export default function Home() {
  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-4 py-16">
        <div className="mb-12">
          <h1 className="text-3xl font-bold">Analysera forfrågningsunderlag</h1>
          <p className="text-gray-500 mt-2">
            Ladda upp ett forfrågningsunderlag for strukturerad kravanalys.
          </p>
        </div>
        <UploadForm />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx src/app/page.tsx
git commit -m "feat: add navigation header with consultant link"
```

---

## Task 10: Consultant Upload Component

**Files:**
- Create: `src/components/consultant-upload.tsx`

- [ ] **Step 1: Implement the upload component**

Create `src/components/consultant-upload.tsx`:

```typescript
"use client";

import { useState } from "react";

interface UploadResult {
  fileName: string;
  consultantId: string | null;
  error: string | null;
}

interface UploadResponse {
  total: number;
  successful: number;
  failed: number;
  results: UploadResult[];
}

interface ConsultantUploadProps {
  onComplete: () => void;
}

export function ConsultantUpload({ onComplete }: ConsultantUploadProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<UploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (files.length === 0) return;

    setLoading(true);
    setError(null);
    setProgress(null);

    try {
      const formData = new FormData();
      for (const file of files) {
        formData.append("files", file);
      }

      const response = await fetch("/api/consultants/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Upload failed");
      }

      const data: UploadResponse = await response.json();
      setProgress(data);
      setFiles([]);
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
          <input
            type="file"
            accept=".docx,.doc,.md,.txt"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files || []))}
            className="hidden"
            id="cv-upload"
          />
          <label htmlFor="cv-upload" className="cursor-pointer text-gray-600 hover:text-gray-900">
            {files.length > 0 ? (
              <span className="font-medium">{files.length} fil(er) valda</span>
            ) : (
              <div>
                <p className="font-medium">Ladda upp CV:n</p>
                <p className="text-sm text-gray-400 mt-1">Word, Markdown eller textfil. Flera filer samtidigt.</p>
              </div>
            )}
          </label>
        </div>

        {files.length > 0 && (
          <ul className="text-sm text-gray-500 space-y-1">
            {files.map((f, i) => (
              <li key={i}>{f.name}</li>
            ))}
          </ul>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={files.length === 0 || loading}
          className="w-full bg-gray-900 text-white py-2.5 px-6 rounded-lg font-medium
                     hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Extraherar profiler..." : `Ladda upp ${files.length > 0 ? `(${files.length})` : ""}`}
        </button>
      </form>

      {progress && (
        <div className="bg-gray-50 p-4 rounded-lg text-sm space-y-2">
          <p className="font-medium">
            {progress.successful} av {progress.total} lyckades
          </p>
          {progress.results.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className={r.error ? "text-red-500" : "text-green-500"}>
                {r.error ? "x" : "v"}
              </span>
              <span>{r.fileName}</span>
              {r.error && <span className="text-red-400 text-xs">({r.error})</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/consultant-upload.tsx
git commit -m "feat: add multi-file CV upload component"
```

---

## Task 11: Consultant List Component and Page

**Files:**
- Create: `src/components/consultant-list.tsx`
- Create: `src/app/consultants/page.tsx`

- [ ] **Step 1: Implement the list component**

Create `src/components/consultant-list.tsx`:

```typescript
"use client";

import { useState } from "react";
import Link from "next/link";

interface ConsultantRow {
  id: string;
  name: string;
  level: string;
  years_experience: number | null;
  summary: string | null;
  consultant_competencies: Array<{ competency: string; category: string }>;
}

interface ConsultantListProps {
  initialData: ConsultantRow[];
}

const LEVEL_LABELS: Record<string, string> = {
  junior: "Junior",
  intermediate: "Medel",
  senior: "Senior",
  expert: "Expert",
};

const LEVEL_COLORS: Record<string, string> = {
  junior: "bg-green-100 text-green-700",
  intermediate: "bg-blue-100 text-blue-700",
  senior: "bg-purple-100 text-purple-700",
  expert: "bg-amber-100 text-amber-700",
};

export function ConsultantList({ initialData }: ConsultantListProps) {
  const [filterLevel, setFilterLevel] = useState<string>("");
  const [filterCompetency, setFilterCompetency] = useState<string>("");

  const filtered = initialData.filter((c) => {
    if (filterLevel && c.level !== filterLevel) return false;
    if (filterCompetency) {
      const match = c.consultant_competencies.some((cc) =>
        cc.competency.toLowerCase().includes(filterCompetency.toLowerCase())
      );
      if (!match) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-3">
        <select
          value={filterLevel}
          onChange={(e) => setFilterLevel(e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm"
        >
          <option value="">Alla nivåer</option>
          <option value="junior">Junior</option>
          <option value="intermediate">Medel</option>
          <option value="senior">Senior</option>
          <option value="expert">Expert</option>
        </select>
        <input
          type="text"
          placeholder="Filtrera kompetens..."
          value={filterCompetency}
          onChange={(e) => setFilterCompetency(e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm flex-1"
        />
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <p className="text-gray-400 text-sm py-8 text-center">
          {initialData.length === 0
            ? "Inga konsulter ännu. Ladda upp CV:n för att börja."
            : "Inga konsulter matchar filtret."}
        </p>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Namn</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Nivå</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Kompetenser</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/consultants/${c.id}`}
                      className="font-medium text-gray-900 hover:underline"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded ${LEVEL_COLORS[c.level] || ""}`}>
                      {LEVEL_LABELS[c.level] || c.level}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {c.consultant_competencies.slice(0, 4).map((cc, i) => (
                        <span key={i} className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs">
                          {cc.competency}
                        </span>
                      ))}
                      {c.consultant_competencies.length > 4 && (
                        <span className="text-gray-400 text-xs">
                          +{c.consultant_competencies.length - 4}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Implement the consultants page**

Create `src/app/consultants/page.tsx`:

```typescript
import { createServiceClient } from "@/lib/supabase";
import { ConsultantList } from "@/components/consultant-list";
import { ConsultantUploadWrapper } from "@/components/consultant-upload-wrapper";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

export default async function ConsultantsPage() {
  const supabase = createServiceClient();

  const { data: consultants } = await supabase
    .from("consultants")
    .select(`
      id, name, level, years_experience, summary,
      consultant_competencies (competency, category)
    `)
    .eq("organization_id", DEFAULT_ORG_ID)
    .order("name");

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Konsulter</h1>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <ConsultantList initialData={consultants || []} />
          </div>
          <div>
            <h2 className="text-lg font-semibold mb-4">Ladda upp CV:n</h2>
            <ConsultantUploadWrapper />
          </div>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Create the upload wrapper (client component that handles refresh)**

Create `src/components/consultant-upload-wrapper.tsx`:

```typescript
"use client";

import { useRouter } from "next/navigation";
import { ConsultantUpload } from "./consultant-upload";

export function ConsultantUploadWrapper() {
  const router = useRouter();

  return <ConsultantUpload onComplete={() => router.refresh()} />;
}
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/consultant-list.tsx src/components/consultant-upload-wrapper.tsx src/app/consultants/page.tsx
git commit -m "feat: add consultant list page with filters and upload"
```

---

## Task 12: Consultant Profile Page

**Files:**
- Create: `src/components/consultant-profile.tsx`
- Create: `src/app/consultants/[id]/page.tsx`

- [ ] **Step 1: Implement the profile component**

Create `src/components/consultant-profile.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Competency {
  id: string;
  competency: string;
  category: string;
}

interface Reference {
  id: string;
  title: string;
  description: string;
  year: number;
  sector: string;
}

interface ConsultantData {
  id: string;
  name: string;
  level: string;
  years_experience: number | null;
  summary: string | null;
  consultant_competencies: Competency[];
  consultant_references: Reference[];
}

interface ConsultantProfileProps {
  consultant: ConsultantData;
}

const LEVEL_LABELS: Record<string, string> = {
  junior: "Junior",
  intermediate: "Medel",
  senior: "Senior",
  expert: "Expert",
};

const CATEGORY_LABELS: Record<string, string> = {
  technical: "Teknisk",
  domain: "Domän",
  methodology: "Metodik",
  certification: "Certifiering",
};

export function ConsultantProfile({ consultant }: ConsultantProfileProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(consultant.name);
  const [level, setLevel] = useState(consultant.level);
  const [summary, setSummary] = useState(consultant.summary || "");
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function handleSave() {
    setSaving(true);
    try {
      const response = await fetch(`/api/consultants/${consultant.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          level,
          summary,
          yearsExperience: consultant.years_experience,
          competencies: consultant.consultant_competencies.map((c) => ({
            competency: c.competency,
            category: c.category,
          })),
          references: consultant.consultant_references.map((r) => ({
            title: r.title,
            description: r.description,
            year: r.year,
            sector: r.sector,
          })),
        }),
      });

      if (!response.ok) throw new Error("Save failed");

      setEditing(false);
      router.refresh();
    } catch {
      alert("Kunde inte spara. Försök igen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          {editing ? (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-2xl font-bold border-b border-gray-300 focus:outline-none focus:border-gray-900"
            />
          ) : (
            <h1 className="text-2xl font-bold">{consultant.name}</h1>
          )}
          <div className="flex items-center gap-3 mt-2">
            {editing ? (
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm"
              >
                <option value="junior">Junior</option>
                <option value="intermediate">Medel</option>
                <option value="senior">Senior</option>
                <option value="expert">Expert</option>
              </select>
            ) : (
              <span className="text-sm text-gray-500">
                {LEVEL_LABELS[consultant.level] || consultant.level}
              </span>
            )}
            {consultant.years_experience && (
              <span className="text-sm text-gray-400">
                {consultant.years_experience} års erfarenhet
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-gray-900 text-white px-4 py-1.5 rounded text-sm hover:bg-gray-800 disabled:bg-gray-300"
              >
                {saving ? "Sparar..." : "Spara"}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="border border-gray-300 px-4 py-1.5 rounded text-sm hover:bg-gray-50"
              >
                Avbryt
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="border border-gray-300 px-4 py-1.5 rounded text-sm hover:bg-gray-50"
            >
              Redigera
            </button>
          )}
        </div>
      </div>

      {/* Summary */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Sammanfattning</h2>
        {editing ? (
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={3}
            className="w-full border border-gray-300 rounded p-3 text-sm focus:outline-none focus:border-gray-900"
          />
        ) : (
          <p className="text-gray-700">{consultant.summary || "Ingen sammanfattning"}</p>
        )}
      </section>

      {/* Competencies */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Kompetenser</h2>
        <div className="flex flex-wrap gap-2">
          {consultant.consultant_competencies.map((c) => (
            <span
              key={c.id}
              className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm"
            >
              {c.competency}
              <span className="text-blue-400 ml-1 text-xs">
                ({CATEGORY_LABELS[c.category] || c.category})
              </span>
            </span>
          ))}
        </div>
      </section>

      {/* References */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Uppdrag</h2>
        <div className="space-y-3">
          {consultant.consultant_references.map((r) => (
            <div key={r.id} className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium">{r.title}</span>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span>{r.year}</span>
                  <span className={r.sector === "public" ? "text-blue-500" : "text-gray-500"}>
                    {r.sector === "public" ? "Offentlig" : "Privat"}
                  </span>
                </div>
              </div>
              <p className="text-sm text-gray-600">{r.description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Implement the profile page**

Create `src/app/consultants/[id]/page.tsx`:

```typescript
import { createServiceClient } from "@/lib/supabase";
import { ConsultantProfile } from "@/components/consultant-profile";
import Link from "next/link";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ConsultantPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("consultants")
    .select(`
      *,
      consultant_competencies (id, competency, category),
      consultant_references (id, title, description, year, sector)
    `)
    .eq("id", id)
    .single();

  if (error || !data) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <Link
          href="/consultants"
          className="text-sm text-gray-400 hover:text-gray-600 mb-8 inline-block"
        >
          &larr; Alla konsulter
        </Link>
        <ConsultantProfile consultant={data} />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/consultant-profile.tsx src/app/consultants/[id]/page.tsx
git commit -m "feat: add consultant profile page with edit support"
```

---

## Task 13: Team Proposal and Evaluation Components

**Files:**
- Create: `src/components/team-proposal.tsx`
- Create: `src/components/team-evaluation.tsx`

- [ ] **Step 1: Implement team-proposal.tsx**

Create `src/components/team-proposal.tsx`:

```typescript
"use client";

import { useState } from "react";

interface ConsultantMatch {
  consultantId: string;
  consultantName: string;
  level: string;
  score: number;
  reasoning: string;
}

interface TeamProposalData {
  senior: ConsultantMatch[];
  intermediate: ConsultantMatch[];
  junior: ConsultantMatch[];
}

interface AllConsultant {
  id: string;
  name: string;
  level: string;
}

interface TeamProposalProps {
  matchId: string;
  proposal: TeamProposalData;
  allConsultants: AllConsultant[];
  onSwap: (matchId: string, newProposal: TeamProposalData) => void;
  swapping: boolean;
}

const LEVEL_ORDER = ["senior", "intermediate", "junior"] as const;
const LEVEL_LABELS: Record<string, string> = {
  senior: "Senior",
  intermediate: "Medel",
  junior: "Junior",
};

export function TeamProposal({
  matchId,
  proposal,
  allConsultants,
  onSwap,
  swapping,
}: TeamProposalProps) {
  const [expandedLevel, setExpandedLevel] = useState<string | null>(null);

  function handleSwap(level: string, index: number, newConsultantId: string) {
    const consultant = allConsultants.find((c) => c.id === newConsultantId);
    if (!consultant) return;

    const newProposal = { ...proposal };
    const levelKey = level as keyof TeamProposalData;
    const updated = [...newProposal[levelKey]];
    updated[index] = {
      ...updated[index],
      consultantId: newConsultantId,
      consultantName: consultant.name,
    };
    newProposal[levelKey] = updated;

    onSwap(matchId, newProposal);
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Teamförslag</h3>
      {LEVEL_ORDER.map((level) => {
        const matches = proposal[level];
        if (matches.length === 0) return null;

        const available = allConsultants.filter((c) => c.level === level);

        return (
          <div key={level} className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setExpandedLevel(expandedLevel === level ? null : level)}
              className="w-full px-4 py-3 bg-gray-50 flex items-center justify-between text-left"
            >
              <span className="font-medium">{LEVEL_LABELS[level]}</span>
              <span className="text-sm text-gray-400">{matches.length} konsult(er)</span>
            </button>

            <div className="divide-y divide-gray-100">
              {matches.map((match, idx) => (
                <div key={match.consultantId} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-3">
                      <span className="font-medium">{match.consultantName}</span>
                      <span className="text-xs font-mono bg-gray-200 px-2 py-0.5 rounded">
                        {match.score}/100
                      </span>
                    </div>
                    <select
                      value={match.consultantId}
                      onChange={(e) => handleSwap(level, idx, e.target.value)}
                      disabled={swapping}
                      className="text-xs border border-gray-200 rounded px-2 py-1"
                    >
                      {available.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="text-sm text-gray-600">{match.reasoning}</p>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Implement team-evaluation.tsx**

Create `src/components/team-evaluation.tsx`:

```typescript
interface RequirementCoverage {
  met: number;
  total: number;
  details: string[];
}

interface TeamEvaluationData {
  overallFit: string;
  gaps: string[];
  requirementCoverage: {
    must: RequirementCoverage;
    should: RequirementCoverage;
    niceToHave: RequirementCoverage;
  };
}

interface TeamEvaluationProps {
  evaluation: TeamEvaluationData;
  comparison?: string;
}

function CoverageBar({ label, coverage }: { label: string; coverage: RequirementCoverage }) {
  const pct = coverage.total > 0 ? Math.round((coverage.met / coverage.total) * 100) : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-gray-500">
          {coverage.met}/{coverage.total} ({pct}%)
        </span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-gray-900 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      {coverage.details.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {coverage.details.map((d, i) => (
            <li key={i} className="text-xs text-gray-500">{d}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TeamEvaluation({ evaluation, comparison }: TeamEvaluationProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Teambedömning</h3>

      {/* Comparison banner */}
      {comparison && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded text-sm">
          {comparison}
        </div>
      )}

      {/* Overall fit */}
      <p className="text-gray-700">{evaluation.overallFit}</p>

      {/* Requirement coverage */}
      <div className="space-y-3">
        <CoverageBar label="Ska-krav" coverage={evaluation.requirementCoverage.must} />
        <CoverageBar label="Bör-krav" coverage={evaluation.requirementCoverage.should} />
        <CoverageBar label="Meriterande" coverage={evaluation.requirementCoverage.niceToHave} />
      </div>

      {/* Gaps */}
      {evaluation.gaps.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-1">Saknas i teamet</h4>
          <ul className="space-y-1">
            {evaluation.gaps.map((gap, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="text-amber-500 shrink-0">!</span>
                <span className="text-gray-600">{gap}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/team-proposal.tsx src/components/team-evaluation.tsx
git commit -m "feat: add team proposal and evaluation components"
```

---

## Task 14: Extend Analysis Page with Team Matching

**Files:**
- Modify: `src/app/analysis/[id]/page.tsx`
- Create: `src/components/analysis-match-section.tsx`

- [ ] **Step 1: Create the match section client component**

Create `src/components/analysis-match-section.tsx`:

```typescript
"use client";

import { useState } from "react";
import { TeamProposal } from "./team-proposal";
import { TeamEvaluation } from "./team-evaluation";

interface ConsultantMatch {
  consultantId: string;
  consultantName: string;
  level: string;
  score: number;
  reasoning: string;
}

interface TeamProposalData {
  senior: ConsultantMatch[];
  intermediate: ConsultantMatch[];
  junior: ConsultantMatch[];
}

interface RequirementCoverage {
  met: number;
  total: number;
  details: string[];
}

interface TeamEvaluationData {
  overallFit: string;
  gaps: string[];
  requirementCoverage: {
    must: RequirementCoverage;
    should: RequirementCoverage;
    niceToHave: RequirementCoverage;
  };
}

interface MatchData {
  id: string;
  team_proposal: TeamProposalData;
  team_evaluation: TeamEvaluationData;
}

interface AllConsultant {
  id: string;
  name: string;
  level: string;
}

interface AnalysisMatchSectionProps {
  analysisId: string;
  latestMatch: MatchData | null;
  allConsultants: AllConsultant[];
}

export function AnalysisMatchSection({
  analysisId,
  latestMatch,
  allConsultants,
}: AnalysisMatchSectionProps) {
  const [match, setMatch] = useState<MatchData | null>(latestMatch);
  const [loading, setLoading] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [comparison, setComparison] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function triggerMatching() {
    setLoading(true);
    setError(null);
    setComparison(null);

    try {
      const response = await fetch(`/api/matches/${analysisId}`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Matching failed");
      }

      const data = await response.json();
      setMatch({
        id: data.id,
        team_proposal: data.teamProposal,
        team_evaluation: data.teamEvaluation,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleSwap(matchId: string, newProposal: TeamProposalData) {
    setSwapping(true);
    setError(null);

    try {
      const response = await fetch(`/api/matches/${matchId}/swap`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamProposal: newProposal }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Swap failed");
      }

      const data = await response.json();
      setMatch({
        id: data.id,
        team_proposal: data.teamProposal,
        team_evaluation: data.teamEvaluation,
      });
      setComparison(data.comparison);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSwapping(false);
    }
  }

  return (
    <div className="border-t border-gray-200 pt-8 mt-8 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Teammatchning</h2>
        <button
          onClick={triggerMatching}
          disabled={loading}
          className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium
                     hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {loading
            ? "Matchar..."
            : match
              ? "Kör om matchning"
              : "Matcha konsulter"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
          {error}
        </div>
      )}

      {match && (
        <>
          <TeamProposal
            matchId={match.id}
            proposal={match.team_proposal}
            allConsultants={allConsultants}
            onSwap={handleSwap}
            swapping={swapping}
          />
          <TeamEvaluation
            evaluation={match.team_evaluation}
            comparison={comparison || undefined}
          />
        </>
      )}

      {!match && !loading && (
        <p className="text-gray-400 text-sm text-center py-8">
          Klicka &quot;Matcha konsulter&quot; för att generera ett teamförslag.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update the analysis page to include the match section**

Replace `src/app/analysis/[id]/page.tsx`:

```typescript
import { createServiceClient } from "@/lib/supabase";
import { AnalysisResult } from "@/components/analysis-result";
import { AnalysisMatchSection } from "@/components/analysis-match-section";
import { RfpAnalysis } from "@/lib/types";
import Link from "next/link";
import { notFound } from "next/navigation";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AnalysisPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = createServiceClient();

  // Fetch analysis
  const { data, error } = await supabase
    .from("analyses")
    .select(`
      id,
      analysis,
      created_at,
      documents (
        file_name,
        file_url
      )
    `)
    .eq("id", id)
    .single();

  if (error || !data) {
    notFound();
  }

  const document = data.documents as unknown as {
    file_name: string;
    file_url: string;
  };

  // Fetch latest match for this analysis
  const { data: matchRows } = await supabase
    .from("matches")
    .select("id, team_proposal, team_evaluation")
    .eq("analysis_id", id)
    .order("created_at", { ascending: false })
    .limit(1);

  const latestMatch = matchRows && matchRows.length > 0 ? matchRows[0] : null;

  // Fetch all consultants for swap dropdowns
  const { data: consultantRows } = await supabase
    .from("consultants")
    .select("id, name, level")
    .eq("organization_id", DEFAULT_ORG_ID)
    .order("name");

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-4 py-16">
        <Link
          href="/"
          className="text-sm text-gray-400 hover:text-gray-600 mb-8 inline-block"
        >
          &larr; Ny analys
        </Link>
        <AnalysisResult
          analysis={data.analysis as RfpAnalysis}
          fileName={document.file_name}
        />
        <AnalysisMatchSection
          analysisId={id}
          latestMatch={latestMatch}
          allConsultants={consultantRows || []}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/analysis-match-section.tsx src/app/analysis/[id]/page.tsx
git commit -m "feat: add team matching section to analysis page"
```

---

## Task 15: E2E Smoke Test

**Files:**
- No new files — manual verification

- [ ] **Step 1: Run all existing tests**

Run: `npx vitest run`
Expected: All tests pass (document-parser: 3, rfp-analyzer: 1, consultant-extractor: 1, consultant-matcher: 2)

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Run lint**

Run: `npx eslint src/`
Expected: No errors (or only warnings).

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: Successful build with no errors.

- [ ] **Step 5: Manual smoke test**

Start dev server: `npm run dev`

1. Open `/consultants` — should show empty list + upload form
2. Upload 2-3 synthetic CVs from `data/synthetic/konsult cv/` — should extract and show in list
3. Click a consultant — should show full profile
4. Go to `/` and upload an RFP from `data/synthetic/rfps/` — should analyze and redirect
5. On analysis page, click "Matcha konsulter" — should show team proposal
6. Swap a consultant in the dropdown — should show comparison banner

- [ ] **Step 6: Commit any fixes**

If smoke test revealed issues, fix and commit:
```bash
git add -A
git commit -m "fix: smoke test fixes for M1"
```

---

## Summary

| Task | What | Estimated Steps |
|------|------|-----------------|
| 1 | Database migration | 3 |
| 2 | TypeScript types | 3 |
| 3 | Consultant extractor (TDD) | 5 |
| 4 | Consultant matcher (TDD) | 5 |
| 5 | Switch RFP analyzer to Sonnet | 4 |
| 6 | CV upload API route | 3 |
| 7 | Consultant CRUD routes | 4 |
| 8 | Matching API routes | 4 |
| 9 | Navigation and layout | 4 |
| 10 | Upload component | 3 |
| 11 | Consultant list + page | 5 |
| 12 | Consultant profile page | 4 |
| 13 | Team proposal + evaluation components | 4 |
| 14 | Match section on analysis page | 4 |
| 15 | E2E smoke test | 6 |
| **Total** | | **61 steps** |
