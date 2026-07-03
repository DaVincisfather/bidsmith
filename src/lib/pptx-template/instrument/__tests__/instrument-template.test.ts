// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readPptxSlides } from "../../introspect/read-pptx";
import { buildMiniPptx } from "../../introspect/__tests__/mini-pptx";
import { instrumentTemplate, type TokenInjection } from "../instrument-template";

// The whole verification is a round-trip through the REAL readPptxSlides:
// introspection must see exactly what instrumentation wrote, addressed by the
// same (source, shapeIndex) the reader reports.

// A slide carrying an arbitrary number of <p:sp> shapes (mini-pptx's
// slideWithShape only builds one). Each entry is the inner XML of one <p:sp>.
function slideWithShapes(shapeInners: string[]): string {
  const sps = shapeInners.map((s) => `<p:sp>${s}</p:sp>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    ${sps}
  </p:spTree></p:cSld>
</p:sld>`;
}

// Shape 0: geometry + two paragraphs, first paragraph split across two runs,
// first run sized 16pt. The primary injection target.
const SHAPE_MULTIPARA = `
  <p:spPr><a:xfrm><a:off x="100" y="200"/><a:ext cx="3000" cy="4000"/></a:xfrm></p:spPr>
  <p:txBody>
    <a:bodyPr/>
    <a:p><a:pPr algn="ctr"/><a:r><a:rPr sz="1600"/><a:t>Första</a:t></a:r><a:r><a:rPr/><a:t> raden</a:t></a:r></a:p>
    <a:p><a:r><a:rPr sz="1600"/><a:t>Andra stycket</a:t></a:r></a:p>
  </p:txBody>`;

// Shape 1: an untouched neighbour on the same slide.
const SHAPE_UNTOUCHED = `
  <p:spPr><a:xfrm><a:off x="500" y="600"/><a:ext cx="1000" cy="1200"/></a:xfrm></p:spPr>
  <p:txBody><a:bodyPr/><a:p><a:r><a:rPr sz="1200"/><a:t>Untouched box</a:t></a:r></a:p></p:txBody>`;

// Slide 2, single shape — proves cross-slide addressing + passthrough.
const SHAPE_SLIDE2 = `
  <p:spPr><a:xfrm><a:off x="1" y="2"/><a:ext cx="10" cy="20"/></a:xfrm></p:spPr>
  <p:txBody><a:bodyPr/><a:p><a:r><a:rPr sz="1400"/><a:t>Second slide box</a:t></a:r></a:p></p:txBody>`;

async function buildBaseline(): Promise<Buffer> {
  return buildMiniPptx([
    slideWithShapes([SHAPE_MULTIPARA, SHAPE_UNTOUCHED]),
    slideWithShapes([SHAPE_SLIDE2]),
  ]);
}

describe("instrumentTemplate — round-trip through readPptxSlides", () => {
  it("injects a token into exactly the addressed shape and preserves geometry + fontSizePt", async () => {
    const base = await buildBaseline();
    const before = await readPptxSlides(base);

    const out = await instrumentTemplate(base, [
      { source: 1, shapeIndex: 0, token: "{Metod}" },
    ]);
    const after = await readPptxSlides(out);

    const target = after[0].shapes[0];
    expect(target.tokens).toEqual(["{Metod}"]);
    expect(after[0].tokens).toContain("{Metod}");
    // Geometry + font untouched vs the uninstrumented baseline.
    expect(target.geometry).toEqual(before[0].shapes[0].geometry);
    expect(target.geometry).toEqual({ x: 100, y: 200, cx: 3000, cy: 4000 });
    expect(target.fontSizePt).toBe(before[0].shapes[0].fontSizePt);
    expect(target.fontSizePt).toBe(16);
  });

  it("collapses a multi-paragraph box to the single token paragraph", async () => {
    const base = await buildBaseline();
    const out = await instrumentTemplate(base, [
      { source: 1, shapeIndex: 0, token: "{Metod}" },
    ]);
    const after = await readPptxSlides(out);
    expect(after[0].shapes[0].paragraphs).toEqual(["{Metod}"]);
  });

  it("leaves other shapes and other slides content-identical", async () => {
    const base = await buildBaseline();
    const before = await readPptxSlides(base);
    const out = await instrumentTemplate(base, [
      { source: 1, shapeIndex: 0, token: "{Metod}" },
    ]);
    const after = await readPptxSlides(out);

    // Neighbour shape on the mutated slide.
    expect(after[0].shapes[1]).toEqual(before[0].shapes[1]);
    // Whole untouched second slide.
    expect(after[1]).toEqual(before[1]);
  });

  it("inherits the first run's sz so fontSizePt survives injection", async () => {
    const base = await buildBaseline();
    const out = await instrumentTemplate(base, [
      { source: 1, shapeIndex: 0, token: "{Metod}" },
    ]);
    const after = await readPptxSlides(out);
    // Baseline first run carried sz=1600; the collapsed single run keeps it.
    expect(after[0].shapes[0].fontSizePt).toBe(16);
  });

  it("applies multiple injections across shapes and slides in one call", async () => {
    const base = await buildBaseline();
    const injections: TokenInjection[] = [
      { source: 1, shapeIndex: 0, token: "{Metod}" },
      { source: 1, shapeIndex: 1, token: "{Kontakt}" },
      { source: 2, shapeIndex: 0, token: "{Sammanfattning}" },
    ];
    const after = await readPptxSlides(await instrumentTemplate(base, injections));

    expect(after[0].shapes[0].paragraphs).toEqual(["{Metod}"]);
    expect(after[0].shapes[1].paragraphs).toEqual(["{Kontakt}"]);
    expect(after[1].shapes[0].paragraphs).toEqual(["{Sammanfattning}"]);
    // Untouched neighbour geometry preserved on the addressed shapes.
    expect(after[0].shapes[1].geometry).toEqual({ x: 500, y: 600, cx: 1000, cy: 1200 });
  });

  it("preserves fontSizePt when the size lived in a deleted run (first run has no sz)", async () => {
    // Routine-review repro: first run's rPr lacks sz, the SECOND run carries it.
    // Injection keeps run 1 and deletes run 2 — without re-stamping, introspection
    // would fall back to the default font size and budgets would drift (16 → null).
    const base = await buildMiniPptx(
      slideWithShapes([
        `<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="5" cy="5"/></a:xfrm></p:spPr>
         <p:txBody><a:bodyPr/><a:p><a:r><a:rPr/><a:t>utan sz</a:t></a:r><a:r><a:rPr sz="1600"/><a:t>med sz</a:t></a:r></a:p></p:txBody>`,
      ]),
    );
    const before = await readPptxSlides(base);
    expect(before[0].shapes[0].fontSizePt).toBe(16);

    const after = await readPptxSlides(
      await instrumentTemplate(base, [{ source: 1, shapeIndex: 0, token: "{X}" }]),
    );
    expect(after[0].shapes[0].fontSizePt).toBe(16);
    expect(after[0].shapes[0].paragraphs).toEqual(["{X}"]);
  });

  it("preserves fontSizePt when the size lived in a deleted paragraph", async () => {
    // Same drift via the other route: size only on the second <a:p>, which the
    // collapse removes.
    const base = await buildMiniPptx(
      slideWithShapes([
        `<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="5" cy="5"/></a:xfrm></p:spPr>
         <p:txBody><a:bodyPr/><a:p><a:r><a:rPr/><a:t>första</a:t></a:r></a:p><a:p><a:r><a:rPr sz="2000"/><a:t>andra</a:t></a:r></a:p></p:txBody>`,
      ]),
    );
    const before = await readPptxSlides(base);
    expect(before[0].shapes[0].fontSizePt).toBe(20);

    const after = await readPptxSlides(
      await instrumentTemplate(base, [{ source: 1, shapeIndex: 0, token: "{X}" }]),
    );
    expect(after[0].shapes[0].fontSizePt).toBe(20);
  });

  it("clears text-bearing non-run siblings (a:fld, a:br) so only the token remains", async () => {
    // The docblock promises fld/br removal; lock it. A slide-number field and a
    // line break both carry text content that must not leak past injection.
    const base = await buildMiniPptx(
      slideWithShapes([
        `<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="5" cy="5"/></a:xfrm></p:spPr>
         <p:txBody><a:bodyPr/><a:p><a:fld id="{ABC-123}" type="slidenum"><a:t>7</a:t></a:fld><a:br/><a:r><a:rPr sz="1400"/><a:t>text</a:t></a:r></a:p></p:txBody>`,
      ]),
    );
    const after = await readPptxSlides(
      await instrumentTemplate(base, [{ source: 1, shapeIndex: 0, token: "{Ren}" }]),
    );
    expect(after[0].shapes[0].paragraphs).toEqual(["{Ren}"]);
    expect(after[0].shapes[0].tokens).toEqual(["{Ren}"]);
  });

  it("creates a run when the first paragraph has none", async () => {
    // First <a:p> has a pPr but no <a:r> — the create-run branch.
    const base = await buildMiniPptx(
      slideWithShapes([
        `<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="5" cy="5"/></a:xfrm></p:spPr>
         <p:txBody><a:bodyPr/><a:p><a:pPr/></a:p></p:txBody>`,
      ]),
    );
    const after = await readPptxSlides(
      await instrumentTemplate(base, [{ source: 1, shapeIndex: 0, token: "{Ny}" }]),
    );
    expect(after[0].shapes[0].paragraphs).toEqual(["{Ny}"]);
  });
});

describe("instrumentTemplate — validation and passthrough", () => {
  it("returns the original buffer unchanged for zero injections", async () => {
    const base = await buildBaseline();
    const out = await instrumentTemplate(base, []);
    expect(out).toBe(base);
    expect(await readPptxSlides(out)).toEqual(await readPptxSlides(base));
  });

  it("rejects a token that does not match the token regex", async () => {
    const base = await buildBaseline();
    await expect(
      instrumentTemplate(base, [{ source: 1, shapeIndex: 0, token: "Metod" }]),
    ).rejects.toThrow(/must match/);
    await expect(
      instrumentTemplate(base, [{ source: 1, shapeIndex: 0, token: "{a{b}}" }]),
    ).rejects.toThrow(/must match/);
  });

  it("rejects a source out of range", async () => {
    const base = await buildBaseline();
    await expect(
      instrumentTemplate(base, [{ source: 99, shapeIndex: 0, token: "{X}" }]),
    ).rejects.toThrow(/source 99 out of range/);
  });

  it("rejects a shapeIndex out of range for the slide", async () => {
    const base = await buildBaseline();
    await expect(
      instrumentTemplate(base, [{ source: 1, shapeIndex: 99, token: "{X}" }]),
    ).rejects.toThrow(/shapeIndex 99 out of range/);
  });

  it("rejects the same token appearing twice across injections", async () => {
    const base = await buildBaseline();
    await expect(
      instrumentTemplate(base, [
        { source: 1, shapeIndex: 0, token: "{Dup}" },
        { source: 2, shapeIndex: 0, token: "{Dup}" },
      ]),
    ).rejects.toThrow(/duplicate token/);
  });

  it("rejects two injections against the same shape (second would silently erase the first)", async () => {
    const base = await buildBaseline();
    await expect(
      instrumentTemplate(base, [
        { source: 1, shapeIndex: 0, token: "{Ett}" },
        { source: 1, shapeIndex: 0, token: "{Två}" },
      ]),
    ).rejects.toThrow(/duplicate target/);
  });
});
