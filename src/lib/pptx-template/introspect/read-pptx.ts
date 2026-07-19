import JSZip from "jszip";
// Element importeras från @xmldom/xmldom (inte lib.dom) — den parsade DOM:en är
// xmldoms och dess Element saknar lib.dom-Elementets HTML-egenskaper (classList m.fl.).
import { DOMParser, type Element } from "@xmldom/xmldom";

const A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main";
const R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

export interface ShapeText {
  /** Paragraftexter — runs konkatenerade per <a:p> (split-run-säkert) */
  paragraphs: string[];
  /** {Token}-placeholders funna i paragraferna */
  tokens: string[];
  /** EMU-geometri ur <a:xfrm>; null när shapen ärver från layouten */
  geometry: { x: number; y: number; cx: number; cy: number } | null;
  /** Punktstorlek från första <a:rPr sz=...> (eller defRPr) på shapen; faller
   *  tillbaka till presentationens <p:defaultTextStyle> lvl1-default när shapen
   *  saknar explicit sz (vanligt för plain text-boxar — t.ex. {Mål}-rutan, vars
   *  rPr ärver 18 pt från presentation.xml). null endast om inget alls hittas. */
  fontSizePt: number | null;
  /** Radavstånd i procent ur <a:lnSpc><a:spcPct>; null = mallens default */
  lineSpacingPct: number | null;
  /** Autofit ur <a:bodyPr>: "norm" (texten krymps — geometrin är inte bindande),
   *  "spAuto" (boxen växer), "none" (explicit noAutofit) eller null (ej angiven). */
  autofit: "norm" | "spAuto" | "none" | null;
  /** true = shapen ligger inuti en <p:grpSp>; dess xfrm är grupp-lokal (relativt
   *  gruppens childOffset), inte slide-global — geometrin kan därför inte ritas
   *  rakt i slide-koordinater. Shape-indexeringen (dokumentordning) är oförändrad;
   *  wireframen droppar bara geometrin för dessa (se draft-logic buildDraft). */
  inGroup: boolean;
}

export interface SlideShapes {
  /** 1-baserat slide-index i presentationsordning */
  source: number;
  shapes: ShapeText[];
  /** Union av shape-tokens på sliden */
  tokens: string[];
  /** Bildytor — placerade <p:pic> resp. tomma <p:ph type="pic">. Lämnas orörda
   *  av hela pipelinen; räknas för manifest/preview. */
  images: { placed: number; placeholders: number };
  /** Främmande <a:tbl>-tabeller (kravmatris-kandidater). Additivt fält — rör inte
   *  shapes[]/tokens-adresseringen, som fortsätter räkna endast <p:sp>. */
  tables: TableShape[];
}

export interface TableCell {
  text: string;
}

export interface TableRow {
  heightEmu: number;
  cells: TableCell[];
}

export interface TableShape {
  /** Index bland sliden graphicFrames som innehåller en a:tbl, dokumentordning. */
  frameIndex: number;
  /** Frame-geometri ur <p:graphicFrame><p:xfrm> (EMU); null när ärvd/saknas. */
  geometry: { xEmu: number; yEmu: number; cxEmu: number; cyEmu: number } | null;
  gridColsEmu: number[];
  rows: TableRow[];
}

const TOKEN_RE = /\{[^{}]+\}/g;

/**
 * Resolverar slide-XML-sökvägarna i presentationsordning: presentation.xml
 * <p:sldIdLst> → r:id → presentation.xml.rels target. Filnamnsordning (slide10 <
 * slide2 lexikografiskt) är en klassisk fälla — därför sldIdLst, inte glob.
 *
 * Exporterad så instrument-template.ts adresserar exakt SAMMA slides i SAMMA
 * ordning som denna läsare rapporterar (source = index + 1). En kopia hade
 * kunnat drifta och bryta index-alignmenten mellan introspektion och injektion.
 */
