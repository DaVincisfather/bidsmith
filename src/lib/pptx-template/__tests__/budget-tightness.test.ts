import { describe, it, expect } from "vitest";
import {
  EDITORIAL_CAPS,
  TIGHT_RATIO,
  tightBudgetFields,
  fieldDisplayLabel,
} from "../budget-types";

describe("tightBudgetFields", () => {
  it("flaggar fält vars budget klämts under TIGHT_RATIO × redaktionellt tak", () => {
    // objective: tak 120, TIGHT_RATIO 0.9 => tröskel 108. budget 60 < 108 => trångt.
    const tight = tightBudgetFields({ "phases[*].objective": 60 });
    expect(tight).toEqual([
      { fieldPath: "phases[*].objective", budget: 60, editorialCap: 120 },
    ]);
  });

  it("flaggar INTE fält inom ±10 % av taket (bundlade activities 115/120)", () => {
    // 115 >= 0.9 * 120 (108) => ej trångt. Skyddar mot falsklarm på bundlade mallen.
    expect(tightBudgetFields({ "phases[*].activities[*]": 115 })).toEqual([]);
  });

  it("flaggar INTE editorialOnly-fält vid sitt tak (kravmatris/team)", () => {
    expect(
      tightBudgetFields({ "rows[*].requirement": 160, "members[*].role": 60 }),
    ).toEqual([]);
  });

  it("ignorerar okända fältvägar (inget tak känt)", () => {
    expect(tightBudgetFields({ "okänt[*].fält": 5 })).toEqual([]);
  });

  it("TIGHT_RATIO är 0.9 och EDITORIAL_CAPS bär alla budgeterade fält", () => {
    expect(TIGHT_RATIO).toBe(0.9);
    expect(EDITORIAL_CAPS["phases[*].name"]).toBe(40);
    expect(EDITORIAL_CAPS["rows[*].referens"]).toBe(70);
  });
});

describe("fieldDisplayLabel", () => {
  it("ger läsbar etikett för kända fält och fältvägen själv som fallback", () => {
    expect(fieldDisplayLabel("phases[*].objective")).toBe("Fas – Mål");
    expect(fieldDisplayLabel("rows[*].requirement")).toBe("Ska-krav");
    expect(fieldDisplayLabel("okänt[*].fält")).toBe("okänt[*].fält");
  });
});
