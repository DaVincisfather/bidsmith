import { describe, it, expect } from "vitest";
import { mapWithConcurrency } from "../concurrency";

function defer<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("mapWithConcurrency", () => {
  it("returns results in input order regardless of completion order", async () => {
    const items = [10, 5, 30, 1, 20];
    const result = await mapWithConcurrency(items, 3, async (x) => {
      // Smaller delays finish first, but result indexing must follow input order.
      await new Promise((r) => setTimeout(r, x));
      return x * 2;
    });
    expect(result).toEqual([20, 10, 60, 2, 40]);
  });

  it("respects the concurrency limit", async () => {
    const limit = 3;
    const items = Array.from({ length: 10 }, (_, i) => i);
    let active = 0;
    let maxActive = 0;
    const deferreds = items.map(() => defer<void>());

    const pending = mapWithConcurrency(items, limit, async (_, i) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await deferreds[i].promise;
      active--;
      return i;
    });

    // Let the workers reach the await point before resolving any of them.
    await new Promise((r) => setTimeout(r, 10));
    expect(active).toBe(limit); // saturated, never above limit

    // Resolve in arbitrary order, ensuring the cap holds throughout.
    for (let i = 0; i < items.length; i++) {
      deferreds[i].resolve();
      await new Promise((r) => setTimeout(r, 1));
    }

    const out = await pending;
    expect(out).toEqual(items);
    expect(maxActive).toBe(limit);
  });

  it("returns empty array on empty input", async () => {
    const out = await mapWithConcurrency([], 5, async () => "should-not-be-called");
    expect(out).toEqual([]);
  });

  it("handles limit larger than input length", async () => {
    const out = await mapWithConcurrency([1, 2, 3], 100, async (x) => x + 1);
    expect(out).toEqual([2, 3, 4]);
  });
});
