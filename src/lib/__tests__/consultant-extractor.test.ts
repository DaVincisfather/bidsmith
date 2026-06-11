import { describe, it, expect } from "vitest";
import { SYSTEM_PROMPT } from "@/lib/consultant-extractor";

describe("consultant-extractor prompt", () => {
  it("instruerar att språkkunskaper extraheras som kompetens", () => {
    // Promptar är data: testet låser kontraktet att språk inte tappas bort —
    // fas 0 visade att coverage-judgen annars inte kan belägga språkkrav.
    expect(SYSTEM_PROMPT).toMatch(/[Ss]pråk/);
  });
});
