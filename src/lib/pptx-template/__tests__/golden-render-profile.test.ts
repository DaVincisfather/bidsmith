// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import path from "path";
import JSZip from "jszip";
import { DOMParser, type Element } from "@xmldom/xmldom";
import { renderTemplate } from "../loader";
import { bundledTemplate } from "../registry";
import { GOLDEN_SECTIONS, GOLDEN_MASTER } from "./fixtures/golden-sections";
import { resolveActiveSlides } from "./fixtures/active-slides";

// Slice 3 regression gate: the profile-driven renderer must reproduce the
// type-driven output of OUR own template bit-for-bit. We render through the
// SAME renderTemplate entrypoint with BIDSMITH_PROFILE_RENDER=1 (which routes to
// renderFromProfile) and assert against the SAME committed golden snapshot that
// the type-driven path is pinned to (golden-render.test.ts). Identical = the
// generalisation from slide-types to capabilities dropped nothing.

const GOLDEN_PATH = path.resolve(
  "src/lib/pptx-template/__tests__/golden/anbudsmall-v2.golden.json",
);
const A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main";

interface SlideSnapshot {
  texts: string[];
  xfrm: { x: string; y: string; cx: string; cy: string }[];
  pics: number;
}

async function snapshotProfileRender(): Promise<SlideSnapshot[]> {
  const prev = process.env.BIDSMITH_PROFILE_RENDER;
  process.env.BIDSMITH_PROFILE_RENDER = "1";
  let buffer: Buffer;
  try {
    buffer = await renderTemplate(bundledTemplate(), GOLDEN_SECTIONS, GOLDEN_MASTER);
  } finally {
    if (prev === undefined) delete process.env.BIDSMITH_PROFILE_RENDER;
    else process.env.BIDSMITH_PROFILE_RENDER = prev;
  }

  const zip = await JSZip.loadAsync(buffer);
  const parser = new DOMParser();
  const slidePaths = await resolveActiveSlides(zip, parser);

  const snapshots: SlideSnapshot[] = [];
  for (const name of slidePaths) {
    const doc = parser.parseFromString(await zip.file(name)!.async("string"), "application/xml");
    const texts: string[] = [];
    const tNodes = doc.getElementsByTagNameNS(A_NS, "t");
    for (let i = 0; i < tNodes.length; i++) texts.push(tNodes[i].textContent ?? "");
    const xfrm: SlideSnapshot["xfrm"] = [];
    const offs = doc.getElementsByTagNameNS(A_NS, "off");
    for (let i = 0; i < offs.length; i++) {
      const off = offs[i];
      const ext = (off.parentNode as Element | null)?.getElementsByTagNameNS(A_NS, "ext")[0];
      xfrm.push({
        x: off.getAttribute("x") ?? "",
        y: off.getAttribute("y") ?? "",
        cx: ext?.getAttribute("cx") ?? "",
        cy: ext?.getAttribute("cy") ?? "",
      });
    }
    snapshots.push({
      texts,
      xfrm,
      pics: doc.getElementsByTagNameNS(P_NS, "pic").length,
    });
  }
  return snapshots;
}

describe("golden render (profil-driven) — anbudsmall-v2 bitparitet", () => {
  it("reproducerar den typ-drivna golden-snapshoten bit-för-bit", async () => {
    const actual = await snapshotProfileRender();
    const golden = JSON.parse(await readFile(GOLDEN_PATH, "utf8"));
    expect(actual).toEqual(golden);
  });
});
