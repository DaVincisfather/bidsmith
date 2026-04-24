import { describe, it, expect } from "vitest";
import { PrioritySchema, RfpAnalysisSchema } from "@/lib/ai-schemas";

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
        { category: "A", description: "a", priority: "ska-krav" },
        { category: "B", description: "b", priority: "bör" },
        { category: "C", description: "c", priority: "kan" },
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
