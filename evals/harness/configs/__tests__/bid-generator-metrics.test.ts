import { describe, it, expect } from "vitest";
import { computeBidGeneratorMetrics } from "../bid-generator";
import type { FieldJudgment } from "../../core/types";

describe("overflow-metrik", () => {
  it("overflow.pass = 0 när overflowFlags finns, 1 annars", () => {
    const judgments: never[] = [];
    expect(computeBidGeneratorMetrics(judgments, 2)["overflow.pass"]).toBe(0);
    expect(computeBidGeneratorMetrics(judgments, 2)["overflow.count"]).toBe(2);
    expect(computeBidGeneratorMetrics(judgments, 0)["overflow.pass"]).toBe(1);
  });
});

describe("hallucination-metrik — count och pass följer samma allowlist", () => {
  it("allowlistade claims räknas inte i hallucination.count", () => {
    const judgments: FieldJudgment[] = [{
      field: "hallucination",
      judge: "bid-hallucination",
      match: true, // pass efter allowlist-filtret i judgen
      golden: null,
      actual: [
        { claim: "Anbudsdatum är 2026-06-11", supported: false, evidence: "inte i källa" },
        { claim: "Konsulten har 12 års erfarenhet", supported: true, evidence: "CV" },
      ],
    }];
    const metrics = computeBidGeneratorMetrics(judgments, 0, ["anbudsdatum"]);
    expect(metrics["hallucination.pass"]).toBe(1);
    expect(metrics["hallucination.count"]).toBe(0);
  });
});
