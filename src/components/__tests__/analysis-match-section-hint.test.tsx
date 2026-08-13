import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AnalysisMatchSection } from "../analysis-match-section";

// next/navigation's useRouter är otillgänglig utanför App Router-runtimen.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const scoredConsultants = [
  { consultantId: "a", consultantName: "Anna", level: "senior", score: 90, reasoning: "" },
  { consultantId: "b", consultantName: "Bo", level: "senior", score: 80, reasoning: "" },
];

function renderSection(overrides: Partial<Parameters<typeof AnalysisMatchSection>[0]> = {}) {
  return render(
    <AnalysisMatchSection
      analysisId="a1"
      latestMatch={{ id: "m1", scoredConsultants }}
      locked={false}
      lockedTeamIds={null}
      teamSizeHint={null}
      {...overrides}
    />,
  );
}

describe("AnalysisMatchSection — teamSizeHint transparency line", () => {
  it("renders the range with the clamped preselected count", () => {
    renderSection({ teamSizeHint: { min: 1, max: 2 } });
    expect(screen.getByText("Underlaget anger 1–2 konsulter — 2 förvalda.")).toBeInTheDocument();
  });

  it("collapses to one number when min === max", () => {
    renderSection({ teamSizeHint: { min: 2, max: 2 } });
    expect(screen.getByText("Underlaget anger 2 konsulter — 2 förvalda.")).toBeInTheDocument();
  });

  it("renders no line when the RFP states no explicit team size", () => {
    renderSection({ teamSizeHint: null });
    expect(screen.queryByText(/Underlaget anger/)).not.toBeInTheDocument();
  });

  it("suppresses the '— N förvalda' tail when the team is locked (selection isn't a default)", () => {
    renderSection({
      teamSizeHint: { min: 1, max: 2 },
      locked: true,
      lockedTeamIds: ["a"],
    });
    expect(screen.getByText("Underlaget anger 1–2 konsulter.")).toBeInTheDocument();
    expect(screen.queryByText(/förvalda/)).not.toBeInTheDocument();
  });
});
