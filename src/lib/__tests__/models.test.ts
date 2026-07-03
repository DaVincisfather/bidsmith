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
      "radar", "writing", "writingSupport", "writingGeneric", "writingChallenger", "judge",
    ] as const;
    for (const role of roles) {
      expect(MODELS[role]).toMatch(/^claude-/);
    }
  });

  it("skrivande roll är Opus 4.8 tills A/B-test (fas 1) säger annat", () => {
    expect(MODELS.writing).toBe("claude-opus-4-8");
    expect(MODELS.writingChallenger).toBe("claude-fable-5");
  });

  it("judge ligger MEDVETET kvar på 4-6 — blindfacit-kalibreringen gjordes mot den", () => {
    // Fas 1:s 8 människomärkta par validerade 4-6-judgen. En ny judge-modell
    // kräver omkalibrering innan tally får beslutsvikt — byt inte i smyg via en
    // svepande uppgradering (Sonnet 5-bytet 2026-07-03 lämnade denna avsiktligt).
    expect(MODELS.judge).toBe("claude-sonnet-4-6");
  });

  it("BIDSMITH_WRITING_MODEL överstyr writing-rollen (för eval:bid-compare)", async () => {
    vi.stubEnv("BIDSMITH_WRITING_MODEL", "claude-fable-5");
    vi.resetModules();
    const { MODELS: overridden } = await import("@/lib/models");
    expect(overridden.writing).toBe("claude-fable-5");
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("tom BIDSMITH_WRITING_MODEL faller tillbaka till defaulten (|| — inte ??)", async () => {
    vi.stubEnv("BIDSMITH_WRITING_MODEL", "");
    vi.resetModules();
    const { MODELS: overridden } = await import("@/lib/models");
    expect(overridden.writing).toBe("claude-opus-4-8");
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("overriden är NODE_ENV-gatad — kvarglömd env-var i produktion byter inte skrivmodell", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BIDSMITH_WRITING_MODEL", "claude-fable-5");
    vi.resetModules();
    const { MODELS: overridden } = await import("@/lib/models");
    expect(overridden.writing).toBe("claude-opus-4-8");
    vi.unstubAllEnvs();
    vi.resetModules();
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
