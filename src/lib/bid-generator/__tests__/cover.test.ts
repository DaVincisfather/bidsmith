import { describe, it, expect } from "vitest";
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
});
