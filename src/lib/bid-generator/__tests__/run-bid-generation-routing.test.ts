// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TemplateManifest } from "@/lib/pptx-template/manifest-types";
import type { TemplateProfile } from "@/lib/pptx-template/template-profile";
import type { BidContext } from "../context";
import type { BidSection, RfpAnalysis } from "@/lib/types";

// Both generation engines are mocked so routing is observable without any API
// call. isAllGenericProfile is the REAL discriminator (not mocked).
vi.mock("@/lib/bid-generator", () => ({
  generateAllSections: vi.fn(),
  BID_BUNDLE_COUNT: 6,
}));
vi.mock("../generate-from-profile", () => ({
  generateSectionsFromProfile: vi.fn(),
}));
vi.mock("../bundles/requirement-matrix", () => ({
  buildRequirementMatrixBundle: vi.fn(),
}));
const loadTemplateProfile = vi.fn();
vi.mock("@/lib/pptx-template/profile-store", () => ({
  loadTemplateProfile: (...a: unknown[]) => loadTemplateProfile(...a),
}));

import { generateAllSections } from "@/lib/bid-generator";
import { generateSectionsFromProfile } from "../generate-from-profile";
import { buildRequirementMatrixBundle } from "../bundles/requirement-matrix";
import { runBidGeneration } from "../run-bid-generation";

const template = { id: "tpl-1", manifest: {} as unknown as TemplateManifest };

const baseAnalysis: RfpAnalysis = {
  title: "t", client: "c", deadline: null, summary: "s",
  requirements: [], evaluationCriteria: [], requiredCompetencies: [],
  estimatedScope: "", redFlags: [], domain: "",
  oslReference: null, secrecyRows: [],
};
const ctx: BidContext = {
  analysis: baseAnalysis,
  teamConsultants: [], scoredConsultants: [],
  goNoGoResult: {
    mustRequirements: [], winProbability: 50, winProbabilityReasoning: "",
    strengths: [], gaps: [], improvements: [], recommendation: "go", reasoning: "",
  },
};

function mockSection(placeholder: string): BidSection {
  return {
    type: "ai",
    key: `generic-prose:${placeholder}`,
    title: placeholder,
    content: { format: "generic-prose", placeholder, text: "x" },
    generatedAt: "2026-07-04",
  };
}

function mockMatrixSection(): BidSection {
  return {
    type: "ai",
    key: "requirement-matrix-v2",
    title: "Kravmatris",
    content: { format: "requirement-matrix-v2", rows: [] },
    generatedAt: "2026-07-04",
  };
}

function createSupabaseStub() {
  const updates: Record<string, unknown>[] = [];
  const chain = {
    from: vi.fn(() => chain),
    select: vi.fn(() => chain),
    update: vi.fn((payload: Record<string, unknown>) => {
      updates.push(payload);
      return chain;
    }),
    eq: vi.fn(() => chain),
    single: vi.fn(async () => ({ data: { sections: [] } })),
  };
  return { client: chain as unknown as SupabaseClient, updates };
}

const allGenericProfile: TemplateProfile = {
  profileVersion: 1,
  templateId: "tpl-1",
  name: "kundmall",
  version: 1,
  slides: [
    { source: 1, capability: "static", slots: [] },
    {
      source: 2,
      capability: "generic-prose",
      slots: [
        { placeholder: "{A}", capability: "generic-prose", format: "prose", intent: "i", status: "generic" },
      ],
    },
  ],
};

const foreignWithTableMapProfile: TemplateProfile = {
  profileVersion: 1,
  templateId: "tpl-1",
  name: "kundmall med tabell",
  version: 1,
  slides: [
    { source: 1, capability: "static", slots: [] },
    {
      source: 2,
      capability: "generic-prose",
      slots: [
        { placeholder: "{A}", capability: "generic-prose", format: "prose", intent: "i", status: "generic" },
      ],
    },
    {
      source: 3,
      capability: "requirement-matrix",
      slots: [],
      tableMap: { frameIndex: 0, headerRows: 1, templateRowIndex: 1, columns: ["krav", "uppfyllnad"] },
    },
  ],
};

const mixedProfile: TemplateProfile = {
  profileVersion: 1,
  templateId: "tpl-1",
  name: "vår mall",
  version: 1,
  slides: [
    { source: 1, capability: "cover", slots: [] },
    {
      source: 2,
      capability: "understanding",
      slots: [
        { placeholder: "{U}", capability: "understanding", format: "prose", intent: "", status: "mapped" },
      ],
    },
  ],
};

beforeEach(() => {
  vi.mocked(generateAllSections).mockReset();
  vi.mocked(generateSectionsFromProfile).mockReset();
  vi.mocked(buildRequirementMatrixBundle).mockReset();
  loadTemplateProfile.mockReset();
});

