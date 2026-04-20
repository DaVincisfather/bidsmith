import type { ISlide } from "pptx-automizer/dist/interfaces/islide";
import type { ApplicatorContext } from "../types";
import { applyFooter, replaceAllTextNodes } from "./_footer";

/**
 * Prose applicator — handles slides 3, 4, 5.
 *
 * Dispatches on ctx.sourceSlide to pick the right placeholder map.
 * If the corresponding BidSection is missing from ctx.sections, placeholders
 * are left unreplaced (visible in output as a data-missing signal).
 *
 * Unused slot-cap items (smärtpunkter, utmaningar, värden) are replaced with
 * empty string "". TODO: full shape removal if empty frames look visually bad.
 */
export function proseApplicator(ctx: ApplicatorContext) {
  const footer = applyFooter(ctx);

  return (slide: ISlide) => {
    const map = buildProseMap(ctx);
    slide.modify((doc: XMLDocument) => {
      replaceAllTextNodes(map)(doc);
      footer(doc);
    });
  };
}

function buildProseMap(ctx: ApplicatorContext): Record<string, string> {
  switch (ctx.sourceSlide) {
    case 3:
      return buildSlide3Map(ctx);
    case 4:
      return buildSlide4Map(ctx);
    case 5:
      return buildSlide5Map(ctx);
    default:
      return {};
  }
}

// ---------------------------------------------------------------------------
// Slide 3 — Kunden idag
// Sections: A (organisation/system/processer) + B (smärtpunkter, cap 4)
// ---------------------------------------------------------------------------

function buildSlide3Map(ctx: ApplicatorContext): Record<string, string> {
  const sec = ctx.sections.find(
    (s) => s.content.format === "understanding-current",
  );
  if (!sec || sec.content.format !== "understanding-current") {
    // Missing section — leave placeholders unreplaced so gap is visible
    return {};
  }
  const c = sec.content;
  const sp = c.smärtpunkter;

  return {
    // Section A
    "{Kundens nuläge — organisation: förvaltningar, antal anställda, geografi}":
      c.organisation,
    "{Kundens nuläge — system: nuvarande verksamhetssystem, integrationer, leverantörer}":
      c.system,
    "{Kundens nuläge — processer: arbetssätt, styrning, beslutsvägar}":
      c.processer,
    // Section B — slot cap 4; fill what we have, empty the rest
    "{Smärtpunkt 1 — vad som inte fungerar idag och hur det påverkar verksamheten}":
      sp[0] ?? "",
    "{Smärtpunkt 2}": sp[1] ?? "",
    "{Smärtpunkt 3}": sp[2] ?? "",
    "{Smärtpunkt 4}": sp[3] ?? "",
  };
}

// ---------------------------------------------------------------------------
// Slide 4 — Uppdragsbeskrivning
// 3 fixed paragraph placeholders (long descriptive text as key)
// ---------------------------------------------------------------------------

function buildSlide4Map(ctx: ApplicatorContext): Record<string, string> {
  const sec = ctx.sections.find(
    (s) => s.content.format === "understanding-assignment",
  );
  if (!sec || sec.content.format !== "understanding-assignment") {
    return {};
  }
  const stycken = sec.content.stycken;

  return {
    // Exact placeholder text as written in the template (including trailing period)
    ["{Uppdraget parafraserat med våra ord — stycke 1. Visa att vi har läst kravspecifikationen noggrant genom att beskriva syftet, målet och huvudsakliga leveranser med egna ord.}"]:
      stycken[0] ?? "",
    ["{Uppdraget parafraserat med våra ord — stycke 2. Beskriv omfattning, avgränsningar och förväntat utfall så att upphandlaren ser att vi har förstått uppdraget korrekt.}"]:
      stycken[1] ?? "",
    ["{Uppdraget parafraserat med våra ord — stycke 3. Tydliggör vilka intressenter som berörs och hur uppdraget knyter an till kundens övergripande mål.}"]:
      stycken[2] ?? "",
  };
}

// ---------------------------------------------------------------------------
// Slide 5 — Utmaningar och värde
// Section A: utmaningar (cap 4), Section B: värden (cap 4)
// ---------------------------------------------------------------------------

function buildSlide5Map(ctx: ApplicatorContext): Record<string, string> {
  const sec = ctx.sections.find(
    (s) => s.content.format === "understanding-vision",
  );
  if (!sec || sec.content.format !== "understanding-vision") {
    return {};
  }
  const utm = sec.content.utmaningar;
  const val = sec.content.värden;

  return {
    // Utmaningar — cap 4
    "{Utmaning 1 — en konkret utmaning vi ser i uppdraget och varför den är viktig att hantera}":
      utm[0] ?? "",
    "{Utmaning 2}": utm[1] ?? "",
    "{Utmaning 3}": utm[2] ?? "",
    "{Utmaning 4}": utm[3] ?? "",
    // Värden — cap 4
    "{Värde 1 — mervärde vi kan synliggöra som går utöver ska-kraven, konkret och mätbart}":
      val[0] ?? "",
    "{Värde 2}": val[1] ?? "",
    "{Värde 3}": val[2] ?? "",
    "{Värde 4}": val[3] ?? "",
  };
}
