import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SummaryView } from "../SummaryView";
import type { DraftSlot } from "@/lib/pptx-template/onboarding/draft";

function makeSlot(overrides: Partial<DraftSlot>): DraftSlot {
  return {
    source: 1, shapeIndex: 1, shapeText: "Beskriv er metod",
    token: "{Metod}", capability: "understanding", intent: "Leverantörens metodbeskrivning",
    confidence: "high", decision: "confirmed",
    ...overrides,
  };
}

describe("SummaryView", () => {
  it("visar amber-varning när pending-slots finns", () => {
    const slots = [makeSlot({ decision: "confirmed" }), makeSlot({ shapeIndex: 2, decision: "pending" })];
    render(
      <SummaryView slots={slots} confirmed={1} saving={false} uiError={null} onBack={vi.fn()} onComplete={vi.fn()} />,
    );
    expect(screen.getByText(/1 textruta är ej beslutad/)).toBeInTheDocument();
  });

  it("pluraliserar varningen för fler än en pending-slot", () => {
    const slots = [
      makeSlot({ shapeIndex: 1, decision: "pending" }),
      makeSlot({ shapeIndex: 2, decision: "pending" }),
    ];
    render(
      <SummaryView slots={slots} confirmed={0} saving={false} uiError={null} onBack={vi.fn()} onComplete={vi.fn()} />,
    );
    expect(screen.getByText(/2 textrutor är ej beslutade/)).toBeInTheDocument();
  });

  it("visar ingen varning utan pending-slots", () => {
    const slots = [makeSlot({ decision: "confirmed" }), makeSlot({ shapeIndex: 2, decision: "skipped" })];
    render(
      <SummaryView slots={slots} confirmed={1} saving={false} uiError={null} onBack={vi.fn()} onComplete={vi.fn()} />,
    );
    expect(screen.queryByText(/ej beslutad/)).not.toBeInTheDocument();
  });
});
