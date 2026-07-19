// One-shot script to produce a REAL, PowerPoint-openable pptx fixture that
// contains a genuine <a:tbl> inside a <p:graphicFrame> — i.e. an actual table,
// not a stack of text boxes arranged to look like one (that's how bidsmith's
// own kravmatris slide works; this fixture stands in for a customer-uploaded
// FOREIGN template that already has a real PowerPoint table).
//
// Approach mirrors scripts/make-image-fixture.ts (not generate-sample-pptx.ts,
// which drives the project's own token-replacement renderer and can't emit a
// real a:tbl): start from a real, valid pptx package — templates/anbudsmall-v2.pptx
// — and mutate two slides + the slide list via raw XML/JSZip. Reusing a real
// package (theme, master, layout, content-types all intact) is what makes this
// fixture "real" rather than the synthetic minimal-zip XML the mini-pptx test
// helper builds — see read-pptx.test.ts's "syntetisk mini-pptx" tests for the
// contrast this fixture is meant to end-to-end-prove Task 1's reader against.
//
// Run with: npx tsx scripts/generate-table-sample.ts
// Output (committed fixture): src/lib/pptx-template/__tests__/fixtures/table-sample.pptx
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import JSZip from "jszip";

// ---------------------------------------------------------------------------
// Slide 1 — prose slide: a single plain text box, no table, no tokens.
// ---------------------------------------------------------------------------

const PROSE_SLIDE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld name="Slide 1"><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="Prosa"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="8839200" cy="1828800"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln/></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="25400" tIns="25400" rIns="25400" bIns="25400" rtlCol="0" anchor="t"><a:normAutofit/></a:bodyPr><a:lstStyle/><a:p><a:pPr marL="0" indent="0" algn="l"><a:buNone/></a:pPr><a:r><a:rPr lang="sv-SE" sz="1800" dirty="0"/><a:t>Denna presentation beskriver vårt erbjudande, genomförandeplan och relevanta referensuppdrag för det aktuella uppdraget.</a:t></a:r><a:endParaRPr lang="sv-SE" sz="1800" dirty="0"/></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;

// ---------------------------------------------------------------------------
// Slide 2 — table slide: one <p:graphicFrame><a:tbl>, 4 columns, 2 rows
// (header + template/example row). Column roles (left→right): krav |
// uppfyllnad | referens | status — krav column is intentionally widest.
// ---------------------------------------------------------------------------

// EMU column widths — krav widest, then uppfyllnad/referens/status.
const COL_KRAV_EMU = 4572000;
const COL_UPPFYLLNAD_EMU = 1524000;
const COL_REFERENS_EMU = 1828800;
const COL_STATUS_EMU = 914400;
const TABLE_WIDTH_EMU = COL_KRAV_EMU + COL_UPPFYLLNAD_EMU + COL_REFERENS_EMU + COL_STATUS_EMU;

const HEADER_ROW_H_EMU = 370840;
const TEMPLATE_ROW_H_EMU = 370840;
const TABLE_HEIGHT_EMU = HEADER_ROW_H_EMU + TEMPLATE_ROW_H_EMU;

// Table top well above zero, leaving meaningful vertical space below it on the slide.
const TABLE_X_EMU = 914400;
const TABLE_Y_EMU = 1500000;

// Built-in "No Style, Table Grid" guid — already declared as the package
// default in ppt/tableStyles.xml, so referencing it needs no new part.
const TABLE_STYLE_GUID = "{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}";

function cellXml(text: string, bold: boolean): string {
  const rPr = bold ? `<a:rPr lang="sv-SE" b="1" dirty="0"/>` : `<a:rPr lang="sv-SE" dirty="0"/>`;
  return `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r>${rPr}<a:t>${text}</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>`;
}

function rowXml(hEmu: number, cells: string[], bold: boolean): string {
  return `<a:tr h="${hEmu}">${cells.map((c) => cellXml(c, bold)).join("")}</a:tr>`;
}

const HEADER_ROW = rowXml(HEADER_ROW_H_EMU, ["Krav", "Uppfyllnad", "Referens", "Status"], true);
const TEMPLATE_ROW = rowXml(
  TEMPLATE_ROW_H_EMU,
  [
    "Minst 5 års erfarenhet av strategisk rådgivning",
    "Uppfylls, se bilaga 3",
    "Bilaga 3",
    "Uppfyllt",
  ],
  false,
);

