import { describe, expect, it } from "vitest";
import { renderBudgetTable } from "../render-budget-table";

describe("renderBudgetTable", () => {
  it("renders relevant keys with labels and limits", () => {
    const out = renderBudgetTable(
      { "phases[*].objective": 120, "checkpoints[*]": 80 },
      ["phases[*].objective"],
    );
    expect(out).toContain("objective: max 120 tecken");
    expect(out).not.toContain("checkpoints");
    expect(out).toContain("TEXT-LIMITS");
  });

  it("returns empty string when no relevant keys are present in budgets", () => {
    expect(renderBudgetTable({}, ["phases[*].objective"])).toBe("");
  });

  it("returns empty string when relevantKeys is empty", () => {
    expect(renderBudgetTable({ "phases[*].objective": 120 }, [])).toBe("");
  });
});
