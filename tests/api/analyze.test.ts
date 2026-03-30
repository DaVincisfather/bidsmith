// @vitest-environment node
import { describe, it, expect } from "vitest";
import { analyzeRfp } from "@/lib/rfp-analyzer";
import { parseDocument } from "@/lib/document-parser";
import { readFileSync } from "fs";
import path from "path";

describe("End-to-end: parse + analyze", () => {
  it("parses a synthetic RFP and produces valid analysis", async () => {
    const rfpPath = path.join(
      process.cwd(),
      "data",
      "synthetic",
      "rfps",
      "rfp-1.md"
    );
    const buffer = readFileSync(rfpPath);
    const text = await parseDocument(buffer, "rfp-1.md");

    expect(text.length).toBeGreaterThan(100);

    const analysis = await analyzeRfp(text);

    // Verify complete analysis structure
    expect(analysis.title).toBeTruthy();
    expect(analysis.summary.length).toBeGreaterThan(20);
    expect(analysis.requirements.length).toBeGreaterThan(0);
    expect(analysis.evaluationCriteria.length).toBeGreaterThan(0);
    expect(analysis.requiredCompetencies.length).toBeGreaterThan(0);

    // Verify priorities are valid
    analysis.requirements.forEach((req) => {
      expect(["must", "should", "nice-to-have"]).toContain(req.priority);
    });

    // Verify weights sum to roughly 100
    const totalWeight = analysis.evaluationCriteria.reduce(
      (sum, c) => sum + c.weight,
      0
    );
    expect(totalWeight).toBeGreaterThanOrEqual(90);
    expect(totalWeight).toBeLessThanOrEqual(110);
  }, 30000);
});