export async function resolveSlidePaths(
  zip: JSZip,
  parser: DOMParser,
): Promise<string[]> {
  const presXml = await readEntry(zip, "ppt/presentation.xml");
  const relsXml = await readEntry(zip, "ppt/_rels/presentation.xml.rels");
  const pres = parser.parseFromString(presXml, "application/xml");
  const rels = parser.parseFromString(relsXml, "application/xml");

  // r:id → target ("slides/slide1.xml")
  const relTargets = new Map<string, string>();
  const relNodes = rels.getElementsByTagName("Relationship");
  for (let i = 0; i < relNodes.length; i++) {
    const rel = relNodes[i];
    relTargets.set(rel.getAttribute("Id") ?? "", rel.getAttribute("Target") ?? "");
  }

  const sldIds = pres.getElementsByTagNameNS(P_NS, "sldId");
  const slidePaths: string[] = [];
  for (let i = 0; i < sldIds.length; i++) {
    const rId = sldIds[i].getAttributeNS(R_NS, "id") ?? "";
    const target = relTargets.get(rId);
    if (target) slidePaths.push(`ppt/${target.replace(/^\//, "")}`);
  }
  return slidePaths;
}

export async function readPptxSlides(buffer: Buffer): Promise<SlideShapes[]> {
  const zip = await JSZip.loadAsync(buffer);
  const parser = new DOMParser();

  const presXml = await readEntry(zip, "ppt/presentation.xml");
  const pres = parser.parseFromString(presXml, "application/xml");

  // Default-fontstorlek för text-boxar utan egen sz. Plain text-boxar (utan
  // <p:ph>) ärver från presentationens <p:defaultTextStyle> lvl1-defRPr, inte
  // från layout-placeholders. Vi resolverar den en gång och langar in som
  // fallback i shape-extraktionen (annars blir {Mål}-rutans fontSizePt null).
  const defaultFontSizePt = readDefaultFontSizePt(pres);

  const slidePaths = await resolveSlidePaths(zip, parser);

  const result: SlideShapes[] = [];
  for (let i = 0; i < slidePaths.length; i++) {
    const xml = await readEntry(zip, slidePaths[i]);
    const doc = parser.parseFromString(xml, "application/xml");
    const shapes = extractShapes(doc, defaultFontSizePt);
    result.push({
      source: i + 1,
      shapes,
      tokens: [...new Set(shapes.flatMap((s) => s.tokens))],
      images: countImages(doc),
      tables: extractTables(doc),
    });
  }
  return result;
}

/**
 * Räknar bildytor: placerade bilder (<p:pic>, även nästlade i grupper —
 * getElementsByTagNameNS är rekursiv) och tomma bildplaceholders
 * (<p:sp> vars <p:nvSpPr><p:nvPr><p:ph type="pic">).
 *
 * En bild som infogats VIA en bildplaceholder serialiseras som <p:pic> med
 * <p:ph type="pic"> inuti sig — den räknas enbart som placed, inte som tom
 * placeholder (annars dubbelräknas ifyllda placeholders i preview-siffrorna).
 */
export function countImages(
  doc: ReturnType<DOMParser["parseFromString"]>,
): { placed: number; placeholders: number } {
  const placed = doc.getElementsByTagNameNS(P_NS, "pic").length;
  let placeholders = 0;
  const phNodes = doc.getElementsByTagNameNS(P_NS, "ph");
  for (let i = 0; i < phNodes.length; i++) {
    if (phNodes[i].getAttribute("type") !== "pic") continue;
    if (!hasPicAncestor(phNodes[i])) placeholders++;
  }
  return { placed, placeholders };
}

function hasPicAncestor(node: Element): boolean {
  let parent = node.parentNode;
  while (parent) {
    if (
      parent.nodeType === 1 &&
      (parent as Element).localName === "pic" &&
      (parent as Element).namespaceURI === P_NS
    ) {
      return true;
    }
    parent = parent.parentNode;
  }
  return false;
}

// Sant när shapen har en <p:grpSp>-förfader — då är dess <a:xfrm> grupp-lokal och
// ritas fel om den tolkas som slide-global (samma parent-traversering som
// hasPicAncestor). Additivt: påverkar inte extractShapes dokumentordning/index.
function hasGrpSpAncestor(node: Element): boolean {
  let parent = node.parentNode;
  while (parent) {
    if (
      parent.nodeType === 1 &&
      (parent as Element).localName === "grpSp" &&
      (parent as Element).namespaceURI === P_NS
    ) {
      return true;
    }
    parent = parent.parentNode;
  }
  return false;
}

async function readEntry(zip: JSZip, name: string): Promise<string> {
  const entry = zip.file(name);
  if (!entry) throw new Error(`PPTX saknar ${name} — är filen en giltig presentation?`);
  return entry.async("string");
}

