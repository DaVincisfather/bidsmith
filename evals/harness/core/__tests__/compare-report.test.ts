import { describe, it, expect } from "vitest";
import { renderReportMd, pickBlindPairs } from "../compare-report";

describe("pickBlindPairs", () => {
  it("väljer N par deterministiskt givet seed och anonymiserar ordningen", () => {
    const pairs = [
      { pairFile: "f1-rep1.json", fixtureId: "f1", sectionType: "phases", textA: "a1", textB: "b1" },
      { pairFile: "f1-rep2.json", fixtureId: "f1", sectionType: "phases", textA: "a2", textB: "b2" },
      { pairFile: "f2-rep1.json", fixtureId: "f2", sectionType: "quality-assurance", textA: "a3", textB: "b3" },
    ];
    const r1 = pickBlindPairs(pairs, 2, 42);
    const r2 = pickBlindPairs(pairs, 2, 42);
    expect(r1.map((p) => p.id)).toEqual(r2.map((p) => p.id)); // reproducerbart
    expect(r1).toHaveLength(2);
    for (const p of r1) {
      expect(["A-först", "B-först"]).toContain(p.facit.ordning);
      expect(["f1", "f2"]).toContain(p.fixtureId); // FFU:n följer med till granskaren
      expect(p.utkast1).not.toBe("");
      expect(p.utkast2).not.toBe("");
    }
  });
});

describe("renderReportMd", () => {
  it("innehåller vinstandelar per sektionstyp och kostnadstabell", () => {
    const md = renderReportMd({
      modelA: "claude-opus-4-8", modelB: "claude-fable-5",
      tally: { phases: { a: 2, b: 1, tie: 0 } },
      costs: [{ model: "claude-opus-4-8", totalUsd: 2.1, perBid: 0.7 }],
    });
    expect(md).toContain("phases");
    expect(md).toContain("claude-fable-5");
    expect(md).toContain("0.7");
  });
});
