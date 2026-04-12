// @vitest-environment node
import { describe, it, expect } from "vitest";
import { validateAndRepair, REQUIRED_SECTIONS } from "../bid-plan-validator";
import { DEFAULT_BID_PLAN } from "../bid-planner";
import type { BidPlan } from "../bid-planner";
import type { BidContext } from "../bid-section-prompts";

const mockCtx: BidContext = {
  analysis: {
    title: "Test RFP",
    client: "Test Kund",
    deadline: null,
    summary: "Test",
    requirements: [
      { category: "Kompetens", description: "Projektledning", priority: "must" },
    ],
    evaluationCriteria: [],
    requiredCompetencies: [],
    estimatedScope: "3 months",
    redFlags: [],
    domain: "IT",
  },
  teamConsultants: [
    {
      id: "c1",
      organizationId: "org1",
      name: "Anna",
      level: "senior",
      yearsExperience: 10,
      summary: "Lead",
      rawCvText: null,
      competencies: [{ competency: "PM", category: "methodology" }],
      references: [],
      createdAt: "",
      updatedAt: "",
    },
  ],
  scoredConsultants: [
    { consultantId: "c1", consultantName: "Anna", level: "senior", score: 90, reasoning: "Fit" },
  ],
  goNoGoResult: {
    mustRequirements: [],
    winProbability: 70,
    winProbabilityReasoning: "",
    strengths: [],
    gaps: [],
    improvements: [],
    recommendation: "go",
    reasoning: "",
  },
};

describe("REQUIRED_SECTIONS", () => {
  it("lists all 7 required semantic keys", () => {
    const keys = REQUIRED_SECTIONS.map((r) => r.semanticKey);
    expect(keys).toEqual([
      "cover",
      "quality",
      "team",
      "requirement-matrix",
      "references",
      "contact",
      "confidentiality",
    ]);
  });
});

describe("validateAndRepair — passthrough", () => {
  it("returns DEFAULT_BID_PLAN unchanged (already valid)", () => {
    const result = validateAndRepair(DEFAULT_BID_PLAN, mockCtx);
    expect(result.sections.length).toBe(DEFAULT_BID_PLAN.sections.length);
    expect(result.sections[0].kind).toBe("cover");
  });

  it("does not mutate input plan", () => {
    const plan: BidPlan = JSON.parse(JSON.stringify(DEFAULT_BID_PLAN));
    const snapshot = JSON.stringify(plan);
    validateAndRepair(plan, mockCtx);
    expect(JSON.stringify(plan)).toBe(snapshot);
  });
});

describe("Pass A — inject missing required sections", () => {
  it("injects missing cover section", () => {
    const plan: BidPlan = {
      language: "sv",
      sections: [
        { kind: "prose", title: "X", promptHint: "y", semanticKey: "quality" },
        { kind: "team", title: "Team", semanticKey: "team" },
        { kind: "requirement-matrix", title: "Krav", semanticKey: "requirement-matrix" },
        { kind: "references", title: "Ref", semanticKey: "references" },
        { kind: "placeholder", title: "K", instruction: "i", semanticKey: "contact" },
        { kind: "placeholder", title: "S", instruction: "i", semanticKey: "confidentiality" },
      ],
    };
    const result = validateAndRepair(plan, mockCtx);
    const keys = result.sections.map((s) => s.semanticKey);
    expect(keys).toContain("cover");
  });

  it("injects missing quality prose", () => {
    const plan: BidPlan = {
      language: "sv",
      sections: [
        { kind: "cover", semanticKey: "cover" },
        { kind: "team", title: "Team", semanticKey: "team" },
        { kind: "requirement-matrix", title: "Krav", semanticKey: "requirement-matrix" },
        { kind: "references", title: "Ref", semanticKey: "references" },
        { kind: "placeholder", title: "K", instruction: "i", semanticKey: "contact" },
        { kind: "placeholder", title: "S", instruction: "i", semanticKey: "confidentiality" },
      ],
    };
    const result = validateAndRepair(plan, mockCtx);
    const quality = result.sections.find((s) => s.semanticKey === "quality");
    expect(quality).toBeDefined();
    expect(quality?.kind).toBe("prose");
  });

  it("injects missing contact and confidentiality placeholders", () => {
    const plan: BidPlan = {
      language: "sv",
      sections: [
        { kind: "cover", semanticKey: "cover" },
        { kind: "prose", title: "Kvalitet", promptHint: "x", semanticKey: "quality" },
        { kind: "team", title: "Team", semanticKey: "team" },
        { kind: "requirement-matrix", title: "Krav", semanticKey: "requirement-matrix" },
        { kind: "references", title: "Ref", semanticKey: "references" },
      ],
    };
    const result = validateAndRepair(plan, mockCtx);
    expect(result.sections.find((s) => s.semanticKey === "contact")).toBeDefined();
    expect(result.sections.find((s) => s.semanticKey === "confidentiality")).toBeDefined();
  });

  it("injects all seven required sections when starting from empty", () => {
    const plan: BidPlan = { language: "sv", sections: [] };
    const result = validateAndRepair(plan, mockCtx);
    const keys = result.sections.map((s) => s.semanticKey);
    for (const rule of REQUIRED_SECTIONS) {
      expect(keys).toContain(rule.semanticKey);
    }
  });

  it("respects language 'en' when injecting defaults", () => {
    const plan: BidPlan = { language: "en", sections: [] };
    const result = validateAndRepair(plan, mockCtx);
    const quality = result.sections.find((s) => s.semanticKey === "quality");
    expect(quality?.kind).toBe("prose");
    if (quality && quality.kind === "prose") {
      expect(quality.title).toBe("Quality and collaboration");
    }
  });

  it("does not duplicate sections that are already present", () => {
    const result = validateAndRepair(DEFAULT_BID_PLAN, mockCtx);
    const keys = result.sections.map((s) => s.semanticKey);
    const coverCount = keys.filter((k) => k === "cover").length;
    expect(coverCount).toBe(1);
  });
});

