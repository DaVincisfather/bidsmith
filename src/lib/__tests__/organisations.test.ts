// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrganization, ACCENT_PRESETS, DEFAULT_ACCENT, isValidHex } from "../organisations";

describe("ACCENT_PRESETS", () => {
  it("contains five entries with hex + label", () => {
    expect(ACCENT_PRESETS).toHaveLength(5);
    for (const p of ACCENT_PRESETS) {
      expect(p.hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(p.label.length).toBeGreaterThan(0);
    }
  });

  it("uses neutral slate as the default-matching swatch", () => {
    expect(ACCENT_PRESETS[0].hex).toBe(DEFAULT_ACCENT);
    expect(DEFAULT_ACCENT).toBe("#1F2937");
  });
});

describe("isValidHex", () => {
  it("accepts 6-char hex with leading #", () => {
    expect(isValidHex("#1F2937")).toBe(true);
    expect(isValidHex("#abcdef")).toBe(true);
  });

  it("rejects shorter, longer, or non-hex strings", () => {
    expect(isValidHex("1F2937")).toBe(false);
    expect(isValidHex("#FFF")).toBe(false);
    expect(isValidHex("#1F29377")).toBe(false);
    expect(isValidHex("#GG2937")).toBe(false);
    expect(isValidHex("")).toBe(false);
  });
});

describe("getOrganization", () => {
  it("returns the org row keyed on id", async () => {
    const single = vi
      .fn()
      .mockResolvedValue({
        data: {
          id: "org-1",
          name: "Acme",
          display_name: "Acme AB",
          logo_url: null,
          accent_color: "#1F2937",
        },
        error: null,
      });
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ single })),
        })),
      })),
    } as unknown as SupabaseClient;

    const org = await getOrganization(supabase, "org-1");
    expect(org.id).toBe("org-1");
    expect(org.display_name).toBe("Acme AB");
    expect(org.accent_color).toBe("#1F2937");
  });

  it("throws when supabase returns an error", async () => {
    const single = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "boom" } });
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ single })),
        })),
      })),
    } as unknown as SupabaseClient;

    await expect(getOrganization(supabase, "org-1")).rejects.toThrow("boom");
  });
});
