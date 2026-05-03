import { describe, expect, it, vi } from "vitest";
import { withBudgetRetry } from "../with-budget-retry";

const budgets = { "phases[*].objective": 120 };

describe("withBudgetRetry", () => {
  it("returns output unchanged on first-try pass", async () => {
    const callLLM = vi.fn().mockResolvedValue({ phases: [{ objective: "kort" }] });
    const retryBudget = { remaining: 5 };
    const { output, overflows } = await withBudgetRetry({
      basePrompt: "P",
      callLLM,
      budgets,
      retryBudget,
    });
    expect(callLLM).toHaveBeenCalledTimes(1);
    expect(callLLM).toHaveBeenCalledWith("P");
    expect(overflows).toEqual([]);
    expect(output).toEqual({ phases: [{ objective: "kort" }] });
    expect(retryBudget.remaining).toBe(5);
  });

  it("retries once with tightened prompt on overflow, decrements retry-budget", async () => {
    const callLLM = vi
      .fn()
      .mockResolvedValueOnce({ phases: [{ objective: "x".repeat(150) }] })
      .mockResolvedValueOnce({ phases: [{ objective: "kort" }] });
    const retryBudget = { remaining: 5 };
    const { output, overflows } = await withBudgetRetry({
      basePrompt: "P",
      callLLM,
      budgets,
      retryBudget,
    });
    expect(callLLM).toHaveBeenCalledTimes(2);
    expect(callLLM.mock.calls[1][0]).toContain("KORRIGERING NÖDVÄNDIG");
    expect(overflows).toEqual([]);
    expect(output).toEqual({ phases: [{ objective: "kort" }] });
    expect(retryBudget.remaining).toBe(4);
  });

  it("returns final overflows when retry also overflows", async () => {
    const callLLM = vi
      .fn()
      .mockResolvedValueOnce({ phases: [{ objective: "x".repeat(150) }] })
      .mockResolvedValueOnce({ phases: [{ objective: "y".repeat(140) }] });
    const retryBudget = { remaining: 5 };
    const { output, overflows } = await withBudgetRetry({
      basePrompt: "P",
      callLLM,
      budgets,
      retryBudget,
    });
    expect(callLLM).toHaveBeenCalledTimes(2);
    expect(overflows).toHaveLength(1);
    expect(overflows[0].length).toBe(140);
    expect(output).toEqual({ phases: [{ objective: "y".repeat(140) }] });
    expect(retryBudget.remaining).toBe(4);
  });

  it("does not retry when retry-budget is exhausted, flags directly", async () => {
    const callLLM = vi.fn().mockResolvedValue({ phases: [{ objective: "x".repeat(150) }] });
    const retryBudget = { remaining: 0 };
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { overflows } = await withBudgetRetry({
      basePrompt: "P",
      callLLM,
      budgets,
      retryBudget,
    });
    expect(callLLM).toHaveBeenCalledTimes(1);
    expect(overflows).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("retry-cap reached"));
    warnSpy.mockRestore();
  });
});
