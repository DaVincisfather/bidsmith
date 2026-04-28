import { describe, it, expect, vi, beforeEach } from "vitest";
import { bidCoverageJudge } from "../judges";
import * as aiClient from "@/lib/ai-client";

vi.mock("@/lib/ai-client");

describe("bidCoverageJudge", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns match=true when judge says demonstrated", async () => {
    vi.mocked(aiClient.callClaude).mockResolvedValueOnce({
      demonstrated: true,
      evidence: "section 'team' lists Anna with 10 years digital transformation",
      confidence: "high",
    });
    const result = await bidCoverageJudge({
      requirement: { id: "req_1", category: "experience", description: "5+ years digital transformation", priority: "must" },
      bidText: "Team: Anna (Senior, 10 years). Erfarenhet: digital transformation hos Region X.",
    });
    expect(result.match).toBe(true);
    expect(result.judge).toBe("bid-coverage");
    expect(result.field).toBe("coverage.req_1");
    expect(result.evidence).toContain("Anna");
  });

  it("returns match=false when judge says not demonstrated", async () => {
    vi.mocked(aiClient.callClaude).mockResolvedValueOnce({
      demonstrated: false,
      evidence: "no mention of Swedish proficiency",
      confidence: "high",
    });
    const result = await bidCoverageJudge({
      requirement: { id: "req_2", category: "language", description: "Flytande svenska", priority: "must" },
      bidText: "Team is fluent in English and German.",
    });
    expect(result.match).toBe(false);
  });

  it("returns match=false with error when callClaude throws", async () => {
    vi.mocked(aiClient.callClaude).mockRejectedValueOnce(new Error("API down"));
    const result = await bidCoverageJudge({
      requirement: { id: "req_3", category: "x", description: "x", priority: "must" },
      bidText: "x",
    });
    expect(result.match).toBe(false);
    expect(result.error).toContain("API down");
  });
});
