// @vitest-environment node
import { describe, it, expect } from "vitest";
import { extractConsultant } from "@/lib/consultant-extractor";
import { ConsultantExtraction } from "@/lib/types";
import { readFileSync } from "fs";
import path from "path";

// Live-API integration test: skips unless ANTHROPIC_API_KEY is set
// (npm test stays offline; run with `npm run test:integration`).
describe.skipIf(!process.env.ANTHROPIC_API_KEY)("extractConsultant", () => {
  it("extracts structured profile from a synthetic CV", async () => {
    const cvPath = path.join(
      process.cwd(),
      "data",
      "synthetic",
      "konsult cv",
      "consultant-1.md"
    );
    const cvText = readFileSync(cvPath, "utf-8");

    const result: ConsultantExtraction = await extractConsultant(cvText);

    // Name extracted
    expect(result.name).toBeTruthy();
    expect(result.name).toContain("Anna");

    // Level and experience
    expect(["junior", "intermediate", "senior", "expert"]).toContain(result.level);
    expect(result.yearsExperience).toBeGreaterThanOrEqual(10);

    // Summary
    expect(result.summary).toBeTruthy();
    expect(result.summary.length).toBeGreaterThan(20);

    // Competencies
    expect(result.competencies.length).toBeGreaterThan(0);
    const comp = result.competencies[0];
    expect(comp).toHaveProperty("competency");
    expect(["technical", "domain", "methodology", "certification"]).toContain(
      comp.category
    );

    // References
    expect(result.references.length).toBeGreaterThan(0);
    const ref = result.references[0];
    expect(ref).toHaveProperty("title");
    expect(ref).toHaveProperty("description");
    expect(ref).toHaveProperty("year");
    expect(["public", "private"]).toContain(ref.sector);
  }, 120000);
});
