// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai-client", () => ({
  callClaude: vi.fn(),
}));

import { callClaude } from "@/lib/ai-client";
import {
  matchConsultants,
  selectTopNPerLevel,
  mergeDeepReasoning,
  DEFAULT_DEEP_PER_LEVEL,
} from "@/lib/consultant-matcher";
import {
  RfpAnalysis,
  Consultant,
  ConsultantLevel,
  ScoredConsultant,
  ScoredMatchResult,
} from "@/lib/types";

// --- builders -------------------------------------------------------------

function consultant(id: string, level: ConsultantLevel): Consultant {
  return {
    id,
    name: `Konsult ${id}`,
    level,
    yearsExperience: 5,
    summary: `Summary ${id}`,
    rawCvText: null,
    competencies: [{ competency: "Organisationsöversyner", category: "domain" }],
    references: [
      { title: `Ref ${id}`, description: "d", year: 2024, sector: "public" },
    ],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
}

function scored(
  id: string,
  level: ConsultantLevel,
  score: number,
  reasoning = "haiku",
): ScoredConsultant {
  return { consultantId: id, consultantName: `Konsult ${id}`, level, score, reasoning };
}

const analysis: RfpAnalysis = {
  title: "Organisationsöversyn",
  client: "Göteborgs stad",
  deadline: null,
  summary: "s",
  requirements: [],
  evaluationCriteria: [],
  requiredCompetencies: [],
  estimatedScope: "",
  redFlags: [],
  domain: "management",
  oslReference: null,
  secrecyRows: [],
};

beforeEach(() => {
  vi.mocked(callClaude).mockReset();
});

// --- selectTopNPerLevel (pure) -------------------------------------------

describe("selectTopNPerLevel", () => {
  it("picks the top N by score within each level independently", () => {
    const list = [
      scored("s1", "senior", 90),
      scored("s2", "senior", 70),
      scored("s3", "senior", 50),
      scored("i1", "intermediate", 80),
      scored("i2", "intermediate", 40),
    ];
    const picked = selectTopNPerLevel(list, 1);
    // top-1 per level: best senior + best intermediate
    expect(picked).toEqual(new Set(["s1", "i1"]));
  });

  it("returns all in a level when it has fewer than N", () => {
    const list = [scored("s1", "senior", 90), scored("i1", "intermediate", 80)];
    const picked = selectTopNPerLevel(list, 5);
    expect(picked).toEqual(new Set(["s1", "i1"]));
  });
});

// --- mergeDeepReasoning (pure) -------------------------------------------

describe("mergeDeepReasoning", () => {
  const base = [
    scored("s1", "senior", 90, "haiku-s1"),
    scored("s2", "senior", 70, "haiku-s2"),
    scored("i1", "intermediate", 80, "haiku-i1"),
  ];

  it("keeps every consultant — nobody disappears", () => {
    const deep = [scored("s1", "senior", 91, "deep-s1")];
    const merged = mergeDeepReasoning(base, deep);
    expect(merged.map((c) => c.consultantId).sort()).toEqual(["i1", "s1", "s2"]);
  });

  it("replaces reasoning for deep-scored consultants but keeps the Haiku ranking score", () => {
    const deep = [scored("s1", "senior", 12 /* ignored */, "deep-s1")];
    const merged = mergeDeepReasoning(base, deep);
    const s1 = merged.find((c) => c.consultantId === "s1")!;
    expect(s1.reasoning).toBe("deep-s1");
    expect(s1.score).toBe(90); // ranking stays on the Haiku score, not the deep re-score
  });

  it("leaves non-deep consultants untouched (Haiku reasoning kept)", () => {
    const deep = [scored("s1", "senior", 91, "deep-s1")];
    const merged = mergeDeepReasoning(base, deep);
    const s2 = merged.find((c) => c.consultantId === "s2")!;
    expect(s2.reasoning).toBe("haiku-s2");
  });
});

// --- matchConsultants orchestration (mocked AI) --------------------------

describe("matchConsultants (two-stage)", () => {
  it("returns a score for the whole pool, deep reasoning only for top-N per level", async () => {
    const pool: Consultant[] = [
      consultant("s1", "senior"),
      consultant("s2", "senior"),
      consultant("s3", "senior"),
      consultant("i1", "intermediate"),
    ];

    vi.mocked(callClaude).mockImplementation(async (opts: { model: string }) => {
      if (opts.model.includes("haiku")) {
        // Stage 1: Haiku scores everyone.
        return {
          scoredConsultants: [
            scored("s1", "senior", 90, "haiku"),
            scored("s2", "senior", 70, "haiku"),
            scored("s3", "senior", 50, "haiku"),
            scored("i1", "intermediate", 60, "haiku"),
          ],
        } as ScoredMatchResult as never;
      }
      // Stage 2: Sonnet deep-reasons only what it was handed.
      return {
        scoredConsultants: [
          scored("s1", "senior", 90, "deep"),
          scored("i1", "intermediate", 60, "deep"),
        ],
      } as ScoredMatchResult as never;
    });

    const result = await matchConsultants(analysis, pool, null, 1);

    // Whole pool present.
    expect(result.scoredConsultants).toHaveLength(4);
    // Top-1 per level got deep reasoning.
    const byId = Object.fromEntries(
      result.scoredConsultants.map((c) => [c.consultantId, c]),
    );
    expect(byId.s1.reasoning).toBe("deep");
    expect(byId.i1.reasoning).toBe("deep");
    // The tail carries NO rationale text (Haiku emits scores only — no
    // hallucination surface), even though the mock returned "haiku" text.
    expect(byId.s2.reasoning).toBe("");
    expect(byId.s3.reasoning).toBe("");
  });

  it("never hands the expensive Sonnet call the whole pool — it scales with N, not pool size", async () => {
    // 40 seniors; with N=2 the deep call must see at most 2, not 40.
    const pool: Consultant[] = Array.from({ length: 40 }, (_, k) =>
      consultant(`s${k}`, "senior"),
    );

    let deepCallConsultantCount = -1;
    vi.mocked(callClaude).mockImplementation(
      async (opts: { model: string; userContent: string }) => {
        if (opts.model.includes("haiku")) {
          return {
            scoredConsultants: pool.map((c, k) =>
              scored(c.id, "senior", 100 - k, "haiku"),
            ),
          } as ScoredMatchResult as never;
        }
        // Count how many consultant ids the deep prompt references.
        deepCallConsultantCount = pool.filter((c) =>
          opts.userContent.includes(c.id),
        ).length;
        return {
          scoredConsultants: pool
            .slice(0, 2)
            .map((c) => scored(c.id, "senior", 99, "deep")),
        } as ScoredMatchResult as never;
      },
    );

    const result = await matchConsultants(analysis, pool, null, 2);

    expect(deepCallConsultantCount).toBeLessThanOrEqual(2);
    // But the user still sees all 40.
    expect(result.scoredConsultants).toHaveLength(40);
  });

  it("uses Haiku for the prefilter and Sonnet for the deep pass", async () => {
    const models: string[] = [];
    vi.mocked(callClaude).mockImplementation(async (opts: { model: string }) => {
      models.push(opts.model);
      return {
        scoredConsultants: [scored("s1", "senior", 90, "x")],
      } as ScoredMatchResult as never;
    });

    await matchConsultants(analysis, [consultant("s1", "senior")], null);

    expect(models[0]).toContain("haiku");
    expect(models[1]).toContain("sonnet");
  });

  it("exposes a sane default for deep-reasoning breadth", () => {
    expect(DEFAULT_DEEP_PER_LEVEL).toBeGreaterThanOrEqual(3);
  });

  it("scales the prefilter token cap with pool size (no fixed 8000 truncation)", async () => {
    const caps: number[] = [];
    vi.mocked(callClaude).mockImplementation(async (opts: { model: string; maxTokens: number }) => {
      if (opts.model.includes("haiku")) caps.push(opts.maxTokens);
      return { scoredConsultants: [] } as ScoredMatchResult as never;
    });

    const small = Array.from({ length: 5 }, (_, k) => consultant(`s${k}`, "senior"));
    const large = Array.from({ length: 200 }, (_, k) => consultant(`s${k}`, "senior"));
    await matchConsultants(analysis, small, null);
    await matchConsultants(analysis, large, null);

    expect(caps[0]).toBeLessThan(caps[1]); // grows with pool
    expect(caps[1]).toBeGreaterThan(8000); // 200 consultants would blow the old fixed cap
  });
});
