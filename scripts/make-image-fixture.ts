// scripts/make-image-fixture.ts
// Engångs-generator: npx tsx scripts/make-image-fixture.ts
// Skapar src/lib/pptx-template/__tests__/fixtures/bildmall.pptx ur
// templates/anbudsmall-v2.pptx genom att på slide 1 injicera:
//  - en <p:pic> som refererar en inbäddad 1x1-PNG (ny rel + media + content-type)
//  - en <p:sp> med <p:ph type="pic"/> (tom bildplaceholder)
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import JSZip from "jszip";

// Minimal giltig 1x1 röd PNG (base64) — ingen extern asset behövs.
const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const PIC_XML = `
<p:pic xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:nvPicPr>
    <p:cNvPr id="900" name="FixtureBild"/>
    <p:cNvPicPr/><p:nvPr/>
  </p:nvPicPr>
  <p:blipFill><a:blip r:embed="rIdFixtureImg"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>
  <p:spPr>
    <a:xfrm><a:off x="100000" y="100000"/><a:ext cx="914400" cy="914400"/></a:xfrm>
    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
  </p:spPr>
</p:pic>`;

const PH_PIC_XML = `
<p:sp xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
      xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:nvSpPr>
    <p:cNvPr id="901" name="FixtureBildPlaceholder"/>
    <p:cNvSpPr/><p:nvPr><p:ph type="pic" idx="99"/></p:nvPr>
  </p:nvSpPr>
  <p:spPr>
    <a:xfrm><a:off x="1200000" y="100000"/><a:ext cx="914400" cy="914400"/></a:xfrm>
  </p:spPr>
</p:sp>`;

async function main() {
  const zip = await JSZip.loadAsync(
    await readFile(path.resolve("templates", "anbudsmall-v2.pptx")),
  );
  zip.file("ppt/media/fixture-img.png", Buffer.from(PNG_1X1, "base64"));

  const ctPath = "[Content_Types].xml";
  let ct = await zip.file(ctPath)!.async("string");
  if (!ct.includes('Extension="png"')) {
    ct = ct.replace("</Types>", '<Default Extension="png" ContentType="image/png"/></Types>');
    zip.file(ctPath, ct);
  }

  const relPath = "ppt/slides/_rels/slide1.xml.rels";
  const relFile = zip.file(relPath);
  const fixtureRel =
    '<Relationship Id="rIdFixtureImg" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/fixture-img.png"/>';
  if (relFile) {
    let rels = await relFile.async("string");
    rels = rels.replace("</Relationships>", `${fixtureRel}</Relationships>`);
    zip.file(relPath, rels);
  } else {
    // Saknar slide1 .rels-fil — skapa standard-envelope med enbart bildrelationen.
    zip.file(
      relPath,
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        `${fixtureRel}</Relationships>`,
    );
  }

  const slidePath = "ppt/slides/slide1.xml";
  let slide = await zip.file(slidePath)!.async("string");
  slide = slide.replace("</p:spTree>", `${PIC_XML}${PH_PIC_XML}</p:spTree>`);
  zip.file(slidePath, slide);

  const outDir = path.resolve("src/lib/pptx-template/__tests__/fixtures");
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "bildmall.pptx"), await zip.generateAsync({ type: "nodebuffer" }));
  console.log("Skrev fixtures/bildmall.pptx");
}

main().catch((err) => { console.error(err); process.exit(1); });
