// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  matchConsultants,
  reconcilePrefilter,
  selectTopNPerLevel,
  mergeDeepReasoning,
} from "@/lib/consultant-matcher";
import {
  RfpAnalysis,
  Consultant,
  ScoredConsultant,
  ScoredMatchResult,
} from "@/lib/types";

/** Builds a ScoredConsultant, overriding only the fields a test cares about. */
function scored(overrides: Partial<ScoredConsultant> & { consultantId: string }): ScoredConsultant {
  return {
    consultantName: overrides.consultantId,
    level: "senior",
    score: 50,
    reasoning: "",
    ...overrides,
  };
}

const mockAnalysis: RfpAnalysis = {
  title: "Organisationsöversyn",
  client: "Göteborgs stad",
  deadline: "2026-05-01",
  summary: "Översyn av organisationsstruktur inom stadsförvaltningen",
  requirements: [
    { category: "Kompetens", description: "Erfarenhet av organisationsöversyner", priority: "must" },
    { category: "Kompetens", description: "Erfarenhet av offentlig sektor", priority: "must" },
    { category: "Kompetens", description: "Förändringsledning", priority: "should" },
  ],
  evaluationCriteria: [
    { name: "Kompetens", weight: 50, description: "Relevant erfarenhet" },
    { name: "Genomförande", weight: 30, description: "Metodik och plan" },
    { name: "Pris", weight: 20, description: "Timpris" },
  ],
  requiredCompetencies: ["Organisationsöversyner", "Offentlig sektor", "Förändringsledning"],
  estimatedScope: "2 konsulter, 3 månader",
  redFlags: [],
  domain: "management",
  oslReference: null,
  secrecyRows: [],
};

const mockConsultants: Consultant[] = [
  {
    id: "c1",
    name: "Anna Lindström",
    level: "senior",
    yearsExperience: 12,
    summary: "Senior konsult med fokus på organisationsöversyner i offentlig sektor",
    rawCvText: null,
    competencies: [
      { competency: "Organisationsöversyner", category: "domain" },
      { competency: "Ekonomistyrning", category: "domain" },
      { competency: "Förändringsledning", category: "methodology" },
    ],
    references: [
      { title: "Organisationsöversyn Region Mellansverige", description: "Ledde genomlysning", year: 2024, sector: "public" },
    ],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  },
  {
    id: "c2",
    name: "Erik Johansson",
    level: "intermediate",
    yearsExperience: 5,
    summary: "Konsult med erfarenhet av ekonomistyrning och dataanalys",
    rawCvText: null,
    competencies: [
      { competency: "Dataanalys", category: "technical" },
      { competency: "Ekonomistyrning", category: "domain" },
    ],
    references: [
      { title: "Ekonomianalys Borås kommun", description: "Stödde ekonomistyrning", year: 2025, sector: "public" },
    ],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  },
];

// Pure reconciliation logic — deterministic, no API. This is the guard against
// the P2 bug where an LLM ranker dropping/hallucinating an entry made a
// consultant silently vanish from matching (and thus from the bid).
describe("reconcilePrefilter", () => {
  it("keeps every pooled consultant and preserves their scores", () => {
    const result = reconcilePrefilter(mockConsultants, [
      scored({ consultantId: "c1", score: 88 }),
      scored({ consultantId: "c2", level: "intermediate", score: 61 }),
    ]);

    expect(result.map((r) => r.consultantId).sort()).toEqual(["c1", "c2"]);
    expect(result.find((r) => r.consultantId === "c1")!.score).toBe(88);
    expect(result.find((r) => r.consultantId === "c2")!.score).toBe(61);
    expect(result.every((r) => !r.prefilterMiss)).toBe(true);
  });

  it("defaults an omitted consultant to score 0 with a prefilterMiss flag", () => {
    const result = reconcilePrefilter(mockConsultants, [
      scored({ consultantId: "c1", score: 88 }),
    ]);

    const c2 = result.find((r) => r.consultantId === "c2")!;
    expect(c2.score).toBe(0);
    expect(c2.prefilterMiss).toBe(true);
    expect(c2.reasoning).toBe("");
    // The consultant is still present — the whole point of the fix.
    expect(result).toHaveLength(2);
  });

  it("drops a hallucinated id that is not in the pool", () => {
    const result = reconcilePrefilter(mockConsultants, [
      scored({ consultantId: "c1", score: 88 }),
      scored({ consultantId: "c2", level: "intermediate", score: 61 }),
      scored({ consultantId: "ghost", score: 99 }),
    ]);

    expect(result.map((r) => r.consultantId).sort()).toEqual(["c1", "c2"]);
    expect(result.some((r) => r.consultantId === "ghost")).toBe(false);
  });

  it("keeps the first score when the prefilter scores a consultant twice", () => {
    const result = reconcilePrefilter(mockConsultants, [
      scored({ consultantId: "c1", score: 80 }),
      scored({ consultantId: "c1", score: 40 }),
      scored({ consultantId: "c2", level: "intermediate", score: 61 }),
    ]);

    expect(result.find((r) => r.consultantId === "c1")!.score).toBe(80);
    expect(result).toHaveLength(2);
  });

  it("takes canonical name and level from the pool, not from the model", () => {
    const result = reconcilePrefilter(mockConsultants, [
      scored({ consultantId: "c1", consultantName: "Wrong Name", level: "junior", score: 88 }),
      scored({ consultantId: "c2", level: "intermediate", score: 61 }),
    ]);

    const c1 = result.find((r) => r.consultantId === "c1")!;
    expect(c1.consultantName).toBe("Anna Lindström");
    expect(c1.level).toBe("senior");
  });

  it("flags every consultant as a miss when the prefilter returns nothing", () => {
    const result = reconcilePrefilter(mockConsultants, []);

    expect(result).toHaveLength(2);
    expect(result.every((r) => r.prefilterMiss && r.score === 0)).toBe(true);
  });
});

