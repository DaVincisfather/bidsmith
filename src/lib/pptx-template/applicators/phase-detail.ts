import type { ISlide } from "pptx-automizer/dist/interfaces/islide";
import type { ApplicatorContext } from "../types";
import type { ExecutionPhase } from "../../types";
import {
  applyFooter,
  replaceAllTextNodes,
  replaceParagraphTextNodes,
} from "./_footer";

/**
 * Phase-detail applicator (slide 7 — cloned per phase).
 *
 * For cloneIndex N the loader already placed the correct source slide XML into
 * the output; this applicator fills all per-phase placeholders and updates the
 * literal non-placeholder text that pptx-automizer copies verbatim from the
 * source.
 *
 * Slot caps: activities 4, deliverables 3, decisions 3.
 * Unused slots are replaced with "" (consistent with Tasks 5–6 decision).
 * TODO: full shape removal for unused slots — see _footer.ts placeholder doc.
 *
 * Replacement-order trap for literal text:
 *   "FAS 1 AV 4" is a superstring of "FAS 1" and "TIDSLINJE · FAS 1".
 *   We must replace longest patterns first to avoid substring corruption.
 *   Order: tab label → TIDSLINJE label → naked FAS N → badge.
 */
export function phaseDetailApplicator(ctx: ApplicatorContext) {
  const footer = applyFooter(ctx);
  const cloneIndex = ctx.cloneIndex ?? 0;

  // Find the phases section
  const sec = ctx.sections.find((s) => s.content?.format === "phases");
  if (!sec || sec.content?.format !== "phases") {
    // Missing section — return callback that at least applies footer
    return (slide: ISlide) => {
      slide.modify(footer);
    };
  }

  const phases = sec.content.phases;
  const totalPhases = phases.length;
  const phase = phases[cloneIndex];

  if (!phase) {
    return (slide: ISlide) => {
      slide.modify(footer);
    };
  }

  const placeholderMap = buildPlaceholderMap(phase);
  const literalMap = buildLiteralMap(cloneIndex, totalPhases, ctx.slideNum);

  return (slide: ISlide) => {
    slide.modify((doc: XMLDocument) => {
      // Paragraph-level first — catches any split-run placeholders
      replaceParagraphTextNodes(placeholderMap)(doc);
      // Node-level for remaining single-run placeholders
      replaceAllTextNodes(placeholderMap)(doc);

      // Literal text replacements (longest-first to avoid substring corruption)
      applyLiteralReplacements(literalMap, doc);

      // Color the leading "⚠ " on each risk row red to mirror the bid-editor
      // RisksRenderer styling. Bid editor uses red-400 (F87171); PPTX uses
      // red-600 (DC2626) for better contrast on white print backgrounds.
      colorRiskIcons(doc);

      // Move the bottom-of-slide TIDSLINJE highlight bar to match this phase's
      // slot. The template ships with the highlight at M1-M3 (Fas 1 position);
      // for clones 1-3 we relocate it to mirror the slide-6 Gantt bar slot.
      moveTimelineHighlight(doc, cloneIndex);

      // Footer last
      footer(doc);
    });
  };
}

const RISK_ICON = "\u26A0\uFE0E"; // U+26A0 warning sign + U+FE0E text-presentation selector
const RISK_ICON_COLOR = "DC2626"; // Tailwind red-600 — visible on white, matches bid editor red accent
const A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";

/**
 * Splits every <a:r> whose <a:t> starts with the risk-icon prefix into two
 * runs: a red-coloured run holding "⚠ " and the original run holding the
 * remaining risk text. Mirrors the bid-editor RisksRenderer where each risk
 * is prefixed with a red warning icon.
 *
 * Idempotent: skips runs that have already been split (no leading icon left).
 */
