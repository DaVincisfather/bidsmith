# M0: Syntetisk Data + Kravanalys-agent — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working prototype that takes an uploaded RFP document, analyzes it with a Claude-powered agent, and displays a structured requirement summary — using synthetic test data for development.

**Architecture:** Next.js handles both UI and API routes. Documents are uploaded to Supabase Storage, converted to text server-side, then sent to Claude for structured analysis. Results are stored in Supabase PostgreSQL and displayed in a simple web UI.

**Tech Stack:** Next.js 15 (App Router), Tailwind CSS, Supabase (PostgreSQL + Storage), Claude API (Sonnet via @anthropic-ai/sdk), Vercel, pdf-parse (PDF), mammoth (Word)

---

## File Structure

```
agentic-dealflow/
├── src/
│   ├── app/
│   │   ├── page.tsx                        # Upload page
│   │   ├── layout.tsx                      # Root layout
│   │   ├── globals.css                     # Tailwind globals
│   │   ├── analysis/
│   │   │   └── [id]/
│   │   │       └── page.tsx                # Analysis result page
│   │   └── api/
│   │       └── analyze/
│   │           └── route.ts                # Upload + analyze endpoint
│   ├── lib/
│   │   ├── types.ts                        # Shared types (RfpAnalysis, etc.)
│   │   ├── supabase.ts                     # Supabase client
│   │   ├── document-parser.ts              # PDF/Word → text
│   │   └── rfp-analyzer.ts                 # Claude-powered RFP analysis agent
│   └── components/
│       ├── upload-form.tsx                 # Document upload + submit
│       └── analysis-result.tsx             # Structured result display
├── scripts/
│   ├── generate-cvs.ts                     # Generate synthetic consultant CVs
│   ├── generate-rfps.ts                    # Generate synthetic RFPs
│   └── generate-bids.ts                    # Generate synthetic bids
├── data/
│   └── synthetic/
│       ├── cvs/                            # Generated CVs (markdown)
│       ├── rfps/                           # Generated RFPs (markdown)
│       └── bids/                           # Generated bids (markdown)
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql          # Documents + analyses tables
├── tests/
│   ├── lib/
│   │   ├── rfp-analyzer.test.ts            # Agent unit tests
│   │   └── document-parser.test.ts         # Parser unit tests
│   └── api/
│       └── analyze.test.ts                 # API route integration test
├── .env.local.example                      # Environment variable template
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
└── vitest.config.ts
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `vitest.config.ts`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
- Create: `.env.local.example`

- [ ] **Step 1: Initialize Next.js project**

```bash
cd ~/projects/agentic-dealflow
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

Accept defaults. This creates the base structure with App Router.

- [ ] **Step 2: Install dependencies**

```bash
npm install @anthropic-ai/sdk @supabase/supabase-js pdf-parse mammoth
npm install -D vitest @vitejs/plugin-react jsdom @types/pdf-parse
```

- [ ] **Step 3: Create vitest config**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
```

- [ ] **Step 4: Add test script to package.json**

In `package.json`, add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Create environment variable template**

Create `.env.local.example`:

```bash
# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

- [ ] **Step 6: Verify setup**

```bash
npm run build
npm run test
```

Expected: Build succeeds, test runner starts (0 tests).

- [ ] **Step 7: Commit**

```bash
git init
git add .
git commit -m "feat: scaffold Next.js project with Tailwind, Supabase, Claude API deps"
```

---

## Task 2: Shared Types

**Files:**
- Create: `src/lib/types.ts`

- [ ] **Step 1: Define core types**

Create `src/lib/types.ts`:

```typescript
export interface RfpRequirement {
  category: string;
  description: string;
  priority: "must" | "should" | "nice-to-have";
}

export interface EvaluationCriterion {
  name: string;
  weight: number; // percentage, 0-100
  description: string;
}

export interface RfpAnalysis {
  title: string;
  client: string;
  deadline: string | null;
  summary: string;
  requirements: RfpRequirement[];
  evaluationCriteria: EvaluationCriterion[];
  requiredCompetencies: string[];
  estimatedScope: string;
  redFlags: string[];
}

export interface AnalysisRecord {
  id: string;
  fileName: string;
  fileUrl: string;
  analysis: RfpAnalysis;
  createdAt: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add core types for RFP analysis"
```

