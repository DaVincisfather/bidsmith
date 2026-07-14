import { describe, expect, it } from "vitest";
import { fillText, testProse } from "../test-prose";

describe("testProse", () => {
  it("returns exactly the requested length", () => {
    for (const n of [1, 17, 80, 300, 999]) {
      expect(testProse(n)).toHaveLength(n);
    }
  });

  it("is deterministic", () => {
    expect(testProse(250)).toBe(testProse(250));
  });

  it("contains no braces (would read as tokens) and no double spaces", () => {
    const t = testProse(500);
    expect(t).not.toMatch(/[{}]/);
    expect(t).not.toMatch(/ {2}/);
  });

  it("never starts or ends with whitespace", () => {
    const t = testProse(120);
    expect(t).toBe(t.trim());
  });

  it("never produces a double period at inter-sentence cut boundaries", () => {
    for (const n of [101, 196, 290, 392, 486]) {
      const t = testProse(n);
      expect(t).toHaveLength(n);
      expect(t).not.toMatch(/\.\./);
      expect(t).toBe(t.trim());
    }
  });
});

describe("fillText", () => {
  it("starts with the guillemet marker and hits the budget exactly", () => {
    const t = fillText("Om oss", 200);
    expect(t.startsWith("«Om oss» ")).toBe(true);
    expect(t).toHaveLength(200);
  });

  it("degrades to marker-only when the budget is smaller than marker + prose", () => {
    const t = fillText("Diarienummer", 5);
    expect(t).toBe("«Diarienummer»");
  });
});
