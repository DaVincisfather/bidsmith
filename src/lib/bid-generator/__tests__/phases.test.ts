import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BidContext } from "../context";
import type { RfpAnalysis } from "@/lib/types";

vi.mock("@/lib/ai-client", () => ({ callClaude: vi.fn() }));
import { callClaude } from "@/lib/ai-client";
import { buildPhasesBundle, PhasesV2Schema } from "../bundles/phases";
import { z } from "zod";

const baseAnalysis: RfpAnalysis = {
  title: "t", client: "c", deadline: null, summary: "s",
  requirements: [], evaluationCriteria: [], requiredCompetencies: [],
  estimatedScope: "", redFlags: [], domain: "",
  oslReference: null, secrecyRows: [],
};
const baseCtx: BidContext = {
  analysis: baseAnalysis,
  teamConsultants: [], scoredConsultants: [],
  goNoGoResult: {
    mustRequirements: [], winProbability: 50, winProbabilityReasoning: "",
    strengths: [], gaps: [], improvements: [], recommendation: "go", reasoning: "",
  },
};

beforeEach(() => { vi.mocked(callClaude).mockReset(); });

describe("buildPhasesBundle", () => {
  it("returns a single phases section with all phases", async () => {
    vi.mocked(callClaude).mockResolvedValue({
      phases: [
        {
          name: "Fas 1: Förstudie",
          objective: "Förstå nuläget",
          activities: ["Intervjuer", "Dokumentanalys"],
          deliverables: ["Nulägesrapport"],
          duration: "4 v",
          period: "M1-M2",
          decisions: ["Go/no-go till fas 2"],
          shortDescription: "Förstudie",
        },
        {
          name: "Fas 2: Design",
          objective: "Designa lösningen",
          activities: ["Workshop"],
          deliverables: ["Designunderlag"],
          duration: "6 v",
          period: "M2-M5",
          decisions: ["Arkitekturval"],
          shortDescription: "Design",
        },
        {
          name: "Fas 3: Implementation",
          objective: "Bygg",
          activities: ["Utveckling"],
          deliverables: ["MVP"],
          duration: "8 v",
          period: "M5-M9",
          decisions: ["Release-datum"],
          shortDescription: "Build",
        },
      ],
    });

    const { sections, overflowFlags } = await buildPhasesBundle(baseCtx, { budgets: {}, fieldSlides: {} }, { remaining: 5 });
    expect(sections).toHaveLength(1);
    expect(sections[0].key).toBe("phases");
    if (!sections[0].content) throw new Error("content missing");
    if (sections[0].content.format !== "phases") throw new Error();
    expect(sections[0].content.phases).toHaveLength(3);
    expect(sections[0].content.phases[0].period).toBe("M1-M2");
    expect(sections[0].content.phases[0].decisions).toEqual(["Go/no-go till fas 2"]);
    expect(overflowFlags).toEqual([]);
  });
});

describe("PhasesV2Schema", () => {
  const validPhase = {
    name: "Fas 1",
    objective: "Obj",
    activities: ["A"],
    deliverables: ["D"],
    duration: "4 v",
    decisions: ["Beslut"],
    shortDescription: "kort",
  };
  const threePhases = [validPhase, validPhase, validPhase];

  it("rejects fewer than 3 phases", () => {
    expect(() => PhasesV2Schema.parse({ phases: [validPhase, validPhase] })).toThrow(z.ZodError);
  });

  it("rejects more than 4 phases", () => {
    expect(() =>
      PhasesV2Schema.parse({ phases: [validPhase, validPhase, validPhase, validPhase, validPhase] }),
    ).toThrow(z.ZodError);
  });

  it("rejects phase with >4 activities", () => {
    expect(() =>
      PhasesV2Schema.parse({
        phases: [
          { ...validPhase, activities: ["a", "b", "c", "d", "e"] },
          validPhase,
          validPhase,
        ],
      }),
    ).toThrow(z.ZodError);
  });

  it("rejects phase with empty activities", () => {
    expect(() =>
      PhasesV2Schema.parse({
        phases: [{ ...validPhase, activities: [] }, validPhase, validPhase],
      }),
    ).toThrow(z.ZodError);
  });

  it("rejects phase with >3 deliverables", () => {
    expect(() =>
      PhasesV2Schema.parse({
        phases: [
          { ...validPhase, deliverables: ["a", "b", "c", "d"] },
          validPhase,
          validPhase,
        ],
      }),
    ).toThrow(z.ZodError);
  });

  it("rejects phase with >3 decisions", () => {
    expect(() =>
      PhasesV2Schema.parse({
        phases: [
          { ...validPhase, decisions: ["a", "b", "c", "d"] },
          validPhase,
          validPhase,
        ],
      }),
    ).toThrow(z.ZodError);
  });
});
