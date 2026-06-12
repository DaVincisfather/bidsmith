// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LoadedTemplate } from "../template-store";

// workspace_settings.active_template_id-pekaren hämtas via .select().limit(1).maybeSingle()
// — samma kedja som BidEditorPage. maybeSingle returnerar pekarraden per test.
const maybeSingle = vi.fn();
vi.mock("@/lib/supabase", () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({
        limit: () => ({ maybeSingle }),
      }),
    }),
  }),
}));

// Isolera resolvern från template-store:s DB/Storage-internals — vi vill bevisa
// VILKEN laddare som anropas med vilka argument, inte återimplementera laddningen.
vi.mock("../template-store", () => ({
  loadTemplate: vi.fn(),
  loadTemplateByName: vi.fn(),
}));

import { loadTemplate, loadTemplateByName } from "../template-store";
import { loadActiveTemplate, loadTemplateForBid } from "../active-template";

const SEED: LoadedTemplate = {
  id: "00000000-0000-0000-0000-000000000001",
  name: "anbudsmall-v2",
  version: 1,
  manifest: {
    manifestVersion: 1,
    name: "anbudsmall-v2",
    slides: [],
    budgets: {},
    fieldSlides: {},
    excludedSlides: [],
  },
  templateFile: "/repo/templates/anbudsmall-v2.pptx",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadActiveTemplate", () => {
  it("pekare satt → loadTemplate(active_template_id)", async () => {
    maybeSingle.mockResolvedValue({
      data: { active_template_id: "abc-123" },
      error: null,
    });
    vi.mocked(loadTemplate).mockResolvedValue(SEED);

    const tpl = await loadActiveTemplate();

    expect(loadTemplate).toHaveBeenCalledWith("abc-123");
    expect(loadTemplateByName).not.toHaveBeenCalled();
    expect(tpl).toBe(SEED);
  });

  it("pekare null/saknas → fallback loadTemplateByName('anbudsmall-v2', 1)", async () => {
    maybeSingle.mockResolvedValue({
      data: { active_template_id: null },
      error: null,
    });
    vi.mocked(loadTemplateByName).mockResolvedValue(SEED);

    const tpl = await loadActiveTemplate();

    expect(loadTemplateByName).toHaveBeenCalledWith("anbudsmall-v2", 1);
    expect(loadTemplate).not.toHaveBeenCalled();
    expect(tpl).toBe(SEED);
  });

  it("ingen workspace_settings-rad (data null) → fallback byName", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    vi.mocked(loadTemplateByName).mockResolvedValue(SEED);

    await loadActiveTemplate();

    expect(loadTemplateByName).toHaveBeenCalledWith("anbudsmall-v2", 1);
    expect(loadTemplate).not.toHaveBeenCalled();
  });
});

describe("loadTemplateForBid", () => {
  it("template_id satt → loadTemplate(template_id)", async () => {
    vi.mocked(loadTemplate).mockResolvedValue(SEED);

    const tpl = await loadTemplateForBid("bid-tpl-9");

    expect(loadTemplate).toHaveBeenCalledWith("bid-tpl-9");
    expect(loadTemplateByName).not.toHaveBeenCalled();
    expect(tpl).toBe(SEED);
  });

  it("template_id null (legacy-bid) → fallback byName", async () => {
    vi.mocked(loadTemplateByName).mockResolvedValue(SEED);

    await loadTemplateForBid(null);

    expect(loadTemplateByName).toHaveBeenCalledWith("anbudsmall-v2", 1);
    expect(loadTemplate).not.toHaveBeenCalled();
  });
});
