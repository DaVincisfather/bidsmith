import { describe, it, expect } from "vitest";
import { buildMasterContext } from "../build-master-context";
import type { RfpAnalysis } from "@/lib/types";

const baseAnalysis: RfpAnalysis = {
  title: "Strategiskt utvecklingsstöd",
  client: "Region Västra Götaland",
  deadline: "2026-05-01",
  summary: "x",
  requirements: [],
  evaluationCriteria: [],
  requiredCompetencies: [],
  estimatedScope: "x",
  redFlags: [],
  domain: "management",
  oslReference: null,
  secrecyRows: [],
};

describe("buildMasterContext", () => {
  it("populates all fields from analysis + organization", () => {
    const ctx = buildMasterContext({
      analysis: { ...baseAnalysis, diaryNumber: "VGR-2026-0042" },
      organizationName: "Edgren Konsult AB",
      now: new Date("2026-04-19T10:00:00Z"),
    });

    expect(ctx).toEqual({
      companyName: "Edgren Konsult AB",
      clientName: "Region Västra Götaland",
      bidName: "Strategiskt utvecklingsstöd",
      diaryNumber: "VGR-2026-0042",
      bidDate: "2026-04-19",
    });
  });

  it("falls back to empty diaryNumber when analysis has none", () => {
    const ctx = buildMasterContext({
      analysis: baseAnalysis,
      organizationName: "Edgren Konsult AB",
      now: new Date("2026-04-19T10:00:00Z"),
    });

    expect(ctx.diaryNumber).toBe("");
  });

  it("formats bidDate as ISO date (no time)", () => {
    const ctx = buildMasterContext({
      analysis: baseAnalysis,
      organizationName: "Org",
      now: new Date("2026-04-19T23:59:59Z"),
    });

    expect(ctx.bidDate).toBe("2026-04-19");
  });
});
