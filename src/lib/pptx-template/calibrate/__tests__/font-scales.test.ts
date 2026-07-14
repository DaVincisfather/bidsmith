import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { readFontScales } from "../font-scales";

const SLIDE = (body: string) => `<?xml version="1.0"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>${body}</p:spTree></p:cSld></p:sld>`;
const SP = (text: string, autofit: string) => `<p:sp><p:txBody>
  <a:bodyPr>${autofit}</a:bodyPr><a:p><a:r><a:t>${text}</a:t></a:r></a:p>
</p:txBody></p:sp>`;

async function pptxWith(slideXml: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("ppt/presentation.xml", `<?xml version="1.0"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Target="slides/slide1.xml"/></Relationships>`);
  zip.file("ppt/slides/slide1.xml", slideXml);
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

describe("readFontScales", () => {
  it("maps marker → applied font scale percent", async () => {
    const buf = await pptxWith(SLIDE(SP("«Om oss» text", `<a:normAutofit fontScale="62500"/>`)));
    const scales = await readFontScales(buf);
    expect(scales.get("Om oss")).toBe(62.5);
  });

  it("normAutofit without fontScale means 100%", async () => {
    const buf = await pptxWith(SLIDE(SP("«A» text", `<a:normAutofit/>`)));
    expect((await readFontScales(buf)).get("A")).toBe(100);
  });

  it("shapes without markers or without normAutofit are absent", async () => {
    const buf = await pptxWith(SLIDE(SP("statisk", `<a:normAutofit fontScale="50000"/>`) + SP("«B» text", "")));
    const scales = await readFontScales(buf);
    expect(scales.size).toBe(0);
  });
});
