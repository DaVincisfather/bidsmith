import JSZip from "jszip";

// Test-support: bygger en minimal in-memory pptx med exakt de entries läsaren rör:
// presentation.xml (sldIdLst + r:id per slide), dess rels (r:id → slide-target) och
// själva slide-XML:erna. Täcker även zip-plumbingen (loadAsync/readEntry).
// Delas mellan read-pptx- och compute-budgets-testen.

// En enda slide (eller en array). Single-slide-formen behåller bakåtkompatibel
// signatur för read-pptx-testen; array-formen ger compute-budgets multi-slide.
export async function buildMiniPptx(
  slideXmls: string | string[],
  presentationXmlOverride?: string,
): Promise<Buffer> {
  const slides = Array.isArray(slideXmls) ? slideXmls : [slideXmls];

  const sldIds = slides
    .map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`)
    .join("\n    ");
  const presentationXml =
    presentationXmlOverride ??
    `<?xml version="1.0"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst>
    ${sldIds}
  </p:sldIdLst>
</p:presentation>`;

  const relationships = slides
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide"
    Target="slides/slide${i + 1}.xml"/>`,
    )
    .join("\n  ");
  const relsXml = `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${relationships}
</Relationships>`;

  const zip = new JSZip();
  zip.file("ppt/presentation.xml", presentationXml);
  zip.file("ppt/_rels/presentation.xml.rels", relsXml);
  for (let i = 0; i < slides.length; i++) {
    zip.file(`ppt/slides/slide${i + 1}.xml`, slides[i]);
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

// Bygger en slide med en enda <p:sp> kring godtyckligt spPr/txBody-innehåll.
export function slideWithShape(inner: string): string {
  return `<?xml version="1.0"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:sp>${inner}</p:sp>
  </p:spTree></p:cSld>
</p:sld>`;
}
