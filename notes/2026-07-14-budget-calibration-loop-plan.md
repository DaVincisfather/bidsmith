# Budget Calibration Loop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Onboarding-time budget calibration for foreign templates — fill the instrumented template with deterministic test text, measure overflow via PowerPoint COM, binary-search `budgetChars` per slot, write the calibrated profile — plus the generic-prose prompt fixes (short-field rule, sibling division) and the evaluation run against Radrum v4 that feeds the revert/flag/rescue decision.

**Architecture:** A local calibration pipeline: pure TS modules under `src/lib/pptx-template/calibrate/` (test prose, target planning, binary search, overflow verdicts) orchestrated by `scripts/calibrate-budgets.ts`, with COM measurement in `scripts/measure-overflow.ps1`. Slot↔measurement mapping uses a unique text marker `«TokenName»` embedded at the start of each slot's fill text — no fragile index alignment across COM/XML. Prompt changes live in the existing `bundles/generic-prose.ts`. Spec: `notes/2026-07-14-budget-calibration-loop-design.md`.

**Tech Stack:** TypeScript (strict), vitest, JSZip + @xmldom/xmldom (already used by read-pptx), pptx-automizer via existing `renderFromProfile`, PowerShell 7 + PowerPoint COM, Supabase via existing `profile-store`/`template-store`.

## Global Constraints

- TypeScript strict — no `any` without a justifying comment (global CLAUDE.md).
- Files under ~300 lines; identifiers/commits in English (repo comments mix Swedish/English — match the file you touch).
- Never hardcode model strings — this feature makes NO new AI calls; regeneration reuses existing paths.
- Surgical changes: touch only what each task names.
- Windows: run tests/npm/git via PowerShell, not the bash sandbox (stale-FS gotcha).
- Worktree: `C:\Users\stefa\projects\bidsmith-budgetloop`, branch `feat/budget-calibration-loop`. All `git`/`npm` commands run with `-C`/cwd there.
- Before claiming any task done: the named tests pass; before the final PR: `npm test` + `npm run lint` + `npx tsc --noEmit` all green with output shown.
- Constants fixed by the spec: `SHORT_FIELD_MAX_CHARS = 80`, budget floor `30`, budget ceiling `1000`, overflow tolerance `2pt`, autofit-shrink threshold `fontScale < 99%`, duplicate thresholds `0.5 warn / 0.7 fail`, evaluation gate `0 FAIL slides + ≤ 13 000 chars total`.

---

### Task 0: Worktree setup

**Files:** none (environment only)

- [ ] **Step 0.1: Install deps + env**

```powershell
Copy-Item C:\Users\stefa\projects\bidsmith-main\.env.local C:\Users\stefa\projects\bidsmith-budgetloop\.env.local
cd C:\Users\stefa\projects\bidsmith-budgetloop; npm install
```

Expected: `npm install` exits 0. (Windows junction footgun: never `git worktree remove --force` later without unlinking `node_modules` junctions first.)

- [ ] **Step 0.2: Baseline green**

Run: `npm test`
Expected: full suite passes (was 1008/0 at branch point). If not, STOP — the branch is dirty, investigate before building on it.

---

### Task 1: Deterministic test prose (`test-prose.ts`)

**Files:**
- Create: `src/lib/pptx-template/calibrate/test-prose.ts`
- Test: `src/lib/pptx-template/calibrate/__tests__/test-prose.test.ts`

**Interfaces:**
- Produces: `testProse(chars: number): string` — deterministic Swedish prose of EXACTLY `chars` characters; `fillText(marker: string, budget: number): string` — `«marker» ` + prose, total length EXACTLY `budget` (or just `«marker»` when budget is too small to fit more).

- [ ] **Step 1.1: Write the failing test**

```ts
// src/lib/pptx-template/calibrate/__tests__/test-prose.test.ts
import { describe, expect, it } from "vitest";
import { fillText, testProse } from "../test-prose";

describe("testProse", () => {
  it("returns exactly the requested length", () => {
    for (const n of [1, 17, 80, 300, 999]) {
      expect(testProse(n)).toHaveLength(n);
    }
  });

  it("is deterministic", () => {
    expect(testProse(250)).toBe(testProse(250));
  });

  it("contains no braces (would read as tokens) and no double spaces", () => {
    const t = testProse(500);
    expect(t).not.toMatch(/[{}]/);
    expect(t).not.toMatch(/ {2}/);
  });

  it("never starts or ends with whitespace", () => {
    const t = testProse(120);
    expect(t).toBe(t.trim());
  });
});

describe("fillText", () => {
  it("starts with the guillemet marker and hits the budget exactly", () => {
    const t = fillText("Om oss", 200);
    expect(t.startsWith("«Om oss» ")).toBe(true);
    expect(t).toHaveLength(200);
  });

  it("degrades to marker-only when the budget is smaller than marker + prose", () => {
    const t = fillText("Diarienummer", 5);
    expect(t).toBe("«Diarienummer»");
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

Run: `npx vitest run src/lib/pptx-template/calibrate/__tests__/test-prose.test.ts`
Expected: FAIL — cannot resolve `../test-prose`.

- [ ] **Step 1.3: Write the implementation**

```ts
// src/lib/pptx-template/calibrate/test-prose.ts
/**
 * Deterministic Swedish filler prose for budget calibration (design doc
 * 2026-07-14). Realistic consulting-bid sentence shapes so line-breaking
 * behaves like production text; NO braces (would read as unfilled tokens in
 * the rendered deck) and no markdown. Never shipped to customers — the
 * calibration deck is a measurement artifact.
 */

const SENTENCES = [
  "Vi genomför uppdraget i nära samarbete med beställarens verksamhet och följer överenskommen tidplan.",
  "Arbetet bedrivs iterativt med tydliga avstämningspunkter där prioriteringar förankras löpande.",
  "Leveranserna kvalitetssäkras genom kollegial granskning innan de överlämnas till beställaren.",
  "Teamet har dokumenterad erfarenhet av liknande uppdrag inom offentlig sektor och angränsande områden.",
  "Metoden anpassas efter verksamhetens förutsättningar snarare än efter en standardiserad mall.",
  "Riskerna hanteras genom en levande risklogg som gås igenom vid varje styrgruppsmöte.",
];

/** Exactly `chars` characters of deterministic prose (trim-safe, brace-free). */
export function testProse(chars: number): string {
  if (chars <= 0) return "";
  let out = "";
  let i = 0;
  while (out.length < chars) {
    out += (out.length > 0 ? " " : "") + SENTENCES[i % SENTENCES.length];
    i++;
  }
  out = out.slice(0, chars);
  // No trailing/odd whitespace after the hard cut — a trailing space measures
  // as nothing on the slide and would make the budget lie by one.
  if (out.endsWith(" ")) out = `${out.slice(0, -1)}.`;
  return out;
}

/**
 * A slot's calibration fill: unique `«marker»` prefix (the measurement side
 * maps shape → slot by this marker, so no COM/XML index alignment is needed)
 * followed by prose, at EXACTLY `budget` characters total.
 */
export function fillText(marker: string, budget: number): string {
  const prefix = `«${marker}»`;
  if (budget <= prefix.length + 1) return prefix;
  return `${prefix} ${testProse(budget - prefix.length - 1)}`;
}
```

- [ ] **Step 1.4: Run test to verify it passes**

Run: `npx vitest run src/lib/pptx-template/calibrate/__tests__/test-prose.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 1.5: Commit**

```powershell
git add src/lib/pptx-template/calibrate/
git commit -m "feat: deterministic test prose for budget calibration"
```

---

### Task 2: Calibration targets from the instrumented template (`plan-targets.ts`)

**Files:**
- Create: `src/lib/pptx-template/calibrate/plan-targets.ts`
- Test: `src/lib/pptx-template/calibrate/__tests__/plan-targets.test.ts`

**Interfaces:**
- Consumes: `SlideShapes`/`ShapeText` from `../introspect/read-pptx`; `TemplateProfile` from `../template-profile`; `genericGeometricCapacity` (Task 3 — write the import now, Task 3 makes it real; if executing strictly in order, do Task 3 first).
- Produces:

```ts
export interface CalibrationTarget {
  token: string;          // "{Om oss}" — the placeholder being calibrated
  marker: string;         // "Om oss" — token name sans braces, unique per plan
  source: number;         // 1-based slide
  shareCount: number;     // slots sharing this shape (each gets budget/shareCount)
  initialGuess: number;   // geometric capacity or DEFAULT_GUESS
  geometryMissing: boolean;
}
export function planTargets(slides: SlideShapes[], profile: TemplateProfile): CalibrationTarget[];
export const DEFAULT_GUESS = 300;
```

