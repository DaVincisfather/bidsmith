import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "fs/promises";
import path from "path";
import JSZip from "jszip";
import { DOMParser } from "@xmldom/xmldom";
import { readPptxSlides, countImages, type SlideShapes } from "../read-pptx";
import { buildMiniPptx, slideWithShape } from "./mini-pptx";

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

  it("läser autofit ur <a:bodyPr>: {Mål}-rutan saknar autofit (null), s6/s11-boxar är normAutofit", () => {
    // {Mål}-rutan (objective) har ingen <a:*Autofit> → null. Då är geometrin
    // bindande och hybridmodellen kalibrerar budgeten geometriskt.
    const mal = slides[6].shapes.find((sh) => sh.tokens.includes("{Mål}"));
    expect(mal!.autofit).toBeNull();
    // De enradiga rutorna på overview (slide 6) och avstämningar (slide 11) har
    // normAutofit — PowerPoint krymper texten, geometrin är inte bindande.
    const namn = slides[5].shapes.find((sh) => sh.tokens.includes("{Fas 1 — namn}"));
    expect(namn!.autofit).toBe("norm");
    const avstamning = slides[10].shapes.find((sh) =>
      sh.tokens.includes("{Avstämning 1 — tidpunkt och innehåll}"),
    );
    expect(avstamning!.autofit).toBe("norm");
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

  it("läser autofit='norm' ur <a:normAutofit> och null när <a:bodyPr> saknar autofit-barn", async () => {
    const withNorm = slideWithShape(`
      <p:txBody>
        <a:bodyPr><a:normAutofit fontScale="90000"/></a:bodyPr>
        <a:p><a:r><a:t>{Mål}</a:t></a:r></a:p>
      </p:txBody>`);
    const withoutAutofit = slideWithShape(`
      <p:txBody>
        <a:bodyPr/>
        <a:p><a:r><a:t>{Mål}</a:t></a:r></a:p>
      </p:txBody>`);
    const a = await readPptxSlides(await buildMiniPptx(withNorm));
    const b = await readPptxSlides(await buildMiniPptx(withoutAutofit));
    expect(a[0].shapes[0].autofit).toBe("norm");
    expect(b[0].shapes[0].autofit).toBeNull();
  });

  it("kastar svenskt fel när presentation.xml saknas", async () => {
    const zip = new JSZip();
    zip.file("ppt/_rels/presentation.xml.rels", "<Relationships/>");
    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    await expect(readPptxSlides(buffer)).rejects.toThrow(/PPTX saknar/);
  });
});
