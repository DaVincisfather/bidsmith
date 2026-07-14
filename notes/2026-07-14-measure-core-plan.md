# Measure Core (Loop v2 + Deck Scanner) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A shared measurement core (`src/lib/pptx-template/measure/`) with seven marked checks that closes the calibration loop's measurement gaps (spAutoFit/slide edge, single-line semantics, no-wrap clipping) and powers a new `npm run deck:scan` QA gate for generated decks — validated against a three-deck ground-truth set, then used to recalibrate Radrum v4.

**Architecture:** `scripts/measure-overflow.ps1` is enriched (backward-compatibly) into a general shape measurer; a new pure-TS `measure/` module holds the verdict functions (each tagged `com` or `xml`) and a versioned `DeckScanReport`; two consumers — the existing calibration loop (switches its overflow verdict to the shared core + gains a single-line budget cap) and a new `scripts/scan-deck.ts` CLI. Spec: `notes/2026-07-14-measure-core-design.md`.

**Tech Stack:** TypeScript strict + vitest; PowerShell 7 + PowerPoint COM; JSZip/@xmldom (existing read-pptx); no new dependencies, no AI calls, no DB writes except the final `calibrate --write`.

## Global Constraints

- TypeScript strict — no `any` without justifying comment. Files under ~300 lines.
- Surgical changes; identifiers/commits English; conventional commits.
- Windows: tests/npm/git via PowerShell (bash sandbox stale-FS gotcha). NEVER commit `package-lock.json` churn (`git checkout -- package-lock.json` if npm touches it).
- Worktree: `C:\Users\stefa\projects\bidsmith-loopv2`, branch `feat/measure-core`. npm install ALREADY done; `.env.local` present (includes `BIDSMITH_FOREIGN_TEMPLATES=on`).
- Exact spec values: tolerance `2pt`; calibration overflow font-scale signal `< 99%`; scanner autofit-shrink finding `< 80%`; single-line wrap factor `1.6×` line height (line height = fontSizePt × 1.2); deadspace fill-ratio `< 0.35` on boxes with available height ≥ `60pt`, slide-WARN when ≥ `0.5` of such boxes are underfilled (min 2 large boxes); severity v1: outside-slide/vertical-overflow/raw-token = FAIL, horizontal-clip/single-line-break/autofit-shrink = WARN, deadspace = INFO per box + WARN slide-aggregate; exit codes 0/1/2. All thresholds live in ONE place (`THRESHOLDS` in types.ts) — they are start values to be tuned in Task 7.
- **Spec deviation (documented):** `--profile` budget checks are DEFERRED to the app-surface track — a generated deck has no placeholders left, so shape→slot mapping needs DB-side sections; noted in ROADMAP in Task 8. Everything else in the spec is in scope.
- Ground-truth decks (Task 7): `C:\Users\stefa\Downloads\anbud-c993fa7a.pptx` (evaluation deck), `C:\Users\stefa\Downloads\anbud-378c78a5.pptx` (catastrophe), empty template = render of Radrum v4 with no sections (Task 7 shows how to produce it).
- Before "klart": lint + test + tsc with output. Baseline on this branch: 1079 passed / 5 skipped.

---

### Task 0: Baseline

**Files:** none

