import { expect, it } from "vitest";
import { composeMeasuredProfile } from "../compose-measured-profile";
import type { TemplateProfile } from "../../template-profile";
import type { CalibrationReport } from "../../calibrate/calibrate";

const profile: TemplateProfile = {
  profileVersion: 1, templateId: "t1", name: "T", version: 1,
  slides: [{ source: 1, slots: [
    { placeholder: "{A}", capability: "generic-prose", format: "prose", intent: "", status: "generic" },
  ] }],
  knownDefects: [{ slide: 2, checkId: "vertical-overflow", shape: "Text 36", note: "gammal", suggestion: "s", status: "accepted" }],
};
const report: CalibrationReport = {
  templateId: "t1", rounds: 6, unresolved: ["{U}"],
  results: [{ token: "{A}", budget: 120, rounds: 5, method: "measured", shortField: false, singleLine: true, warnings: ["single-line box — budget capped at one line (130 chars)"], signals: [] }],
};

it("composes budgets, measurement and merged defects without mutating input", () => {
  const out = composeMeasuredProfile(profile, report, [
    { slide: 2, checkId: "vertical-overflow", shape: "Text 36", note: "tom originalmall" },
    { slide: 4, checkId: "gross-overflow", shape: "Text 5", note: "tom originalmall", baselineBoundHeightPt: 82.8 },
  ], "2026-07-19T12:00:00Z");
  expect(out.slides[0].slots[0].budgetChars).toBe(120);
  expect(out.slides[0].slots[0].singleLine).toBe(true);
  expect(out.measurement).toEqual({
    status: "complete", measuredAt: "2026-07-19T12:00:00Z", calibrationRounds: 6,
    unresolved: ["{U}"], slotWarnings: { "{A}": ["single-line box — budget capped at one line (130 chars)"] },
  });
  expect(out.knownDefects?.find((d) => d.shape === "Text 36")?.status).toBe("accepted");
  expect(out.knownDefects?.find((d) => d.shape === "Text 5")?.status).toBe("open");
  expect(out.knownDefects?.every((d) => d.suggestion.length > 10)).toBe(true);
  expect(profile.measurement).toBeUndefined();
});
