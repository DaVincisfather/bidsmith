import { afterEach, describe, expect, it } from "vitest";
import { foreignTemplatesEnabled } from "../foreign-flag";

const ORIGINAL = process.env.BIDSMITH_FOREIGN_TEMPLATES;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.BIDSMITH_FOREIGN_TEMPLATES;
  else process.env.BIDSMITH_FOREIGN_TEMPLATES = ORIGINAL;
});

describe("foreignTemplatesEnabled", () => {
  it("is ON by default (unset) — the activation gate carries the safety since 2026-07-19", () => {
    delete process.env.BIDSMITH_FOREIGN_TEMPLATES;
    expect(foreignTemplatesEnabled()).toBe(true);
  });

  it("is OFF only for the exact value 'off'", () => {
    process.env.BIDSMITH_FOREIGN_TEMPLATES = "off";
    expect(foreignTemplatesEnabled()).toBe(false);
  });

  it("treats any other value as ON (legacy 'on' keeps working)", () => {
    for (const v of ["on", "true", "1", "OFF", ""]) {
      process.env.BIDSMITH_FOREIGN_TEMPLATES = v;
      expect(foreignTemplatesEnabled()).toBe(true);
    }
  });
});
