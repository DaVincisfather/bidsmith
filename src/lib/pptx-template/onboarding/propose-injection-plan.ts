import { readPptxSlides, type SlideShapes } from "../introspect/read-pptx";
import { classifyForeignSlot } from "../introspect/classify-slot";
import {
  parseTemplateProfile,
  type CapabilityId,
  type TemplateProfile,
} from "../template-profile";

/**
 * Förslags-lagret för token-injektion (template-upload, design-doc TILLÄGG
 * 2026-07-03). Kedjar ihop introspektion → auto-klassificering → utkast-profil
 * till ett UTKAST som onboarding-UI:t visar en människa för bekräftelse. Inga
 * anropsställen än — isolerad modul.
 *
 * Kedjan: readPptxSlides → candidateSlots → classifyForeignSlot (per kandidat)
 * → ProposedSlot[] med unika tokens → utkast-TemplateProfile. Adressering
 * (source + shapeIndex) speglar readPptxSlides/instrumentTemplate exakt så en
 * ProposedSlot kan mata injektionsmotorn direkt.
 */

export interface CandidateSlot {
  source: number; // 1-based, same as readPptxSlides/TokenInjection
  shapeIndex: number; // 0-based among the slide's txBody shapes — same as TokenInjection
  shapeText: string; // paragraphs joined with "\n"
}

/** Pure + exported for unit tests. GENEROUS by design: every token-less shape
 *  that has text or geometry is a candidate — the LLM classification + human
 *  interview do the filtering; missing a fillable box is costlier than an extra
 *  candidate. Skips shapes that already carry tokens, and noise shapes with
 *  neither text nor geometry (unaddressable). */
export function candidateSlots(slides: SlideShapes[]): CandidateSlot[] {
  const out: CandidateSlot[] = [];
  for (const slide of slides) {
    // readPptxSlides rapporterar redan enbart txBody-shapes i dokumentordning, så
    // arrayindex === shapeIndex som instrumentTemplate adresserar. Vi filtrerar
    // därför INTE bort någon shape ur indexeringen — bara ur kandidatlistan.
    slide.shapes.forEach((shape, shapeIndex) => {
      if (shape.tokens.length > 0) return; // redan instrumenterad — hoppa
      const hasText = shape.paragraphs.some((p) => p.trim().length > 0);
      const hasGeometry = shape.geometry !== null;
      if (!hasText && !hasGeometry) return; // brus utan adress — går ej att fylla
      out.push({
        source: slide.source,
        shapeIndex,
        shapeText: shape.paragraphs.join("\n"),
      });
    });
  }
  return out;
}

export interface ProposedSlot extends CandidateSlot {
  token: string; // "{Namn}" — unique across the plan
  capability: CapabilityId; // classifier's pick — recorded for the interview UI
  intent: string;
  confidence: "high" | "low";
}

export interface InjectionPlanProposal {
  slots: ProposedSlot[];
  /** Draft profile for the confirm-as-is path. V1 DELIBERATELY maps EVERY slot
   *  to generic-prose fill (slide capability "generic-prose", slot capability
   *  "generic-prose", status "generic", intent from classification) even when
   *  the classifier picked a specialised capability — specialised applicators
   *  expect OUR canonical token sets and would break on foreign slides. The
   *  classified capability lives in `slots` for the interview; specialised
   *  mapping is a later slice. This also sidesteps the known renderer
   *  limitation that dispatch is slide-level (see ROADMAP backlog). */
  profile: TemplateProfile;
}

/**
 * Bygger ett injektionsplan-utkast ur en pptx-buffer.
 *
 * Kastar (fail loud) när mallen saknar kandidat-shapes — se steg 5 nedan.
 */
