import { describe, it, expect } from "vitest";
import { buildAnalysisListItems, type AnalysisRow, type BidStatusRow } from "../analyses-list";
import type { RfpAnalysis } from "../types";

function analysis(partial: Partial<RfpAnalysis>): RfpAnalysis {
  return {
    title: "T",
    client: "C",
    deadline: null,
    summary: "",
    requirements: [],
    evaluationCriteria: [],
    requiredCompetencies: [],
    estimatedScope: "",
    redFlags: [],
    domain: "",
    oslReference: null,
    secrecyRows: [],
    ...partial,
  };
}

const today = "2026-07-01";

describe("buildAnalysisListItems", () => {
  it("includes analyses regardless of deadline (the BUG-B fix)", () => {
    const rows: AnalysisRow[] = [
      { id: "past", analysis: analysis({ title: "Passerad", deadline: "2025-09-22" }) },
      { id: "none", analysis: analysis({ title: "Utan deadline", deadline: null }) },
      { id: "future", analysis: analysis({ title: "Framtid", deadline: "2026-12-01" }) },
    ];
    const items = buildAnalysisListItems(rows, [], today);
    // all three survive — none are silently dropped like the pipeline does
    expect(items.map((i) => i.id)).toEqual(["past", "none", "future"]);
    expect(items.find((i) => i.id === "past")?.deadlinePassed).toBe(true);
    expect(items.find((i) => i.id === "future")?.deadlinePassed).toBe(false);
    expect(items.find((i) => i.id === "none")?.deadlinePassed).toBe(false);
  });

  it("falls back to document file name, then a placeholder, for the title", () => {
    const rows: AnalysisRow[] = [
      { id: "a", analysis: { ...analysis({}), title: undefined as unknown as string }, documents: { file_name: "rfp.pdf" } },
    ];
    expect(buildAnalysisListItems(rows, [], today)[0].title).toBe("rfp.pdf");
  });

  it("derives status: exported outranks draft, none when no bid", () => {
    const rows: AnalysisRow[] = [
      { id: "x", analysis: analysis({}) },
      { id: "y", analysis: analysis({}) },
      { id: "z", analysis: analysis({}) },
    ];
    const bids: BidStatusRow[] = [
      { analysis_id: "x", status: "draft", exported_at: null },
      { analysis_id: "x", status: "exported", exported_at: "2026-06-01" },
      { analysis_id: "y", status: "generating", exported_at: null },
    ];
    const items = buildAnalysisListItems(rows, bids, today);
    expect(items.find((i) => i.id === "x")?.status).toBe("exported");
    expect(items.find((i) => i.id === "y")?.status).toBe("draft");
    expect(items.find((i) => i.id === "z")?.status).toBe("none");
  });
});
