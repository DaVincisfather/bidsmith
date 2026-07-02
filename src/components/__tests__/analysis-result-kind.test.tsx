import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AnalysisResult } from "../analysis-result";
import type { RfpAnalysis } from "@/lib/types";

const analysis: RfpAnalysis = {
  title: "Testuppdrag",
  client: "Testkommun",
  deadline: null,
  summary: "Sammanfattning",
  requirements: [
    { category: "Konsultkvalifikationer", description: "Minst 5 års erfarenhet", priority: "must", kind: "qualification" },
    { category: "Leverans", description: "Skriftlig slutrapport", priority: "must", kind: "deliverable" },
  ],
  evaluationCriteria: [],
  requiredCompetencies: [],
  estimatedScope: "",
  redFlags: [],
  domain: "",
  oslReference: null,
  secrecyRows: [],
};

describe("AnalysisResult — separerar leveranser från ska/bör-krav", () => {
  it("visar en separat Leveranser-grupp och ger inte leverabler en prioritetsbadge", () => {
    render(<AnalysisResult analysis={analysis} fileName="rfp.pdf" />);

    // Båda posterna renderas.
    expect(screen.getByText("Minst 5 års erfarenhet")).toBeInTheDocument();
    expect(screen.getByText("Skriftlig slutrapport")).toBeInTheDocument();

    // Ny separat sektion för leverabler.
    expect(screen.getByText("Leveranser")).toBeInTheDocument();

    // Endast kvalifikationskravet (must) får en "Ska"-badge — leverabeln får ingen.
    expect(screen.getAllByText("Ska")).toHaveLength(1);
  });
});
