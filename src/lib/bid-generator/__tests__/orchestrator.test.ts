import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BidContext } from "../context";
import type { BidSection, RfpAnalysis } from "@/lib/types";

vi.mock("../bundles/understanding");
vi.mock("../bundles/phases");
vi.mock("../bundles/quality");
vi.mock("../bundles/requirement-matrix");
vi.mock("../bundles/team");

import { buildUnderstandingBundle } from "../bundles/understanding";
import { buildPhasesBundle } from "../bundles/phases";
import { buildQualityBundle } from "../bundles/quality";
import { buildRequirementMatrixBundle } from "../bundles/requirement-matrix";
import { buildTeamBundle } from "../bundles/team";
import type { TemplateManifest } from "@/lib/pptx-template/manifest-types";
import { generateAllSections } from "../index";

// Minimal manifest stub — generateAllSections only reads budgets + fieldSlides
// from it; the bundles are mocked so their slide/budget contents are irrelevant.
const manifest = {
  budgets: {},
  fieldSlides: {},
} as unknown as TemplateManifest;

const baseAnalysis: RfpAnalysis = {
  title: "t", client: "c", deadline: null, summary: "s",
  requirements: [], evaluationCriteria: [], requiredCompetencies: [],
  estimatedScope: "", redFlags: [], domain: "",
  oslReference: "19 kap 3 §", secrecyRows: [],
};
const baseCtx: BidContext = {
  analysis: baseAnalysis,
  teamConsultants: [], scoredConsultants: [],
  goNoGoResult: {
    mustRequirements: [], winProbability: 50, winProbabilityReasoning: "",
    strengths: [], gaps: [], improvements: [], recommendation: "go", reasoning: "",
  },
};

function mockSection(key: string, format: NonNullable<BidSection["content"]>["format"]): BidSection {
  return {
    type: "ai", key, title: key, generatedAt: "2026-04-20",
    // @ts-expect-error — minimal shape for orchestration test
    content: { format },
  };
}

beforeEach(() => {
  vi.mocked(buildUnderstandingBundle).mockReset();
  vi.mocked(buildPhasesBundle).mockReset();
  vi.mocked(buildQualityBundle).mockReset();
  vi.mocked(buildRequirementMatrixBundle).mockReset();
  vi.mocked(buildTeamBundle).mockReset();

  vi.mocked(buildUnderstandingBundle).mockResolvedValue({
    sections: [
      mockSection("understanding-current", "understanding-current"),
      mockSection("understanding-assignment", "understanding-assignment"),
      mockSection("understanding-vision", "understanding-vision"),
    ],
    overflowFlags: [],
  });
  vi.mocked(buildPhasesBundle).mockResolvedValue({
    sections: [mockSection("phases", "phases")],
    overflowFlags: [],
  });
  vi.mocked(buildQualityBundle).mockResolvedValue({
    sections: [mockSection("quality-assurance", "quality-assurance")],
    overflowFlags: [],
  });
  vi.mocked(buildRequirementMatrixBundle).mockResolvedValue({
    sections: [mockSection("requirement-matrix-v2", "requirement-matrix-v2")],
    overflowFlags: [],
  });
  vi.mocked(buildTeamBundle).mockResolvedValue({
    sections: [mockSection("team-pricing", "team-pricing")],
    overflowFlags: [],
  });
});

