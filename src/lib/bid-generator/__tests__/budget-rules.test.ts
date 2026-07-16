import { describe, it, expect } from "vitest";
import { effectiveBudget } from "../budget-rules";

describe("effectiveBudget", () => {
  it("är identitet i basläget (inga regler aktiva)", () => {
    expect(effectiveBudget(540)).toBe(540);
    expect(effectiveBudget(80)).toBe(80);
    expect(effectiveBudget(undefined)).toBeUndefined();
  });
});
