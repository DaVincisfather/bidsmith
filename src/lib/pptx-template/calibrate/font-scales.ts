import JSZip from "jszip";
import { DOMParser } from "@xmldom/xmldom";
import { resolveSlidePaths } from "../introspect/read-pptx";
import { markerOf } from "../measure/verdicts";

const A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main";

/**
 * Reads PowerPoint's APPLIED autofit shrink out of the recalculated copy that
 * measure-overflow.ps1 saved: SaveAs materializes <a:normAutofit fontScale="…">
 * (thousandths of a percent) for every shrunk box. Keyed by the calibration
 * marker in the shape's text — index-free, same trick as the measurement side.
 * Only shapes WITH a normAutofit element appear (others overflow, not shrink).
 */
export async function readFontScales(recalcPptx: Buffer): Promise<Map<string, number>> {
  const zip = await JSZip.loadAsync(recalcPptx);
  const parser = new DOMParser();
  const scales = new Map<string, number>();

  for (const slidePath of await resolveSlidePaths(zip, parser)) {
    const xml = await zip.file(slidePath)?.async("string");
    // Missing slide entry is skipped deliberately: resolveSlidePaths only lists
    // entries from presentation.xml, so absence = corrupt zip — calibration
    // degrades to the geometry fallback rather than aborting the round.
    if (!xml) continue;
    const doc = parser.parseFromString(xml, "application/xml");
    const spNodes = doc.getElementsByTagNameNS(P_NS, "sp");
    for (let i = 0; i < spNodes.length; i++) {
      const sp = spNodes[i];
      const texts = sp.getElementsByTagNameNS(A_NS, "t");
      let joined = "";
      for (let j = 0; j < texts.length; j++) joined += texts[j].textContent ?? "";
      const marker = markerOf(joined);
      if (!marker) continue;
      const autofits = sp.getElementsByTagNameNS(A_NS, "normAutofit");
      if (autofits.length === 0) continue;
      const raw = autofits[0].getAttribute("fontScale");
      // Duplicate markers are last-write-wins (markers are template-unique by
      // instrumentation, so this is theoretical).
      scales.set(marker, raw ? Number(raw) / 1000 : 100);
    }
  }
  return scales;
}