---

## Task 3: Synthetic Data Generation

**Files:**
- Create: `scripts/generate-cvs.ts`
- Create: `scripts/generate-rfps.ts`
- Create: `scripts/generate-bids.ts`
- Create: `data/synthetic/cvs/`, `data/synthetic/rfps/`, `data/synthetic/bids/`

- [ ] **Step 1: Create data directories**

```bash
mkdir -p data/synthetic/cvs data/synthetic/rfps data/synthetic/bids
```

- [ ] **Step 2: Write CV generation script**

Create `scripts/generate-cvs.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";

const client = new Anthropic();

const profiles = [
  {
    role: "Senior Management Consultant",
    focus: "strategi och organisationsutveckling",
    years: 12,
    industries: ["finans", "offentlig sektor", "life science"],
  },
  {
    role: "IT-konsult",
    focus: "systemintegration och molnmigrering",
    years: 8,
    industries: ["retail", "logistik", "fintech"],
  },
  {
    role: "Management Consultant",
    focus: "affärsutveckling och förändringsledning",
    years: 5,
    industries: ["energi", "telekom", "offentlig sektor"],
  },
  {
    role: "Senior IT-konsult",
    focus: "arkitektur och teknisk projektledning",
    years: 15,
    industries: ["bank", "försäkring", "hälso- och sjukvård"],
  },
  {
    role: "Junior Management Consultant",
    focus: "dataanalys och beslutsunderlag",
    years: 2,
    industries: ["offentlig sektor", "fastighet"],
  },
];

async function generateCv(profile: (typeof profiles)[number], index: number) {
  const message = await client.messages.create({
    model: "claude-sonnet-4-6-20250514",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `Generera ett realistiskt men anonymiserat konsult-CV på svenska i markdown-format.

Profil:
- Roll: ${profile.role}
- Fokusområde: ${profile.focus}
- Erfarenhet: ${profile.years} år
- Branscher: ${profile.industries.join(", ")}

Inkludera:
- Namn (påhittat), titel, sammanfattning
- Nyckelkompetenser (8-12 stycken)
- Utbildning
- 3-5 referensuppdrag med: kund (anonymiserat som "Stor bank", "Medelstort energibolag" etc.), roll, period, beskrivning, resultat
- Certifieringar om relevant

Gör det realistiskt — som ett riktigt konsult-CV som skulle skickas med i ett anbud.`,
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type");

  const filePath = path.join("data", "synthetic", "cvs", `consultant-${index + 1}.md`);
  writeFileSync(filePath, content.text);
  console.log(`Generated: ${filePath}`);
}

async function main() {
  console.log("Generating synthetic consultant CVs...");
  for (let i = 0; i < profiles.length; i++) {
    await generateCv(profiles[i], i);
  }
  console.log("Done.");
}

main();
```

- [ ] **Step 3: Write RFP generation script**

Create `scripts/generate-rfps.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { writeFileSync } from "fs";
import path from "path";

const client = new Anthropic();

const rfpScenarios = [
  {
    type: "offentlig",
    title: "Organisationsöversyn av regional hälso- och sjukvård",
    scope: "Extern genomlysning av organisationsstruktur och styrmodell",
  },
  {
    type: "privat",
    title: "Molnmigrering för medelstort retailbolag",
    scope: "Flytt av legacy-system till Azure/AWS med minimal driftstörning",
  },
  {
    type: "offentlig",
    title: "Digitaliseringsstrategi för kommunal förvaltning",
    scope: "Framtagning av strategi och handlingsplan för digital transformation",
  },
];

async function generateRfp(scenario: (typeof rfpScenarios)[number], index: number) {
  const isPublic = scenario.type === "offentlig";

  const message = await client.messages.create({
    model: "claude-sonnet-4-6-20250514",
    max_tokens: 3000,
    messages: [
      {
        role: "user",
        content: `Generera ett realistiskt förfrågningsunderlag (RFP) på svenska i markdown-format.

Typ: ${isPublic ? "Offentlig upphandling (LOU)" : "Privat offertförfrågan"}
Titel: ${scenario.title}
Scope: ${scenario.scope}

