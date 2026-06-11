// Parning + judge-wiring för analyzer-evalen — kalibrerad efter fas 1-felsökningen:
// modellen buntar/delar krav annorlunda än golden (giltigt), och fritextfält
// kan inte dömas med case-känslig exact match.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../core/judges", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../core/judges")>();
  return { ...orig, haikuEquivJudge: vi.fn(), exactJudge: vi.fn() };
});
import { haikuEquivJudge, exactJudge } from "../../core/judges";
import { judgeArrayField, judgeAnalyzer, computeAnalyzerMetrics } from "../analyzer";
import type { FieldJudgment } from "../../core/types";

beforeEach(() => {
  vi.mocked(haikuEquivJudge).mockReset();
  vi.mocked(exactJudge).mockReset();
});

function substringEquiv() {
  vi.mocked(haikuEquivJudge).mockImplementation(async ({ field, golden, actual }) => ({
    field,
    judge: "haiku-equiv",
    match: String(actual).includes(String(golden)),
    golden,
    actual,
  }));
}

describe("judgeArrayField — buntad output får matcha flera golden", () => {
  it("en output som täcker två golden ger två matchningar och ingen extra-post för bunten", async () => {
    substringEquiv();
    const out: FieldJudgment[] = [];
    await judgeArrayField(out, "requirements", ["A", "B"], ["A B bundle", "C"]);
    const goldenJ = out.filter((j) => /^requirements\[\d+\]$/.test(j.field));
    expect(goldenJ.filter((j) => j.match)).toHaveLength(2);
    const extra = out.filter((j) => j.field.startsWith("requirements[extra_"));
    expect(extra).toHaveLength(1);
    expect(extra[0].actual).toBe("C");
  });
});

describe("computeAnalyzerMetrics — precision räknar distinkta matchade outputs", () => {
  it("två golden matchade mot samma output ger recall 2/3 och precision 1/2", () => {
    const judgments: FieldJudgment[] = [
      { field: "requirements[0]", judge: "haiku-equiv", match: true, golden: "A", actual: "A B bundle" },
      { field: "requirements[1]", judge: "haiku-equiv", match: true, golden: "B", actual: "A B bundle" },
      { field: "requirements[2]", judge: "haiku-equiv", match: false, golden: "D", actual: null },
      { field: "requirements[extra_1]", judge: "haiku-equiv", match: false, golden: null, actual: "C" },
    ];
    const metrics = computeAnalyzerMetrics(judgments, {
      goldenCounts: { requirements: 3 },
      outputCounts: { requirements: 2 },
      outputMatchedCounts: { requirements: 1 },
    });
    expect(metrics["requirements.recall"]).toBeCloseTo(2 / 3);
    expect(metrics["requirements.precision"]).toBeCloseTo(1 / 2);
  });
});

describe("judgeAnalyzer — fritextfält döms semantiskt, vikt hålls utanför kriteriesträngen", () => {
  const fixture = {
    id: "t",
    rfp_text: "x",
    golden: {
      title: "T", client: "Region Örebro län", deadline: null, summary: "S",
      domain: "D", estimatedScope: "E",
      requirements: [],
      evaluationCriteria: [{ name: "Pris", weight: null, description: "Lägst pris vinner" }],
      requiredCompetencies: [], redFlags: [],
    },
  };
  const actual = {
    title: "T", client: "Region Örebro Län", deadline: null, summary: "S",
    domain: "D", estimatedScope: "E",
    requirements: [],
    evaluationCriteria: [{ name: "Pris", weight: null, description: "Lägst pris vinner" }],
    requiredCompetencies: [], redFlags: [],
  };

  it("client och domain går till equiv-judgen, inte exact", async () => {
    substringEquiv();
    vi.mocked(exactJudge).mockImplementation(async ({ field, golden, actual: a }) => ({
      field, judge: "exact", match: Object.is(golden, a), golden, actual: a,
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await judgeAnalyzer(fixture as any, actual as any);
    const equivFields = vi.mocked(haikuEquivJudge).mock.calls.map((c) => c[0].field);
    expect(equivFields).toContain("client");
    expect(equivFields).toContain("domain");
    const exactFields = vi.mocked(exactJudge).mock.calls.map((c) => c[0].field);
    expect(exactFields).not.toContain("client");
    expect(exactFields).not.toContain("domain");
  });

  it("kriteriesträngen innehåller inte vikten — viktoenighet får inte fälla innehållsmatchen", async () => {
    substringEquiv();
    vi.mocked(exactJudge).mockImplementation(async ({ field, golden, actual: a }) => ({
      field, judge: "exact", match: true, golden, actual: a,
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await judgeAnalyzer(fixture as any, actual as any);
    const criteriaInputs = vi.mocked(haikuEquivJudge).mock.calls
      .filter((c) => String(c[0].field).startsWith("evaluationCriteria"))
      .flatMap((c) => [String(c[0].golden), String(c[0].actual)]);
    expect(criteriaInputs.length).toBeGreaterThan(0);
    for (const s of criteriaInputs) {
      expect(s).not.toMatch(/null%|\d+%\)/);
    }
  });
});
