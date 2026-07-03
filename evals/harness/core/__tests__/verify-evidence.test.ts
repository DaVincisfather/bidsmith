import { describe, it, expect } from "vitest";
import {
  verifyEvidence,
  normalizeForEvidence,
  type VerifiableRequirement,
} from "../verify-evidence";

const FX = "test-fixture";

function req(evidence: string | undefined, description = "Ett krav"): VerifiableRequirement {
  return { description, evidence };
}

describe("verifyEvidence — träff/miss/inte-funnen", () => {
  it("returnerar inga missar när citatet finns ordagrant i källan", () => {
    const source = "Anbudsgivaren ska ha minst tre års erfarenhet av liknande uppdrag.";
    const misses = verifyEvidence(FX, source, [req("minst tre års erfarenhet")]);
    expect(misses).toEqual([]);
  });

  it("markerar 'missing' när evidence är undefined (modellen utelämnade fältet)", () => {
    const source = "Text.";
    const misses = verifyEvidence(FX, source, [req(undefined)]);
    expect(misses).toHaveLength(1);
    expect(misses[0].reason).toBe("missing");
    expect(misses[0].evidence).toBeUndefined();
  });

  it("markerar 'missing' när evidence är tom/whitespace-only sträng", () => {
    const source = "Text.";
    const misses = verifyEvidence(FX, source, [req("   ")]);
    expect(misses).toHaveLength(1);
    expect(misses[0].reason).toBe("missing");
  });

  it("markerar 'not-found' när citatet inte finns i källan (fabricerat)", () => {
    const source = "Anbudsgivaren ska ha erfarenhet.";
    const misses = verifyEvidence(FX, source, [req("fem års erfarenhet av molntjänster")]);
    expect(misses).toHaveLength(1);
    expect(misses[0].reason).toBe("not-found");
    expect(misses[0].evidence).toBe("fem års erfarenhet av molntjänster");
  });

  it("bär med fixtureId och sammansatt requirementText (category: description)", () => {
    const source = "Text.";
    const misses = verifyEvidence(FX, source, [
      { category: "Erfarenhet", description: "Krav X", evidence: undefined },
    ]);
    expect(misses[0].fixtureId).toBe(FX);
    expect(misses[0].requirementText).toBe("Erfarenhet: Krav X");
  });
});

describe("verifyEvidence — normaliseringstolerans (innehåll oförändrat)", () => {
  it("matchar över radbrytning (PDF bryter meningar mitt itu)", () => {
    const source = "Anbudsgivaren ska ha minst\ntre års erfarenhet av liknande uppdrag.";
    // Citatet har mellanslag där källan har radbrytning.
    const misses = verifyEvidence(FX, source, [req("minst tre års erfarenhet")]);
    expect(misses).toEqual([]);
  });

  it("matchar över godtyckliga whitespace-körningar (tabbar, dubbla mellanslag)", () => {
    const source = "Krav:\t\tminst   tre    år.";
    const misses = verifyEvidence(FX, source, [req("minst tre år")]);
    expect(misses).toEqual([]);
  });

  it("matchar trots mjukt bindestreck i källans avstavning (U+00AD)", () => {
    // "erfaren­het" med soft hyphen — vanligt i PDF-avstavning.
    const source = "Krav på erfaren­het av branschen.";
    const misses = verifyEvidence(FX, source, [req("erfarenhet av branschen")]);
    expect(misses).toEqual([]);
  });

  it("matchar trots mjukt bindestreck i citatet men inte i källan", () => {
    const source = "Krav på erfarenhet av branschen.";
    const misses = verifyEvidence(FX, source, [req("erfaren­het av branschen")]);
    expect(misses).toEqual([]);
  });

  it("matchar typografiska citattecken mot raka ASCII-citat", () => {
    const source = "Uppdraget kallas ”Ramavtal” i underlaget."; // " "
    const misses = verifyEvidence(FX, source, [req('kallas "Ramavtal" i')]);
    expect(misses).toEqual([]);
  });

  it("matchar typografiskt apostrof mot rakt ASCII-apostrof", () => {
    const source = "Se leverantörens ’villkor’ nedan."; // ' '
    const misses = verifyEvidence(FX, source, [req("'villkor'")]);
    expect(misses).toEqual([]);
  });

  it("matchar långt/kort tankstreck mot ASCII-bindestreck", () => {
    const source = "Perioden 2026–2028 gäller."; // en-dash
    const misses = verifyEvidence(FX, source, [req("2026-2028")]);
    expect(misses).toEqual([]);
  });
});

describe("verifyEvidence — case-känslighet (innehållsskillnad ska fällas)", () => {
  it("markerar 'not-found' vid enbart skiftlägesskillnad", () => {
    const source = "anbudsgivaren ska ha erfarenhet";
    const misses = verifyEvidence(FX, source, [req("Anbudsgivaren ska ha erfarenhet")]);
    expect(misses).toHaveLength(1);
    expect(misses[0].reason).toBe("not-found");
  });
});

describe("verifyEvidence — kanter", () => {
  it("returnerar tom lista för tom kravlista", () => {
    expect(verifyEvidence(FX, "vad som helst", [])).toEqual([]);
  });

  it("rapporterar bara de krav som missar, i ordning", () => {
    const source = "Krav A finns här. Krav C finns också.";
    const misses = verifyEvidence(FX, source, [
      req("Krav A finns", "A"),
      req("Krav B saknas", "B"),
      req("Krav C finns", "C"),
      req(undefined, "D"),
    ]);
    expect(misses.map((m) => m.reason)).toEqual(["not-found", "missing"]);
    expect(misses.map((m) => m.requirementText)).toEqual(["B", "D"]);
  });
});

describe("normalizeForEvidence", () => {
  it("kollapsar all whitespace, tar bort soft hyphen och normaliserar typografi", () => {
    expect(normalizeForEvidence("a\n b­c  ”d” – e")).toBe('a bc "d" - e');
  });
});
