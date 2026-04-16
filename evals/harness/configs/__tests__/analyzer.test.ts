import { describe, it, expect } from "vitest";
import { analyzerConfig, computeAnalyzerMetrics, computeAnalyzerAggregate } from "../analyzer";
import type { FieldJudgment } from "../../core/types";

describe("analyzerConfig", () => {
  it("declares correct module + fixtureDir", () => {
    expect(analyzerConfig.module).toBe("analyzer");
    expect(analyzerConfig.fixtureDir).toContain("evals/fixtures/analyzer");
  });
});

describe("computeAnalyzerMetrics", () => {
  it("aggregates requirement judgments into recall/precision/F1", () => {
    const judgments: FieldJudgment[] = [
      { field: "title", judge: "haiku-equiv", match: true, golden: "T", actual: "T" },
      { field: "client", judge: "exact", match: true, golden: "C", actual: "C" },
      // 3 golden reqs: 2 matched, 1 missing. Output also had 2 — both matched.
      { field: "requirements[0]", judge: "haiku-equiv", match: true, golden: "r1", actual: "o1" },
      { field: "requirements[1]", judge: "haiku-equiv", match: true, golden: "r2", actual: "o2" },
      { field: "requirements[2]", judge: "haiku-equiv", match: false, golden: "r3", actual: null },
    ];
    const metrics = computeAnalyzerMetrics(judgments, { goldenCounts: { requirements: 3 }, outputCounts: { requirements: 2 } });

    expect(metrics["title"]).toBe(1);
    expect(metrics["client"]).toBe(1);
    expect(metrics["requirements.recall"]).toBeCloseTo(2 / 3);
    expect(metrics["requirements.precision"]).toBe(1);
    expect(metrics["requirements.f1"]).toBeCloseTo((2 * (2 / 3) * 1) / ((2 / 3) + 1));
  });
});

describe("computeAnalyzerAggregate", () => {
  it("averages per-fixture metrics", () => {
    const agg = computeAnalyzerAggregate([
      { "requirements.f1": 0.8, "title": 1 },
      { "requirements.f1": 0.6, "title": 0 },
    ]);
    expect(agg["requirements.f1.mean"]).toBeCloseTo(0.7);
    expect(agg["title.mean"]).toBe(0.5);
  });
});