Inkludera:
- Rubrik och diarienummer (påhittat)
- Bakgrund och syfte
- Uppdragsbeskrivning med delmoment
- Kravspecifikation (ska-krav och bör-krav)
- Utvärderingskriterier med viktning (t.ex. kompetens 40%, pris 30%, metod 30%)
- Tidplan och leveranser
- Anbudets format och innehållskrav
- Sista anbudsdag
${isPublic ? "- Hänvisning till LOU\n- Upphandlingsform (förenklat förfarande)" : ""}

Gör det realistiskt — som ett riktigt underlag en konsultfirma skulle ta emot.`,
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type");

  const filePath = path.join("data", "synthetic", "rfps", `rfp-${index + 1}.md`);
  writeFileSync(filePath, content.text);
  console.log(`Generated: ${filePath}`);
}

async function main() {
  console.log("Generating synthetic RFPs...");
  for (let i = 0; i < rfpScenarios.length; i++) {
    await generateRfp(rfpScenarios[i], i);
  }
  console.log("Done.");
}

main();
```

- [ ] **Step 4: Write bid generation script**

Create `scripts/generate-bids.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { writeFileSync } from "fs";
import path from "path";

const client = new Anthropic();

const bidScenarios = [
  {
    rfp: "Organisationsöversyn av regional hälso- och sjukvård",
    firm: "Nordic Strategy Group",
    consultants: ["Senior Management Consultant", "Junior Management Consultant"],
  },
  {
    rfp: "Molnmigrering för medelstort retailbolag",
    firm: "TechBridge Consulting",
    consultants: ["Senior IT-konsult", "IT-konsult"],
  },
];

async function generateBid(scenario: (typeof bidScenarios)[number], index: number) {
  const message = await client.messages.create({
    model: "claude-sonnet-4-6-20250514",
    max_tokens: 3000,
    messages: [
      {
        role: "user",
        content: `Generera ett realistiskt anbud/offert på svenska i markdown-format.

Kontext:
- Svar på RFP: "${scenario.rfp}"
- Konsultfirma: ${scenario.firm} (påhittat namn)
- Föreslagna konsulter: ${scenario.consultants.join(", ")}

Inkludera:
- Försättsblad med firmanamn, kontaktperson, datum
- Sammanfattning av förståelse för uppdraget
- Metod och genomförandeplan
- Organisation och bemanning (konsultpresentationer, kortfattade)
- Tidplan
- Prissättning (timpriser och totalestimat)
- Referenser (anonymiserade)
- Bilagor (CV:n hänvisas till separat)

Gör det realistiskt — som ett riktigt anbud en konsultfirma skulle skicka in.`,
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type");

  const filePath = path.join("data", "synthetic", "bids", `bid-${index + 1}.md`);
  writeFileSync(filePath, content.text);
  console.log(`Generated: ${filePath}`);
}

async function main() {
  console.log("Generating synthetic bids...");
  for (let i = 0; i < bidScenarios.length; i++) {
    await generateBid(bidScenarios[i], i);
  }
  console.log("Done.");
}

main();
```

- [ ] **Step 5: Run generation scripts**

```bash
npx tsx scripts/generate-cvs.ts
npx tsx scripts/generate-rfps.ts
npx tsx scripts/generate-bids.ts
```

Expected: Files appear in `data/synthetic/cvs/`, `rfps/`, `bids/`. Review them manually for quality.

- [ ] **Step 6: Commit**

```bash
git add scripts/ data/synthetic/
git commit -m "feat: add synthetic data generation scripts and initial test data"
```

---

## Task 4: Document Parser

**Files:**
- Create: `src/lib/document-parser.ts`
- Create: `tests/lib/document-parser.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/document-parser.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseDocument } from "@/lib/document-parser";
import { readFileSync } from "fs";
import path from "path";

describe("parseDocument", () => {
  it("extracts text from a markdown file", async () => {
    const buffer = Buffer.from("# Test RFP\n\nThis is a test document.");
    const result = await parseDocument(buffer, "test.md");

    expect(result).toContain("Test RFP");
    expect(result).toContain("This is a test document.");
  });

  it("extracts text from a plain text file", async () => {
    const buffer = Buffer.from("Plain text content here.");
    const result = await parseDocument(buffer, "test.txt");

    expect(result).toBe("Plain text content here.");
  });

  it("throws on unsupported file type", async () => {
    const buffer = Buffer.from("data");
    await expect(parseDocument(buffer, "test.xyz")).rejects.toThrow(
      "Unsupported file type"
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test -- tests/lib/document-parser.test.ts
```

