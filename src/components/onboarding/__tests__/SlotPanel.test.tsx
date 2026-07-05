import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SlotPanel } from "../SlotPanel";

const slot = {
  source: 1, shapeIndex: 1, shapeText: "Beskriv er metod",
  token: "{Metod}", capability: "understanding" as const,
  intent: "Leverantörens metodbeskrivning", confidence: "high" as const,
  decision: "pending" as const,
};

describe("SlotPanel", () => {
  it("Bekräfta skickar redigerad token + intent", () => {
    const onDecide = vi.fn();
    render(<SlotPanel slot={slot} onDecide={onDecide} saving={false} />);
    fireEvent.change(screen.getByLabelText(/tokennamn/i), { target: { value: "Vår metod" } });
    fireEvent.change(screen.getByLabelText(/syfte/i), { target: { value: "Metod och arbetssätt" } });
    fireEvent.click(screen.getByRole("button", { name: /bekräfta/i }));
    expect(onDecide).toHaveBeenCalledWith({
      decision: "confirmed", token: "{Vår metod}", intent: "Metod och arbetssätt",
    });
  });

  it("Skippa skickar skipped", () => {
    const onDecide = vi.fn();
    render(<SlotPanel slot={slot} onDecide={onDecide} saving={false} />);
    fireEvent.click(screen.getByRole("button", { name: /skippa/i }));
    expect(onDecide).toHaveBeenCalledWith({ decision: "skipped" });
  });

  it("visar förmåge-gissningen som info, inte som val", () => {
    render(<SlotPanel slot={slot} onDecide={vi.fn()} saving={false} />);
    expect(screen.getByText(/understanding/i)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
