import { describe, it, expect } from "vitest";
import { buildChapterList } from "@/lib/bid-editor/expected-chapters";
import type { BidSection } from "@/lib/types";

function landed(key: string, format: string, title: string): BidSection {
  return {
    type: "ai", key, title, generatedAt: "2026-08-03T00:00:00Z",
    // @ts-expect-error — minimal content shape; only format is read here
    content: { format },
  };
}

describe("buildChapterList", () => {
  it("shows all 11 expected chapters as pending when nothing has landed", () => {
    const items = buildChapterList([], []);
    expect(items).toHaveLength(11);
    expect(items.every((i) => i.state === "pending")).toBe(true);
    expect(items[0].title).toBe("Framsida");
  });

  it("replaces a pending chapter with the landed section (actual title) in plan order", () => {
    const items = buildChapterList([landed("phases-1", "phases", "Vårt genomförande")], []);
    const phases = items.find((i) => i.key === "phases-1");
    expect(phases?.state).toBe("landed");
    expect(phases?.title).toBe("Vårt genomförande");
    // Plan order: phases sits after the three understanding chapters (index 4).
    expect(items.indexOf(phases!)).toBe(4);
  });

  it("marks a failed bundle's chapters as failed", () => {
    const items = buildChapterList([], [{ bundle: "understanding", error: "boom" }]);
    const failed = items.filter((i) => i.state === "failed");
    expect(failed.map((i) => i.key)).toEqual([
      "expected:understanding-current",
      "expected:understanding-assignment",
      "expected:understanding-vision",
    ]);
  });

  it("appends sections with unexpected formats last (foreign/generic bids)", () => {
    const items = buildChapterList([landed("slot-1", "generic-prose", "Om oss")], []);
    expect(items[items.length - 1]).toMatchObject({ key: "slot-1", state: "landed" });
    expect(items).toHaveLength(12);
  });
});
