import { describe, it, expect, vi } from "vitest";
import type { BidSection } from "@/lib/types";
import { computeBidGeneratorMetrics, computeBidGeneratorAggregate } from "../bid-generator";
import type { FieldJudgment } from "../../core/types";

describe("computeBidGeneratorMetrics", () => {
  it("emits structure.pass=1 when all three structure judgments pass", () => {
    const judgments: FieldJudgment[] = [
      { field: "structure.all_sections_present", judge: "exact", match: true, golden: [], actual: [] },
      { field: "structure.slot_format_valid", judge: "exact", match: true, golden: [], actual: [] },
      { field: "structure.empty_fields", judge: "exact", match: true, golden: 0, actual: 0 },
    ];
    const m = computeBidGeneratorMetrics(judgments);
    expect(m["structure.all_sections_present"]).toBe(1);
    expect(m["structure.slot_format_valid"]).toBe(1);
    expect(m["structure.empty_fields"]).toBe(1);
    expect(m["structure.pass"]).toBe(1);
  });

  it("emits structure.pass=0 when any structure judgment fails", () => {
    const judgments: FieldJudgment[] = [
      { field: "structure.all_sections_present", judge: "exact", match: false, golden: [], actual: [] },
      { field: "structure.slot_format_valid", judge: "exact", match: true, golden: [], actual: [] },
      { field: "structure.empty_fields", judge: "exact", match: true, golden: 0, actual: 0 },
    ];
    const m = computeBidGeneratorMetrics(judgments);
    expect(m["structure.pass"]).toBe(0);
  });
});

describe("computeBidGeneratorAggregate", () => {
  it("returns mean per metric across fixtures", () => {
    const agg = computeBidGeneratorAggregate([
      { "structure.pass": 1 },
      { "structure.pass": 0 },
    ]);
    expect(agg["structure.pass.mean"]).toBe(0.5);
  });
});

describe("computeBidGeneratorMetrics — coverage", () => {
  it("emits coverage.recall as fraction of demonstrated requirements", () => {
    const judgments: FieldJudgment[] = [
      { field: "structure.all_sections_present", judge: "exact", match: true, golden: [], actual: [] },
      { field: "structure.slot_format_valid", judge: "exact", match: true, golden: [], actual: [] },
      { field: "structure.empty_fields", judge: "exact", match: true, golden: 0, actual: 0 },
      { field: "coverage.req_0", judge: "bid-coverage", match: true, golden: {}, actual: "" },
      { field: "coverage.req_1", judge: "bid-coverage", match: false, golden: {}, actual: "" },
      { field: "coverage.req_2", judge: "bid-coverage", match: true, golden: {}, actual: "" },
    ];
    const m = computeBidGeneratorMetrics(judgments);
    expect(m["coverage.recall"]).toBeCloseTo(2 / 3, 5);
  });
});

describe("computeBidGeneratorMetrics — hallucination", () => {
  it("emits hallucination.pass=1 and count=0 when judge passes", () => {
    const judgments: FieldJudgment[] = [
      { field: "hallucination", judge: "bid-hallucination", match: true, golden: {}, actual: [
        { claim: "x", supported: true, evidence: "y" },
      ] },
    ];
    const m = computeBidGeneratorMetrics(judgments);
    expect(m["hallucination.pass"]).toBe(1);
    expect(m["hallucination.count"]).toBe(0);
  });

  it("emits hallucination.count > 0 when unsupported claims present", () => {
    const judgments: FieldJudgment[] = [
      { field: "hallucination", judge: "bid-hallucination", match: false, golden: {}, actual: [
        { claim: "x", supported: false, evidence: "y" },
        { claim: "z", supported: true, evidence: "w" },
      ] },
    ];
    const m = computeBidGeneratorMetrics(judgments);
    expect(m["hallucination.pass"]).toBe(0);
    expect(m["hallucination.count"]).toBe(1);
  });
});
