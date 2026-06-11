import { describe, it, expect, vi, beforeEach } from "vitest";
import { RfpAnalysisSchema } from "../ai-schemas";

const mockCallClaude = vi.hoisted(() => vi.fn());
vi.mock("../ai-client", () => ({
  callClaude: mockCallClaude,
}));

import { analyzeRfp } from "../rfp-analyzer";

describe("analyzeRfp", () => {
  beforeEach(() => {
    mockCallClaude.mockReset();
  });

  it("kör med temperature 0 — extraktion ska vara deterministisk", async () => {
    // Samma FFU ska ge samma kravlista, både för kunden och för eval-grinden.
    // Vid API-default 1.0 tärningskastade analyzern segmenteringen per körning.
    mockCallClaude.mockResolvedValueOnce({
      title: "Test", client: "Kund", deadline: null, summary: "s",
      requirements: [], evaluationCriteria: [], requiredCompetencies: [],
      estimatedScope: "x", redFlags: [], domain: "IT",
      oslReference: null, secrecyRows: [],
    });
    await analyzeRfp("RFP-text");
    expect(mockCallClaude.mock.calls[0][0].temperature).toBe(0);
  });

  it("passes diaryNumber instruction to the LLM in the system prompt", async () => {
    mockCallClaude.mockResolvedValueOnce({
      title: "Test",
      client: "Kund",
      deadline: null,
      summary: "s",
      requirements: [],
      evaluationCriteria: [],
      requiredCompetencies: [],
      estimatedScope: "x",
      redFlags: [],
      domain: "IT",
      oslReference: null,
      secrecyRows: [],
    });

    await analyzeRfp("Diarienummer: VGR-2026-0042\n\nResten av RFP:n...");

    expect(mockCallClaude).toHaveBeenCalledOnce();
    const args = mockCallClaude.mock.calls[0][0];
    expect(args.system).toContain("diaryNumber");
    expect(args.system).toMatch(/diarienummer|diarienr|dnr/i);
  });

  it("returns the diaryNumber when LLM extracts one", async () => {
    mockCallClaude.mockResolvedValueOnce({
      title: "Test",
      client: "Kund",
      deadline: null,
      summary: "s",
      diaryNumber: "VGR-2026-0042",
      requirements: [],
      evaluationCriteria: [],
      requiredCompetencies: [],
      estimatedScope: "x",
      redFlags: [],
      domain: "IT",
      oslReference: null,
      secrecyRows: [],
    });

    const result = await analyzeRfp("Diarienummer: VGR-2026-0042\n\n...");
    expect(result.diaryNumber).toBe("VGR-2026-0042");
  });

  it("returns undefined diaryNumber when not present in source", async () => {
    mockCallClaude.mockResolvedValueOnce({
      title: "Test",
      client: "Kund",
      deadline: null,
      summary: "s",
      requirements: [],
      evaluationCriteria: [],
      requiredCompetencies: [],
      estimatedScope: "x",
      redFlags: [],
      domain: "IT",
      oslReference: null,
      secrecyRows: [],
    });

    const result = await analyzeRfp("RFP utan diarienummer");
    expect(result.diaryNumber).toBeUndefined();
  });
});

describe("RfpAnalysisSchema — OSL extraction", () => {
  it("accepts oslReference and secrecyRows", () => {
    const raw = {
      title: "t", client: "c", deadline: null, summary: "s",
      requirements: [], evaluationCriteria: [], requiredCompetencies: [],
      estimatedScope: "", redFlags: [], domain: "",
      oslReference: "19 kap 3 §",
      secrecyRows: [{ reference: "Bilaga 2", scope: "Personuppgifter", justification: "GDPR" }],
    };
    const parsed = RfpAnalysisSchema.parse(raw);
    expect(parsed.oslReference).toBe("19 kap 3 §");
    expect(parsed.secrecyRows).toHaveLength(1);
  });

  it("accepts null oslReference and empty secrecyRows", () => {
    const raw = {
      title: "t", client: "c", deadline: null, summary: "s",
      requirements: [], evaluationCriteria: [], requiredCompetencies: [],
      estimatedScope: "", redFlags: [], domain: "",
      oslReference: null,
      secrecyRows: [],
    };
    const parsed = RfpAnalysisSchema.parse(raw);
    expect(parsed.oslReference).toBeNull();
    expect(parsed.secrecyRows).toEqual([]);
  });
});
