import { describe, it, expect } from "vitest";
import { dedupeRequirements } from "../requirement-dedupe";

const req = (description: string, priority = "must", kind = "qualification") => ({
  category: "Kompetens",
  description,
  priority,
  kind,
  evidence: "citat",
});

describe("dedupeRequirements", () => {
  it("keeps a list without duplicates untouched", () => {
    const list = [req("Erfarenhet av kollektivavtal"), req("Senior uppdragsansvarig")];
    expect(dedupeRequirements(list)).toEqual(list);
  });

  it("drops an identical duplicate, keeping the first occurrence", () => {
    const a = req("Anbudet ska innehålla CV och prisbilaga");
    const b = req("Anbudet ska innehålla CV och prisbilaga");
    expect(dedupeRequirements([a, b])).toEqual([a]);
  });

  it("collapses near-identical wording (whitespace/case) via normalization", () => {
    const a = req("Erfarenhet av facklig samverkan");
    const b = req("  erfarenhet av  Facklig samverkan ");
    expect(dedupeRequirements([a, b])).toEqual([a]);
  });

  it("collapses high-similarity rephrasings at the trigram threshold", () => {
    const a = req("Anbudet ska innehålla beskrivning av leverantör, föreslagna konsulter med CV, metodbeskrivning, referens samt prisbilaga");
    const b = req("Anbudet ska innehålla beskrivning av leverantören, föreslagna konsulter med CV, metodbeskrivning, referens och prisbilaga");
    expect(dedupeRequirements([a, b])).toHaveLength(1);
  });

  it("keeps near-dupes whose priority differs (never guesses the classification)", () => {
    const a = req("Erfarenhet av facklig samverkan", "must");
    const b = req("Erfarenhet av facklig samverkan", "should");
    expect(dedupeRequirements([a, b])).toHaveLength(2);
  });

  it("keeps near-dupes whose kind differs", () => {
    const a = req("Slutrapport med rekommendationer", "must", "qualification");
    const b = req("Slutrapport med rekommendationer", "must", "deliverable");
    expect(dedupeRequirements([a, b])).toHaveLength(2);
  });

  it("preserves order and dedupes across non-adjacent positions", () => {
    const a = req("Krav A");
    const b = req("Krav B");
    const a2 = req("Krav A");
    expect(dedupeRequirements([a, b, a2])).toEqual([a, b]);
  });

  it("keeps digit-reference rows that differ only in the numeric reference (bilaga 3 vs bilaga 4)", () => {
    const a = req("Anbudsgivaren ska bifoga ifylld och undertecknad bilaga 3 till anbudet");
    const b = req("Anbudsgivaren ska bifoga ifylld och undertecknad bilaga 4 till anbudet");
    expect(dedupeRequirements([a, b])).toHaveLength(2);
  });

  it("keeps digit-reference rows that differ only in the section reference (avsnitt 3.2 vs 3.4)", () => {
    const a = req("Anbudsgivaren ska uppfylla krav enligt avsnitt 3.2");
    const b = req("Anbudsgivaren ska uppfylla krav enligt avsnitt 3.4");
    expect(dedupeRequirements([a, b])).toHaveLength(2);
  });

  it("still collapses a verbatim duplicate that contains digits", () => {
    const a = req("Uppdraget omfattar 3 faser under 2026");
    const b = req("Uppdraget omfattar 3 faser under 2026");
    expect(dedupeRequirements([a, b])).toEqual([a]);
  });

  it("collapses an undefined kind with an explicit 'qualification' kind via the fallback", () => {
    const a = { ...req("Erfarenhet av offentlig upphandling", "must"), kind: undefined };
    const b = req("Erfarenhet av offentlig upphandling", "must", "qualification");
    expect(dedupeRequirements([a, b])).toHaveLength(1);
  });
});
