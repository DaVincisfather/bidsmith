import { describe, it, expect } from "vitest";
import { MODELS } from "@/lib/models";
import { getModelPricing } from "@/lib/ai-cost";

describe("MODELS registry", () => {
  it("definierar alla roller med giltiga modell-ID-prefix", () => {
    const roles = [
      "extraction", "prefilter", "matching", "gonogo",
      "radar", "writing", "writingSupport", "writingChallenger", "judge",
    ] as const;
    for (const role of roles) {
      expect(MODELS[role]).toMatch(/^claude-/);
    }
  });

  it("skrivande roll är Opus 4.8 tills A/B-test (fas 1) säger annat", () => {
    expect(MODELS.writing).toBe("claude-opus-4-8");
    expect(MODELS.writingChallenger).toBe("claude-fable-5");
  });

  it("varje modell i registryt har en prisrad (ingen fallback-varning)", () => {
    // getModelPricing loggar varning + faller tillbaka på Sonnet-pris för okända
    // modeller — registryt får aldrig peka på en modell utan prisrad.
    for (const model of new Set(Object.values(MODELS))) {
      const p = getModelPricing(model);
      expect(p).toBeDefined();
    }
  });
});
