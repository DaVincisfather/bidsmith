import { describe, it, expect } from "vitest";
import { buildMiniPptx } from "../../introspect/__tests__/mini-pptx";
import { readSlideSize, DEFAULT_SLIDE_SIZE } from "../slide-size";

const SLIDE = `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree>
  </p:spTree></p:cSld></p:sld>`;

describe("readSlideSize", () => {
  it("läser sldSz ur presentation.xml", async () => {
    // mini-pptx:ens presentationXmlOverride — bygg en med explicit sldSz.
    const presentationXml = `<?xml version="1.0"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst>
  <p:sldSz cx="9144000" cy="6858000"/>
</p:presentation>`;
    const pptx = await buildMiniPptx(SLIDE, presentationXml);
    expect(await readSlideSize(pptx)).toEqual({ cx: 9144000, cy: 6858000 });
  });

  it("faller tillbaka till 16:9-default när sldSz saknas", async () => {
    const pptx = await buildMiniPptx(SLIDE); // default-presentation.xml utan sldSz
    expect(await readSlideSize(pptx)).toEqual(DEFAULT_SLIDE_SIZE);
  });

  it("faller tillbaka till 16:9-default när sldSz är trasig", async () => {
    // cx="0" (ej > 0) och cy="abc" (ej finit tal) — täcker båda ogiltighetsgrenarna.
    const presentationXml = `<?xml version="1.0"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst>
  <p:sldSz cx="0" cy="abc"/>
</p:presentation>`;
    const pptx = await buildMiniPptx(SLIDE, presentationXml);
    expect(await readSlideSize(pptx)).toEqual(DEFAULT_SLIDE_SIZE);
  });
});
