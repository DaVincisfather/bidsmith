// @vitest-environment node
import { describe, it, expect } from "vitest";
import { validateOrgName, validateLogoFile } from "../actions";

describe("validateOrgName", () => {
  it("accepts 1-64 chars trimmed", () => {
    expect(validateOrgName("Acme")).toEqual({ ok: true, value: "Acme" });
    expect(validateOrgName("  Acme  ")).toEqual({ ok: true, value: "Acme" });
  });

  it("rejects empty after trim", () => {
    const r = validateOrgName("   ");
    expect(r.ok).toBe(false);
  });

  it("rejects > 64 chars", () => {
    const r = validateOrgName("a".repeat(65));
    expect(r.ok).toBe(false);
  });
});

describe("validateLogoFile", () => {
  it("accepts PNG/SVG/JPEG under 2 MB", () => {
    expect(validateLogoFile({ size: 1024, type: "image/png" }).ok).toBe(true);
    expect(validateLogoFile({ size: 1024, type: "image/svg+xml" }).ok).toBe(true);
    expect(validateLogoFile({ size: 1024, type: "image/jpeg" }).ok).toBe(true);
  });

  it("rejects files over 2 MB", () => {
    const r = validateLogoFile({ size: 3 * 1024 * 1024, type: "image/png" });
    expect(r.ok).toBe(false);
  });

  it("rejects unsupported MIME types", () => {
    expect(validateLogoFile({ size: 100, type: "image/gif" }).ok).toBe(false);
    expect(validateLogoFile({ size: 100, type: "application/pdf" }).ok).toBe(false);
  });
});
