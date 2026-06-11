// evals/harness/core/__tests__/judges-prompts.test.ts
import { describe, it, expect } from "vitest";
import { HALLUCINATION_SYSTEM, EQUIV_SYSTEM } from "../judges";

describe("judge-promptar (kalibrering fas 1)", () => {
  it("hallucination-judgen undantar dokumentdatum och teamallokeringar", () => {
    expect(HALLUCINATION_SYSTEM).toMatch(/anbudsdatum|dokumentdatum/i);
    expect(HALLUCINATION_SYSTEM).toMatch(/omfattning|allokering/i);
  });

  it("equiv-judgen tolererar specificerande omformulering", () => {
    expect(EQUIV_SYSTEM).toMatch(/specificerad|mer detaljerad/i);
  });
});
