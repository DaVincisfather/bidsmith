import { describe, it, expect } from "vitest";
import {
  computeProfileFields,
  countFilled,
  PROFILE_BID_SECTIONS,
} from "../profile-impact";

describe("computeProfileFields", () => {
  it("null profil → alla tre fält tomma", () => {
    const fields = computeProfileFields(null);
    expect(fields.map((f) => f.key)).toEqual(["companyName", "tonality", "boilerplate"]);
    expect(fields.every((f) => !f.filled)).toBe(true);
    expect(countFilled(fields)).toBe(0);
  });

  it("markerar bara fält med faktiskt innehåll som ifyllda", () => {
    const fields = computeProfileFields({
      companyName: "Ekan AB",
      tonality: null,
      boilerplate: "Grundat 2001 i Göteborg.",
    });
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f.filled]));
    expect(byKey.companyName).toBe(true);
    expect(byKey.tonality).toBe(false);
    expect(byKey.boilerplate).toBe(true);
    expect(countFilled(fields)).toBe(2);
  });

  it("whitespace-bara fält räknas som tomma", () => {
    const fields = computeProfileFields({
      companyName: "   ",
      tonality: "\n\t",
      boilerplate: "",
    });
    expect(countFilled(fields)).toBe(0);
  });

  it("alla fält ifyllda → 3 av 3", () => {
    const fields = computeProfileFields({
      companyName: "Ekan AB",
      tonality: "Rak, konkret.",
      boilerplate: "Fakta.",
    });
    expect(countFilled(fields)).toBe(3);
  });
});

describe("PROFILE_BID_SECTIONS", () => {
  it("täcker de sex skrivbundlarna profilen injiceras i", () => {
    // Speglar bundles/: understanding, phases, quality, team, requirement-matrix, generic-prose.
    expect(PROFILE_BID_SECTIONS).toHaveLength(6);
    expect(PROFILE_BID_SECTIONS).toContain("Kravmatris");
    expect(PROFILE_BID_SECTIONS).toContain("Team");
  });
});
