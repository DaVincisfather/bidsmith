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

  it("ifylld bildplaceholder (<p:pic> med inre ph type='pic') räknas bara som placed", () => {
    const xml = `<?xml version="1.0"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:pic><p:nvPicPr><p:cNvPr id="5" name="Ifylld placeholder"/>
      <p:nvPr><p:ph type="pic" idx="1"/></p:nvPr></p:nvPicPr></p:pic>
    <p:sp><p:nvSpPr><p:nvPr><p:ph type="pic" idx="2"/></p:nvPr></p:nvSpPr></p:sp>
  </p:spTree></p:cSld>
</p:sld>`;
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    expect(countImages(doc)).toEqual({ placed: 1, placeholders: 1 });
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

  it("flaggar inGroup för shapes inuti <p:grpSp> men inte topp-nivå-shapes (index i dokumentordning oförändrade)", async () => {
    // Topp-nivå <p:sp> följt av en <p:grpSp> med en inre <p:sp>. Båda hittas av
    // den rekursiva getElementsByTagNameNS i dokumentordning → shapeIndex 0/1.
    const slide = `<?xml version="1.0"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:sp>
      <p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></a:xfrm></p:spPr>
      <p:txBody><a:p><a:r><a:t>Topp</a:t></a:r></a:p></p:txBody>
    </p:sp>
    <p:grpSp>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="500" cy="500"/>
        <a:chOff x="0" y="0"/><a:chExt cx="500" cy="500"/></a:xfrm></p:grpSpPr>
      <p:sp>
        <p:spPr><a:xfrm><a:off x="10" y="10"/><a:ext cx="50" cy="50"/></a:xfrm></p:spPr>
        <p:txBody><a:p><a:r><a:t>Grupperad</a:t></a:r></a:p></p:txBody>
      </p:sp>
    </p:grpSp>
  </p:spTree></p:cSld>
</p:sld>`;
    const slides = await readPptxSlides(await buildMiniPptx(slide));
    expect(slides[0].shapes).toHaveLength(2);
    expect(slides[0].shapes[0].paragraphs).toEqual(["Topp"]);
    expect(slides[0].shapes[0].inGroup).toBe(false);
    expect(slides[0].shapes[1].paragraphs).toEqual(["Grupperad"]);
    expect(slides[0].shapes[1].inGroup).toBe(true);
    // read-pptx bevarar shapens egen (grupp-lokala) geometri — det är wireframe-
    // bygget som droppar den; här verifieras bara flaggan + index-ordningen.
    expect(slides[0].shapes[1].geometry).not.toBeNull();
  });

  it("kastar svenskt fel när presentation.xml saknas", async () => {
    const zip = new JSZip();
    zip.file("ppt/_rels/presentation.xml.rels", "<Relationships/>");
    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    await expect(readPptxSlides(buffer)).rejects.toThrow(/PPTX saknar/);
  });
});

