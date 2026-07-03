import JSZip from "jszip";
import { DOMParser, type Element } from "@xmldom/xmldom";
import { resolveActiveSlides } from "./active-slides";

/**
 * Shared golden snapshot of a rendered deck. Used by BOTH golden-render.test.ts
 * (type-driven path) and golden-render-profile.test.ts (profile-driven path) so
 * the two assert bit-parity against the same extraction — a copy-pasted
 * snapshotter could drift silently and quietly weaken the parity gate.
 */

const A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main";

export interface SlideSnapshot {
  /** Alla <a:t>-texter i dokumentordning */
  texts: string[];
  /** Alla <a:off>/<a:ext>-attribut i dokumentordning — fångar geometri-mutationer
   *  (timeline-highlight, footer-breddning) */
  xfrm: { x: string; y: string; cx: string; cy: string }[];
  /** Antal <p:pic> — pinnar att rendering varken tappar eller skapar bilder
   *  (designmallen: 0 överallt; kontraktet gäller alla mallar) */
  pics: number;
}

/**
 * Extracts the per-slide snapshot from a rendered pptx buffer, following
 * presentation.xml → sldIdLst → r:id → rels to snapshot exactly the active
 * slides in presentation order (pptx-automizer leaves orphaned originals in the
 * archive; a filename regex would snapshot junk).
 */
export async function snapshotSlides(buffer: Buffer): Promise<SlideSnapshot[]> {
  const zip = await JSZip.loadAsync(buffer);
  const parser = new DOMParser();
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
