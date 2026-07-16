import { describe, it, expect } from "vitest";
import { effectiveBudget, PROSE_BUDGET_FACTOR } from "../budget-rules";
import { SHORT_FIELD_MAX_CHARS } from "../short-field";

describe("effectiveBudget (loop varv 3: prosa-säkerhetsfaktor)", () => {
  it("skalar prosa-budgetar med faktorn, avrundat nedåt till jämna 10", () => {
    expect(effectiveBudget(600)).toBe(510); // 600 × 0.85 = 510
    expect(effectiveBudget(830)).toBe(700); // 705.5 → 700
    expect(effectiveBudget(110)).toBe(90); // 93.5 → 90
  });

  it("rör inte kortfält (<= SHORT_FIELD_MAX_CHARS)", () => {
    expect(effectiveBudget(80)).toBe(80);
    expect(effectiveBudget(30)).toBe(30);
    expect(effectiveBudget(70)).toBe(70);
  });

  it("skalar aldrig en prosa-slot över kortfältströskeln (klassflipp)", () => {
    // 90 × 0.85 = 76.5 → floor10 = 70, men golvet håller den kvar som prosa.
    expect(effectiveBudget(90)).toBe(SHORT_FIELD_MAX_CHARS + 1);
    for (let b = SHORT_FIELD_MAX_CHARS + 1; b <= 400; b += 1) {
      const eff = effectiveBudget(b)!;
      expect(eff).toBeGreaterThan(SHORT_FIELD_MAX_CHARS);
      expect(eff).toBeLessThanOrEqual(b);
    }
  });

  it("är oförändrad för undefined", () => {
    expect(effectiveBudget(undefined)).toBeUndefined();
  });

  it("faktorn ligger i det motiverade bandet (mot 1,1-1,25× överdrag)", () => {
    expect(PROSE_BUDGET_FACTOR).toBeGreaterThanOrEqual(0.75);
    expect(PROSE_BUDGET_FACTOR).toBeLessThan(1);
  });
});
