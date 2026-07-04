import { describe, it, expect } from "vitest";
import { ConsultantExtractionSchema } from "@/lib/ai-schemas";

// Matchnings-kritiska påståenden (kompetenser, referensuppdrag) måste bära ett
// ordagrant källcitat i modell-output — schemat är första grinden (verify-evidence
// är andra). level/yearsExperience/summary är sanktionerade bedömningar utan citat.
describe("ConsultantExtractionSchema — evidens-tvång", () => {
  const base = {
    name: "Anna",
    level: "senior" as const,
    yearsExperience: 12,
    summary: "s",
  };

  it("accepterar en profil där varje kompetens och referens bär evidence", () => {
    const raw = {
      ...base,
      competencies: [{ competency: "React", category: "technical", evidence: "behärskar React" }],
      references: [
        { title: "Kund", description: "uppdrag", year: 2020, sector: "public", evidence: "ledde uppdrag hos Kund" },
      ],
    };
    expect(ConsultantExtractionSchema.safeParse(raw).success).toBe(true);
  });

  it("accepterar tom references-array (junior utan listade uppdrag)", () => {
    const raw = {
      ...base,
      competencies: [{ competency: "React", category: "technical", evidence: "behärskar React" }],
      references: [],
    };
    expect(ConsultantExtractionSchema.safeParse(raw).success).toBe(true);
  });

  it("avvisar en kompetens utan evidence", () => {
    const raw = {
      ...base,
      competencies: [{ competency: "React", category: "technical" }],
      references: [],
    };
    expect(ConsultantExtractionSchema.safeParse(raw).success).toBe(false);
  });

  it("avvisar tomt evidence-citat (min(1))", () => {
    const raw = {
      ...base,
      competencies: [{ competency: "React", category: "technical", evidence: "" }],
      references: [],
    };
    expect(ConsultantExtractionSchema.safeParse(raw).success).toBe(false);
  });

  it("avvisar en referens utan evidence", () => {
    const raw = {
      ...base,
      competencies: [{ competency: "React", category: "technical", evidence: "behärskar React" }],
      references: [{ title: "Kund", description: "uppdrag", year: 2020, sector: "public" }],
    };
    expect(ConsultantExtractionSchema.safeParse(raw).success).toBe(false);
  });

  it("avvisar noll kompetenser (competencies.min(1) — degenererat svar)", () => {
    const raw = { ...base, competencies: [], references: [] };
    expect(ConsultantExtractionSchema.safeParse(raw).success).toBe(false);
  });
});
