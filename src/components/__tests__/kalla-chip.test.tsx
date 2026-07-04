import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { KallaChip, FlaggedPill, SourceQuote } from "../kalla-chip";

describe("KallaChip", () => {
  it("renderar en källa-chip som är kollapsad från början (citatet dolt)", () => {
    render(<KallaChip quote="Ordagrant citat ur RFP" />);
    const chip = screen.getByRole("button", { name: /källa/i });
    expect(chip).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/Ordagrant citat ur RFP/)).not.toBeInTheDocument();
  });

  it("togglar citatets synlighet vid klick (öppna → stäng)", () => {
    render(<KallaChip quote="Ordagrant citat ur RFP" />);
    const chip = screen.getByRole("button", { name: /källa/i });

    fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-expanded", "true");
    // Citatet omslutet av svenska citationstecken.
    expect(screen.getByText(/”Ordagrant citat ur RFP”/)).toBeInTheDocument();

    fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/Ordagrant citat ur RFP/)).not.toBeInTheDocument();
  });
});

describe("FlaggedPill", () => {
  it("renderar 'obelagd' och är inte en knapp (ej expanderbar)", () => {
    render(<FlaggedPill />);
    expect(screen.getByText(/obelagd/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("SourceQuote", () => {
  it("omsluter citatet med svenska citationstecken", () => {
    render(<SourceQuote quote="Ett citat" />);
    expect(screen.getByText(/”Ett citat”/)).toBeInTheDocument();
  });
});
