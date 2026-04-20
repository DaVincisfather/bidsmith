import type { ISlide } from "pptx-automizer/dist/interfaces/islide";
import type { ApplicatorContext } from "../types";
import {
  applyFooter,
  replaceAllTextNodes,
  replaceParagraphTextNodes,
} from "./_footer";

/**
 * Team-pricing applicator (slide 12).
 *
 * Slide 12 has a PPTX table with 5 consultant row slots + 1 summary row.
 * replaceAllTextNodes walks all <a:t> nodes including table cells.
 *
 * Number formatting: sv-SE locale for totals (space as thousand separator).
 * E.g. 444000 → "444 000" (via toLocaleString("sv-SE")).
 *
 * Replacement-order: per-row, insert LONGER keys first.
 * "{Konsult N — namn}" is longer than any per-slot short key, so it goes first.
 *
 * Slot cap: 5. Fewer members → unused row placeholders replaced with "".
 */
export function teamPricingApplicator(ctx: ApplicatorContext) {
  const footer = applyFooter(ctx);

  return (slide: ISlide) => {
    const map = buildTeamPricingMap(ctx);
    slide.modify((doc: XMLDocument) => {
      // Paragraph-level first — catches any split-run placeholders
      replaceParagraphTextNodes(map)(doc);
      // Node-level for all remaining single-run placeholders (incl. table cells)
      replaceAllTextNodes(map)(doc);
      // Footer last
      footer(doc);
    });
  };
}

/**
 * Format a number using Swedish locale (space as thousand separator, integer).
 * E.g. 444000 → "444 000", 1197600 → "1 197 600". Null → "" (company fills
 * in timpris/total post-generation; renderer leaves those cells empty).
 *
 * toLocaleString("sv-SE") may produce non-breaking space (U+00A0) on some
 * runtimes. We normalise to a regular space for consistent XML output.
 */
function formatSvSE(n: number | null): string {
  if (n === null) return "";
  return n.toLocaleString("sv-SE").replace(/\u00a0/g, " ");
}

function buildTeamPricingMap(ctx: ApplicatorContext): Record<string, string> {
  const sec = ctx.sections.find((s) => s.content.format === "team-pricing");
  if (!sec || sec.content.format !== "team-pricing") {
    return {};
  }
  const c = sec.content;
  const members = c.members;

  // Compute summary from members (or use override if provided). If ANY member
  // total is null, computedPris is null too — company must fill in timpris
  // before a total can be shown.
  const computedTimmar = members.reduce((sum, m) => sum + m.timmar, 0);
  const computedPris = members.some((m) => m.total === null)
    ? null
    : members.reduce((sum, m) => sum + (m.total ?? 0), 0);
  const totalTimmar = c.summary?.totalTimmar ?? computedTimmar;
  const totalPris = c.summary?.totalPris ?? computedPris;

  const map: Record<string, string> = {};

  // Per-row slots 1–5 (N = 1..5)
  // Insert LONGEST placeholder keys first within each slot to prevent substring
  // corruption. "{Konsult N — namn}" is longer than any other per-slot key.
  for (let i = 1; i <= 5; i++) {
    const member = members[i - 1]; // undefined if fewer members

    if (member) {
      // "{Konsult N — namn}" is the longest key for this slot; insert first to
      // prevent substring corruption if a shorter key shares a prefix.
      map[`{Konsult ${i} \u2014 namn}`] = member.name;
      map[`{Roll ${i}}`] = member.role;
      map[`{Omfattning ${i} %}`] = `${member.omfattningPct}%`;
      map[`{Timpris ${i}}`] = member.timpris === null ? "" : String(member.timpris);
      map[`{Timmar ${i}}`] = String(member.timmar);
      map[`{Total ${i}}`] = formatSvSE(member.total);
    } else {
      // Unused slot — replace all placeholders with empty string
      map[`{Konsult ${i} \u2014 namn}`] = "";
      map[`{Roll ${i}}`] = "";
      map[`{Omfattning ${i} %}`] = "";
      map[`{Timpris ${i}}`] = "";
      map[`{Timmar ${i}}`] = "";
      map[`{Total ${i}}`] = "";
    }
  }

  // Summary row
  map["{Summa timmar}"] = String(totalTimmar);
  map["{Anbudspris totalt}"] = formatSvSE(totalPris);

  return map;
}
