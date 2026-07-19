import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HealthReport } from "../HealthReport";
import type { TemplateDefect, TemplateMeasurement } from "@/lib/pptx-template/template-profile";

const measurement: TemplateMeasurement = {
  status: "complete",
  measuredAt: "2026-07-19T10:00:00Z",
  calibrationRounds: 1,
  unresolved: [],
  slotWarnings: {},
};

function makeDefect(overrides: Partial<TemplateDefect>): TemplateDefect {
  return {
    slide: 2,
    checkId: "vertical-overflow",
    shape: "Text 5",
    note: "text 43.2pt > box 26pt",
    suggestion: "Förhöj eller bredda boxen i mallen, eller acceptera defekten (text 43.2pt > box 26pt).",
    status: "open",
    ...overrides,
  };
}

describe("HealthReport", () => {
  it("visar grön klar-rad och ingen tabell när det inte finns några defekter", () => {
    render(
      <HealthReport measurement={measurement} knownDefects={[]} onAccept={vi.fn()} saving={false} uiError={null} />,
    );
    expect(screen.getByText(/klar för aktivering/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("listar öppna defekter med acceptera-knapp, ingen klar-rad", () => {
    const defects = [makeDefect({})];
    render(
      <HealthReport measurement={measurement} knownDefects={defects} onAccept={vi.fn()} saving={false} uiError={null} />,
    );
    expect(screen.getByText("Text 5")).toBeInTheDocument();
    expect(screen.getByText("vertical-overflow")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /acceptera/i })).toBeInTheDocument();
    expect(screen.queryByText(/klar för aktivering/i)).not.toBeInTheDocument();
  });

  it("acceptera-knappen anropar onAccept med defektens signatur", () => {
    const onAccept = vi.fn();
    const defects = [makeDefect({ slide: 4, checkId: "gross-overflow", shape: "Text 9" })];
    render(
      <HealthReport measurement={measurement} knownDefects={defects} onAccept={onAccept} saving={false} uiError={null} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /acceptera/i }));
    expect(onAccept).toHaveBeenCalledWith({ slide: 4, checkId: "gross-overflow", shape: "Text 9" });
  });

  it("accepterade defekter döljer knappen och grön klar-rad visas ovanför tabellen", () => {
    const defects = [makeDefect({ status: "accepted" })];
    render(
      <HealthReport measurement={measurement} knownDefects={defects} onAccept={vi.fn()} saving={false} uiError={null} />,
    );
    expect(screen.getByText(/klar för aktivering/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /acceptera/i })).not.toBeInTheDocument();
    expect(screen.getByText("Accepterad ✓")).toBeInTheDocument();
  });

  it("visar unresolved-tokens och slotWarnings kompakt (informativt)", () => {
    const m: TemplateMeasurement = {
      ...measurement,
      unresolved: ["{Vår metod}"],
      slotWarnings: { "{Fas 1}": ["autofit krympte till 80%"] },
    };
    render(<HealthReport measurement={m} knownDefects={[]} onAccept={vi.fn()} saving={false} uiError={null} />);
    expect(screen.getByText(/mättes aldrig/i)).toHaveTextContent("{Vår metod}");
    expect(screen.getByText(/kalibreringsvarningar/i)).toBeInTheDocument();
    expect(screen.getByText(/autofit krympte till 80%/)).toBeInTheDocument();
  });

  it("visar uiError när satt", () => {
    render(
      <HealthReport measurement={measurement} knownDefects={[]} onAccept={vi.fn()} saving={false} uiError="nätverksfel" />,
    );
    expect(screen.getByText(/nätverksfel/)).toBeInTheDocument();
  });
});
