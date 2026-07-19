import { describe, it, expect } from "vitest";
import {
  PrioritySchema,
  RfpAnalysisSchema,
  RfpRequirementSchema,
  GoNoGoAiResponseSchema,
} from "@/lib/ai-schemas";

describe("RfpRequirementSchema — kind (qualification vs deliverable)", () => {
  it("avvisar krav UTAN kind — modellen måste klassa varje krav (BUG-A)", () => {
    // .default("qualification") gjorde fältet utelämnbart i structured outputs;
    // varje utelämnande blev tyst qualification och leveranser läckte in i
    // ska-kraven. Required stänger vägen; legacy-LÄSNING är types.ts:s ansvar.
    expect(() =>
      RfpRequirementSchema.parse({
        category: "Konsultkvalifikationer",
        description: "Minst 5 års erfarenhet",
        priority: "must",
        evidence: "Minst 5 års erfarenhet",
      }),
    ).toThrow();
  });

  it("bevarar kind=deliverable", () => {
    const r = RfpRequirementSchema.parse({
      category: "Leverans",
      description: "Skriftlig slutrapport",
      priority: "must",
      kind: "deliverable",
      evidence: "en skriftlig slutrapport ska levereras",
    });
    expect(r.kind).toBe("deliverable");
  });

  it("avvisar okänt kind-värde", () => {
    expect(() =>
      RfpRequirementSchema.parse({
        category: "x",
        description: "y",
        priority: "must",
        kind: "annat",
        evidence: "citat",
      }),
    ).toThrow();
  });
});

describe("RfpRequirementSchema — evidence (obligatoriskt i modell-output)", () => {
  it("accepterar ett krav med ordagrant citat", () => {
    const r = RfpRequirementSchema.parse({
      category: "Erfarenhet",
      description: "Minst tre års erfarenhet",
      priority: "must",
      kind: "qualification",
      evidence: "minst tre års erfarenhet av liknande uppdrag",
    });
    expect(r.evidence).toBe("minst tre års erfarenhet av liknande uppdrag");
  });

  it("avvisar krav helt utan evidence-fält (modellen MÅSTE citera)", () => {
    expect(() =>
      RfpRequirementSchema.parse({
        category: "x",
        description: "y",
        priority: "must",
      }),
    ).toThrow();
  });

  it("avvisar tomt evidence (min(1))", () => {
    expect(() =>
      RfpRequirementSchema.parse({
        category: "x",
        description: "y",
        priority: "must",
        evidence: "",
      }),
    ).toThrow();
  });

  it("avvisar TOM kravlista i modell-output (degenererat svar → format-retry)", () => {
    // Varv 1-belägg 2026-07-03: samma dokument gav 0 krav (235 output-tokens) i
    // en körning, 20 krav i nästa. En RFP utan krav existerar inte — Zod-missen
    // gör det degenererade svaret till ResponseFormatError som re-promptas.
    expect(() =>
      RfpAnalysisSchema.parse({
        title: "t", client: "c", deadline: null, summary: "s",
        requirements: [],
        evaluationCriteria: [], requiredCompetencies: [],
        estimatedScope: "", redFlags: [], domain: "",
        oslReference: null, secrecyRows: [],
      }),
    ).toThrow(/requirements|too_small|minst/i);
  });
});

describe("PrioritySchema — canonical values", () => {
  it.each(["must", "should", "nice-to-have"] as const)(
    "accepts %s unchanged",
    (value) => {
      expect(PrioritySchema.parse(value)).toBe(value);
    }
  );
});

describe("PrioritySchema — Swedish coercion", () => {
  const cases: Array<[string, "must" | "should" | "nice-to-have"]> = [
    ["ska", "must"],
    ["skall", "must"],
    ["ska-krav", "must"],
    ["skall-krav", "must"],
    ["Skall-krav", "must"],
    ["SKAKRAV", "must"],
    ["bör", "should"],
    ["bör-krav", "should"],
    ["Bör-krav", "should"],
    ["kan", "nice-to-have"],
    ["kan-krav", "nice-to-have"],
    ["önskemål", "nice-to-have"],
  ];

  it.each(cases)("coerces %s → %s", (input, expected) => {
    expect(PrioritySchema.parse(input)).toBe(expected);
  });
});

