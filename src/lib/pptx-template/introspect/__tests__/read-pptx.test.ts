import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "fs/promises";
import path from "path";
import JSZip from "jszip";
import { DOMParser } from "@xmldom/xmldom";
import { readPptxSlides, countImages, type SlideShapes } from "../read-pptx";

const TEMPLATE = path.resolve("templates", "anbudsmall-v2.pptx");

describe("readPptxSlides (anbudsmall-v2.pptx)", () => {
  let slides: SlideShapes[];
  beforeAll(async () => {
    slides = await readPptxSlides(await readFile(TEMPLATE));
  });

  it("läser alla 17 slides i presentationsordning", () => {
    expect(slides).toHaveLength(17);
    expect(slides.map((s) => s.source)).toEqual(
      Array.from({ length: 17 }, (_, i) => i + 1),
    );
  });

  it("hittar cover-tokens på slide 1", () => {
    expect(slides[0].tokens).toEqual(
      expect.arrayContaining(["{Upphandlingens namn}", "{Kundnamn}", "{Anbudsdatum}"]),
    );
  });

  it("hittar phase-detail-tokens på slide 7, inkl. split-run-placeholders", () => {
    // {Aktiviteter}/{Leveranser} splittras av PowerPoints rättstavning över
    // flera <a:r>-runs — paragraf-konkatenering krävs (samma trick som
    // replaceParagraphTextNodes i _footer.ts).
    expect(slides[6].tokens).toEqual(
      expect.arrayContaining([
        "{Mål}",
        "{Aktiviteter}",
        "{Leveranser}",
        "{Beslut}",
        "{Fas 1 — namn}",
        "{M1–M2}",
      ]),
    );
  });

  it("ger geometri och fontstorlek för shapen som bär {Mål}", () => {
    const shape = slides[6].shapes.find((sh) => sh.tokens.includes("{Mål}"));
    expect(shape).toBeDefined();
    expect(shape!.geometry).not.toBeNull();
    expect(shape!.geometry!.cx).toBeGreaterThan(0);
    expect(shape!.geometry!.cy).toBeGreaterThan(0);
    expect(shape!.fontSizePt).toBeGreaterThan(4);
    expect(shape!.fontSizePt).toBeLessThan(100);
  });

  it("designmallen har inga bildytor (verifierat 2026-06-12 — den är vektor/text)", () => {
    for (const s of slides) {
      expect(s.images).toEqual({ placed: 0, placeholders: 0 });
    }
  });
});

describe("countImages (syntetisk slide-XML)", () => {
  it("räknar <p:pic> och <p:ph type='pic'> men inte text-placeholders", () => {
    const xml = `<?xml version="1.0"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:pic><p:nvPicPr><p:cNvPr id="5" name="Bild 1"/></p:nvPicPr></p:pic>
    <p:pic><p:nvPicPr><p:cNvPr id="6" name="Bild 2"/></p:nvPicPr></p:pic>
    <p:sp><p:nvSpPr><p:nvPr><p:ph type="pic" idx="1"/></p:nvPr></p:nvSpPr></p:sp>
    <p:sp><p:nvSpPr><p:nvPr><p:ph type="body" idx="2"/></p:nvPr></p:nvSpPr></p:sp>
  </p:spTree></p:cSld>
</p:sld>`;
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    expect(countImages(doc)).toEqual({ placed: 2, placeholders: 1 });
  });
});

// Bygger en minimal in-memory pptx med exakt de tre entries läsaren rör:
// presentation.xml (sldIdLst + r:id), dess rels (r:id → slide-target) och
// själva sliden. Täcker även zip-plumbingen (loadAsync/readEntry).
async function buildMiniPptx(
  slideXml: string,
  presentationXmlOverride?: string,
): Promise<Buffer> {
  const presentationXml =
    presentationXmlOverride ??
    `<?xml version="1.0"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst>
</p:presentation>`;
  const relsXml = `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide"
    Target="slides/slide1.xml"/>
</Relationships>`;
  const zip = new JSZip();
  zip.file("ppt/presentation.xml", presentationXml);
  zip.file("ppt/_rels/presentation.xml.rels", relsXml);
  zip.file("ppt/slides/slide1.xml", slideXml);
  return zip.generateAsync({ type: "nodebuffer" });
}

// Bygger en slide med en enda <p:sp> kring godtyckligt spPr/txBody-innehåll.
function slideWithShape(inner: string): string {
  return `<?xml version="1.0"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:sp>${inner}</p:sp>
  </p:spTree></p:cSld>
</p:sld>`;
}

describe("readPptxSlides (syntetisk mini-pptx)", () => {
  it("ger geometry=null när xfrm:s <a:off> saknar x-attribut (ingen tyst nollyta)", async () => {
    const slide = slideWithShape(`
      <p:spPr><a:xfrm>
        <a:off y="100"/>
        <a:ext cx="200" cy="300"/>
      </a:xfrm></p:spPr>
      <p:txBody><a:p><a:r><a:t>{Mål}</a:t></a:r></a:p></p:txBody>`);
    const slides = await readPptxSlides(await buildMiniPptx(slide));
    expect(slides[0].shapes[0].geometry).toBeNull();
  });

  it("faller tillbaka till presentationens defaultTextStyle-sz när shapen saknar egen sz", async () => {
    const presentationXml = `<?xml version="1.0"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
                xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst>
  <p:defaultTextStyle><a:lvl1pPr><a:defRPr sz="2000"/></a:lvl1pPr></p:defaultTextStyle>
</p:presentation>`;
    const slide = slideWithShape(`
      <p:txBody><a:p><a:r><a:t>{Mål}</a:t></a:r></a:p></p:txBody>`);
    const slides = await readPptxSlides(await buildMiniPptx(slide, presentationXml));
    expect(slides[0].shapes[0].fontSizePt).toBe(20);
  });

  it("kastar svenskt fel när presentation.xml saknas", async () => {
    const zip = new JSZip();
    zip.file("ppt/_rels/presentation.xml.rels", "<Relationships/>");
    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    await expect(readPptxSlides(buffer)).rejects.toThrow(/PPTX saknar/);
  });
});
