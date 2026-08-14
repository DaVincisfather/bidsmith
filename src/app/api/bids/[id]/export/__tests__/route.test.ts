import { describe, expect, it } from "vitest";
import * as route from "../route";

// The PPTX export is parked behind the foreign flag and unreachable from the UI,
// so it carries no behavioural tests. It no longer flips status (submission
// split 2026-08-14 — the flip lives on /submit), but it stays POST for parity
// with the Markdown route; this guards against a GET quietly returning.
describe("POST /api/bids/[id]/export — parked PPTX export", () => {
  it("exposes no GET handler", () => {
    expect("GET" in route).toBe(false);
  });

  it("exposes a POST handler", () => {
    expect(typeof route.POST).toBe("function");
  });
});
