import { describe, it, expect } from "vitest";
import { loadThresholds, categorize } from "../thresholds";
import path from "path";

describe("loadThresholds", () => {
  it("loads thresholds.yaml from project root", async () => {
    const t = await loadThresholds(path.resolve(__dirname, "../../../thresholds.yaml"));
    expect(t.analyzer["requirements.f1"].green).toBe(0.85);
    expect(t.matcher["mhc.mean"].yellow).toBe(0.80);
  });
});

describe("categorize", () => {
  const thresholds = { green: 0.85, yellow: 0.70 };

  it("returns green for value >= green threshold", () => {
    expect(categorize(0.90, thresholds)).toBe("green");
    expect(categorize(0.85, thresholds)).toBe("green");
  });

  it("returns yellow for value between yellow and green", () => {
    expect(categorize(0.80, thresholds)).toBe("yellow");
    expect(categorize(0.70, thresholds)).toBe("yellow");
  });

  it("returns red for value below yellow", () => {
    expect(categorize(0.65, thresholds)).toBe("red");
  });

  it("returns 'unknown' when no threshold defined", () => {
    expect(categorize(0.5, undefined)).toBe("unknown");
  });
});
