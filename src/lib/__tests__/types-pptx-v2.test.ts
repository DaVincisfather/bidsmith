// @vitest-environment node
import { describe, it, expect } from "vitest";
import type { BidSectionContent } from "../types";

describe("BidSectionContent — v2-only union", () => {
  it("team-pricing accepts null timpris and null total", () => {
    const content: BidSectionContent = {
      format: "team-pricing",
      members: [{
        name: "Anna",
        role: "PL",
        omfattningPct: 50,
        timpris: null,
        timmar: 240,
        total: null,
      }],
    };
    expect(content.format).toBe("team-pricing");
    if (content.format === "team-pricing") {
      expect(content.members[0].timpris).toBeNull();
      expect(content.members[0].total).toBeNull();
    }
  });

  it("requirement-matrix-v2 carries per-consultant coverage", () => {
    const content: BidSectionContent = {
      format: "requirement-matrix-v2",
      rows: [{
        requirement: "5 års erfarenhet",
        hurUppfylls: "Anna och Erik har båda 10+ år",
        referens: "CV Anna, CV Erik",
        coverage: [
          { consultantName: "Anna", status: "JA", evidence: "12 år som PL" },
          { consultantName: "Erik", status: "DELVIS", evidence: "6 år" },
        ],
      }],
    };
    if (content.format === "requirement-matrix-v2") {
      expect(content.rows[0].coverage).toHaveLength(2);
    }
  });
});