describe("Pass B — position enforcement", () => {
  it("moves cover to index 0 when planner put it elsewhere", () => {
    const plan: BidPlan = {
      language: "sv",
      sections: [
        { kind: "prose", title: "X", promptHint: "y", semanticKey: "quality" },
        { kind: "cover", semanticKey: "cover" },
        { kind: "team", title: "Team", semanticKey: "team" },
        { kind: "requirement-matrix", title: "Krav", semanticKey: "requirement-matrix" },
        { kind: "references", title: "Ref", semanticKey: "references" },
        { kind: "placeholder", title: "K", instruction: "i", semanticKey: "contact" },
        { kind: "placeholder", title: "S", instruction: "i", semanticKey: "confidentiality" },
      ],
    };
    const result = validateAndRepair(plan, mockCtx);
    expect(result.sections[0].semanticKey).toBe("cover");
  });

  it("moves confidentiality to the last position", () => {
    const plan: BidPlan = {
      language: "sv",
      sections: [
        { kind: "cover", semanticKey: "cover" },
        { kind: "placeholder", title: "S", instruction: "i", semanticKey: "confidentiality" },
        { kind: "prose", title: "Kvalitet", promptHint: "x", semanticKey: "quality" },
        { kind: "team", title: "Team", semanticKey: "team" },
        { kind: "requirement-matrix", title: "Krav", semanticKey: "requirement-matrix" },
        { kind: "references", title: "Ref", semanticKey: "references" },
        { kind: "placeholder", title: "K", instruction: "i", semanticKey: "contact" },
      ],
    };
    const result = validateAndRepair(plan, mockCtx);
    const last = result.sections[result.sections.length - 1];
    expect(last.semanticKey).toBe("confidentiality");
  });

  it("moves contact to second-to-last", () => {
    const plan: BidPlan = {
      language: "sv",
      sections: [
        { kind: "cover", semanticKey: "cover" },
        { kind: "placeholder", title: "K", instruction: "i", semanticKey: "contact" },
        { kind: "prose", title: "Kvalitet", promptHint: "x", semanticKey: "quality" },
        { kind: "team", title: "Team", semanticKey: "team" },
        { kind: "requirement-matrix", title: "Krav", semanticKey: "requirement-matrix" },
        { kind: "references", title: "Ref", semanticKey: "references" },
        { kind: "placeholder", title: "S", instruction: "i", semanticKey: "confidentiality" },
      ],
    };
    const result = validateAndRepair(plan, mockCtx);
    const secondToLast = result.sections[result.sections.length - 2];
    const last = result.sections[result.sections.length - 1];
    expect(secondToLast.semanticKey).toBe("contact");
    expect(last.semanticKey).toBe("confidentiality");
  });

  it("correctly orders all three position constraints simultaneously", () => {
    const plan: BidPlan = {
      language: "sv",
      sections: [
        { kind: "placeholder", title: "S", instruction: "i", semanticKey: "confidentiality" },
        { kind: "prose", title: "Kvalitet", promptHint: "x", semanticKey: "quality" },
        { kind: "placeholder", title: "K", instruction: "i", semanticKey: "contact" },
        { kind: "team", title: "Team", semanticKey: "team" },
        { kind: "requirement-matrix", title: "Krav", semanticKey: "requirement-matrix" },
        { kind: "references", title: "Ref", semanticKey: "references" },
        { kind: "cover", semanticKey: "cover" },
      ],
    };
    const result = validateAndRepair(plan, mockCtx);
    expect(result.sections[0].semanticKey).toBe("cover");
    expect(result.sections[result.sections.length - 2].semanticKey).toBe("contact");
    expect(result.sections[result.sections.length - 1].semanticKey).toBe("confidentiality");
  });
});