describe("readPptxSlides — a:tbl-tabeller (syntetisk mini-pptx)", () => {
  it("läser en tabell (2 kolumner, rubrikrad + mallrad) till tables[0]", async () => {
    const slide = `<?xml version="1.0"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:graphicFrame>
      <p:xfrm><a:off x="914400" y="1828800"/><a:ext cx="7315200" cy="1524000"/></p:xfrm>
      <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">
        <a:tbl>
          <a:tblGrid>
            <a:gridCol w="3657600"/>
            <a:gridCol w="3657600"/>
          </a:tblGrid>
          <a:tr h="365760">
            <a:tc><a:txBody><a:p><a:r><a:t>Krav</a:t></a:r></a:p></a:txBody></a:tc>
            <a:tc><a:txBody><a:p><a:r><a:t>Uppfyllnad</a:t></a:r></a:p></a:txBody></a:tc>
          </a:tr>
          <a:tr h="457200">
            <a:tc><a:txBody><a:p><a:r><a:t>{Krav 1}</a:t></a:r></a:p></a:txBody></a:tc>
            <a:tc><a:txBody><a:p><a:r><a:t>{Uppfyllnad 1}</a:t></a:r></a:p></a:txBody></a:tc>
          </a:tr>
        </a:tbl>
      </a:graphicData></a:graphic>
    </p:graphicFrame>
  </p:spTree></p:cSld>
</p:sld>`;
    const slides = await readPptxSlides(await buildMiniPptx(slide));
    expect(slides[0].tables).toHaveLength(1);
    const table = slides[0].tables[0];
    expect(table.frameIndex).toBe(0);
    expect(table.geometry).toEqual({ xEmu: 914400, yEmu: 1828800, cxEmu: 7315200, cyEmu: 1524000 });
    expect(table.gridColsEmu).toEqual([3657600, 3657600]);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]).toEqual({
      heightEmu: 365760,
      cells: [{ text: "Krav" }, { text: "Uppfyllnad" }],
    });
    expect(table.rows[1]).toEqual({
      heightEmu: 457200,
      cells: [{ text: "{Krav 1}" }, { text: "{Uppfyllnad 1}" }],
    });
  });

  it("cellens txBody-paragrafer joinas med \\n (samma paragraf-läsning som shape-text)", async () => {
    const slide = `<?xml version="1.0"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:graphicFrame>
      <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">
        <a:tbl>
          <a:tblGrid><a:gridCol w="1000"/></a:tblGrid>
          <a:tr h="200">
            <a:tc><a:txBody>
              <a:p><a:r><a:t>Rad ett</a:t></a:r></a:p>
              <a:p><a:r><a:t>Rad två</a:t></a:r></a:p>
            </a:txBody></a:tc>
          </a:tr>
        </a:tbl>
      </a:graphicData></a:graphic>
    </p:graphicFrame>
  </p:spTree></p:cSld>
</p:sld>`;
    const slides = await readPptxSlides(await buildMiniPptx(slide));
    expect(slides[0].tables[0].rows[0].cells[0].text).toBe("Rad ett\nRad två");
    // Ingen p:xfrm på frame ⇒ ärvd geometri, inte en tyst nollyta.
    expect(slides[0].tables[0].geometry).toBeNull();
  });

  it("slide utan tabell ⇒ tables: [] och shapes/tokens/images opåverkade", async () => {
    const slide = slideWithShape(`
      <p:txBody><a:p><a:r><a:t>{Mål}</a:t></a:r></a:p></p:txBody>`);
    const slides = await readPptxSlides(await buildMiniPptx(slide));
    expect(slides[0].tables).toEqual([]);
    expect(slides[0].shapes).toHaveLength(1);
  });

  it("frameIndex räknar bara graphicFrames som innehåller en a:tbl, i dokumentordning; shapes-indexeringen är oberörd", async () => {
    const slide = `<?xml version="1.0"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:sp>
      <p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></a:xfrm></p:spPr>
      <p:txBody><a:p><a:r><a:t>{Rubrik}</a:t></a:r></a:p></p:txBody>
    </p:sp>
    <p:graphicFrame>
      <p:xfrm><a:off x="1" y="1"/><a:ext cx="2" cy="2"/></p:xfrm>
      <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">
        <a:tbl>
          <a:tblGrid><a:gridCol w="1000"/></a:tblGrid>
          <a:tr h="200"><a:tc><a:txBody><a:p><a:r><a:t>Första</a:t></a:r></a:p></a:txBody></a:tc></a:tr>
        </a:tbl>
      </a:graphicData></a:graphic>
    </p:graphicFrame>
    <p:sp>
      <p:txBody><a:p><a:r><a:t>{Fotnot}</a:t></a:r></a:p></p:txBody>
    </p:sp>
    <p:graphicFrame>
      <p:xfrm><a:off x="3" y="3"/><a:ext cx="4" cy="4"/></p:xfrm>
      <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">
        <a:tbl>
          <a:tblGrid><a:gridCol w="1000"/></a:tblGrid>
          <a:tr h="200"><a:tc><a:txBody><a:p><a:r><a:t>Andra</a:t></a:r></a:p></a:txBody></a:tc></a:tr>
        </a:tbl>
      </a:graphicData></a:graphic>
    </p:graphicFrame>
  </p:spTree></p:cSld>
</p:sld>`;
    const slides = await readPptxSlides(await buildMiniPptx(slide));
    // shapes-indexeringen (endast p:sp) är helt oberörd av graphicFrames.
    expect(slides[0].shapes).toHaveLength(2);
    expect(slides[0].shapes[0].tokens).toEqual(["{Rubrik}"]);
    expect(slides[0].shapes[1].tokens).toEqual(["{Fotnot}"]);
    // tables räknas separat, dokumentordning bland graphicFrames med a:tbl.
    expect(slides[0].tables).toHaveLength(2);
    expect(slides[0].tables[0].frameIndex).toBe(0);
    expect(slides[0].tables[0].rows[0].cells[0].text).toBe("Första");
    expect(slides[0].tables[1].frameIndex).toBe(1);
    expect(slides[0].tables[1].rows[0].cells[0].text).toBe("Andra");
  });

  it("frameIndex hoppar över graphicFrames UTAN a:tbl (t.ex. inbäddat chart) — de räknas inte alls", async () => {
    const slide = `<?xml version="1.0"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:graphicFrame>
      <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
        <c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId1"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
      </a:graphicData></a:graphic>
    </p:graphicFrame>
    <p:graphicFrame>
      <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">
        <a:tbl>
          <a:tblGrid><a:gridCol w="1000"/></a:tblGrid>
          <a:tr h="200"><a:tc><a:txBody><a:p><a:r><a:t>Enda</a:t></a:r></a:p></a:txBody></a:tc></a:tr>
        </a:tbl>
      </a:graphicData></a:graphic>
    </p:graphicFrame>
  </p:spTree></p:cSld>
</p:sld>`;
    const slides = await readPptxSlides(await buildMiniPptx(slide));
    expect(slides[0].tables).toHaveLength(1);
    expect(slides[0].tables[0].frameIndex).toBe(0);
  });
});
