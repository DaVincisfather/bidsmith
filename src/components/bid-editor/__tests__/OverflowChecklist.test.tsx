import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OverflowChecklist } from "../OverflowChecklist";
import type { OverflowFlag } from "@/lib/pptx-template/budget-types";

describe("OverflowChecklist", () => {
  it("renders empty-state when no flags", () => {
    render(<OverflowChecklist flags={[]} onJumpToField={() => {}} />);
    expect(screen.getByText(/redo för export/i)).toBeInTheDocument();
  });

  it("groups flags by slide and shows label + length/budget", () => {
    const flags: OverflowFlag[] = [
      { slide: 7, fieldPath: "phases[0].objective", fieldLabel: "Fas 1 — Mål", length: 145, budget: 120 },
      { slide: 7, fieldPath: "phases[0].activities[2]", fieldLabel: "Fas 1 — Aktivitet 3", length: 130, budget: 120 },
      { slide: 11, fieldPath: "checkpoints[2]", fieldLabel: "Avstämningspunkt 3", length: 95, budget: 80 },
    ];
    render(<OverflowChecklist flags={flags} onJumpToField={() => {}} />);
    expect(screen.getByText(/Slide 7/)).toBeInTheDocument();
    expect(screen.getByText(/Slide 11/)).toBeInTheDocument();
    expect(screen.getByText(/Fas 1 — Mål/)).toBeInTheDocument();
    expect(screen.getByText(/145\/120/)).toBeInTheDocument();
  });

  it("calls onJumpToField with the flag when row is clicked", () => {
    const onJump = vi.fn();
    const flag: OverflowFlag = {
      slide: 7,
      fieldPath: "phases[0].objective",
      fieldLabel: "Fas 1 — Mål",
      length: 145,
      budget: 120,
    };
    render(<OverflowChecklist flags={[flag]} onJumpToField={onJump} />);
    fireEvent.click(screen.getByText(/Fas 1 — Mål/));
    expect(onJump).toHaveBeenCalledWith(flag);
  });
});
