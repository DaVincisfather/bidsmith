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
const loadTemplateProfile = vi.fn();
vi.mock("@/lib/pptx-template/profile-store", () => ({
  loadTemplateProfile: (...a: unknown[]) => loadTemplateProfile(...a),
}));

import { generateAllSections } from "@/lib/bid-generator";
import { generateSectionsFromProfile } from "../generate-from-profile";
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
});
