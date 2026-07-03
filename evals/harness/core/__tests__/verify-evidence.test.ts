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

  it("matchar riktigt avstavningsbindestreck vid radslut (erfaren-\\nhet → erfarenhet)", () => {
    // PDF:er avstavar med VANLIGT "-" + radbrytning, inte bara soft hyphen.
    const source = "Krav på lång erfaren-\nhet av branschen.";
    const misses = verifyEvidence(FX, source, [req("lång erfarenhet av branschen")]);
    expect(misses).toEqual([]);
  });

  it("MEDVETEN AVVÄGNING: sammansättningsstreck brutet vid radslut ger falsk miss (aldrig falsk träff)", () => {
    // "IT-\nkonsult" (äkta bindestreck som råkar brytas) blir "ITkonsult" av
    // avstavningsregeln — citatet "IT-konsult" missar. Felar åt säkra hållet;
    // klassas som fixturbrus i loopen. Testet låser avvägningen explicit.
    const source = "Vi söker en IT-\nkonsult med bred profil.";
    const misses = verifyEvidence(FX, source, [req("en IT-konsult med")]);
    expect(misses).toHaveLength(1);
    expect(misses[0].reason).toBe("not-found");
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
  it("matchar när citatets FÖRSTA tecken versaliserats (verkligt varv 1-fall, eskilstuna)", () => {
    // Modellen börjar citatet med versal ur mid-sentence-text — presentations-,
    // inte innehållsskillnad. Övriga tecken förblir case-känsliga.
    const source = 'kreditupplysningsfunktionen där anbudsgivaren som lägst ska ha klassificeringen "A" på ratingskalan.';
    const misses = verifyEvidence(FX, source, [
      req('Anbudsgivaren som lägst ska ha klassificeringen "A" på ratingskalan.'),
    ]);
    expect(misses).toEqual([]);
  });

  it("matchar över sidbrytnings-skräp mitt i meningen (verkligt varv 1-fall, chalmers)", () => {
    // PDF:er stoppar in sidhuvud/-fot mitt i meningar; modellen citerar den
    // logiska meningen. Båda halvorna måste finnas ordagrant, i ordning, nära.
    const source =
      "Anbudsgivaren ska vara fri från betydande skulder avseende svenska skatter och sociala avgifter till C 2026-0696 Affärsutveckling Publicerad 2026-05-22 Sida 7/22 vare sig Skatteverket och Kronofogdemyndigheten. Köparen kontrollerar detta.";
    const misses = verifyEvidence(FX, source, [
      req(
        "Anbudsgivaren ska vara fri från betydande skulder avseende svenska skatter och sociala avgifter till vare sig Skatteverket och Kronofogdemyndigheten.",
      ),
    ]);
    expect(misses).toEqual([]);
  });

  it("matchar när källan tappat '- ' i sammansättning (verkligt varv 1-fall, 'kundoch')", () => {
    const source =
      "Erfarenhet och vana av möten med ledningsgrupper och diskussioner med ledningar i kundoch samarbetsorganisationer • God kunskap inom IP";
    const misses = verifyEvidence(FX, source, [
      req(
        "Erfarenhet och vana av möten med ledningsgrupper och diskussioner med ledningar i kund- och samarbetsorganisationer",
      ),
    ]);
    expect(misses).toEqual([]);
  });

  it("matchar när källan har bullet-glyf klistrad mot ordet (verkligt varv 2-fall, chalmers)", () => {
    // PDF-extraktion: "…timmar•genomförts…" — glyfen är list-markup, inte innehåll.
    const source = "Referensuppdraget ska ha omfattat minst 200 timmar•genomförts inom de senaste tre (3) åren räknat från sista anbudsdag.";
    const misses = verifyEvidence(FX, source, [
      req("omfattat minst 200 timmar genomförts inom de senaste tre (3) åren räknat från sista anbudsdag."),
    ]);
    expect(misses).toEqual([]);
  });

  it("matchar flerpunktscitat där modellen utelämnat bullet-markörerna (verkligt varv 2-fall, eskilstuna)", () => {
    const source =
      "Konsulten ska ha: \n• För uppdraget relevant examen eller utbildning (t.ex ekonomi)\n• Dokumenterad erfarenhet att leda workshops\n• Behärska svenska språket flytande i tal och skrift.";
    const misses = verifyEvidence(FX, source, [
      req(
        "Konsulten ska ha: \nFör uppdraget relevant examen eller utbildning (t.ex ekonomi)\nDokumenterad erfarenhet att leda workshops\nBehärska svenska språket flytande i tal och skrift.",
      ),
    ]);
    expect(misses).toEqual([]);
  });

  it("gap-match kan INTE utnyttjas av korta fabricerade citat (halvor < 25 tecken)", () => {
    // Fabrikationsskyddet: båda halvorna måste vara ≥25 tecken äkta text i
    // ordning nära varandra. Ett kort hopklipp av två äkta småfraser missar.
    const source = "Anbudet ska vara skrivet på svenska. Priset anges i SEK exklusive moms.";
    const misses = verifyEvidence(FX, source, [
      req("Anbudet ska vara i SEK"), // två äkta fragment, hopklippta
    ]);
    expect(misses).toHaveLength(1);
    expect(misses[0].reason).toBe("not-found");
  });

  it("gap-match kräver ordning och närhet — omkastade halvor missar", () => {
    const source =
      "Del A: leverantören ska ha dokumenterad erfarenhet av offentlig sektor sedan minst fem år. Del B: uppdraget omfattar utredning och analys av verksamhetens processer i sin helhet.";
    const misses = verifyEvidence(FX, source, [
      // Suffixet ligger FÖRE prefixet i källan → ingen ordnad träff.
      req("uppdraget omfattar utredning och analys av verksamhetens processer leverantören ska ha dokumenterad erfarenhet av offentlig sektor"),
    ]);
    expect(misses).toHaveLength(1);
  });

  it("markerar 'not-found' vid skiftlägesskillnad MITT I citatet (bara första tecknet tolereras)", () => {
    const source = "anbudsgivaren ska ha erfarenhet av offentlig Sektor sedan flera år";
    // "sektor" gemener i citatet, "Sektor" versal i källan — innehållsskillnad
    // bortom sentence-start-versaliseringen → miss.
    const misses = verifyEvidence(FX, source, [
      req("anbudsgivaren ska ha erfarenhet av offentlig sektor sedan flera år"),
    ]);
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
