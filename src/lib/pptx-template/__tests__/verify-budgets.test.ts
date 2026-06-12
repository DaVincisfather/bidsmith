import { describe, expect, it, vi } from "vitest";
import { verifyFieldBudgets } from "../verify-budgets";

describe("verifyFieldBudgets", () => {
  it("returns pass=true and empty overflows when all fields are under budget", () => {
    const data = { phases: [{ objective: "kort" }] };
    const { pass, overflows } = verifyFieldBudgets(data, {
      budgets: { "phases[*].objective": 120 },
      fieldSlides: { "phases[*].objective": 7 },
    });
    expect(pass).toBe(true);
    expect(overflows).toEqual([]);
  });

  it("flags single overflow with resolved path and field metadata", () => {
    const data = { phases: [{ objective: "x".repeat(150) }] };
    const { pass, overflows } = verifyFieldBudgets(data, {
      budgets: { "phases[*].objective": 120 },
      fieldSlides: { "phases[*].objective": 7 },
    });
    expect(pass).toBe(false);
    expect(overflows).toHaveLength(1);
    expect(overflows[0]).toMatchObject({
      fieldPath: "phases[0].objective",
      length: 150,
      budget: 120,
      slide: 7,
      fieldLabel: "Fas 1 — Mål",
    });
  });

  it("expands wildcard arrays correctly", () => {
    const data = {
      phases: [
        { activities: ["kort", "x".repeat(130)] },
        { activities: ["x".repeat(140)] },
      ],
    };
    const { pass, overflows } = verifyFieldBudgets(data, {
      budgets: { "phases[*].activities[*]": 120 },
      fieldSlides: { "phases[*].activities[*]": 7 },
    });
    expect(pass).toBe(false);
    expect(overflows.map((o) => o.fieldPath)).toEqual([
      "phases[0].activities[1]",
      "phases[1].activities[0]",
    ]);
    expect(overflows.map((o) => o.fieldLabel)).toEqual([
      "Fas 1 — Aktivitet 2",
      "Fas 2 — Aktivitet 1",
    ]);
  });

  it("ignores fields that don't exist in data (no false positives)", () => {
    const data = { phases: [{ objective: "kort" }] };
    const { pass } = verifyFieldBudgets(data, {
      budgets: {
        "phases[*].objective": 120,
        "phases[*].activities[*]": 120,
        "checkpoints[*]": 80,
      },
      fieldSlides: {
        "phases[*].objective": 7,
        "phases[*].activities[*]": 7,
        "checkpoints[*]": 11,
      },
    });
    expect(pass).toBe(true);
  });

  it("handles non-string leaf values gracefully (skip, no throw)", () => {
    const data = { phases: [{ hoursEstimate: 80 }] };
    const { pass } = verifyFieldBudgets(data, {
      budgets: { "phases[*].hoursEstimate": 120 },
      fieldSlides: { "phases[*].hoursEstimate": 7 },
    });
    expect(pass).toBe(true);
  });

  it("handles empty data without throwing", () => {
    const { pass } = verifyFieldBudgets(
      {},
      { budgets: { "phases[*].objective": 120 }, fieldSlides: { "phases[*].objective": 7 } },
    );
    expect(pass).toBe(true);
  });

  it("fält utan fieldSlides-post verifieras med slide 0 + console.warn", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { overflows } = verifyFieldBudgets(
      { fritext: "x".repeat(99) },
      { budgets: { fritext: 10 }, fieldSlides: {} },
    );
    expect(overflows[0].slide).toBe(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("fritext"));
    warn.mockRestore();
  });

  it("works for top-level array wildcard (checkpoints[*])", () => {
    const data = { checkpoints: ["kort", "x".repeat(100)] };
    const { overflows } = verifyFieldBudgets(data, {
      budgets: { "checkpoints[*]": 80 },
      fieldSlides: { "checkpoints[*]": 11 },
    });
    expect(overflows).toHaveLength(1);
    expect(overflows[0].fieldPath).toBe("checkpoints[1]");
    expect(overflows[0].slide).toBe(11);
  });
});
