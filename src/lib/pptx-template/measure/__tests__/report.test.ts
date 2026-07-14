import { describe, expect, it } from "vitest";
import { buildReport, exitCodeFor, renderTextReport } from "../report";
import type { Finding } from "../types";

const f = (over: Partial<Finding>): Finding => ({
  checkId: "vertical-overflow", severity: "FAIL", slide: 1, shape: "TextBox 1", detail: "d", ...over,
});

describe("buildReport", () => {
  it("groups findings per slide, counts severities, versions the schema", () => {
    const r = buildReport("anbud.pptx", 12, [f({}), f({ slide: 3, severity: "WARN", checkId: "horizontal-clip" }), f({ slide: 3, severity: "INFO", checkId: "deadspace" })]);
    expect(r.schemaVersion).toBe(1);
    expect(r.slideCount).toBe(12);
    expect(r.slides.map((s) => s.slide)).toEqual([1, 3]);
    expect(r.summary).toEqual({ fail: 1, warn: 1, info: 1 });
  });
  it("clean deck → empty slides, zero summary", () => {
    const r = buildReport("anbud.pptx", 12, []);
    expect(r.slides).toEqual([]);
    expect(r.summary).toEqual({ fail: 0, warn: 0, info: 0 });
  });
});

describe("exitCodeFor", () => {
  it("2 on FAIL, 1 on WARN-only, 0 clean", () => {
    expect(exitCodeFor(buildReport("d", 1, [f({})]))).toBe(2);
    expect(exitCodeFor(buildReport("d", 1, [f({ severity: "WARN" })]))).toBe(1);
    expect(exitCodeFor(buildReport("d", 1, [f({ severity: "INFO" })]))).toBe(0);
    expect(exitCodeFor(buildReport("d", 1, []))).toBe(0);
  });
});

describe("renderTextReport", () => {
  it("prints one line per finding with slide, severity, check and detail", () => {
    const text = renderTextReport(buildReport("anbud.pptx", 12, [f({})]));
    expect(text).toContain("slide 1");
    expect(text).toContain("FAIL");
    expect(text).toContain("vertical-overflow");
  });
});
