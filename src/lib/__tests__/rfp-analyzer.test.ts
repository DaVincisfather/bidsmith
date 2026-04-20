import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCallClaude = vi.hoisted(() => vi.fn());
vi.mock("../ai-client", () => ({
  callClaude: mockCallClaude,
}));

import { analyzeRfp } from "../rfp-analyzer";

describe("analyzeRfp", () => {
  beforeEach(() => {
    mockCallClaude.mockReset();
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
    });

    const result = await analyzeRfp("RFP utan diarienummer");
    expect(result.diaryNumber).toBeUndefined();
  });
});