const TABLE_GRAPHIC_FRAME_XML = `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="2" name="Kravmatris"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${TABLE_X_EMU}" y="${TABLE_Y_EMU}"/><a:ext cx="${TABLE_WIDTH_EMU}" cy="${TABLE_HEIGHT_EMU}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"><a:tableStyleId>${TABLE_STYLE_GUID}</a:tableStyleId></a:tblPr><a:tblGrid><a:gridCol w="${COL_KRAV_EMU}"/><a:gridCol w="${COL_UPPFYLLNAD_EMU}"/><a:gridCol w="${COL_REFERENS_EMU}"/><a:gridCol w="${COL_STATUS_EMU}"/></a:tblGrid>${HEADER_ROW}${TEMPLATE_ROW}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;

const TABLE_SLIDE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld name="Slide 2"><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${TABLE_GRAPHIC_FRAME_XML}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;

// ---------------------------------------------------------------------------
// Main — load the real base package, swap in the two slides, trim the slide
// list to just those two, write the fixture.
// ---------------------------------------------------------------------------

// templates/anbudsmall-v2.pptx ships 17 slides; we keep only slide1/slide2 —
// these are the orphans to strip entirely (not just unreference).
const ORPHAN_SLIDE_NUMBERS = Array.from({ length: 15 }, (_, i) => i + 3); // 3..17

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Strips slide3..slide17 (and their now-orphaned notesSlides) COMPLETELY from
 * the package: the physical parts, their own _rels files, their
 * <Relationship> entries in presentation.xml.rels, and their <Override>
 * entries in [Content_Types].xml.
 *
 * Earlier version of this script left these parts in place (unreferenced by
 * <p:sldIdLst>, which is all readPptxSlides itself needs). That was fine for
 * introspection but broke as a RENDER substrate: pptx-automizer names newly
 * appended slides slide3.xml/slide4.xml — colliding with these leftover
 * orphan part names — and appends fresh <Override> entries for them into
 * [Content_Types].xml without checking for an existing one, producing
 * duplicate PartName overrides (an OPC violation) that PowerPoint refuses to
 * open (0x80CB8001). Stripping the orphans outright removes the collision
 * surface. Layouts/masters/theme/media are untouched — slide1/slide2 both
 * depend on slideLayout1.xml via their own _rels files.
 */
async function stripOrphanSlideParts(zip: JSZip): Promise<void> {
  for (const n of ORPHAN_SLIDE_NUMBERS) {
    zip.remove(`ppt/slides/slide${n}.xml`);
    zip.remove(`ppt/slides/_rels/slide${n}.xml.rels`);
    zip.remove(`ppt/notesSlides/notesSlide${n}.xml`);
    zip.remove(`ppt/notesSlides/_rels/notesSlide${n}.xml.rels`);
  }

  const relsPath = "ppt/_rels/presentation.xml.rels";
  let rels = await zip.file(relsPath)!.async("string");
  for (const n of ORPHAN_SLIDE_NUMBERS) {
    const re = new RegExp(`<Relationship[^>]*Target="slides/slide${n}\\.xml"[^>]*/>`);
    if (!re.test(rels)) {
      throw new Error(`presentation.xml.rels saknar relationship för slide${n}.xml — kan inte strippa`);
    }
    rels = rels.replace(re, "");
  }
  zip.file(relsPath, rels);

  const ctPath = "[Content_Types].xml";
  let ct = await zip.file(ctPath)!.async("string");
  for (const n of ORPHAN_SLIDE_NUMBERS) {
    for (const partName of [`/ppt/slides/slide${n}.xml`, `/ppt/notesSlides/notesSlide${n}.xml`]) {
      const re = new RegExp(`<Override PartName="${escapeRegExp(partName)}"[^>]*/>`);
      if (!re.test(ct)) {
        throw new Error(`[Content_Types].xml saknar override för ${partName} — kan inte strippa`);
      }
      ct = ct.replace(re, "");
    }
  }
  zip.file(ctPath, ct);
}

async function main() {
  const zip = await JSZip.loadAsync(
    await readFile(path.resolve("templates", "anbudsmall-v2.pptx")),
  );

  zip.file("ppt/slides/slide1.xml", PROSE_SLIDE_XML);
  zip.file("ppt/slides/slide2.xml", TABLE_SLIDE_XML);

  await stripOrphanSlideParts(zip);

  // Trim presentation.xml's slide list to slide1 (rId2) + slide2 (rId3) only —
  // both r:ids already point at the right targets in presentation.xml.rels, so
  // no rels changes are needed here (the orphan rels/overrides were already
  // stripped above).
  const presPath = "ppt/presentation.xml";
  let presXml = await zip.file(presPath)!.async("string");
  const sldIdLstRe = /<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/;
  if (!sldIdLstRe.test(presXml)) {
    throw new Error("presentation.xml saknar <p:sldIdLst> — kan inte trimma slide-listan");
  }
  presXml = presXml.replace(
    sldIdLstRe,
    `<p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId3"/></p:sldIdLst>`,
  );
  zip.file(presPath, presXml);

  const outDir = path.resolve("src/lib/pptx-template/__tests__/fixtures");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "table-sample.pptx");
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  await writeFile(outPath, buffer);
  console.log(`Wrote ${buffer.length} bytes to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