function extractShapes(
  doc: ReturnType<DOMParser["parseFromString"]>,
  defaultFontSizePt: number | null,
): ShapeText[] {
  const shapes: ShapeText[] = [];
  const spNodes = doc.getElementsByTagNameNS(P_NS, "sp");
  for (let i = 0; i < spNodes.length; i++) {
    const sp = spNodes[i];
    const txBodies = sp.getElementsByTagNameNS(P_NS, "txBody");
    if (txBodies.length === 0) continue;
    const txBody = txBodies[0];

    const paragraphs = readParagraphs(txBody);

    const tokens = [...new Set(paragraphs.flatMap((p) => p.match(TOKEN_RE) ?? []))];

    shapes.push({
      paragraphs,
      tokens,
      geometry: readGeometry(sp),
      fontSizePt: readFontSizePt(txBody) ?? defaultFontSizePt,
      lineSpacingPct: readLineSpacingPct(txBody),
      autofit: readAutofit(txBody),
      inGroup: hasGrpSpAncestor(sp),
    });
  }
  return shapes;
}

// Paragraftexter av valfri txBody (sp eller a:tc) — runs konkatenerade per <a:p>,
// samma split-run-säkra läsning som extractShapes använde inline tidigare.
function readParagraphs(txBody: Element): string[] {
  const paragraphs: string[] = [];
  const pNodes = txBody.getElementsByTagNameNS(A_NS, "p");
  for (let j = 0; j < pNodes.length; j++) {
    const tNodes = pNodes[j].getElementsByTagNameNS(A_NS, "t");
    let text = "";
    for (let k = 0; k < tNodes.length; k++) text += tNodes[k].textContent ?? "";
    paragraphs.push(text);
  }
  return paragraphs;
}

// Främmande <a:tbl>-tabeller: en per <p:graphicFrame> som innehåller en a:tbl.
// frameIndex räknas bland just dessa graphicFrames (dokumentordning) — helt
// separat räkning från extractShapes p:sp-lista, så shapes[]-indexeringen
// (adresserad av drafts/instrumentering) är oberörd per konstruktion.
function extractTables(doc: ReturnType<DOMParser["parseFromString"]>): TableShape[] {
  const tables: TableShape[] = [];
  const frameNodes = doc.getElementsByTagNameNS(P_NS, "graphicFrame");
  let frameIndex = 0;
  for (let i = 0; i < frameNodes.length; i++) {
    const frame = frameNodes[i];
    const tblNodes = frame.getElementsByTagNameNS(A_NS, "tbl");
    if (tblNodes.length === 0) continue;
    const tbl = tblNodes[0];

    const gridColsEmu: number[] = [];
    const gridCols = tbl.getElementsByTagNameNS(A_NS, "gridCol");
    for (let g = 0; g < gridCols.length; g++) {
      const w = gridCols[g].getAttribute("w");
      gridColsEmu.push(w === null ? 0 : Number(w));
    }

    const rows: TableRow[] = [];
    // Direkta a:tr-barn (getElementsByTagNameNS är rekursiv, men a:tr nästlar
    // sig inte i denna struktur, så full trädsökning är trygg och enkel).
    const trNodes = tbl.getElementsByTagNameNS(A_NS, "tr");
    for (let r = 0; r < trNodes.length; r++) {
      const tr = trNodes[r];
      const h = tr.getAttribute("h");
      const cells: TableCell[] = [];
      const tcNodes = tr.getElementsByTagNameNS(A_NS, "tc");
      for (let c = 0; c < tcNodes.length; c++) {
        const txBodies = tcNodes[c].getElementsByTagNameNS(A_NS, "txBody");
        const text = txBodies.length > 0 ? readParagraphs(txBodies[0]).join("\n") : "";
        cells.push({ text });
      }
      rows.push({ heightEmu: h === null ? 0 : Number(h), cells });
    }

    tables.push({
      frameIndex: frameIndex++,
      geometry: readFrameGeometry(frame),
      gridColsEmu,
      rows,
    });
  }
  return tables;
}

// Frame-geometri ur <p:graphicFrame><p:xfrm> — OBS annan förälder än sp:s
// <p:spPr><a:xfrm> (readGeometry ovan): graphicFrame bär xfrm direkt i P_NS,
// inte nästlat under en spPr-liknande wrapper.
function readFrameGeometry(frame: Element): TableShape["geometry"] {
  const xfrms = frame.getElementsByTagNameNS(P_NS, "xfrm");
  if (xfrms.length === 0) return null;
  const off = xfrms[0].getElementsByTagNameNS(A_NS, "off")[0];
  const ext = xfrms[0].getElementsByTagNameNS(A_NS, "ext")[0];
  if (!off || !ext) return null;
  const x = off.getAttribute("x");
  const y = off.getAttribute("y");
  const cx = ext.getAttribute("cx");
  const cy = ext.getAttribute("cy");
  if (x === null || y === null || cx === null || cy === null) return null;
  return { xEmu: Number(x), yEmu: Number(y), cxEmu: Number(cx), cyEmu: Number(cy) };
}

