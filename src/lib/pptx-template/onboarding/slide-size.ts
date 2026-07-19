import JSZip from "jszip";
import { DOMParser } from "@xmldom/xmldom";
import { assertZipWithinLimits } from "../zip-guard";

const P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main";

/** 16:9-standard (12192000×6858000 EMU) — vår egen anbudsmall-v2:s format. */
export const DEFAULT_SLIDE_SIZE = { cx: 12192000, cy: 6858000 };

/**
 * Läser slide-ytan (EMU) ur ppt/presentation.xml <p:sldSz>. Wireframen ritas i
 * EMU-koordinater direkt (SVG viewBox), så det här är den enda dimensionsdatan
 * UI:t behöver. Fallback till 16:9 när attributet saknas/är trasigt — en fel
 * proportion är kosmetisk, inte korrupt.
 */
export async function readSlideSize(
  buffer: Buffer,
): Promise<{ cx: number; cy: number }> {
  const zip = await JSZip.loadAsync(buffer);
  assertZipWithinLimits(zip, "pptx");
  const xml = await zip.file("ppt/presentation.xml")?.async("string");
  if (!xml) return DEFAULT_SLIDE_SIZE;
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const el = doc.getElementsByTagNameNS(P_NS, "sldSz")[0];
  const cx = Number(el?.getAttribute("cx"));
  const cy = Number(el?.getAttribute("cy"));
  return Number.isFinite(cx) && cx > 0 && Number.isFinite(cy) && cy > 0
    ? { cx, cy }
    : DEFAULT_SLIDE_SIZE;
}
