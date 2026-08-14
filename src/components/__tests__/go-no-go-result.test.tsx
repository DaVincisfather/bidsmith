import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GoNoGoResultView } from "../go-no-go-result";
import type { GoNoGoResult, ImprovementSuggestion } from "@/lib/types";

function makeResult(improvements: ImprovementSuggestion[]): GoNoGoResult {
  return {
    mustRequirements: [{ requirement: "Krav 1", met: true, coveredBy: "Anna" }],
    winProbability: 65,
    winProbabilityReasoning: "Bra team.",
    strengths: [],
    gaps: [],
    improvements,
    poolGap: null,
    recommendation: "go",
    reasoning: "Kör.",
  };
}

function renderView(improvements: ImprovementSuggestion[]) {
  return render(
    <GoNoGoResultView
      result={makeResult(improvements)}
      assessmentId="a-1"
      actions={null}
    />,
  );
}

const spanSuggestion: ImprovementSuggestion = {
  kind: "swap",
  swap: { remove: "Anna", add: "Cecilia" },
  swapIds: { removeId: "c1", addId: "c3" },
  estimatedImpact: "+4–7 %",
  estimatedImpactMin: 4,
  estimatedImpactMax: 7,
  reason: "Cecilia täcker ska-krav 2.",
};

// Legacy persisted row from the point-estimate era — no span fields.
const legacySuggestion: ImprovementSuggestion = {
  kind: "swap",
  swap: { remove: "Anna", add: "Cecilia" },
  swapIds: { removeId: "c1", addId: "c3" },
  estimatedImpact: "+15%",
  reason: "Cecilia täcker ska-krav 2.",
};

describe("GoNoGoResultView — impact-spann och pedagogik", () => {
  it("visar spannet utan tilde (spannet bär redan osäkerheten)", () => {
    renderView([spanSuggestion]);
    expect(screen.getByText(/\+4–7 %/)).toBeInTheDocument();
    expect(screen.queryByText(/~\+4–7 %/)).not.toBeInTheDocument();
  });

  it("visar legacy-punktestimat med tilde som förr", () => {
    renderView([legacySuggestion]);
    expect(screen.getByText(/~\+15%/)).toBeInTheDocument();
  });

  it("förklarar individmatchning vs teamkomposition via klickbar info-knapp (touch, routine-fynd)", () => {
    renderView([spanSuggestion]);
    expect(screen.getByText("Förbättringsförslag")).toBeInTheDocument();

    const infoButton = screen.getByRole("button", { name: "Varför föreslås byten?" });
    expect(infoButton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/Matchningen rankar individer/)).not.toBeInTheDocument();

    fireEvent.click(infoButton);
    expect(infoButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/Matchningen rankar individer/)).toBeInTheDocument();

    fireEvent.click(infoButton);
    expect(screen.queryByText(/Matchningen rankar individer/)).not.toBeInTheDocument();
  });
});
