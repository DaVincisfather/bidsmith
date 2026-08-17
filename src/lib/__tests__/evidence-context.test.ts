import { describe, it, expect } from "vitest";
import { locateAllSpans, normalizeWithMap } from "../evidence-context";
import { normalizeForEvidence } from "../verify-evidence";

describe("normalizeWithMap — normaliserad output identisk med verifieraren", () => {
  // Self-consistency-grinden: spann-lokaliseraren MÅSTE normalisera exakt som
  // verify-evidence, annars hittar den inte citatet verifieraren matchade.
  const corpus = [
    "Anbudsgivaren ska ha minst\ntre års erfarenhet av liknande uppdrag.",
    "Krav:\t\tminst   tre    år.",
    "Krav på erfaren­het av branschen.", // soft hyphen
    "Krav på lång erfaren-\nhet av branschen.", // avstavning vid radslut
    "Uppdraget kallas ”Ramavtal” – se ’villkor’ 2026–2028.", // typografi
    "minst 200 timmar•genomförts inom tre år", // bullet-glyf
    "  ledande och avslutande blanksteg  ",
    "IT-\nkonsult med bred profil",
    "",
    "•●▪◦· bara glyfer",
  ];
  for (const s of corpus) {
    it(`matchar normalizeForEvidence för ${JSON.stringify(s).slice(0, 40)}`, () => {
      expect(normalizeWithMap(s).normalized).toBe(normalizeForEvidence(s));
    });
  }

  it("origStart har längd N+1 med sentinel = originalLängd", () => {
    const text = "abc def";
    const { normalized, origStart } = normalizeWithMap(text);
    expect(origStart).toHaveLength(normalized.length + 1);
    expect(origStart[normalized.length]).toBe(text.length);
  });
});

describe("locateAllSpans — flerspann + merge", () => {
  const source =
    "Anbudsgivaren ska ha minst tre års erfarenhet av liknande uppdrag inom offentlig sektor. Referenser ska bifogas anbudet.";

  it("lokaliserar varje citat och bär evidens per spann", () => {
    const { perEvidence } = locateAllSpans(source, [
      "minst tre års erfarenhet",
      "Referenser ska bifogas",
    ]);
    expect(perEvidence).toHaveLength(2);
    for (const s of perEvidence) {
      expect(source.slice(s.start, s.end)).toBe(s.evidence);
    }
  });

  it("släpper citat som inte återfinns (null-filter)", () => {
    const { perEvidence, merged } = locateAllSpans(source, [
      "minst tre års erfarenhet",
      "detta citat existerar inte i underlaget alls",
    ]);
    expect(perEvidence).toHaveLength(1);
    expect(merged).toHaveLength(1);
  });

  it("slår ihop överlappande citat i merged men behåller per-citat-spann", () => {
    // Två citat som citerar överlappande text.
    const { perEvidence, merged } = locateAllSpans(source, [
      "minst tre års erfarenhet av liknande",
      "erfarenhet av liknande uppdrag inom offentlig",
    ]);
    expect(perEvidence).toHaveLength(2);
    // Överlappet unioneras → ETT sammanhängande merged-spann.
    expect(merged).toHaveLength(1);
    expect(source.slice(merged[0].start, merged[0].end)).toBe(
      "minst tre års erfarenhet av liknande uppdrag inom offentlig",
    );
    // Per-citat-spannen är fortfarande distinkta (för aktiv-citat-betoningen).
    expect(perEvidence[0].start).not.toBe(perEvidence[1].start);
  });

  it("håller isär icke-överlappande citat i merged", () => {
    const { merged } = locateAllSpans(source, [
      "minst tre års erfarenhet",
      "Referenser ska bifogas",
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0].start).toBeLessThan(merged[1].start);
  });

  it("tom källa → tomma listor", () => {
    expect(locateAllSpans("", ["x"])).toEqual({ merged: [], perEvidence: [] });
  });

  it("mappar tillbaka över radbrytning + mjukt bindestreck i källan", () => {
    // Källan har radbrytning OCH soft hyphen; citatet är rent. Offsetten pekar in
    // i originaltexten (inte den normaliserade kopian), så sliceet bär källans glyfer.
    const src = "Krav på lång erfaren­het av\nbranschen och mer text.";
    const { perEvidence } = locateAllSpans(src, ["erfarenhet av branschen"]);
    expect(perEvidence).toHaveLength(1);
    const raw = src.slice(perEvidence[0].start, perEvidence[0].end);
    expect(raw).toContain("erfaren­het"); // soft hyphen bevarad i originalet
    expect(raw).toContain("\n"); // radbrytning bevarad i originalet
    // Efter normalisering matchar utsnittet citatet.
    expect(normalizeForEvidence(raw)).toBe("erfarenhet av branschen");
  });

  it("versaliserat första tecken i citatet matchar mot mid-sentence källa", () => {
    const src =
      'kreditupplysningsfunktionen där anbudsgivaren som lägst ska ha klassificeringen "A" på ratingskalan.';
    const { perEvidence } = locateAllSpans(src, [
      'Anbudsgivaren som lägst ska ha klassificeringen "A" på ratingskalan.',
    ]);
    expect(perEvidence).toHaveLength(1);
    expect(src.slice(perEvidence[0].start, perEvidence[0].end)).toContain(
      "anbudsgivaren som lägst",
    );
  });

  it("gap-match: faller tillbaka till längsta halvan vid sidbrytnings-skräp", () => {
    const src =
      "Anbudsgivaren ska vara fri från betydande skulder avseende svenska skatter och sociala avgifter till C 2026-0696 Affärsutveckling Publicerad 2026-05-22 Sida 7/22 vare sig Skatteverket och Kronofogdemyndigheten. Köparen kontrollerar detta.";
    const evidence =
      "Anbudsgivaren ska vara fri från betydande skulder avseende svenska skatter och sociala avgifter till vare sig Skatteverket och Kronofogdemyndigheten.";
    const { perEvidence } = locateAllSpans(src, [evidence]);
    expect(perEvidence).toHaveLength(1);
    // Längsta halvan = prefixet fram till skarven.
    const raw = src.slice(perEvidence[0].start, perEvidence[0].end);
    expect(raw).toContain("Anbudsgivaren ska vara fri");
    expect(raw).not.toContain("Sida 7/22");
  });
});
