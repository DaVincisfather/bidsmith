// Delad testhjälpare: löser de AKTIVA slidernas filvägar ur en renderad .pptx.
//
// pptx-automizer APPENDERAR de renderade sliderna i arkivet och avlistar bara
// originalen i presentation.xml — Object.keys(zip.files) innehåller därför både
// orphans och aktiva slides. Vi följer presentation.xml → sldIdLst → r:id → rels
// för att få exakt de slides den utgående decken visar, i presentationsordning.
//
// OBS: pptx-automizer döper de tillagda slidernas relations-id till "rIdNN-created"
// (suffix ingår i både sldId och rels), så vi matchar hela attributvärdet via
// getAttributeNS — inte bara "rId\d+".
import type JSZip from "jszip";
import { DOMParser } from "@xmldom/xmldom";

const P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main";
const R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

/**
 * Löser de aktiva slidernas filvägar (`ppt/slides/slideN.xml`) i
 * presentationsordning via presentation.xml <p:sldIdLst> → r:id → rels.
 */
export async function resolveActiveSlides(
  zip: JSZip,
  parser: DOMParser = new DOMParser(),
): Promise<string[]> {
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
