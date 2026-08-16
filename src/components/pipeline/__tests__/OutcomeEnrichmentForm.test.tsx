import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OutcomeEnrichmentForm } from "../OutcomeEnrichmentForm";

describe("OutcomeEnrichmentForm", () => {
  it("visar alla tre fälten when outcome is 'lost'", () => {
    render(
      <OutcomeEnrichmentForm outcome="lost" onSave={vi.fn()} onSkip={vi.fn()} />
    );
    expect(screen.getByLabelText(/Mot vem/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Främsta skäl/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Kommentar/i)).toBeInTheDocument();
  });

  it("visar bara kommentarfältet för 'won'", () => {
    render(
      <OutcomeEnrichmentForm outcome="won" onSave={vi.fn()} onSkip={vi.fn()} />
    );
    expect(screen.queryByLabelText(/Mot vem/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Främsta skäl/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Kommentar/i)).toBeInTheDocument();
  });

  it("calls onSave with form values on Spara click", () => {
    const onSave = vi.fn();
    render(
      <OutcomeEnrichmentForm outcome="lost" onSave={onSave} onSkip={vi.fn()} />
    );
    fireEvent.change(screen.getByLabelText(/Mot vem/i), {
      target: { value: "Acme" },
    });
    fireEvent.change(screen.getByLabelText(/Främsta skäl/i), {
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
