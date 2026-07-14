import { afterEach, describe, expect, it } from "vitest";
import { foreignTemplatesEnabled } from "../foreign-flag";

const ORIGINAL = process.env.BIDSMITH_FOREIGN_TEMPLATES;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.BIDSMITH_FOREIGN_TEMPLATES;
  else process.env.BIDSMITH_FOREIGN_TEMPLATES = ORIGINAL;
});

describe("foreignTemplatesEnabled", () => {
  it("is OFF by default (unset)", () => {
    delete process.env.BIDSMITH_FOREIGN_TEMPLATES;
    expect(foreignTemplatesEnabled()).toBe(false);
  });

  it("is ON only for the exact value 'on'", () => {
    process.env.BIDSMITH_FOREIGN_TEMPLATES = "on";
    expect(foreignTemplatesEnabled()).toBe(true);
  });

  it("treats any other value as OFF (fail closed)", () => {
    for (const v of ["true", "1", "ON", "yes", ""]) {
      process.env.BIDSMITH_FOREIGN_TEMPLATES = v;
      expect(foreignTemplatesEnabled()).toBe(false);
    }
  });
});
