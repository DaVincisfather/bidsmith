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
  it("populates all fields from analysis, companyName blank by default", () => {
    const ctx = buildMasterContext({
      analysis: { ...baseAnalysis, diaryNumber: "VGR-2026-0042" },
      now: new Date("2026-04-19T10:00:00Z"),
    });

    expect(ctx).toEqual({
      companyName: "",
      clientName: "Region Västra Götaland",
      bidName: "Strategiskt utvecklingsstöd",
      diaryNumber: "VGR-2026-0042",
      bidDate: "2026-04-19",
    });
  });

  it("threads companyName into MasterContext (footer {Bolagsnamn} + cover)", () => {
    const ctx = buildMasterContext({
      analysis: baseAnalysis,
      now: new Date("2026-04-19T10:00:00Z"),
      companyName: "Testbolaget AB",
    });

    expect(ctx.companyName).toBe("Testbolaget AB");
  });

  it("falls back to empty diaryNumber when analysis has none", () => {
    const ctx = buildMasterContext({
      analysis: baseAnalysis,
      now: new Date("2026-04-19T10:00:00Z"),
    });

    expect(ctx.diaryNumber).toBe("");
  });

  it("formats bidDate in Europe/Stockholm, not UTC", () => {
    // 23:30 UTC on Apr 22 = 01:30 CEST on Apr 23 — buggy UTC path would
    // return "2026-04-22", Stockholm-aware path returns "2026-04-23".
    const ctx = buildMasterContext({
      analysis: baseAnalysis,
      now: new Date("2026-04-22T23:30:00Z"),
    });

    expect(ctx.bidDate).toBe("2026-04-23");
  });
});
