import { describe, expect, it } from "vitest";
import {
  acceptAllDefects, acceptDefect, activationBlockReason, annotateKnownDefects,
  dedupeDefects, defectSuggestion, mergeDefectAccepts,
} from "../template-defects";
import type { TemplateDefect, TemplateProfile } from "../../template-profile";
import type { Finding } from "../types";

const defect = (over: Partial<TemplateDefect> = {}): TemplateDefect => ({
  slide: 2, checkId: "vertical-overflow", shape: "Text 36",
  note: "tom originalmall", suggestion: "s", status: "open", ...over,
});

describe("dedupeDefects", () => {
  it("keeps the FIRST entry per slide|checkId|shape", () => {
    const out = dedupeDefects([defect({ note: "a" }), defect({ note: "b" }), defect({ shape: "Text 1" })]);
    expect(out).toHaveLength(2);
    expect(out[0].note).toBe("a");
  });
});

describe("mergeDefectAccepts", () => {
  it("carries accepted status onto matching signatures, drops vanished, keeps new open", () => {
    const prev = [defect({ status: "accepted" }), defect({ shape: "Borta", status: "accepted" })];
    const next = [defect(), defect({ shape: "Ny" })];
    const out = mergeDefectAccepts(prev, next);
    expect(out.find((d) => d.shape === "Text 36")?.status).toBe("accepted");
    expect(out.find((d) => d.shape === "Ny")?.status).toBe("open");
    expect(out.some((d) => d.shape === "Borta")).toBe(false);
  });
  it("treats undefined previous as all-open", () => {
    expect(mergeDefectAccepts(undefined, [defect()])[0].status).toBe("open");
  });
});

describe("acceptDefect", () => {
  it("marks the matching signature accepted, immutably", () => {
    const input = [defect()];
    const res = acceptDefect(input, { slide: 2, checkId: "vertical-overflow", shape: "Text 36" });
    if (!res.ok) throw new Error("expected ok");
    expect(res.defects[0].status).toBe("accepted");
    expect(input[0].status).toBe("open");
  });
  it("errors on an unknown signature", () => {
    const res = acceptDefect([defect()], { slide: 9, checkId: "outside-slide", shape: "X" });
    expect(res.ok).toBe(false);
  });
});

describe("acceptAllDefects", () => {
  it("flips every open defect to accepted, immutably, and keeps accepted ones", () => {
    const input = [defect(), defect({ shape: "Text 1" }), defect({ shape: "Klar", status: "accepted" })];
    const out = acceptAllDefects(input);
    expect(out.every((d) => d.status === "accepted")).toBe(true);
    expect(input[0].status).toBe("open");
  });
  it("returns an empty list unchanged", () => {
    expect(acceptAllDefects([])).toEqual([]);
  });
});

describe("annotateKnownDefects", () => {
  const finding = (over: Partial<Finding> = {}): Finding => ({
    checkId: "vertical-overflow", severity: "WARN", slide: 2, shape: "Text 36", detail: "text 43.2pt > box 26pt", ...over,
  });
  it("downgrades hits on ACCEPTED signatures to INFO with prefix", () => {
    const out = annotateKnownDefects([finding()], [defect({ status: "accepted" })]);
    expect(out[0].severity).toBe("INFO");
    expect(out[0].detail).toContain("känd malldefekt");
  });
  it("leaves open-defect hits and non-matching findings untouched", () => {
    const out = annotateKnownDefects([finding(), finding({ slide: 5 })], [defect({ status: "open" })]);
    expect(out.every((f) => f.severity === "WARN")).toBe(true);
  });
  it("lets a gross-overflow defect annotate a vertical-overflow finding on same slide+shape", () => {
    const out = annotateKnownDefects([finding()], [defect({ checkId: "gross-overflow", status: "accepted" })]);
    expect(out[0].severity).toBe("INFO");
  });
});

describe("activationBlockReason", () => {
  const foreignProfile = (over: Partial<TemplateProfile> = {}): TemplateProfile => ({
    profileVersion: 1, templateId: "t1", name: "T", version: 1,
    slides: [{ source: 1, capability: "generic-prose", slots: [{ placeholder: "{A}", capability: "generic-prose", format: "prose", intent: "", status: "generic" }] }],
    ...over,
  });
  it("blocks an unmeasured foreign profile", () => {
    expect(activationBlockReason(foreignProfile())).toMatch(/onboarding:measure/);
  });
  it("blocks when open defects remain, mentioning the count", () => {
    const p = foreignProfile({
      measurement: { status: "complete", measuredAt: "x", calibrationRounds: 1, unresolved: [], slotWarnings: {} },
      knownDefects: [defect(), defect({ shape: "Text 1" })],
    });
    expect(activationBlockReason(p)).toMatch(/2/);
  });
  it("passes measured + fully addressed", () => {
    const p = foreignProfile({
      measurement: { status: "complete", measuredAt: "x", calibrationRounds: 1, unresolved: [], slotWarnings: {} },
      knownDefects: [defect({ status: "accepted" })],
    });
    expect(activationBlockReason(p)).toBeNull();
  });
  it("passes a non-foreign (bundled) profile with no measurement", () => {
    const p: TemplateProfile = {
      profileVersion: 1, templateId: "t1", name: "T", version: 1,
      slides: [{
        source: 1, capability: "cover",
        slots: [{ placeholder: "{Title}", capability: "cover", format: "prose", intent: "bid title", status: "mapped" }],
      }],
    };
    expect(activationBlockReason(p)).toBeNull();
  });
});

describe("defectSuggestion", () => {
  it("produces Swedish guidance per checkId carrying the measured detail", () => {
    for (const id of ["outside-slide", "vertical-overflow", "gross-overflow", "horizontal-clip"]) {
      const s = defectSuggestion(id, "text 43.2pt > box 26pt");
      expect(s.length).toBeGreaterThan(10);
      expect(s).toContain("text 43.2pt > box 26pt");
    }
  });
});
