import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai-client", () => ({
  callClaude: vi.fn(),
}));

import { callClaude } from "@/lib/ai-client";
import {
  classifyForeignSlot,
  SlotClassificationSchema,
} from "../classify-slot";

beforeEach(() => {
  vi.mocked(callClaude).mockReset();
});

describe("classifyForeignSlot", () => {
  it("returns the model's classification", async () => {
    vi.mocked(callClaude).mockResolvedValue({
      capability: "generic-prose",
      intent: "beskriv hållbarhetsarbetet",
      confidence: "low",
    });

    const result = await classifyForeignSlot({ placeholder: "{Hållbarhet}" });
    expect(result).toEqual({
      capability: "generic-prose",
      intent: "beskriv hållbarhetsarbetet",
      confidence: "low",
    });
  });

  it("feeds the placeholder and slide context into the prompt", async () => {
    vi.mocked(callClaude).mockResolvedValue({
      capability: "references",
      intent: "referensuppdrag",
      confidence: "high",
    });

    await classifyForeignSlot({
      placeholder: "{Genomförda uppdrag}",
      slideText: "Våra referenser",
    });

    const arg = vi.mocked(callClaude).mock.calls[0][0];
    expect(arg.userContent).toContain("{Genomförda uppdrag}");
    expect(arg.userContent).toContain("Våra referenser");
    // Classification uses the matching (Sonnet) role, not a writing model.
    expect(arg.model).toBe((await import("@/lib/models")).MODELS.matching);
  });

  it("omits the context line when no slide text is given", async () => {
    vi.mocked(callClaude).mockResolvedValue({
      capability: "generic-prose",
      intent: "x",
      confidence: "low",
    });
    await classifyForeignSlot({ placeholder: "{P}" });
    expect(vi.mocked(callClaude).mock.calls[0][0].userContent).not.toContain("Omgivande text");
  });

  it("propagates validation errors (no silent fallback)", async () => {
    vi.mocked(callClaude).mockRejectedValue(new Error("Invalid response"));
    await expect(classifyForeignSlot({ placeholder: "{P}" })).rejects.toThrow("Invalid response");
  });
});

describe("SlotClassificationSchema", () => {
  it("rejects an unknown capability", () => {
    expect(() =>
      SlotClassificationSchema.parse({ capability: "made-up", intent: "x", confidence: "low" }),
    ).toThrow();
  });

  it("rejects an empty intent", () => {
    expect(() =>
      SlotClassificationSchema.parse({ capability: "generic-prose", intent: "", confidence: "low" }),
    ).toThrow();
  });

  it("rejects a confidence outside high/low", () => {
    expect(() =>
      SlotClassificationSchema.parse({ capability: "generic-prose", intent: "x", confidence: "medium" }),
    ).toThrow();
  });
});
