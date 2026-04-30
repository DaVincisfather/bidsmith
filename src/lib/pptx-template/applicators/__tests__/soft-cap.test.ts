import { describe, expect, it, vi } from "vitest";
import { softCap } from "../_soft-cap";

describe("softCap", () => {
  it("emits a console.warn when text length exceeds threshold", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    softCap(7, "phase.objective", "x".repeat(121), 120);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("slide 7");
    expect(warn.mock.calls[0][0]).toContain("phase.objective");
    expect(warn.mock.calls[0][0]).toContain("121");
    expect(warn.mock.calls[0][0]).toContain("120");
    warn.mockRestore();
  });

  it("does not warn when text length equals threshold", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    softCap(7, "phase.objective", "x".repeat(120), 120);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("does not warn when text length is below threshold", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    softCap(11, "section.checkpoints[0]", "kort text", 80);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("does not mutate or return the input text", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const input = "x".repeat(200);
    const result = softCap(6, "phase.name", input, 40);
    expect(result).toBeUndefined();
    expect(input.length).toBe(200);
    warn.mockRestore();
  });

  it("handles empty string without warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    softCap(7, "phase.objective", "", 120);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
