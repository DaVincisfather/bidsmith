import { describe, expect, it } from "vitest";
import { applyBudgets, buildCalibrationSections } from "../calibrate";
import type { CalibrationTarget } from "../plan-targets";
import type { TemplateProfile } from "../../template-profile";

const target = (token: string, shareCount = 1): CalibrationTarget => ({
  token, marker: token.slice(1, -1), source: 1, shareCount, initialGuess: 300, geometryMissing: false,
});

describe("buildCalibrationSections", () => {
  it("builds one generic-prose section per target, marker-prefixed, at the shared candidate / shareCount", () => {
    const sections = buildCalibrationSections(
      [target("{A}", 2), target("{B}", 2)],
      new Map([["{A}", 400], ["{B}", 400]]),
    );
    expect(sections).toHaveLength(2);
    const a = sections[0];
    expect(a.content).toMatchObject({ format: "generic-prose", placeholder: "{A}" });
    if (a.content?.format === "generic-prose") {
      expect(a.content.text.startsWith("«A»")).toBe(true);
      expect(a.content.text).toHaveLength(200); // 400 / shareCount 2
    }
  });
});

describe("applyBudgets", () => {
  const profile: TemplateProfile = {
    profileVersion: 1, templateId: "t1", name: "T", version: 1,
    slides: [{
      source: 1, capability: "generic-prose",
      slots: [
        { placeholder: "{A}", capability: "generic-prose", format: "prose", intent: "", status: "generic" },
        { placeholder: "{Skip}", capability: "generic-prose", format: "prose", intent: "", status: "skip" },
      ],
    }],
  };

  it("sets budgetChars on matching slots and leaves others untouched", () => {
    const out = applyBudgets(profile, [
      { token: "{A}", budget: 440, rounds: 5, method: "measured", shortField: false, warnings: [] },
    ]);
    expect(out.slides[0].slots[0].budgetChars).toBe(440);
    expect(out.slides[0].slots[1].budgetChars).toBeUndefined();
  });

  it("does not mutate the input profile", () => {
    applyBudgets(profile, [{ token: "{A}", budget: 100, rounds: 1, method: "measured", shortField: false, warnings: [] }]);
    expect(profile.slides[0].slots[0].budgetChars).toBeUndefined();
  });
});
