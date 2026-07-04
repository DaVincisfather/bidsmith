import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AnalysisResult } from "../analysis-result";
import type { RfpAnalysis } from "@/lib/types";

function makeAnalysis(reqs: RfpAnalysis["requirements"]): RfpAnalysis {
  return {
    title: "Testuppdrag",
    client: "Testkommun",
    deadline: null,
    summary: "Sammanfattning",
    requirements: reqs,
    evaluationCriteria: [],
    requiredCompetencies: [],
    estimatedScope: "",
    redFlags: [],
    domain: "",
    oslReference: null,
    secrecyRows: [],
  };
}

describe("AnalysisResult — källa-badge", () => {
  it("visar en källa-chip för krav med evidens och togglar citatet", () => {
    render(
      <AnalysisResult
        analysis={makeAnalysis([
          {
            category: "Kvalifikation",
            description: "Minst 5 års erfarenhet",
            priority: "must",
            kind: "qualification",
            evidence: "Anbudsgivaren ska ha minst fem års erfarenhet",
          },
        ])}
        fileName="rfp.pdf"
      />,
    );

    const chip = screen.getByRole("button", { name: /källa/i });
    expect(screen.queryByText(/minst fem års erfarenhet/i)).not.toBeInTheDocument();
    fireEvent.click(chip);
    expect(screen.getByText(/minst fem års erfarenhet/i)).toBeInTheDocument();
  });

  it("visar 'obelagd' för krav utan evidens (men grinden öppen tack vare annat belagt krav)", () => {
    render(
      <AnalysisResult
        analysis={makeAnalysis([
          {
            category: "Kvalifikation",
            description: "Belagt krav",
            priority: "must",
            kind: "qualification",
            evidence: "Ett verifierat citat",
          },
          {
            category: "Kvalifikation",
            description: "Obelagt krav",
            priority: "should",
            kind: "qualification",
            evidence: undefined,
          },
        ])}
        fileName="rfp.pdf"
      />,
    );

    expect(screen.getByText(/obelagd/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /källa/i })).toBeInTheDocument();
  });

  it("legacy-grind: inga badges alls när ingen post i analysen bär evidens", () => {
    render(
      <AnalysisResult
        analysis={makeAnalysis([
          { category: "Kvalifikation", description: "Gammalt krav", priority: "must", kind: "qualification" },
          { category: "Kvalifikation", description: "Gammalt krav 2", priority: "should", kind: "qualification" },
        ])}
        fileName="rfp.pdf"
      />,
    );

    expect(screen.queryByRole("button", { name: /källa/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/obelagd/i)).not.toBeInTheDocument();
  });
});
