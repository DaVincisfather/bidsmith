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

  it("returns Opus 4.8 pricing", () => {
    const p = getModelPricing("claude-opus-4-8");
    expect(p.inputPerMTok).toBe(5);
    expect(p.outputPerMTok).toBe(25);
  });

  it("prissätter claude-fable-5", () => {
    expect(getModelPricing("claude-fable-5")).toEqual({ inputPerMTok: 10, outputPerMTok: 50 });
  });

  it("returns Opus 4.7 pricing", () => {
    const p = getModelPricing("claude-opus-4-7");
    expect(p.inputPerMTok).toBe(5);
    expect(p.outputPerMTok).toBe(25);
  });

  it("prissätter claude-opus-5 som Opus 4.8 — samma tier, inget pristillägg", () => {
    // Ligger här före ett eventuellt rollbyte så att bytet blir en rad i
    // MODELS i stället för en rad här också.
    expect(getModelPricing("claude-opus-5")).toEqual({ inputPerMTok: 5, outputPerMTok: 25 });
  });

  it("håller Sonnet 5 på $2/$10 — den planerade höjningen ställdes in", () => {
    // Raden bar tidigare en påminnelse om att bumpa till $3/$15 efter
    // 2026-08-31. Anthropic har meddelat att $2/$10 blivit standardpriset och
    // att höjningen inte sker; en "bump" hade överskattat kostnaderna 1,5×.
    // Verifierat mot platform.claude.com/docs/en/about-claude/pricing 2026-08-11.
    expect(getModelPricing("claude-sonnet-5")).toEqual({ inputPerMTok: 2, outputPerMTok: 10 });
  });

  it("returns Opus 4.6 pricing", () => {
    const p = getModelPricing("claude-opus-4-6");
    expect(p.inputPerMTok).toBe(5);
    expect(p.outputPerMTok).toBe(25);
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