- [ ] **Step 2.1: Write the failing test**

```ts
// src/lib/pptx-template/calibrate/__tests__/plan-targets.test.ts
import { describe, expect, it } from "vitest";
import { planTargets, DEFAULT_GUESS } from "../plan-targets";
import type { SlideShapes, ShapeText } from "../../introspect/read-pptx";
import type { TemplateProfile } from "../../template-profile";

function shape(tokens: string[], geometry: ShapeText["geometry"] = null): ShapeText {
  return {
    paragraphs: tokens,
    tokens,
    geometry,
    fontSizePt: 18,
    lineSpacingPct: null,
    autofit: null,
    inGroup: false,
  };
}

// 4x2 cm box ≈ enough for one short line — the exact number comes from
// genericGeometricCapacity; the test only asserts it is used, not its value.
const GEO = { x: 0, y: 0, cx: 1440000, cy: 720000 };

function profileWith(slots: { placeholder: string; status?: "generic" | "skip" }[]): TemplateProfile {
  return {
    profileVersion: 1,
    templateId: "t1",
    name: "Test",
    version: 1,
    slides: [
      {
        source: 1,
        capability: "generic-prose",
        slots: slots.map((s) => ({
          placeholder: s.placeholder,
          capability: "generic-prose" as const,
          format: "prose" as const,
          intent: "",
          status: s.status ?? ("generic" as const),
        })),
      },
    ],
  };
}

describe("planTargets", () => {
  it("emits one target per fillable generic-prose slot with a marker sans braces", () => {
    const slides: SlideShapes[] = [
      { source: 1, shapes: [shape(["{Om oss}"], GEO)], tokens: ["{Om oss}"], images: { placed: 0, placeholders: 0 } },
    ];
    const targets = planTargets(slides, profileWith([{ placeholder: "{Om oss}" }]));
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({ token: "{Om oss}", marker: "Om oss", source: 1, shareCount: 1 });
    expect(targets[0].initialGuess).toBeGreaterThan(0);
    expect(targets[0].geometryMissing).toBe(false);
  });

  it("skips skip-status slots and tokens absent from the pptx", () => {
    const slides: SlideShapes[] = [
      { source: 1, shapes: [shape(["{A}"], GEO)], tokens: ["{A}"], images: { placed: 0, placeholders: 0 } },
    ];
    const targets = planTargets(
      slides,
      profileWith([{ placeholder: "{A}", status: "skip" }, { placeholder: "{Finns ej}" }]),
    );
    expect(targets).toHaveLength(0);
  });

  it("marks shared shapes: two tokens in one shape → shareCount 2 on both", () => {
    const slides: SlideShapes[] = [
      { source: 1, shapes: [shape(["{A}", "{B}"], GEO)], tokens: ["{A}", "{B}"], images: { placed: 0, placeholders: 0 } },
    ];
    const targets = planTargets(slides, profileWith([{ placeholder: "{A}" }, { placeholder: "{B}" }]));
    expect(targets.map((t) => t.shareCount)).toEqual([2, 2]);
  });

  it("falls back to DEFAULT_GUESS with geometryMissing when the shape inherits geometry", () => {
    const slides: SlideShapes[] = [
      { source: 1, shapes: [shape(["{A}"], null)], tokens: ["{A}"], images: { placed: 0, placeholders: 0 } },
    ];
    const [t] = planTargets(slides, profileWith([{ placeholder: "{A}" }]));
    expect(t.initialGuess).toBe(DEFAULT_GUESS);
    expect(t.geometryMissing).toBe(true);
  });
});
```

- [ ] **Step 2.2: Run test to verify it fails**

Run: `npx vitest run src/lib/pptx-template/calibrate/__tests__/plan-targets.test.ts`
Expected: FAIL — cannot resolve `../plan-targets`.

- [ ] **Step 2.3: Write the implementation**

```ts
// src/lib/pptx-template/calibrate/plan-targets.ts
import type { SlideShapes } from "../introspect/read-pptx";
import { genericGeometricCapacity } from "../introspect/compute-budgets";
import type { TemplateProfile } from "../template-profile";

/**
 * Calibration plan: which slots to measure, from WHERE (slide + shape via the
 * instrumented pptx's tokens), sharing which shape, starting at which guess.
 * The marker (token name sans braces) is what maps a rendered shape back to
 * its slot on the measurement side — see test-prose.fillText.
 */

export const DEFAULT_GUESS = 300;

export interface CalibrationTarget {
  token: string;
  marker: string;
  source: number;
  shareCount: number;
  initialGuess: number;
  geometryMissing: boolean;
}

export function planTargets(
  slides: SlideShapes[],
  profile: TemplateProfile,
): CalibrationTarget[] {
  // Fillable = same filter as generateSectionsFromProfile: generic-prose, not skip.
  const fillable = new Set<string>();
  for (const slide of profile.slides) {
    for (const slot of slide.slots) {
      if (slot.capability === "generic-prose" && slot.status !== "skip") {
        fillable.add(slot.placeholder);
      }
    }
  }

  const targets: CalibrationTarget[] = [];
  for (const slide of slides) {
    for (const shape of slide.shapes) {
      const shapeTokens = shape.tokens.filter((t) => fillable.has(t));
      if (shapeTokens.length === 0) continue;
      const capacity = genericGeometricCapacity(shape);
      for (const token of shapeTokens) {
        targets.push({
          token,
          marker: token.slice(1, -1),
          source: slide.source,
          shareCount: shapeTokens.length,
          initialGuess:
            capacity === null
              ? DEFAULT_GUESS
              : Math.max(1, Math.round(capacity / shapeTokens.length)),
          geometryMissing: capacity === null,
        });
      }
    }
  }
  return targets;
}
```

- [ ] **Step 2.4: Run test to verify it passes**

Run: `npx vitest run src/lib/pptx-template/calibrate/__tests__/plan-targets.test.ts`
Expected: PASS (4 tests). (Requires Task 3's export — if it doesn't exist yet, do Task 3 now and re-run.)

- [ ] **Step 2.5: Commit**

```powershell
git add src/lib/pptx-template/calibrate/
git commit -m "feat: calibration target planning from instrumented template"
```

---

### Task 3: Generic geometric start guess (export from `compute-budgets.ts`)

**Files:**
- Modify: `src/lib/pptx-template/introspect/compute-budgets.ts` (add ONE exported function at the end; touch nothing else)
- Test: `src/lib/pptx-template/introspect/__tests__/compute-budgets.test.ts` (append one describe block)

**Interfaces:**
- Produces: `genericGeometricCapacity(shape: ShapeText): number | null` — the calibration start guess; `null` when geometry is missing.

- [ ] **Step 3.1: Write the failing test** (append to the existing test file — do not modify existing tests)

```ts
import { genericGeometricCapacity } from "../compute-budgets";

describe("genericGeometricCapacity", () => {
  it("returns null when geometry is missing", () => {
    expect(
      genericGeometricCapacity({
        paragraphs: [], tokens: [], geometry: null,
        fontSizePt: 18, lineSpacingPct: null, autofit: null, inGroup: false,
      }),
    ).toBeNull();
  });

  it("computes lines × charsPerLine × FILL with the global constants", () => {
    // 18pt font: charWidth = 18*12700*0.5 = 114300 EMU; lineHeight = 18*12700*1.2 = 274320 EMU.
    // Box 2286000 × 822960 EMU → 20 chars/line × 3 lines × 0.9 = 54 → rounded to 55.
    expect(
      genericGeometricCapacity({
        paragraphs: [], tokens: [],
        geometry: { x: 0, y: 0, cx: 2286000, cy: 822960 },
        fontSizePt: 18, lineSpacingPct: null, autofit: null, inGroup: false,
      }),
    ).toBe(55);
  });
});
```

- [ ] **Step 3.2: Run test to verify it fails**

Run: `npx vitest run src/lib/pptx-template/introspect/__tests__/compute-budgets.test.ts`
Expected: FAIL — `genericGeometricCapacity` is not exported.

- [ ] **Step 3.3: Implement** (append at end of `compute-budgets.ts`)

```ts
/**
 * Generic geometric capacity for a FOREIGN slot's shape — the calibration
 * loop's start guess (design doc 2026-07-14). Same global constants as the
 * budget model above (per-field fudge factors stay forbidden); no editorial
 * cap because foreign fields have no field semantics — the measured loop, not
 * this guess, sets the budget. null when the shape inherits its geometry.
 */
export function genericGeometricCapacity(shape: ShapeText): number | null {
  if (!shape.geometry) return null;
  const capacity = boxCapacity(shape);
  return Math.max(ROUND_TO, Math.round(capacity / ROUND_TO) * ROUND_TO);
}
```

