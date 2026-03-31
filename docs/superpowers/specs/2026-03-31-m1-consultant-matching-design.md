# M1: Consultant Profiles & Matching — Design Spec

## Goal

Enable consulting firms to import consultant profiles via CV upload (AI-extracted), and automatically match consultants to analyzed RFPs with ranked team proposals and live team evaluation when editing.

## Architecture

CV import reuses the existing document-parser pipeline. Sonnet extracts structured profiles from raw CV text. After an RFP is analyzed (M0), Sonnet matches the RFP against all consultants — ranking per seniority level — and proposes a team. Users can swap consultants and get a live re-evaluation comparing the new team to the previous one.

**Model:** Sonnet for all M1 operations (extraction + matching + re-evaluation). Haiku pre-filter deferred — trivial to add later as a step before Sonnet matching.

## Data Model

### New tables

```sql
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  style_guide jsonb,  -- for M2 bid generation templates
  created_at timestamptz DEFAULT now()
);

CREATE TABLE consultants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id),
  name text NOT NULL,
  level text NOT NULL CHECK (level IN ('junior', 'intermediate', 'senior', 'expert')),
  years_experience int,
  summary text,         -- AI-generated 2-3 sentence profile summary
  raw_cv_text text,     -- full extracted text from CV document
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE consultant_competencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id uuid REFERENCES consultants(id) ON DELETE CASCADE,
  competency text NOT NULL,
  category text NOT NULL CHECK (category IN ('technical', 'domain', 'methodology', 'certification'))
);

CREATE TABLE consultant_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id uuid REFERENCES consultants(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  year int,
  sector text CHECK (sector IN ('public', 'private'))
);

CREATE TABLE matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid REFERENCES analyses(id),
  organization_id uuid REFERENCES organizations(id),
  team_proposal jsonb NOT NULL,  -- ranked consultants per level + reasoning
  team_evaluation jsonb,         -- overall fit, gaps, requirement coverage
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_consultants_org ON consultants(organization_id);
CREATE INDEX idx_consultants_level ON consultants(level);
CREATE INDEX idx_competencies_consultant ON consultant_competencies(consultant_id);
CREATE INDEX idx_references_consultant ON consultant_references(consultant_id);
CREATE INDEX idx_matches_analysis ON matches(analysis_id);
```

### Modified tables

```sql
-- Add organization_id to existing documents/analyses for multi-tenant context (nullable for now)
ALTER TABLE documents ADD COLUMN organization_id uuid REFERENCES organizations(id);
ALTER TABLE analyses ADD COLUMN organization_id uuid REFERENCES organizations(id);
```

### Data strategy note

All data flowing through the platform (RFP requirements, pricing, team compositions, competency demand) is retained for future aggregation and market intelligence. No data is discarded. Editing history for team proposals is preserved in matches table via new rows, not overwrites.

## CV Import & Profile Extraction

### Flow

```
Upload CV(s) (.docx, .md, .txt)
  → document-parser.ts (reuse M0)
  → Sonnet extraction prompt → structured JSON
  → Save to consultants + consultant_competencies + consultant_references
  → Show in consultant list
```

### Extraction prompt output schema

```typescript
interface ConsultantExtraction {
  name: string
  level: "junior" | "intermediate" | "senior" | "expert"
  yearsExperience: number
  summary: string
  competencies: Array<{
    competency: string
    category: "technical" | "domain" | "methodology" | "certification"
  }>
  references: Array<{
    title: string
    description: string
    year: number
    sector: "public" | "private"
  }>
}
```

### Bulk upload

Multiple files selected at once. Each file parsed and extracted independently. Progress shown per file. Failures don't block other files.

## Matching

### Trigger

Automatically after RFP analysis completes (extend existing `/api/analyze` flow). Also re-runnable manually.

### Input to Sonnet

- RFP analysis (structured JSON from M0): title, requirements, requiredCompetencies, evaluationCriteria, estimatedScope
- All consultants for the organization, grouped by level, each with: name, level, competencies, summary, references