function readGeometry(sp: Element): ShapeText["geometry"] {
  // Endast shapens egen <p:spPr><a:xfrm> — gruppers/layouters transform ignoreras.
  // Budget-bärande boxar i konventionen måste ha explicit geometri (authoring-guiden).
  const spPrs = sp.getElementsByTagNameNS(P_NS, "spPr");
  if (spPrs.length === 0) return null;
  const xfrms = spPrs[0].getElementsByTagNameNS(A_NS, "xfrm");
  if (xfrms.length === 0) return null;
  const off = xfrms[0].getElementsByTagNameNS(A_NS, "off")[0];
  const ext = xfrms[0].getElementsByTagNameNS(A_NS, "ext")[0];
  if (!off || !ext) return null;
  const x = off.getAttribute("x");
  const y = off.getAttribute("y");
  const cx = ext.getAttribute("cx");
  const cy = ext.getAttribute("cy");
  if (x === null || y === null || cx === null || cy === null) return null;
  return { x: Number(x), y: Number(y), cx: Number(cx), cy: Number(cy) };
}

function readFontSizePt(txBody: Element): number | null {
  // sz anges i hundradels punkter (1800 = 18 pt). Första explicita vinner:
  // rPr på en run, annars defRPr på paragrafnivå.
  // First run wins; on mixed-size shapes this is the first run, which under-budgets safely.
  for (const tag of ["rPr", "defRPr"]) {
    const nodes = txBody.getElementsByTagNameNS(A_NS, tag);
    for (let i = 0; i < nodes.length; i++) {
      const sz = nodes[i].getAttribute("sz");
      if (sz) return Number(sz) / 100;
    }
  }
  return null;
}

function readDefaultFontSizePt(
  pres: ReturnType<DOMParser["parseFromString"]>,
): number | null {
  // <p:defaultTextStyle><a:lvl1pPr><a:defRPr sz="1800"> i presentation.xml styr
  // plain text-boxar (utan placeholder). Speglar masterns otherStyle.
  const dts = pres.getElementsByTagNameNS(P_NS, "defaultTextStyle")[0];
  if (!dts) return null;
  const lvl1 = dts.getElementsByTagNameNS(A_NS, "lvl1pPr")[0];
  const defRPr = (lvl1 ?? dts).getElementsByTagNameNS(A_NS, "defRPr")[0];
  const sz = defRPr?.getAttribute("sz");
  return sz ? Number(sz) / 100 : null;
}

function readLineSpacingPct(txBody: Element): number | null {
  const lnSpcs = txBody.getElementsByTagNameNS(A_NS, "lnSpc");
  if (lnSpcs.length === 0) return null;
  const pct = lnSpcs[0].getElementsByTagNameNS(A_NS, "spcPct")[0];
  if (!pct) return null;
  // spcPct val är i tusendels procent (140000 = 140 %)
  return Number(pct.getAttribute("val")) / 1000;
}

function readAutofit(txBody: Element): ShapeText["autofit"] {
  // <a:bodyPr> bär exakt ett autofit-barn (normAutofit | spAutoFit | noAutofit)
  // eller inget alls. Vi läser txBodyns egna bodyPr (första) — taggens närvaro,
  // inte attribut, avgör läget. normAutofit => texten krymps till boxen, så
  // geometrin är inte bindande för budgeten (hybridmodellen låter taket gälla rakt av).
  const bodyPrs = txBody.getElementsByTagNameNS(A_NS, "bodyPr");
  if (bodyPrs.length === 0) return null;
  const bodyPr = bodyPrs[0];
  if (bodyPr.getElementsByTagNameNS(A_NS, "normAutofit").length > 0) return "norm";
  if (bodyPr.getElementsByTagNameNS(A_NS, "spAutoFit").length > 0) return "spAuto";
  if (bodyPr.getElementsByTagNameNS(A_NS, "noAutofit").length > 0) return "none";
  return null;
}
