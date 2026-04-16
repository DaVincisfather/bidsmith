import { describe, it, expect } from "vitest";
import { setMetrics, hitAtK, aggregateMhc, meanMetric } from "../metrics";

describe("setMetrics", () => {
  it("returns 1.0 for perfect match", () => {
    const r = setMetrics({ goldenMatches: 3, outputMatches: 3, goldenTotal: 3, outputTotal: 3 });
    expect(r.recall).toBe(1);
    expect(r.precision).toBe(1);
    expect(r.f1).toBe(1);
  });

  it("computes recall=2/3, precision=2/4 for partial", () => {
    const r = setMetrics({ goldenMatches: 2, outputMatches: 2, goldenTotal: 3, outputTotal: 4 });
    expect(r.recall).toBeCloseTo(2 / 3);
    expect(r.precision).toBeCloseTo(0.5);
    expect(r.f1).toBeCloseTo((2 * (2 / 3) * 0.5) / ((2 / 3) + 0.5));
  });

  it("returns zeros when both totals are zero", () => {
    const r = setMetrics({ goldenMatches: 0, outputMatches: 0, goldenTotal: 0, outputTotal: 0 });
    expect(r.recall).toBe(1);   // vacuous truth
    expect(r.precision).toBe(1);
    expect(r.f1).toBe(1);
  });

  it("returns 0 precision when output has items but none match", () => {
    const r = setMetrics({ goldenMatches: 0, outputMatches: 0, goldenTotal: 2, outputTotal: 3 });
    expect(r.recall).toBe(0);
    expect(r.precision).toBe(0);
    expect(r.f1).toBe(0);
  });
});

describe("hitAtK", () => {
  it("returns 1 when all must-contain are in top-K", () => {
    const r = hitAtK({ ranked: ["a", "b", "c", "d"], k: 2, mustContain: ["a", "b"] });
    expect(r).toBe(1);
  });

  it("returns 0 when any must-contain is missing from top-K", () => {
    const r = hitAtK({ ranked: ["a", "c", "b", "d"], k: 2, mustContain: ["a", "b"] });
    expect(r).toBe(0);
  });

  it("handles k larger than list", () => {
    const r = hitAtK({ ranked: ["a"], k: 3, mustContain: ["a"] });
    expect(r).toBe(1);
  });
});

describe("aggregateMhc", () => {
  it("computes per-consultant coverage and overall mean", () => {
    const r = aggregateMhc([
      { consultantId: "anna", requirement: "r1", demonstrated: true },
      { consultantId: "anna", requirement: "r2", demonstrated: true },
      { consultantId: "anna", requirement: "r3", demonstrated: false },
      { consultantId: "bertil", requirement: "r1", demonstrated: true },
      { consultantId: "bertil", requirement: "r2", demonstrated: false },
      { consultantId: "bertil", requirement: "r3", demonstrated: false },
    ]);
    expect(r.perConsultant["anna"]).toBeCloseTo(2 / 3);
    expect(r.perConsultant["bertil"]).toBeCloseTo(1 / 3);
    expect(r.mean).toBeCloseTo(0.5);
  });

  it("returns passThreshold=false when any consultant below threshold", () => {
    const r = aggregateMhc([
      { consultantId: "anna", requirement: "r1", demonstrated: true },
      { consultantId: "bertil", requirement: "r1", demonstrated: false },
    ], 0.8);
    expect(r.passThreshold).toBe(false);
  });

  it("returns passThreshold=true when all consultants meet threshold", () => {
    const r = aggregateMhc([
      { consultantId: "anna", requirement: "r1", demonstrated: true },
      { consultantId: "bertil", requirement: "r1", demonstrated: true },
    ], 0.8);
    expect(r.passThreshold).toBe(true);
  });
});

describe("meanMetric", () => {
  it("averages a metric across fixtures, skipping missing", () => {
    const r = meanMetric([
      { "requirements.f1": 0.8 },
      { "requirements.f1": 0.6 },
      { "other": 0.9 },
    ], "requirements.f1");
    expect(r).toBeCloseTo(0.7);
  });

  it("returns 0 when no fixture has the metric", () => {
    const r = meanMetric([{ "other": 0.5 }], "missing");
    expect(r).toBe(0);
  });
});
