import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OutcomeEnrichmentForm } from "../OutcomeEnrichmentForm";

describe("OutcomeEnrichmentForm", () => {
  it("shows all three fields when outcome is 'lost'", () => {
    render(
      <OutcomeEnrichmentForm outcome="lost" onSave={vi.fn()} onSkip={vi.fn()} />
    );
    expect(screen.getByLabelText(/Vem vann/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Varför/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Fri kommentar/i)).toBeInTheDocument();
  });

  it("only shows 'Fri kommentar' for 'won' outcome", () => {
    render(
      <OutcomeEnrichmentForm outcome="won" onSave={vi.fn()} onSkip={vi.fn()} />
    );
    expect(screen.queryByLabelText(/Vem vann/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Varför/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Fri kommentar/i)).toBeInTheDocument();
  });

  it("calls onSave with form values on Spara click", () => {
    const onSave = vi.fn();
    render(
      <OutcomeEnrichmentForm outcome="lost" onSave={onSave} onSkip={vi.fn()} />
    );
    fireEvent.change(screen.getByLabelText(/Vem vann/i), {
      target: { value: "Acme" },
    });
    fireEvent.change(screen.getByLabelText(/Varför/i), {
      target: { value: "pris" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Spara/i }));
    expect(onSave).toHaveBeenCalledWith({
      competitorName: "Acme",
      lossReason: "pris",
      lossComment: "",
    });
  });

  it("calls onSkip on Hoppa över", () => {
    const onSkip = vi.fn();
    render(
      <OutcomeEnrichmentForm outcome="lost" onSave={vi.fn()} onSkip={onSkip} />
    );
    fireEvent.click(screen.getByRole("button", { name: /Hoppa över/i }));
    expect(onSkip).toHaveBeenCalled();
  });
});
