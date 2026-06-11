import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCallClaude = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai-client", () => ({
  callClaude: mockCallClaude,
}));

import { SYSTEM_PROMPT, extractConsultant } from "@/lib/consultant-extractor";

describe("consultant-extractor prompt", () => {
  it("instruerar att språkkunskaper extraheras som kompetens", () => {
    // Promptar är data: testet låser kontraktet att språk inte tappas bort —
    // fas 0 visade att coverage-judgen annars inte kan belägga språkkrav.
    expect(SYSTEM_PROMPT).toMatch(/[Ss]pråk/);
  });
});

describe("extractConsultant", () => {
  beforeEach(() => mockCallClaude.mockReset());

  it("kör med temperature 0 — samma CV ska ge samma profil", async () => {
    mockCallClaude.mockResolvedValueOnce({});
    await extractConsultant("CV-text");
    expect(mockCallClaude.mock.calls[0][0].temperature).toBe(0);
  });
});