- [ ] **Step 3.4: Run test to verify it passes**

Run: `npx vitest run src/lib/pptx-template/introspect/__tests__/compute-budgets.test.ts`
Expected: PASS (existing tests + 2 new). If the hand-computed 55 is off, recompute from the formula in the comment — do NOT fudge constants.

- [ ] **Step 3.5: Commit**

```powershell
git add src/lib/pptx-template/introspect/
git commit -m "feat: export generic geometric capacity for foreign-slot calibration"
```

---

### Task 4: COM measurement script (`scripts/measure-overflow.ps1`)

**Files:**
- Create: `scripts/measure-overflow.ps1`

**Interfaces:**
- Produces (consumed by Task 5/6): a JSON file with shape measurements:

```json
{ "slideCount": 12,
  "shapes": [ { "slide": 1, "name": "TextBox 3", "heightPt": 120.5, "boundHeightPt": 98.2,
                 "marginTopPt": 3.6, "marginBottomPt": 3.6, "textPrefix": "«Om oss» Vi genomför…" } ] }
```

and a `-RecalcOut` re-saved copy of the deck where PowerPoint has written `<a:normAutofit fontScale="…">` for shrunk autofit boxes (Task 5 parses it).

- [ ] **Step 4.1: Write the script**

```powershell
# scripts/measure-overflow.ps1
# Opens a pptx via PowerPoint COM and reports, per text-bearing shape, the shape
# height vs the laid-out text height (overflow signal for non-autofit boxes), then
# SaveAs-es a recalculated copy where PowerPoint has materialized normAutofit
# fontScale into the XML (overflow signal for autofit boxes — parsed on the TS side).
# Part of the budget-calibration loop (notes/2026-07-14-budget-calibration-loop-design.md).
#
# Usage:
#   pwsh -File scripts/measure-overflow.ps1 -Pptx deck.pptx -OutJson m.json -RecalcOut recalc.pptx
param(
    [Parameter(Mandatory = $true)] [string]$Pptx,
    [Parameter(Mandatory = $true)] [string]$OutJson,
    [Parameter(Mandatory = $true)] [string]$RecalcOut
)
$ErrorActionPreference = "Stop"

$absPptx = [System.IO.Path]::GetFullPath($Pptx)
if (-not (Test-Path -LiteralPath $absPptx)) { throw "PPTX not found: $absPptx" }
$absJson   = [System.IO.Path]::GetFullPath($OutJson)
$absRecalc = [System.IO.Path]::GetFullPath($RecalcOut)
if (Test-Path -LiteralPath $absRecalc) { Remove-Item -Force -LiteralPath $absRecalc }

# Flatten groups in document order: COM's Slide.Shapes does NOT descend into
# msoGroup (type 6), but Claude-Design-built templates (Radrum) group freely.
function Get-TextShapes($shapes) {
    $out = @()
    foreach ($s in $shapes) {
        if ($s.Type -eq 6) { $out += Get-TextShapes $s.GroupItems }
        elseif ($s.HasTextFrame -and $s.TextFrame2.HasText) { $out += ,$s }
    }
    return $out
}

$pp = New-Object -ComObject PowerPoint.Application
try {
    # msoFalse=0 window, open read-write (SaveAs needs it): WithWindow:=msoFalse
    $pres = $pp.Presentations.Open($absPptx, [Microsoft.Office.Core.MsoTriState]::msoFalse,
        [Microsoft.Office.Core.MsoTriState]::msoFalse, [Microsoft.Office.Core.MsoTriState]::msoFalse)
    $rows = @()
    foreach ($slide in $pres.Slides) {
        foreach ($shape in (Get-TextShapes $slide.Shapes)) {
            $tf = $shape.TextFrame2
            $text = $tf.TextRange.Text
            $rows += [pscustomobject]@{
                slide          = $slide.SlideIndex
                name           = $shape.Name
                heightPt       = [math]::Round($shape.Height, 2)
                boundHeightPt  = [math]::Round($tf.TextRange.BoundHeight, 2)
                marginTopPt    = [math]::Round($tf.MarginTop, 2)
                marginBottomPt = [math]::Round($tf.MarginBottom, 2)
                textPrefix     = $text.Substring(0, [math]::Min(64, $text.Length))
            }
        }
    }
    # SaveAs (ppSaveAsOpenXMLPresentation = 24) forces a layout pass; PowerPoint
    # writes normAutofit fontScale for every shrunk box into the saved XML.
    $pres.SaveAs($absRecalc, 24)
    $pres.Close()
    [pscustomobject]@{ slideCount = $rows | ForEach-Object slide | Sort-Object -Unique | Measure-Object | ForEach-Object Count
                       shapes = $rows } |
        ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $absJson -Encoding utf8
    Write-Host "Measured $($rows.Count) text shapes -> $absJson"
}
finally {
    $pp.Quit()
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($pp)
}
```

- [ ] **Step 4.2: Verify against a known deck**

Run: `pwsh -File scripts/measure-overflow.ps1 -Pptx templates/anbudsmall-v2.pptx -OutJson tmp/measure-smoke.json -RecalcOut tmp/measure-smoke-recalc.pptx`
Expected: exits 0; `tmp/measure-smoke.json` contains a `shapes` array with plausible `heightPt`/`boundHeightPt` values (spot-check: every `boundHeightPt > 0`); `tmp/measure-smoke-recalc.pptx` exists and opens. If `[Microsoft.Office.Core.MsoTriState]` fails to resolve, replace the three enum arguments with literal `0` (msoFalse) — same semantics.

- [ ] **Step 4.3: Commit**

```powershell
git add scripts/measure-overflow.ps1
git commit -m "feat: COM overflow measurement script for budget calibration"
```

---

### Task 5: Overflow verdicts + binary search (pure TS)

**Files:**
- Create: `src/lib/pptx-template/calibrate/overflow.ts`
- Create: `src/lib/pptx-template/calibrate/binary-search.ts`
- Create: `src/lib/pptx-template/calibrate/font-scales.ts`
- Test: `src/lib/pptx-template/calibrate/__tests__/overflow.test.ts`
- Test: `src/lib/pptx-template/calibrate/__tests__/binary-search.test.ts`
- Test: `src/lib/pptx-template/calibrate/__tests__/font-scales.test.ts`

**Interfaces:**
- Consumes: measurement JSON shape from Task 4; `resolveSlidePaths` (exported by `../introspect/read-pptx`).
- Produces:

```ts
// overflow.ts
export interface ShapeMeasurement { slide: number; name: string; heightPt: number; boundHeightPt: number; marginTopPt: number; marginBottomPt: number; textPrefix: string; }
export const OVERFLOW_TOLERANCE_PT = 2;
export const MIN_FONT_SCALE_PCT = 99;
export function verdictFor(m: ShapeMeasurement, fontScalePct: number | null): boolean; // true = over budget
export function markerOf(textPrefix: string): string | null; // "«Om oss» …" → "Om oss"

// binary-search.ts
export const MIN_BUDGET = 30;
export const MAX_BUDGET = 1000;
export interface SearchState { lo: number; hi: number | null; candidate: number; done: boolean; rounds: number; alwaysOverflowed: boolean; }
export function initState(guess: number): SearchState;
export function step(s: SearchState, overflowed: boolean): SearchState;
export function finalBudget(s: SearchState): number; // rounded down to nearest 10, ≥ MIN_BUDGET

// font-scales.ts
export function readFontScales(recalcPptx: Buffer): Promise<Map<string, number>>; // marker → fontScale %
```

- [ ] **Step 5.1: Write the failing tests**

```ts
// src/lib/pptx-template/calibrate/__tests__/overflow.test.ts
import { describe, expect, it } from "vitest";
import { markerOf, verdictFor, type ShapeMeasurement } from "../overflow";

function m(over: Partial<ShapeMeasurement>): ShapeMeasurement {
  return {
    slide: 1, name: "TextBox 1", heightPt: 100, boundHeightPt: 50,
    marginTopPt: 4, marginBottomPt: 4, textPrefix: "«X» abc", ...over,
  };
}

describe("verdictFor", () => {
  it("no overflow when text fits inside height minus margins", () => {
    expect(verdictFor(m({ boundHeightPt: 90 }), null)).toBe(false);
  });
  it("overflow when bound height exceeds available height + tolerance", () => {
    // available = 100 - 4 - 4 = 92; 95 > 92 + 2
    expect(verdictFor(m({ boundHeightPt: 95 }), null)).toBe(true);
  });
  it("within tolerance is NOT overflow", () => {
    expect(verdictFor(m({ boundHeightPt: 93 }), null)).toBe(false);
  });
  it("autofit shrink below 99% is overflow even though the text 'fits'", () => {
    expect(verdictFor(m({ boundHeightPt: 50 }), 62.5)).toBe(true);
    expect(verdictFor(m({ boundHeightPt: 50 }), 100)).toBe(false);
  });
});

describe("markerOf", () => {
  it("extracts the guillemet marker", () => {
    expect(markerOf("«Om oss» Vi genomför upp")).toBe("Om oss");
  });
  it("returns null when no marker leads the text", () => {
    expect(markerOf("Statisk rubrik")).toBeNull();
  });
});
```

