# PPTX Template-Based Rendering Pivot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hand-coded `pptxgenjs` rendering with template-based rendering using `pptx-automizer`, so the `.pptx` mockup file becomes the single source of truth for design.

**Architecture:** Templates live in `templates/` at the repo root (NOT `data/templates/` — `data/` is gitignored, so templates wouldn't deploy). A `TemplateLoader` reads a template by id, applies bid data via placeholder text replacement and slide cloning, returns a `Buffer`. The `bid-generator` data pipeline (planner + AI section content) stays unchanged; only the final render step is replaced.

**Tech Stack:** `pptx-automizer` v0.8.x (npm, MIT), TypeScript, existing `bid-generator` + Zod schemas. Drops `pptxgenjs` entirely.

**Branch:** `feat/pptx-template-pivot` from `master` (worktree at `../agentic-dealflow-template-pivot/`).

---

## Context for the Implementer

### Why this pivot
Hand-coded pptxgenjs rendering hit a wall: the design mockup (`data/design mockups/Anbudsmall-v2.pptx`) is 20" × 11.25" but our renderer used `LAYOUT_WIDE` (13.33" × 7.5"). All coordinates were scale-mismatched. Worse, the mockup uses horizontal A/B/C zones for phase-detail and a 4-card + Gantt overview — completely different structure from what was hand-coded.

Rather than fight coordinates forever, we use the mockup `.pptx` itself as the design system. Designer (or Stefan via claude.ai design) creates/updates `.pptx` mockups; code only fills placeholders.

### Mockup placeholder convention (already used in mockup)
The mockup already uses `{Label}` placeholder syntax in text frames:
- `{Bolagsnamn}`, `{Diarienummer}`, `{Anbud}`, `{Datum}` — cover/footer
- `{Fas 1 — namn}`, `{Fas 1 — kort beskrivning}` — phases-overview cards
- `{Aktivitet 1 — vad som görs, av vem, hur}`, `{Aktivitet 2}`, ... — phase-detail items
- `{M1–M2}`, `{Antal veckor}` — phase meta
- `{Klient}`, `{År}`, ... — references

We adopt this as-is. No designer relabeling needed for v1.

### Data flow (unchanged before render step)
1. `bid-generator.generateAllSections(context)` → `BidSection[]` (planner + AI per-section content)
2. **NEW:** `renderTemplate(templateId, sections, masterCtx)` → `Buffer`
3. Buffer returned to caller

### Mockup slide inventory (17 slides)
| # | Type | Notes |
|---|------|-------|
| 1 | cover | `{Bolagsnamn} {Anbud} {Diarienummer} {Datum}` |
| 2 | toc | dynamic entries (filled at render based on actual slide list) |
| 3 | understanding-current | prose section |
| 4 | understanding-assignment | prose section |
| 5 | understanding-vision | prose section |
| 6 | phases-overview | 4 phase cards + Gantt with M1–M12 + 4 phase bars |
| 7 | **phase-detail (CLONE TEMPLATE)** | `{Fas 1}` slide; clone N times for N phases |
| 8–10 | phase-detail (illustrative copies) | Skip in rendering — only slide 7 is template |
| 11 | quality-assurance | bullets |
| 12 | team-pricing | table |
| 13 | requirement-matrix | dynamic columns (1 per consultant) + rows |
| 14 | **reference (CLONE TEMPLATE)** | clone N times for N references |
| 15 | reference (illustrative copy) | Skip in rendering |
| 16 | confidentiality | static + signature rows |
| 17 | certifications | logo grid |

### File structure (new code)
```
src/lib/pptx-template/
├── loader.ts          # renderTemplate(id, sections, ctx): Buffer
├── registry.ts        # TemplateRegistry — config per template id
├── types.ts           # TemplateConfig, SlideConfig, ApplicatorFn
├── applicators/
│   ├── cover.ts       # one applicator per slide type
│   ├── toc.ts
│   ├── prose.ts       # for understanding-* slides
│   ├── phases-overview.ts
│   ├── phase-detail.ts
│   ├── quality-assurance.ts
│   ├── team-pricing.ts
│   ├── requirement-matrix.ts
│   ├── reference.ts
│   ├── confidentiality.ts
│   └── certifications.ts
└── __tests__/
    └── loader.test.ts

templates/
├── anbudsmall-v2.pptx          # copy of mockup
└── anbudsmall-v2.config.ts     # SlideConfig array
```

### File structure (deletions, end of plan)
```
src/lib/pptx/                    # DELETE entire dir (legacy + v2)
tests/pptx-v2-*.test.ts          # DELETE (cover layout tests etc)
src/lib/__tests__/pptx-*.test.ts # DELETE (renderer-specific tests)
```

`pptxgenjs` removed from `package.json`.

---

## Task 1: Setup + dependency

**Files:**
- Modify: `package.json`
- Create: `src/lib/pptx-template/.gitkeep`
- Create: `templates/.gitkeep`

- [ ] **Step 1: Install pptx-automizer**

```bash
cd C:/Users/stefa/projects/agentic-dealflow-template-pivot
npm install pptx-automizer
```

Expected: `pptx-automizer@0.8.x` added to dependencies. No vulnerabilities reported.

- [ ] **Step 2: Create directories and gitkeeps**

```bash
mkdir -p src/lib/pptx-template/applicators src/lib/pptx-template/__tests__ templates
touch src/lib/pptx-template/.gitkeep templates/.gitkeep
```

- [ ] **Step 3: Smoke test — load mockup and write copy**

Create `src/lib/pptx-template/__tests__/smoke.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import Automizer from "pptx-automizer";
import path from "path";

describe("pptx-automizer smoke", () => {
  it("loads mockup and writes a copy without errors", async () => {
    const automizer = new Automizer({
      templateDir: path.resolve("data/design mockups"),
      outputDir: path.resolve("/tmp"),
      removeExistingSlides: false,
    });
    const buf = await automizer
      .loadRoot("Anbudsmall-v2.pptx")
      .stream()
      .then((s) => new Promise<Buffer>((res, rej) => {
        const chunks: Buffer[] = [];
        s.on("data", (c) => chunks.push(c));
        s.on("end", () => res(Buffer.concat(chunks)));
        s.on("error", rej);
      }));
    expect(buf.length).toBeGreaterThan(10000);
  });
});
```

- [ ] **Step 4: Run smoke test**

```bash
npx vitest run src/lib/pptx-template/__tests__/smoke.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/lib/pptx-template/ templates/
git commit -m "chore: install pptx-automizer + scaffold template renderer"
```

---

## Task 2: Placeholder convention doc

**Files:**
- Create: `docs/architecture/template-placeholders.md`

- [ ] **Step 1: Write the convention doc**

Create the file with:

```markdown
# PPTX Template Placeholder Convention

Templates in `templates/` use literal `{Label}` placeholders in shape text frames. The renderer matches these by **exact text content** (not shape names) using `pptx-automizer`'s `replaceText()`.

## Rules

1. **Placeholder syntax:** `{Label}` — curly braces around a Swedish label
2. **Per-instance suffix:** Numbered placeholders within one slide (e.g., `{Aktivitet 1}`, `{Aktivitet 2}`) — applicator iterates and fills/hides
3. **Uniqueness:** Each `{Label}` must be unique within its slide. If you need the same data in two places, design with one canonical placeholder.
4. **Hide-on-empty:** When the data array is shorter than the placeholder count, the applicator removes the unused text frames (NOT just blanks them — empty frames look weird).
5. **No conditionals in template:** Template has no `{{#if}}`-style logic. Conditionals live in TypeScript applicators.

## Adding a new template

1. Design `.pptx` in PowerPoint (or claude.ai design)
2. Use `{Label}` placeholders for any data-driven text
3. Save to `templates/<template-id>.pptx`
4. Create `templates/<template-id>.config.ts` exporting a `TemplateConfig`
5. Register in `src/lib/pptx-template/registry.ts`

## Slide types and applicators

Each template config maps slide indices to one of the supported applicator types (cover, toc, prose, phases-overview, phase-detail, etc.). Each applicator owns its placeholder semantics — see `src/lib/pptx-template/applicators/<type>.ts` for the contract.
```

- [ ] **Step 2: Commit**

```bash
git add docs/architecture/template-placeholders.md
git commit -m "docs: pptx template placeholder convention"
```

---

## Task 3: Copy mockup → tagged template + audit placeholders

**Files:**
- Create: `templates/anbudsmall-v2.pptx` (copy of mockup)
- Create: `templates/anbudsmall-v2.audit.md` (placeholder inventory)

- [ ] **Step 1: Copy mockup**

```bash
cp "data/design mockups/Anbudsmall-v2.pptx" templates/anbudsmall-v2.pptx
```

- [ ] **Step 2: Audit placeholders per slide**

Run a small script or extract via `unzip -p` per slide. Write findings to `templates/anbudsmall-v2.audit.md`:

```markdown
# anbudsmall-v2 placeholder audit

## Slide 1 — Cover
- `{Bolagsnamn}`, `{Anbud}`, `{Diarienummer}`, `{Datum}`

## Slide 2 — TOC
- Section number + title rows. Up to N entries — applicator clones rows.

## Slide 3 — Kunden idag
- `{Beskriv kundens nuläge ...}` (single prose block)

## Slide 6 — Genomförande översikt
- 4 cards: `{Fas N — namn}`, `{Fas N — kort beskrivning}` for N=1..4
- Gantt: `{Fas N — namn}`, `{MX–MY}`, `{Fas N}` per phase

## Slide 7 — Phase detail (TEMPLATE for cloning)
- `{Fas 1 — namn}`, `{M1–M2} · {Antal veckor}`, `{Aktivitet 1..4}`, `{Leverans 1..3}`, `{Beslut 1..2}`, `{Go/no-go till nästa fas}`

## Slide 14 — Reference (TEMPLATE for cloning)
- `{Klient}`, `{Projekt}`, `{År}`, `{Beskrivning}`, `{Roll}`, ...

[continue for slides 11, 12, 13, 16, 17]
```

The point of this audit is to lock the placeholder contract before writing applicators. Each applicator reads its slide's placeholders from this doc.

- [ ] **Step 3: Commit**

```bash
git add templates/anbudsmall-v2.pptx templates/anbudsmall-v2.audit.md
git commit -m "chore: copy mockup to templates + placeholder audit"
```

---

## Task 4: TemplateRegistry + types

**Files:**
- Create: `src/lib/pptx-template/types.ts`
- Create: `src/lib/pptx-template/registry.ts`
- Create: `src/lib/pptx-template/__tests__/registry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/pptx-template/__tests__/registry.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getTemplate } from "../registry";

describe("template registry", () => {
  it("returns config for anbudsmall-v2", () => {
    const cfg = getTemplate("anbudsmall-v2");
    expect(cfg.id).toBe("anbudsmall-v2");
    expect(cfg.templateFile).toMatch(/anbudsmall-v2\.pptx$/);
    expect(cfg.slides.length).toBeGreaterThan(0);
    // Slide 7 is phase-detail with cloning enabled
    const phaseSlide = cfg.slides.find((s) => s.type === "phase-detail");
    expect(phaseSlide).toBeDefined();
    expect(phaseSlide!.cloneFrom).toBe("phases");
  });

  it("throws for unknown template id", () => {
    expect(() => getTemplate("nope" as never)).toThrow(/unknown template/i);
  });
});
```

- [ ] **Step 2: Run test — expect fail**

```bash
npx vitest run src/lib/pptx-template/__tests__/registry.test.ts
```

Expected: FAIL — `Cannot find module ../registry`

- [ ] **Step 3: Write types**

Create `src/lib/pptx-template/types.ts`:

```ts
import type { BidSection } from "../types";

export type SlideType =
  | "cover"
  | "toc"
  | "prose"           // understanding-current/assignment/vision use this
  | "phases-overview"
  | "phase-detail"
  | "quality-assurance"
  | "team-pricing"
  | "requirement-matrix"
  | "reference"
  | "confidentiality"
  | "certifications";

export interface SlideConfig {
  /** 1-based slide index in the template .pptx */
  source: number;
  /** Semantic slide type — picks applicator */
  type: SlideType;
  /** If set, this slide is cloned per array item from data[cloneFrom] */
  cloneFrom?: "phases" | "references";
  /** Optional caps on per-instance placeholder counts (e.g., max 4 activities) */
  itemCaps?: Record<string, number>;
}

export interface TemplateConfig {
  id: string;
  /** Path relative to templates */
  templateFile: string;
  /** Slides to RENDER (illustrative copies in mockup are excluded) */
  slides: SlideConfig[];
}

export interface MasterContext {
  companyName: string;
  diaryNumber: string;
  bidName: string;
  bidDate: string;
}

/** Inputs an applicator receives */
export interface ApplicatorContext {
  /** Pre-rendered section data from bid-generator */
  sections: BidSection[];
  master: MasterContext;
  /** 1-based output slide number (for footer counter) */
  slideNum: number;
  /** Total output slides (for footer counter) */
  totalSlides: number;
  /** For cloned slides, the index within the cloned set (0-based) */
  cloneIndex?: number;
}
```

- [ ] **Step 4: Write registry**

Create `src/lib/pptx-template/registry.ts`:

```ts
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
```

- [ ] **Step 5: Run test — expect pass**

```bash
npx vitest run src/lib/pptx-template/__tests__/registry.test.ts
```

Expected: PASS (2/2).

- [ ] **Step 6: Commit**

```bash
git add src/lib/pptx-template/types.ts src/lib/pptx-template/registry.ts src/lib/pptx-template/__tests__/registry.test.ts
git commit -m "feat(pptx-template): registry + types"
```

---

## Task 5: Core renderTemplate function (cover applicator only)

**Files:**
- Create: `src/lib/pptx-template/loader.ts`
- Create: `src/lib/pptx-template/applicators/cover.ts`
- Create: `src/lib/pptx-template/__tests__/loader.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/pptx-template/__tests__/loader.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { renderTemplate } from "../loader";
import type { BidSection } from "../../types";

const minimalSections: BidSection[] = [
  {
    title: "Cover",
    content: {
      format: "v2-cover",
      companyName: "TestCo AB",
      clientName: "TestKund",
      bidName: "Testanbud",
      diaryNumber: "TST-2026-0001",
      bidDate: "2026-04-19",
    },
  },
];

describe("renderTemplate — cover only", () => {
  it("replaces {Bolagsnamn} with companyName on slide 1", async () => {
    const buf = await renderTemplate("anbudsmall-v2", minimalSections, {
      companyName: "TestCo AB",
      diaryNumber: "TST-2026-0001",
      bidName: "Testanbud",
      bidDate: "2026-04-19",
    });
    const zip = await JSZip.loadAsync(buf);
    const slide1 = await zip.file("ppt/slides/slide1.xml")!.async("text");
    expect(slide1).toContain("TestCo AB");
    expect(slide1).not.toContain("{Bolagsnamn}");
  });
});
```

- [ ] **Step 2: Run — expect fail (no module)**

```bash
npx vitest run src/lib/pptx-template/__tests__/loader.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement cover applicator**

Create `src/lib/pptx-template/applicators/cover.ts`:

```ts
import type { ApplicatorContext } from "../types";

/** Returns a pptx-automizer slide modifier callback for the cover slide */
export function coverApplicator(ctx: ApplicatorContext) {
  const { master } = ctx;
  return (slide: any) => {
    slide.modify(replaceTextOnSlide({
      "{Bolagsnamn}": master.companyName,
      "{Anbud}": master.bidName,
      "{Diarienummer}": master.diaryNumber,
      "{Datum}": master.bidDate,
    }));
  };
}

/** Helper: walks all text frames on a slide and replaces literal placeholders */
function replaceTextOnSlide(map: Record<string, string>) {
  return (xml: any) => {
    // pptx-automizer uses the modifyXml pattern; xml is the slide's parsed XML doc.
    // Walk all <a:t> nodes and replace contents.
    const ns = "http://schemas.openxmlformats.org/drawingml/2006/main";
    const tNodes = xml.getElementsByTagNameNS(ns, "t");
    for (let i = 0; i < tNodes.length; i++) {
      const node = tNodes[i];
      let text = node.textContent ?? "";
      for (const [k, v] of Object.entries(map)) {
        if (text.includes(k)) text = text.split(k).join(v);
      }
      node.textContent = text;
    }
  };
}
```

> **Implementer note:** `pptx-automizer`'s exact API for slide-XML modification varies by version. The shape above (a `modify(callback)` that walks `<a:t>` nodes) is the conceptual contract. Verify against the installed version's docs/types and adjust the callback signature. If the lib provides a built-in `replaceText({find, replace})` helper, use that instead and keep `replaceTextOnSlide` as a fallback.

- [ ] **Step 4: Implement loader**

Create `src/lib/pptx-template/loader.ts`:

```ts
import Automizer from "pptx-automizer";
import path from "path";
import type { BidSection } from "../types";
import { getTemplate } from "./registry";
import type { ApplicatorContext, MasterContext, SlideConfig } from "./types";
import { coverApplicator } from "./applicators/cover";

export async function renderTemplate(
  templateId: string,
  sections: BidSection[],
  master: MasterContext,
): Promise<Buffer> {
  const cfg = getTemplate(templateId);
  const templateDir = path.dirname(cfg.templateFile);
  const templateFile = path.basename(cfg.templateFile);

  const automizer = new Automizer({
    templateDir,
    outputDir: "/tmp",
    removeExistingSlides: true,
  });

  const pres = automizer
    .loadRoot(templateFile)
    .load(templateFile, "main");

  let outIdx = 0;
  const totalSlides = countOutputSlides(cfg, sections);

  for (const slideCfg of cfg.slides) {
    if (slideCfg.cloneFrom) {
      // Iterate data array, clone source slide per item
      const items = getCloneItems(sections, slideCfg.cloneFrom);
      for (let i = 0; i < items.length; i++) {
        outIdx++;
        const cb = applicatorFor(slideCfg, {
          sections, master, slideNum: outIdx, totalSlides, cloneIndex: i,
        });
        pres.addSlide("main", slideCfg.source, cb);
      }
    } else {
      outIdx++;
      const cb = applicatorFor(slideCfg, {
        sections, master, slideNum: outIdx, totalSlides,
      });
      pres.addSlide("main", slideCfg.source, cb);
    }
  }

  const stream = await pres.stream();
  return await streamToBuffer(stream);
}

function applicatorFor(slideCfg: SlideConfig, ctx: ApplicatorContext) {
  switch (slideCfg.type) {
    case "cover": return coverApplicator(ctx);
    // Other applicators added in subsequent tasks. Default = no-op.
    default: return () => { /* not yet implemented */ };
  }
}

function countOutputSlides(cfg: ReturnType<typeof getTemplate>, sections: BidSection[]): number {
  let n = 0;
  for (const s of cfg.slides) {
    if (s.cloneFrom) n += getCloneItems(sections, s.cloneFrom).length;
    else n += 1;
  }
  return n;
}

function getCloneItems(sections: BidSection[], key: "phases" | "references"): unknown[] {
  // Locate the section that holds the array. For phases this is the
  // single v2-phases-overview section's data.phases; for references it's
  // the v2-references section's data.references array.
  // Implementation detail: walk sections, find by content.format.
  if (key === "phases") {
    const sec = sections.find((s) => s.content.format === "v2-phases-overview");
    if (sec && sec.content.format === "v2-phases-overview") {
      return sec.content.data.phases ?? [];
    }
  }
  if (key === "references") {
    return sections.filter((s) => s.content.format === "v2-reference");
  }
  return [];
}

function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (c) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}
```

- [ ] **Step 5: Run loader test — expect pass**

```bash
npx vitest run src/lib/pptx-template/__tests__/loader.test.ts
```

Expected: PASS — slide1.xml contains "TestCo AB" not "{Bolagsnamn}".

If FAIL: most likely `coverApplicator`'s XML-modification callback signature doesn't match the installed pptx-automizer version. Check `node_modules/pptx-automizer/dist/types.d.ts` for the slide modifier signature and adapt.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pptx-template/loader.ts src/lib/pptx-template/applicators/cover.ts src/lib/pptx-template/__tests__/loader.test.ts
git commit -m "feat(pptx-template): renderTemplate skeleton + cover applicator"
```

---

## Task 6: Prose + TOC + bullets-style applicators (slides 3, 4, 5, 11)

These are the simplest applicators — single text-frame replacement with planner-supplied content.

**Files:**
- Create: `src/lib/pptx-template/applicators/prose.ts`
- Create: `src/lib/pptx-template/applicators/toc.ts`
- Create: `src/lib/pptx-template/applicators/quality-assurance.ts`
- Modify: `src/lib/pptx-template/loader.ts` (wire applicators)
- Create: `src/lib/pptx-template/__tests__/applicators-text.test.ts`

- [ ] **Step 1: Write tests for all three applicators**

Tests assert that after rendering, each slide's XML contains the expected text and not the `{...}` placeholder. Pattern matches Task 5's approach (load buffer with JSZip, read slide XML, assert).

- [ ] **Step 2: Implement applicators**

Each applicator follows the cover pattern: build a `Record<placeholder, value>` map and return a slide modifier that does literal text replacement.

- TOC: planner gives `entries: { number, title }[]`. Replace `{02 — Kunden idag}` etc. **Note:** the mockup TOC layout is hand-designed with N rows. Cap entries at the count of rows in the template (usually 16). If fewer entries, hide unused row text-frames.
- Prose: replace single `{prose-text}` placeholder with the section's `text` field.
- Quality-assurance: bullets list — replace `{Punkt 1}`, `{Punkt 2}`, ... and hide unused.

- [ ] **Step 3: Wire into `applicatorFor` switch**

Add cases: `"prose"`, `"toc"`, `"quality-assurance"`.

- [ ] **Step 4: Run tests — expect pass**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(pptx-template): prose, toc, quality-assurance applicators"
```

---

## Task 7: Phase-detail applicator with slide cloning (slide 7 → N slides)

**This is the trickiest applicator.** Slide 7 in the mockup is a single phase-detail layout with `{Aktivitet 1..4}`, `{Leverans 1..3}`, `{Beslut 1..2}` placeholders. We clone it once per phase and fill per-clone data.

**Files:**
- Create: `src/lib/pptx-template/applicators/phase-detail.ts`
- Create: `src/lib/pptx-template/__tests__/phase-detail.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { renderTemplate } from "../loader";
import type { BidSection } from "../../types";

const sections: BidSection[] = [
  // ... cover, toc, etc. ...
  {
    title: "Genomförande översikt",
    content: {
      format: "v2-phases-overview",
      data: {
        phases: [
          { number: 1, name: "Uppstart", weeks: "M1–M2", description: "Kickoff" },
          { number: 2, name: "Analys",   weeks: "M2–M5", description: "Djupdyk" },
          { number: 3, name: "Leverans", weeks: "M5–M9", description: "Bygg" },
        ],
      },
    },
  },
  {
    title: "Fas 1",
    content: {
      format: "v2-phase-detail",
      data: {
        phaseNumber: 1, name: "Uppstart", period: "M1–M2", weeks: "2 v",
        activities: ["Workshop", "Stakeholder-mappning"],
        deliverables: ["Plan"],
        decisions: ["Go/no-go fas 2"],
        totalPhases: 3,
      },
    },
  },
  // ... fas 2, fas 3 ...
];

describe("phase-detail applicator", () => {
  it("clones slide 7 once per phase", async () => {
    const buf = await renderTemplate("anbudsmall-v2", sections, masterCtxFixture);
    const zip = await JSZip.loadAsync(buf);
    // Output should have 3 phase-detail slides — find them by checking for
    // "FAS N" text in slide XMLs.
    const slideFiles = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
    let phaseCount = 0;
    for (const f of slideFiles) {
      const xml = await zip.file(f)!.async("text");
      if (xml.includes("Workshop") || xml.includes("Djupdyk") || xml.includes("Leverans")) phaseCount++;
    }
    expect(phaseCount).toBe(3);
  });

  it("hides unused activity placeholders when fewer than 4 activities", async () => {
    const buf = await renderTemplate("anbudsmall-v2", sections, masterCtxFixture);
    const zip = await JSZip.loadAsync(buf);
    // Fas 1 has 2 activities. The 3rd and 4th text frames should be removed,
    // not present as empty strings.
    // Find Fas 1's slide and assert no {Aktivitet 3} / {Aktivitet 4} remain.
    const slideFiles = await findSlidesContaining(zip, "Workshop");
    expect(slideFiles.length).toBe(1);
    const xml = await zip.file(slideFiles[0])!.async("text");
    expect(xml).not.toContain("{Aktivitet");
  });
});
```

- [ ] **Step 2: Run test — expect fail**

- [ ] **Step 3: Implement applicator**

Create `src/lib/pptx-template/applicators/phase-detail.ts`:

```ts
import type { ApplicatorContext } from "../types";
import type { PhaseDetailV2Data } from "../../types";

export function phaseDetailApplicator(ctx: ApplicatorContext) {
  const { sections, cloneIndex } = ctx;
  const detailSections = sections.filter((s) => s.content.format === "v2-phase-detail");
  const phase = detailSections[cloneIndex ?? 0];
  if (!phase || phase.content.format !== "v2-phase-detail") {
    return () => { /* no data — leave template as-is */ };
  }
  const d = phase.content.data;

  return (slide: any) => {
    // 1. Replace single-instance placeholders
    slide.modify(replaceText({
      [`{Fas ${d.phaseNumber} — namn}`]: d.name,
      [`{M1–M2}`]: d.period,
      "{Antal veckor}": d.weeks,
    }));

    // 2. Replace numbered list items, hide unused
    fillNumberedList(slide, "Aktivitet", d.activities, 4);
    fillNumberedList(slide, "Leverans",  d.deliverables, 3);
    fillNumberedList(slide, "Beslut",    d.decisions, 2);

    // 3. Update header text frame "07 · GENOMFÖRANDE — FAS 1 AV 4"
    //    so phaseNumber and totalPhases reflect this clone
    slide.modify(replaceText({
      "FAS 1 AV 4": `FAS ${d.phaseNumber} AV ${d.totalPhases}`,
      "01": padPhaseNumber(d.phaseNumber),
    }));

    // 4. Adjust the bottom timeline bar to highlight current phase
    //    (Implementation depends on whether bars are named shapes;
    //    if not, fall back to per-bar text replacement.)
  };
}

function fillNumberedList(slide: any, label: string, items: string[], maxN: number) {
  for (let i = 1; i <= maxN; i++) {
    const placeholder = `{${label} ${i}}`;
    if (i <= items.length) {
      slide.modify(replaceText({ [placeholder]: items[i - 1] }));
    } else {
      // Remove the parent text frame containing this placeholder
      slide.removeElementContaining(placeholder);
    }
  }
}

function padPhaseNumber(n: number): string {
  return String(n).padStart(2, "0");
}

// ... shared replaceText helper imported from a sibling utils file ...
```

> **Implementer note:** `slide.removeElementContaining(placeholder)` is conceptual. pptx-automizer requires identifying elements by name or via XML walking. If the unused text frames have predictable names (like `Text 8`, `Text 9` per the mockup), use `slide.removeElement('Text 8')`. Otherwise, walk the slide XML, find `<p:sp>` elements whose `<a:t>` contains the placeholder, and delete the parent `<p:sp>`.

- [ ] **Step 4: Wire into loader's `applicatorFor` switch**

- [ ] **Step 5: Run tests — expect pass**

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(pptx-template): phase-detail applicator with cloning + hide-unused"
```

---

## Task 8: Phases-overview applicator with conditional Gantt (slide 6)

**Files:**
- Create: `src/lib/pptx-template/applicators/phases-overview.ts`
- Create: `src/lib/pptx-template/__tests__/phases-overview.test.ts`

- [ ] **Step 1: Write the failing test**

Test: render with 3 phases. Assert:
- 3 phase cards have correct names/descriptions
- 4th phase card text frames are removed (not blank)
- 4 Gantt bars are present (all months shown) — but only 3 are colored as "active"

- [ ] **Step 2: Implement**

Slide 6 has 4 fixed phase-card slots (`{Fas 1}`...`{Fas 4}`) and 4 Gantt bar text labels. Replace card content for present phases, remove card text frames for missing phases. Gantt bar adjustments — if bars are unnamed shapes, this becomes XML walk + attribute mutation. **For v1, accept up-to-4-phases as a hard cap.** Add a TODO for proportional bar resizing in a follow-up.

- [ ] **Step 3: Wire and test**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(pptx-template): phases-overview applicator (up to 4 phases)"
```

---

## Task 9: Team-pricing + requirement-matrix applicators (slides 12, 13)

These are tables. pptx-automizer can clone table rows.

**Files:**
- Create: `src/lib/pptx-template/applicators/team-pricing.ts`
- Create: `src/lib/pptx-template/applicators/requirement-matrix.ts`
- Tests: one per applicator

- [ ] **Step 1: Tests first** — assert table cell content matches input rows; assert N rows for N team members / requirements; assert columns auto-extend for variable consultant count (matrix only).

- [ ] **Step 2: Implement**

Use pptx-automizer's table modification helpers (`ModifyTableHelper` or `addTableRow` if available). For requirement-matrix dynamic columns: the mockup has fixed columns; if consultant count exceeds template's column count, document the constraint (cap at N=template-cols).

- [ ] **Step 3: Wire and test**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(pptx-template): team-pricing + requirement-matrix applicators"
```

---

## Task 10: Reference applicator with cloning + Confidentiality + Certifications (slides 14, 16, 17)

**Files:**
- Create: `src/lib/pptx-template/applicators/reference.ts`
- Create: `src/lib/pptx-template/applicators/confidentiality.ts`
- Create: `src/lib/pptx-template/applicators/certifications.ts`
- Tests for each

- [ ] **Step 1: Tests** — Reference: clones N times. Confidentiality: signature rows clone per signer. Certifications: hide unused logo placeholders.

- [ ] **Step 2: Implement**

Reference follows phase-detail's clone pattern. Confidentiality has dynamic signer rows. Certifications has up to N logo placeholders — hide unused.

- [ ] **Step 3: Wire and test**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(pptx-template): reference (clone), confidentiality, certifications"
```

---

## Task 11: Wire renderTemplate into bid-generator + pptx route

**Files:**
- Modify: `src/lib/bid-generator.ts` (replace `renderBidToPptx` call with `renderTemplate`)
- Modify: `src/app/api/bid/generate/route.ts` (or wherever bid-generator is invoked) — same change, plus pass templateId
- Modify: `scripts/generate-sample-pptx.ts` (use renderTemplate)

- [ ] **Step 1: Find current callers of renderBidToPptx**

```bash
npx grep -rn "renderBidToPptx" src/ scripts/
```

- [ ] **Step 2: Replace each call site**

```ts
// before
import { renderBidToPptx } from "./pptx";
const buf = await renderBidToPptx(sections, styleGuide);

// after
import { renderTemplate } from "./pptx-template/loader";
const buf = await renderTemplate("anbudsmall-v2", sections, masterCtx);
```

`masterCtx` is built from the cover section data and analysis fields.

- [ ] **Step 3: Run sample script**

```bash
npx tsx scripts/generate-sample-pptx.ts
```

Expected: produces `sample-bid.pptx` (or wherever the script writes). Open in PowerPoint and verify visually.

- [ ] **Step 4: Commit (post visual review)**

```bash
git commit -m "feat: wire renderTemplate into bid-generator pipeline"
```

---

## Task 12: Visual verification gate

**Files:** none (manual)

- [ ] **Step 1: Generate sample**

```bash
npx tsx scripts/generate-sample-pptx.ts
```

- [ ] **Step 2: Stefan opens output in PowerPoint and compares to mockup**

Checklist:
- All 17 slides render
- No `{...}` placeholders remain visible
- Phase-detail clones equal `phases.length`
- Reference slides equal `references.length`
- Phase-overview shows correct phase count
- Team and requirement-matrix tables show all rows

- [ ] **Step 3: Iterate if issues**

For each issue, fix the relevant applicator, regenerate, re-review.

- [ ] **Step 4: Stefan signs off**

This is the gate before deletion of legacy code.

---

## Task 13: Delete legacy pptx code

**Only after Task 12 sign-off.**

**Files:**
- Delete: `src/lib/pptx/` (entire directory)
- Delete: `tests/pptx-v2-*.test.ts`
- Delete: `src/lib/__tests__/pptx-*.test.ts`
- Delete: `scripts/extract-v2-layout.ts` (one-off mockup-extraction script no longer needed)
- Modify: `src/lib/types.ts` — remove `BidSectionContent` variants whose only purpose was to feed renderers (e.g., variants tied 1:1 to `pptxgenjs` shape choices). Keep variants that planner uses for content generation (cover, toc, prose data, phases data, references data, etc).
- Modify: `package.json` — remove `pptxgenjs` dependency

- [ ] **Step 1: Identify type cleanup scope**

Run `npx grep -rn "BidSectionContent" src/` to find usage. Categorize each variant:
- **Keep:** used by planner or AI prompts to structure content (e.g., `v2-phases-overview` data shape is the contract between AI and renderer)
- **Delete:** purely renderer-internal variants

- [ ] **Step 2: Delete directories**

```bash
git rm -r src/lib/pptx
git rm tests/pptx-v2-*.test.ts
# (etc — list each grep result)
```

- [ ] **Step 3: Remove pptxgenjs**

```bash
npm uninstall pptxgenjs
```

- [ ] **Step 4: Run full type check + test suite**

```bash
npx tsc --noEmit
npx vitest run
```

Expected: all passes. Fix any regressions caused by type cleanup.

- [ ] **Step 5: Commit**

```bash
git commit -m "chore: remove legacy pptxgenjs renderers and pptxgenjs dep"
```

---

## Task 14: Final verification + PR

- [ ] **Step 1: Full test suite + type check + build**

```bash
npx vitest run
npx tsc --noEmit
npm run build
```

Expected: green.

- [ ] **Step 2: Re-run sample script + open in PowerPoint**

Final visual confirmation. If anything regressed since Task 12, fix and re-test.

- [ ] **Step 3: Open PR**

Use the writing-plans + finishing-a-development-branch flow. PR description should:
- Summarize the pivot rationale (root cause: scale mismatch + structural mismatch with mockup)
- List benefits (designer owns design; pixel-perfect; new templates added by dropping `.pptx` + config in `templates/`)
- Note the deletion scope (entire `src/lib/pptx/` + `pptxgenjs`)
- Link to `docs/architecture/template-placeholders.md`

- [ ] **Step 4: Merge after review**

---

## Self-Review Notes

**Spec coverage:** Covers slide types 1, 2, 3-5, 6, 7-10 (cloned), 11, 12, 13, 14-15 (cloned), 16, 17 — full mockup. Cover, prose, toc, phases-overview, phase-detail, quality-assurance, team-pricing, requirement-matrix, reference, confidentiality, certifications all have applicators.

**Key risks called out:**
- pptx-automizer XML modification API may differ from the conceptual `slide.modify(callback)` shown — implementer must verify against installed version. Tasks 5 + 7 flag this.
- Phases-overview Gantt bar resizing for non-4-phase counts is deferred to v2 (hard cap at 4 for v1).
- Requirement-matrix consultant column count capped at template-defined column count for v1.

**Out of scope (future work):**
- Multiple template variants (`anbudsmall-tech-fokus.pptx`, `anbudsmall-controller.pptx`)
- Customer-specific templates (Supabase Storage)
- Template authoring UI
- Conditional whole-slide skipping (e.g., skip slide 17 if no certifications)
- Proportional Gantt bar resizing
- Per-customer brand color/font overrides on top of template

**Type consistency:** `MasterContext` defined in Task 4, used in Task 5+. `ApplicatorContext` shape consistent across applicator files. `cloneFrom: "phases" | "references"` constrained in `SlideConfig`.

---

## Execution Handoff

**Recommended:** Use `superpowers:subagent-driven-development` for this plan. Most tasks are mechanical (per-applicator implementation following the cover-applicator template established in Task 5). Two-stage review (spec compliance → code quality) catches both API drift in pptx-automizer and code-style issues.

**Alternative:** `superpowers:executing-plans` for inline batch execution if you prefer to keep all context in one session.
