import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BidContext } from "../context";
import type { BidSection, RfpAnalysis } from "@/lib/types";

vi.mock("@/lib/bid-generator", () => ({
  generateAllSections: vi.fn(),
  BID_BUNDLE_COUNT: 6,
}));

import { generateAllSections } from "@/lib/bid-generator";
import { runBidGeneration } from "../run-bid-generation";

const baseAnalysis: RfpAnalysis = {
  title: "t", client: "c", deadline: null, summary: "s",
  requirements: [], evaluationCriteria: [], requiredCompetencies: [],
  estimatedScope: "", redFlags: [], domain: "",
  oslReference: null, secrecyRows: [],
};
const baseCtx: BidContext = {
  analysis: baseAnalysis,
  teamConsultants: [], scoredConsultants: [],
  goNoGoResult: {
    mustRequirements: [], winProbability: 50, winProbabilityReasoning: "",
    strengths: [], gaps: [], improvements: [], recommendation: "go", reasoning: "",
  },
};

function mockSection(key: string): BidSection {
  return {
    type: "ai", key, title: key, generatedAt: "2026-06-10",
    // @ts-expect-error — minimal shape for runner test
    content: { format: key },
  };
}

// Chainable supabase stub: every method returns the chain, update payloads
// are recorded in order so tests can assert the persisted status transitions.
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

beforeEach(() => {
  vi.mocked(generateAllSections).mockReset();
});

describe("runBidGeneration", () => {
  it("persists sections and status draft on full success", async () => {
    const { client, updates } = createSupabaseStub();
    vi.mocked(generateAllSections).mockResolvedValue({
      sections: [mockSection("cover"), mockSection("phases")],
      overflowFlags: [],
      failedBundles: [],
    });

    await runBidGeneration(client, "bid-1", baseCtx, "anbudsmall-v2");

    const final = updates[updates.length - 1];
    expect(final.status).toBe("draft");
    expect(final.sections).toHaveLength(2);
    expect(final.failed_bundles).toEqual([]);
  });

  it("saves incremental progress via the onSectionComplete callback", async () => {
    const { client, updates } = createSupabaseStub();
    vi.mocked(generateAllSections).mockImplementation(async (_ctx, _tpl, onSectionComplete) => {
      await onSectionComplete?.(mockSection("cover"));
      return { sections: [mockSection("cover")], overflowFlags: [], failedBundles: [] };
    });

    await runBidGeneration(client, "bid-1", baseCtx, "anbudsmall-v2");

    // First update is the incremental save (sections only), then the final one.
    expect(updates).toHaveLength(2);
    expect(updates[0]).toEqual({ sections: [mockSection("cover")] });
    expect(updates[1].status).toBe("draft");
  });

  it("keeps a partial draft and persists failed_bundles", async () => {
    const { client, updates } = createSupabaseStub();
    const failed = [{ bundle: "phases" as const, error: "boom" }];
    vi.mocked(generateAllSections).mockResolvedValue({
      sections: [mockSection("cover")],
      overflowFlags: [],
      failedBundles: failed,
    });

    await runBidGeneration(client, "bid-1", baseCtx, "anbudsmall-v2");

    const final = updates[updates.length - 1];
    expect(final.status).toBe("draft");
    expect(final.failed_bundles).toEqual(failed);
  });

  it("marks the bid failed when every bundle failed", async () => {
    const { client, updates } = createSupabaseStub();
    const failed = ["understanding", "phases", "quality", "requirement-matrix", "team", "reference"]
      .map((bundle) => ({ bundle, error: "boom" }));
    vi.mocked(generateAllSections).mockResolvedValue({
      sections: [mockSection("cover")],
      overflowFlags: [],
      // @ts-expect-error — bundle strings suffice for the count check
      failedBundles: failed,
    });

    await runBidGeneration(client, "bid-1", baseCtx, "anbudsmall-v2");

    const final = updates[updates.length - 1];
    expect(final.status).toBe("failed");
    expect(final.generation_error).toBe("All AI bundles failed");
    expect(final.failed_bundles).toEqual(failed);
  });

  it("marks the bid failed when generation throws (infra failure)", async () => {
    const { client, updates } = createSupabaseStub();
    vi.mocked(generateAllSections).mockRejectedValue(new Error("loadBudgets exploded"));

    await runBidGeneration(client, "bid-1", baseCtx, "anbudsmall-v2");

    const final = updates[updates.length - 1];
    expect(final.status).toBe("failed");
    expect(final.generation_error).toBe("loadBudgets exploded");
    expect(final.failed_bundles).toEqual([]);
  });
});
