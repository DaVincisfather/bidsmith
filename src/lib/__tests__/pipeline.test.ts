import { describe, it, expect } from "vitest";
import {
  calculateUrgency,
  daysUntil,
  sortPipelineItems,
  sortBidSummaries,
} from "@/lib/pipeline";
import type { PipelineItem, BidSummary } from "@/lib/types";

describe("daysUntil", () => {
  it("returns 0 for today", () => {
    const today = new Date().toISOString().split("T")[0];
    expect(daysUntil(today)).toBe(0);
  });

  it("returns positive integer for future date", () => {
    const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    expect(daysUntil(future)).toBe(10);
  });

  it("returns negative for past date", () => {
    const past = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(daysUntil(past)).toBe(-5);
  });
});

describe("calculateUrgency", () => {
  it("returns 'urgent' when <7 days left", () => {
    expect(calculateUrgency(6)).toBe("urgent");
    expect(calculateUrgency(0)).toBe("urgent");
  });

  it("returns 'soon' for 7-13 days left", () => {
    expect(calculateUrgency(7)).toBe("soon");
    expect(calculateUrgency(13)).toBe("soon");
  });

  it("returns 'later' for 14+ days", () => {
    expect(calculateUrgency(14)).toBe("later");
    expect(calculateUrgency(30)).toBe("later");
  });
});

describe("sortPipelineItems", () => {
  const base = (daysLeft: number, id: string): PipelineItem => ({
    id,
    source: "ted",
    title: `Item ${id}`,
    deadline: new Date(Date.now() + daysLeft * 86400000).toISOString(),
    daysLeft,
    urgency: calculateUrgency(daysLeft),
    relevanceScore: 70,
    analysisId: null,
    tedUrl: null,
  });

  it("sorts ascending by daysLeft (most urgent first)", () => {
    const items = [base(20, "a"), base(5, "b"), base(12, "c")];
    const sorted = sortPipelineItems(items);
    expect(sorted.map((i) => i.id)).toEqual(["b", "c", "a"]);
  });

  it("sorts deadline-less items LAST (BUG-B: included but not time-pressed)", () => {
    const noDeadline: PipelineItem = {
      ...base(0, "u"),
      deadline: null,
      daysLeft: null,
      urgency: "later",
    };
    const sorted = sortPipelineItems([noDeadline, base(20, "a"), base(5, "b")]);
    expect(sorted.map((i) => i.id)).toEqual(["b", "a", "u"]);
  });
});

describe("sortBidSummaries", () => {
  const base = (
    id: string,
    outcome: BidSummary["outcome"],
    exportedAt: string,
    outcomeLoggedAt: string | null
  ): BidSummary => ({
    id,
    title: `Bid ${id}`,
    exportedAt,
    teamNames: [],
    outcome,
    outcomeLoggedAt,
    competitorName: null,
    lossReason: null,
    lossComment: null,
  });

  it("awaiting (outcome=null) comes first, oldest first", () => {
    const items = [
      base("newer", null, "2026-04-05", null),
      base("older", null, "2026-04-01", null),
    ];
    const sorted = sortBidSummaries(items);
    expect(sorted[0].id).toBe("older");
  });

  it("committed outcomes sort by outcomeLoggedAt DESC (newest first)", () => {
    const items = [
      base("a", "won", "2026-03-01", "2026-04-01"),
      base("b", "lost", "2026-03-01", "2026-04-10"),
    ];
    const sorted = sortBidSummaries(items);
    expect(sorted[0].id).toBe("b");
  });

  it("awaiting always before committed", () => {
    const items = [
      base("committed", "won", "2026-03-01", "2026-04-10"),
      base("awaiting", null, "2026-04-09", null),
    ];
    const sorted = sortBidSummaries(items);
    expect(sorted[0].id).toBe("awaiting");
  });
});
