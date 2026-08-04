import { describe, it, expect } from "vitest";
import { isActivelyGenerating, STALE_GENERATING_MS } from "../bid-status";

describe("isActivelyGenerating", () => {
  it("is false for non-generating statuses regardless of age", () => {
    expect(isActivelyGenerating({ status: "draft", created_at: new Date().toISOString() })).toBe(false);
    expect(isActivelyGenerating({ status: "failed", created_at: null })).toBe(false);
  });
  it("is true for a fresh generating row", () => {
    expect(isActivelyGenerating({ status: "generating", created_at: new Date().toISOString() })).toBe(true);
  });
  it("is false for a generating row older than the stale threshold (dead job)", () => {
    const stale = new Date(Date.now() - STALE_GENERATING_MS - 60_000).toISOString();
    expect(isActivelyGenerating({ status: "generating", created_at: stale })).toBe(false);
  });
  it("treats missing created_at as fresh (fail safe)", () => {
    expect(isActivelyGenerating({ status: "generating", created_at: null })).toBe(true);
  });
});
