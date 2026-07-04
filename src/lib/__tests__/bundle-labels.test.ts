import { describe, it, expect } from "vitest";
import { failedUnitLabel } from "@/lib/bundle-labels";

describe("failedUnitLabel", () => {
  it("maps a bundle to its Swedish label", () => {
    expect(failedUnitLabel({ bundle: "understanding", error: "x" })).toBe("Förståelse");
  });

  it("falls back to the raw bundle key for an unknown bundle", () => {
    expect(failedUnitLabel({ bundle: "okänd", error: "x" })).toBe("okänd");
  });

  it("shows a foreign-template slot's placeholder without braces (routine #68)", () => {
    // The editor previously read f.bundle on this shape and rendered "".
    expect(failedUnitLabel({ placeholder: "{Vår metod}", error: "x" })).toBe("Vår metod");
  });
});
