import { describe, it, expect } from "vitest";
import { buildScoringPrompt } from "@/lib/opportunity-scorer";

describe("buildScoringPrompt", () => {
  it("includes opportunity title and summary", () => {
    const prompt = buildScoringPrompt(
      { title: "Ekonomisystem Region X", summary: "Upphandling av nytt system." },
      [{ name: "Ekonomi & beslutsstöd", description: "Vi hjälper med...", keywords: ["ekonomisystem"] }]
    );
    expect(prompt).toContain("Ekonomisystem Region X");
    expect(prompt).toContain("Upphandling av nytt system.");
  });

  it("includes all competency areas", () => {
    const prompt = buildScoringPrompt(
      { title: "Test", summary: "Test summary" },
      [
        { name: "Area A", description: "Desc A", keywords: ["a"] },
        { name: "Area B", description: "Desc B", keywords: ["b"] },
      ]
    );
    expect(prompt).toContain("Area A");
    expect(prompt).toContain("Area B");
    expect(prompt).toContain("Desc A");
    expect(prompt).toContain("Desc B");
  });

  it("handles null summary gracefully", () => {
    const prompt = buildScoringPrompt(
      { title: "Test", summary: null },
      [{ name: "Area A", description: "Desc A", keywords: ["a"] }]
    );
    expect(prompt).toContain("Test");
    expect(prompt).not.toContain("null");
  });
});
