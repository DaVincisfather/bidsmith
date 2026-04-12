# PPTX Renderer v2 — Visual Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the PPTX renderer from flat text-on-white to a polished, branded bid document with 8 distinct slide types, visual hierarchy, Gantt charts, and pagination.

**Architecture:** Split the monolithic `pptx-renderer.ts` into a `pptx/` module with one file per slide type + shared master helpers. Extend types with 3 new `BidSectionContent` variants (`gantt`, `three-column`, `section-divider`). Update AI prompts to produce richer phase data (risks, hours, period). All visual constants derived from `StyleGuide`.

**Tech Stack:** pptxgenjs (existing), TypeScript, Vitest

**Spec:** `docs/superpowers/specs/2026-04-09-pptx-polish-design.md`

---

## File Structure

```
src/lib/
├── types.ts                           # MODIFY — add 3 new BidSectionContent variants, extend ExecutionPhase
├── ai-schemas.ts                      # MODIFY — update PhasesResponseSchema with optional new fields
├── bid-section-prompts.ts             # MODIFY — update execution-plan prompt for risks/hours/period
├── bid-generator.ts                   # MODIFY — add section-divider + gantt data sections, update SECTION_ORDER
├── pptx/
│   ├── constants.ts                   # CREATE — layout constants, derived color helpers
│   ├── master.ts                      # CREATE — shared slide elements (sidebar, header, accent, footer)
│   ├── cover.ts                       # CREATE — cover slide renderer
│   ├── section-divider.ts             # CREATE — section divider slide renderer
│   ├── content-two-col.ts             # CREATE — prose/bullets two-column renderer
│   ├── content-three-col.ts           # CREATE — three-column panel renderer
│   ├── phase-detail.ts                # CREATE — per-phase detail slide renderer
│   ├── gantt.ts                       # CREATE — Gantt timeline slide renderer
│   ├── team-cards.ts                  # CREATE — team card renderer with pagination
│   ├── requirement-matrix.ts          # CREATE — restyled table renderer
│   ├── references.ts                  # CREATE — references renderer with pagination
│   ├── placeholder.ts                 # CREATE — placeholder slide renderer
│   └── index.ts                       # CREATE — new renderBidToPptx entry point
├── pptx-renderer.ts                   # DELETE (replaced by pptx/index.ts, re-export for backwards compat)
└── __tests__/
    ├── pptx-constants.test.ts         # CREATE — test derived colors + constants
    ├── pptx-master.test.ts            # CREATE — test master elements
    ├── pptx-renderer.test.ts          # MODIFY — update for new module structure + new slide types
    └── pptx-pagination.test.ts        # CREATE — test team/references pagination
```

---

### Task 1: Extend types with new formats and phase fields

**Files:**
- Modify: `src/lib/types.ts:140-178`

- [ ] **Step 1: Write failing test for new types**

Create `src/lib/__tests__/types-pptx-v2.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect } from "vitest";
import type {
  BidSectionContent,
  ExecutionPhase,
} from "../types";

describe("PPTX v2 type additions", () => {
  it("accepts section-divider format", () => {
    const content: BidSectionContent = {
      format: "section-divider",
      sectionNumber: 2,
      subtitle: "Arbetssätt och metod",
    };
    expect(content.format).toBe("section-divider");
  });

  it("accepts three-column format", () => {
    const content: BidSectionContent = {
      format: "three-column",
      columns: [
        { title: "Nuläge", icon: "N", body: "Text..." },
        { title: "Vad vi ser", icon: "V", body: "Text..." },
        { title: "Vårt uppdrag", icon: "U", body: "Text..." },
      ],
    };
    expect(content.format).toBe("three-column");
  });

  it("accepts gantt format", () => {
    const content: BidSectionContent = {
      format: "gantt",
      phases: [
        {
          name: "Fas 1",
          objective: "Kartlägg",
          activities: ["Intervjuer"],
          deliverables: ["Rapport"],
          duration: "4 veckor",
          risks: ["Underlag fördröjs"],
          hoursEstimate: 100,
          period: "Mars 2026",
        },
      ],
      milestones: [{ label: "Rapport klar", afterPhase: 3 }],
    };
    expect(content.format).toBe("gantt");
  });

  it("accepts ExecutionPhase with optional new fields", () => {
    const phase: ExecutionPhase = {
      name: "Fas 1",
      objective: "Test",
      activities: ["A"],
      deliverables: ["D"],
      duration: "2 veckor",
      risks: ["Risk 1"],
      hoursEstimate: 80,
      period: "April 2026",
    };
    expect(phase.risks).toEqual(["Risk 1"]);
    expect(phase.hoursEstimate).toBe(80);
    expect(phase.period).toBe("April 2026");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/types-pptx-v2.test.ts`
Expected: TypeScript compilation errors — `section-divider`, `three-column`, `gantt` not assignable to `BidSectionContent`

- [ ] **Step 3: Update types.ts**

In `src/lib/types.ts`, add optional fields to `ExecutionPhase`:

```typescript
export interface ExecutionPhase {
  name: string;
  objective: string;
  activities: string[];
  deliverables: string[];
  duration: string;
  risks?: string[];
  hoursEstimate?: number;
  period?: string;
}
```

Add new variants to `BidSectionContent` union (after `placeholder`):

```typescript
  | { format: "section-divider"; sectionNumber: number; subtitle: string }
  | { format: "three-column"; columns: { title: string; icon: string; body: string }[] }
  | { format: "gantt"; phases: ExecutionPhase[]; milestones?: { label: string; afterPhase: number }[] }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/types-pptx-v2.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/__tests__/types-pptx-v2.test.ts
git commit -m "feat: add section-divider, three-column, gantt formats and extend ExecutionPhase"
```

---

### Task 2: Create pptx/constants.ts — layout constants and color helpers

**Files:**
- Create: `src/lib/pptx/constants.ts`
- Create: `src/lib/__tests__/pptx-constants.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/lib/__tests__/pptx-constants.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { deriveColors, LAYOUT, PHASE_BAR_COLORS } from "../pptx/constants";

const testColors = {
  primary: "#1A2B4A",
  primaryLight: "#2D4A7A",
  secondary: "#E8913A",
  secondaryLight: "#F4B76E",
  accent: "#2E8B57",
  dark: "#1A1A1A",
  light: "#F5F5F0",
  muted: "#6B7280",
};

describe("deriveColors", () => {
  it("produces a headerBg lighter than primary", () => {
    const derived = deriveColors(testColors);
    // headerBg should be a 6-char hex string
    expect(derived.headerBg).toMatch(/^[0-9A-Fa-f]{6}$/);
    // It should be lighter than primary (higher sum of RGB)
    const parseHex = (h: string) => [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
    const primarySum = parseHex("1A2B4A").reduce((a, b) => a + b, 0);
    const headerSum = parseHex(derived.headerBg).reduce((a, b) => a + b, 0);
    expect(headerSum).toBeGreaterThan(primarySum);
  });

  it("returns 5 phase bar colors", () => {
    expect(PHASE_BAR_COLORS).toHaveLength(5);
    for (const color of PHASE_BAR_COLORS) {
      expect(color).toMatch(/^[0-9A-Fa-f]{6}$/);
    }
  });
});

describe("LAYOUT", () => {
  it("defines slide dimensions", () => {
    expect(LAYOUT.slideW).toBeGreaterThan(0);
    expect(LAYOUT.slideH).toBeGreaterThan(0);
    expect(LAYOUT.headerH).toBeGreaterThan(0);
    expect(LAYOUT.footerH).toBeGreaterThan(0);
    expect(LAYOUT.sidebarW).toBeGreaterThan(0);
    expect(LAYOUT.contentX).toBeGreaterThan(LAYOUT.sidebarW);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/pptx-constants.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create pptx/constants.ts**

Create `src/lib/pptx/constants.ts`:

```typescript
import { StyleGuide } from "../types";

// LAYOUT_WIDE = 13.33" × 7.5"
export const LAYOUT = {
  slideW: 13.33,
  slideH: 7.5,
  sidebarW: 0.1,         // ~8px
  headerH: 1.05,         // ~14% of 7.5
  accentLineH: 0.04,     // ~3px
  footerH: 0.38,         // ~36px
  marginL: 0.6,          // left margin (after sidebar)
  marginR: 0.45,
  marginT: 0.35,         // below accent line
  contentX: 0.6,         // = sidebarW + padding
  contentW: 12.28,       // slideW - contentX - marginR
  contentY: 1.44,        // headerH + accentLineH + marginT
  contentH: 5.68,        // slideH - contentY - footerH
} as const;

