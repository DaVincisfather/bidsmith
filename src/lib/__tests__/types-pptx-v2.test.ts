// @vitest-environment node
import { describe, it, expect } from "vitest";
import type {
  BidSectionContent,
  ExecutionPhase,
} from "../types";

describe("PPTX v2 type additions", () => {
  it("accepts section-divider format", () => {
    const content: BidSectionContent = {
      format: "section-divider",
      sectionNumber: 2,
      subtitle: "Arbetssätt och metod",
    };
    expect(content.format).toBe("section-divider");
  });

  it("accepts three-column format", () => {
    const content: BidSectionContent = {
      format: "three-column",
      columns: [
        { title: "Nuläge", icon: "N", body: "Text..." },
        { title: "Vad vi ser", icon: "V", body: "Text..." },
        { title: "Vårt uppdrag", icon: "U", body: "Text..." },
      ],
    };
    expect(content.format).toBe("three-column");
  });

  it("accepts gantt format", () => {
    const content: BidSectionContent = {
      format: "gantt",
      phases: [
        {
          name: "Fas 1",
          objective: "Kartlägg",
          activities: ["Intervjuer"],
          deliverables: ["Rapport"],
          duration: "4 veckor",
          risks: ["Underlag fördröjs"],
          hoursEstimate: 100,
          period: "Mars 2026",
        },
      ],
      milestones: [{ label: "Rapport klar", afterPhase: 3 }],
    };
    expect(content.format).toBe("gantt");
  });

  it("accepts ExecutionPhase with optional new fields", () => {
    const phase: ExecutionPhase = {
      name: "Fas 1",
      objective: "Test",
      activities: ["A"],
      deliverables: ["D"],
      duration: "2 veckor",
      risks: ["Risk 1"],
      hoursEstimate: 80,
      period: "April 2026",
    };
    expect(phase.risks).toEqual(["Risk 1"]);
    expect(phase.hoursEstimate).toBe(80);
    expect(phase.period).toBe("April 2026");
  });
});
