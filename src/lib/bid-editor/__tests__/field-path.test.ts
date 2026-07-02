import { describe, it, expect } from "vitest";
import { getFieldValue, setFieldValue, findOverflowSection } from "../field-path";

describe("getFieldValue", () => {
  it("läser nästlat objekt-i-array (phases[0].objective)", () => {
    const content = { phases: [{ objective: "mål-text" }] };
    expect(getFieldValue(content, "phases[0].objective")).toBe("mål-text");
  });

  it("läser array-i-array (phases[1].activities[3])", () => {
    const content = { phases: [{}, { activities: ["a", "b", "c", "d"] }] };
    expect(getFieldValue(content, "phases[1].activities[3]")).toBe("d");
  });

  it("läser topp-nivå-array (checkpoints[1]) och rows[2].requirement", () => {
    expect(getFieldValue({ checkpoints: ["k0", "k1"] }, "checkpoints[1]")).toBe("k1");
    expect(
      getFieldValue({ rows: [{}, {}, { requirement: "krav" }] }, "rows[2].requirement"),
    ).toBe("krav");
  });

  it("returnerar undefined för saknad väg (utan att kasta)", () => {
    expect(getFieldValue({ phases: [] }, "phases[0].objective")).toBeUndefined();
    expect(getFieldValue({}, "rows[5].requirement")).toBeUndefined();
  });
});

describe("setFieldValue", () => {
  it("sätter nästlat värde och lämnar originalet orört (immutabelt)", () => {
    const content = { phases: [{ objective: "gammal" }] };
    const next = setFieldValue(content, "phases[0].objective", "ny") as typeof content;
    expect(next.phases[0].objective).toBe("ny");
    expect(content.phases[0].objective).toBe("gammal"); // original oförändrad
    expect(next).not.toBe(content);
    expect(next.phases).not.toBe(content.phases);
  });

  it("sätter array-index i array (phases[0].activities[2])", () => {
    const content = { phases: [{ activities: ["a", "b", "c"] }] };
    const next = setFieldValue(content, "phases[0].activities[2]", "C") as typeof content;
    expect(next.phases[0].activities[2]).toBe("C");
    expect(content.phases[0].activities[2]).toBe("c");
  });

  it("no-op (returnerar oförändrat) för saknad väg", () => {
    const content = { phases: [] as unknown[] };
    const next = setFieldValue(content, "phases[0].objective", "ny");
    expect(next).toEqual(content);
  });
});

describe("findOverflowSection", () => {
  it("väljer sektionen som är ÖVER budget, inte bara första med värde på vägen", () => {
    // Delad fieldPath över sektioner: A ryms (kort), B är över. Overflow-flaggan hör
    // till B — helpern måste välja B, inte A (annars kortas fel/redan-ok fält).
    const sections = [
      { key: "a", content: { rows: [{ requirement: "kort" }] } },
      { key: "b", content: { rows: [{ requirement: "x".repeat(200) }] } },
    ];
    const hit = findOverflowSection(sections, "rows[0].requirement", 160);
    expect(hit?.key).toBe("b");
  });

  it("returnerar undefined när ingen sektion är över budget", () => {
    const sections = [{ key: "a", content: { rows: [{ requirement: "kort" }] } }];
    expect(findOverflowSection(sections, "rows[0].requirement", 160)).toBeUndefined();
  });
});
