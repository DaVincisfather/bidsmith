import { afterEach, describe, expect, it } from "vitest";
import { foreignTemplatesEnabled } from "../foreign-flag";

const ORIGINAL = process.env.BIDSMITH_FOREIGN_TEMPLATES;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.BIDSMITH_FOREIGN_TEMPLATES;
  else process.env.BIDSMITH_FOREIGN_TEMPLATES = ORIGINAL;
});

describe("foreignTemplatesEnabled", () => {
  it("is OFF by default (unset) — MD-first launch decision 2026-08-03", () => {
    delete process.env.BIDSMITH_FOREIGN_TEMPLATES;
    expect(foreignTemplatesEnabled()).toBe(false);
  });

  it("is ON only for the exact opt-in value 'on'", () => {
    process.env.BIDSMITH_FOREIGN_TEMPLATES = "on";
    expect(foreignTemplatesEnabled()).toBe(true);
  });

  it("treats any other value as OFF (fail closed)", () => {
    for (const v of ["off", "true", "1", "ON", ""]) {
      process.env.BIDSMITH_FOREIGN_TEMPLATES = v;
      expect(foreignTemplatesEnabled()).toBe(false);
    }
  });
});
