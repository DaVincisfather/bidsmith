import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreate = vi.hoisted(() => vi.fn());
vi.mock("@anthropic-ai/sdk", () => ({
  default: function () { return { messages: { create: mockCreate } }; },
  APIError: class MockAPIError extends Error { status?: number },
}));

import { sonnetMhcJudge } from "../judges";

const sampleRequirement = {
  category: "Kompetens",
  description: "Minst 5 års erfarenhet av digital transformation i offentlig sektor",
  priority: "must" as const,
};

const sampleCv = `Anna Svensson, Senior Consultant.
Ledde molnmigration för Stockholms stad 2019-2024 (5 år).`;

describe("sonnetMhcJudge", () => {
  beforeEach(() => { mockCreate.mockReset(); });

  it("returns demonstrated=true when CV covers the must-have", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text:
        '{"demonstrated": true, "evidence": "Ledde molnmigration för Stockholms stad 2019-2024", "confidence": "high"}' }],
    });
    const r = await sonnetMhcJudge({
      requirement: sampleRequirement,
      consultantId: "anna_svensson",
      cvText: sampleCv,
    });
    expect(r.match).toBe(true);
    expect(r.judge).toBe("sonnet-mhc");
    expect(r.evidence).toMatch(/Stockholms stad/);
    expect(r.confidence).toBe("high");
    expect(r.field).toBe("mhc.anna_svensson.Kompetens");
  });

  it("returns demonstrated=false when CV lacks evidence", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text:
        '{"demonstrated": false, "evidence": "inget relevant nämns", "confidence": "high"}' }],
    });
    const r = await sonnetMhcJudge({
      requirement: sampleRequirement,
      consultantId: "bertil",
      cvText: "Bertil, junior developer.",
    });
    expect(r.match).toBe(false);
    expect(r.confidence).toBe("high");
  });

  it("uses Sonnet model", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text:
        '{"demonstrated": true, "evidence": "x", "confidence": "medium"}' }],
    });
    await sonnetMhcJudge({ requirement: sampleRequirement, consultantId: "c1", cvText: "cv" });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: expect.stringMatching(/sonnet/i) })
    );
  });

  it("records error when judge call fails", async () => {
    mockCreate.mockRejectedValue(new Error("timeout"));
    const r = await sonnetMhcJudge({
      requirement: sampleRequirement,
      consultantId: "anna",
      cvText: "cv",
    });
    expect(r.match).toBe(false);
    expect(r.error).toMatch(/timeout/);
  });
});
