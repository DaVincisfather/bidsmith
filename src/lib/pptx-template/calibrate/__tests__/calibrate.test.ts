import { describe, expect, it } from "vitest";
import { applyBudgets, buildCalibrationSections, buildSlotResult } from "../calibrate";
import type { SearchState } from "../binary-search";
import type { CalibrationTarget } from "../plan-targets";
import type { TemplateProfile } from "../../template-profile";

const target = (token: string, shareCount = 1, initialGuess = 300): CalibrationTarget => ({
  token, marker: token.slice(1, -1), source: 1, shareCount, initialGuess, geometryMissing: false,
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

describe("buildSlotResult", () => {
  const doneState = (lo: number, overrides: Partial<SearchState> = {}): SearchState => ({
    lo, hi: lo + 20, candidate: lo, done: true, rounds: 5, alwaysOverflowed: false, everFit: true,
    ...overrides,
  });

  it("unmeasured shared slot keeps the per-slot guess — no second shareCount division", () => {
    // Regression: initialGuess is ALREADY per-slot (capacity/shareCount from
    // planTargets); the old code divided by shareCount again → 100 instead of 200.
    const r = buildSlotResult(target("{A}", 2, 200), doneState(400), false);
    expect(r.budget).toBe(200);
    expect(r.method).toBe("geometry-fallback");
  });

  it("measured shared slot splits the shape budget evenly: finalBudget 400 / shareCount 2 → 200", () => {
    const r = buildSlotResult(target("{A}", 2, 200), doneState(400), true);
    expect(r.budget).toBe(200);
    expect(r.method).toBe("measured");
  });

  it("warns 'marker never measured' only on unmeasured slots", () => {
    const unmeasured = buildSlotResult(target("{A}"), doneState(400), false);
    expect(unmeasured.warnings).toContain("marker never measured — geometry fallback");
    const measured = buildSlotResult(target("{A}"), doneState(400), true);
    expect(measured.warnings).not.toContain("marker never measured — geometry fallback");
  });

  it("emits the min-budget warning only when done && alwaysOverflowed", () => {
    const provenNeverFit = buildSlotResult(
      target("{A}"),
      { lo: 30, hi: 30, candidate: 30, done: true, rounds: 6, alwaysOverflowed: true, everFit: false },
      true,
    );
    expect(provenNeverFit.warnings).toContain("overflowed at minimum budget — box likely tiny or decorative");

    // Unconverged (hit maxRounds, not done): transiently alwaysOverflowed, but
    // not proven-never-fit — must NOT carry the warning.
    const unconverged = buildSlotResult(
      target("{A}"),
      { lo: 30, hi: 200, candidate: 115, done: false, rounds: 8, alwaysOverflowed: true, everFit: false },
      true,
    );
    expect(unconverged.warnings).not.toContain("overflowed at minimum budget — box likely tiny or decorative");
  });
});
