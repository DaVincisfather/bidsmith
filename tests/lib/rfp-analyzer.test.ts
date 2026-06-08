// @vitest-environment node
import { describe, it, expect } from "vitest";
import { analyzeRfp } from "@/lib/rfp-analyzer";
import { RfpAnalysis } from "@/lib/types";
import { readFileSync } from "fs";
import path from "path";

// Live-API integration test: skips unless ANTHROPIC_API_KEY is set
// (npm test stays offline; run with `npm run test:integration`).
describe.skipIf(!process.env.ANTHROPIC_API_KEY)("analyzeRfp", () => {
  it("returns a structured analysis from a synthetic RFP", async () => {
    const rfpPath = path.join(
      process.cwd(),
      "data",
      "synthetic",
      "rfps",
      "rfp-1.md"
    );
    const rfpText = readFileSync(rfpPath, "utf-8");

    const result: RfpAnalysis = await analyzeRfp(rfpText);

    // Structural checks
    expect(result.title).toBeTruthy();
    expect(result.summary).toBeTruthy();
    expect(result.requirements.length).toBeGreaterThan(0);
    expect(result.evaluationCriteria.length).toBeGreaterThan(0);
    expect(result.requiredCompetencies.length).toBeGreaterThan(0);

    // Check that requirements have correct shape
    const req = result.requirements[0];
    expect(req).toHaveProperty("category");
    expect(req).toHaveProperty("description");
    expect(["must", "should", "nice-to-have"]).toContain(req.priority);

    // Check that evaluation criteria have weights
    const crit = result.evaluationCriteria[0];
    expect(crit).toHaveProperty("name");
    expect(crit).toHaveProperty("weight");
    expect(typeof crit.weight).toBe("number");
  }, 120000);
});
