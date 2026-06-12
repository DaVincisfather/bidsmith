import { describe, it, expect } from "vitest";
import { parseBlindReviewMarks, scoreBlindReview } from "../compare-report";

describe("parseBlindReviewMarks", () => {
  it("parsar ifyllda rader och hoppar tomma", () => {
    const md = [
      "| Par | FFU | Sektionstyp | Vinnare (1/2/oavgjort) |",
      "|---|---|---|---|",
      "| par-1 | f1 | phases | 1 |",
      "| par-2 | f1 | phases |  |",
      "| par-3 | f2 | quality-assurance | Oavgjort |",
    ].join("\n");
    expect(parseBlindReviewMarks(md).marks).toEqual([
      { id: "par-1", mark: "1" },
      { id: "par-3", mark: "oavgjort" },
    ]);
  });

  it("ogiltiga markeringar blir varningar — aldrig tysta röster eller tyst unscored", () => {
    const md = [
      "| par-1 | f1 - x | phases | 12 |",
      "| par-2 | f1 | phases | 2 (knapp) |",
      "| par-3 | f1 | phases | utkast 2 |",
    ].join("\n");
    const r = parseBlindReviewMarks(md);
    expect(r.marks).toEqual([]); // "12" får INTE parsas som "2"
    expect(r.invalid.map((i) => i.id)).toEqual(["par-1", "par-2", "par-3"]);
  });

  it("FFU-kolumn med bindestreck och CRLF-radslut stör inte parsningen", () => {
    const md = "| par-1 | Ramavtal — Region X | phases | 2 |\r\n";
    expect(parseBlindReviewMarks(md).marks).toEqual([{ id: "par-1", mark: "2" }]);
  });
});

describe("scoreBlindReview", () => {
  it("översätter utkastval till modelltermer via facit-ordningen", () => {
    const facit = [
      { id: "par-1", facit: { ordning: "A-först" as const, pairFile: "x.json" } },
      { id: "par-2", facit: { ordning: "B-först" as const, pairFile: "y.json" } },
      { id: "par-3", facit: { ordning: "A-först" as const, pairFile: "z.json" } },
    ];
    const marks = [
      { id: "par-1", mark: "1" as const }, // A-först: utkast 1 = A
      { id: "par-2", mark: "2" as const }, // B-först: utkast 2 = A
      { id: "par-3", mark: "oavgjort" as const },
    ];
    expect(scoreBlindReview(marks, facit)).toEqual({ a: 2, b: 0, tie: 1, unscored: 0 });
  });

  it("räknar par utan markering som unscored", () => {
    const facit = [
      { id: "par-1", facit: { ordning: "A-först" as const, pairFile: "x.json" } },
      { id: "par-2", facit: { ordning: "A-först" as const, pairFile: "y.json" } },
    ];
    expect(scoreBlindReview([{ id: "par-2", mark: "2" }], facit)).toEqual({
      a: 0, b: 1, tie: 0, unscored: 1,
    });
  });

  it("kastar på dubblettmarkering och på id utan facit — tyst sista-raden-vinner är förbjudet", () => {
    const facit = [{ id: "par-1", facit: { ordning: "A-först" as const, pairFile: "x.json" } }];
    expect(() =>
      scoreBlindReview([{ id: "par-1", mark: "1" }, { id: "par-1", mark: "2" }], facit),
    ).toThrow(/dubblett/i);
    expect(() => scoreBlindReview([{ id: "par-9", mark: "1" }], facit)).toThrow(/facit/i);
  });
});
