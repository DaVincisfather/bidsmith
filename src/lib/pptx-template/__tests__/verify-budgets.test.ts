import { describe, expect, it, vi } from "vitest";
import { verifyFieldBudgets } from "../verify-budgets";

describe("verifyFieldBudgets", () => {
  it("returns pass=true and empty overflows when all fields are under budget", () => {
    const data = { phases: [{ objective: "kort" }] };
    const budgets = { "phases[*].objective": 120 };
    const { pass, overflows } = verifyFieldBudgets(data, budgets);
    expect(pass).toBe(true);
    expect(overflows).toEqual([]);
  });

  it("flags single overflow with resolved path and field metadata", () => {
    const data = { phases: [{ objective: "x".repeat(150) }] };
    const budgets = { "phases[*].objective": 120 };
    const { pass, overflows } = verifyFieldBudgets(data, budgets);
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
    const budgets = { "phases[*].activities[*]": 120 };
    const { pass, overflows } = verifyFieldBudgets(data, budgets);
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
    const budgets = {
      "phases[*].objective": 120,
      "phases[*].activities[*]": 120,
      "checkpoints[*]": 80,
    };
    const { pass } = verifyFieldBudgets(data, budgets);
    expect(pass).toBe(true);
  });

  it("handles non-string leaf values gracefully (skip, no throw)", () => {
    const data = { phases: [{ hoursEstimate: 80 }] };
    const budgets = { "phases[*].hoursEstimate": 120 };
    const { pass } = verifyFieldBudgets(data, budgets);
    expect(pass).toBe(true);
  });

  it("handles empty data without throwing", () => {
    const { pass } = verifyFieldBudgets({}, { "phases[*].objective": 120 });
    expect(pass).toBe(true);
  });

  it("warns and skips when budget key has no FIELD_METADATA entry", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const data = { foo: { bar: "x".repeat(150) } };
    const budgets = { "foo.bar": 120 };
    const { pass, overflows } = verifyFieldBudgets(data, budgets);
    expect(pass).toBe(true);
    expect(overflows).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("foo.bar");
    expect(warn.mock.calls[0][0]).toContain("FIELD_METADATA");
    warn.mockRestore();
  });

  it("works for top-level array wildcard (checkpoints[*])", () => {
    const data = { checkpoints: ["kort", "x".repeat(100)] };
    const budgets = { "checkpoints[*]": 80 };
    const { overflows } = verifyFieldBudgets(data, budgets);
    expect(overflows).toHaveLength(1);
    expect(overflows[0].fieldPath).toBe("checkpoints[1]");
    expect(overflows[0].slide).toBe(11);
  });
});