describe("PrioritySchema — English variants", () => {
  const cases: Array<[string, "must" | "should" | "nice-to-have"]> = [
    ["Must", "must"],
    ["MUST", "must"],
    ["Should", "should"],
    ["Nice-to-have", "nice-to-have"],
    ["nice to have", "nice-to-have"],
    ["nice_to_have", "nice-to-have"],
    ["mandatory", "must"],
    ["required", "must"],
    ["optional", "nice-to-have"],
    ["recommended", "should"],
    ["  must  ", "must"],
  ];

  it.each(cases)("coerces %s → %s", (input, expected) => {
    expect(PrioritySchema.parse(input)).toBe(expected);
  });
});

describe("PrioritySchema — invalid values still fail", () => {
  it.each(["gibberish", "", "critical", "low"])(
    "rejects %s",
    (value) => {
      expect(() => PrioritySchema.parse(value)).toThrow();
    }
  );
});

describe("RfpAnalysisSchema — priority coercion in requirements", () => {
  const base = {
    title: "t",
    client: "c",
    deadline: null,
    summary: "s",
    evaluationCriteria: [],
    requiredCompetencies: [],
    estimatedScope: "",
    redFlags: [],
    domain: "",
    oslReference: null,
    secrecyRows: [],
  };

  it("coerces Swedish priorities in the requirements array", () => {
    const raw = {
      ...base,
      requirements: [
        { category: "A", description: "a", priority: "ska-krav", kind: "qualification", evidence: "a" },
        { category: "B", description: "b", priority: "bör", kind: "qualification", evidence: "b" },
        { category: "C", description: "c", priority: "kan", kind: "qualification", evidence: "c" },
      ],
    };
    const parsed = RfpAnalysisSchema.parse(raw);
    expect(parsed.requirements.map((r) => r.priority)).toEqual([
      "must",
      "should",
      "nice-to-have",
    ]);
  });
});

describe("RfpAnalysisSchema — evaluationCriteria weight", () => {
  const base = {
    title: "t",
    client: "c",
    deadline: null,
    summary: "s",
    // min(1) på requirements — basen bär ett minimalt giltigt krav.
    requirements: [{ category: "x", description: "y", priority: "must", kind: "qualification", evidence: "z" }],
    requiredCompetencies: [],
    estimatedScope: "",
    redFlags: [],
    domain: "",
    oslReference: null,
    secrecyRows: [],
  };

  it("accepterar weight: null när källan inte anger procentvikt", () => {
    // Svenska upphandlingar använder ofta rangordning eller prisavdrag i kronor —
    // ett krav på numerisk vikt tvingar modellen att fabricera siffror.
    const raw = {
      ...base,
      evaluationCriteria: [
        { name: "Metodbeskrivning", weight: null, description: "Rangordnat kriterium" },
        { name: "Pris", weight: 50, description: "Viktat kriterium" },
      ],
    };
    const parsed = RfpAnalysisSchema.parse(raw);
    expect(parsed.evaluationCriteria[0].weight).toBeNull();
    expect(parsed.evaluationCriteria[1].weight).toBe(50);
  });
});

describe("GoNoGoAiResponseSchema — mustRequirements bär index, inte kravtext", () => {
  const base = {
    winProbability: 72,
    winProbabilityReasoning: "r",
    strengths: [],
    gaps: [],
    improvements: [],
    recommendation: "go" as const,
    reasoning: "r",
  };

  it("accepterar en giltig rad: index 1, met true, coveredBy null", () => {
    const parsed = GoNoGoAiResponseSchema.parse({
      ...base,
      mustRequirements: [{ index: 1, met: true, coveredBy: null }],
    });
    expect(parsed.mustRequirements).toEqual([{ index: 1, met: true, coveredBy: null }]);
  });

  it("avvisar index: 0 (kravlistan är 1-baserad)", () => {
    expect(() =>
      GoNoGoAiResponseSchema.parse({
        ...base,
        mustRequirements: [{ index: 0, met: true, coveredBy: null }],
      }),
    ).toThrow();
  });

  it("avvisar negativt index", () => {
    expect(() =>
      GoNoGoAiResponseSchema.parse({
        ...base,
        mustRequirements: [{ index: -1, met: false, coveredBy: null }],
      }),
    ).toThrow();
  });

  it("avvisar den gamla formen { requirement: \"...\" } (latensfixen bytte ut kravtext mot index)", () => {
    expect(() =>
      GoNoGoAiResponseSchema.parse({
        ...base,
        mustRequirements: [{ requirement: "Minst 5 års erfarenhet", met: true, coveredBy: null }],
      }),
    ).toThrow();
  });
});
