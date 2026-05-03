import { describe, expect, it } from "vitest";
import { appendOverflowList } from "../append-overflow-list";
import type { OverflowFlag } from "@/lib/pptx-template/budget-types";

describe("appendOverflowList", () => {
  it("appends a tightening instruction with overflow detail", () => {
    const original = "Skriv genomförandeplan.";
    const overflows: OverflowFlag[] = [
      { slide: 7, fieldPath: "phases[0].objective", fieldLabel: "Fas 1 — Mål", length: 150, budget: 120 },
      { slide: 7, fieldPath: "phases[0].activities[2]", fieldLabel: "Fas 1 — Aktivitet 3", length: 145, budget: 120 },
    ];
    const result = appendOverflowList(original, overflows);
    expect(result).toContain(original);
    expect(result).toContain("Fas 1 — Mål");
    expect(result).toContain("150/120");
    expect(result).toContain("Fas 1 — Aktivitet 3");
    expect(result).toContain("145/120");
    expect(result).toMatch(/komprimera/i);
  });

  it("returns original prompt unchanged when overflows is empty", () => {
    const original = "Skriv genomförandeplan.";
    expect(appendOverflowList(original, [])).toBe(original);
  });
});