```ts
// src/lib/pptx-template/calibrate/__tests__/binary-search.test.ts
import { describe, expect, it } from "vitest";
import { finalBudget, initState, MAX_BUDGET, MIN_BUDGET, step } from "../binary-search";

function converge(guess: number, fitsUpTo: number): ReturnType<typeof initState> {
  let s = initState(guess);
  let rounds = 0;
  while (!s.done && rounds < 20) {
    s = step(s, s.candidate > fitsUpTo);
    rounds++;
  }
  expect(s.done).toBe(true);
  return s;
}

describe("binary search", () => {
  it("clamps the initial candidate into [MIN, MAX]", () => {
    expect(initState(5).candidate).toBe(MIN_BUDGET);
    expect(initState(99999).candidate).toBe(MAX_BUDGET);
  });

  it("converges to just under the true capacity within ~7 rounds", () => {
    const s = converge(300, 480);
    expect(s.rounds).toBeLessThanOrEqual(7);
    const b = finalBudget(s);
    expect(b).toBeGreaterThanOrEqual(380); // within ~20% under true capacity
    expect(b).toBeLessThanOrEqual(480);
  });

  it("expands upward when the guess never overflows, capped at MAX_BUDGET", () => {
    const s = converge(300, 5000);
    expect(finalBudget(s)).toBe(MAX_BUDGET);
  });

  it("collapses to MIN_BUDGET with alwaysOverflowed when nothing fits", () => {
    const s = converge(300, 0);
    expect(finalBudget(s)).toBe(MIN_BUDGET);
    expect(s.alwaysOverflowed).toBe(true);
  });

  it("final budget rounds down to nearest 10", () => {
    expect(finalBudget({ lo: 447, hi: 460, candidate: 450, done: true, rounds: 5, alwaysOverflowed: false })).toBe(440);
  });
});
```

```ts
// src/lib/pptx-template/calibrate/__tests__/font-scales.test.ts
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { readFontScales } from "../font-scales";

const SLIDE = (body: string) => `<?xml version="1.0"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>${body}</p:spTree></p:cSld></p:sld>`;
const SP = (text: string, autofit: string) => `<p:sp><p:txBody>
  <a:bodyPr>${autofit}</a:bodyPr><a:p><a:r><a:t>${text}</a:t></a:r></a:p>
</p:txBody></p:sp>`;

async function pptxWith(slideXml: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("ppt/presentation.xml", `<?xml version="1.0"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Target="slides/slide1.xml"/></Relationships>`);
  zip.file("ppt/slides/slide1.xml", slideXml);
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

describe("readFontScales", () => {
  it("maps marker → applied font scale percent", async () => {
    const buf = await pptxWith(SLIDE(SP("«Om oss» text", `<a:normAutofit fontScale="62500"/>`)));
    const scales = await readFontScales(buf);
    expect(scales.get("Om oss")).toBe(62.5);
  });

  it("normAutofit without fontScale means 100%", async () => {
    const buf = await pptxWith(SLIDE(SP("«A» text", `<a:normAutofit/>`)));
    expect((await readFontScales(buf)).get("A")).toBe(100);
  });

  it("shapes without markers or without normAutofit are absent", async () => {
    const buf = await pptxWith(SLIDE(SP("statisk", `<a:normAutofit fontScale="50000"/>`) + SP("«B» text", "")));
    const scales = await readFontScales(buf);
    expect(scales.size).toBe(0);
  });
});
```

- [ ] **Step 5.2: Run tests to verify they fail**

Run: `npx vitest run src/lib/pptx-template/calibrate/__tests__/`
Expected: FAIL — modules missing.

- [ ] **Step 5.3: Implement the three modules**

```ts
// src/lib/pptx-template/calibrate/overflow.ts
/** Overflow verdicts from the COM measurement (scripts/measure-overflow.ps1). */

export interface ShapeMeasurement {
  slide: number;
  name: string;
  heightPt: number;
  boundHeightPt: number;
  marginTopPt: number;
  marginBottomPt: number;
  textPrefix: string;
}

/** BoundHeight is layout truth ±rounding; 2pt keeps borderline fits from flapping. */
export const OVERFLOW_TOLERANCE_PT = 2;
/** normAutofit shrink below this = the text did NOT fit at nominal size. */
export const MIN_FONT_SCALE_PCT = 99;

const MARKER_RE = /^«([^»]+)»/;

/** "«Om oss» Vi …" → "Om oss"; null when the shape carries no calibration fill. */
export function markerOf(textPrefix: string): string | null {
  const m = MARKER_RE.exec(textPrefix);
  return m ? m[1] : null;
}

/** true = the shape's text is over budget (spills, or autofit shrank it). */
export function verdictFor(
  m: ShapeMeasurement,
  fontScalePct: number | null,
): boolean {
  if (fontScalePct !== null && fontScalePct < MIN_FONT_SCALE_PCT) return true;
  const available = m.heightPt - m.marginTopPt - m.marginBottomPt;
  return m.boundHeightPt > available + OVERFLOW_TOLERANCE_PT;
}
```

```ts
// src/lib/pptx-template/calibrate/binary-search.ts
/**
 * Per-slot budget search (design doc 2026-07-14): every slot advances one step
 * per RENDER round (one render measures the whole deck), so the deck converges
 * in ~5–7 renders. lo = largest known fit, hi = smallest known overflow.
 */

export const MIN_BUDGET = 30;
export const MAX_BUDGET = 1000;

export interface SearchState {
  lo: number;
  hi: number | null;
  candidate: number;
  done: boolean;
  rounds: number;
  alwaysOverflowed: boolean;
}

const clamp = (n: number) => Math.min(MAX_BUDGET, Math.max(MIN_BUDGET, Math.round(n)));

export function initState(guess: number): SearchState {
  return { lo: MIN_BUDGET, hi: null, candidate: clamp(guess), done: false, rounds: 0, alwaysOverflowed: false };
}

export function step(s: SearchState, overflowed: boolean): SearchState {
  if (s.done) return s;
  const rounds = s.rounds + 1;
  let { lo, hi } = s;
  if (overflowed) hi = s.candidate;
  else lo = Math.max(lo, s.candidate);

  // Never overflowed yet: expand upward until something overflows or MAX fits.
  if (hi === null) {
    if (lo >= MAX_BUDGET) return { lo, hi, candidate: lo, done: true, rounds, alwaysOverflowed: false };
    return { lo, hi, candidate: clamp(lo * 2), done: false, rounds, alwaysOverflowed: false };
  }

  const alwaysOverflowed = lo <= MIN_BUDGET && hi <= MIN_BUDGET + 20;
  // Converged when the bracket is inside 10% (min 20 chars) of the fit.
  if (hi - lo <= Math.max(20, lo * 0.1)) {
    return { lo, hi, candidate: lo, done: true, rounds, alwaysOverflowed };
  }
  return { lo, hi, candidate: clamp((lo + hi) / 2), done: false, rounds, alwaysOverflowed };
}

/** Largest known fit, rounded DOWN to nearest 10 (budgets read as round numbers). */
export function finalBudget(s: SearchState): number {
  return Math.max(MIN_BUDGET, Math.floor(s.lo / 10) * 10);
}
```