// Fixed palette for Gantt phase bars (no gradient in pptxgenjs — use solid midpoint)
export const PHASE_BAR_COLORS = [
  "E8913A", // orange
  "2E8B57", // green
  "2D4A7A", // blue
  "7C3AED", // purple
  "DC2626", // red
];

// Blend a hex color toward white by a given factor (0 = original, 1 = white)
function blendToWhite(hex: string, factor: number): string {
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const blend = (c: number) => Math.round(c + (255 - c) * factor);
  return [blend(r), blend(g), blend(b)]
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToRgb(hex: string): string {
  return hex.replace("#", "");
}

export interface DerivedColors {
  headerBg: string;
  headerBgLight: string;
  headerBorder: string;
}

export function deriveColors(colors: StyleGuide["colors"]): DerivedColors {
  const primary = hexToRgb(colors.primary);
  return {
    headerBg: blendToWhite(primary, 0.55),
    headerBgLight: blendToWhite(primary, 0.65),
    headerBorder: blendToWhite(primary, 0.45),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/pptx-constants.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/pptx/constants.ts src/lib/__tests__/pptx-constants.test.ts
git commit -m "feat: add pptx layout constants and derived color helpers"
```

---

### Task 3: Create pptx/master.ts — shared slide elements

**Files:**
- Create: `src/lib/pptx/master.ts`
- Create: `src/lib/__tests__/pptx-master.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/lib/__tests__/pptx-master.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect } from "vitest";
import PptxGenJS from "pptxgenjs";
import { addMasterElements } from "../pptx/master";
import { StyleGuide } from "../types";

const style: StyleGuide = {
  colors: {
    primary: "#1A2B4A", primaryLight: "#2D4A7A",
    secondary: "#E8913A", secondaryLight: "#F4B76E",
    accent: "#2E8B57", dark: "#1A1A1A",
    light: "#F5F5F0", muted: "#6B7280",
  },
  font: "Calibri",
  logoUrl: "",
};

describe("addMasterElements", () => {
  it("adds sidebar, header, accent line, and footer without throwing", () => {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    const slide = pptx.addSlide();
    expect(() =>
      addMasterElements(slide, {
        title: "Uppdragsförståelse",
        style,
        slideNumber: 4,
        totalSlides: 14,
      })
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/pptx-master.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create pptx/master.ts**

Create `src/lib/pptx/master.ts`:

```typescript
import PptxGenJS from "pptxgenjs";
import { StyleGuide } from "../types";
import { LAYOUT, hexToRgb, deriveColors } from "./constants";

interface MasterOptions {
  title: string;
  style: StyleGuide;
  slideNumber: number;
  totalSlides: number;
  rightHeaderText?: string; // e.g. period for phase slides
}

export function addMasterElements(
  slide: PptxGenJS.Slide,
  opts: MasterOptions
): void {
  const { style, title, slideNumber, totalSlides } = opts;
  const c = style.colors;
  const derived = deriveColors(c);

  // 1. Left sidebar
  slide.addShape("rect", {
    x: 0, y: 0,
    w: LAYOUT.sidebarW, h: LAYOUT.slideH,
    fill: { color: hexToRgb(c.primary) },
  });

  // 2. Header band
  slide.addShape("rect", {
    x: 0, y: 0,
    w: LAYOUT.slideW, h: LAYOUT.headerH,
    fill: { color: derived.headerBg },
  });

  // Accent bar next to title
  slide.addShape("rect", {
    x: LAYOUT.contentX - 0.15, y: (LAYOUT.headerH - 0.25) / 2,
    w: 0.04, h: 0.25,
    fill: { color: hexToRgb(c.secondary) },
  });

  // Title text
  slide.addText(title, {
    x: LAYOUT.contentX, y: 0,
    w: 9, h: LAYOUT.headerH,
    fontSize: 16, fontFace: style.font,
    color: hexToRgb(c.primary), bold: true,
    valign: "middle",
  });

  // Logo placeholder (right)
  slide.addText("LOGOTYP", {
    x: LAYOUT.slideW - 1.5, y: 0,
    w: 1.2, h: LAYOUT.headerH,
    fontSize: 8, fontFace: style.font,
    color: derived.headerBorder,
    align: "right", valign: "middle",
  });

  // Optional right text (e.g. period)
  if (opts.rightHeaderText) {
    slide.addText(opts.rightHeaderText, {
      x: LAYOUT.slideW - 3, y: 0,
      w: 1.3, h: LAYOUT.headerH,
      fontSize: 10, fontFace: style.font,
      color: hexToRgb(c.muted),
      align: "right", valign: "middle",
    });
  }

  // 3. Accent line below header
  slide.addShape("rect", {
    x: 0, y: LAYOUT.headerH,
    w: LAYOUT.slideW * 0.6, h: LAYOUT.accentLineH,
    fill: { color: hexToRgb(c.secondary) },
  });

  // 4. Footer
  const footerY = LAYOUT.slideH - LAYOUT.footerH;

  // Footer top border
  slide.addShape("line", {
    x: 0, y: footerY,
    w: LAYOUT.slideW, h: 0,
    line: { color: "E0E0E0", width: 0.5 },
  });

  slide.addText("Konfidentiellt", {
    x: LAYOUT.contentX, y: footerY,
    w: 3, h: LAYOUT.footerH,
    fontSize: 7, fontFace: style.font,
    color: hexToRgb(c.muted), valign: "middle",
  });

  slide.addText(`${slideNumber} / ${totalSlides}`, {
    x: LAYOUT.slideW - 1.5, y: footerY,
    w: 1.2, h: LAYOUT.footerH,
    fontSize: 7, fontFace: style.font,
    color: hexToRgb(c.muted), align: "right", valign: "middle",
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/pptx-master.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/pptx/master.ts src/lib/__tests__/pptx-master.test.ts
git commit -m "feat: add shared slide master elements (sidebar, header, accent, footer)"
```

---

### Task 4: Create slide renderers — cover, section-divider, placeholder

**Files:**
- Create: `src/lib/pptx/cover.ts`
- Create: `src/lib/pptx/section-divider.ts`
- Create: `src/lib/pptx/placeholder.ts`

- [ ] **Step 1: Write failing test**

Add to `src/lib/__tests__/pptx-renderer.test.ts` (keep existing tests, add new):

```typescript
import { renderCoverSlide } from "../pptx/cover";
import { renderSectionDividerSlide } from "../pptx/section-divider";
import { renderPlaceholderSlide } from "../pptx/placeholder";

describe("individual slide renderers", () => {
  it("renders cover slide without throwing", () => {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    expect(() =>
      renderCoverSlide(pptx, {
        title: "Test Bid",
        client: "Kund AB",
        date: "2026-04-09",
      }, mockStyleGuide)
    ).not.toThrow();
  });

  it("renders section-divider slide without throwing", () => {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    expect(() =>
      renderSectionDividerSlide(pptx, {
        title: "Genomförandeplan",
        sectionNumber: 2,
        subtitle: "Arbetssätt och metod",
      }, mockStyleGuide, 3, 14)
    ).not.toThrow();
  });

  it("renders placeholder slide without throwing", () => {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    expect(() =>
      renderPlaceholderSlide(pptx, {
        title: "Pris",
        instruction: "Fyll i prisbild",
      }, mockStyleGuide, 14, 14)
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/pptx-renderer.test.ts`
Expected: FAIL — modules not found

- [ ] **Step 3: Create cover.ts**

Create `src/lib/pptx/cover.ts`:

```typescript
import PptxGenJS from "pptxgenjs";
import { StyleGuide } from "../types";
import { LAYOUT, hexToRgb, deriveColors } from "./constants";

interface CoverData {
  title: string;
  client: string;
  date: string;
}

export function renderCoverSlide(
  pptx: PptxGenJS,
  data: CoverData,
  style: StyleGuide
): void {
  const slide = pptx.addSlide();
  const c = style.colors;
  const derived = deriveColors(c);

  // Light gradient background (solid approximation)
  slide.background = { color: derived.headerBgLight };

  // Left sidebar accent
  slide.addShape("rect", {
    x: 0, y: 0,
    w: LAYOUT.sidebarW, h: LAYOUT.slideH,
    fill: { color: hexToRgb(c.primary) },
  });

  // Decorative diagonal shape (subtle)
  slide.addShape("rect", {
    x: 7, y: 0,
    w: 6.5, h: LAYOUT.slideH,
    fill: { color: derived.headerBg },
    rotate: -5,
  });

  // "ANBUD" label with accent line
  slide.addShape("rect", {
    x: 0.8, y: 2.8,
    w: 0.5, h: 0.04,
    fill: { color: hexToRgb(c.secondary) },
  });

  slide.addText("ANBUD", {
    x: 1.45, y: 2.68,
    w: 2, h: 0.3,
    fontSize: 9, fontFace: style.font,
    color: hexToRgb(c.secondary),
    bold: true, charSpacing: 3,
  });

  // Title
  slide.addText(data.title, {
    x: 0.8, y: 3.1,
    w: 6, h: 1.4,
    fontSize: 22, fontFace: style.font,
    color: hexToRgb(c.primary), bold: true,
    valign: "top", lineSpacingMultiple: 1.2,
  });

  // Divider line
  slide.addShape("rect", {
    x: 0.8, y: 4.6,
    w: 0.8, h: 0.01,
    fill: { color: hexToRgb(c.muted) },
  });

  // Client
  slide.addText(data.client, {
    x: 0.8, y: 4.75,
    w: 5, h: 0.35,
    fontSize: 13, fontFace: style.font,
    color: hexToRgb(c.muted),
  });

  // Date
  slide.addText(data.date, {
    x: 0.8, y: 5.1,
    w: 5, h: 0.3,
    fontSize: 11, fontFace: style.font,
    color: derived.headerBorder,
  });

  // Logo placeholder bottom right
  slide.addText("LOGOTYP", {
    x: LAYOUT.slideW - 2, y: LAYOUT.slideH - 0.7,
    w: 1.5, h: 0.3,
    fontSize: 9, fontFace: style.font,
    color: derived.headerBorder,
    align: "right",
  });

  // Bottom accent bar
  slide.addShape("rect", {
    x: 0, y: LAYOUT.slideH - 0.05,
    w: LAYOUT.slideW * 0.5, h: 0.05,
    fill: { color: hexToRgb(c.primary) },
  });
}
```

- [ ] **Step 4: Create section-divider.ts**

Create `src/lib/pptx/section-divider.ts`:

```typescript
import PptxGenJS from "pptxgenjs";
import { StyleGuide } from "../types";
import { LAYOUT, hexToRgb, deriveColors } from "./constants";

interface SectionDividerData {
  title: string;
  sectionNumber: number;
  subtitle: string;
}

export function renderSectionDividerSlide(
  pptx: PptxGenJS,
  data: SectionDividerData,
  style: StyleGuide,
  slideNumber: number,
  totalSlides: number
): void {
  const slide = pptx.addSlide();
  const c = style.colors;
  const derived = deriveColors(c);

  slide.background = { color: hexToRgb(c.light) };

  // Left sidebar
  slide.addShape("rect", {
    x: 0, y: 0,
    w: LAYOUT.sidebarW, h: LAYOUT.slideH,
    fill: { color: hexToRgb(c.primary) },
  });

  // Large faded number
  const numStr = String(data.sectionNumber).padStart(2, "0");
  slide.addText(numStr, {
    x: 8, y: 1.5,
    w: 5, h: 4.5,
    fontSize: 140, fontFace: style.font,
    color: derived.headerBgLight, bold: true,
    align: "right", valign: "middle",
  });

  // "Avsnitt 02" label
  slide.addShape("rect", {
    x: 0.8, y: 3.0,
    w: 0.4, h: 0.04,
    fill: { color: hexToRgb(c.secondary) },
  });

  slide.addText(`AVSNITT ${numStr}`, {
    x: 1.35, y: 2.88,
    w: 3, h: 0.3,
    fontSize: 9, fontFace: style.font,
    color: hexToRgb(c.secondary),
    bold: true, charSpacing: 3,
  });

  // Title
  slide.addText(data.title, {
    x: 0.8, y: 3.3,
    w: 8, h: 0.7,
    fontSize: 28, fontFace: style.font,
    color: hexToRgb(c.primary), bold: true,
  });

  // Subtitle
  slide.addText(data.subtitle, {
    x: 0.8, y: 4.05,
    w: 8, h: 0.4,
    fontSize: 13, fontFace: style.font,
    color: hexToRgb(c.muted),
  });

  // Footer
  slide.addText(`${slideNumber} / ${totalSlides}`, {
    x: LAYOUT.slideW - 1.5, y: LAYOUT.slideH - LAYOUT.footerH,
    w: 1.2, h: LAYOUT.footerH,
    fontSize: 7, fontFace: style.font,
    color: hexToRgb(c.muted), align: "right", valign: "middle",
  });

  // Bottom accent bar
  slide.addShape("rect", {
    x: 0, y: LAYOUT.slideH - 0.05,
    w: LAYOUT.slideW * 0.4, h: 0.05,
    fill: { color: hexToRgb(c.primary) },
  });
}
```

- [ ] **Step 5: Create placeholder.ts**

Create `src/lib/pptx/placeholder.ts`:

```typescript
import PptxGenJS from "pptxgenjs";
import { StyleGuide } from "../types";
import { LAYOUT, hexToRgb } from "./constants";
import { addMasterElements } from "./master";

interface PlaceholderData {
  title: string;
  instruction: string;
}

export function renderPlaceholderSlide(
  pptx: PptxGenJS,
  data: PlaceholderData,
  style: StyleGuide,
  slideNumber: number,
  totalSlides: number
): void {
  const slide = pptx.addSlide();
  addMasterElements(slide, {
    title: data.title,
    style,
    slideNumber,
    totalSlides,
  });

  slide.addText(data.instruction, {
    x: 2, y: 2.5,
    w: 9, h: 2.5,
    fontSize: 16, fontFace: style.font,
    color: hexToRgb(style.colors.muted),
    align: "center", valign: "middle", italic: true,
  });
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/pptx-renderer.test.ts`
Expected: All tests PASS (both old and new)

- [ ] **Step 7: Commit**

```bash
git add src/lib/pptx/cover.ts src/lib/pptx/section-divider.ts src/lib/pptx/placeholder.ts src/lib/__tests__/pptx-renderer.test.ts
git commit -m "feat: add cover, section-divider, and placeholder slide renderers"
```

---

### Task 5: Create content renderers — two-column (prose/bullets) and three-column

**Files:**
- Create: `src/lib/pptx/content-two-col.ts`
- Create: `src/lib/pptx/content-three-col.ts`

- [ ] **Step 1: Write failing test**

Add to `src/lib/__tests__/pptx-renderer.test.ts`:

```typescript
import { renderProseSlide, renderBulletsSlide } from "../pptx/content-two-col";
import { renderThreeColumnSlide } from "../pptx/content-three-col";

describe("content slide renderers", () => {
  it("renders prose slide without throwing", () => {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    expect(() =>
      renderProseSlide(pptx, { title: "Uppdragsförståelse", text: "Vi förstår ert behov." }, mockStyleGuide, 4, 14)
    ).not.toThrow();
  });

  it("renders bullets slide without throwing", () => {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    expect(() =>
      renderBulletsSlide(pptx, { title: "Värde", items: ["Punkt 1", "Punkt 2"] }, mockStyleGuide, 5, 14)
    ).not.toThrow();
  });

  it("renders three-column slide without throwing", () => {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    expect(() =>
      renderThreeColumnSlide(pptx, {
        title: "Vår förståelse",
        columns: [
          { title: "Nuläge", icon: "N", body: "Text 1" },
          { title: "Vad vi ser", icon: "V", body: "Text 2" },
          { title: "Vårt uppdrag", icon: "U", body: "Text 3" },
        ],
      }, mockStyleGuide, 5, 14)
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/pptx-renderer.test.ts`
Expected: FAIL — modules not found

- [ ] **Step 3: Create content-two-col.ts**

Create `src/lib/pptx/content-two-col.ts`:

```typescript
import PptxGenJS from "pptxgenjs";
import { StyleGuide } from "../types";
import { LAYOUT, hexToRgb } from "./constants";
import { addMasterElements } from "./master";

export function renderProseSlide(
  pptx: PptxGenJS,
  data: { title: string; text: string },
  style: StyleGuide,
  slideNumber: number,
  totalSlides: number
): void {
  const slide = pptx.addSlide();
  addMasterElements(slide, { title: data.title, style, slideNumber, totalSlides });

  slide.addText(data.text, {
    x: LAYOUT.contentX, y: LAYOUT.contentY,
    w: LAYOUT.contentW, h: LAYOUT.contentH,
    fontSize: 12, fontFace: style.font,
    color: hexToRgb(style.colors.dark),
    valign: "top", lineSpacingMultiple: 1.4,
  });
}

export function renderBulletsSlide(
  pptx: PptxGenJS,
  data: { title: string; items: string[] },
  style: StyleGuide,
  slideNumber: number,
  totalSlides: number
): void {
  const slide = pptx.addSlide();
  addMasterElements(slide, { title: data.title, style, slideNumber, totalSlides });

  const bulletRows = data.items.map((item) => ({
    text: item,
    options: {
      fontSize: 12,
      fontFace: style.font,
      color: hexToRgb(style.colors.dark),
      bullet: { type: "number" as const },
      paraSpaceAfter: 10,
      lineSpacingMultiple: 1.3,
    },
  }));

  slide.addText(bulletRows, {
    x: LAYOUT.contentX, y: LAYOUT.contentY,
    w: LAYOUT.contentW, h: LAYOUT.contentH,
    valign: "top",
  });
}
```

- [ ] **Step 4: Create content-three-col.ts**

Create `src/lib/pptx/content-three-col.ts`:

```typescript
import PptxGenJS from "pptxgenjs";
import { StyleGuide } from "../types";
import { LAYOUT, hexToRgb, deriveColors, PHASE_BAR_COLORS } from "./constants";
import { addMasterElements } from "./master";

interface ThreeColumnData {
  title: string;
  columns: { title: string; icon: string; body: string }[];
}

const COLUMN_COLORS = [
  PHASE_BAR_COLORS[0], // orange
  PHASE_BAR_COLORS[1], // green
  PHASE_BAR_COLORS[2], // blue
];

export function renderThreeColumnSlide(
  pptx: PptxGenJS,
  data: ThreeColumnData,
  style: StyleGuide,
  slideNumber: number,
  totalSlides: number
): void {
  const slide = pptx.addSlide();
  addMasterElements(slide, { title: data.title, style, slideNumber, totalSlides });

  const cols = data.columns.slice(0, 3); // max 3
  const colW = (LAYOUT.contentW - 0.3) / 3; // 0.15 gap × 2
  const colH = LAYOUT.contentH;

  cols.forEach((col, i) => {
    const x = LAYOUT.contentX + i * (colW + 0.15);
    const y = LAYOUT.contentY;
    const barColor = COLUMN_COLORS[i % COLUMN_COLORS.length];

    // Card background
    slide.addShape("rect", {
      x, y, w: colW, h: colH,
      fill: { color: hexToRgb(style.colors.light) },
      rectRadius: 0.05,
    });

    // Top accent bar
    slide.addShape("rect", {
      x, y, w: colW, h: 0.06,
      fill: { color: barColor },
    });

    // Icon circle
    slide.addShape("ellipse", {
      x: x + 0.15, y: y + 0.2,
      w: 0.3, h: 0.3,
      fill: { color: barColor },
    });

    slide.addText(col.icon, {
      x: x + 0.15, y: y + 0.2,
      w: 0.3, h: 0.3,
      fontSize: 12, fontFace: style.font,
      color: "FFFFFF", bold: true,
      align: "center", valign: "middle",
    });

    // Column title
    slide.addText(col.title, {
      x: x + 0.55, y: y + 0.2,
      w: colW - 0.7, h: 0.3,
      fontSize: 11, fontFace: style.font,
      color: hexToRgb(style.colors.primary), bold: true,
      valign: "middle",
    });

    // Body text
    slide.addText(col.body, {
      x: x + 0.15, y: y + 0.65,
      w: colW - 0.3, h: colH - 0.8,
      fontSize: 9, fontFace: style.font,
      color: hexToRgb(style.colors.dark),
      valign: "top", lineSpacingMultiple: 1.5,
    });
  });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/pptx-renderer.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/pptx/content-two-col.ts src/lib/pptx/content-three-col.ts src/lib/__tests__/pptx-renderer.test.ts
git commit -m "feat: add two-column and three-column content slide renderers"
```

---

### Task 6: Create phase-detail and Gantt renderers

**Files:**
- Create: `src/lib/pptx/phase-detail.ts`
- Create: `src/lib/pptx/gantt.ts`

- [ ] **Step 1: Write failing test**

Add to `src/lib/__tests__/pptx-renderer.test.ts`:

```typescript
import { renderPhaseDetailSlides } from "../pptx/phase-detail";
import { renderGanttSlide } from "../pptx/gantt";

const testPhases = [
  {
    name: "Fas 1: Uppstart",
    objective: "Kartlägg nuläge",
    activities: ["Uppstartsmöte", "Intervjuer", "Materialinventering"],
    deliverables: ["Projektplan", "Intervjulista"],
    duration: "4 veckor",
    risks: ["Underlag kan fördröjas"],
    hoursEstimate: 100,
    period: "Mars 2026",
  },
  {
    name: "Fas 2: Analys",
    objective: "Analysera data",
    activities: ["Dataanalys", "Benchmarking"],
    deliverables: ["Analysrapport"],
    duration: "6 veckor",
    hoursEstimate: 120,
    period: "April–Maj 2026",
  },
];

describe("phase and gantt renderers", () => {
  it("renders phase detail slides (one per phase)", () => {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    renderPhaseDetailSlides(pptx, testPhases, mockStyleGuide, 7, 14);
    // Should have created 2 slides (one per phase)
    // pptxgenjs doesn't expose slide count easily, so just check no throw
  });

  it("renders gantt slide without throwing", () => {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    expect(() =>
      renderGanttSlide(pptx, {
        phases: testPhases,
        milestones: [{ label: "Rapport klar", afterPhase: 1 }],
      }, mockStyleGuide, 6, 14)
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/pptx-renderer.test.ts`
Expected: FAIL — modules not found

- [ ] **Step 3: Create phase-detail.ts**

Create `src/lib/pptx/phase-detail.ts`:

```typescript
import PptxGenJS from "pptxgenjs";
import { ExecutionPhase, StyleGuide } from "../types";
import { LAYOUT, hexToRgb, deriveColors, PHASE_BAR_COLORS } from "./constants";

export function renderPhaseDetailSlides(
  pptx: PptxGenJS,
  phases: ExecutionPhase[],
  style: StyleGuide,
  startSlideNumber: number,
  totalSlides: number
): void {
  const c = style.colors;
  const derived = deriveColors(c);

  phases.forEach((phase, idx) => {
    const slide = pptx.addSlide();
    const slideNum = startSlideNumber + idx;

    // Sidebar
    slide.addShape("rect", {
      x: 0, y: 0, w: LAYOUT.sidebarW, h: LAYOUT.slideH,
      fill: { color: hexToRgb(c.primary) },
    });

    // Header band
    slide.addShape("rect", {
      x: 0, y: 0, w: LAYOUT.slideW, h: LAYOUT.headerH,
      fill: { color: derived.headerBg },
    });

    // Phase number circle
    const circleColor = PHASE_BAR_COLORS[idx % PHASE_BAR_COLORS.length];
    slide.addShape("ellipse", {
      x: 0.35, y: (LAYOUT.headerH - 0.45) / 2,
      w: 0.45, h: 0.45,
      fill: { color: circleColor },
      shadow: { type: "outer", blur: 3, offset: 2, color: "000000", opacity: 0.15 },
    });
    slide.addText(String(idx + 1), {
      x: 0.35, y: (LAYOUT.headerH - 0.45) / 2,
      w: 0.45, h: 0.45,
      fontSize: 18, fontFace: style.font,
      color: "FFFFFF", bold: true,
      align: "center", valign: "middle",
    });

    // Phase title
    slide.addText(phase.name, {
      x: 0.9, y: 0, w: 7, h: LAYOUT.headerH,
      fontSize: 16, fontFace: style.font,
      color: hexToRgb(c.primary), bold: true, valign: "middle",
    });

    // Period (right)
    if (phase.period) {
      slide.addText(phase.period, {
        x: LAYOUT.slideW - 3.5, y: 0.1,
        w: 1.5, h: 0.4,
        fontSize: 10, fontFace: style.font,
        color: hexToRgb(c.muted), align: "right",
      });
    }

    // Hours badge
    if (phase.hoursEstimate) {
      slide.addShape("roundRect", {
        x: LAYOUT.slideW - 1.8, y: (LAYOUT.headerH - 0.35) / 2,
        w: 1.0, h: 0.35,
        rectRadius: 0.15,
        fill: { color: hexToRgb(c.light) },
        line: { color: hexToRgb(c.secondaryLight), width: 1 },
      });
      slide.addText(`~${phase.hoursEstimate} h`, {
        x: LAYOUT.slideW - 1.8, y: (LAYOUT.headerH - 0.35) / 2,
        w: 1.0, h: 0.35,
        fontSize: 10, fontFace: style.font,
        color: hexToRgb(c.secondary), bold: true,
        align: "center", valign: "middle",
      });
    }

    // Accent line
    slide.addShape("rect", {
      x: 0, y: LAYOUT.headerH,
      w: LAYOUT.slideW * 0.6, h: LAYOUT.accentLineH,
      fill: { color: hexToRgb(c.secondary) },
    });

    const contentY = LAYOUT.contentY;
    const rightX = LAYOUT.contentX + LAYOUT.contentW * 0.62;
    const rightW = LAYOUT.contentW * 0.35;
    const leftW = LAYOUT.contentW * 0.58;

    // Activities (left)
    slide.addText("Aktiviteter", {
      x: LAYOUT.contentX, y: contentY,
      w: leftW, h: 0.35,
      fontSize: 11, fontFace: style.font,
      color: hexToRgb(c.primary), bold: true,
    });

    const actRows = phase.activities.map((a, i) => ({
      text: `${String(i + 1).padStart(2, "0")}  ${a}`,
      options: {
        fontSize: 10, fontFace: style.font,
        color: hexToRgb(c.dark),
        paraSpaceAfter: 6,
        lineSpacingMultiple: 1.3,
      },
    }));
    slide.addText(actRows, {
      x: LAYOUT.contentX, y: contentY + 0.4,
      w: leftW, h: LAYOUT.contentH - 1.2,
      valign: "top",
    });

    // Deliverables panel (right top)
    const panelH = LAYOUT.contentH * 0.55;
    slide.addShape("rect", {
      x: rightX, y: contentY,
      w: rightW, h: panelH,
      fill: { color: hexToRgb(c.light) },
      rectRadius: 0.05,
    });

    slide.addText("Leverabler", {
      x: rightX + 0.15, y: contentY + 0.1,
      w: rightW - 0.3, h: 0.3,
      fontSize: 11, fontFace: style.font,
      color: hexToRgb(c.primary), bold: true,
    });

    const delRows = phase.deliverables.map((d) => ({
      text: d,
      options: {
        fontSize: 9, fontFace: style.font,
        color: hexToRgb(c.dark),
        bullet: { code: "2022" },
        paraSpaceAfter: 4,
      },
    }));
    slide.addText(delRows, {
      x: rightX + 0.15, y: contentY + 0.45,
      w: rightW - 0.3, h: panelH - 0.6,
      valign: "top",
    });

    // Risk panel (right bottom)
    if (phase.risks && phase.risks.length > 0) {
      const riskY = contentY + panelH + 0.1;
      const riskH = LAYOUT.contentH - panelH - 0.6;

      // Left accent border
      slide.addShape("rect", {
        x: rightX, y: riskY,
        w: 0.04, h: riskH,
        fill: { color: hexToRgb(c.secondary) },
      });

      slide.addShape("rect", {
        x: rightX + 0.04, y: riskY,
        w: rightW - 0.04, h: riskH,
        fill: { color: "FEF9F3" },
      });

      slide.addText("Risk", {
        x: rightX + 0.2, y: riskY + 0.05,
        w: rightW - 0.35, h: 0.25,
        fontSize: 9, fontFace: style.font,
        color: hexToRgb(c.secondary), bold: true,
      });

      slide.addText(phase.risks.join(". "), {
        x: rightX + 0.2, y: riskY + 0.3,
        w: rightW - 0.35, h: riskH - 0.4,
        fontSize: 8, fontFace: style.font,
        color: "7A5A2E", valign: "top", lineSpacingMultiple: 1.3,
      });
    }

    // Progress indicator (bottom)
    const dotY = LAYOUT.slideH - LAYOUT.footerH - 0.5;
    const dotSize = 0.25;
    const totalDots = phases.length;
    const totalDotsW = totalDots * dotSize + (totalDots - 1) * 0.35;
    const startX = (LAYOUT.slideW - totalDotsW) / 2;

    phases.forEach((_, di) => {
      const dx = startX + di * (dotSize + 0.35);
      const isActive = di === idx;
      const dotColor = isActive ? circleColor : "E0E0E0";

      slide.addShape("ellipse", {
        x: dx, y: dotY, w: dotSize, h: dotSize,
        fill: { color: dotColor },
      });
      slide.addText(String(di + 1), {
        x: dx, y: dotY, w: dotSize, h: dotSize,
        fontSize: 9, fontFace: style.font,
        color: isActive ? "FFFFFF" : "AAAAAA",
        align: "center", valign: "middle", bold: true,
      });

      // Connecting line
      if (di < totalDots - 1) {
        slide.addShape("line", {
          x: dx + dotSize, y: dotY + dotSize / 2,
          w: 0.35, h: 0,
          line: { color: "E0E0E0", width: 1 },
        });
      }
    });

    // Footer
    const footerY = LAYOUT.slideH - LAYOUT.footerH;
    slide.addShape("line", {
      x: 0, y: footerY, w: LAYOUT.slideW, h: 0,
      line: { color: "E0E0E0", width: 0.5 },
    });
    slide.addText("Konfidentiellt", {
      x: LAYOUT.contentX, y: footerY, w: 3, h: LAYOUT.footerH,
      fontSize: 7, fontFace: style.font, color: hexToRgb(c.muted), valign: "middle",
    });
    slide.addText(`${slideNum} / ${totalSlides}`, {
      x: LAYOUT.slideW - 1.5, y: footerY, w: 1.2, h: LAYOUT.footerH,
      fontSize: 7, fontFace: style.font, color: hexToRgb(c.muted),
      align: "right", valign: "middle",
    });
  });
}
```

- [ ] **Step 4: Create gantt.ts**

Create `src/lib/pptx/gantt.ts`:

```typescript
import PptxGenJS from "pptxgenjs";
import { ExecutionPhase, StyleGuide } from "../types";
import { LAYOUT, hexToRgb, deriveColors, PHASE_BAR_COLORS } from "./constants";
import { addMasterElements } from "./master";

interface GanttData {
  phases: ExecutionPhase[];
  milestones?: { label: string; afterPhase: number }[];
}

// Parse duration like "4 veckor", "2 månader" into approximate months
function durationToMonths(duration: string): number {
  const lower = duration.toLowerCase();
  const num = parseFloat(lower) || 1;
  if (lower.includes("vecka") || lower.includes("veckor")) return num / 4;
  if (lower.includes("månad") || lower.includes("månader")) return num;
  if (lower.includes("dag") || lower.includes("dagar")) return num / 30;
  return num / 4; // default: assume weeks
}

export function renderGanttSlide(
  pptx: PptxGenJS,
  data: GanttData,
  style: StyleGuide,
  slideNumber: number,
  totalSlides: number
): void {
  const slide = pptx.addSlide();
  const c = style.colors;
  const derived = deriveColors(c);

  addMasterElements(slide, {
    title: "Tidplan med hållpunkter",
    style, slideNumber, totalSlides,
  });

  const { phases } = data;
  const totalMonths = phases.reduce((sum, p) => sum + durationToMonths(p.duration), 0);
  const monthCount = Math.max(Math.ceil(totalMonths), 4);

  // Gantt area
  const ganttX = LAYOUT.contentX + 2.2; // label area = 2.2"
  const ganttW = LAYOUT.contentW - 2.2;
  const ganttY = LAYOUT.contentY + 0.5;
  const rowH = 0.4;
  const monthW = ganttW / monthCount;

  // Month headers
  for (let m = 0; m < monthCount; m++) {
    slide.addShape("rect", {
      x: ganttX + m * monthW, y: ganttY - 0.35,
      w: monthW - 0.02, h: 0.3,
      fill: { color: hexToRgb(c.primaryLight) },
      rectRadius: 0.03,
    });
    slide.addText(`M${m + 1}`, {
      x: ganttX + m * monthW, y: ganttY - 0.35,
      w: monthW - 0.02, h: 0.3,
      fontSize: 8, fontFace: style.font,
      color: "FFFFFF", bold: true,
      align: "center", valign: "middle",
    });
  }

  // Phase rows
  let monthOffset = 0;
  phases.forEach((phase, i) => {
    const y = ganttY + i * (rowH + 0.12);
    const dur = durationToMonths(phase.duration);
    const barW = dur * monthW;
    const barX = ganttX + monthOffset * monthW;
    const barColor = PHASE_BAR_COLORS[i % PHASE_BAR_COLORS.length];

    // Phase label
    slide.addText(phase.name, {
      x: LAYOUT.contentX, y,
      w: 2.1, h: rowH,
      fontSize: 9, fontFace: style.font,
      color: hexToRgb(c.primary), bold: true,
      align: "right", valign: "middle",
    });

    // Bar background (light)
    slide.addShape("rect", {
      x: ganttX, y,
      w: ganttW, h: rowH,
      fill: { color: "FAFAFA" },
      rectRadius: 0.03,
    });

    // Phase bar
    slide.addShape("rect", {
      x: barX, y: y + 0.04,
      w: Math.max(barW, monthW * 0.5), h: rowH - 0.08,
      fill: { color: barColor },
      rectRadius: 0.03,
      shadow: { type: "outer", blur: 2, offset: 1, color: "000000", opacity: 0.12 },
    });

    // Hours label in bar
    if (phase.hoursEstimate) {
      slide.addText(`${phase.hoursEstimate}h`, {
        x: barX, y: y + 0.04,
        w: Math.max(barW, monthW * 0.5), h: rowH - 0.08,
        fontSize: 7, fontFace: style.font,
        color: "FFFFFF", bold: true,
        align: "center", valign: "middle",
      });
    }

    monthOffset += dur;
  });

  // Milestones
  if (data.milestones) {
    let mOffset = 0;
    for (let i = 0; i < data.milestones[0]?.afterPhase && i < phases.length; i++) {
      mOffset += durationToMonths(phases[i].duration);
    }

    for (const ms of data.milestones) {
      let msOffset = 0;
      for (let i = 0; i < ms.afterPhase && i < phases.length; i++) {
        msOffset += durationToMonths(phases[i].duration);
      }
      const msX = ganttX + msOffset * monthW;
      const msY = ganttY + phases.length * (rowH + 0.12) + 0.1;

      slide.addShape("diamond", {
        x: msX - 0.1, y: msY,
        w: 0.2, h: 0.2,
        fill: { color: hexToRgb(c.secondary) },
      });

      slide.addText(ms.label, {
        x: msX - 0.6, y: msY + 0.25,
        w: 1.2, h: 0.2,
        fontSize: 7, fontFace: style.font,
        color: hexToRgb(c.secondary), bold: true,
        align: "center",
      });
    }
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/pptx-renderer.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/pptx/phase-detail.ts src/lib/pptx/gantt.ts src/lib/__tests__/pptx-renderer.test.ts
git commit -m "feat: add phase-detail and Gantt timeline slide renderers"
```

---

### Task 7: Create team-cards and references renderers with pagination

**Files:**
- Create: `src/lib/pptx/team-cards.ts`
- Create: `src/lib/pptx/references.ts`
- Create: `src/lib/__tests__/pptx-pagination.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/lib/__tests__/pptx-pagination.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect } from "vitest";
import PptxGenJS from "pptxgenjs";
import { renderTeamSlides } from "../pptx/team-cards";
import { renderReferencesSlides } from "../pptx/references";
import { StyleGuide } from "../types";

const mockStyleGuide: StyleGuide = {
  colors: {
    primary: "#1A2B4A", primaryLight: "#2D4A7A",
    secondary: "#E8913A", secondaryLight: "#F4B76E",
    accent: "#2E8B57", dark: "#1A1A1A",
    light: "#F5F5F0", muted: "#6B7280",
  },
  font: "Calibri", logoUrl: "",
};

describe("team-cards pagination", () => {
  it("renders 5 members across 2 slides (3 + 2)", () => {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    const members = Array.from({ length: 5 }, (_, i) => ({
      consultantId: `c${i}`,
      name: `Konsult ${i + 1}`,
      role: "Konsult",
      relevantExperience: "Erfarenhet",
      keyCompetencies: ["Kompetens"],
    }));
    const slidesCreated = renderTeamSlides(pptx, members, mockStyleGuide, 10, 14);
    expect(slidesCreated).toBe(2);
  });
});

describe("references pagination", () => {
  it("renders 5 references across 2 slides (3 + 2)", () => {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    const refs = Array.from({ length: 5 }, (_, i) => ({
      title: `Ref ${i + 1}`, client: "Kund", year: 2024,
      description: "Beskrivning", relevance: "Relevant",
    }));
    const slidesCreated = renderReferencesSlides(pptx, refs, mockStyleGuide, 12, 14);
    expect(slidesCreated).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/pptx-pagination.test.ts`
Expected: FAIL — modules not found

- [ ] **Step 3: Create team-cards.ts**

Create `src/lib/pptx/team-cards.ts`:

```typescript
import PptxGenJS from "pptxgenjs";
import { TeamPresentation, StyleGuide } from "../types";
import { LAYOUT, hexToRgb, PHASE_BAR_COLORS } from "./constants";
import { addMasterElements } from "./master";

const MEMBERS_PER_SLIDE = 3;
const AVATAR_COLORS = [
  PHASE_BAR_COLORS[2], // blue
  PHASE_BAR_COLORS[1], // green
  PHASE_BAR_COLORS[0], // orange
];

function getInitials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

export function renderTeamSlides(
  pptx: PptxGenJS,
  members: TeamPresentation[],
  style: StyleGuide,
  startSlideNumber: number,
  totalSlides: number
): number {
  const chunks: TeamPresentation[][] = [];
  for (let i = 0; i < members.length; i += MEMBERS_PER_SLIDE) {
    chunks.push(members.slice(i, i + MEMBERS_PER_SLIDE));
  }

  chunks.forEach((chunk, ci) => {
    const slide = pptx.addSlide();
    addMasterElements(slide, {
      title: "Projektteam",
      style,
      slideNumber: startSlideNumber + ci,
      totalSlides,
    });

    const c = style.colors;
    const cardW = (LAYOUT.contentW - 0.3) / 3;
    const cardH = LAYOUT.contentH;

    chunk.forEach((member, mi) => {
      const x = LAYOUT.contentX + mi * (cardW + 0.15);
      const y = LAYOUT.contentY;

      // Card background
      slide.addShape("rect", {
        x, y, w: cardW, h: cardH,
        fill: { color: hexToRgb(c.light) },
        rectRadius: 0.05,
      });

      // Avatar circle
      const avatarColor = AVATAR_COLORS[mi % AVATAR_COLORS.length];
      const avatarX = x + (cardW - 0.5) / 2;
      slide.addShape("ellipse", {
        x: avatarX, y: y + 0.25,
        w: 0.5, h: 0.5,
        fill: { color: avatarColor },
        shadow: { type: "outer", blur: 3, offset: 2, color: "000000", opacity: 0.12 },
      });
      slide.addText(getInitials(member.name), {
        x: avatarX, y: y + 0.25,
        w: 0.5, h: 0.5,
        fontSize: 14, fontFace: style.font,
        color: "FFFFFF", bold: true,
        align: "center", valign: "middle",
      });

      // Name
      slide.addText(member.name, {
        x: x + 0.1, y: y + 0.85,
        w: cardW - 0.2, h: 0.3,
        fontSize: 11, fontFace: style.font,
        color: hexToRgb(c.primary), bold: true,
        align: "center",
      });

      // Role
      slide.addText(member.role, {
        x: x + 0.1, y: y + 1.15,
        w: cardW - 0.2, h: 0.25,
        fontSize: 9, fontFace: style.font,
        color: hexToRgb(c.secondary), bold: true,
        align: "center",
      });

      // Divider
      slide.addShape("line", {
        x: x + cardW * 0.35, y: y + 1.5,
        w: cardW * 0.3, h: 0,
        line: { color: "E0E0E0", width: 0.5 },
      });

      // Experience
      slide.addText(member.relevantExperience, {
        x: x + 0.1, y: y + 1.65,
        w: cardW - 0.2, h: 1.5,
        fontSize: 8, fontFace: style.font,
        color: hexToRgb(c.muted),
        align: "center", valign: "top", lineSpacingMultiple: 1.4,
      });

      // Competency tags
      const tagY = y + cardH - 0.6;
      const tagStr = member.keyCompetencies.join("  |  ");
      slide.addText(tagStr, {
        x: x + 0.1, y: tagY,
        w: cardW - 0.2, h: 0.4,
        fontSize: 7, fontFace: style.font,
        color: hexToRgb(c.primary),
        align: "center", valign: "middle",
      });
    });
  });

  return chunks.length;
}
```

- [ ] **Step 4: Create references.ts**

Create `src/lib/pptx/references.ts`:

```typescript
import PptxGenJS from "pptxgenjs";
import { BidReference, StyleGuide } from "../types";
import { LAYOUT, hexToRgb } from "./constants";
import { addMasterElements } from "./master";

const REFS_PER_SLIDE = 3;

export function renderReferencesSlides(
  pptx: PptxGenJS,
  references: BidReference[],
  style: StyleGuide,
  startSlideNumber: number,
  totalSlides: number
): number {
  const chunks: BidReference[][] = [];
  for (let i = 0; i < references.length; i += REFS_PER_SLIDE) {
    chunks.push(references.slice(i, i + REFS_PER_SLIDE));
  }

  const c = style.colors;

  chunks.forEach((chunk, ci) => {
    const slide = pptx.addSlide();
    addMasterElements(slide, {
      title: "Referensuppdrag",
      style,
      slideNumber: startSlideNumber + ci,
      totalSlides,
    });

    chunk.forEach((ref, ri) => {
      const y = LAYOUT.contentY + ri * 1.7;

      slide.addText(`${ref.title} — ${ref.client} (${ref.year})`, {
        x: LAYOUT.contentX, y,
        w: LAYOUT.contentW, h: 0.35,
        fontSize: 12, fontFace: style.font,
        color: hexToRgb(c.primary), bold: true,
      });

      slide.addText(ref.description, {
        x: LAYOUT.contentX, y: y + 0.35,
        w: LAYOUT.contentW, h: 0.35,
        fontSize: 10, fontFace: style.font,
        color: hexToRgb(c.dark),
        lineSpacingMultiple: 1.3,
      });

      slide.addText(`Relevans: ${ref.relevance}`, {
        x: LAYOUT.contentX, y: y + 0.7,
        w: LAYOUT.contentW, h: 0.25,
        fontSize: 9, fontFace: style.font,
        color: hexToRgb(c.accent), italic: true,
      });

      // Separator line (except last)
      if (ri < chunk.length - 1) {
        slide.addShape("line", {
          x: LAYOUT.contentX, y: y + 1.1,
          w: LAYOUT.contentW, h: 0,
          line: { color: "EEEEEE", width: 0.5 },
        });
      }
    });
  });

  return chunks.length;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/pptx-pagination.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/pptx/team-cards.ts src/lib/pptx/references.ts src/lib/__tests__/pptx-pagination.test.ts
git commit -m "feat: add team-cards and references renderers with pagination"
```

---

### Task 8: Create requirement-matrix renderer and pptx/index.ts entry point

**Files:**
- Create: `src/lib/pptx/requirement-matrix.ts`
- Create: `src/lib/pptx/index.ts`
- Modify: `src/lib/pptx-renderer.ts` (re-export wrapper)

- [ ] **Step 1: Create requirement-matrix.ts**

Create `src/lib/pptx/requirement-matrix.ts`:

```typescript
import PptxGenJS from "pptxgenjs";
import { RequirementRow, StyleGuide } from "../types";
import { LAYOUT, hexToRgb } from "./constants";
import { addMasterElements } from "./master";

interface MatrixData {
  rows: RequirementRow[];
  consultantNames: Record<string, string>;
}

export function renderRequirementMatrixSlide(
  pptx: PptxGenJS,
  data: MatrixData,
  style: StyleGuide,
  slideNumber: number,
  totalSlides: number
): void {
  const slide = pptx.addSlide();
  addMasterElements(slide, { title: "Kravuppfyllnad", style, slideNumber, totalSlides });

  const { rows, consultantNames } = data;
  if (rows.length === 0) return;

  const c = style.colors;
  const consultantIds = Object.keys(rows[0].coverage);

  const tableRows: PptxGenJS.TableRow[] = [];

  // Header
  const headerCells: PptxGenJS.TableCell[] = [
    { text: "Krav", options: { bold: true, fontSize: 9, fontFace: style.font, color: "FFFFFF", fill: { color: hexToRgb(c.primary) } } },
    { text: "Prio", options: { bold: true, fontSize: 9, fontFace: style.font, color: "FFFFFF", fill: { color: hexToRgb(c.primary) }, align: "center" } },
    ...consultantIds.map((id) => ({
      text: consultantNames[id] ?? id.slice(0, 8),
      options: { bold: true, fontSize: 9, fontFace: style.font, color: "FFFFFF", fill: { color: hexToRgb(c.primary) }, align: "center" as const },
    })),
  ];
  tableRows.push(headerCells);

  // Data rows with zebra striping
  rows.forEach((row, ri) => {
    const bgColor = ri % 2 === 0 ? hexToRgb(c.light) : "FFFFFF";
    const prioColor = row.priority === "must" ? hexToRgb(c.primary) : hexToRgb(c.muted);
    const prioLabel = row.priority === "must" ? "Ska" : row.priority === "should" ? "Bör" : "Önskvärt";

    const cells: PptxGenJS.TableCell[] = [
      { text: row.requirement, options: { fontSize: 9, fontFace: style.font, fill: { color: bgColor } } },
      { text: prioLabel, options: { fontSize: 9, fontFace: style.font, align: "center", color: prioColor, bold: row.priority === "must", fill: { color: bgColor } } },
      ...consultantIds.map((id) => ({
        text: row.coverage[id] ? "\u2713" : "\u2717",
        options: {
          fontSize: 13, fontFace: style.font, align: "center" as const,
          color: row.coverage[id] ? hexToRgb(c.accent) : "CC3333",
          fill: { color: bgColor },
        },
      })),
    ];
    tableRows.push(cells);
  });

  const colW = [3.5, 0.8, ...consultantIds.map(() => (LAYOUT.contentW - 4.3) / consultantIds.length)];

  slide.addTable(tableRows, {
    x: LAYOUT.contentX, y: LAYOUT.contentY,
    w: LAYOUT.contentW, colW,
    fontSize: 9,
    border: { type: "solid", pt: 0.5, color: "E0E0E0" },
  });
}
```

- [ ] **Step 2: Create pptx/index.ts — the new entry point**

Create `src/lib/pptx/index.ts`:

```typescript
import PptxGenJS from "pptxgenjs";
import { BidSection, StyleGuide } from "../types";
import { renderCoverSlide } from "./cover";
import { renderSectionDividerSlide } from "./section-divider";
import { renderProseSlide, renderBulletsSlide } from "./content-two-col";
import { renderThreeColumnSlide } from "./content-three-col";
import { renderPhaseDetailSlides } from "./phase-detail";
import { renderGanttSlide } from "./gantt";
import { renderTeamSlides } from "./team-cards";
import { renderRequirementMatrixSlide } from "./requirement-matrix";
import { renderReferencesSlides } from "./references";
import { renderPlaceholderSlide } from "./placeholder";

export async function renderBidToPptx(
  sections: BidSection[],
  styleGuide: StyleGuide
): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Agentic Dealflow";

  const totalSlides = sections.length; // approximate
  let slideNum = 1;

  for (const section of sections) {
    const fmt = section.content.format;

    switch (fmt) {
      case "cover":
        if (section.content.format === "cover") {
          renderCoverSlide(pptx, section.content, styleGuide);
        }
        break;

      case "section-divider":
        if (section.content.format === "section-divider") {
          renderSectionDividerSlide(pptx, {
            title: section.title,
            sectionNumber: section.content.sectionNumber,
            subtitle: section.content.subtitle,
          }, styleGuide, slideNum, totalSlides);
        }
        break;

      case "prose":
        if (section.content.format === "prose") {
          renderProseSlide(pptx, { title: section.title, text: section.content.text }, styleGuide, slideNum, totalSlides);
        }
        break;

      case "bullets":
        if (section.content.format === "bullets") {
          renderBulletsSlide(pptx, { title: section.title, items: section.content.items }, styleGuide, slideNum, totalSlides);
        }
        break;

      case "three-column":
        if (section.content.format === "three-column") {
          renderThreeColumnSlide(pptx, { title: section.title, columns: section.content.columns }, styleGuide, slideNum, totalSlides);
        }
        break;

      case "phases":
        if (section.content.format === "phases") {
          renderPhaseDetailSlides(pptx, section.content.phases, styleGuide, slideNum, totalSlides);
          slideNum += section.content.phases.length - 1; // extra slides
        }
        break;

      case "gantt":
        if (section.content.format === "gantt") {
          renderGanttSlide(pptx, section.content, styleGuide, slideNum, totalSlides);
        }
        break;

      case "team":
        if (section.content.format === "team") {
          const teamSlides = renderTeamSlides(pptx, section.content.members, styleGuide, slideNum, totalSlides);
          slideNum += teamSlides - 1;
        }
        break;

      case "requirement-matrix":
        if (section.content.format === "requirement-matrix") {
          renderRequirementMatrixSlide(pptx, section.content, styleGuide, slideNum, totalSlides);
        }
        break;

      case "references":
        if (section.content.format === "references") {
          const refSlides = renderReferencesSlides(pptx, section.content.references, styleGuide, slideNum, totalSlides);
          slideNum += refSlides - 1;
        }
        break;

      case "placeholder":
        if (section.content.format === "placeholder") {
          renderPlaceholderSlide(pptx, { title: section.title, instruction: section.content.instruction }, styleGuide, slideNum, totalSlides);
        }
        break;
    }

    slideNum++;
  }

  const output = await pptx.write({ outputType: "nodebuffer" });
  return output as Buffer;
}
```

- [ ] **Step 3: Replace pptx-renderer.ts with re-export**

Replace `src/lib/pptx-renderer.ts` with:

```typescript
// Backwards-compatible re-export from new pptx module
export { renderBidToPptx } from "./pptx/index";
```

- [ ] **Step 4: Run all existing tests**

Run: `npx vitest run`
Expected: All tests PASS (existing tests use the same `renderBidToPptx` function via re-export)

- [ ] **Step 5: Commit**

```bash
git add src/lib/pptx/requirement-matrix.ts src/lib/pptx/index.ts src/lib/pptx-renderer.ts
git commit -m "feat: wire up all slide renderers into new pptx module entry point"
```

---

### Task 9: Update AI prompts and schemas for richer phase data

**Files:**
- Modify: `src/lib/ai-schemas.ts:80-90`
- Modify: `src/lib/bid-section-prompts.ts:67-84`

- [ ] **Step 1: Update PhasesResponseSchema in ai-schemas.ts**

Add optional fields to the phases schema:

```typescript
export const PhasesResponseSchema = z.object({
  phases: z.array(
    z.object({
      name: z.string(),
      objective: z.string(),
      activities: z.array(z.string()),
      deliverables: z.array(z.string()),
      duration: z.string(),
      risks: z.array(z.string()).optional(),
      hoursEstimate: z.number().optional(),
      period: z.string().optional(),
    })
  ),
});
```

- [ ] **Step 2: Update execution-plan prompt in bid-section-prompts.ts**

Update the `execution-plan` entry in `SECTION_PROMPTS`:

```typescript
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
      "duration": "2 veckor",
      "risks": ["Tillgång till nyckelpersoner kan fördröjas"],
      "hoursEstimate": 80,
      "period": "Mars 2026"
    }
  ]
}
Anpassa antalet faser efter uppdragets komplexitet. Varje fas ska ha konkreta, mätbara leverabler.
Inkludera alltid risks (1-2 per fas), hoursEstimate (antal konsulttimmar), och period (tidsperiod i klartext).`,
    user: (ctx) =>
      `Skapa en genomförandeplan baserat på:\n\n${formatContext(ctx)}`,
  },
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run`
Expected: All tests PASS (optional fields don't break existing tests)

- [ ] **Step 4: Commit**

```bash
git add src/lib/ai-schemas.ts src/lib/bid-section-prompts.ts
git commit -m "feat: update AI prompts to generate risks, hours, and period per phase"
```

---

### Task 10: Update bid-generator.ts — add section dividers and Gantt to SECTION_ORDER

**Files:**
- Modify: `src/lib/bid-generator.ts`

- [ ] **Step 1: Add section-divider and gantt builder functions**

Add to `src/lib/bid-generator.ts` after `buildPlaceholderSection`:

```typescript
export function buildSectionDivider(
  key: string,
  title: string,
  sectionNumber: number,
  subtitle: string
): BidSection {
  return {
    type: "data",
    key,
    title,
    content: { format: "section-divider", sectionNumber, subtitle },
    generatedAt: new Date().toISOString(),
  };
}

export function buildGanttSection(phases: BidSection[]): BidSection | null {
  const phaseSection = phases.find((s) => s.content.format === "phases");
  if (!phaseSection || phaseSection.content.format !== "phases") return null;

  return {
    type: "data",
    key: "gantt",
    title: "Tidplan",
    content: {
      format: "gantt",
      phases: phaseSection.content.phases,
      milestones: [],
    },
    generatedAt: new Date().toISOString(),
  };
}
```

- [ ] **Step 2: Update SECTION_ORDER and generateAllSections**

Update `SECTION_ORDER`:

```typescript
const SECTION_ORDER = [
  "cover",
  "toc",
  "divider-understanding",
  "understanding",
  "value-proposition",
  "divider-execution",
  "gantt",
  "execution-plan",
  "quality",
  "risks",
  "divider-team",
  "team",
  "requirement-matrix",
  "references",
  "summary",
  "pricing",
  "confidentiality",
  "contact",
];
```

Add to `generateAllSections`, after AI sections and before matrix:

```typescript
  // Section dividers (data-driven)
  sectionsMap.set("divider-understanding", buildSectionDivider(
    "divider-understanding", "Uppdragsförståelse", 1, "Vår förståelse och approach"
  ));
  sectionsMap.set("divider-execution", buildSectionDivider(
    "divider-execution", "Genomförandeplan", 2, "Arbetssätt, metod och tidplan"
  ));
  sectionsMap.set("divider-team", buildSectionDivider(
    "divider-team", "Team & Referenser", 3, "Vårt team och relevanta uppdrag"
  ));

  // Gantt (derived from execution-plan phases)
  const gantt = buildGanttSection(Array.from(sectionsMap.values()));
  if (gantt) {
    sectionsMap.set("gantt", gantt);
  }
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/bid-generator.ts
git commit -m "feat: add section dividers and Gantt to bid generation pipeline"
```

---

### Task 11: Run full integration test and generate sample PPTX

**Files:**
- Modify: `src/lib/__tests__/pptx-renderer.test.ts`

- [ ] **Step 1: Update the main integration test with new section types**

Update `mockSections` in the test to include new formats (section-divider, gantt, three-column), plus the extended phase fields. Run the full `renderBidToPptx` and verify it outputs a valid PPTX.

Add to the test file:

```typescript
const fullMockSections: BidSection[] = [
  ...mockSections.slice(0, 1), // cover
  {
    type: "data", key: "divider-1", title: "Uppdragsförståelse",
    content: { format: "section-divider", sectionNumber: 1, subtitle: "Vår förståelse" },
    generatedAt: "2026-04-09",
  },
  mockSections[1], // prose
  mockSections[2], // bullets
  {
    type: "data", key: "divider-2", title: "Genomförandeplan",
    content: { format: "section-divider", sectionNumber: 2, subtitle: "Metod och tidplan" },
    generatedAt: "2026-04-09",
  },
  {
    type: "data", key: "gantt", title: "Tidplan",
    content: {
      format: "gantt",
      phases: [
        { name: "Fas 1", objective: "Kartlägg", activities: ["A"], deliverables: ["D"], duration: "4 veckor", risks: ["Risk"], hoursEstimate: 100, period: "Mars" },
        { name: "Fas 2", objective: "Analys", activities: ["B"], deliverables: ["E"], duration: "6 veckor", hoursEstimate: 120, period: "April" },
      ],
      milestones: [{ label: "Rapport", afterPhase: 1 }],
    },
    generatedAt: "2026-04-09",
  },
  {
    type: "ai", key: "execution-plan", title: "Genomförandeplan",
    content: {
      format: "phases",
      phases: [
        { name: "Fas 1", objective: "Kartlägg", activities: ["A1", "A2"], deliverables: ["D1"], duration: "4 veckor", risks: ["Risk 1"], hoursEstimate: 100, period: "Mars 2026" },
      ],
    },
    generatedAt: "2026-04-09",
  },
  mockSections[4], // team
  mockSections[5], // requirement-matrix
  mockSections[6], // references
  mockSections[7], // placeholder
];

describe("full v2 render", () => {
  it("renders all section types into valid PPTX", async () => {
    const buffer = await renderBidToPptx(fullMockSections, mockStyleGuide);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
    expect(buffer.length).toBeGreaterThan(5000);
  });
});
```

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/__tests__/pptx-renderer.test.ts
git commit -m "test: add full integration test for PPTX v2 with all slide types"
```

- [ ] **Step 4: Generate a sample PPTX and visually inspect**

Write a quick script to generate a sample:

```bash
npx tsx -e "
const { renderBidToPptx } = require('./src/lib/pptx/index');
const fs = require('fs');
// ... use fullMockSections from test
" > /dev/null
```

Or simply check the PPTX by running the app locally and exporting a bid.

---

### Task 12: Clean up and final commit

- [ ] **Step 1: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Run linter (if configured)**

Run: `npx next lint` (or whatever lint command is set up)
Expected: Clean

- [ ] **Step 3: Delete old pptx-renderer internals**

Verify `src/lib/pptx-renderer.ts` only contains the re-export. If the old test file references the old module structure, ensure imports are updated.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: clean up PPTX v2 renderer migration"
```
