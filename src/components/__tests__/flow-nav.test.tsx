import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FlowNav } from "../flow-nav";

describe("FlowNav", () => {
  it("disables Go/No-Go and Anbud on a fresh analysis, with explanatory tooltips", () => {
    render(
      <FlowNav analysisId="a-1" active="analysis" gonogoEnabled={false} bidId={null} />,
    );
    expect(screen.getByText("Analys & team")).toHaveAttribute("aria-current", "step");
    const gonogo = screen.getByText("Go/No-Go");
    expect(gonogo.closest("a")).toBeNull();
    expect(gonogo).toHaveAttribute("title", "Lås teamet först");
    const bid = screen.getByText("Anbud");
    expect(bid.closest("a")).toBeNull();
    expect(bid).toHaveAttribute("title", "Kör Go/No-Go och generera först");
  });

  it("links completed steps to their pages", () => {
    render(
      <FlowNav analysisId="a-1" active="gonogo" gonogoEnabled={true} bidId="b-1" />,
    );
    expect(screen.getByText("Analys & team").closest("a")).toHaveAttribute(
      "href", "/analysis/a-1",
    );
    expect(screen.getByText("Go/No-Go")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("Anbud").closest("a")).toHaveAttribute("href", "/bids/b-1");
  });

  it("marks a failed bid in the step label", () => {
    render(
      <FlowNav analysisId="a-1" active="gonogo" gonogoEnabled={true} bidId="b-1" bidFailed />,
    );
    expect(screen.getByText(/misslyckad/)).toBeInTheDocument();
  });
});