Expected: FAIL — `parseDocument` not found.

- [ ] **Step 3: Write implementation**

Create `src/lib/document-parser.ts`:

```typescript
import pdfParse from "pdf-parse";
import mammoth from "mammoth";

const SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".doc", ".md", ".txt"];

function getExtension(fileName: string): string {
  const ext = fileName.toLowerCase().split(".").pop();
  return ext ? `.${ext}` : "";
}

export async function parseDocument(
  buffer: Buffer,
  fileName: string
): Promise<string> {
  const ext = getExtension(fileName);

  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    throw new Error(`Unsupported file type: ${ext}`);
  }

  switch (ext) {
    case ".pdf": {
      const result = await pdfParse(buffer);
      return result.text.trim();
    }
    case ".docx":
    case ".doc": {
      const result = await mammoth.extractRawText({ buffer });
      return result.value.trim();
    }
    case ".md":
    case ".txt": {
      return buffer.toString("utf-8").trim();
    }
    default:
      throw new Error(`Unsupported file type: ${ext}`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test -- tests/lib/document-parser.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/document-parser.ts tests/lib/document-parser.test.ts
git commit -m "feat: add document parser for PDF, Word, and text files"
```

---

## Task 5: RFP Analyzer Agent

**Files:**
- Create: `src/lib/rfp-analyzer.ts`
- Create: `tests/lib/rfp-analyzer.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/rfp-analyzer.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { analyzeRfp } from "@/lib/rfp-analyzer";
import { RfpAnalysis } from "@/lib/types";
import { readFileSync } from "fs";
import path from "path";

describe("analyzeRfp", () => {
  it("returns a structured analysis from a synthetic RFP", async () => {
    // Use one of our synthetic RFPs as test input
    const rfpPath = path.join(
      process.cwd(),
      "data",
      "synthetic",
      "rfps",
      "rfp-1.md"
    );
    const rfpText = readFileSync(rfpPath, "utf-8");

    const result: RfpAnalysis = await analyzeRfp(rfpText);

    // Structural checks — we can't predict exact content from Claude,
    // but we can verify the shape
    expect(result.title).toBeTruthy();
    expect(result.summary).toBeTruthy();
    expect(result.requirements.length).toBeGreaterThan(0);
    expect(result.evaluationCriteria.length).toBeGreaterThan(0);
    expect(result.requiredCompetencies.length).toBeGreaterThan(0);

    // Check that requirements have correct shape
    const req = result.requirements[0];
    expect(req).toHaveProperty("category");
    expect(req).toHaveProperty("description");
    expect(["must", "should", "nice-to-have"]).toContain(req.priority);

    // Check that evaluation criteria have weights
    const crit = result.evaluationCriteria[0];
    expect(crit).toHaveProperty("name");
    expect(crit).toHaveProperty("weight");
    expect(typeof crit.weight).toBe("number");
  }, 30000); // Claude API timeout
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test -- tests/lib/rfp-analyzer.test.ts
```

Expected: FAIL — `analyzeRfp` not found.

- [ ] **Step 3: Write implementation**

Create `src/lib/rfp-analyzer.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { RfpAnalysis } from "./types";

const client = new Anthropic();

const SYSTEM_PROMPT = `Du är en expert på att analysera förfrågningsunderlag (RFP:er) för konsultuppdrag.
Du läser ett RFP-dokument och producerar en strukturerad analys i JSON-format.

Svara ALLTID med giltig JSON som matchar detta schema:
{
  "title": "Uppdragets titel",
  "client": "Kund/beställare (om angivet, annars 'Ej angivet')",
  "deadline": "Sista anbudsdag i ISO-format, eller null",
  "summary": "2-3 meningar som sammanfattar uppdraget",
  "requirements": [
    {
      "category": "Kategori (t.ex. Kompetens, Erfarenhet, Kapacitet)",
      "description": "Beskrivning av kravet",
      "priority": "must | should | nice-to-have"
    }
  ],
  "evaluationCriteria": [
    {
      "name": "Kriteriets namn",
      "weight": 40,
      "description": "Vad som bedöms"
    }
  ],
  "requiredCompetencies": ["kompetens1", "kompetens2"],
  "estimatedScope": "Uppskattad omfattning i tid/resurser",
  "redFlags": ["Potentiella risker eller oklarheter i underlaget"]
}

