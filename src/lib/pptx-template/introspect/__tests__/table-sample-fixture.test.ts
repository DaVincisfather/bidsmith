import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "fs/promises";
import path from "path";
import { readPptxSlides, type SlideShapes } from "../read-pptx";

// Committed fixture (src/lib/pptx-template/__tests__/fixtures/table-sample.pptx),
// produced by scripts/generate-table-sample.ts (npx tsx scripts/generate-table-sample.ts).
// Unlike the mini-pptx synthetic XML used elsewhere in read-pptx.test.ts, this is a
// REAL, PowerPoint-openable pptx package (real theme/master/layout/content-types,
// derived from templates/anbudsmall-v2.pptx) with a genuine <a:tbl> inside a
// <p:graphicFrame> — this test doubles as an end-to-end proof of Task 1's reader
// against a real file, not just hand-built XML fragments.
const FIXTURE = path.resolve(
  "src/lib/pptx-template/__tests__/fixtures/table-sample.pptx",
);

describe("readPptxSlides (table-sample.pptx fixture — real a:tbl)", () => {
  let slides: SlideShapes[];
  beforeAll(async () => {
    slides = await readPptxSlides(await readFile(FIXTURE));
  });

  it("har exakt 2 slides i presentationsordning", () => {
    expect(slides).toHaveLength(2);
    expect(slides.map((s) => s.source)).toEqual([1, 2]);
  });

  it("slide 1 är en prosa-slide: en textbox, ingen tabell", () => {
    const slide1 = slides[0];
    expect(slide1.tables).toEqual([]);
    expect(slide1.shapes).toHaveLength(1);
    expect(slide1.shapes[0].paragraphs.join(" ")).toContain("erbjudande");
  });

  it("slide 2 har exakt 1 äkta a:tbl-tabell (inte textboxar)", () => {
    const slide2 = slides[1];
    expect(slide2.tables).toHaveLength(1);
    // Tabellslidens graphicFrame är inte en <p:sp> — shapes[] ska vara opåverkad.
    expect(slide2.shapes).toHaveLength(0);
  });

  it("tabellen har 4 gridCols med kända EMU-bredder, krav-kolumnen bredast", () => {
    const table = slides[1].tables[0];
    expect(table.gridColsEmu).toEqual([4572000, 1524000, 1828800, 914400]);
    expect(table.gridColsEmu[0]).toBeGreaterThan(Math.max(...table.gridColsEmu.slice(1)));
  });

  it("tabellen har 2 rader med explicita a:tr@h-värden", () => {
    const table = slides[1].tables[0];
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0].heightEmu).toBe(370840);
    expect(table.rows[1].heightEmu).toBe(370840);
  });

  it("rubrikraden har rätt celltexter: Krav | Uppfyllnad | Referens | Status", () => {
    const table = slides[1].tables[0];
    expect(table.rows[0].cells.map((c) => c.text)).toEqual([
      "Krav",
      "Uppfyllnad",
      "Referens",
      "Status",
    ]);
  });

  it("mallraden har exempeltexter i alla 4 celler", () => {
    const table = slides[1].tables[0];
    expect(table.rows[1].cells).toHaveLength(4);
    expect(table.rows[1].cells.map((c) => c.text)).toEqual([
      "Minst 5 års erfarenhet av strategisk rådgivning",
      "Uppfylls, se bilaga 3",
      "Bilaga 3",
      "Uppfyllt",
    ]);
  });

  it("tabell-framen är positionerad med meningsfullt utrymme kvar under sig på sliden", () => {
    const table = slides[1].tables[0];
    expect(table.geometry).not.toBeNull();
    expect(table.geometry!.yEmu).toBe(1500000);
    // Standardstorlek på anbudsmall-v2 är cy=10287000 EMU (18288000x10287000) —
    // hämta faktisk slidehöjd hade krävt att exponera presentation.xml:s sldSz
    // ur läsaren, vilket introspektionen medvetet inte gör (out of scope för
    // Task 1). Vi verifierar istället direkt mot den kända fixture-geometrin:
    // tabellens botten (y + cy) lämnar gott om utrymme kvar under den.
    const tableBottomEmu = table.geometry!.yEmu + table.geometry!.cyEmu;
    expect(tableBottomEmu).toBeLessThan(3000000);
  });
});
