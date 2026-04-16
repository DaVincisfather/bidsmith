import { describe, it, expect, vi } from "vitest";
import { runEval } from "../runner";
import type { EvalConfig, FieldJudgment } from "../types";

type F = { id: string; value: number };
type O = { doubled: number };

function baseConfig(overrides: Partial<EvalConfig<F, O>> = {}): EvalConfig<F, O> {
  return {
    module: "test",
    fixtureDir: "nonexistent",
    loadFixture: async () => ({ id: "f", value: 2 }),
    runModule: async (f) => ({ output: { doubled: f.value * 2 }, context: undefined }),
    judgeOutput: async (f, a): Promise<FieldJudgment[]> => [
      { field: "doubled", judge: "exact", match: a.doubled === f.value * 2, golden: f.value * 2, actual: a.doubled },
    ],
    computeFixtureMetrics: (j) => ({ "doubled.hit": j[0].match ? 1 : 0 }),
    computeAggregate: (m) => ({ "doubled.hit.mean": m.reduce((s, x) => s + (x["doubled.hit"] ?? 0), 0) / m.length }),
    ...overrides,
  };
}

describe("runEval", () => {
  it("runs fixtures, computes per-fixture + aggregate metrics", async () => {
    const fixtures: F[] = [{ id: "a", value: 2 }, { id: "b", value: 3 }];
    const config = baseConfig();

    const run = await runEval(config, fixtures);

    expect(run.module).toBe("test");
    expect(run.fixtures).toHaveLength(2);
    expect(run.fixtures[0].metrics["doubled.hit"]).toBe(1);
    expect(run.aggregate["doubled.hit.mean"]).toBe(1);
    expect(run.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("captures module errors per fixture without crashing the run", async () => {
    const fixtures: F[] = [{ id: "a", value: 2 }, { id: "b", value: 3 }];
    const config = baseConfig({
      runModule: vi.fn()
        .mockResolvedValueOnce({ output: { doubled: 4 }, context: undefined })
        .mockRejectedValueOnce(new Error("module boom")),
    });

    const run = await runEval(config, fixtures);

    expect(run.fixtures[0].error).toBeUndefined();
    expect(run.fixtures[1].error).toMatch(/module boom/);
    expect(run.fixtures[1].judgments).toEqual([]);
  });

  it("captures judge errors as judge_error without crashing", async () => {
    const fixtures: F[] = [{ id: "a", value: 2 }];
    const config = baseConfig({
      judgeOutput: async () => { throw new Error("judge boom"); },
    });

    const run = await runEval(config, fixtures);

    expect(run.fixtures[0].error).toMatch(/judge boom/);
  });
});