```ts
// src/lib/pptx-template/calibrate/font-scales.ts
import JSZip from "jszip";
import { DOMParser } from "@xmldom/xmldom";
import { resolveSlidePaths } from "../introspect/read-pptx";
import { markerOf } from "./overflow";

const A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main";

/**
 * Reads PowerPoint's APPLIED autofit shrink out of the recalculated copy that
 * measure-overflow.ps1 saved: SaveAs materializes <a:normAutofit fontScale="…">
 * (thousandths of a percent) for every shrunk box. Keyed by the calibration
 * marker in the shape's text — index-free, same trick as the measurement side.
 * Only shapes WITH a normAutofit element appear (others overflow, not shrink).
 */
export async function readFontScales(recalcPptx: Buffer): Promise<Map<string, number>> {
  const zip = await JSZip.loadAsync(recalcPptx);
  const parser = new DOMParser();
  const scales = new Map<string, number>();

  for (const slidePath of await resolveSlidePaths(zip, parser)) {
    const xml = await zip.file(slidePath)?.async("string");
    if (!xml) continue;
    const doc = parser.parseFromString(xml, "application/xml");
    const spNodes = doc.getElementsByTagNameNS(P_NS, "sp");
    for (let i = 0; i < spNodes.length; i++) {
      const sp = spNodes[i];
      const texts = sp.getElementsByTagNameNS(A_NS, "t");
      let joined = "";
      for (let j = 0; j < texts.length; j++) joined += texts[j].textContent ?? "";
      const marker = markerOf(joined);
      if (!marker) continue;
      const autofits = sp.getElementsByTagNameNS(A_NS, "normAutofit");
      if (autofits.length === 0) continue;
      const raw = autofits[0].getAttribute("fontScale");
      scales.set(marker, raw ? Number(raw) / 1000 : 100);
    }
  }
  return scales;
}
```

- [ ] **Step 5.4: Run tests to verify they pass**

Run: `npx vitest run src/lib/pptx-template/calibrate/__tests__/`
Expected: PASS (all calibrate tests).

- [ ] **Step 5.5: Commit**

```powershell
git add src/lib/pptx-template/calibrate/
git commit -m "feat: overflow verdicts, budget binary search, autofit font-scale reader"
```

---

### Task 6: Calibration orchestrator + CLI script

**Files:**
- Create: `src/lib/pptx-template/calibrate/calibrate.ts`
- Create: `scripts/calibrate-budgets.ts`
- Modify: `package.json` (one npm script)
- Test: `src/lib/pptx-template/calibrate/__tests__/calibrate.test.ts`

**Interfaces:**
- Consumes: everything above + `loadTemplate` (`../template-store`), `loadTemplateProfile`/`saveTemplateProfile` (`../profile-store`), `renderFromProfile` (`../render-from-profile`), `readPptxSlides` (`../introspect/read-pptx`), `fillText` (Task 1), `planTargets` (Task 2), search/verdicts (Task 5), `SHORT_FIELD_MAX_CHARS` (Task 7 — if executing in order, define the constant in Task 7 FIRST or inline `80` here and swap the import in Task 7).
- Produces:

```ts
export interface SlotResult { token: string; budget: number; rounds: number; method: "measured" | "geometry-fallback"; shortField: boolean; warnings: string[]; }
export interface CalibrationReport { templateId: string; rounds: number; results: SlotResult[]; unresolved: string[]; }
export function calibrateTemplate(templateId: string, opts: { write: boolean; maxRounds?: number; workDir?: string }): Promise<CalibrationReport>;
// exported pure helpers (unit-tested):
export function buildCalibrationSections(targets: CalibrationTarget[], candidates: Map<string, number>): BidSection[];
export function applyBudgets(profile: TemplateProfile, results: SlotResult[]): TemplateProfile;
```

- [ ] **Step 6.1: Write the failing test for the pure helpers**

```ts
// src/lib/pptx-template/calibrate/__tests__/calibrate.test.ts
import { describe, expect, it } from "vitest";
import { applyBudgets, buildCalibrationSections } from "../calibrate";
import type { CalibrationTarget } from "../plan-targets";
import type { TemplateProfile } from "../../template-profile";

const target = (token: string, shareCount = 1): CalibrationTarget => ({
  token, marker: token.slice(1, -1), source: 1, shareCount, initialGuess: 300, geometryMissing: false,
});

describe("buildCalibrationSections", () => {
  it("builds one generic-prose section per target, marker-prefixed, at the shared candidate / shareCount", () => {
    const sections = buildCalibrationSections(
      [target("{A}", 2), target("{B}", 2)],
      new Map([["{A}", 400], ["{B}", 400]]),
    );
    expect(sections).toHaveLength(2);
    const a = sections[0];
    expect(a.content).toMatchObject({ format: "generic-prose", placeholder: "{A}" });
    if (a.content?.format === "generic-prose") {
      expect(a.content.text.startsWith("«A»")).toBe(true);
      expect(a.content.text).toHaveLength(200); // 400 / shareCount 2
    }
  });
});

describe("applyBudgets", () => {
  const profile: TemplateProfile = {
    profileVersion: 1, templateId: "t1", name: "T", version: 1,
    slides: [{
      source: 1, capability: "generic-prose",
      slots: [
        { placeholder: "{A}", capability: "generic-prose", format: "prose", intent: "", status: "generic" },
        { placeholder: "{Skip}", capability: "generic-prose", format: "prose", intent: "", status: "skip" },
      ],
    }],
  };

  it("sets budgetChars on matching slots and leaves others untouched", () => {
    const out = applyBudgets(profile, [
      { token: "{A}", budget: 440, rounds: 5, method: "measured", shortField: false, warnings: [] },
    ]);
    expect(out.slides[0].slots[0].budgetChars).toBe(440);
    expect(out.slides[0].slots[1].budgetChars).toBeUndefined();
  });

  it("does not mutate the input profile", () => {
    applyBudgets(profile, [{ token: "{A}", budget: 100, rounds: 1, method: "measured", shortField: false, warnings: [] }]);
    expect(profile.slides[0].slots[0].budgetChars).toBeUndefined();
  });
});
```

- [ ] **Step 6.2: Run test to verify it fails**

Run: `npx vitest run src/lib/pptx-template/calibrate/__tests__/calibrate.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 6.3: Implement the orchestrator**

```ts
// src/lib/pptx-template/calibrate/calibrate.ts
import { execFile } from "child_process";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { promisify } from "util";
import type { BidSection } from "@/lib/types";
import { loadTemplate } from "../template-store";
import { loadTemplateProfile, saveTemplateProfile } from "../profile-store";
import { renderFromProfile } from "../render-from-profile";
import { readPptxSlides } from "../introspect/read-pptx";
import type { TemplateProfile } from "../template-profile";
import { fillText } from "./test-prose";
import { planTargets, type CalibrationTarget } from "./plan-targets";
import { finalBudget, initState, step, type SearchState } from "./binary-search";
import { markerOf, verdictFor, type ShapeMeasurement } from "./overflow";
import { readFontScales } from "./font-scales";

const execFileAsync = promisify(execFile);
const SHORT_FIELD_MAX_CHARS = 80; // single source moves to bundles/generic-prose (Task 7)
const DEFAULT_MAX_ROUNDS = 8;

export interface SlotResult {
  token: string;
  budget: number;
  rounds: number;
  method: "measured" | "geometry-fallback";
  shortField: boolean;
  warnings: string[];
}

export interface CalibrationReport {
  templateId: string;
  rounds: number;
  results: SlotResult[];
  /** Markers never found in any measurement — kept on geometry fallback. */
  unresolved: string[];
}

/** One synthetic section per target; a shared shape's candidate is split evenly. */
export function buildCalibrationSections(
  targets: CalibrationTarget[],
  candidates: Map<string, number>,
): BidSection[] {
  const generatedAt = new Date().toISOString();
  return targets.map((t) => {
    const shapeBudget = candidates.get(t.token) ?? t.initialGuess;
    const slotChars = Math.max(1, Math.round(shapeBudget / t.shareCount));
    return {
      type: "ai" as const,
      key: `calibration:${t.token}`,
      title: t.token,
      content: { format: "generic-prose" as const, placeholder: t.token, text: fillText(t.marker, slotChars) },
      generatedAt,
    };
  });
}

/** Immutable budget patch: results keyed by placeholder, skip-slots untouched. */
export function applyBudgets(profile: TemplateProfile, results: SlotResult[]): TemplateProfile {
  const byToken = new Map(results.map((r) => [r.token, r.budget]));
  return {
    ...profile,
    slides: profile.slides.map((slide) => ({
      ...slide,
      slots: slide.slots.map((slot) => {
        const budget = byToken.get(slot.placeholder);
        return budget === undefined ? slot : { ...slot, budgetChars: budget };
      }),
    })),
  };
}

