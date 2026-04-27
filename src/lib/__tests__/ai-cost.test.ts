import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  calculateCostUsd,
  getModelPricing,
  _resetWarnedModelsForTests,
} from "@/lib/ai-cost";

describe("getModelPricing", () => {
  it("returns Sonnet 4.6 pricing", () => {
    const p = getModelPricing("claude-sonnet-4-6");
    expect(p.inputPerMTok).toBe(3);
    expect(p.outputPerMTok).toBe(15);
  });

  it("returns Opus 4.7 pricing", () => {
    const p = getModelPricing("claude-opus-4-7");
    expect(p.inputPerMTok).toBe(15);
    expect(p.outputPerMTok).toBe(75);
  });

  it("returns Opus 4.6 pricing", () => {
    const p = getModelPricing("claude-opus-4-6");
    expect(p.inputPerMTok).toBe(15);
    expect(p.outputPerMTok).toBe(75);
  });

  it("returns Haiku 4.5 pricing for the dated alias", () => {
    const p = getModelPricing("claude-haiku-4-5-20251001");
    expect(p.inputPerMTok).toBe(1);
    expect(p.outputPerMTok).toBe(5);
  });

  describe("unknown models", () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      _resetWarnedModelsForTests();
      warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    it("falls back to Sonnet pricing for unknown models", () => {
      const p = getModelPricing("claude-future-99");
      expect(p.inputPerMTok).toBe(3);
      expect(p.outputPerMTok).toBe(15);
    });

    it("warns once per unknown model", () => {
      getModelPricing("claude-future-99");
      getModelPricing("claude-future-99");
      getModelPricing("claude-future-99");
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain("claude-future-99");
    });

    it("warns separately for distinct unknown models", () => {
      getModelPricing("claude-future-99");
      getModelPricing("claude-mystery-1");
      expect(warnSpy).toHaveBeenCalledTimes(2);
    });
  });
});

describe("calculateCostUsd", () => {
  it("computes uncached input + output cost", () => {
    const cost = calculateCostUsd({
      model: "claude-sonnet-4-6",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
    expect(cost).toBeCloseTo(18, 4);
  });

  it("applies 0.1x rate for cache hits", () => {
    const cost = calculateCostUsd({
      model: "claude-sonnet-4-6",
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 1_000_000,
      cacheCreationTokens: 0,
    });
    expect(cost).toBeCloseTo(0.3, 4);
  });

  it("applies 1.25x rate for 5min cache writes", () => {
    const cost = calculateCostUsd({
      model: "claude-sonnet-4-6",
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(3.75, 4);
  });

  it("returns 0 for zero usage", () => {
    const cost = calculateCostUsd({
      model: "claude-sonnet-4-6",
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
    expect(cost).toBe(0);
  });
});
