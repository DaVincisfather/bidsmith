import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreate = vi.hoisted(() => vi.fn());
vi.mock("@anthropic-ai/sdk", () => ({
  default: function () { return { messages: { create: mockCreate } }; },
  APIError: class MockAPIError extends Error { status?: number },
}));

import { haikuEquivJudge } from "../judges";

describe("haikuEquivJudge", () => {
  beforeEach(() => { mockCreate.mockReset(); });

  it("returns match=true when judge says equivalent", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: '{"match": true, "reason": "same meaning"}' }],
    });
    const r = await haikuEquivJudge({
      golden: "IT-konsult med 5 års erfarenhet",
      actual: "Konsult inom IT med fem års erfarenhet",
      field: "requirements[0].description",
    });
    expect(r.match).toBe(true);
    expect(r.judge).toBe("haiku-equiv");
    expect(r.evidence).toBe("same meaning");
  });

  it("returns match=false when judge says different", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: '{"match": false, "reason": "different scope"}' }],
    });
    const r = await haikuEquivJudge({
      golden: "Svenska",
      actual: "Engelska",
      field: "requirements[0].description",
    });
    expect(r.match).toBe(false);
  });

  it("calls Haiku model specifically", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: '{"match": true, "reason": "ok"}' }],
    });
    await haikuEquivJudge({ golden: "A", actual: "B", field: "x" });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: expect.stringMatching(/haiku/i) })
    );
  });

  it("records error field when judge call fails", async () => {
    mockCreate.mockRejectedValue(new Error("network boom"));
    const r = await haikuEquivJudge({ golden: "A", actual: "B", field: "x" });
    expect(r.match).toBe(false);
    expect(r.error).toMatch(/network boom/);
  });
});