function colorRiskIcons(doc: XMLDocument): void {
  const prefix = `${RISK_ICON} `;
  const tNodes = Array.from(doc.getElementsByTagNameNS(A_NS, "t"));
  for (const tNode of tNodes) {
    const text = tNode.textContent ?? "";
    if (!text.startsWith(prefix)) continue;

    const run = tNode.parentNode as Element | null;
    if (!run || run.localName !== "r") continue;
    const runParent = run.parentNode;
    if (!runParent) continue;

    // Strip the prefix from the original run.
    tNode.textContent = text.slice(prefix.length);

    // Build the red icon run from a clone of the original rPr (preserves font,
    // size, language) but with the solidFill replaced by red.
    const iconRun = doc.createElementNS(A_NS, "a:r");
    const origRPr = run.getElementsByTagNameNS(A_NS, "rPr")[0];
    const iconRPr = origRPr
      ? (origRPr.cloneNode(true) as Element)
      : doc.createElementNS(A_NS, "a:rPr");

    // Remove any existing solidFill from the cloned rPr.
    const fills = Array.from(iconRPr.getElementsByTagNameNS(A_NS, "solidFill"));
    for (const fill of fills) {
      iconRPr.removeChild(fill);
    }

    const solidFill = doc.createElementNS(A_NS, "a:solidFill");
    const srgb = doc.createElementNS(A_NS, "a:srgbClr");
    srgb.setAttribute("val", RISK_ICON_COLOR);
    solidFill.appendChild(srgb);
    // a:rPr children must come before any text — solidFill is a direct child
    // and ordering inside rPr is flexible for fills, so prepend.
    iconRPr.insertBefore(solidFill, iconRPr.firstChild);

    const iconT = doc.createElementNS(A_NS, "a:t");
    iconT.textContent = prefix;

    iconRun.appendChild(iconRPr);
    iconRun.appendChild(iconT);

    runParent.insertBefore(iconRun, run);
  }
}

/**
 * Slot positions for the bottom TIDSLINJE highlight bar, indexed by cloneIndex
 * (0 = Fas 1 ... 3 = Fas 4). x/cx are in EMU. Slots are positioned relative to
 * the bottom timeline strip itself (y=9201150, cx=13677900 background) — NOT
 * derived from the slide-6 Gantt bars, which sit at a different y-coordinate.
 * The four cx values (1139726, 3419475, 4559349, 3419475) span M1-M2 through
 * M9-M12; the ~1.1M EMU shortfall vs. the background width is intentional
 * left/right padding (verified visually on slides 7-10).
 */
const HIGHLIGHT_SLOTS: ReadonlyArray<{ x: string; cx: string }> = [
  { x: "3467100", cx: "1139726" },   // Fas 1: M1-M2
  { x: "4606826", cx: "3419475" },   // Fas 2: M2-M5
  { x: "8026301", cx: "4559349" },   // Fas 3: M5-M9
  { x: "12585650", cx: "3419475" },  // Fas 4: M9-M12
];

function moveTimelineHighlight(doc: XMLDocument, cloneIndex: number): void {
  const slot = HIGHLIGHT_SLOTS[cloneIndex];
  if (!slot) return;

  const aNs = "http://schemas.openxmlformats.org/drawingml/2006/main";
  const offs = doc.getElementsByTagNameNS(aNs, "off");
  for (let i = 0; i < offs.length; i++) {
    const off = offs[i];
    if (
      off.getAttribute("x") !== "3467100" ||
      off.getAttribute("y") !== "9201150"
    ) {
      continue;
    }
    // Same parent <a:xfrm> contains the matching <a:ext>. Use the next sibling
    // ext that is the highlight (cx smaller than the full timeline width).
    const parent = off.parentNode;
    if (!parent) continue;
    const exts = (parent as Element).getElementsByTagNameNS(aNs, "ext");
    if (exts.length === 0) continue;
    const ext = exts[0];
    const cx = ext.getAttribute("cx");
    // Skip the background bar (full M1-M12 width); only patch the highlight.
    if (cx === "13677900") continue;
    off.setAttribute("x", slot.x);
    ext.setAttribute("cx", slot.cx);
  }
}

/**
 * Build the {placeholder} → value map for a single phase.
 *
 * NOTE: Even on clones for fas 2/3/4, the placeholder TEXT in the XML is still
 * "Fas 1 — namn" (verbatim from the source slide 7). The applicator always
 * searches for the "Fas 1" variant of each placeholder.
 */
