// @vitest-environment node
//
// Bildbevarande-kontrakt: rendering får aldrig tappa eller skapa bilder.
// Designmallen (anbudsmall-v2) saknar bilder, så vi använder en genererad
// fixtur (bildmall.pptx, se scripts/make-image-fixture.ts) där slide 1 har
// fått en placerad <p:pic> och en tom <p:ph type="pic"/>.
//
// Två kontroll-led:
//  1. introspectTemplate räknar cover-slidens bildytor till { placed:1, placeholders:1 }.
//  2. renderTemplate behåller exakt 1 <p:pic> (med r:embed) och 1 fristående
//     <p:ph type="pic"> på den AKTIVA cover-sliden, och media-bytsen är oförändrade.
//
// Om pptx-automizer tappar bilden eller relationen vid slide-kopiering är det ett
// REELLT fynd — testet faller och bildkontraktet är brutet.
import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import path from "path";
import JSZip from "jszip";
import { DOMParser, type Element } from "@xmldom/xmldom";
import { renderTemplate } from "../loader";
import { introspectTemplate } from "../introspect";
import { GOLDEN_SECTIONS, GOLDEN_MASTER } from "./fixtures/golden-sections";
import { resolveActiveSlides } from "./fixtures/active-slides";

const FIXTURE = path.resolve(
  "src/lib/pptx-template/__tests__/fixtures/bildmall.pptx",
);
const A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main";
const R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const FIXTURE_MEDIA = "ppt/media/fixture-img.png";

describe("bildbevarande — bildmall-fixtur", () => {
  it("introspektion räknar cover-slidens bildytor till { placed: 1, placeholders: 1 }", async () => {
    const buf = await readFile(FIXTURE);
    const { manifest } = await introspectTemplate(buf, "bildmall");
    const cover = manifest.slides.find((s) => s.type === "cover");
    expect(cover?.imageShapes).toEqual({ placed: 1, placeholders: 1 });
  });

  it("rendering behåller bild, placeholder och media-bytes på aktiva cover-sliden", async () => {
    const fixtureBuf = await readFile(FIXTURE);
    const { manifest } = await introspectTemplate(fixtureBuf, "bildmall");

    const out = await renderTemplate(
      { manifest, templateFile: FIXTURE },
      GOLDEN_SECTIONS,
      GOLDEN_MASTER,
    );

    const parser = new DOMParser();
    const zip = await JSZip.loadAsync(out);
    const slidePaths = await resolveActiveSlides(zip, parser);

    // Cover-sliden är den första i presentationsordningen (manifest-slide source 1).
    expect(slidePaths.length).toBeGreaterThan(0);
    const coverPath = slidePaths[0];
    const coverDoc = parser.parseFromString(
      await zip.file(coverPath)!.async("string"),
      "application/xml",
    );

    // Exakt 1 <p:pic> med ett r:embed bevarat.
    const pics = coverDoc.getElementsByTagNameNS(P_NS, "pic");
    expect(pics.length).toBe(1);
    const blips = (pics[0] as Element).getElementsByTagNameNS(A_NS, "blip");
    expect(blips.length).toBe(1);
    expect(blips[0].getAttributeNS(R_NS, "embed")).toBeTruthy();

    // Exakt 1 fristående <p:ph type="pic"> (inuti <p:sp>).
    const phNodes = coverDoc.getElementsByTagNameNS(P_NS, "ph");
    let picPlaceholders = 0;
    for (let i = 0; i < phNodes.length; i++) {
      if (phNodes[i].getAttribute("type") === "pic") picPlaceholders++;
    }
    expect(picPlaceholders).toBe(1);

    // Media-bytsen i output är byte-identiska med fixturens.
    const fixtureZip = await JSZip.loadAsync(fixtureBuf);
    const fixtureMedia = await fixtureZip.file(FIXTURE_MEDIA)!.async("nodebuffer");
    const outMediaFile = zip.file(FIXTURE_MEDIA);
    expect(outMediaFile).not.toBeNull();
    const outMedia = await outMediaFile!.async("nodebuffer");
    expect(outMedia.equals(fixtureMedia)).toBe(true);
  });
});
