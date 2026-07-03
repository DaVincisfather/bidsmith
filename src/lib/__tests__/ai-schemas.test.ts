import { describe, it, expect } from "vitest";
import { PrioritySchema, RfpAnalysisSchema, RfpRequirementSchema } from "@/lib/ai-schemas";

describe("RfpRequirementSchema — kind (qualification vs deliverable)", () => {
  it("defaultar kind till qualification när fältet saknas (bakåtkompatibelt)", () => {
    const r = RfpRequirementSchema.parse({
      category: "Konsultkvalifikationer",
      description: "Minst 5 års erfarenhet",
      priority: "must",
      evidence: "Minst 5 års erfarenhet",
    });
    expect(r.kind).toBe("qualification");
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
        { category: "A", description: "a", priority: "ska-krav", evidence: "a" },
        { category: "B", description: "b", priority: "bör", evidence: "b" },
        { category: "C", description: "c", priority: "kan", evidence: "c" },
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
    requirements: [],
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
