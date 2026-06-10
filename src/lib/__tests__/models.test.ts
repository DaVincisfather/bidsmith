import { describe, it, expect, vi, beforeEach } from "vitest";
import { MODELS } from "@/lib/models";
import { getModelPricing, _resetWarnedModelsForTests } from "@/lib/ai-cost";

describe("MODELS registry", () => {
  beforeEach(() => {
    // getModelPricing varnar bara en gång per modell — nollställ så att
    // fallback-testet nedan inte påverkas av tidigare körda tester.
    _resetWarnedModelsForTests();
  });

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

  it("varje modell i registryt har en egen prisrad (ingen fallback)", () => {
    // getModelPricing loggar varning + faller tillbaka på Sonnet-pris för okända
    // modeller — registryt får aldrig peka på en modell utan prisrad.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const model of new Set(Object.values(MODELS))) {
      getModelPricing(model);
    }
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