export async function calibrateTemplate(
  templateId: string,
  opts: { write: boolean; maxRounds?: number; workDir?: string },
): Promise<CalibrationReport> {
  const maxRounds = opts.maxRounds ?? DEFAULT_MAX_ROUNDS;
  const workDir = opts.workDir ?? path.resolve("tmp", "calibrate", templateId);
  await mkdir(workDir, { recursive: true });

  const tpl = await loadTemplate(templateId);
  const profile = await loadTemplateProfile(templateId);
  if (!profile) throw new Error(`template ${templateId} has no stored profile — onboard it first`);

  const instrumented = await readFile(tpl.templateFile);
  const slides = await readPptxSlides(instrumented);
  const targets = planTargets(slides, profile);
  if (targets.length === 0) throw new Error("no calibratable generic-prose slots in profile");

  // The search runs over the SHAPE budget; shareCount slots on one shape share
  // one state (keyed by the first token) and split the result evenly.
  const states = new Map<string, SearchState>();
  for (const t of targets) states.set(t.token, initState(t.initialGuess));

  const master = { companyName: "Kalibrering", clientName: "Kalibrering", bidName: "Kalibrering", diaryNumber: "", bidDate: new Date().toISOString().slice(0, 10) };
  const seen = new Set<string>();
  let round = 0;

  while (round < maxRounds && [...states.values()].some((s) => !s.done)) {
    round++;
    const candidates = new Map([...states].map(([token, s]) => [token, s.candidate]));
    const sections = buildCalibrationSections(targets, candidates);
    const deck = await renderFromProfile(tpl, profile, sections, master);
    const deckPath = path.join(workDir, `round-${round}.pptx`);
    const jsonPath = path.join(workDir, `round-${round}.json`);
    const recalcPath = path.join(workDir, `round-${round}-recalc.pptx`);
    await writeFile(deckPath, deck);

    await execFileAsync("pwsh", ["-NoProfile", "-File", path.resolve("scripts", "measure-overflow.ps1"),
      "-Pptx", deckPath, "-OutJson", jsonPath, "-RecalcOut", recalcPath]);

    const parsed = JSON.parse(await readFile(jsonPath, "utf8")) as { shapes: ShapeMeasurement[] };
    const scales = await readFontScales(await readFile(recalcPath));

    const verdicts = new Map<string, boolean>();
    for (const m of parsed.shapes) {
      const marker = markerOf(m.textPrefix);
      if (!marker) continue;
      seen.add(marker);
      verdicts.set(marker, verdictFor(m, scales.get(marker) ?? null));
    }
    for (const t of targets) {
      const s = states.get(t.token)!;
      if (s.done) continue;
      const v = verdicts.get(t.marker);
      // Not measured this round (marker truncated/shape dropped): freeze on the
      // geometry guess rather than searching blind.
      if (v === undefined) states.set(t.token, { ...s, done: true });
      else states.set(t.token, step(s, v));
    }
    console.log(`round ${round}: ${[...states.values()].filter((s) => s.done).length}/${targets.length} slots converged`);
  }

  const results: SlotResult[] = targets.map((t) => {
    const s = states.get(t.token)!;
    const measured = seen.has(t.marker);
    const shapeBudget = measured ? finalBudget(s) : Math.max(30, t.initialGuess);
    const budget = Math.max(30, Math.floor(shapeBudget / t.shareCount / 10) * 10);
    const warnings: string[] = [];
    if (!measured) warnings.push("marker never measured — geometry fallback");
    if (s.alwaysOverflowed) warnings.push("overflowed at minimum budget — box likely tiny or decorative");
    if (t.geometryMissing && !measured) warnings.push("no geometry either — DEFAULT_GUESS used");
    return {
      token: t.token, budget, rounds: s.rounds,
      method: measured ? ("measured" as const) : ("geometry-fallback" as const),
      shortField: budget <= SHORT_FIELD_MAX_CHARS, warnings,
    };
  });

  if (opts.write) {
    await saveTemplateProfile(applyBudgets(profile, results));
  }
  return {
    templateId, rounds: round, results,
    unresolved: targets.filter((t) => !seen.has(t.marker)).map((t) => t.token),
  };
}
```

- [ ] **Step 6.4: Run test to verify the pure helpers pass**

Run: `npx vitest run src/lib/pptx-template/calibrate/__tests__/calibrate.test.ts`
Expected: PASS. (`calibrateTemplate` itself is exercised live in Task 9 — COM cannot run under vitest.)

- [ ] **Step 6.5: Write the CLI script**

```ts
// scripts/calibrate-budgets.ts
// CLI: node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/calibrate-budgets.ts <templateId> [--write] [--max-rounds N]
// Dry-run by default: prints the per-slot budget table; --write persists to template_profiles.
import { calibrateTemplate } from "../src/lib/pptx-template/calibrate/calibrate";