Var noggrann med att:
- Skilja mellan ska-krav (must) och bör-krav (should)
- Extrahera utvärderingskriterier med vikter om de anges
- Identifiera oklarheter eller potentiella problem (redFlags)
- Sammanfatta i professionell ton`;

export async function analyzeRfp(rfpText: string): Promise<RfpAnalysis> {
  const message = await client.messages.create({
    model: "claude-sonnet-4-6-20250514",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `Analysera följande förfrågningsunderlag och returnera en strukturerad JSON-analys:\n\n${rfpText}`,
      },
    ],
    system: SYSTEM_PROMPT,
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  // Extract JSON from response (Claude may wrap it in markdown code blocks)
  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON found in Claude response");
  }

  const analysis: RfpAnalysis = JSON.parse(jsonMatch[0]);
  return analysis;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test -- tests/lib/rfp-analyzer.test.ts
```

Expected: PASS (1 test). This calls the real Claude API — requires `ANTHROPIC_API_KEY` in `.env.local`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rfp-analyzer.ts tests/lib/rfp-analyzer.test.ts
git commit -m "feat: add Claude-powered RFP analysis agent"
```

---

## Task 6: Supabase Schema + Client

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`
- Create: `src/lib/supabase.ts`

- [ ] **Step 1: Write database migration**

Create `supabase/migrations/001_initial_schema.sql`:

```sql
-- Documents table: stores uploaded RFPs
create table documents (
  id uuid default gen_random_uuid() primary key,
  file_name text not null,
  file_url text not null,
  raw_text text,
  created_at timestamptz default now() not null
);

-- Analyses table: stores structured RFP analyses
create table analyses (
  id uuid default gen_random_uuid() primary key,
  document_id uuid references documents(id) on delete cascade not null,
  analysis jsonb not null,
  created_at timestamptz default now() not null
);

-- Index for fast lookup
create index idx_analyses_document_id on analyses(document_id);
```

- [ ] **Step 2: Write Supabase client**

Create `src/lib/supabase.ts`:

```typescript
import { createClient } from "@supabase/supabase-js";

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
}

if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Server-side client with service role for file uploads
export function createServiceClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}
```

- [ ] **Step 3: Apply migration to Supabase**

```bash
npx supabase db push
```

Or apply manually via Supabase dashboard SQL editor if not using CLI.

- [ ] **Step 4: Create storage bucket**

In Supabase dashboard: Storage > New bucket > Name: `rfp-documents`, Public: off.

- [ ] **Step 5: Commit**

```bash
git add supabase/ src/lib/supabase.ts
git commit -m "feat: add Supabase schema and client for documents and analyses"
```

---

## Task 7: API Route — Upload + Analyze

**Files:**
- Create: `src/app/api/analyze/route.ts`

- [ ] **Step 1: Write the API route**