describe("selectTopNPerLevel", () => {
  it("selects the top-N within each level independently", () => {
    const ids = selectTopNPerLevel(
      [
        scored({ consultantId: "s1", level: "senior", score: 90 }),
        scored({ consultantId: "s2", level: "senior", score: 80 }),
        scored({ consultantId: "s3", level: "senior", score: 70 }),
        scored({ consultantId: "j1", level: "junior", score: 50 }),
      ],
      2,
    );

    // Top-2 seniors, plus the only junior — the junior is NOT cut against the
    // higher-scoring seniors, since levels rank independently.
    expect([...ids].sort()).toEqual(["j1", "s1", "s2"]);
    expect(ids.has("s3")).toBe(false);
  });

  it("returns a whole level that has fewer than N", () => {
    const ids = selectTopNPerLevel(
      [
        scored({ consultantId: "e1", level: "expert", score: 30 }),
        scored({ consultantId: "e2", level: "expert", score: 20 }),
      ],
      5,
    );

    expect([...ids].sort()).toEqual(["e1", "e2"]);
  });
});

describe("mergeDeepReasoning", () => {
  it("overlays deep reasoning but keeps the base (prefilter) score", () => {
    const base = [scored({ consultantId: "c1", score: 85, reasoning: "" })];
    const deep = [scored({ consultantId: "c1", score: 99, reasoning: "rich rationale" })];

    const [c1] = mergeDeepReasoning(base, deep);
    expect(c1.reasoning).toBe("rich rationale");
    expect(c1.score).toBe(85);
  });

  it("leaves base entries the deep pass did not cover untouched", () => {
    const base = [
      scored({ consultantId: "c1", score: 85, reasoning: "" }),
      scored({ consultantId: "c2", score: 40, reasoning: "" }),
    ];
    const deep = [scored({ consultantId: "c1", score: 99, reasoning: "rich" })];

    const c2 = mergeDeepReasoning(base, deep).find((r) => r.consultantId === "c2")!;
    expect(c2.reasoning).toBe("");
    expect(c2.score).toBe(40);
  });

  it("adopts the deep score and clears the flag for a prefilterMiss consultant", () => {
    const base = [scored({ consultantId: "c3", score: 0, prefilterMiss: true })];
    const deep = [scored({ consultantId: "c3", score: 70, reasoning: "assessed" })];

    const [c3] = mergeDeepReasoning(base, deep);
    expect(c3.score).toBe(70);
    expect(c3.reasoning).toBe("assessed");
    expect(c3.prefilterMiss).toBeUndefined();
  });

  it("keeps every base consultant in the merged result", () => {
    const base = [
      scored({ consultantId: "c1" }),
      scored({ consultantId: "c2" }),
      scored({ consultantId: "c3" }),
    ];
    const deep = [scored({ consultantId: "c1", reasoning: "only one covered" })];

    expect(mergeDeepReasoning(base, deep).map((r) => r.consultantId)).toEqual(["c1", "c2", "c3"]);
  });
});

// Live-API integration test: skips unless ANTHROPIC_API_KEY is set
// (npm test stays offline; run with `npm run test:integration`).
describe.skipIf(!process.env.ANTHROPIC_API_KEY)("matchConsultants", () => {
  it("scores all consultants individually against the RFP", async () => {
    const result: ScoredMatchResult = await matchConsultants(mockAnalysis, mockConsultants);

    // Returns scored list for all consultants
    expect(result.scoredConsultants).toBeDefined();
    expect(result.scoredConsultants.length).toBe(2);

    // Each consultant has score + reasoning
    for (const sc of result.scoredConsultants) {
      expect(sc.consultantId).toBeTruthy();
      expect(sc.consultantName).toBeTruthy();
      expect(["junior", "intermediate", "senior", "expert"]).toContain(sc.level);
      expect(sc.score).toBeGreaterThanOrEqual(0);
      expect(sc.score).toBeLessThanOrEqual(100);
      expect(sc.reasoning).toBeTruthy();
    }

    // Anna (senior, strong match) should score higher than Erik (intermediate, partial match)
    const anna = result.scoredConsultants.find((c) => c.consultantId === "c1");
    const erik = result.scoredConsultants.find((c) => c.consultantId === "c2");
    expect(anna).toBeDefined();
    expect(erik).toBeDefined();
    expect(anna!.score).toBeGreaterThan(erik!.score);
  }, 120000);
});
