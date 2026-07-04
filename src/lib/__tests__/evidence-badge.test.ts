import { describe, it, expect } from "vitest";
import { hasEvidence, hasAnyEvidence, badgeState } from "@/lib/evidence-badge";

describe("evidence-badge — gate-logik", () => {
  describe("hasEvidence", () => {
    it("räknar en icke-tom sträng som evidens", () => {
      expect(hasEvidence("citat")).toBe(true);
    });
    it("räknar undefined/null/tom/whitespace som obelagd", () => {
      expect(hasEvidence(undefined)).toBe(false);
      expect(hasEvidence(null)).toBe(false);
      expect(hasEvidence("")).toBe(false);
      expect(hasEvidence("   ")).toBe(false);
    });
  });

  describe("hasAnyEvidence (legacy-grinden)", () => {
    it("true när minst en post bär evidens", () => {
      expect(
        hasAnyEvidence([{ evidence: undefined }, { evidence: "citat" }]),
      ).toBe(true);
    });
    it("false när ingen post bär evidens (legacy-analys)", () => {
      expect(
        hasAnyEvidence([{ evidence: undefined }, { evidence: null }, {}]),
      ).toBe(false);
    });
    it("false för tom lista", () => {
      expect(hasAnyEvidence([])).toBe(false);
    });
  });

  describe("badgeState", () => {
    it("'none' oavsett evidens när grinden är stängd", () => {
      expect(badgeState("citat", false)).toBe("none");
      expect(badgeState(undefined, false)).toBe("none");
    });
    it("'kalla' för belagd post när grinden är öppen", () => {
      expect(badgeState("citat", true)).toBe("kalla");
    });
    it("'flagged' för obelagd post när grinden är öppen", () => {
      expect(badgeState(undefined, true)).toBe("flagged");
      expect(badgeState(null, true)).toBe("flagged");
    });
  });
});
