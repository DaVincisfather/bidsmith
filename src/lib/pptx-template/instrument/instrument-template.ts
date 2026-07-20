import JSZip from "jszip";
// Element/DOMParser/XMLSerializer importeras från @xmldom/xmldom (inte lib.dom) —
// den parsade DOM:en är xmldoms och dess Element saknar lib.dom-Elementets
// HTML-egenskaper (classList m.fl.). Speglar read-pptx.ts import-stil.
import { DOMParser, XMLSerializer, type Element } from "@xmldom/xmldom";
import { resolveSlidePaths } from "../introspect/read-pptx";
import { assertZipWithinLimits } from "../zip-guard";

/**
 * Token-injektion för oinstrumenterade kundmallar (design-doc TILLÄGG 2026-07-03,
 * notes/2026-07-02-template-upload-architecture.md).
 *
 * En kundmall har textboxar men inga `{...}`-tokens; hela renderingspipelinen är
 * token-baserad. Onboarding instrumenterar en KOPIA en gång: injicerar ett token
 * i varje bekräftad shape så den befintliga pipelinen kör oförändrad. Denna modul
 * är injektionsmotorn — isolerad, inga anropsställen än.
 *
 * Adressering (source + shapeIndex) speglar readPptxSlides exakt: en
 * introspektionsträff kan mata injektionen direkt. Se TokenInjection.
 */

const A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main";

// Exakt-match: ett enkelt {namn} utan nästlade klammrar. Skiljer sig från
// read-pptx TOKEN_RE (global, för att FINNA tokens i löptext) — här VALIDERAR vi
// att hela strängen är precis ett token.
const TOKEN_RE = /^\{[^{}]+\}$/;

export interface TokenInjection {
  /** 1-based slide index in presentation order — same numbering as readPptxSlides */
  source: number;
  /** 0-based index among the slide's <p:sp> shapes that have a <p:txBody>, in
   *  document order — MUST match the shape order readPptxSlides reports, so an
   *  introspection result can address shapes for injection directly. */
  shapeIndex: number;
  /** Token to inject, e.g. "{Vår metod}". Must match /^\{[^{}]+\}$/. */
  token: string;
}

/**
 * Instrumenterar en pptx-buffer: skriver `injections` tokens i respektive shapes
 * XML och returnerar den ombyggda pptx:en. Övriga zip-entries passerar orörda.
 *
 * Zero injections → returnerar originalbuffern oförändrad (billigast, och
 * garanterat byte-identisk — vi rör inte zip:en alls).
 *
 * Fails loud (engelska) vid: token som inte matchar token-regex, samma token två
 * gånger, source utanför intervallet, shapeIndex utanför slidens shape-antal.
 */