- [ ] **Step 0.1:** Run `npm test` in the worktree. Expected: 1079 passed / 5 skipped (main post-#79/#80). If not, STOP and report.

---

### Task 1: PS enrichment (measure-overflow.ps1, backward-compatible)

**Files:**
- Modify: `scripts/measure-overflow.ps1`

**Interfaces:**
- Produces JSON consumed by Tasks 2–6. New per-shape fields (existing fields unchanged): `topPt, leftPt, widthPt, boundWidthPt, marginLeftPt, marginRightPt, wordWrap (bool), autoSize (int 0|1|2), fontSizePt (number|null), textLength (int)`. New top-level fields: `slideWidthPt, slideHeightPt`.

- [ ] **Step 1.1: Apply the enrichment.** Replace the row construction and the top-level object with:

```powershell
# inside the shape loop, after the existing $boundHeight try/catch:
                try {
                    $boundWidth = [math]::Round($tf.TextRange.BoundWidth, 2)
                } catch {
                    # Same degenerate-shape class as BoundHeight; keep the shape but
                    # mark width unknown (-1) so TS-side width checks skip it.
                    $boundWidth = -1
                }
                # Font.Size returns a negative sentinel for mixed-size runs — map to null.
                $fsRaw = $tf.TextRange.Font.Size
                $fontSize = $(if ($fsRaw -gt 0) { [math]::Round($fsRaw, 1) } else { $null })
                $rows += [pscustomobject]@{
                    slide          = $slide.SlideIndex
                    name           = $shape.Name
                    topPt          = [math]::Round($shape.Top, 2)
                    leftPt         = [math]::Round($shape.Left, 2)
                    widthPt        = [math]::Round($shape.Width, 2)
                    heightPt       = [math]::Round($shape.Height, 2)
                    boundHeightPt  = $boundHeight
                    boundWidthPt   = $boundWidth
                    marginTopPt    = [math]::Round($tf.MarginTop, 2)
                    marginBottomPt = [math]::Round($tf.MarginBottom, 2)
                    marginLeftPt   = [math]::Round($tf.MarginLeft, 2)
                    marginRightPt  = [math]::Round($tf.MarginRight, 2)
                    wordWrap       = [bool]($tf.WordWrap -ne 0)   # msoTrue = -1
                    autoSize       = [int]$tf.AutoSize            # 0 none / 1 spAuto / 2 norm
                    fontSizePt     = $fontSize
                    textPrefix     = $text.Substring(0, [math]::Min(128, $text.Length))
                    textLength     = $text.Length
                }
```

and the output object:

```powershell
        [pscustomobject]@{
            slideCount    = $slideCount
            slideWidthPt  = [math]::Round($pres.PageSetup.SlideWidth, 2)
            slideHeightPt = [math]::Round($pres.PageSetup.SlideHeight, 2)
            shapes        = @($rows)
        } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $absJson -Encoding utf8
```

(Capture `PageSetup` while `$pres` is open, before `Close()` — put the two reads next to the existing `$slideCount = $pres.Slides.Count` line.) Update the header comment to mention the enrichment and the design doc `notes/2026-07-14-measure-core-design.md`.

- [ ] **Step 1.2: Verify against a real deck** (PowerPoint must be closed first: `Get-Process POWERPNT -ErrorAction SilentlyContinue`):

Run: `pwsh -File scripts/measure-overflow.ps1 -Pptx templates/anbudsmall-v2.pptx -OutJson tmp/measure-v2-smoke.json -RecalcOut tmp/measure-v2-smoke-recalc.pptx`
Expected: exit 0; JSON has `slideWidthPt` ≈ 1440 and `slideHeightPt` ≈ 810 (50.8×28.575 cm deck) or the template's actual size; every shape has the ten new fields; `wordWrap` is a JSON boolean; at least one shape with `autoSize` ≠ 0; `fontSizePt` numeric on most shapes (null allowed on mixed); old fields byte-compatible (spot-check one shape against a pre-change run if unsure). No orphaned POWERPNT after.

- [ ] **Step 1.3: Confirm calibration still parses** (back-compat): `npx vitest run src/lib/pptx-template/calibrate/` — all pass (the TS side ignores unknown JSON fields).

- [ ] **Step 1.4: Commit**

```powershell
git add scripts/measure-overflow.ps1
git commit -m "feat: enrich COM measurement with position, width, wrap, autosize, font size"
```

---

### Task 2: The measure module — types + verdicts (pure TS)

**Files:**
- Create: `src/lib/pptx-template/measure/types.ts`
- Create: `src/lib/pptx-template/measure/verdicts.ts`
- Test: `src/lib/pptx-template/measure/__tests__/verdicts.test.ts`

**Interfaces (later tasks import these exactly):**

```ts
// types.ts
export type CheckId = "vertical-overflow" | "outside-slide" | "horizontal-clip"
  | "single-line-break" | "autofit-shrink" | "deadspace" | "raw-token";
export type CheckSource = "com" | "xml";
export type Severity = "FAIL" | "WARN" | "INFO";
export const CHECK_SOURCES: Record<CheckId, CheckSource>;
export const SEVERITIES: Record<CheckId, Severity>;   // v1 mapping from Global Constraints
export interface ShapeMeasurementV2 { slide: number; name: string; topPt: number; leftPt: number;
  widthPt: number; heightPt: number; boundHeightPt: number; boundWidthPt: number;
  marginTopPt: number; marginBottomPt: number; marginLeftPt: number; marginRightPt: number;
  wordWrap: boolean; autoSize: number; fontSizePt: number | null; textPrefix: string; textLength: number; }
export interface MeasurementFile { slideCount: number; slideWidthPt: number; slideHeightPt: number; shapes: ShapeMeasurementV2[]; }
export interface Finding { checkId: CheckId; severity: Severity; slide: number; shape: string; detail: string; }
export const THRESHOLDS: { tolerancePt: 2; minFontScalePct: 99; uglyFontScalePct: 80;
  singleLineFactor: 1.6; lineSpacingFactor: 1.2; deadspaceFillRatio: 0.35;
  deadspaceMinBoxPt: 60; deadspaceSlideShare: 0.5; };

// verdicts.ts
export function markerOf(textPrefix: string): string | null;                        // moves here from calibrate/overflow.ts, unchanged
export function checkVerticalOverflow(m: ShapeMeasurementV2): Finding | null;       // com
export function checkOutsideSlide(m: ShapeMeasurementV2, slideWidthPt: number, slideHeightPt: number): Finding | null; // com
export function checkHorizontalClip(m: ShapeMeasurementV2, slideWidthPt: number): Finding | null; // com
export function checkSingleLineBreak(m: ShapeMeasurementV2): Finding | null;        // com (needs fontSizePt; null when unknown)
export function checkAutofitShrink(m: ShapeMeasurementV2, fontScalePct: number | null): Finding | null; // com
export function deadspaceFindings(shapes: ShapeMeasurementV2[]): Finding[];         // com, slide-level aggregation over the whole deck
export interface ShapeVerdict { overBudget: boolean; signals: CheckId[]; }
export function calibrationVerdict(m: ShapeMeasurementV2, fontScalePct: number | null,
  slideWidthPt: number, slideHeightPt: number): ShapeVerdict;                        // the calibration loop's OR-verdict
```

- [ ] **Step 2.1: Write the failing tests.** One `describe` per check; construct measurements with a helper. Complete test file:

```ts
// src/lib/pptx-template/measure/__tests__/verdicts.test.ts
import { describe, expect, it } from "vitest";
import {
  calibrationVerdict, checkAutofitShrink, checkHorizontalClip, checkOutsideSlide,
  checkSingleLineBreak, checkVerticalOverflow, deadspaceFindings, markerOf,
} from "../verdicts";
import type { ShapeMeasurementV2 } from "../types";

const SLIDE_W = 1440, SLIDE_H = 810;
function m(over: Partial<ShapeMeasurementV2>): ShapeMeasurementV2 {
  return {
    slide: 1, name: "TextBox 1", topPt: 100, leftPt: 100, widthPt: 400, heightPt: 100,
    boundHeightPt: 50, boundWidthPt: 200, marginTopPt: 4, marginBottomPt: 4,
    marginLeftPt: 4, marginRightPt: 4, wordWrap: true, autoSize: 0,
    fontSizePt: 18, textPrefix: "text", textLength: 100, ...over,
  };
}

describe("checkVerticalOverflow (com)", () => {
  it("flags text taller than the box minus margins + tolerance", () => {
    // available = 100 - 4 - 4 = 92; 95 > 94
    expect(checkVerticalOverflow(m({ boundHeightPt: 95 }))?.checkId).toBe("vertical-overflow");
    expect(checkVerticalOverflow(m({ boundHeightPt: 93 }))).toBeNull(); // inside tolerance
  });
});

describe("checkOutsideSlide (com)", () => {
  it("flags a box whose bottom or right edge is outside the slide", () => {
    expect(checkOutsideSlide(m({ topPt: 760, heightPt: 100 }), SLIDE_W, SLIDE_H)?.checkId).toBe("outside-slide"); // 860 > 812
    expect(checkOutsideSlide(m({ leftPt: 1100, widthPt: 400 }), SLIDE_W, SLIDE_H)?.checkId).toBe("outside-slide"); // 1500 > 1442
    expect(checkOutsideSlide(m({}), SLIDE_W, SLIDE_H)).toBeNull();
  });
});

describe("checkHorizontalClip (com)", () => {
  it("flags no-wrap text wider than its box or running past the slide edge", () => {
    // available width = 400 - 4 - 4 = 392; bound 400 > 394
    expect(checkHorizontalClip(m({ wordWrap: false, boundWidthPt: 400 }), SLIDE_W)?.checkId).toBe("horizontal-clip");
    // within box but past slide edge: left 1200 + bound 300 = 1500 > 1442
    expect(checkHorizontalClip(m({ wordWrap: false, widthPt: 600, boundWidthPt: 300, leftPt: 1200 }), SLIDE_W)?.checkId).toBe("horizontal-clip");
    expect(checkHorizontalClip(m({ wordWrap: true, boundWidthPt: 4000 }), SLIDE_W)).toBeNull();   // wrapping boxes never clip horizontally
    expect(checkHorizontalClip(m({ wordWrap: false, boundWidthPt: -1 }), SLIDE_W)).toBeNull();     // width unknown (PS fallback)
  });
});

describe("checkSingleLineBreak (com)", () => {
  // line height = 18 × 1.2 = 21.6; threshold = 1.6 × 21.6 = 34.56
  it("flags a grown auto-size box whose text wrapped to multiple lines", () => {
    expect(checkSingleLineBreak(m({ autoSize: 1, boundHeightPt: 45 }))?.checkId).toBe("single-line-break");
  });
  it("does not flag single-line text, non-autosize boxes, or unknown font size", () => {
    expect(checkSingleLineBreak(m({ autoSize: 1, boundHeightPt: 22 }))).toBeNull();
    expect(checkSingleLineBreak(m({ autoSize: 0, boundHeightPt: 45 }))).toBeNull();
    expect(checkSingleLineBreak(m({ autoSize: 1, boundHeightPt: 45, fontSizePt: null }))).toBeNull();
  });
});

describe("checkAutofitShrink (com)", () => {
  it("flags shrink below 80 %, ignores mild shrink and non-autofit", () => {
    expect(checkAutofitShrink(m({}), 62.5)?.checkId).toBe("autofit-shrink");
    expect(checkAutofitShrink(m({}), 90)).toBeNull();
    expect(checkAutofitShrink(m({}), null)).toBeNull();
  });
});

describe("deadspaceFindings (com)", () => {
  const bigEmpty = (slide: number, name: string) => m({ slide, name, heightPt: 200, boundHeightPt: 40 }); // fill 40/192 ≈ 0.21
  const bigFull = (slide: number, name: string) => m({ slide, name, heightPt: 200, boundHeightPt: 150 });
  const small = (slide: number, name: string) => m({ slide, name, heightPt: 40, boundHeightPt: 5 }); // below 60pt — ignored
  it("WARNs a slide where most large boxes are underfilled", () => {
    const findings = deadspaceFindings([bigEmpty(1, "a"), bigEmpty(1, "b"), bigFull(1, "c"), small(1, "d")]);
    const slideWarn = findings.find((f) => f.severity === "WARN");
    expect(slideWarn?.checkId).toBe("deadspace");
    expect(slideWarn?.slide).toBe(1);
  });
  it("stays quiet when large boxes are mostly filled or too few", () => {
    expect(deadspaceFindings([bigFull(1, "a"), bigEmpty(1, "b"), bigFull(1, "c")]).filter((f) => f.severity === "WARN")).toHaveLength(0);
    expect(deadspaceFindings([bigEmpty(1, "a")]).filter((f) => f.severity === "WARN")).toHaveLength(0); // < 2 large boxes
  });
});

describe("calibrationVerdict", () => {
  it("ORs the four signals and names them", () => {
    const v = calibrationVerdict(m({ boundHeightPt: 95, topPt: 760, heightPt: 100 }), null, SLIDE_W, SLIDE_H);
    expect(v.overBudget).toBe(true);
    expect(v.signals).toContain("vertical-overflow");
    expect(v.signals).toContain("outside-slide");
  });
  it("keeps the calibration font-scale signal at 99 % (stricter than the scanner's 80)", () => {
    const v = calibrationVerdict(m({}), 97, SLIDE_W, SLIDE_H);
    expect(v.overBudget).toBe(true);
    expect(v.signals).toContain("autofit-shrink");
  });
  it("clean shape → not over budget, no signals", () => {
    const v = calibrationVerdict(m({}), 100, SLIDE_W, SLIDE_H);
    expect(v).toEqual({ overBudget: false, signals: [] });
  });
});

describe("markerOf", () => {
  it("extracts the leading guillemet marker; null otherwise (unchanged from calibrate)", () => {
    expect(markerOf("«Om oss» Vi genomför")).toBe("Om oss");
    expect(markerOf("Statisk rubrik")).toBeNull();
  });
});
```

- [ ] **Step 2.2: Run to verify FAIL** — `npx vitest run src/lib/pptx-template/measure/__tests__/verdicts.test.ts` → module missing.

- [ ] **Step 2.3: Implement types.ts**

```ts
// src/lib/pptx-template/measure/types.ts
/**
 * The measurement core's data model (design doc 2026-07-14-measure-core-design.md).
 * ONE source of truth for check ids, their measurement source (com = needs the
 * PowerPoint COM renderer, xml = derivable from pptx XML — the subset a future
 * app surface can run without a renderer), severities, and thresholds. The
 * thresholds are START values — Task 7 tunes them against the ground-truth decks
 * before the scanner gets gate authority (the deck:dupes lesson).
 */

export type CheckId =
  | "vertical-overflow" | "outside-slide" | "horizontal-clip"
  | "single-line-break" | "autofit-shrink" | "deadspace" | "raw-token";
export type CheckSource = "com" | "xml";
export type Severity = "FAIL" | "WARN" | "INFO";

export const CHECK_SOURCES: Record<CheckId, CheckSource> = {
  "vertical-overflow": "com",
  "outside-slide": "com",
  "horizontal-clip": "com",
  "single-line-break": "com",
  "autofit-shrink": "com",
  deadspace: "com",
  "raw-token": "xml",
};

export const SEVERITIES: Record<CheckId, Severity> = {
  "vertical-overflow": "FAIL",
  "outside-slide": "FAIL",
  "raw-token": "FAIL",
  "horizontal-clip": "WARN",
  "single-line-break": "WARN",
  "autofit-shrink": "WARN",
  deadspace: "INFO", // per-box; the slide aggregate is emitted as WARN by deadspaceFindings
};

/** Superset of the calibration loop's ShapeMeasurement — every field the
 *  enriched measure-overflow.ps1 emits per text shape. */
export interface ShapeMeasurementV2 {
  slide: number;
  name: string;
  topPt: number;
  leftPt: number;
  widthPt: number;
  heightPt: number;
  boundHeightPt: number;
  /** -1 when BoundWidth threw on a degenerate shape — width checks skip it. */
  boundWidthPt: number;
  marginTopPt: number;
  marginBottomPt: number;
  marginLeftPt: number;
  marginRightPt: number;
  wordWrap: boolean;
  /** msoAutoSize: 0 none, 1 shape-grows-to-fit-text (spAuto), 2 text-shrinks (norm). */
  autoSize: number;
  /** null when the shape mixes font sizes (COM returns a sentinel). */
  fontSizePt: number | null;
  textPrefix: string;
  textLength: number;
}

export interface MeasurementFile {
  slideCount: number;
  slideWidthPt: number;
  slideHeightPt: number;
  shapes: ShapeMeasurementV2[];
}

export interface Finding {
  checkId: CheckId;
  severity: Severity;
  slide: number;
  /** Shape name, or "(slide)" for slide-level findings. */
  shape: string;
  detail: string;
}

export const THRESHOLDS = {
  tolerancePt: 2,
  /** Calibration overflow signal: any shrink at all means "did not fit". */
  minFontScalePct: 99,
  /** Scanner finding: shrink below this is a readability problem. */
  uglyFontScalePct: 80,
  /** boundHeight > factor × line height ⇒ the text wrapped. */
  singleLineFactor: 1.6,
  /** Default PowerPoint line spacing. */
  lineSpacingFactor: 1.2,
  deadspaceFillRatio: 0.35,
  deadspaceMinBoxPt: 60,
  deadspaceSlideShare: 0.5,
} as const;
```

- [ ] **Step 2.4: Implement verdicts.ts**

```ts
// src/lib/pptx-template/measure/verdicts.ts
import { SEVERITIES, THRESHOLDS, type CheckId, type Finding, type ShapeMeasurementV2 } from "./types";

/**
 * The seven checks as pure functions over COM measurements (design doc
 * 2026-07-14-measure-core-design.md). Shared by the calibration loop and the
 * deck scanner so the two can never drift apart — the "grönt men fult" lesson.
 * raw-token is xml-side and lives with the scanner (it needs readPptxSlides,
 * not a measurement).
 */

const MARKER_RE = /^«([^»]+)»/;

/** "«Om oss» Vi …" → "Om oss"; null when the shape carries no calibration fill.
 *  (Moved unchanged from calibrate/overflow.ts.) */
export function markerOf(textPrefix: string): string | null {
  const m = MARKER_RE.exec(textPrefix);
  return m ? m[1] : null;
}

function finding(checkId: CheckId, m: ShapeMeasurementV2, detail: string): Finding {
  return { checkId, severity: SEVERITIES[checkId], slide: m.slide, shape: m.name, detail };
}

/** Text laid out taller than the box's available height (non-growing boxes). */
export function checkVerticalOverflow(m: ShapeMeasurementV2): Finding | null {
  const available = m.heightPt - m.marginTopPt - m.marginBottomPt;
  if (m.boundHeightPt > available + THRESHOLDS.tolerancePt) {
    return finding("vertical-overflow", m, `text ${m.boundHeightPt}pt > box ${Math.round(available)}pt`);
  }
  return null;
}

/** Box (possibly GROWN by spAutoFit — COM reports post-layout size) outside the slide. */
export function checkOutsideSlide(m: ShapeMeasurementV2, slideWidthPt: number, slideHeightPt: number): Finding | null {
  const bottom = m.topPt + m.heightPt;
  const right = m.leftPt + m.widthPt;
  if (bottom > slideHeightPt + THRESHOLDS.tolerancePt || right > slideWidthPt + THRESHOLDS.tolerancePt) {
    return finding("outside-slide", m, `box bottom ${Math.round(bottom)}pt / right ${Math.round(right)}pt vs slide ${slideWidthPt}×${slideHeightPt}pt`);
  }
  return null;
}

/** No-wrap text clipped against its box or running past the slide edge. */
export function checkHorizontalClip(m: ShapeMeasurementV2, slideWidthPt: number): Finding | null {
  if (m.wordWrap || m.boundWidthPt < 0) return null;
  const available = m.widthPt - m.marginLeftPt - m.marginRightPt;
  const pastBox = m.boundWidthPt > available + THRESHOLDS.tolerancePt;
  const pastSlide = m.leftPt + m.boundWidthPt > slideWidthPt + THRESHOLDS.tolerancePt;
  if (pastBox || pastSlide) {
    return finding("horizontal-clip", m, `no-wrap text ${m.boundWidthPt}pt vs box ${Math.round(available)}pt (slide width ${slideWidthPt}pt)`);
  }
  return null;
}

/** A grow-to-fit box whose text wrapped to multiple lines — a one-line field
 *  that received prose (the vecka-box class). Needs a known font size. */
export function checkSingleLineBreak(m: ShapeMeasurementV2): Finding | null {
  if (m.autoSize !== 1 || m.fontSizePt === null) return null;
  const lineHeight = m.fontSizePt * THRESHOLDS.lineSpacingFactor;
  if (m.boundHeightPt > THRESHOLDS.singleLineFactor * lineHeight) {
    return finding("single-line-break", m, `text ${m.boundHeightPt}pt tall vs one line ≈ ${Math.round(lineHeight)}pt`);
  }
  return null;
}

/** normAutofit shrank the text below readable size (scanner threshold 80 %). */
export function checkAutofitShrink(m: ShapeMeasurementV2, fontScalePct: number | null): Finding | null {
  if (fontScalePct !== null && fontScalePct < THRESHOLDS.uglyFontScalePct) {
    return finding("autofit-shrink", m, `autofit shrank text to ${fontScalePct}%`);
  }
  return null;
}

/** Slide-level deadspace: most LARGE boxes on a slide barely filled. Emits one
 *  INFO per underfilled large box + one WARN per offending slide. */
export function deadspaceFindings(shapes: ShapeMeasurementV2[]): Finding[] {
  const out: Finding[] = [];
  const bySlide = new Map<number, ShapeMeasurementV2[]>();
  for (const m of shapes) {
    const arr = bySlide.get(m.slide) ?? [];
    arr.push(m);
    bySlide.set(m.slide, arr);
  }
  for (const [slide, slideShapes] of bySlide) {
    const large = slideShapes.filter(
      (m) => m.heightPt - m.marginTopPt - m.marginBottomPt >= THRESHOLDS.deadspaceMinBoxPt,
    );
    if (large.length < 2) continue;
    const underfilled = large.filter((m) => {
      const available = m.heightPt - m.marginTopPt - m.marginBottomPt;
      return m.boundHeightPt / available < THRESHOLDS.deadspaceFillRatio;
    });
    for (const m of underfilled) {
      out.push(finding("deadspace", m, `fill ${Math.round((m.boundHeightPt / (m.heightPt - m.marginTopPt - m.marginBottomPt)) * 100)}%`));
    }
    if (underfilled.length / large.length >= THRESHOLDS.deadspaceSlideShare) {
      out.push({ checkId: "deadspace", severity: "WARN", slide, shape: "(slide)",
        detail: `${underfilled.length}/${large.length} large boxes under ${THRESHOLDS.deadspaceFillRatio * 100}% filled` });
    }
  }
  return out;
}

export interface ShapeVerdict {
  overBudget: boolean;
  signals: CheckId[];
}

/** The calibration loop's overflow verdict: the three geometric signals plus
 *  ANY autofit shrink (99 % — stricter than the scanner's readability 80 %,
 *  because for budget search any shrink means "did not fit at nominal size"). */
export function calibrationVerdict(
  m: ShapeMeasurementV2,
  fontScalePct: number | null,
  slideWidthPt: number,
  slideHeightPt: number,
): ShapeVerdict {
  const signals: CheckId[] = [];
  if (checkVerticalOverflow(m)) signals.push("vertical-overflow");
  if (checkOutsideSlide(m, slideWidthPt, slideHeightPt)) signals.push("outside-slide");
  if (checkHorizontalClip(m, slideWidthPt)) signals.push("horizontal-clip");
  if (fontScalePct !== null && fontScalePct < THRESHOLDS.minFontScalePct) signals.push("autofit-shrink");
  return { overBudget: signals.length > 0, signals };
}
```

- [ ] **Step 2.5: Run to verify PASS** — `npx vitest run src/lib/pptx-template/measure/__tests__/verdicts.test.ts`.

- [ ] **Step 2.6: Commit** — `git add src/lib/pptx-template/measure/` + `git commit -m "feat: measurement core — types and seven verdict checks"`

---

### Task 3: Single-line exports + calibration target fields

**Files:**
- Modify: `src/lib/pptx-template/introspect/compute-budgets.ts` (two exported functions at the end, nothing else)
- Modify: `src/lib/pptx-template/calibrate/plan-targets.ts`
- Test: append to `src/lib/pptx-template/introspect/__tests__/compute-budgets.test.ts` and `src/lib/pptx-template/calibrate/__tests__/plan-targets.test.ts`

**Interfaces:**
- Produces: `isSingleLineBox(shape: ShapeText): boolean` (geometry says the box holds exactly one line; false when geometry missing); `singleLineCapacity(shape: ShapeText): number | null` (one line's char capacity: charsPerLine × FILL_FACTOR rounded to ROUND_TO; null when geometry missing). `CalibrationTarget` gains `singleLine: boolean` and `lineCapChars: number | null` (per-slot: capacity / shareCount).

- [ ] **Step 3.1: Failing tests.** compute-budgets append:

```ts
describe("single-line helpers", () => {
  const shape = (cy: number): Parameters<typeof isSingleLineBox>[0] => ({
    paragraphs: [], tokens: [], geometry: { x: 0, y: 0, cx: 2286000, cy },
    fontSizePt: 18, lineSpacingPct: null, autofit: null, inGroup: false,
  });
  // lineHeight = 18 × 12700 × 1.2 = 274320 EMU
  it("detects a one-line box and refuses when geometry is missing", () => {
    expect(isSingleLineBox(shape(280000))).toBe(true);   // floor(280000/274320) = 1
    expect(isSingleLineBox(shape(822960))).toBe(false);  // 3 lines
    expect(isSingleLineBox({ ...shape(280000), geometry: null })).toBe(false);
  });
  it("one-line capacity = charsPerLine × FILL rounded to 5", () => {
    // charsPerLine = floor(2286000/114300) = 20; 20 × 0.9 = 18 → 20
    expect(singleLineCapacity(shape(280000))).toBe(20);
    expect(singleLineCapacity({ ...shape(280000), geometry: null })).toBeNull();
  });
});
```

plan-targets append:

```ts
it("marks single-line boxes and carries a per-slot line cap", () => {
  const oneLine = { x: 0, y: 0, cx: 2286000, cy: 280000 };
  const slides: SlideShapes[] = [
    { source: 1, shapes: [shape(["{A}"], oneLine)], tokens: ["{A}"], images: { placed: 0, placeholders: 0 } },
  ];
  const [t] = planTargets(slides, profileWith([{ placeholder: "{A}" }]));
  expect(t.singleLine).toBe(true);
  expect(t.lineCapChars).toBe(20); // singleLineCapacity 20 / shareCount 1
});

it("multi-line and geometry-less boxes are not single-line", () => {
  const slides: SlideShapes[] = [
    { source: 1, shapes: [shape(["{A}"], GEO), shape(["{B}"], null)], tokens: ["{A}", "{B}"], images: { placed: 0, placeholders: 0 } },
  ];
  const targets = planTargets(slides, profileWith([{ placeholder: "{A}" }, { placeholder: "{B}" }]));
  expect(targets.every((t) => t.singleLine === false && t.lineCapChars === null)).toBe(true);
});
```

(GEO in that test file is a 3-line box; the existing `shape()` helper takes tokens + geometry.)

- [ ] **Step 3.2: RED** — run both test files, expect failures on missing exports/fields.

- [ ] **Step 3.3: Implement.** compute-budgets.ts (append; reuses private `geometricLineCount`, `boxCapacity`, constants):

```ts
/** True when the shape's geometry holds exactly ONE text line — the calibration
 *  loop caps such boxes at one line's capacity (vecka-box class, design doc
 *  2026-07-14-measure-core-design.md). False when geometry is missing. */
export function isSingleLineBox(shape: ShapeText): boolean {
  if (!shape.geometry) return false;
  return geometricLineCount(shape) === 1;
}

/** One line's character capacity (charsPerLine × FILL_FACTOR, ROUND_TO-rounded),
 *  or null when the shape inherits its geometry. */
export function singleLineCapacity(shape: ShapeText): number | null {
  if (!shape.geometry) return null;
  const fontPt = shape.fontSizePt ?? DEFAULT_FONT_PT;
  const charWidthEmu = fontPt * EMU_PER_PT * CHAR_WIDTH_FACTOR;
  const charsPerLine = Math.floor(shape.geometry.cx / charWidthEmu);
  const capacity = charsPerLine * FILL_FACTOR;
  return Math.max(ROUND_TO, Math.round(capacity / ROUND_TO) * ROUND_TO);
}
```

plan-targets.ts: import the two helpers; extend the interface and the target construction:

```ts
export interface CalibrationTarget {
  token: string;
  marker: string;
  source: number;
  shareCount: number;
  initialGuess: number;
  geometryMissing: boolean;
  /** Geometry says the box holds exactly one line — budget is capped at lineCapChars. */
  singleLine: boolean;
  /** Per-slot one-line capacity (capacity / shareCount); null when not single-line. */
  lineCapChars: number | null;
}
// in the target push:
        const singleLine = isSingleLineBox(shape);
        const lineCap = singleLine ? singleLineCapacity(shape) : null;
        targets.push({
          token, marker: token.slice(1, -1), source: slide.source,
          shareCount: shapeTokens.length,
          initialGuess: capacity === null ? DEFAULT_GUESS : Math.max(1, Math.round(capacity / shapeTokens.length)),
          geometryMissing: capacity === null,
          singleLine,
          lineCapChars: lineCap === null ? null : Math.max(1, Math.round(lineCap / shapeTokens.length)),
        });
```

- [ ] **Step 3.4: GREEN** — both test files + `npx vitest run src/lib/pptx-template/calibrate/` (existing tests construct CalibrationTarget literals — update the test helper `target()` to include `singleLine: false, lineCapChars: null`).

- [ ] **Step 3.5: Commit** — `git commit -m "feat: single-line box detection and per-slot line cap for calibration targets"`

---

### Task 4: Calibration switches to the measurement core

**Files:**
- Modify: `src/lib/pptx-template/calibrate/calibrate.ts`
- Modify: `src/lib/pptx-template/calibrate/font-scales.ts` (import markerOf from ../measure/verdicts)
- Delete: `src/lib/pptx-template/calibrate/overflow.ts` and `src/lib/pptx-template/calibrate/__tests__/overflow.test.ts` (superseded by measure/ — verify nothing else imports them: `grep -rn "calibrate/overflow" src/`)
- Modify: `scripts/calibrate-budgets.ts` (print the signals column)
- Test: extend `src/lib/pptx-template/calibrate/__tests__/calibrate.test.ts`

**Interfaces:**
- Consumes: `calibrationVerdict`, `markerOf`, `ShapeMeasurementV2`, `MeasurementFile` (Task 2); `CalibrationTarget.singleLine/lineCapChars` (Task 3).
- Produces: `SlotResult` gains `signals: CheckId[]` (the union of signals observed for that token across rounds — shows WHICH check drove the budget); `buildSlotResult(t, s, measured, frozenAtRound?, signals?)`.

- [ ] **Step 4.1: Failing tests** (append to the buildSlotResult describe; update existing literals for the new optional param only where asserted):

```ts
it("caps a single-line target's budget at its line capacity and flags short field", () => {
  const t = { ...target("{A}"), singleLine: true, lineCapChars: 40 };
  const r = buildSlotResult(t, doneState(400), true); // measured budget would be 400
  expect(r.budget).toBe(40);
  expect(r.shortField).toBe(true);
  expect(r.warnings.join()).toContain("single-line");
});

it("records which signals drove the verdict", () => {
  const r = buildSlotResult(target("{A}"), doneState(400), true, undefined, ["horizontal-clip"]);
  expect(r.signals).toEqual(["horizontal-clip"]);
});
```

- [ ] **Step 4.2: RED**, then implement:

In `calibrate.ts`:
1. Replace the `./overflow` imports with `import { calibrationVerdict, markerOf } from "../measure/verdicts";` and `import type { MeasurementFile, ShapeMeasurementV2, CheckId } from "../measure/types";`.
2. Parse the measurement file as `MeasurementFile` (it now carries slide dims): `const parsed = JSON.parse(...) as MeasurementFile;`.
3. Verdict loop becomes:

```ts
    const verdicts = new Map<string, boolean>();
    for (const m of parsed.shapes) {
      const marker = markerOf(m.textPrefix);
      if (!marker) continue;
      seen.add(marker);
      const v = calibrationVerdict(m, scales.get(marker) ?? null, parsed.slideWidthPt, parsed.slideHeightPt);
      verdicts.set(marker, v.overBudget);
      if (v.signals.length > 0) {
        const acc = signalsByMarker.get(marker) ?? new Set<CheckId>();
        for (const s of v.signals) acc.add(s);
        signalsByMarker.set(marker, acc);
      }
    }
```

with `const signalsByMarker = new Map<string, Set<CheckId>>();` declared next to `seen`/`frozenAt`, and the results mapping passing `[...(signalsByMarker.get(t.marker) ?? [])]`.

4. `SlotResult` gains `signals: CheckId[]`; `buildSlotResult(t, s, measured, frozenAtRound?, signals: CheckId[] = [])` sets it, and applies the single-line cap BEFORE the shortField computation:

```ts
  let budget = measured
    ? Math.max(30, Math.floor(finalBudget(s) / t.shareCount / 10) * 10)
    : Math.max(30, Math.floor(t.initialGuess / 10) * 10);
  if (t.singleLine && t.lineCapChars !== null && budget > t.lineCapChars) {
    budget = Math.max(30, Math.floor(t.lineCapChars / 10) * 10);
    warnings.push(`single-line box — budget capped at one line (${t.lineCapChars} chars)`);
  }
```

(declare `warnings` before the cap; keep all existing warning logic after it, unchanged.)

5. `scripts/calibrate-budgets.ts`: print signals after the method column when non-empty: `r.signals.length > 0 ? ` [${r.signals.join(",")}]` : ""`.

In `font-scales.ts`: change `import { markerOf } from "./overflow";` to `"../measure/verdicts"`.

Delete `calibrate/overflow.ts` + its test (markerOf/verdict coverage lives in measure/__tests__/verdicts.test.ts; port any overflow.test case not already covered — the verdictFor cases map to checkVerticalOverflow + calibrationVerdict tests).

- [ ] **Step 4.3: GREEN + sweep** — `npx vitest run src/lib/pptx-template/`; then `npx tsc --noEmit`; then `npm run lint`. All clean.

- [ ] **Step 4.4: Commit** — `git commit -m "feat: calibration verdicts via shared measurement core with signal tracking"`

---

### Task 5: The scan report (report.ts)

**Files:**
- Create: `src/lib/pptx-template/measure/report.ts`
- Test: `src/lib/pptx-template/measure/__tests__/report.test.ts`

**Interfaces:**
- Consumes: `Finding`, `Severity`, `MeasurementFile` (Task 2).
- Produces:

```ts
export interface DeckScanReport {
  schemaVersion: 1;
  deck: string;                     // basename of the scanned pptx
  scannedAt: string;                // ISO timestamp
  slideCount: number;
  slides: { slide: number; findings: Finding[] }[];   // only slides WITH findings
  summary: { fail: number; warn: number; info: number };
}
export function buildReport(deck: string, slideCount: number, findings: Finding[]): DeckScanReport;
export function renderTextReport(report: DeckScanReport): string;  // human-readable table
export function exitCodeFor(report: DeckScanReport): 0 | 1 | 2;    // 2 if any FAIL, 1 if any WARN, else 0
```

- [ ] **Step 5.1: Failing tests**

```ts
// src/lib/pptx-template/measure/__tests__/report.test.ts
import { describe, expect, it } from "vitest";
import { buildReport, exitCodeFor, renderTextReport } from "../report";
import type { Finding } from "../types";

const f = (over: Partial<Finding>): Finding => ({
  checkId: "vertical-overflow", severity: "FAIL", slide: 1, shape: "TextBox 1", detail: "d", ...over,
});

describe("buildReport", () => {
  it("groups findings per slide, counts severities, versions the schema", () => {
    const r = buildReport("anbud.pptx", 12, [f({}), f({ slide: 3, severity: "WARN", checkId: "horizontal-clip" }), f({ slide: 3, severity: "INFO", checkId: "deadspace" })]);
    expect(r.schemaVersion).toBe(1);
    expect(r.slideCount).toBe(12);
    expect(r.slides.map((s) => s.slide)).toEqual([1, 3]);
    expect(r.summary).toEqual({ fail: 1, warn: 1, info: 1 });
  });
  it("clean deck → empty slides, zero summary", () => {
    const r = buildReport("anbud.pptx", 12, []);
    expect(r.slides).toEqual([]);
    expect(r.summary).toEqual({ fail: 0, warn: 0, info: 0 });
  });
});

describe("exitCodeFor", () => {
  it("2 on FAIL, 1 on WARN-only, 0 clean", () => {
    expect(exitCodeFor(buildReport("d", 1, [f({})]))).toBe(2);
    expect(exitCodeFor(buildReport("d", 1, [f({ severity: "WARN" })]))).toBe(1);
    expect(exitCodeFor(buildReport("d", 1, [f({ severity: "INFO" })]))).toBe(0);
    expect(exitCodeFor(buildReport("d", 1, []))).toBe(0);
  });
});

describe("renderTextReport", () => {
  it("prints one line per finding with slide, severity, check and detail", () => {
    const text = renderTextReport(buildReport("anbud.pptx", 12, [f({})]));
    expect(text).toContain("slide 1");
    expect(text).toContain("FAIL");
    expect(text).toContain("vertical-overflow");
  });
});
```

- [ ] **Step 5.2: RED.**

- [ ] **Step 5.3: Implement**

```ts
// src/lib/pptx-template/measure/report.ts
import type { Finding } from "./types";

/** Versioned scan result — schemaVersion 1 is the contract a future app
 *  surface consumes (design doc 2026-07-14-measure-core-design.md). */
export interface DeckScanReport {
  schemaVersion: 1;
  deck: string;
  scannedAt: string;
  slideCount: number;
  slides: { slide: number; findings: Finding[] }[];
  summary: { fail: number; warn: number; info: number };
}

export function buildReport(deck: string, slideCount: number, findings: Finding[]): DeckScanReport {
  const bySlide = new Map<number, Finding[]>();
  for (const f of findings) {
    const arr = bySlide.get(f.slide) ?? [];
    arr.push(f);
    bySlide.set(f.slide, arr);
  }
  const slides = [...bySlide.entries()]
    .sort(([a], [b]) => a - b)
    .map(([slide, slideFindings]) => ({ slide, findings: slideFindings }));
  return {
    schemaVersion: 1,
    deck,
    scannedAt: new Date().toISOString(),
    slideCount,
    slides,
    summary: {
      fail: findings.filter((f) => f.severity === "FAIL").length,
      warn: findings.filter((f) => f.severity === "WARN").length,
      info: findings.filter((f) => f.severity === "INFO").length,
    },
  };
}

export function exitCodeFor(report: DeckScanReport): 0 | 1 | 2 {
  if (report.summary.fail > 0) return 2;
  if (report.summary.warn > 0) return 1;
  return 0;
}

export function renderTextReport(report: DeckScanReport): string {
  const lines: string[] = [
    `Deck scan — ${report.deck} (${report.slideCount} slides)`,
  ];
  for (const s of report.slides) {
    for (const f of s.findings) {
      lines.push(`  slide ${String(s.slide).padStart(2)}  ${f.severity.padEnd(4)}  ${f.checkId.padEnd(18)}  ${f.shape}: ${f.detail}`);
    }
  }
  lines.push(
    report.summary.fail + report.summary.warn + report.summary.info === 0
      ? "Rent deck — inga fynd."
      : `Summering: ${report.summary.fail} FAIL, ${report.summary.warn} WARN, ${report.summary.info} INFO.`,
  );
  return lines.join("\n");
}
```

- [ ] **Step 5.4: GREEN.** — `npx vitest run src/lib/pptx-template/measure/`

- [ ] **Step 5.5: Commit** — `git commit -m "feat: versioned deck scan report with severity summary and exit codes"`

---

### Task 6: The scanner CLI (scan-deck.ts) + prefix-keyed font scales

**Files:**
- Modify: `src/lib/pptx-template/calibrate/font-scales.ts` (add a by-prefix variant)
- Create: `scripts/scan-deck.ts`
- Modify: `package.json` (npm script `"deck:scan": "node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/scan-deck.ts"` — env-file kept for consistency; the scanner itself needs no env)
- Test: append to `src/lib/pptx-template/calibrate/__tests__/font-scales.test.ts`

**Interfaces:**
- Consumes: Tasks 2 & 5 exports; `readPptxSlides` (raw-token check); `execFile` of measure-overflow.ps1.
- Produces: `readFontScalesByPrefix(recalcPptx: Buffer, prefixLen?: number): Promise<Map<string, number>>` — keyed by the first `prefixLen` (default 40) chars of the shape's concatenated text; generated decks have NO «markers», so the scanner maps recalc-XML fontScale to measurements by text prefix instead (collisions = last-wins, acceptable for a WARN-level check — documented in code).

- [ ] **Step 6.1: Failing test** (append to font-scales.test.ts; reuse the file's mini-zip builders):

```ts
describe("readFontScalesByPrefix", () => {
  it("maps text prefix → applied scale for marker-less decks", async () => {
    const buf = await pptxWith(SLIDE(SP("Prissättningen utgår från omfattningen", `<a:normAutofit fontScale="75000"/>`)));
    const scales = await readFontScalesByPrefix(buf, 20);
    expect(scales.get("Prissättningen utgår".slice(0, 20))).toBe(75);
  });
  it("shapes without normAutofit are absent", async () => {
    const buf = await pptxWith(SLIDE(SP("Vanlig text", "")));
    expect((await readFontScalesByPrefix(buf)).size).toBe(0);
  });
});
```

- [ ] **Step 6.2: RED**, then implement in font-scales.ts (extract the shared walk into a private helper so `readFontScales` (marker-keyed, calibration) and `readFontScalesByPrefix` (prefix-keyed, scanner) share the zip/XML traversal — no duplicated parsing):

```ts
/** Shared walk: yields [concatenated shape text, fontScalePct] per normAutofit shape. */
async function walkFontScales(recalcPptx: Buffer): Promise<[string, number][]> {
  // (move the existing readFontScales body here, but collect [joined, scalePct]
  //  pairs instead of setting map entries)
}

export async function readFontScales(recalcPptx: Buffer): Promise<Map<string, number>> {
  const scales = new Map<string, number>();
  for (const [text, pct] of await walkFontScales(recalcPptx)) {
    const marker = markerOf(text);
    if (marker) scales.set(marker, pct); // last-write-wins; markers are template-unique
  }
  return scales;
}

/** Scanner variant: generated decks carry no «markers», so key by text prefix.
 *  Collisions (identical prefixes) are last-write-wins — acceptable for the
 *  WARN-level autofit-shrink check. */
export async function readFontScalesByPrefix(recalcPptx: Buffer, prefixLen = 40): Promise<Map<string, number>> {
  const scales = new Map<string, number>();
  for (const [text, pct] of await walkFontScales(recalcPptx)) {
    scales.set(text.slice(0, prefixLen), pct);
  }
  return scales;
}
```

- [ ] **Step 6.3: The CLI**

```ts
// scripts/scan-deck.ts
// CLI: npm run deck:scan -- <anbud.pptx> [--json ut.json]
// Scans a GENERATED deck for layout ugliness via the shared measurement core:
// COM-measures every text shape (measure-overflow.ps1), applies the seven
// checks, prints a per-slide report. Exit 0 clean / 1 WARN / 2 FAIL — a gate
// beside inspect-pptx and deck:dupes. Design: notes/2026-07-14-measure-core-design.md.
// NOTE: --profile budget checks are deferred to the app-surface track (a
// generated deck has no placeholders left to map shapes to slots).
import { execFile } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import { readPptxSlides } from "../src/lib/pptx-template/introspect/read-pptx";
import { readFontScalesByPrefix } from "../src/lib/pptx-template/calibrate/font-scales";
import type { Finding, MeasurementFile } from "../src/lib/pptx-template/measure/types";
import {
  checkAutofitShrink, checkHorizontalClip, checkOutsideSlide,
  checkSingleLineBreak, checkVerticalOverflow, deadspaceFindings,
} from "../src/lib/pptx-template/measure/verdicts";
import { buildReport, exitCodeFor, renderTextReport } from "../src/lib/pptx-template/measure/report";
import { SEVERITIES } from "../src/lib/pptx-template/measure/types";

const execFileAsync = promisify(execFile);
const PREFIX_LEN = 40;

async function main() {
  const args = process.argv.slice(2);
  const pptxPath = args.find((a) => !a.startsWith("--"));
  if (!pptxPath) {
    console.error("Användning: npm run deck:scan -- <anbud.pptx> [--json ut.json]");
    process.exit(1);
  }
  const jsonIdx = args.indexOf("--json");
  const jsonOut = jsonIdx >= 0 ? args[jsonIdx + 1] : null;
  if (jsonIdx >= 0 && !jsonOut) {
    console.error("--json kräver en filsökväg");
    process.exit(1);
  }

  const workDir = await mkdtemp(path.join(os.tmpdir(), "deck-scan-"));
  try {
    const measureJson = path.join(workDir, "measure.json");
    const recalcPath = path.join(workDir, "recalc.pptx");
    await execFileAsync("pwsh", ["-NoProfile", "-File", path.resolve("scripts", "measure-overflow.ps1"),
      "-Pptx", path.resolve(pptxPath), "-OutJson", measureJson, "-RecalcOut", recalcPath]);

    const measured = JSON.parse(await readFile(measureJson, "utf8")) as MeasurementFile;
    const scales = await readFontScalesByPrefix(await readFile(recalcPath), PREFIX_LEN);

    const findings: Finding[] = [];
    for (const m of measured.shapes) {
      const scale = scales.get(m.textPrefix.slice(0, PREFIX_LEN)) ?? null;
      for (const f of [
        checkVerticalOverflow(m),
        checkOutsideSlide(m, measured.slideWidthPt, measured.slideHeightPt),
        checkHorizontalClip(m, measured.slideWidthPt),
        checkSingleLineBreak(m),
        checkAutofitShrink(m, scale),
      ]) {
        if (f) findings.push(f);
      }
    }
    findings.push(...deadspaceFindings(measured.shapes));

    // raw-token (xml): any {token} left in the exported deck is an unfilled slot.
    const slides = await readPptxSlides(await readFile(pptxPath));
    for (const slide of slides) {
      for (const token of slide.tokens) {
        findings.push({ checkId: "raw-token", severity: SEVERITIES["raw-token"], slide: slide.source,
          shape: "(xml)", detail: `ofylld platshållare kvar: ${token}` });
      }
    }

    const report = buildReport(path.basename(pptxPath), measured.slideCount, findings);
    console.log(renderTextReport(report));
    if (jsonOut) {
      await writeFile(jsonOut, JSON.stringify(report, null, 2) + "\n", "utf8");
      console.log(`JSON: ${jsonOut}`);
    }
    process.exit(exitCodeFor(report));
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
```

Add the npm script after `"deck:dupes"`.

- [ ] **Step 6.4: Verify** — `npx tsc --noEmit` clean; smoke the CLI against the bundled template: `npm run deck:scan -- templates/anbudsmall-v2.pptx` → runs, prints a report (findings expected — the template is full of {tokens} → raw-token FAILs prove the xml path), exit code 2.

- [ ] **Step 6.5: Commit** — `git commit -m "feat: deck:scan CLI — layout QA gate over the shared measurement core"`

---

### Task 7: Ground-truth validation (facit-trion) — controller/operator task, COM, $0

**Files:**
- Possibly modify: `src/lib/pptx-template/measure/types.ts` (threshold tuning ONLY, with test updates)
- Create: `notes/2026-07-14-deck-scan-facit.md` (results)

- [ ] **Step 7.1:** Produce the empty-template baseline: `npx tsx scripts/render-template-cover-blank.ts` renders only slide 1 — instead scan the RAW template render. Simplest true baseline: the empty Radrum template as onboarded — download `anbudsmall-radrum/v4-instrumented.pptx` from storage (calibration Task 9 command pattern) and scan it. Its {tokens} will raw-token-flag (expected — note and ignore that check for the baseline) but layout checks must be near-silent.
- [ ] **Step 7.2:** Scan all three decks (PowerPoint closed):

```powershell
npm run deck:scan -- C:\Users\stefa\Downloads\anbud-c993fa7a.pptx --json tmp/scan-eval.json
npm run deck:scan -- C:\Users\stefa\Downloads\anbud-378c78a5.pptx --json tmp/scan-catastrophe.json
npm run deck:scan -- tmp/radrum-v4-instrumented.pptx --json tmp/scan-baseline.json
```

- [ ] **Step 7.3:** Compare against the ground truth (from `notes/2026-07-14-budget-calibration-evaluation.md`):
  - c993fa7a MUST flag: outside-slide on slides 2 & 9; horizontal-clip on the kicker rows of slides 3/4/7/8/11; single-line-break on slide 6 (vecka boxes); crowding on slide 8 (any of the checks).
  - 378c78a5 MUST flag: widespread vertical-overflow (it had 8 FAIL slides at 45.8k chars).
  - Baseline MUST be near-silent on layout checks (raw-token excepted): if the designer's own layout triggers findings, thresholds are too aggressive — tune THRESHOLDS (one place), update the unit tests' expected boundary values, re-run all three.
- [ ] **Step 7.4:** Record hits/misses per check per deck in `notes/2026-07-14-deck-scan-facit.md`, including any threshold changes and why. Commit: `git commit -m "test: ground-truth validation of deck scanner against three known decks"`

---

### Task 8: Recalibrate Radrum v4 + docs + PR

**Files:**
- Modify: `notes/ROADMAP.md`, `CLAUDE.md` (one command line)
- Create/extend: facit note from Task 7 with the recalibration diff

- [ ] **Step 8.1:** Recalibrate (PowerPoint closed; Supabase awake — poll REST first if the project has been idle):

```powershell
npm run calibrate:budgets -- 25f9d500-911f-4afb-8fc0-a30f8220c477
```

Expected vs the 2026-07-14 run (137/137 measured): kicker slots (e.g. {Uppdragets faser}, the top-row tokens) get LOWER budgets (horizontal-clip now signals); vecka-class boxes get the single-line cap warning + shortField JA; signals column shows which check drove each change; still ~6 rounds, everything measured. Then `--write`.
- [ ] **Step 8.2:** Docs: CLAUDE.md Kommandon gains `npm run deck:scan -- <anbud.pptx> [--json ut.json]  # layout-QA-gate på exporterat deck (kräver PowerPoint)`. ROADMAP: tick the LOOP v2 item (reference this plan + facit note), add follow-ups (deferred --profile budget checks → app-spåret; deadspace/threshold re-tuning after next real deck; single-line XML-approx for app subset), keep bid-editor-slimning as next spår.
- [ ] **Step 8.3:** Full sweep `npm run lint; npx tsc --noEmit; npm test` — show output. Commit docs, push, `gh pr create` (base main) with the measured before/after calibration diff in the body. Wait for the PR-review routine comment (it is ACTIVE) + CI before merging.

**Final step (Stefan, later):** regenerate the Radrum bid (~$1–2) with the recalibrated budgets → `deck:scan` + visual verdict — closes the loop-v2 evaluation.

---

## Self-Review (performed at write time)

- **Spec coverage:** PS enrichment → T1; seven checks marked com/xml → T2 (raw-token implemented in T6's CLI where readPptxSlides lives — the check function is inline there, its severity/source still comes from types.ts); calibration verdict OR + signals column → T4; single-line cap → T3+T4; deck:scan CLI + versioned JSON + exit codes → T5+T6; facit-trion before gate authority → T7; recalibration → T8; --profile DEFERRED (documented in Global Constraints, CLI comment, and ROADMAP task).
- **Placeholders:** Task 6's `walkFontScales` shows the refactor shape with one descriptive comment line standing in for the MOVED existing body (the implementer relocates existing code, not writes new) — acceptable since the source body exists in the file being edited; everything else carries complete code.
- **Type consistency:** `ShapeMeasurementV2`/`MeasurementFile`/`Finding`/`CheckId`/`THRESHOLDS` (T2) consumed by T4/T5/T6; `CalibrationTarget.singleLine/lineCapChars` (T3) consumed by T4; `buildSlotResult(t, s, measured, frozenAtRound?, signals?)` matches T4's tests; `readFontScalesByPrefix` (T6) matches its test.
- **Known risk isolated:** COM field behavior (BoundWidth, WordWrap sentinel, AutoSize values, Font.Size mixed sentinel, PageSetup units) is verified live in T1 step 1.2 before anything consumes it; threshold realism is isolated to T7 with a tuning loop.
