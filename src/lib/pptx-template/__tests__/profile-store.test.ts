// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TemplateProfile } from "../template-profile";

const upsert = vi.fn();
const maybeSingle = vi.fn();

// Service client — same rationale as template-store: profile-store is called
// outside Next's request scope (upload route worker, scripts). Mock chain covers
// .upsert(...) (save) and .select().eq().maybeSingle() (load).
vi.mock("@/lib/supabase", () => ({
  createServiceClient: () => ({
    from: () => ({
      upsert,
      select: () => ({ eq: () => ({ maybeSingle }) }),
    }),
  }),
}));

import { saveTemplateProfile, loadTemplateProfile } from "../profile-store";

const VALID_PROFILE: TemplateProfile = {
  profileVersion: 1,
  templateId: "tpl-1",
  name: "kundmall",
  version: 1,
  slides: [
    {
      source: 1,
      capability: "generic-prose",
      slots: [
        { placeholder: "{A}", capability: "generic-prose", format: "prose", intent: "x", status: "generic" },
      ],
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("saveTemplateProfile", () => {
  it("upserts template_id + validated profile, keyed on template_id", async () => {
    upsert.mockResolvedValue({ error: null });
    await saveTemplateProfile(VALID_PROFILE);

    expect(upsert).toHaveBeenCalledTimes(1);
    const [row, opts] = upsert.mock.calls[0];
    expect(row.template_id).toBe("tpl-1");
    expect(row.profile).toEqual(VALID_PROFILE);
    expect(typeof row.updated_at).toBe("string");
    expect(opts).toEqual({ onConflict: "template_id" });
  });

  it("rejects a malformed profile before touching the DB", async () => {
    const bad = { ...VALID_PROFILE, slides: [] } as unknown as TemplateProfile; // min(1)
    await expect(saveTemplateProfile(bad)).rejects.toThrow();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("surfaces a DB error", async () => {
    upsert.mockResolvedValue({ error: { message: "permission denied" } });
    await expect(saveTemplateProfile(VALID_PROFILE)).rejects.toThrow(/permission denied/);
  });
});

describe("loadTemplateProfile", () => {
  it("returns the parsed profile when a row exists", async () => {
    maybeSingle.mockResolvedValue({ data: { profile: VALID_PROFILE }, error: null });
    const profile = await loadTemplateProfile("tpl-1");
    expect(profile).toEqual(VALID_PROFILE);
  });

  it("returns null when no profile exists yet (normal state)", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await loadTemplateProfile("tpl-1")).toBeNull();
  });

  it("throws when the stored profile is malformed (can't be trusted)", async () => {
    maybeSingle.mockResolvedValue({ data: { profile: { profileVersion: 1 } }, error: null });
    await expect(loadTemplateProfile("tpl-1")).rejects.toThrow();
  });

  it("surfaces a transient DB error instead of treating it as missing", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: "rate limit exceeded" } });
    await expect(loadTemplateProfile("tpl-1")).rejects.toThrow(/rate limit exceeded/);
  });
});
