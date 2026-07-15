import { describe, it, expect } from "vitest";
import { buildRunReport, renderMarkdown } from "../report";
import type { RunReport } from "../report";
import type { BidMeasurement, GateResult } from "../types";
import type { Finding, ShapeMeasurementV2 } from "@/lib/pptx-template/measure/types";

function shape(over: Partial<ShapeMeasurementV2>): ShapeMeasurementV2 {
  return {
    slide: 1,
    name: "Text 1",
    topPt: 0,
    leftPt: 0,
    widthPt: 100,
    heightPt: 100,
    boundHeightPt: 100,
    boundWidthPt: 100,
    marginTopPt: 0,
    marginBottomPt: 0,
    marginLeftPt: 0,
    marginRightPt: 0,
    wordWrap: true,
    autoSize: 0,
    fontSizePt: 12,
    textPrefix: "x",
    textLength: 100,
    ...over,
  };
}

// Same shape as gates.test.ts's "grov" case: ratio 216/26 ≈ 8.3 ≫ 1.25 → gross overflow.
const GROSS_SHAPE = shape({ heightPt: 26, boundHeightPt: 216 });

function finding(over: Partial<Finding>): Finding {
  return { checkId: "outside-slide", severity: "FAIL", slide: 1, shape: "Text 1", detail: "overflow", ...over };
}

function bidMeasurement(over: Partial<BidMeasurement>): BidMeasurement {
  return {
    fixtureId: "f1",
    label: "test",
    bidId: "b1",
    findings: [],
    measurement: { slideCount: 1, slideWidthPt: 1440, slideHeightPt: 810, shapes: [] },
    duplicates: [],
    fill: [],
    totalChars: 10000,
    ...over,
  };
}

function gateResult(over: Partial<GateResult>): GateResult {
  return { fixtureId: "f1", label: "test", pass: true, breaches: [], excludedDefects: [], ...over };
}

/** 5 fixtures, 3 PASS: f1/f2 clean, f3 passes with one excluded (known-defect)
 *  FAIL finding, f4 fails on fail-findings (2 real FAILs), f5 fails on
 *  gross-overflow (1 shape) + duplicates (1 pair). */
function varv1Results() {
  const excludedFinding = finding({ checkId: "outside-slide", slide: 9, shape: "Text 5", detail: "known template gap" });

  return [
    { bid: bidMeasurement({ fixtureId: "f1", bidId: "b1" }), gate: gateResult({ fixtureId: "f1", pass: true }) },
    { bid: bidMeasurement({ fixtureId: "f2", bidId: "b2" }), gate: gateResult({ fixtureId: "f2", pass: true }) },
    {
      bid: bidMeasurement({ fixtureId: "f3", bidId: "b3", findings: [excludedFinding] }),
      gate: gateResult({ fixtureId: "f3", pass: true, excludedDefects: [excludedFinding] }),
    },
    {
      bid: bidMeasurement({
        fixtureId: "f4",
        bidId: "b4",
        findings: [
          finding({ slide: 2, shape: "Text A", detail: "text overflow A" }),
          finding({ slide: 3, shape: "Text B", detail: "text overflow B" }),
        ],
      }),
      gate: gateResult({
        fixtureId: "f4",
        pass: false,
        breaches: [{ gate: "fail-findings", detail: "slide 2 Text A: text overflow A; slide 3 Text B: text overflow B" }],
      }),
    },
    {
      bid: bidMeasurement({
        fixtureId: "f5",
        bidId: "b5",
        measurement: { slideCount: 1, slideWidthPt: 1440, slideHeightPt: 810, shapes: [GROSS_SHAPE] },
        duplicates: [{ a: "x", b: "y", slide: 3, similarity: 0.42 }],
      }),
      gate: gateResult({
        fixtureId: "f5",
        pass: false,
        breaches: [
          { gate: "gross-overflow", detail: "slide 1 Text 1: 216pt i 26pt inre box" },
          { gate: "duplicates", detail: "slide 3: 0.42" },
        ],
      }),
    },
  ];
}

/** Same shape as varv1 but improved: f4 now has 3 real FAILs (worse — kept
 *  distinct from varv1 on purpose to get an unambiguous −2 delta below when
 *  compared against a hand-built previous report with failFindings=5), f5's
 *  duplicates grow to 2 pairs, gross overflow count unchanged... */
