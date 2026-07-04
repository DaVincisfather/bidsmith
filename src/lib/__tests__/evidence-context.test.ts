import { describe, it, expect } from "vitest";
import {
  locateEvidenceContext,
  normalizeWithMap,
} from "../evidence-context";
import { normalizeForEvidence } from "../verify-evidence";

describe("normalizeWithMap — normaliserad output identisk med verifieraren", () => {
  // Self-consistency-grinden: kontext-lokaliseraren MÅSTE normalisera exakt som
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

describe("locateEvidenceContext — hittar citatet och ger sammanhang", () => {
  it("returnerar dämpat före/efter runt det markerade citatet", () => {
    const source =
      "Anbudsgivaren ska ha minst tre års erfarenhet av liknande uppdrag i offentlig sektor.";
    const ctx = locateEvidenceContext(source, "minst tre års erfarenhet");
    expect(ctx).not.toBeNull();
    expect(ctx!.before).toBe("Anbudsgivaren ska ha");
    expect(ctx!.quote).toBe("minst tre års erfarenhet");
    expect(ctx!.after).toBe("av liknande uppdrag i offentlig sektor.");
  });

  it("matchar över radbrytning och kollapsar den i det visade citatet", () => {
    const source = "Anbudsgivaren ska ha minst\ntre års erfarenhet av uppdrag.";
    const ctx = locateEvidenceContext(source, "minst tre års erfarenhet");
    expect(ctx!.quote).toBe("minst tre års erfarenhet");
    expect(ctx!.after).toBe("av uppdrag.");
  });

  it("snäpper fönstret till ordgränser — partiellt ord droppas i before", () => {
    const source = "aaaa bbbb minst tre års text";
    const ctx = locateEvidenceContext(source, "minst tre", 7);
    // Fönstret (7 tecken) skär mitt i "aaaa"; partialen droppas, "bbbb" behålls helt.
    expect(ctx!.before).toBe("bbbb");
    expect(ctx!.before).not.toContain("aaaa");
  });

  it("snäpper fönstret till ordgränser — partiellt ord droppas i after", () => {
    const source = "start minst tre superlångtord efter";
    const ctx = locateEvidenceContext(source, "minst tre", 8);
    // 8 tecken efter citatet skär mitt i "superlångtord" → droppas helt.
    expect(ctx!.after).not.toContain("superl");
  });

  it("tomt before/after vid dokumentets kanter", () => {
    const source = "minst tre års erfarenhet";
    const ctx = locateEvidenceContext(source, "minst tre års erfarenhet");
    expect(ctx!.before).toBe("");
    expect(ctx!.after).toBe("");
  });

  it("mjukt bindestreck i källan tas bort i det visade citatet", () => {
    const source = "Krav på erfaren­het av branschen och vidare text.";
    const ctx = locateEvidenceContext(source, "erfarenhet av branschen");
    expect(ctx!.quote).toBe("erfarenhet av branschen");
    expect(ctx!.before).toBe("Krav på");
  });

  it("typografiska citattecken lokaliseras (visar källans glyfer)", () => {
    const source = "Uppdraget kallas ”Ramavtal” i underlaget som beskrivs här.";
    const ctx = locateEvidenceContext(source, 'kallas "Ramavtal" i');
    expect(ctx).not.toBeNull();
    expect(ctx!.quote).toContain("Ramavtal");
    expect(ctx!.before).toBe("Uppdraget");
  });

  it("versaliserat första tecken i citatet matchar mot mid-sentence källa", () => {
    const source =
      'kreditupplysningsfunktionen där anbudsgivaren som lägst ska ha klassificeringen "A" på ratingskalan.';
    const ctx = locateEvidenceContext(
      source,
      'Anbudsgivaren som lägst ska ha klassificeringen "A" på ratingskalan.',
    );
    expect(ctx).not.toBeNull();
    expect(ctx!.quote).toContain("anbudsgivaren som lägst");
  });

  it("gap-match: faller tillbaka till längsta halvan vid sidbrytnings-skräp", () => {
    const source =
      "Anbudsgivaren ska vara fri från betydande skulder avseende svenska skatter och sociala avgifter till C 2026-0696 Affärsutveckling Publicerad 2026-05-22 Sida 7/22 vare sig Skatteverket och Kronofogdemyndigheten. Köparen kontrollerar detta.";
    const evidence =
      "Anbudsgivaren ska vara fri från betydande skulder avseende svenska skatter och sociala avgifter till vare sig Skatteverket och Kronofogdemyndigheten.";
    const ctx = locateEvidenceContext(source, evidence);
    expect(ctx).not.toBeNull();
    // Längsta halvan = prefixet fram till skarven.
    expect(ctx!.quote).toContain("Anbudsgivaren ska vara fri");
    expect(ctx!.quote).not.toContain("Sida 7/22");
  });

  it("returnerar null när citatet inte finns i källan", () => {
    const source = "Helt annan text utan någon som helst relation.";
    expect(
      locateEvidenceContext(source, "detta citat finns inte alls i källan här"),
    ).toBeNull();
  });

  it("returnerar null för tom källa eller tomt citat", () => {
    expect(locateEvidenceContext("", "något")).toBeNull();
    expect(locateEvidenceContext("något", "")).toBeNull();
    expect(locateEvidenceContext("något", "   ")).toBeNull();
  });

  it("respekterar windowChars — before/after begränsas", () => {
    const long = "x ".repeat(300); // 600 tecken
    const source = `${long}minst tre års erfarenhet ${long}`;
    const ctx = locateEvidenceContext(source, "minst tre års erfarenhet", 50);
    expect(ctx!.before.length).toBeLessThanOrEqual(50);
    expect(ctx!.after.length).toBeLessThanOrEqual(50);
  });
});
