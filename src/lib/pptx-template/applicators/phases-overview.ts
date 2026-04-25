import type { ISlide } from "pptx-automizer/dist/interfaces/islide";
import type { ApplicatorContext } from "../types";
import type { ExecutionPhase } from "../../types";
import {
  applyFooter,
  replaceAllTextNodes,
  replaceParagraphTextNodes,
} from "./_footer";

/**
 * Phases-overview applicator (slide 6 — single instance, no cloning).
 *
 * Slide 6 has 4 fixed slots for Fas 1–4: phase cards + Gantt rows.
 * Up to 4 phases are filled from data; extra phases are silently truncated
 * with a console.warn (v1 hard cap).
 *
 * Replacement-order trap:
 *   "{Fas N — namn}" is a superstring of "{Fas N}".
 *   Building the replacement map with LONGEST keys first ensures that when
 *   replaceAllTextNodes iterates in insertion order, the long-form placeholders
 *   are consumed before the short "{Fas N}" pattern can corrupt them.
 *
 * Map order (per phase, longest → shortest):
 *   1. {Fas N — kort beskrivning. Detaljer på nästa slide.}  (Fas 1 card only)
 *   2. {Fas N — beskrivning}                                  (Fas 2-4 cards)
 *   3. {Fas N — namn}                                         (card + Gantt)
 *   4. {MN–NM}                                                (Gantt span)
 *   5. {Fas N}                                                (Gantt label)
 */
export function phasesOverviewApplicator(ctx: ApplicatorContext) {
  const footer = applyFooter(ctx);

  const sec = ctx.sections.find((s) => s.content?.format === "phases");
  if (!sec || sec.content?.format !== "phases") {
    return (slide: ISlide) => {
      slide.modify(footer);
    };
  }

  const allPhases = sec.content.phases;

  if (allPhases.length > 4) {
    console.warn(
      `phases-overview: data has ${allPhases.length} phases; only the first 4 will be rendered (v1 hard cap).`,
    );
  }

  // Use at most 4 phases
  const phases = allPhases.slice(0, 4);

  const map = buildReplacementMap(phases);

  return (slide: ISlide) => {
    slide.modify((doc: XMLDocument) => {
      // Paragraph-level first — catches split-run placeholders
      replaceParagraphTextNodes(map)(doc);
      // Node-level for remaining single-run placeholders
      replaceAllTextNodes(map)(doc);
      // Footer last
      footer(doc);
    });
  };
}

/**
 * Build the full replacement map for slide 6.
 *
 * Keys are ordered LONGEST first within each phase block so that when
 * replaceAllTextNodes iterates in insertion order, "{Fas N — namn}" is
 * replaced before "{Fas N}" could corrupt it.
 *
 * Gantt span literals use en dash U+2013 (–) as in the template.
 * Placeholder keys use em dash U+2014 (—) for the " — " separator.
 */
function buildReplacementMap(phases: ExecutionPhase[]): Record<string, string> {
  // Gantt span placeholders as they appear in the template (en dash U+2013)
  const ganttSpans = [
    "{M1\u2013M2}",   // phases[0]
    "{M2\u2013M5}",   // phases[1]
    "{M5\u2013M9}",   // phases[2]
    "{M9\u2013M12}",  // phases[3]
  ];

  const map: Record<string, string> = {};

  // Phase-slot definitions: 4 fixed slots
  const slots = [
    {
      // Fas 1 uses the long description placeholder
      descKey: "{Fas 1 \u2014 kort beskrivning. Detaljer p\u00e5 n\u00e4sta slide.}",
      nameKey: "{Fas 1 \u2014 namn}",
      ganttSpanKey: ganttSpans[0],
      ganttLabelKey: "{Fas 1}",
    },
    {
      descKey: "{Fas 2 \u2014 beskrivning}",
      nameKey: "{Fas 2 \u2014 namn}",
      ganttSpanKey: ganttSpans[1],
      ganttLabelKey: "{Fas 2}",
    },
    {
      descKey: "{Fas 3 \u2014 beskrivning}",
      nameKey: "{Fas 3 \u2014 namn}",
      ganttSpanKey: ganttSpans[2],
      ganttLabelKey: "{Fas 3}",
    },
    {
      descKey: "{Fas 4 \u2014 beskrivning}",
      nameKey: "{Fas 4 \u2014 namn}",
      ganttSpanKey: ganttSpans[3],
      ganttLabelKey: "{Fas 4}",
    },
  ] as const;

  for (let i = 0; i < 4; i++) {
    const slot = slots[i];
    const phase = phases[i]; // undefined if fewer than 4 phases

    if (phase) {
      // Card title + row label both use the full name. Names must be short
      // enough to fit 1 line in the card title box (~15-20 chars max).
      // Row label box can fit 2 lines but PowerPoint's wrap-duplication bug
      // would corrupt it — keep names single-line by convention.
      const nameValue = phase.name;
      const descValue = phase.shortDescription ?? phase.objective;
      const spanValue = phase.period ?? phase.duration;
      // Gantt bar label: short "Fas N" (slot index) — full name doesn't fit
      // inside the bar and triggers wrap-duplication.
      const labelValue = `Fas ${i + 1}`;

      // Insert LONGEST keys first to guard against substring replacement corruption.
      // For slot 0 (Fas 1): descKey is the longest by character count.
      // For slots 1-3: descKey and nameKey are similar length; descKey comes first.
      map[slot.descKey] = descValue;
      map[slot.nameKey] = nameValue;
      map[slot.ganttSpanKey] = spanValue;
      map[slot.ganttLabelKey] = labelValue;
    } else {
      // Fewer than 4 phases: replace unused slots with empty string
      map[slot.descKey] = "";
      map[slot.nameKey] = "";
      map[slot.ganttSpanKey] = "";
      map[slot.ganttLabelKey] = "";
    }
  }

  return map;
}
