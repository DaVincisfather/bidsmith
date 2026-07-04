import { describe, it, expect } from "vitest";
import { mapConsultantRow } from "@/lib/supabase";
import { CONSULTANT_SELECT, CONSULTANT_API_SELECT } from "@/lib/constants";

// Läsvägen för evidens: SELECT-konstanterna måste hämta kolumnen och
// mapConsultantRow exponera den (null i DB → undefined i läs-typen). Utan detta
// kan klienten aldrig round-tripa citatet vid redigering (routine-fynd #57).

describe("evidens i läs-selecterna", () => {
  it("båda selecterna hämtar evidence för kompetenser + referenser", () => {
    for (const select of [CONSULTANT_SELECT, CONSULTANT_API_SELECT]) {
      expect(select).toMatch(/consultant_competencies\s*\([^)]*\bevidence\b/);
      expect(select).toMatch(/consultant_references\s*\([^)]*\bevidence\b/);
    }
  });

  it("API-selecten läcker inte raw_cv_text (PII)", () => {
    expect(CONSULTANT_API_SELECT).not.toMatch(/raw_cv_text/);
  });
});

describe("mapConsultantRow — evidens", () => {
  const row = {
    id: "c1",
    name: "Anna",
    level: "senior",
    years_experience: 8,
    summary: "text",
    created_at: "2026-01-01",
    updated_at: "2026-01-02",
    consultant_competencies: [
      { competency: "Upphandling", category: "domain", evidence: "citat A" },
      { competency: "Ledarskap", category: "methodology", evidence: null },
    ],
    consultant_references: [
      {
        title: "Uppdrag",
        description: "beskrivning",
        year: 2022,
        sector: "public",
        evidence: "citat B",
      },
    ],
  };

  it("mappar verifierat citat och null → undefined", () => {
    const c = mapConsultantRow(row);
    expect(c.competencies[0].evidence).toBe("citat A");
    // null i DB (obelagt) blir undefined i läs-typen, inte strängen "null".
    expect(c.competencies[1].evidence).toBeUndefined();
    expect(c.references[0].evidence).toBe("citat B");
  });
});
