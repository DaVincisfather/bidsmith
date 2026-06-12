// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// workspace_settings.active_profile_id-pekaren hämtas via .select().limit(1).maybeSingle()
// (samma kedja som active-template). Profilraden hämtas via .select().eq("id").single().
// Routa per tabellnamn så de två frågeformerna kan riggas oberoende per test.
const wsMaybeSingle = vi.fn();
const profileSingle = vi.fn();

vi.mock("@/lib/supabase", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === "workspace_settings") {
        return {
          select: () => ({ limit: () => ({ maybeSingle: wsMaybeSingle }) }),
        };
      }
      // org_profiles
      return {
        select: () => ({ eq: () => ({ single: profileSingle }) }),
      };
    },
  }),
}));

import { loadActiveProfile } from "../org-profile";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadActiveProfile", () => {
  it("ingen workspace_settings-rad (data null) → null", async () => {
    wsMaybeSingle.mockResolvedValue({ data: null, error: null });

    const profile = await loadActiveProfile();

    expect(profile).toBeNull();
    expect(profileSingle).not.toHaveBeenCalled();
  });

  it("pekare null/saknas (även pre-migration: kolumn saknas) → null, dagens beteende", async () => {
    wsMaybeSingle.mockResolvedValue({ data: { active_profile_id: null }, error: null });

    const profile = await loadActiveProfile();

    expect(profile).toBeNull();
    expect(profileSingle).not.toHaveBeenCalled();
  });

  it("pekare satt → mappad profil", async () => {
    wsMaybeSingle.mockResolvedValue({
      data: { active_profile_id: "p1" },
      error: null,
    });
    profileSingle.mockResolvedValue({
      data: {
        id: "p1",
        company_name: "Testbolaget AB",
        logo_path: "logos/test.png",
        colors: { primary: "#7A1F2B" },
        tonality: "Rak, konkret, inga superlativ.",
        boilerplate: "Grundat 2001 i Göteborg.",
      },
      error: null,
    });

    const profile = await loadActiveProfile();

    expect(profile).toEqual({
      id: "p1",
      companyName: "Testbolaget AB",
      logoPath: "logos/test.png",
      colors: { primary: "#7A1F2B" },
      tonality: "Rak, konkret, inga superlativ.",
      boilerplate: "Grundat 2001 i Göteborg.",
    });
  });

  it("DB-fel på profilraden → null (generering dör inte av trasig profil)", async () => {
    wsMaybeSingle.mockResolvedValue({
      data: { active_profile_id: "p1" },
      error: null,
    });
    profileSingle.mockResolvedValue({
      data: null,
      error: { code: "PGRST301", message: "rate limit exceeded" },
    });

    const profile = await loadActiveProfile();

    expect(profile).toBeNull();
  });
});
