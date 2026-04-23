import { afterEach, describe, it, expect, vi } from "vitest";
import { buildCoverSection } from "../deterministic/cover";
import type { RfpAnalysis } from "@/lib/types";

const baseAnalysis: RfpAnalysis = {
  title: "IT-konsulttjänster",
  client: "Region VGR",
  deadline: "2026-05-01",
  summary: "s",
  requirements: [], evaluationCriteria: [], requiredCompetencies: [],
  estimatedScope: "", redFlags: [], domain: "IT",
  oslReference: null, secrecyRows: [],
};

describe("buildCoverSection", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("maps analysis.title and analysis.client into the cover content", () => {
    const s = buildCoverSection(baseAnalysis);
    expect(s.content).toEqual({
      format: "cover",
      title: "IT-konsulttjänster",
      client: "Region VGR",
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
    expect(s.key).toBe("cover");
    expect(s.type).toBe("data");
  });

  it("formats cover date in Europe/Stockholm, not UTC", () => {
    // 23:30 UTC on Apr 22 = 01:30 CEST on Apr 23 — buggy UTC path would
    // return "2026-04-22", Stockholm-aware path returns "2026-04-23".
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T23:30:00Z"));
    const s = buildCoverSection(baseAnalysis);
    expect((s.content as { date: string }).date).toBe("2026-04-23");
  });
});
