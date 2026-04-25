import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BidContext } from "../context";
import type { BidSection, RfpAnalysis } from "@/lib/types";

vi.mock("../bundles/understanding");
vi.mock("../bundles/phases");
vi.mock("../bundles/quality");
vi.mock("../bundles/requirement-matrix");
vi.mock("../bundles/team");
vi.mock("../bundles/reference");

import { buildUnderstandingBundle } from "../bundles/understanding";
import { buildPhasesBundle } from "../bundles/phases";
import { buildQualityBundle } from "../bundles/quality";
import { buildRequirementMatrixBundle } from "../bundles/requirement-matrix";
import { buildTeamBundle } from "../bundles/team";
import { buildReferenceBundle } from "../bundles/reference";
import { generateAllSections } from "../index";

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
  vi.mocked(buildReferenceBundle).mockReset();

  vi.mocked(buildUnderstandingBundle).mockResolvedValue([
    mockSection("understanding-current", "understanding-current"),
    mockSection("understanding-assignment", "understanding-assignment"),
    mockSection("understanding-vision", "understanding-vision"),
  ]);
  vi.mocked(buildPhasesBundle).mockResolvedValue([mockSection("phases", "phases")]);
  vi.mocked(buildQualityBundle).mockResolvedValue([mockSection("quality-assurance", "quality-assurance")]);
  vi.mocked(buildRequirementMatrixBundle).mockResolvedValue([mockSection("requirement-matrix-v2", "requirement-matrix-v2")]);
  vi.mocked(buildTeamBundle).mockResolvedValue([mockSection("team-pricing", "team-pricing")]);
  vi.mocked(buildReferenceBundle).mockResolvedValue([mockSection("reference-v2", "reference-v2")]);
});

describe("generateAllSections", () => {
  it("returns 11 sections across all bundles + deterministic", async () => {
    const sections = await generateAllSections(baseCtx);
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
  });

  it("invokes onSectionComplete once per section", async () => {
    const spy = vi.fn();
    await generateAllSections(baseCtx, spy);
    expect(spy).toHaveBeenCalledTimes(11);
  });

  it("throws on bundle failure (no silent fallback)", async () => {
    vi.mocked(buildPhasesBundle).mockRejectedValue(new Error("boom"));
    await expect(generateAllSections(baseCtx)).rejects.toThrow("boom");
  });
});
