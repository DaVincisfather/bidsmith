# PPTX Template Troubleshooting Cookbook

Patterns we hit during the slide-by-slide visual gate. Each entry: how to recognize it, why it happens, exact fix recipe with code.

When you hit a new symptom: scan the **Signatures** below first. If nothing matches, diagnose from scratch and add a new section (see "Extending this doc").

## Quick index

1. [Wrap-duplication](#1-wrap-duplication-powerpoint-com-bug) — same word appears at end of one line and start of the next
2. [Footer wrap](#2-footer-wrap-fixed-width-text-box) — footer text wraps onto two lines on every slide
3. [Shape frozen on clone](#3-shape-frozen-on-clone) — visual element stays at source position across cloned slides
4. [Substring corruption](#4-substring-corruption-in-placeholders) — long placeholder broken because a shorter one matched first
5. [Fixture overflow](#5-fixture-overflow-data-exceeds-template-visual-slots) — rendered data extends past the template's designed slots
6. [Multi-line hard breaks](#6-multi-line-hard-breaks-paragraph-cloning) — need text on multiple lines without triggering #1

---

## 1. Wrap-duplication (PowerPoint COM bug)

**Signature.** Rendered PNG shows a word or phrase from the end of one line duplicated as the start of the wrapped line below.

**Diagnosis.** PowerPoint's COM-driven PNG export (used by `scripts/render-and-verify.ps1`) has a bug where soft-wrapped text renders the wrap-point word twice. This is NOT a placeholder/data issue. To confirm: extract the slide XML and count occurrences of the suspect word.

```bash
unzip -p tmp/sample-bid.pptx ppt/slides/slide13.xml | grep -oc "intressentprocesser"
# If == 1, it's the COM wrap bug. If > 1, it's a data/applicator bug.
```

**Fix A — shorten text to fit one line.** Cap text length to the cell/box width.

```ts
// Slide 13 ska-krav cells: ~34 chars max for single-line fit at the
// rendered cell width (~5120580 EMU column).
content.requirements[0] = "Leder komplexa intressentprocesser"; // 34 chars OK
```

**Fix B — explicit hard line breaks.** When shortening loses meaning, use `\n` in the fixture. The applicator's `expandMultiline()` clones the enclosing `<a:p>` paragraph per `\n`, producing separate paragraphs that PowerPoint renders cleanly.

```ts
// In fixture / AI output:
qaProcess[1] = "Granskning av leverans varje vecka\nvalidering mot acceptanskriterier";
```

**Reference.** `src/lib/pptx-template/applicators/_footer.ts` `expandMultiline()` (lines 41–61).

---

## 2. Footer wrap (fixed-width text box)

**Signature.** Every non-cover slide's footer line `Edgren Konsult AB | VGR-NNNN-NNNN` wraps onto two lines, regardless of company-name length.

**Diagnosis.** Template's footer shape has a fixed `cx` (3231109 EMU = 3.53") that's too narrow for the longest realistic company-name + diary-number combination. The fix is to widen the shape itself, not the text.

**Fix.** Identify the shape by its stable position (`x=1143000, y=9686925`) and patch `cx` to 5715000 EMU (~6.25") in the applicator. The position-based filter matches exactly one shape per non-cover slide (verified empirically — zero false positives).

```ts
const PRESERVATION_NS = "http://schemas.openxmlformats.org/presentationml/2006/main";
const A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";

const sps = document.getElementsByTagNameNS(PRESERVATION_NS, "sp");
for (let i = 0; i < sps.length; i++) {
  const sp = sps[i];
  const offs = sp.getElementsByTagNameNS(A_NS, "off");
  const exts = sp.getElementsByTagNameNS(A_NS, "ext");
  if (offs.length === 0 || exts.length === 0) continue;
  const off = offs[0];
  if (
    off.getAttribute("x") === "1143000" &&
    off.getAttribute("y") === "9686925"
  ) {
    exts[0].setAttribute("cx", "5715000");
  }
}
```

**Reference.** `src/lib/pptx-template/applicators/_footer.ts` `applyFooter()` (lines 239–253).

---

## 3. Shape frozen on clone

**Signature.** A cloned slide (e.g., slide 7–10 cloned from source slide 7) shows a visual element at the source's position on every clone, instead of moving per clone.

**Diagnosis.** `pptx-automizer` copies source XML verbatim into each clone. Per-clone visual differences (positions, colors, sizes) need explicit XML mutation in the `slide.modify()` callback — text replacement alone won't move shapes.

**Fix.** Walk the XML, identify the shape by a stable attribute (typically position), patch `x` / `cx` based on `cloneIndex`. Skip ambiguous matches by checking secondary attributes (e.g., the highlight bar shares `y` with the background bar; discriminate by `cx`).

```ts
const HIGHLIGHT_SLOTS: ReadonlyArray<{ x: string; cx: string }> = [
  { x: "3467100",  cx: "1139726" },  // Fas 1: M1-M2
  { x: "4606826",  cx: "3419475" },  // Fas 2: M2-M5
  { x: "8026301",  cx: "4559349" },  // Fas 3: M5-M9
  { x: "12585650", cx: "3419475" },  // Fas 4: M9-M12
];

function moveTimelineHighlight(doc: XMLDocument, cloneIndex: number) {
  const slot = HIGHLIGHT_SLOTS[cloneIndex];
  if (!slot) return;
  const A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
  const offs = doc.getElementsByTagNameNS(A_NS, "off");
  for (let i = 0; i < offs.length; i++) {
    const off = offs[i];
    if (off.getAttribute("x") !== "3467100" || off.getAttribute("y") !== "9201150") continue;
    const exts = (off.parentNode as Element).getElementsByTagNameNS(A_NS, "ext");
    if (exts.length === 0) continue;
    const ext = exts[0];
    if (ext.getAttribute("cx") === "13677900") continue; // skip the background bar
    off.setAttribute("x", slot.x);
    ext.setAttribute("cx", slot.cx);
  }
}
```

**Reference.** `src/lib/pptx-template/applicators/phase-detail.ts` `moveTimelineHighlight()` (lines 80–114).

---

## 4. Substring corruption in placeholders

**Signature.** A long placeholder gets partially replaced because a shorter placeholder containing it as substring matched first. Example: `{Fas 1 — namn}` becomes `Fas 1 — namn}` because `{Fas 1}` was replaced first.

**Diagnosis.** `replaceAllTextNodes` iterates `Object.entries(map)` in insertion order. Map construction order matters. Same applies to literal-text replacements driven by an array.

**Fix A — placeholders.** Build the replacement map with longest keys first.

```ts
// Insert LONGEST placeholders first within each slot
map[slot.descKey]        = descValue;   // {Fas 1 — kort beskrivning. Detaljer på nästa slide.}
map[slot.nameKey]        = nameValue;   // {Fas 1 — namn}
map[slot.ganttSpanKey]   = spanValue;   // {M1–M2}
map[slot.ganttLabelKey]  = labelValue;  // {Fas 1}  ← shortest, last
```

**Fix B — literal text.** Use an ordered array (not a map) and replace longest-first.

```ts
const replacements = [
  { from: "07 · GENOMFÖRANDE — FAS 1 AV 4", to: "..." },  // longest
  { from: "TIDSLINJE · FAS 1",               to: "..." },
  { from: "FAS 1 AV 4",                       to: "..." },
  { from: "FAS 1",                            to: "..." },  // shortest
];
```

**Reference.** `src/lib/pptx-template/applicators/phases-overview.ts` `buildReplacementMap()` (lines 75–148); `src/lib/pptx-template/applicators/phase-detail.ts` `buildLiteralMap()` (lines 172–213).

---

## 5. Fixture overflow (data exceeds template visual slots)

**Signature.** Rendered text spans further than the template was designed for. Typical example: timeline shows `M14–M16` on a slide whose Gantt grid only has months `M1`–`M12`.

**Diagnosis.** Template has hard-coded visual slots: Gantt bars at fixed `x` positions, columns with fixed `cx` widths, table cells with set widths. Fixture data must align to those slots — the template doesn't auto-resize.

**Fix.** Align fixture values to the template's hard-coded slot positions. For phases-overview the slot strings are baked into placeholder text; the fixture must use the same strings.

```ts
// templates/anbudsmall-v2.pptx slide 6 has these placeholders hardcoded:
//   {M1–M2}  {M2–M5}  {M5–M9}  {M9–M12}
// Fixture must match the period strings exactly:
phases: [
  { period: "M1–M2",  duration: "4 v",  ... },
  { period: "M2–M5",  duration: "12 v", ... },
  { period: "M5–M9",  duration: "16 v", ... },
  { period: "M9–M12", duration: "12 v", ... },
]
```

**Audit tactic.** When in doubt about which slot strings the template uses, extract the slide XML directly:

```bash
unzip -p templates/anbudsmall-v2.pptx ppt/slides/slide6.xml \
  | grep -oE "M[0-9]+(\xe2\x80\x93M[0-9]+)?" | sort -u
# Lists every M-prefix label in the source — that's the source of truth.
```

**Reference.** `scripts/generate-sample-pptx.ts` phase fixture (line 114 onward); `src/lib/pptx-template/applicators/phases-overview.ts` `ganttSpans` (lines 77–82).

---

## 6. Multi-line hard breaks (paragraph cloning)

**Signature.** Need text rendered on multiple lines without triggering pattern #1 (wrap-duplication). Typical case: long QA-process bullets, multi-line deliverable descriptions.

**Diagnosis.** Soft wrapping triggers the COM bug. Hard line breaks via separate `<a:p>` paragraphs avoid it.

**Fix.** In the fixture, use `\n` for line breaks. The replacers (`replaceAllTextNodes` and `replaceParagraphTextNodes`) call `expandMultiline()`, which clones the enclosing `<a:p>` per extra line. Cloned paragraphs inherit `<a:pPr>` / `<a:rPr>` so indentation, font, and color stay consistent.

```ts
// expandMultiline returns the FIRST line for the original <a:t>; cloned
// paragraphs are inserted as siblings right after the original.
function expandMultiline(node: Element, value: string): string {
  if (!value.includes("\n")) return value;
  const lines = value.split("\n");
  const para = findAncestor(node, "p");
  if (!para || !para.parentNode) return lines.join(" "); // fallback
  const parent = para.parentNode;
  let insertAfter: Node = para;
  for (let i = 1; i < lines.length; i++) {
    const clone = para.cloneNode(true) as Element;
    const cloneTs = clone.getElementsByTagNameNS(A_NS, "t");
    if (cloneTs.length > 0) {
      cloneTs[0].textContent = lines[i];
      for (let j = 1; j < cloneTs.length; j++) cloneTs[j].textContent = "";
    }
    parent.insertBefore(clone, insertAfter.nextSibling);
    insertAfter = clone;
  }
  return lines[0];
}
```

**Caveat.** Works when the enclosing `<a:p>` has one text run, OR when the paragraph-level replacer (`replaceParagraphTextNodes`) is used — that one collapses multiple `<a:t>` runs into the first node before applying replacement.

**Reference.** `src/lib/pptx-template/applicators/_footer.ts` `expandMultiline()` (lines 25–61), `replaceAllTextNodes()` (lines 77–96), `replaceParagraphTextNodes()` (lines 114–153).

---

## Diagnosis playbook

When you spot something off in a rendered PNG:

1. **Identify the slide and zone.** Note slide number, shape (text box / table cell / Gantt bar / footer), and the literal symptom.
2. **Match against Signatures above.** If a pattern fits, jump to its Fix.
3. **If no match: extract source XML.** `unzip -p tmp/sample-bid.pptx ppt/slides/slideN.xml > /tmp/slideN.xml`. Grep for the suspect text. Count occurrences with `grep -c`. This separates data bugs (count > expected) from rendering bugs (count = expected but render is wrong).
4. **For shape position bugs**, look at the shape's `<a:off x= y=>` and `<a:ext cx= cy=>` in the XML. Compare against the source mockup (`templates/anbudsmall-v2.pptx`).
5. **For text/placeholder bugs**, check the applicator's replacement map for ordering issues (pattern #4) or missing entries.
6. **Re-render only the affected slide** (see selective render mode in `render-and-verify.ps1`) before re-diffing.

## Extending this doc

When you encounter a NEW gotcha:

1. Diagnose using the playbook above; confirm it's a recurring pattern (not a one-off data issue).
2. Add a new section here using the same structure: Signature → Diagnosis → Fix → Reference.
3. Cross-link related patterns (e.g., #1 references #6 because both deal with multi-line text).
4. Commit with `docs(pptx-template):` prefix.

## Future use: AI agent integration

Each pattern's Signature + Fix doubles as a tool description for an embedded AI chat. When a customer says "texten på slide 7 ser konstig ut" the agent can:

1. Match the symptom against the Signatures.
2. Apply the matching Fix (mostly text edits in the bid data structure, occasionally an XML mutation in an applicator).
3. Re-render the affected slide(s) using selective render mode.
4. Show the updated preview via the composite grid.

The cookbook becomes a load-bearing prompt asset, not just developer docs.