### Output from Sonnet

```typescript
interface MatchResult {
  teamProposal: {
    senior: ConsultantMatch[]
    intermediate: ConsultantMatch[]
    junior: ConsultantMatch[]
  }
  overallFit: string        // team assessment
  gaps: string[]            // missing competencies or experience
  requirementCoverage: {
    must: { met: number, total: number, details: string[] }
    should: { met: number, total: number, details: string[] }
    niceToHave: { met: number, total: number, details: string[] }
  }
}

interface ConsultantMatch {
  consultantId: string
  score: number             // 0-100
  reasoning: string         // why this consultant fits
}
```

Top 3 consultants per level. Ranking within level only — juniors never compete with seniors.

### Team re-evaluation on edit

When user swaps a consultant:
1. Lightweight Sonnet call with just the new team + RFP requirements
2. Returns updated evaluation + diff against previous team
3. Example output: "Compared to previous team: lost 1 should-requirement (Power BI experience), gained stronger public sector references"

New match row created (preserves history), not overwrite.

## UI & Pages

### New pages

**`/consultants`** — Consultant list
- Table: name, level, competency tags, last matched date
- Filter by level and competency
- "Upload CVs" button (multi-file)
- Click row → profile page

**`/consultants/[id]`** — Consultant profile
- Display all extracted data
- Edit: name, level, competencies (add/remove), summary, references
- Matching history: which RFPs this consultant has been proposed for

### Extended page

**`/analysis/[id]`** — Add team proposal section below existing RFP analysis
- Team proposal: recommended consultant per level slot + alternatives (expandable)
- Team evaluation: requirement coverage, gaps, strengths
- Swap consultant: dropdown per slot → triggers re-evaluation → shows comparison to previous team

## API Routes

```
POST   /api/consultants/upload    — Upload + extract CV(s)
GET    /api/consultants           — List consultants (with filters)
GET    /api/consultants/[id]      — Get single consultant
PUT    /api/consultants/[id]      — Update consultant profile
DELETE /api/consultants/[id]      — Delete consultant

POST   /api/matches/[analysisId]  — Trigger/re-run matching
PUT    /api/matches/[id]/swap     — Swap consultant in team, get re-evaluation
```

## File Structure (new files)

```
src/
├── app/
│   ├── consultants/
│   │   ├── page.tsx                    — Consultant list page
│   │   └── [id]/
│   │       └── page.tsx                — Consultant profile page
│   └── api/
│       ├── consultants/
│       │   ├── route.ts                — GET list, POST (won't be used directly)
│       │   ├── upload/
│       │   │   └── route.ts            — POST upload + extract
│       │   └── [id]/
│       │       └── route.ts            — GET, PUT, DELETE single consultant
│       └── matches/
│           ├── [analysisId]/
│           │   └── route.ts            — POST trigger matching
│           └── [id]/
│               └── swap/
│                   └── route.ts        — PUT swap consultant
├── components/
│   ├── consultant-list.tsx             — Table component
│   ├── consultant-profile.tsx          — Profile view/edit component
│   ├── consultant-upload.tsx           — Upload form component
│   ├── team-proposal.tsx               — Team proposal display
│   └── team-evaluation.tsx             — Evaluation + comparison display
└── lib/
    ├── consultant-extractor.ts         — Sonnet prompt for CV extraction
    ├── consultant-matcher.ts           — Sonnet prompt for matching
    └── types.ts                        — Extended with new interfaces
supabase/
└── migrations/
    └── 002_consultant_matching.sql     — New tables
```

## Out of Scope for M1

- Outcome tracking (win/loss) — deferred to M2 where bid submission creates a natural close point
- Consultant availability — requires integration with booking systems
- Consultant preferences — requires extra admin from client
- Haiku pre-filter — not needed at ~80 consultants
- PDF support — deferred (pdf-parse v2 breaking changes)
- Evaluation criteria weighting in matching — deferred to M2/Go-No-Go
