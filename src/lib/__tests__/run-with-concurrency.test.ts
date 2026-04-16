import { describe, it, expect } from "vitest";
import { runWithConcurrency } from "@/lib/bid-generator";

describe("runWithConcurrency", () => {
  it("returns results in input order", async () => {
    const tasks = [1, 2, 3, 4, 5].map((n) => async () => {
      await new Promise((r) => setTimeout(r, (6 - n) * 5));
      return n;
    });
    expect(await runWithConcurrency(tasks, 3)).toEqual([1, 2, 3, 4, 5]);
  });

  it("caps concurrency at the limit", async () => {
    let active = 0;
    let peak = 0;
    const tasks = Array.from({ length: 12 }, (_, i) => async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
      return i;
    });
    const results = await runWithConcurrency(tasks, 5);
    expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(peak).toBeLessThanOrEqual(5);
    expect(peak).toBeGreaterThan(0);
  });

  it("handles empty task list", async () => {
    expect(await runWithConcurrency([], 5)).toEqual([]);
  });

  it("handles limit larger than task count", async () => {
    const tasks = [async () => "a", async () => "b"];
    expect(await runWithConcurrency(tasks, 10)).toEqual(["a", "b"]);
  });
});
