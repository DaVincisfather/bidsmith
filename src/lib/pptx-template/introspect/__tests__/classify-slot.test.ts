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
      name: "Hållbarhet",
    });

    const result = await classifyForeignSlot({
      shapeText: "Här beskriver vi vårt hållbarhetsarbete.",
    });
    expect(result).toEqual({
      capability: "generic-prose",
      intent: "beskriv hållbarhetsarbetet",
      confidence: "low",
      name: "Hållbarhet",
    });
  });

  it("feeds the sample text and slide context into the prompt", async () => {
    vi.mocked(callClaude).mockResolvedValue({
      capability: "references",
      intent: "referensuppdrag",
      confidence: "high",
      name: "Referenser",
    });

    await classifyForeignSlot({
      shapeText: "Uppdrag åt Trafikverket 2022",
      slideText: "Våra referenser",
    });

    const arg = vi.mocked(callClaude).mock.calls[0][0];
    expect(arg.userContent).toContain("Uppdrag åt Trafikverket 2022");
    expect(arg.userContent).toContain("Våra referenser");
    // Classification uses the matching (Sonnet) role, not a writing model.
    expect(arg.model).toBe((await import("@/lib/models")).MODELS.matching);
  });

  it("omits the context line when no slide text is given", async () => {
    vi.mocked(callClaude).mockResolvedValue({
      capability: "generic-prose",
      intent: "x",
      confidence: "low",
      name: "P",
    });
    await classifyForeignSlot({ shapeText: "något innehåll" });
    expect(vi.mocked(callClaude).mock.calls[0][0].userContent).not.toContain("Omgivande text");
  });

  it("marks an empty box explicitly rather than sending a blank line", async () => {
    vi.mocked(callClaude).mockResolvedValue({
      capability: "generic-prose",
      intent: "x",
      confidence: "low",
      name: "Tomt",
    });
    await classifyForeignSlot({ shapeText: "   " });
    expect(vi.mocked(callClaude).mock.calls[0][0].userContent).toContain("(tom ruta)");
  });

  it("propagates validation errors (no silent fallback)", async () => {
    vi.mocked(callClaude).mockRejectedValue(new Error("Invalid response"));
    await expect(classifyForeignSlot({ shapeText: "x" })).rejects.toThrow("Invalid response");
  });
});

describe("SlotClassificationSchema", () => {
  const valid = {
    capability: "generic-prose",
    intent: "x",
    confidence: "low",
    name: "Namn",
  };

  it("accepts a well-formed classification", () => {
    expect(() => SlotClassificationSchema.parse(valid)).not.toThrow();
  });

  it("rejects an unknown capability", () => {
    expect(() =>
      SlotClassificationSchema.parse({ ...valid, capability: "made-up" }),
    ).toThrow();
  });

  it("rejects an empty intent", () => {
    expect(() => SlotClassificationSchema.parse({ ...valid, intent: "" })).toThrow();
  });

  it("rejects a confidence outside high/low", () => {
    expect(() =>
      SlotClassificationSchema.parse({ ...valid, confidence: "medium" }),
    ).toThrow();
  });

  it("rejects an empty name", () => {
    expect(() => SlotClassificationSchema.parse({ ...valid, name: "" })).toThrow();
  });

  it("rejects a name over 40 chars", () => {
    expect(() =>
      SlotClassificationSchema.parse({ ...valid, name: "x".repeat(41) }),
    ).toThrow();
  });

  it("rejects a name containing brace characters", () => {
    expect(() => SlotClassificationSchema.parse({ ...valid, name: "{Namn}" })).toThrow();
    expect(() => SlotClassificationSchema.parse({ ...valid, name: "Na}mn" })).toThrow();
  });
});