describe("runBidGeneration routing", () => {
  it("routes an all-generic stored profile to the profile path", async () => {
    const { client, updates } = createSupabaseStub();
    loadTemplateProfile.mockResolvedValue(allGenericProfile);
    vi.mocked(generateSectionsFromProfile).mockResolvedValue({
      sections: [mockSection("{A}")],
      failedSections: [],
    });

    await runBidGeneration(client, "bid-1", ctx, template);

    expect(generateSectionsFromProfile).toHaveBeenCalledTimes(1);
    expect(generateSectionsFromProfile).toHaveBeenCalledWith(
      allGenericProfile,
      ctx,
      expect.any(Function),
    );
    expect(generateAllSections).not.toHaveBeenCalled();
    const final = updates[updates.length - 1];
    expect(final.status).toBe("draft");
    expect(final.sections).toHaveLength(1);
    // Struktur-juryn (v2-facit) hoppas på profil-vägen — foreign mall får inte
    // rött struktur-badge mot en irrelevant mall (routine-fynd #68).
    expect(final.structure_eval).toBeNull();
  });

  it("routes a mixed-capability stored profile to the bundle path", async () => {
    const { client } = createSupabaseStub();
    loadTemplateProfile.mockResolvedValue(mixedProfile);
    vi.mocked(generateAllSections).mockResolvedValue({
      sections: [mockSection("{cover}")],
      overflowFlags: [],
      failedBundles: [],
    });

    await runBidGeneration(client, "bid-1", ctx, template);

    expect(generateAllSections).toHaveBeenCalledTimes(1);
    expect(generateSectionsFromProfile).not.toHaveBeenCalled();
  });

  it("routes an absent stored profile (our template) to the bundle path", async () => {
    const { client } = createSupabaseStub();
    loadTemplateProfile.mockResolvedValue(null);
    vi.mocked(generateAllSections).mockResolvedValue({
      sections: [mockSection("{cover}")],
      overflowFlags: [],
      failedBundles: [],
    });

    await runBidGeneration(client, "bid-1", ctx, template);

    expect(generateAllSections).toHaveBeenCalledTimes(1);
    expect(generateSectionsFromProfile).not.toHaveBeenCalled();
  });

  it("marks failed when the profile path produces nothing but slots failed", async () => {
    const { client, updates } = createSupabaseStub();
    loadTemplateProfile.mockResolvedValue(allGenericProfile);
    vi.mocked(generateSectionsFromProfile).mockResolvedValue({
      sections: [],
      failedSections: [{ placeholder: "{A}", error: "boom" }],
    });

    await runBidGeneration(client, "bid-1", ctx, template);

    const final = updates[updates.length - 1];
    expect(final.status).toBe("failed");
    expect(final.failed_bundles).toEqual([{ placeholder: "{A}", error: "boom" }]);
  });

  it("keeps a partial profile-path draft (some slots succeeded)", async () => {
    const { client, updates } = createSupabaseStub();
    loadTemplateProfile.mockResolvedValue(allGenericProfile);
    vi.mocked(generateSectionsFromProfile).mockResolvedValue({
      sections: [mockSection("{A}")],
      failedSections: [{ placeholder: "{B}", error: "boom" }],
    });

    await runBidGeneration(client, "bid-1", ctx, template);

    const final = updates[updates.length - 1];
    expect(final.status).toBe("draft");
    expect(final.failed_bundles).toEqual([{ placeholder: "{B}", error: "boom" }]);
    expect(final.overflow_flags).toEqual([]);
  });

  it("does not run the requirement-matrix bundle for a foreign profile without a mapped table", async () => {
    const { client, updates } = createSupabaseStub();
    loadTemplateProfile.mockResolvedValue(allGenericProfile);
    vi.mocked(generateSectionsFromProfile).mockResolvedValue({
      sections: [mockSection("{A}")],
      failedSections: [],
    });

    await runBidGeneration(client, "bid-1", ctx, template);

    expect(buildRequirementMatrixBundle).not.toHaveBeenCalled();
    const final = updates[updates.length - 1];
    expect(final.sections).toHaveLength(1);
  });

  it("runs the requirement-matrix bundle for a foreign profile with a mapped table and merges the sections", async () => {
    const { client, updates } = createSupabaseStub();
    loadTemplateProfile.mockResolvedValue(foreignWithTableMapProfile);
    vi.mocked(generateSectionsFromProfile).mockResolvedValue({
      sections: [mockSection("{A}")],
      failedSections: [],
    });
    vi.mocked(buildRequirementMatrixBundle).mockResolvedValue({
      sections: [mockMatrixSection()],
      overflowFlags: [],
    });

    await runBidGeneration(client, "bid-1", ctx, template);

    expect(generateSectionsFromProfile).toHaveBeenCalledTimes(1);
    expect(buildRequirementMatrixBundle).toHaveBeenCalledTimes(1);
    // Same call shape as the bundled path's own unit tests
    // (requirement-matrix.test.ts): empty BudgetPlan (this bundle never reads
    // field budgets — REQUIREMENT_MATRIX_BUDGET_KEYS is empty) + a fresh
    // retry budget.
    expect(buildRequirementMatrixBundle).toHaveBeenCalledWith(
      ctx,
      { budgets: {}, fieldSlides: {} },
      { remaining: expect.any(Number) },
    );

    const final = updates[updates.length - 1];
    expect(final.status).toBe("draft");
    expect(final.sections).toHaveLength(2);
    const formats = (final.sections as BidSection[]).map((s) => s.content?.format);
    expect(formats).toContain("generic-prose");
    expect(formats).toContain("requirement-matrix-v2");
    expect(final.failed_bundles).toEqual([]);
  });

  it("keeps prose sections when the requirement-matrix bundle rejects, recording the failure", async () => {
    const { client, updates } = createSupabaseStub();
    loadTemplateProfile.mockResolvedValue(foreignWithTableMapProfile);
    vi.mocked(generateSectionsFromProfile).mockResolvedValue({
      sections: [mockSection("{A}")],
      failedSections: [],
    });
    vi.mocked(buildRequirementMatrixBundle).mockRejectedValue(new Error("matrix boom"));

    await runBidGeneration(client, "bid-1", ctx, template);

    const final = updates[updates.length - 1];
    expect(final.status).toBe("draft");
    expect(final.sections).toHaveLength(1);
    expect((final.sections as BidSection[])[0].content?.format).toBe("generic-prose");
    expect(final.failed_bundles).toEqual([
      { bundle: "requirement-matrix", error: "matrix boom" },
    ]);
  });
});
