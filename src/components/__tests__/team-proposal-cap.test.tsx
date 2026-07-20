import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TeamProposal } from "../team-proposal";

const scored = [
  { consultantId: "a", consultantName: "Anna", level: "senior", score: 90, reasoning: "" },
  { consultantId: "b", consultantName: "Bo", level: "senior", score: 80, reasoning: "" },
  { consultantId: "c", consultantName: "Cecilia", level: "senior", score: 70, reasoning: "" },
];

describe("TeamProposal cap", () => {
  it("locks out unselected consultants when the team is at the cap", () => {
    render(
      <TeamProposal
        scoredConsultants={scored}
        selectedIds={new Set(["a", "b"])}
        onToggle={vi.fn()}
        maxTeamSize={2}
      />,
    );
    // Selected rows stay toggleable; the unselected one is disabled at the cap.
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    const checked = boxes.filter((b) => b.checked);
    const unchecked = boxes.filter((b) => !b.checked);
    expect(checked.every((b) => !b.disabled)).toBe(true);
    expect(unchecked.every((b) => b.disabled)).toBe(true);
    expect(screen.getByText(/Max 2 konsulter/)).toBeTruthy();
  });

  it("leaves all rows toggleable below the cap", () => {
    render(
      <TeamProposal
        scoredConsultants={scored}
        selectedIds={new Set(["a"])}
        onToggle={vi.fn()}
        maxTeamSize={5}
      />,
    );
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.every((b) => !b.disabled)).toBe(true);
  });
});