export async function instrumentTemplate(
  buffer: Buffer,
  injections: TokenInjection[],
): Promise<Buffer> {
  if (injections.length === 0) return buffer;

  validateInjections(injections);

  const zip = await JSZip.loadAsync(buffer);
  assertZipWithinLimits(zip, "pptx");
  const parser = new DOMParser();
  const serializer = new XMLSerializer();
  const slidePaths = await resolveSlidePaths(zip, parser);

  // Gruppera per slide så varje slide-XML parsas/serialiseras en gång även vid
  // flera injektioner mot samma source.
  const bySource = new Map<number, TokenInjection[]>();
  for (const inj of injections) {
    if (inj.source < 1 || inj.source > slidePaths.length) {
      throw new Error(
        `instrumentTemplate: source ${inj.source} out of range (1..${slidePaths.length})`,
      );
    }
    const list = bySource.get(inj.source) ?? [];
    list.push(inj);
    bySource.set(inj.source, list);
  }

  for (const [source, group] of bySource) {
    const path = slidePaths[source - 1];
    const entry = zip.file(path);
    if (!entry) throw new Error(`instrumentTemplate: missing slide entry ${path}`);
    const xml = await entry.async("string");
    const doc = parser.parseFromString(xml, "application/xml");

    const shapes = txBodyShapes(doc);
    for (const inj of group) {
      if (inj.shapeIndex < 0 || inj.shapeIndex >= shapes.length) {
        throw new Error(
          `instrumentTemplate: shapeIndex ${inj.shapeIndex} out of range for source ${source} (0..${shapes.length - 1})`,
        );
      }
      injectToken(doc, shapes[inj.shapeIndex], inj.token);
    }

    // xmldom serialiserar inte tillbaka XML-deklarationen (den blir ingen PI-nod
    // vid parse) — behåll originalets så slide-XML:en förblir välformad för PowerPoint.
    let outXml = serializer.serializeToString(doc);
    if (!outXml.startsWith("<?xml")) {
      const decl = xml.match(/^<\?xml[^>]*\?>/);
      if (decl) outXml = `${decl[0]}\n${outXml}`;
    }
    zip.file(path, outXml);
  }

  // DEFLATE — JSZip defaultar annars till STORE (okomprimerad pptx).
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

function validateInjections(injections: TokenInjection[]): void {
  const seenTokens = new Set<string>();
  const seenTargets = new Set<string>();
  for (const inj of injections) {
    if (!TOKEN_RE.test(inj.token)) {
      throw new Error(
        `instrumentTemplate: token "${inj.token}" must match /^\\{[^{}]+\\}$/`,
      );
    }
    if (seenTokens.has(inj.token)) {
      throw new Error(
        `instrumentTemplate: duplicate token "${inj.token}" across injections`,
      );
    }
    seenTokens.add(inj.token);
    // Två injektioner mot samma shape skulle tyst radera varandra (injectToken
    // tömmer boxen) — den andra vinner och den förstas token försvinner spårlöst.
    const target = `${inj.source}#${inj.shapeIndex}`;
    if (seenTargets.has(target)) {
      throw new Error(
        `instrumentTemplate: duplicate target (source ${inj.source}, shapeIndex ${inj.shapeIndex}) — one token per shape`,
      );
    }
    seenTargets.add(target);
  }
}

/**
 * Slidens <p:sp> som har <p:txBody>, i dokumentordning — SAMMA filter och ordning
 * som extractShapes i read-pptx.ts, så shapeIndex adresserar identiskt.
 */
function txBodyShapes(doc: ReturnType<DOMParser["parseFromString"]>): Element[] {
  const shapes: Element[] = [];
  const spNodes = doc.getElementsByTagNameNS(P_NS, "sp");
  for (let i = 0; i < spNodes.length; i++) {
    if (spNodes[i].getElementsByTagNameNS(P_NS, "txBody").length > 0) {
      shapes.push(spNodes[i]);
    }
  }
  return shapes;
}

/**
 * Skriver `token` som shapens enda text och ärver befintlig formatering: behåller
 * första <a:p>:s <a:pPr> och första run:ens <a:rPr>, tömmer allt annat innehåll.
 *
 * Varför ärva: den injicerade run:ens formatering är exakt vad budget-beräkningen
 * och render-tidens paragraf-kloning (expandMultiline) läser. Syntetisk formatering
 * hade ljugit för båda. <p:spPr> (geometri) och <a:bodyPr> rörs aldrig.
 */
function injectToken(
  doc: ReturnType<DOMParser["parseFromString"]>,
  sp: Element,
  token: string,
): void {
  const txBody = sp.getElementsByTagNameNS(P_NS, "txBody")[0];

  // Effektiv fontstorlek FÖRE mutation, med samma "första explicita vinner"-scan
  // som readFontSizePt. Storleken kan bo i en run/paragraf vi strax raderar
  // (t.ex. första run utan sz, andra run med) — då måste den stämplas tillbaka,
  // annars driftar introspektionens fontSizePt och budgeten räknas på default.
  const preSz = effectiveSz(txBody);

  // Direkta paragraf-barn i ordning; ta bort alla utom den första.
  const paras = childElements(txBody, "p");
  for (let i = 1; i < paras.length; i++) txBody.removeChild(paras[i]);

  let firstP = paras[0];
  if (!firstP) {
    firstP = doc.createElementNS(A_NS, "a:p");
    txBody.appendChild(firstP);
  }

  const pPr = childElements(firstP, "pPr")[0] ?? null;
  const keptRun = childElements(firstP, "r")[0] ?? null;

  // Rensa paragrafen till {pPr?, kept run?} — tar bort övriga runs OCH andra
  // text-bärande syskon (t.ex. <a:fld>, <a:br>) så bara token-texten återstår.
  for (let n = firstP.firstChild; n; ) {
    const next = n.nextSibling;
    if (n !== pPr && n !== keptRun) firstP.removeChild(n);
    n = next;
  }

  let run: Element;
  if (keptRun) {
    // Behåll run:ens rPr; ersätt dess text med ett rent <a:t>token</a:t>.
    const rPr = childElements(keptRun, "rPr")[0] ?? null;
    for (let n = keptRun.firstChild; n; ) {
      const next = n.nextSibling;
      if (n !== rPr) keptRun.removeChild(n);
      n = next;
    }
    keptRun.appendChild(makeTextNode(doc, token));
    run = keptRun;
  } else {
    // Ingen run att ärva från — skapa <a:r><a:t>token</a:t></a:r> (drawingml-ns).
    run = doc.createElementNS(A_NS, "a:r");
    run.appendChild(makeTextNode(doc, token));
    if (pPr) firstP.insertBefore(run, pPr.nextSibling);
    else firstP.insertBefore(run, firstP.firstChild);
  }

  // Röjde mutationen bort storlekskällan? Stämpla då pre-mutationens sz på den
  // kvarvarande run:en så introspektionen ser samma fontSizePt före och efter.
  if (preSz !== null && effectiveSz(txBody) === null) {
    let rPr = childElements(run, "rPr")[0] ?? null;
    if (!rPr) {
      rPr = doc.createElementNS(A_NS, "a:rPr");
      run.insertBefore(rPr, run.firstChild);
    }
    rPr.setAttribute("sz", preSz);
  }
}

/**
 * Speglar readFontSizePt:s scan (rPr före defRPr, första med sz vinner) men
 * returnerar rå-attributet — instrumenteringen ska bevara exakt värde, inte
 * tolka punkter.
 */
function effectiveSz(txBody: Element): string | null {
  for (const tag of ["rPr", "defRPr"]) {
    const nodes = txBody.getElementsByTagNameNS(A_NS, tag);
    for (let i = 0; i < nodes.length; i++) {
      const sz = nodes[i].getAttribute("sz");
      if (sz) return sz;
    }
  }
  return null;
}

function makeTextNode(
  doc: ReturnType<DOMParser["parseFromString"]>,
  token: string,
): Element {
  const t = doc.createElementNS(A_NS, "a:t");
  t.appendChild(doc.createTextNode(token));
  return t;
}

/** Direkta barn-element med givet localName i drawingml-namespacet, i ordning. */
function childElements(parent: Element, localName: string): Element[] {
  const out: Element[] = [];
  for (let n = parent.firstChild; n; n = n.nextSibling) {
    if (
      n.nodeType === 1 &&
      (n as Element).localName === localName &&
      (n as Element).namespaceURI === A_NS
    ) {
      out.push(n as Element);
    }
  }
  return out;
}
