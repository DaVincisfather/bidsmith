import { describe, it, expect } from "vitest";
import { renderSectionText, aggregateVerdicts, WRITING_SECTION_KEYS } from "../compare-core";

describe("renderSectionText", () => {
  it("plattar ut content till läsbar text (strängar, arrayer, nästlat)", () => {
    const section = {
      key: "phases", title: "Genomförande",
      content: { intro: "Vi gör X.", phases: [{ name: "Fas 1", activities: ["a", "b"] }] },
    };
    const text = renderSectionText(section as never);
    expect(text).toContain("Vi gör X.");
    expect(text).toContain("Fas 1");
    expect(text).toContain("a");
    expect(text).not.toMatch(/[{}"]/); // ingen rå JSON till judgen
  });
});

describe("aggregateVerdicts", () => {
  it("räknar vinstandel per sektionstyp i modelltermer", () => {
    const verdicts = [
      { sectionType: "phases", winner: "A" as const, motiveringar: [] },
      { sectionType: "phases", winner: "B" as const, motiveringar: [] },
      { sectionType: "phases", winner: "tie" as const, motiveringar: [] },
      { sectionType: "quality-assurance", winner: "B" as const, motiveringar: [] },
    ];
    const agg = aggregateVerdicts(verdicts);
    expect(agg["phases"]).toEqual({ a: 1, b: 1, tie: 1 });
    expect(agg["quality-assurance"]).toEqual({ a: 0, b: 1, tie: 0 });
  });
});

describe("WRITING_SECTION_KEYS", () => {
  it("omfattar exakt de sektioner skrivmodellen producerar", () => {
    expect(WRITING_SECTION_KEYS).toEqual([
      "understanding-current", "understanding-assignment", "understanding-vision",
      "phases", "quality-assurance",
    ]);
  });
});