export async function proposeInjectionPlan(
  buffer: Buffer,
  opts: { templateId: string; name: string; version?: number; userId?: string | null },
): Promise<InjectionPlanProposal> {
  const slides = await readPptxSlides(buffer);
  const candidates = candidateSlots(slides);

  // Noll kandidater → ärlig throw. TemplateProfileSchema.slides har .min(1), så
  // en tom plan KAN inte bära en giltig profil. Att fabricera en tom/ogiltig
  // profil hade antingen kraschat parseTemplateProfile eller ljugit för anroparen
  // — bättre att säga rakt ut att det inte finns något att onboarda.
  if (candidates.length === 0) {
    throw new Error("template has no candidate slots — nothing to onboard");
  }

  const bySource = new Map<number, SlideShapes>();
  for (const slide of slides) bySource.set(slide.source, slide);

  // Klassificeringarna är oberoende per kandidat och callClaude sköter retries,
  // så vi kör dem parallellt med Promise.all (snabbare onboarding; ingen delad
  // state mellan anropen). Ett fel bubblar upp och fäller hela förslaget — vi vill
  // inte visa en halv plan.
  const classifications = await Promise.all(
    candidates.map((candidate) => {
      const slide = bySource.get(candidate.source);
      // slide finns alltid: candidate.source kommer från slides ovan.
      const slideText = (slide?.shapes ?? [])
        .filter((_, i) => i !== candidate.shapeIndex) // exkludera kandidatens egen text
        .flatMap((shape) => shape.paragraphs)
        .filter((p) => p.trim().length > 0)
        .join("\n");
      return classifyForeignSlot(
        { shapeText: candidate.shapeText, slideText: slideText || undefined },
        { userId: opts.userId ?? null },
      );
    }),
  );

  // Plan-vid unika tokens: vid namnkollision hängs " 2", " 3", … på FÖRE
  // klammer-omslutningen (t.ex. "{Namn 2}"). Schemat garanterar redan att namnet
  // saknar { }, så det omslutna tokenet uppfyller instrumentTemplates TOKEN_RE.
  // Seedas med tokens som REDAN finns i mallen (delvis instrumenterad /
  // re-onboarding): ett genererat token som krockar med ett befintligt skulle få
  // renderaren att fylla två shapes med samma innehåll — tyst och svårfelsökt.
  const usedTokens = new Set<string>(slides.flatMap((s) => s.tokens));
  const slots: ProposedSlot[] = candidates.map((candidate, i) => {
    const cls = classifications[i];
    return {
      ...candidate,
      token: uniqueToken(cls.name, usedTokens),
      capability: cls.capability,
      intent: cls.intent,
      confidence: cls.confidence,
    };
  });

  // En SlideProfile per slide med ≥1 föreslagen slot (slides utan förslag utelämnas
  // ur utkastet — intervjun kan bara lägga TILL). V1 mappar allt till generic-prose;
  // budgetChars lämnas OSATT (geometri→budget-koppling för främmande slots är egen
  // backlog-post).
  const slideProfiles = slides
    .map((slide) => {
      const slideSlots = slots
        .filter((s) => s.source === slide.source)
        .map((s) => ({
          placeholder: s.token,
          capability: "generic-prose" as const,
          // generic-prose renderas som fri prosa (jfr CAPABILITY_DEFAULT_FORMAT).
          format: "prose" as const,
          intent: s.intent,
          status: "generic" as const,
        }));
      if (slideSlots.length === 0) return null;
      return {
        source: slide.source,
        capability: "generic-prose" as const,
        slots: slideSlots,
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  // Validera vår EGEN hopsättning — en bugg här ska falla högt, inte tyst spara en
  // trasig profil.
  const profile = parseTemplateProfile({
    profileVersion: 1,
    templateId: opts.templateId,
    name: opts.name,
    version: opts.version ?? 1,
    slides: slideProfiles,
  });

  return { slots, profile };
}

/** Gör namnet unikt över planen och sluter det i klammer: "Namn" → "{Namn}",
 *  vid kollision "{Namn 2}", "{Namn 3}", … Registrerar resultatet i `used`. */
function uniqueToken(name: string, used: Set<string>): string {
  let candidate = name;
  let n = 2;
  while (used.has(`{${candidate}}`)) {
    candidate = `${name} ${n}`;
    n += 1;
  }
  const token = `{${candidate}}`;
  used.add(token);
  return token;
}
