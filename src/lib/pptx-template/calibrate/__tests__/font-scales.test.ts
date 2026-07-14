import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { prefixKey, readFontScales, readFontScalesByPrefix } from "../font-scales";

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

describe("readFontScalesByPrefix", () => {
  it("maps text prefix → applied scale for marker-less decks", async () => {
    const buf = await pptxWith(SLIDE(SP("Prissättningen utgår från omfattningen", `<a:normAutofit fontScale="75000"/>`)));
    const scales = await readFontScalesByPrefix(buf, 20);
    expect(scales.get(prefixKey("Prissättningen utgår från omfattningen", 20))).toBe(75);
  });
  it("shapes without normAutofit are absent", async () => {
    const buf = await pptxWith(SLIDE(SP("Vanlig text", "")));
    expect((await readFontScalesByPrefix(buf)).size).toBe(0);
  });
  it("multi-paragraph shapes match COM-style \\r-separated text (whitespace-normalized keys)", async () => {
    // Two <a:p>: the XML run-join yields "Kort rad" + "Andra stycket fortsätter här"
    // with NO separator, while COM's TextRange.Text inserts \r at the paragraph
    // break. Both must land on the SAME map key or the scanner's autofit-shrink
    // lookup silently misses multi-paragraph shapes (Task 6 review finding).
    const twoParaSp = `<p:sp><p:txBody><a:bodyPr><a:normAutofit fontScale="70000"/></a:bodyPr><a:p><a:r><a:t>Kort rad</a:t></a:r></a:p><a:p><a:r><a:t>Andra stycket fortsätter här</a:t></a:r></a:p></p:txBody></p:sp>`;
    const scales = await readFontScalesByPrefix(await pptxWith(SLIDE(twoParaSp)));
    const key = prefixKey("Kort rad" + "Andra stycket fortsätter här");
    expect(scales.get(key)).toBe(70);
    // COM-side textPrefix carries \r — prefixKey must map it to the same key.
    expect(prefixKey("Kort rad\rAndra stycket fortsätter här")).toBe(key);
  });
});