function buildPlaceholderMap(phase: ExecutionPhase): Record<string, string> {
  // Period takes precedence; fall back to duration for the {M1–M2} slot.
  // U+2013 en dash (–) is the separator in the placeholder "{M1–M2}".
  const periodValue = phase.period ?? phase.duration;

  // {Antal veckor}: use duration as-is (e.g. "4 v", "6 v"). If it already
  // contains "v" it reads naturally. If period is set, duration is still the
  // weeks string since period carries month range.
  const durationValue = phase.duration;

  const acts = phase.activities.filter((s) => s && s.trim().length > 0);
  const dels = phase.deliverables.filter((s) => s && s.trim().length > 0);
  const decs = (phase.decisions ?? []).filter(
    (s) => s && s.trim().length > 0,
  );
  const risks = (phase.risks ?? [])
    .filter((s) => s && s.trim().length > 0)
    .map((r) => `${RISK_ICON} ${r}`);
  // Only append the standing Go/no-go line if AI didn't already produce
  // a go/no-go-formulation — otherwise the column shows a duplicate.
  const hasGoNoGo = decs.some((d) => /go.?no.?go/i.test(d));
  const allDecs = hasGoNoGo
    ? decs
    : [...decs, "Go/no-go till n\u00e4sta fas"];

  // One-box pattern (parallel to slide 3/4/5): each column is a single
  // textbox with bullets joined by "\n". expandMultiline() in _footer.ts
  // clones the host paragraph per \n so each bullet becomes its own
  // paragraph, inheriting pPr/rPr (incl. lnSpc 140%) from the template.
  return {
    // Phase name
    "{Fas 1 \u2014 namn}": phase.name, // em dash U+2014

    // Period and duration
    "{M1\u2013M2}": periodValue,        // en dash U+2013
    "{Antal veckor}": durationValue,

    // Column A — all activities in one box
    "{Aktiviteter}": acts.join("\n"),

    // Column B — all deliverables in one box
    "{Leveranser}": dels.join("\n"),

    // Column C — all decisions in one box.
    "{Beslut}": allDecs.join("\n"),

    // Goal box (upper-right) — single sentence describing the phase objective.
    "{M\u00e5l}": phase.objective,

    // Risks box — bullet list with red ⚠ prefix per row (colored in
    // colorRiskIcons post-processor). Empty string when phase has no risks.
    "{Risker}": risks.join("\n"),
  };
}

/** Per-clone literal replacements ordered longest-first to avoid substring corruption. */
interface LiteralReplacement {
  from: string;
  to: string;
  /**
   * When true, only replace text nodes whose entire content equals `from`.
   * Use for short tokens (e.g. the two-digit badge "01") that would otherwise
   * match substrings inside placeholder-filled text like "ISO 27001".
   */
  exactMatch?: boolean;
}

function buildLiteralMap(
  cloneIndex: number,
  totalPhases: number,
  slideNum: number,
): LiteralReplacement[] {
  const n = cloneIndex + 1; // 1-based phase number
  const m = totalPhases;
  const slideNumPadded = String(slideNum).padStart(2, "0");

  return [
    // 1. Full tab label (longest — must come first)
    {
      from: `${slideNumPadded} \u00B7 GENOMF\u00d6RANDE \u2014 FAS 1 AV 4`,
      to: `${slideNumPadded} \u00B7 GENOMF\u00d6RANDE \u2014 FAS ${n} AV ${m}`,
    },
    // Also handle the original "07 · GENOMFÖRANDE — FAS 1 AV 4" in the source
    // (slide number in template is always "07" regardless of clone position)
    {
      from: `07 \u00B7 GENOMF\u00d6RANDE \u2014 FAS 1 AV 4`,
      to: `${slideNumPadded} \u00B7 GENOMF\u00d6RANDE \u2014 FAS ${n} AV ${m}`,
    },
    // 2. Timeline label (second longest — must come before naked "FAS 1")
    {
      from: `TIDSLINJE \u00B7 FAS 1`,
      to: `TIDSLINJE \u00B7 FAS ${n}`,
    },
    // 3. Naked section label — replace last so it doesn't corrupt longer patterns
    {
      from: "FAS 1 AV 4",
      to: `FAS ${n} AV ${m}`,
    },
    {
      from: "FAS 1",
      to: `FAS ${n}`,
    },
    // 4. Badge (two-digit ordinal, e.g. "01") — the badge sits in a dedicated
    // text node. Use exactMatch so placeholder-filled content that happens to
    // include "01" (e.g. "ISO 27001", "2026-01-15") is not rewritten.
    {
      from: "01",
      to: String(n).padStart(2, "0"),
      exactMatch: true,
    },
  ];
}

/**
 * Walk every <a:t> node and apply literal (non-placeholder) string
 * replacements in the given order. Order matters — call with longest-first
 * list to avoid substring corruption.
 */
function applyLiteralReplacements(
  replacements: LiteralReplacement[],
  document: XMLDocument,
): void {
  const ns = "http://schemas.openxmlformats.org/drawingml/2006/main";
  const tNodes = document.getElementsByTagNameNS(ns, "t");
  for (let i = 0; i < tNodes.length; i++) {
    const node = tNodes[i];
    let text = node.textContent ?? "";
    for (const { from, to, exactMatch } of replacements) {
      if (exactMatch) {
        if (text === from) {
          text = to;
        }
      } else if (text.includes(from)) {
        text = text.split(from).join(to);
      }
    }
    node.textContent = text;
  }
}
