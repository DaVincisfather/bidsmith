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
});
