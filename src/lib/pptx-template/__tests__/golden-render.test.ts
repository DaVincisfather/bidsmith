// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFile, writeFile } from "fs/promises";
import path from "path";
import JSZip from "jszip";
import { DOMParser, type Element } from "@xmldom/xmldom";
import { renderTemplate } from "../loader";
import { GOLDEN_SECTIONS, GOLDEN_MASTER } from "./fixtures/golden-sections";

const GOLDEN_PATH = path.resolve(
  "src/lib/pptx-template/__tests__/golden/anbudsmall-v2.golden.json",
);
const A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main";
const R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

interface SlideSnapshot {
  /** Alla <a:t>-texter i dokumentordning */
  texts: string[];
  /** Alla <a:off>/<a:ext>-attribut i dokumentordning — fångar geometri-mutationer
   *  (timeline-highlight, footer-breddning) */
  xfrm: { x: string; y: string; cx: string; cy: string }[];
  /** Antal <p:pic> — pinnar att rendering varken tappar eller skapar bilder
   *  (designmallen: 0 överallt; kontraktet gäller alla mallar) */
  pics: number;
}

async function snapshotRender(): Promise<SlideSnapshot[]> {
  const buffer = await renderTemplate("anbudsmall-v2", GOLDEN_SECTIONS, GOLDEN_MASTER);
  const zip = await JSZip.loadAsync(buffer);
  const parser = new DOMParser();

  // pptx-automizer APPENDERAR de renderade sliderna i arkivet och avlistar bara
  // originalen i presentation.xml — Object.keys(zip.files) innehåller därför både
  // orphans och aktiva slides (31 filer för 14 aktiva). Filnamns-regex skulle
  // snapshotta skräp. Vi följer presentation.xml → sldIdLst → r:id → rels för att
  // få exakt de slides den utgående decken visar, i presentationsordning.
  const slidePaths = await resolveActiveSlides(zip, parser);

  const snapshots: SlideSnapshot[] = [];
  for (const name of slidePaths) {
    const doc = parser.parseFromString(await zip.file(name)!.async("string"), "application/xml");
    const texts: string[] = [];
    const tNodes = doc.getElementsByTagNameNS(A_NS, "t");
    for (let i = 0; i < tNodes.length; i++) texts.push(tNodes[i].textContent ?? "");
    const xfrm: SlideSnapshot["xfrm"] = [];
    const offs = doc.getElementsByTagNameNS(A_NS, "off");
    for (let i = 0; i < offs.length; i++) {
      const off = offs[i];
      const ext = (off.parentNode as Element | null)?.getElementsByTagNameNS(A_NS, "ext")[0];
      xfrm.push({
        x: off.getAttribute("x") ?? "",
        y: off.getAttribute("y") ?? "",
        cx: ext?.getAttribute("cx") ?? "",
        cy: ext?.getAttribute("cy") ?? "",
      });
    }
    snapshots.push({
      texts,
      xfrm,
      pics: doc.getElementsByTagNameNS(P_NS, "pic").length,
    });
  }
  return snapshots;
}

/**
 * Löser de aktiva slidernas filvägar i presentationsordning via
 * presentation.xml <p:sldIdLst> → r:id → presentation.xml.rels.
 *
 * OBS: pptx-automizer döper de tillagda sliddernas relations-id till "rIdNN-created"
 * (suffix ingår i både sldId och rels), så vi matchar hela attributvärdet — inte
 * bara "rId\d+". getAttributeNS för r:id ger värdet rakt av.
 */
async function resolveActiveSlides(zip: JSZip, parser: DOMParser): Promise<string[]> {
  const pres = parser.parseFromString(
    await zip.file("ppt/presentation.xml")!.async("string"),
    "application/xml",
  );
  const rels = parser.parseFromString(
    await zip.file("ppt/_rels/presentation.xml.rels")!.async("string"),
    "application/xml",
  );

  const ridToTarget = new Map<string, string>();
  const relNodes = rels.getElementsByTagName("Relationship");
  for (let i = 0; i < relNodes.length; i++) {
    const rel = relNodes[i];
    const id = rel.getAttribute("Id");
    const target = rel.getAttribute("Target");
    if (id && target && /^slides\/slide\d+\.xml$/.test(target)) {
      ridToTarget.set(id, `ppt/${target}`);
    }
  }

  const sldIds = pres.getElementsByTagNameNS(P_NS, "sldId");
  const paths: string[] = [];
  for (let i = 0; i < sldIds.length; i++) {
    const rId = sldIds[i].getAttributeNS(R_NS, "id");
    const target = rId ? ridToTarget.get(rId) : undefined;
    if (target) paths.push(target);
  }
  return paths;
}

describe("golden render — anbudsmall-v2 bitparitet", () => {
  it("matchar committad golden-snapshot (GOLDEN_UPDATE=1 för att regenerera)", async () => {
    const actual = await snapshotRender();
    if (process.env.GOLDEN_UPDATE === "1") {
      await writeFile(GOLDEN_PATH, JSON.stringify(actual, null, 2) + "\n", "utf8");
      return;
    }
    const golden = JSON.parse(await readFile(GOLDEN_PATH, "utf8"));
    expect(actual).toEqual(golden);
  });
});
