// evals/harness/core/__tests__/pairwise-judge.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai-client", () => ({ callClaude: vi.fn() }));
import { callClaude } from "@/lib/ai-client";
import { judgePairBlind } from "../pairwise-judge";

beforeEach(() => vi.mocked(callClaude).mockReset());

describe("judgePairBlind", () => {
  it("samstämmiga domar ger vinnaren", async () => {
    // Pass 1: A först (A = modellA) → "A". Pass 2: positioner bytta → "B" pekar på samma text.
    vi.mocked(callClaude)
      .mockResolvedValueOnce({ winner: "A", motivering: "tydligare" })
      .mockResolvedValueOnce({ winner: "B", motivering: "tydligare" });
    const r = await judgePairBlind({
      sectionType: "phases", textA: "text-1", textB: "text-2",
    });
    expect(r.winner).toBe("A");
    expect(vi.mocked(callClaude)).toHaveBeenCalledTimes(2);
    // Pass 2 ska ha texterna i omvänd ordning i prompten.
    const secondPrompt = (vi.mocked(callClaude).mock.calls[1][0] as { userContent: string }).userContent;
    expect(secondPrompt.indexOf("text-2")).toBeLessThan(secondPrompt.indexOf("text-1"));
  });

  it("oense domar ger oavgjort", async () => {
    vi.mocked(callClaude)
      .mockResolvedValueOnce({ winner: "A", motivering: "x" })
      .mockResolvedValueOnce({ winner: "A", motivering: "y" }); // efter byte = motsägelse
    const r = await judgePairBlind({ sectionType: "phases", textA: "t1", textB: "t2" });
    expect(r.winner).toBe("tie");
  });

  it("explicit oavgjort i något pass ger oavgjort", async () => {
    vi.mocked(callClaude)
      .mockResolvedValueOnce({ winner: "tie", motivering: "likvärdiga" })
      .mockResolvedValueOnce({ winner: "B", motivering: "x" });
    const r = await judgePairBlind({ sectionType: "phases", textA: "t1", textB: "t2" });
    expect(r.winner).toBe("tie");
  });

  it("domarna körs deterministiskt (temperature 0)", async () => {
    vi.mocked(callClaude)
      .mockResolvedValueOnce({ winner: "A", motivering: "x" })
      .mockResolvedValueOnce({ winner: "B", motivering: "y" });
    await judgePairBlind({ sectionType: "phases", textA: "t1", textB: "t2" });
    for (const call of vi.mocked(callClaude).mock.calls) {
      expect((call[0] as { temperature?: number }).temperature).toBe(0);
    }
  });
});