describe("generateAllSections", () => {
  it("returns 11 sections across all bundles + deterministic", async () => {
    const { sections, overflowFlags } = await generateAllSections(baseCtx, manifest);
    const keys = sections.map((s) => s.key);
    expect(keys).toContain("cover");
    expect(keys).toContain("understanding-current");
    expect(keys).toContain("understanding-assignment");
    expect(keys).toContain("understanding-vision");
    expect(keys).toContain("phases");
    expect(keys).toContain("quality-assurance");
    expect(keys).toContain("team-pricing");
    expect(keys).toContain("requirement-matrix-v2");
    expect(keys).toContain("reference-v2");
    expect(keys).toContain("confidentiality");
    expect(keys).toContain("certifications");
    expect(sections).toHaveLength(11);
    expect(overflowFlags).toEqual([]);
  });

  it("aggregates overflowFlags across bundles", async () => {
    vi.mocked(buildPhasesBundle).mockResolvedValue({
      sections: [mockSection("phases", "phases")],
      overflowFlags: [
        { slide: 4, fieldPath: "phases[0].name", fieldLabel: "phase name", length: 80, budget: 60 },
      ],
    });
    vi.mocked(buildQualityBundle).mockResolvedValue({
      sections: [mockSection("quality-assurance", "quality-assurance")],
      overflowFlags: [
        { slide: 9, fieldPath: "checkpoints[0]", fieldLabel: "checkpoints (each item)", length: 200, budget: 150 },
      ],
    });

    const { overflowFlags } = await generateAllSections(baseCtx, manifest);
    expect(overflowFlags).toHaveLength(2);
    expect(overflowFlags.map((o) => o.fieldPath).sort()).toEqual(
      ["checkpoints[0]", "phases[0].name"].sort(),
    );
  });

  it("invokes onSectionComplete once per section", async () => {
    const spy = vi.fn();
    await generateAllSections(baseCtx, manifest, spy);
    expect(spy).toHaveBeenCalledTimes(11);
  });

  it("captures a failed bundle in failedBundles without discarding the rest", async () => {
    vi.mocked(buildPhasesBundle).mockRejectedValue(new Error("boom"));

    const { sections, failedBundles } = await generateAllSections(baseCtx, manifest);

    // The failure is reported, not thrown...
    expect(failedBundles).toEqual([{ bundle: "phases", error: "boom" }]);
    // ...and the five surviving bundles' (paid) output is preserved.
    const keys = sections.map((s) => s.key);
    expect(keys).not.toContain("phases");
    expect(keys).toContain("cover");
    expect(keys).toContain("understanding-current");
    expect(keys).toContain("reference-v2");
  });

  it("persists each bundle's sections as it settles, not after all complete", async () => {
    const persisted: string[] = [];
    const onSectionComplete = vi.fn(async (s: BidSection) => { persisted.push(s.key); });

    // team resolves immediately; understanding hangs until released.
    let releaseUnderstanding!: () => void;
    vi.mocked(buildUnderstandingBundle).mockImplementation(
      () => new Promise((resolve) => {
        releaseUnderstanding = () => resolve({
          sections: [mockSection("understanding-current", "understanding-current")],
          overflowFlags: [],
        });
      }),
    );

    const resultPromise = generateAllSections(baseCtx, manifest, onSectionComplete);
    // Give the fast bundles a macrotask to settle and persist.
    await new Promise((r) => setTimeout(r, 0));
    expect(persisted).toContain("team-pricing");
    expect(persisted).not.toContain("understanding-current");

    releaseUnderstanding();
    await resultPromise;
    expect(persisted).toContain("understanding-current");
  });

  it("reports a failed bundle via onUnitFailed while others persist", async () => {
    const failures: string[] = [];
    vi.mocked(buildPhasesBundle).mockRejectedValue(new Error("boom"));

    const result = await generateAllSections(baseCtx, manifest, undefined, async (f) => {
      failures.push(f.bundle);
    });
    expect(failures).toEqual(["phases"]);
    expect(result.failedBundles).toEqual([{ bundle: "phases", error: "boom" }]);
  });

  it("swallows a rejecting onSectionComplete: generation still succeeds and the queue keeps serializing", async () => {
    // A transient DB error on one progress write must not fail the whole
    // (paid) generation, and the persist queue must keep processing
    // subsequently-enqueued work rather than getting stuck on the rejection.
    let callIndex = 0;
    let active = 0;
    let maxActive = 0;
    const calls: string[] = [];
    const onSectionComplete = vi.fn(async (s: BidSection) => {
      callIndex += 1;
      calls.push(s.key);
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 1));
      active -= 1;
      if (callIndex === 2) {
        throw new Error("transient DB error");
      }
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await generateAllSections(baseCtx, manifest, onSectionComplete);

    // The rejection is logged, not thrown. Assert before mockRestore(), which
    // (like mockReset) clears recorded calls.
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();

    // 1. Generation itself is unaffected by the persist failure.
    expect(result.sections).toHaveLength(11);
    expect(result.failedBundles).toEqual([]);

    // 2. The queue keeps serializing after the swallowed rejection: every
    // later-enqueued batch (the 5 bundles, 7 sections) still persists. The
    // deterministic batch is one enqueued unit that loops over 4 sections
    // with a plain `for...await`; when the 2nd call in that same loop
    // rejects, the loop aborts and the batch's remaining 2 items are never
    // invoked — but that does not break the chain for batches enqueued
    // afterwards (removing the `.catch` makes this call count collapse and
    // generateAllSections itself reject instead of resolving).
    expect(onSectionComplete).toHaveBeenCalledTimes(9);
    expect(calls).toEqual([
      "cover",
      "reference-v2",
      "understanding-current",
      "understanding-assignment",
      "understanding-vision",
      "phases",
      "quality-assurance",
      "requirement-matrix-v2",
      "team-pricing",
    ]);

    // 3. Serialization survives the swallowed error — no persist call ever
    // overlaps another, before or after the rejection.
    expect(maxActive).toBe(1);
  });

  it("never runs two persist callbacks concurrently", async () => {
    let active = 0;
    let maxActive = 0;
    const onSectionComplete = vi.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 1));
      active -= 1;
    });
    await generateAllSections(baseCtx, manifest, onSectionComplete);
    expect(maxActive).toBe(1);
    // 4 deterministic + 7 bundle sections in the default mocks.
    expect(onSectionComplete).toHaveBeenCalledTimes(11);
  });
});
