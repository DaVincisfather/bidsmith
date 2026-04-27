import { describe, it, expect, vi, beforeEach } from "vitest";
import { logAiCall } from "@/lib/ai-call-logger";

const mockInsert = vi.fn();

vi.mock("@/lib/supabase", () => ({
  createServiceClient: () => ({
    from: () => ({ insert: mockInsert }),
  }),
}));

beforeEach(() => {
  mockInsert.mockReset();
  mockInsert.mockResolvedValue({ error: null });
});

describe("logAiCall", () => {
  it("inserts a row with computed cost and tokens", async () => {
    await logAiCall({
      organizationId: "org-123",
      model: "claude-sonnet-4-6",
      label: "rfp-analyzer",
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      latencyMs: 4200,
    });

    expect(mockInsert).toHaveBeenCalledTimes(1);
    const row = mockInsert.mock.calls[0][0];
    expect(row.organization_id).toBe("org-123");
    expect(row.model).toBe("claude-sonnet-4-6");
    expect(row.label).toBe("rfp-analyzer");
    expect(row.input_tokens).toBe(1000);
    expect(row.output_tokens).toBe(500);
    expect(row.cost_usd).toBeCloseTo(0.0105, 6);
    expect(row.latency_ms).toBe(4200);
    expect(row.error).toBeNull();
  });

  it("logs an error string when provided", async () => {
    await logAiCall({
      organizationId: null,
      model: "claude-opus-4-7",
      label: "bid-generator",
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      latencyMs: 12,
      error: "rate limited",
    });

    const row = mockInsert.mock.calls[0][0];
    expect(row.error).toBe("rate limited");
    expect(row.organization_id).toBeNull();
  });

  it("never throws when the insert fails", async () => {
    mockInsert.mockResolvedValue({ error: { message: "db down" } });

    await expect(
      logAiCall({
        organizationId: "org-1",
        model: "claude-sonnet-4-6",
        label: "x",
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        latencyMs: 0,
      })
    ).resolves.toBeUndefined();
  });

  it("never throws when the client throws synchronously", async () => {
    mockInsert.mockImplementation(() => {
      throw new Error("boom");
    });

    await expect(
      logAiCall({
        organizationId: null,
        model: "x",
        label: "y",
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        latencyMs: 0,
      })
    ).resolves.toBeUndefined();
  });
});
