import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCallClaude = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai-client", () => ({
  callClaude: mockCallClaude,
}));

import { runEvidenceGuard } from "@/lib/evidence-guard";

// Källtext där "React och TypeScript" och "molnmigration för Stockholms stad"
// finns ordagrant, men fabricerade citat inte gör det.
const SOURCE =
  "Konsulten behärskar React och TypeScript i moderna webbprojekt. Uppdrag: molnmigration för Stockholms stad 2020, ansvarig för leverans.";

// Fabriker: guarden muterar inte, men testerna delar inga objekt för säkerhets skull.
const verified = () => ({ text: "React", evidence: "React och TypeScript" });
const fabricated = () => ({ text: "Kubernetes", evidence: "Kubernetes och Go på AWS" });

function guard(items: { text: string; evidence?: string }[]) {
  return runEvidenceGuard({
    sourceText: SOURCE,
    items,
    label: "test",
    itemNoun: "kompetenser och referensuppdrag",
  });
}

describe("runEvidenceGuard", () => {
  beforeEach(() => mockCallClaude.mockReset());

  it("kortsluter utan API-anrop när alla citat verifierar", async () => {
    const result = await guard([verified()]);
    expect(mockCallClaude).not.toHaveBeenCalled();
    expect(result).toEqual(["React och TypeScript"]);
  });

  it("ett overifierbart citat → ETT re-citat-anrop med bara den posten numrerad; verifierande citat adopteras", async () => {
    mockCallClaude.mockResolvedValueOnce({
      quotes: [{ index: 1, evidence: "molnmigration för Stockholms stad" }],
    });

    const result = await guard([verified(), fabricated()]);

    expect(mockCallClaude).toHaveBeenCalledOnce();
    const args = mockCallClaude.mock.calls[0][0];
    // Bara det missade indexet numreras; källan skickas EN gång i <underlag>.
    expect(args.userContent).toContain("[1] Kubernetes");
    expect(args.userContent).not.toContain("[0] React");
    expect(args.userContent).toContain(`<underlag>\n${SOURCE}\n</underlag>`);
    // Adopterat citat + orört verifierat.
    expect(result).toEqual([
      "React och TypeScript",
      "molnmigration för Stockholms stad",
    ]);
  });

  it("re-citat returnerar null → undefined (flaggat)", async () => {
    mockCallClaude.mockResolvedValueOnce({ quotes: [{ index: 0, evidence: null }] });
    const result = await guard([fabricated()]);
    expect(result).toEqual([undefined]);
  });

  it("re-citat returnerar ett FORTFARANDE overifierbart citat → undefined", async () => {
    mockCallClaude.mockResolvedValueOnce({
      quotes: [{ index: 0, evidence: "detta citat finns inte heller i källan" }],
    });
    const result = await guard([fabricated()]);
    expect(result).toEqual([undefined]);
  });

  it("re-citat-anropet kastar → varning + undefined för alla missade, verifierat orört", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockCallClaude.mockRejectedValueOnce(new Error("boom"));

    const result = await guard([verified(), fabricated()]);

    expect(result).toEqual(["React och TypeScript", undefined]);
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0][0])).toContain("boom");
    warn.mockRestore();
  });

  it("etikett-trådning: re-citat använder `${label}:requote`", async () => {
    mockCallClaude.mockResolvedValueOnce({ quotes: [{ index: 0, evidence: null }] });
    await runEvidenceGuard({
      sourceText: SOURCE,
      items: [fabricated()],
      label: "eval:zero-halluc-cv",
      itemNoun: "kompetenser och referensuppdrag",
    });
    expect(mockCallClaude.mock.calls[0][0].label).toBe("eval:zero-halluc-cv:requote");
  });

  it("muterar INTE input-items — reparationen returneras i arrayen", async () => {
    mockCallClaude.mockResolvedValueOnce({
      quotes: [{ index: 1, evidence: "molnmigration för Stockholms stad" }],
    });
    const items = [verified(), fabricated()];
    const result = await guard(items);
    // Input orört ...
    expect(items[0].evidence).toBe("React och TypeScript");
    expect(items[1].evidence).toBe("Kubernetes och Go på AWS");
    // ... reparationen ligger i returvärdet.
    expect(result[1]).toBe("molnmigration för Stockholms stad");
  });
});