async function main() {
  const args = process.argv.slice(2);
  const templateId = args.find((a) => !a.startsWith("--"));
  if (!templateId) {
    console.error("Användning: npm run calibrate:budgets -- <templateId> [--write] [--max-rounds N]");
    process.exit(1);
  }
  const write = args.includes("--write");
  const mrIdx = args.indexOf("--max-rounds");
  const maxRounds = mrIdx >= 0 ? Number(args[mrIdx + 1]) : undefined;

  const report = await calibrateTemplate(templateId, { write, maxRounds });

  console.log(`\nKalibrering ${report.templateId} — ${report.rounds} render-varv`);
  console.log("token".padEnd(42) + "budget".padStart(7) + "  varv  metod              kortfält");
  for (const r of report.results) {
    console.log(
      r.token.padEnd(42) + String(r.budget).padStart(7) +
      String(r.rounds).padStart(6) + `  ${r.method.padEnd(18)}` + (r.shortField ? "JA" : ""),
    );
    for (const w of r.warnings) console.log(`    VARNING: ${w}`);
  }
  if (report.unresolved.length > 0) console.log(`\nOmätta (geometri-fallback): ${report.unresolved.join(", ")}`);
  console.log(write ? "\nProfil SPARAD." : "\nDRY-RUN — inget sparat. Kör med --write för att persistera.");
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 6.6: Add the npm script** (in `package.json` scripts block, after `"template:introspect"`)

```json
"calibrate:budgets": "node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/calibrate-budgets.ts"
```

- [ ] **Step 6.7: Typecheck + full test sweep**

Run: `npx tsc --noEmit; npm test`
Expected: both green.

- [ ] **Step 6.8: Commit**

```powershell
git add src/lib/pptx-template/calibrate/ scripts/calibrate-budgets.ts package.json
git commit -m "feat: budget calibration orchestrator and CLI"
```

---

### Task 7: Prompt changes — short-field rule + sibling division (`bundles/generic-prose.ts`)

**Files:**
- Modify: `src/lib/bid-generator/bundles/generic-prose.ts`
- Modify: `src/lib/pptx-template/applicators/generic-prose.ts` (soft-cap observability, 3 lines)
- Modify: `src/lib/pptx-template/calibrate/calibrate.ts` (swap inline `80` for the import)
- Test: `src/lib/bid-generator/__tests__/generic-prose.test.ts` (append — follow the file's existing mock pattern for `callClaude`)
- Test: `src/lib/bid-generator/__tests__/generate-from-profile.test.ts` (append)

**Interfaces:**
- Produces: `export const SHORT_FIELD_MAX_CHARS = 80;` and `export function isShortField(slot: GenericProseSlot): boolean` from `bundles/generic-prose.ts`. Behavior contract for later tasks: a short-field slot answered empty PRODUCES a section with `text: ""` (never re-asked, never failed); prose slots keep today's behavior exactly.

- [ ] **Step 7.1: Write the failing tests** (append; reuse the file's existing helpers/mocks — read the test file first and match its idiom)

Test cases to add, with exact assertions:

```ts
// In generic-prose.test.ts — prompt content (capture the system prompt via the
// existing callClaude mock, then assert):

it("marks slots at or under SHORT_FIELD_MAX_CHARS as KORTFÄLT in the slide prompt", async () => {
  // slot: { placeholder: "{Diarienummer}", intent: "ärendets diarienummer", budgetChars: 60 }
  // → system prompt contains `KORTFÄLT` and `endast värdet` for that slot line
  // and does NOT contain "håll dig inom ca 60 tecken" for it (the value rule replaces it).
});

it("adds the sibling-division block when a slide has 2+ slots", async () => {
  // two prose slots → prompt contains "EGEN tydlig vinkel" and "upprepa ingen mening"
  // one slot, no siblings → prompt does NOT contain "EGEN tydlig vinkel"
});

it("emits an empty section for a short field answered blank, drops a blank prose slot", async () => {
  // mock response: sections: [{ placeholder: "{Diarienummer}", text: "" }, { placeholder: "{Om oss}", text: "" }]
  // {Diarienummer} budgetChars 60 → section with text "" present
  // {Om oss} budgetChars 400 → NO section (caller re-asks)
});

it("re-ask prompt carries the value-or-empty rule for short fields", async () => {
  // reask target with budgetChars 60 → prompt line contains "KORTFÄLT" and "lämna tomt"
  // and the intro still demands substantial content for prose targets
});

// In generate-from-profile.test.ts — orchestration:

it("does not re-ask and does not fail a short field answered empty", async () => {
  // profile with one short slot (budgetChars 60) + one prose slot; wave-1 mock answers "" for both
  // → exactly ONE re-ask call, targeting only the prose slot
  // → failedSections does not contain the short slot
  // → sections contains the short slot with text ""
});
```

Write these as real tests against the file's existing mock infrastructure. Run to verify they FAIL.

- [ ] **Step 7.2: Implement in `bundles/generic-prose.ts`**

Additions (weave into the existing functions — shown here as the exact new pieces):

```ts
/** Fields at or under this budget are VALUES (a name, a date, a number), not
 *  prose. The calibration loop marks them via budgetChars; empty is a correct
 *  answer for them (no apology prose, no re-ask). Design doc 2026-07-14. */
export const SHORT_FIELD_MAX_CHARS = 80;

export function isShortField(slot: GenericProseSlot): boolean {
  return slot.budgetChars !== undefined && slot.budgetChars <= SHORT_FIELD_MAX_CHARS;
}

// Slot line, shared by slideSystemPrompt and reaskSystemPrompt:
function slotLine(s: GenericProseSlot): string {
  const intent = s.intent || "(ej angivet — härled från platshållaren och kontexten)";
  if (isShortField(s)) {
    return `- "${s.placeholder}": ${intent} — KORTFÄLT (max ${s.budgetChars} tecken): skriv ENDAST värdet (t.ex. ett namn, datum eller nummer), ALDRIG meningar eller förklaringar. Saknas uppgiften i underlaget: lämna tomt ("").`;
  }
  const budget = s.budgetChars ? ` (håll dig inom ca ${s.budgetChars} tecken)` : "";
  return `- "${s.placeholder}": ${intent}${budget}`;
}

// In slideSystemPrompt: replace the inline slotLines mapper with slotLine(s), and
// after the sibling block add (only when slots.length + siblings.length > 1):
const divisionBlock = `Sektioner med LIKNANDE syfte ska KOMPLETTERA varandra, inte upprepa: ge varje
sektion en EGEN tydlig vinkel (t.ex. historik, arbetssätt, värdegrund) och upprepa ingen mening
eller poäng mellan sektionerna.`;

// In reaskSystemPrompt: use slotLine(t.slot) for the per-slot lines (keeping the
// "(slide N)" suffix), and append to the intro:
// "Undantag: rader märkta KORTFÄLT får lämnas tomma när uppgiften saknas."

// In sectionsFromRecord: the ONLY behavior change —
for (const slot of slots) {
  const text = record[slot.placeholder];
  const blank = typeof text !== "string" || text.trim().length === 0;
  if (blank && !isShortField(slot)) continue; // prose: re-ask path, unchanged
  sections.push({
    type: "ai",
    key: `generic-prose:${slot.placeholder}`,
    title: slot.intent || slot.placeholder,
    content: {
      format: "generic-prose",
      placeholder: slot.placeholder,
      // Blank short field: emit "" so the applicator blanks the token instead
      // of leaving a raw {placeholder} visible, and the orchestrator neither
      // re-asks nor fails it (empty IS the correct answer).
      text: blank ? "" : (text as string),
    },
    generatedAt,
  });
}
```

- [ ] **Step 7.3: Soft-cap observability in the applicator** (`src/lib/pptx-template/applicators/generic-prose.ts`, inside `buildGenericProseMap` where the section is matched)

```ts
import { softCap } from "./_footer"; // NOTE: softCap lives in ./_soft-cap — import from there
// after: map[slot.placeholder] = sec.content.text;
if (slot.budgetChars !== undefined) {
  softCap(ctx.sourceSlide, slot.placeholder, sec.content.text, Math.round(slot.budgetChars * 1.3));
}
```

(Correct import: `import { softCap } from "./_soft-cap";` — warn-only at 1.3× budget; no truncation, per the design's "budget in prompt, observability in render".)

- [ ] **Step 7.4: Swap the calibrate constant**

In `calibrate.ts`: replace `const SHORT_FIELD_MAX_CHARS = 80;` with `import { SHORT_FIELD_MAX_CHARS } from "@/lib/bid-generator/bundles/generic-prose";`.

- [ ] **Step 7.5: Run all affected tests**

Run: `npx vitest run src/lib/bid-generator/ src/lib/pptx-template/; npx tsc --noEmit`
Expected: PASS, including the pre-existing generic-prose/generate-from-profile suites (prompt-snapshot tests may need their expected strings updated — update ONLY strings that the new slot line/division block legitimately changed).

- [ ] **Step 7.6: Commit**

```powershell
git add src/lib/bid-generator/ src/lib/pptx-template/
git commit -m "feat: short-field rule and sibling division in generic-prose prompts"
```

---

### Task 8: Duplicate detector

**Files:**
- Create: `src/lib/text-similarity.ts`
- Create: `scripts/check-deck-duplication.ts`
- Modify: `package.json` (one npm script)
- Test: `src/lib/__tests__/text-similarity.test.ts`

**Interfaces:**
- Produces: `trigramSimilarity(a: string, b: string): number` (0–1); `duplicatePairs(items: { label: string; text: string }[], threshold?: number): { a: string; b: string; similarity: number }[]`.

- [ ] **Step 8.1: Write the failing test**

```ts
// src/lib/__tests__/text-similarity.test.ts
import { describe, expect, it } from "vitest";
import { duplicatePairs, trigramSimilarity } from "../text-similarity";

describe("trigramSimilarity", () => {
  it("identical texts → 1", () => {
    const t = "Vi har lång erfarenhet av offentlig sektor och arbetar metodiskt.";
    expect(trigramSimilarity(t, t)).toBe(1);
  });
  it("unrelated texts → low", () => {
    expect(
      trigramSimilarity(
        "Riskhantering sker genom en levande risklogg och styrgruppsmöten.",
        "Betalning sker månadsvis i efterskott enligt avtalad prislista.",
      ),
    ).toBeLessThan(0.3);
  });
  it("near-identical variants → high (the nine 'Om oss' case)", () => {
    expect(
      trigramSimilarity(
        "Vi är en oberoende rådgivare med lång erfarenhet av offentlig sektor.",
        "Vi är en oberoende rådgivare med mångårig erfarenhet av offentlig sektor.",
      ),
    ).toBeGreaterThan(0.6);
  });
  it("is case- and punctuation-insensitive", () => {
    expect(trigramSimilarity("Vi arbetar metodiskt!", "vi arbetar metodiskt")).toBe(1);
  });
});

describe("duplicatePairs", () => {
  it("returns pairs at or above the threshold, sorted by similarity desc", () => {
    const pairs = duplicatePairs(
      [
        { label: "A", text: "Vi är en oberoende rådgivare med lång erfarenhet av offentlig sektor." },
        { label: "B", text: "Vi är en oberoende rådgivare med mångårig erfarenhet av offentlig sektor." },
        { label: "C", text: "Betalning sker månadsvis i efterskott enligt avtalad prislista." },
      ],
      0.5,
    );
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ a: "A", b: "B" });
  });
});
```

- [ ] **Step 8.2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/text-similarity.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 8.3: Implement**

```ts
// src/lib/text-similarity.ts
/**
 * Character-trigram Jaccard similarity — the mechanical sibling-duplication
 * check from the budget-calibration design (2026-07-14). Deliberately simple:
 * it flags near-copies (the nine-"Om oss" failure), not paraphrase.
 */

function trigrams(text: string): Set<string> {
  const norm = text.toLowerCase().replace(/[^a-zåäöéü0-9]+/gi, " ").trim().replace(/\s+/g, " ");
  const out = new Set<string>();
  for (let i = 0; i + 3 <= norm.length; i++) out.add(norm.slice(i, i + 3));
  return out;
}

export function trigramSimilarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

export interface DuplicatePair { a: string; b: string; similarity: number; }

export function duplicatePairs(
  items: { label: string; text: string }[],
  threshold = 0.5,
): DuplicatePair[] {
  const pairs: DuplicatePair[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const similarity = trigramSimilarity(items[i].text, items[j].text);
      if (similarity >= threshold) {
        pairs.push({ a: items[i].label, b: items[j].label, similarity: Math.round(similarity * 100) / 100 });
      }
    }
  }
  return pairs.sort((x, y) => y.similarity - x.similarity);
}
```

```ts
// scripts/check-deck-duplication.ts
// CLI: npx tsx scripts/check-deck-duplication.ts <deck.pptx>
// Pairwise same-slide similarity over an EXPORTED deck's text shapes.
// Exit 0 = clean, 1 = pairs ≥ 0.7 (fail), prints WARN for pairs ≥ 0.5.
import { readFile } from "fs/promises";
import { readPptxSlides } from "../src/lib/pptx-template/introspect/read-pptx";
import { duplicatePairs } from "../src/lib/text-similarity";

const MIN_TEXT_CHARS = 120; // short labels/headers pair-match trivially — skip
const WARN_AT = 0.5;
const FAIL_AT = 0.7;

async function main() {
  const [pptxPath] = process.argv.slice(2);
  if (!pptxPath) {
    console.error("Användning: npx tsx scripts/check-deck-duplication.ts <deck.pptx>");
    process.exit(1);
  }
  const slides = await readPptxSlides(await readFile(pptxPath));
  let failed = false;
  for (const slide of slides) {
    const items = slide.shapes
      .map((s, i) => ({ label: `slide ${slide.source} shape ${i}`, text: s.paragraphs.join("\n") }))
      .filter((s) => s.text.length >= MIN_TEXT_CHARS);
    for (const p of duplicatePairs(items, WARN_AT)) {
      const level = p.similarity >= FAIL_AT ? "FAIL" : "WARN";
      if (p.similarity >= FAIL_AT) failed = true;
      console.log(`${level} ${p.a} ~ ${p.b}: ${p.similarity}`);
    }
  }
  console.log(failed ? "\nDUBBLETTER ÖVER FAIL-TRÖSKELN." : "\nInga dubbletter över fail-tröskeln.");
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
```

npm script (package.json, after `calibrate:budgets`): `"deck:dupes": "tsx scripts/check-deck-duplication.ts"`

- [ ] **Step 8.4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/text-similarity.test.ts`
Expected: PASS. Then sanity-run the CLI against the catastrophe baseline if the exported pptx is still on disk (optional; it MUST flag slide 4).

- [ ] **Step 8.5: Commit**

```powershell
git add src/lib/text-similarity.ts src/lib/__tests__/ scripts/check-deck-duplication.ts package.json
git commit -m "feat: same-slide duplicate detector for exported decks"
```

---

### Task 9: Live calibration smoke against Radrum v4 (COM, $0)

**Files:** none created (verification + possibly small fixes committed as `fix:`)

**Prerequisites:** desktop PowerPoint; `.env.local` in the worktree (Task 0).

- [ ] **Step 9.1: Find the Radrum v4 templateId**

Query via a throwaway node eval or the app UI (Inställningar → Mallar). SQL equivalent: `select id, name, version, onboarding_status from templates where name ilike '%radrum%' order by version desc;` — expect the v4 row with `onboarding_status = 'active'` (the one Stefan's 2026-07-07 smoke used).

- [ ] **Step 9.2: Dry-run calibration**

Run: `npm run calibrate:budgets -- <templateId>`
Expected, in order:
1. `round N: X/Y slots converged` lines — Y ≈ 137 (confirmed slots), N ≤ 8.
2. Wall clock: minutes (each round = 1 render + 1 COM open/save), not hours.
3. Report table: every budget in [30, 1000]; `measured` on ≥ 90% of slots; the slide-5 boxes (11 per slide) land well under 600 each; some slots flagged `kortfält JA`.
4. `Omätta` list short (< 10% of slots).

If marker matching fails wholesale (all `geometry-fallback`): the likely cause is COM shape enumeration vs text replacement — inspect `tmp/calibrate/<id>/round-1.pptx` in PowerPoint and `round-1.json` textPrefix values, fix, re-run. This is the task where index/marker assumptions meet reality — budget time for it.

- [ ] **Step 9.3: Vision gate on the converged deck**

Run: `pwsh -File scripts/inspect-pptx.ps1 -Pptx tmp/calibrate/<id>/round-<last>.pptx`
Then LOOK at `tmp/inspect/round-<last>/composite.png` (all slides). Expected: test prose fills boxes WITHOUT visible overflow; flag any slide where text visibly crowds or clips → lower those slots' budgets manually in the report before `--write` (calibration is converged-at-boundary by design; the vision pass is the human-taste margin).

- [ ] **Step 9.4: Persist**

Run: `npm run calibrate:budgets -- <templateId> --write`
Expected: `Profil SPARAD.` Verify: re-run dry-run — initial guesses should now match stored budgets (or check `template_profiles.profile` slot `budgetChars` in Supabase).

- [ ] **Step 9.5: Commit any fixes + note results**

```powershell
git add -A
git commit -m "fix: calibration smoke findings against Radrum v4"
```

(Only if fixes were needed. Record round count, % measured, wall clock — they go in the evaluation notes in Task 10.)

---

### Task 10: Paid evaluation run + ROADMAP + decision material (~$1–2)

**Files:**
- Modify: `notes/ROADMAP.md`
- Create: `notes/2026-07-14-budget-calibration-evaluation.md`

- [ ] **Step 10.1: Regenerate the Radrum bid with calibrated profile + new prompts**

Start dev: `npm run dev` (worktree). In the app: create a new bid from the SAME RFP + Radrum v4 template that produced bid `378c78a5` (arbetsyta → new bid). This exercises `generateSectionsFromProfile` → calibrated `budgetChars` flows into every generic-prose prompt. Export the pptx. (Cost lands on the configured API key: ~$1–2.)

- [ ] **Step 10.2: Mechanical gates**

```powershell
pwsh -File scripts/inspect-pptx.ps1 -Pptx <exported.pptx>
npm run deck:dupes -- <exported.pptx>
```

Gates (from the spec — record ALL numbers vs the 378c78a5 baseline 45 789 chars / 8 FAIL slides):
- inspect-pptx: **0 FAIL slides**, total volume **≤ ~13 000 chars** (2× designer density 6.5k)
- deck:dupes: **exit 0** (no pair ≥ 0.7)
- Short fields: spot-check {Diarienummer}-type boxes — value or blank, NEVER apology prose

- [ ] **Step 10.3: Vision pass + Stefan's verdict**

Look at the composite (all slides). Then Stefan judges: *"skulle kunna skickas till kund efter lätt redigering"* — yes/no. This is the decision gate; do not soften it.

- [ ] **Step 10.4: Write the evaluation note + update ROADMAP**

`notes/2026-07-14-budget-calibration-evaluation.md`: measured numbers (per-slide chars, FAIL/WARN counts, dupe pairs, short-field spot-checks), calibration stats from Task 9, verdict, and the resulting path decision (rescue / env-flag / revert). Update `notes/ROADMAP.md`: resolve the ⚖️ OPEN DECISION section with the outcome, mark the LÄNGDSTYRNING item done/superseded, note the calibration loop as the mechanism, keep slice 6 caveat (table-heavy slides remain out of scope).

- [ ] **Step 10.5: Full verification sweep + commit**

```powershell
npm run lint; npx tsc --noEmit; npm test
git add notes/
git commit -m "docs: budget calibration evaluation results and path decision"
```

Expected: all green — show the output. Then PR per `superpowers:finishing-a-development-branch` (bidsmith has no auto-PR-review routine — request `/code-review` locally; regression-sensitive prompt changes → dispatch a fresh reviewer per the standing feedback rule).

---

## Self-Review (performed at write time)

- **Spec coverage:** fill/measure/adjust/vision loop → Tasks 1–6, 9; short-field + sibling prompts → Task 7; mechanical dupe check → Task 8; evaluation run + gates + Stefan's verdict + ROADMAP → Task 10; "profile written only after convergence" → dry-run default + `--write` flag; "COM failure keeps geometry guess" → unresolved/fallback path in Task 6. Slice-6 table limitation: excluded by construction (read-pptx doesn't surface table text as candidate shapes).
- **Placeholders:** none — every code step carries the code. Task 7 shows exact new pieces to weave in rather than the full rewritten file; the tests pin the behavior.
- **Type consistency:** `CalibrationTarget` (T2) consumed by T6; `ShapeMeasurement`/`verdictFor`/`markerOf` (T5) consumed by T6; `SHORT_FIELD_MAX_CHARS` defined inline in T6, single-sourced in T7 step 7.4; `fillText` length contract (T1) asserted again in T6's section test.
- **Known risk, made explicit:** COM `BoundHeight`/group flattening/`SaveAs`-fontScale behavior is verified live in Task 4 step 4.2 and Task 9 — the plan isolates that risk to two checkpoints instead of letting it surprise Task 10.