Create `src/app/api/analyze/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { parseDocument } from "@/lib/document-parser";
import { analyzeRfp } from "@/lib/rfp-analyzer";
import { createServiceClient } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Upload file to Supabase Storage
    const fileName = `${Date.now()}-${file.name}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from("rfp-documents")
      .upload(fileName, buffer, {
        contentType: file.type,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: `Upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("rfp-documents").getPublicUrl(fileName);

    // Parse document to text
    const rawText = await parseDocument(buffer, file.name);

    // Save document record
    const { data: doc, error: docError } = await supabase
      .from("documents")
      .insert({
        file_name: file.name,
        file_url: publicUrl,
        raw_text: rawText,
      })
      .select()
      .single();

    if (docError) {
      return NextResponse.json(
        { error: `Database error: ${docError.message}` },
        { status: 500 }
      );
    }

    // Analyze with Claude
    const analysis = await analyzeRfp(rawText);

    // Save analysis
    const { data: analysisRecord, error: analysisError } = await supabase
      .from("analyses")
      .insert({
        document_id: doc.id,
        analysis,
      })
      .select()
      .single();

    if (analysisError) {
      return NextResponse.json(
        { error: `Analysis save failed: ${analysisError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      id: analysisRecord.id,
      documentId: doc.id,
      analysis,
    });
  } catch (error) {
    console.error("Analysis failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/analyze/route.ts
git commit -m "feat: add API route for document upload and RFP analysis"
```

---

## Task 8: Upload Form Component

**Files:**
- Create: `src/components/upload-form.tsx`

- [ ] **Step 1: Write the upload form**

Create `src/components/upload-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Analysis failed");
      }

      const data = await response.json();
      router.push(`/analysis/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
        <input
          type="file"
          accept=".pdf,.docx,.doc,.md,.txt"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="hidden"
          id="file-upload"
        />
        <label
          htmlFor="file-upload"
          className="cursor-pointer text-gray-600 hover:text-gray-900"
        >
          {file ? (
            <span className="text-lg font-medium">{file.name}</span>
          ) : (
            <div>
              <p className="text-lg font-medium">
                Ladda upp ett forfrågningsunderlag
              </p>
              <p className="text-sm text-gray-400 mt-1">
                PDF, Word, Markdown eller textfil
              </p>
            </div>
          )}
        </label>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!file || loading}
        className="w-full bg-gray-900 text-white py-3 px-6 rounded-lg font-medium
                   hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed
                   transition-colors"
      >
        {loading ? "Analyserar..." : "Analysera"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/upload-form.tsx
git commit -m "feat: add upload form component"
```

---

## Task 9: Analysis Result Component

**Files:**
- Create: `src/components/analysis-result.tsx`

- [ ] **Step 1: Write the result component**

Create `src/components/analysis-result.tsx`:

```tsx
import { RfpAnalysis } from "@/lib/types";

interface AnalysisResultProps {
  analysis: RfpAnalysis;
  fileName: string;
}

export function AnalysisResult({ analysis, fileName }: AnalysisResultProps) {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <p className="text-sm text-gray-400 mb-1">{fileName}</p>
        <h1 className="text-2xl font-bold">{analysis.title}</h1>
        <div className="flex gap-4 mt-2 text-sm text-gray-500">
          {analysis.client && <span>Kund: {analysis.client}</span>}
          {analysis.deadline && <span>Deadline: {analysis.deadline}</span>}
        </div>
      </div>

      {/* Summary */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Sammanfattning</h2>
        <p className="text-gray-700">{analysis.summary}</p>
      </section>

      {/* Estimated Scope */}
      {analysis.estimatedScope && (
        <section>
          <h2 className="text-lg font-semibold mb-2">Uppskattad omfattning</h2>
          <p className="text-gray-700">{analysis.estimatedScope}</p>
        </section>
      )}

      {/* Requirements */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Krav</h2>
        <div className="space-y-2">
          {analysis.requirements.map((req, i) => (
            <div
              key={i}
              className="flex items-start gap-3 p-3 bg-gray-50 rounded"
            >
              <span
                className={`text-xs font-medium px-2 py-1 rounded shrink-0 ${
                  req.priority === "must"
                    ? "bg-red-100 text-red-700"
                    : req.priority === "should"
                      ? "bg-yellow-100 text-yellow-700"
                      : "bg-green-100 text-green-700"
                }`}
              >
                {req.priority === "must"
                  ? "Ska"
                  : req.priority === "should"
                    ? "Bor"
                    : "Meriterande"}
              </span>
              <div>
                <span className="text-xs text-gray-400">{req.category}</span>
                <p className="text-sm">{req.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Evaluation Criteria */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Utvarderingskriterier</h2>
        <div className="space-y-3">
          {analysis.evaluationCriteria.map((crit, i) => (
            <div key={i} className="p-3 bg-gray-50 rounded">
              <div className="flex justify-between items-center mb-1">
                <span className="font-medium">{crit.name}</span>
                <span className="text-sm font-mono bg-gray-200 px-2 py-0.5 rounded">
                  {crit.weight}%
                </span>
              </div>
              <p className="text-sm text-gray-600">{crit.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Competencies */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Efterfragade kompetenser</h2>
        <div className="flex flex-wrap gap-2">
          {analysis.requiredCompetencies.map((comp, i) => (
            <span
              key={i}
              className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm"
            >
              {comp}
            </span>
          ))}
        </div>
      </section>

      {/* Red Flags */}
      {analysis.redFlags.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Att observera</h2>
          <ul className="space-y-1">
            {analysis.redFlags.map((flag, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="text-amber-500 shrink-0">!</span>
                <span className="text-gray-700">{flag}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/analysis-result.tsx
git commit -m "feat: add analysis result display component"
```

---

## Task 10: Pages — Upload + Result

**Files:**
- Modify: `src/app/page.tsx`
- Create: `src/app/analysis/[id]/page.tsx`

- [ ] **Step 1: Write the upload page**

Replace `src/app/page.tsx`:

```tsx
import { UploadForm } from "@/components/upload-form";

export default function Home() {
  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-4 py-16">
        <div className="mb-12">
          <h1 className="text-3xl font-bold">Agentic Dealflow</h1>
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

- [ ] **Step 2: Write the analysis result page**

Create `src/app/analysis/[id]/page.tsx`:

```tsx
import { createServiceClient } from "@/lib/supabase";
import { AnalysisResult } from "@/components/analysis-result";
import { RfpAnalysis } from "@/lib/types";
import Link from "next/link";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AnalysisPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("analyses")
    .select(
      `
      id,
      analysis,
      created_at,
      documents (
        file_name,
        file_url
      )
    `
    )
    .eq("id", id)
    .single();

  if (error || !data) {
    notFound();
  }

  const document = data.documents as unknown as {
    file_name: string;
    file_url: string;
  };

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
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Run the dev server and verify**

```bash
npm run dev
```

Open `http://localhost:3000`. Upload one of the synthetic RFPs from `data/synthetic/rfps/`. Verify:
- File uploads without error
- Analysis page shows structured result
- All sections render correctly

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx src/app/analysis/
git commit -m "feat: add upload and analysis result pages"
```

---

## Task 11: End-to-End Smoke Test

**Files:**
- Create: `tests/api/analyze.test.ts`

- [ ] **Step 1: Write integration test**

Create `tests/api/analyze.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { analyzeRfp } from "@/lib/rfp-analyzer";
import { parseDocument } from "@/lib/document-parser";
import { readFileSync } from "fs";
import path from "path";

describe("End-to-end: parse + analyze", () => {
  it("parses a synthetic RFP and produces valid analysis", async () => {
    const rfpPath = path.join(
      process.cwd(),
      "data",
      "synthetic",
      "rfps",
      "rfp-1.md"
    );
    const buffer = readFileSync(rfpPath);
    const text = await parseDocument(buffer, "rfp-1.md");

    expect(text.length).toBeGreaterThan(100);

    const analysis = await analyzeRfp(text);

    // Verify complete analysis structure
    expect(analysis.title).toBeTruthy();
    expect(analysis.summary.length).toBeGreaterThan(20);
    expect(analysis.requirements.length).toBeGreaterThan(0);
    expect(analysis.evaluationCriteria.length).toBeGreaterThan(0);
    expect(analysis.requiredCompetencies.length).toBeGreaterThan(0);

    // Verify priorities are valid
    analysis.requirements.forEach((req) => {
      expect(["must", "should", "nice-to-have"]).toContain(req.priority);
    });

    // Verify weights sum to roughly 100
    const totalWeight = analysis.evaluationCriteria.reduce(
      (sum, c) => sum + c.weight,
      0
    );
    expect(totalWeight).toBeGreaterThanOrEqual(90);
    expect(totalWeight).toBeLessThanOrEqual(110);
  }, 30000);
});
```

- [ ] **Step 2: Run the test**

```bash
npm run test -- tests/api/analyze.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run full test suite**

```bash
npm run test
```

Expected: All tests PASS.

- [ ] **Step 4: Final commit**

```bash
git add tests/api/analyze.test.ts
git commit -m "feat: add end-to-end smoke test for RFP analysis pipeline"
```

---

## Summary

After completing all tasks, you have:

1. A Next.js app with document upload and structured RFP analysis
2. Synthetic test data: 5 consultant CVs, 3 RFPs, 2 bids
3. A Claude-powered agent that extracts requirements, evaluation criteria, competencies, and red flags
4. A clean web UI for uploading and reviewing analyses
5. Tests covering parser, agent, and end-to-end flow

**Next milestones (separate plans):**
- **M1:** Consultant profiles database + matching agent
- **M2:** Bid generation agent
