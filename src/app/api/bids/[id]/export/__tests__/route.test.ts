import { describe, expect, it } from "vitest";
import * as route from "../route";

// The PPTX export is parked behind the foreign flag and unreachable from the UI,
// so it carries no behavioural tests. This guards the one property that matters
// if it is ever revived: the status flip freezes the bid, so it must not sit on
// a method the web treats as safe (full reasoning in the export-md route test).
describe("POST /api/bids/[id]/export — parked PPTX export", () => {
  it("exposes no GET handler", () => {
    expect("GET" in route).toBe(false);
  });

  it("exposes a POST handler", () => {
    expect(typeof route.POST).toBe("function");
  });
});