function varv2Results() {
  const excludedFinding = finding({ checkId: "outside-slide", slide: 9, shape: "Text 5", detail: "known template gap" });

  return [
    { bid: bidMeasurement({ fixtureId: "f1", bidId: "b1" }), gate: gateResult({ fixtureId: "f1", pass: true }) },
    { bid: bidMeasurement({ fixtureId: "f2", bidId: "b2" }), gate: gateResult({ fixtureId: "f2", pass: true }) },
    {
      bid: bidMeasurement({ fixtureId: "f3", bidId: "b3", findings: [excludedFinding] }),
      gate: gateResult({ fixtureId: "f3", pass: true, excludedDefects: [excludedFinding] }),
    },
    {
      bid: bidMeasurement({
        fixtureId: "f4",
        bidId: "b4",
        findings: [
          finding({ slide: 2, shape: "Text A", detail: "text overflow A" }),
          finding({ slide: 3, shape: "Text B", detail: "text overflow B" }),
          finding({ slide: 4, shape: "Text C", detail: "text overflow C" }),
        ],
      }),
      gate: gateResult({
        fixtureId: "f4",
        pass: false,
        breaches: [{ gate: "fail-findings", detail: "3 real fails" }],
      }),
    },
    {
      bid: bidMeasurement({
        fixtureId: "f5",
        bidId: "b5",
        measurement: { slideCount: 1, slideWidthPt: 1440, slideHeightPt: 810, shapes: [GROSS_SHAPE] },
        duplicates: [
          { a: "x", b: "y", slide: 3, similarity: 0.42 },
          { a: "p", b: "q", slide: 4, similarity: 0.35 },
        ],
      }),
      gate: gateResult({
        fixtureId: "f5",
        pass: false,
        breaches: [
          { gate: "gross-overflow", detail: "slide 1 Text 1: 216pt i 26pt inre box" },
          { gate: "duplicates", detail: "2 dup pairs" },
        ],
      }),
    },
  ];
}

describe("buildRunReport", () => {
  it("varv 1 utan previous: aggregat korrekt, delta null", () => {
    const report = buildRunReport({
      varv: 1,
      branchCommit: "abc123",
      results: varv1Results(),
      previous: null,
      costUsdRun: 12.34,
      costUsdAccumulated: 12.34,
    });

    expect(report.aggregate).toEqual({ passed: 3, total: 5, failFindings: 2, grossOverflows: 1, dupPairs: 1 });
    expect(report.delta).toBeNull();

    const f3 = report.bids.find((b) => b.fixtureId === "f3");
    expect(f3?.failCount).toBe(0); // FAIL finding present but excluded as known defect
    expect(f3?.gate.excludedDefects).toHaveLength(1);

    const f5 = report.bids.find((b) => b.fixtureId === "f5");
    expect(f5?.grossOverflowCount).toBe(1);
    expect(f5?.dupCount).toBe(1);
  });

  it("varv 2 med previous: deltan tecknade current − previous (failFindings 5→3 ⇒ delta −2)", () => {
    const previous: RunReport = {
      varv: 1,
      timestamp: "2026-07-15T10:00:00.000Z",
      branchCommit: "abc123",
      bids: [],
      aggregate: { passed: 2, total: 5, failFindings: 5, grossOverflows: 2, dupPairs: 1 },
      delta: null,
      costUsdRun: 10,
      costUsdAccumulated: 10,
    };

    const report = buildRunReport({
      varv: 2,
      branchCommit: "def456",
      results: varv2Results(),
      previous,
      costUsdRun: 8,
      costUsdAccumulated: 18,
    });

    expect(report.aggregate).toEqual({ passed: 3, total: 5, failFindings: 3, grossOverflows: 1, dupPairs: 2 });
    expect(report.delta).toEqual({ failFindings: -2, grossOverflows: -1, dupPairs: 1, passed: 1 });
  });
});

describe("renderMarkdown", () => {
  it("varv 1: rubrik, anbudsrader, ingen delta, kostnad, exkluderade malldefekter", () => {
    const report = buildRunReport({
      varv: 1,
      branchCommit: "abc123",
      results: varv1Results(),
      previous: null,
      costUsdRun: 12.34,
      costUsdAccumulated: 12.34,
    });
    const md = renderMarkdown(report);

    expect(md).toContain("3/5 PASS");
    expect(md).toContain("| f4 | test (b4) | FAIL | 2 | 0 | 0 | 10000 | fail-findings |");
    expect(md).toContain("| f5 | test (b5) | FAIL | 0 | 1 | 1 | 10000 | gross-overflow, duplicates |");
    expect(md).toContain("Inget föregående varv — ingen delta.");
    expect(md).toContain("$12.34 detta varv · $12.34 ack. av $50 tak.");
    expect(md).toContain("- [f3] slide 9 Text 5 (outside-slide): known template gap");
  });

  it("varv 2: delta-sektion med tecken och pilar, uppdaterad kostnad", () => {
    const previous: RunReport = {
      varv: 1,
      timestamp: "2026-07-15T10:00:00.000Z",
      branchCommit: "abc123",
      bids: [],
      aggregate: { passed: 2, total: 5, failFindings: 5, grossOverflows: 2, dupPairs: 1 },
      delta: null,
      costUsdRun: 10,
      costUsdAccumulated: 10,
    };

    const report = buildRunReport({
      varv: 2,
      branchCommit: "def456",
      results: varv2Results(),
      previous,
      costUsdRun: 8,
      costUsdAccumulated: 18,
    });
    const md = renderMarkdown(report);

    expect(md).toContain("# Varv 2 — 3/5 PASS");
    expect(md).toContain("- failFindings: -2 ▼");
    expect(md).toContain("- grossOverflows: -1 ▼");
    expect(md).toContain("- dupPairs: +1 ▲");
    expect(md).toContain("- passed: +1 ▲");
    expect(md).toContain("$8.00 detta varv · $18.00 ack. av $50 tak.");
  });
});
