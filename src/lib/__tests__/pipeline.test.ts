import { describe, it, expect } from "vitest";
import {
  calculateUrgency,
  daysUntil,
  sortPipelineItems,
  sortBidSummaries,
  splitDashboard,
  stockholmToday,
} from "@/lib/pipeline";
import type { PipelineItem, BidSummary } from "@/lib/types";

// Fixed midday-UTC `now` — unambiguous across the Stockholm/UTC day boundary,
// so these don't go red between local midnight and 02:00 (the bug daysUntil's
// timezone fix introduced against the old UTC-based expectations).
const NOON = new Date("2026-07-15T12:00:00Z");

describe("daysUntil", () => {
  it("returns 0 for today", () => {
    expect(daysUntil(stockholmToday(NOON), NOON)).toBe(0);
  });

  it("returns positive integer for future date", () => {
    expect(daysUntil("2026-07-25", NOON)).toBe(10);
  });

  it("returns negative for past date", () => {
    expect(daysUntil("2026-07-10", NOON)).toBe(-5);
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
    analysisId: null,
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

describe("splitDashboard (pipeline-UX-passet: dedupe + arkiv)", () => {
  const make = (
    id: string,
    analysisId: string | null,
    outcome: BidSummary["outcome"],
    exportedAt: string,
    outcomeLoggedAt: string | null = null,
  ): BidSummary => ({
    id,
    analysisId,
    title: `Bid ${id}`,
    exportedAt,
    teamNames: [],
    outcome,
    outcomeLoggedAt,
    competitorName: null,
    lossReason: null,
    lossComment: null,
  });

  it("kollapsar dubbletter per analys: senaste inlämningen visas, versionsCount räknar alla", () => {
    const items = [
      make("v1", "a-1", "lost", "2026-06-01", "2026-06-10"),
      make("v2", "a-1", null, "2026-07-01"),
      make("v3", "a-1", null, "2026-08-01"),
      make("solo", "a-2", null, "2026-05-01"),
    ];
    const { awaiting } = splitDashboard(items);
    expect(awaiting.map((e) => e.bid.id)).toEqual(["solo", "v3"]);
    expect(awaiting.find((e) => e.bid.id === "v3")?.versionsCount).toBe(3);
    expect(awaiting.find((e) => e.bid.id === "solo")?.versionsCount).toBe(1);
  });

  it("rader utan analyskoppling kan inte dedupas och visas var för sig", () => {
    const items = [
      make("x", null, null, "2026-06-01"),
      make("y", null, null, "2026-07-01"),
    ];
    const { awaiting } = splitDashboard(items);
    expect(awaiting).toHaveLength(2);
    expect(awaiting.every((e) => e.versionsCount === 1)).toBe(true);
  });

  it("avgjorda hamnar i arkivet, senast loggade först, ologgade sist", () => {
    const items = [
      make("w", "a-1", "won", "2026-06-01", "2026-06-05"),
      make("l", "a-2", "lost", "2026-06-01", "2026-07-05"),
      make("nolog", "a-3", "cancelled", "2026-06-01", null),
      make("open", "a-4", null, "2026-06-01"),
    ];
    const { archive } = splitDashboard(items);
    expect(archive.map((e) => e.bid.id)).toEqual(["l", "w", "nolog"]);
  });

  it("arkivet behaller ALLA avgjorda rader for samma analys — de ar utfallshistorik, inte dubbletter", () => {
    const items = [
      make("l1", "a-1", "lost", "2026-05-01", "2026-05-10"),
      make("l2", "a-1", "lost", "2026-06-01", "2026-06-10"),
    ];
    const { archive } = splitDashboard(items);
    expect(archive).toHaveLength(2);
  });

  it("superseded: analys vars SENASTE inlamning ar avgjord vantar inte — aldre odomda syskon visas aldrig (routine-fynd #125)", () => {
    const items = [
      make("old-undecided", "a-1", null, "2026-06-01"),
      make("latest-decided", "a-1", "lost", "2026-07-01", "2026-07-10"),
    ];
    const { awaiting, archive } = splitDashboard(items);
    expect(awaiting).toHaveLength(0);
    expect(archive.map((e) => e.bid.id)).toEqual(["latest-decided"]);
  });
});
