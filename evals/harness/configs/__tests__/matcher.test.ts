import { describe, it, expect } from "vitest";
import {
  matcherConfig,
  computeMatcherMetrics,
  computeMatcherAggregate,
} from "../matcher";
import type { FieldJudgment } from "../../core/types";

describe("matcherConfig", () => {
  it("declares correct module + mode + fixtureDir", () => {
    expect(matcherConfig.module).toBe("matcher");
    expect(matcherConfig.mode).toBe("isolated");
    expect(matcherConfig.fixtureDir).toContain("evals/fixtures/matcher");
  });
});

describe("computeMatcherMetrics", () => {
  it("extracts MHC per-consultant + mean + pass/fail", () => {
    const judgments: FieldJudgment[] = [
      { field: "mhc.anna_svensson.Kompetens", judge: "sonnet-mhc", match: true, golden: {}, actual: "" },
      { field: "mhc.anna_svensson.Språk", judge: "sonnet-mhc", match: true, golden: {}, actual: "" },
      { field: "mhc.cecilia_berg.Kompetens", judge: "sonnet-mhc", match: true, golden: {}, actual: "" },
      { field: "mhc.cecilia_berg.Språk", judge: "sonnet-mhc", match: false, golden: {}, actual: "" },
      { field: "hit_at_k", judge: "exact", match: true, golden: ["anna_svensson", "cecilia_berg"], actual: ["anna_svensson", "cecilia_berg"] },
      { field: "reasoning.anna_svensson", judge: "haiku-equiv", match: true, golden: "good", actual: "good" },
      { field: "reasoning.cecilia_berg", judge: "haiku-equiv", match: false, golden: "good", actual: "weak" },
    ];
    const metrics = computeMatcherMetrics(judgments, 0.8);

    expect(metrics["mhc.anna_svensson"]).toBe(1);
    expect(metrics["mhc.cecilia_berg"]).toBeCloseTo(0.5);
    expect(metrics["mhc.mean"]).toBeCloseTo(0.75);
    expect(metrics["mhc.pass"]).toBe(0);   // cecilia 0.5 < 0.8
    expect(metrics["hit_at_k"]).toBe(1);
    expect(metrics["reasoning.good_ratio"]).toBeCloseTo(0.5);
  });
});

describe("computeMatcherAggregate", () => {
  it("averages across fixtures", () => {
    const agg = computeMatcherAggregate([
      { "mhc.mean": 0.9, "hit_at_k": 1, "mhc.pass": 1 },
      { "mhc.mean": 0.6, "hit_at_k": 1, "mhc.pass": 0 },
    ]);
    expect(agg["mhc.mean.mean"]).toBeCloseTo(0.75);
    expect(agg["hit_at_k.mean"]).toBe(1);
    expect(agg["mhc.pass.mean"]).toBe(0.5);
  });
});
