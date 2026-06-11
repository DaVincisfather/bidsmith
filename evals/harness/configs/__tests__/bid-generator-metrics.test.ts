import { describe, it, expect } from "vitest";
import { computeBidGeneratorMetrics } from "../bid-generator";

describe("overflow-metrik", () => {
  it("overflow.pass = 0 när overflowFlags finns, 1 annars", () => {
    const judgments: never[] = [];
    expect(computeBidGeneratorMetrics(judgments, 2)["overflow.pass"]).toBe(0);
    expect(computeBidGeneratorMetrics(judgments, 2)["overflow.count"]).toBe(2);
    expect(computeBidGeneratorMetrics(judgments, 0)["overflow.pass"]).toBe(1);
  });
});
