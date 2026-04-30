import { describe, it, expect } from "vitest";
import {
  judgeBidStructure,
  buildStructureEvalSummary,
  RUNTIME_MANDATORY_SECTIONS,
} from "../bid-structure";
import type { BidSection } from "@/lib/types";

function mkSection(format: string, key: string, content: object): BidSection {
  return {
    type: "ai",
    key,
    title: key,
    content: { format, ...content } as BidSection["content"],
    generatedAt: "2026-04-28T00:00:00Z",
  };
}

describe("judgeBidStructure", () => {
  it("passes when all mandatory sections present and slot formats valid", () => {
    const sections: BidSection[] = [
      mkSection("cover", "cover", { title: "T", client: "C", date: "D" }),
      mkSection("team-pricing", "team", { members: [{ name: "A", role: "R", omfattningPct: 50, timpris: 1000, timmar: 100, total: 100000 }] }),
    ];
    const judgments = judgeBidStructure(sections, ["cover", "team-pricing"]);
    const all = judgments.find((j) => j.field === "structure.all_sections_present");
    const slots = judgments.find((j) => j.field === "structure.slot_format_valid");
    const empty = judgments.find((j) => j.field === "structure.empty_fields");
    expect(all?.match).toBe(true);
    expect(slots?.match).toBe(true);
    expect(empty?.match).toBe(true);
  });

  it("fails all_sections_present when section missing", () => {
    const sections: BidSection[] = [
      mkSection("cover", "cover", { title: "T", client: "C", date: "D" }),
    ];
    const judgments = judgeBidStructure(sections, ["cover", "team-pricing"]);
    const all = judgments.find((j) => j.field === "structure.all_sections_present");
    expect(all?.match).toBe(false);
    expect(all?.evidence).toContain("team-pricing");
  });

  it("fails slot_format_valid when content has unknown format", () => {
    const sections: BidSection[] = [
      mkSection("legacy-format", "x", { foo: "bar" }),
    ];
    const judgments = judgeBidStructure(sections, ["x"]);
    const slots = judgments.find((j) => j.field === "structure.slot_format_valid");
    expect(slots?.match).toBe(false);
  });

  it("flags empty required text fields", () => {
    const sections: BidSection[] = [
      mkSection("cover", "cover", { title: "", client: "C", date: "D" }),
    ];
    const judgments = judgeBidStructure(sections, ["cover"]);
    const empty = judgments.find((j) => j.field === "structure.empty_fields");
    expect(empty?.match).toBe(false);
  });

  it("does not flag confidentiality.oslReference when empty", () => {
    const sections: BidSection[] = [
      mkSection("confidentiality", "confidentiality", {
        oslReference: "",
        secrecyRows: [],
      }),
    ];
    const judgments = judgeBidStructure(sections, ["confidentiality"]);
    const empty = judgments.find((j) => j.field === "structure.empty_fields");
    expect(empty?.match).toBe(true);
  });

  it("RUNTIME_MANDATORY_SECTIONS lists the 11 v2-template formats", () => {
    expect(RUNTIME_MANDATORY_SECTIONS).toHaveLength(11);
    expect(RUNTIME_MANDATORY_SECTIONS).toContain("cover");
    expect(RUNTIME_MANDATORY_SECTIONS).toContain("understanding-current");
    expect(RUNTIME_MANDATORY_SECTIONS).toContain("certifications");
  });
});

describe("buildStructureEvalSummary", () => {
  it("returns pass=true and per-field match when all judgments match", () => {
    const sections: BidSection[] = [
      mkSection("cover", "cover", { title: "T", client: "C", date: "D" }),
    ];
    const judgments = judgeBidStructure(sections, ["cover"]);
    const summary = buildStructureEvalSummary(judgments);
    expect(summary.pass).toBe(true);
    expect(summary.fields["structure.all_sections_present"].match).toBe(true);
    expect(summary.fields["structure.slot_format_valid"].match).toBe(true);
    expect(summary.fields["structure.empty_fields"].match).toBe(true);
    expect(summary.evaluatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("returns pass=false when any judgment fails", () => {
    const sections: BidSection[] = [
      mkSection("cover", "cover", { title: "", client: "C", date: "D" }),
    ];
    const judgments = judgeBidStructure(sections, ["cover"]);
    const summary = buildStructureEvalSummary(judgments);
    expect(summary.pass).toBe(false);
    expect(summary.fields["structure.empty_fields"].match).toBe(false);
    expect(summary.fields["structure.empty_fields"].evidence).toContain("cover.title");
  });
});
