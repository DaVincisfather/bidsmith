// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import path from "path";
import { renderTemplate } from "../loader";
import { bundledTemplate } from "../registry";
import { GOLDEN_SECTIONS, GOLDEN_MASTER } from "./fixtures/golden-sections";
import { snapshotSlides } from "./fixtures/snapshot-slides";

// Slice 3 regression gate: the profile-driven renderer must reproduce the
// type-driven output of OUR own template bit-for-bit. We render through the
// SAME renderTemplate entrypoint with BIDSMITH_PROFILE_RENDER=1 (which routes to
// renderFromProfile), snapshot via the SAME shared extractor as the type-driven
// test, and assert against the SAME committed golden (golden-render.test.ts).
// Identical = the generalisation from slide-types to capabilities dropped nothing.

const GOLDEN_PATH = path.resolve(
  "src/lib/pptx-template/__tests__/golden/anbudsmall-v2.golden.json",
);

async function snapshotProfileRender() {
  const prev = process.env.BIDSMITH_PROFILE_RENDER;
  process.env.BIDSMITH_PROFILE_RENDER = "1";
  try {
    const buffer = await renderTemplate(bundledTemplate(), GOLDEN_SECTIONS, GOLDEN_MASTER);
    return await snapshotSlides(buffer);
  } finally {
    if (prev === undefined) delete process.env.BIDSMITH_PROFILE_RENDER;
    else process.env.BIDSMITH_PROFILE_RENDER = prev;
  }
}

describe("golden render (profil-driven) — anbudsmall-v2 bitparitet", () => {
  it("reproducerar den typ-drivna golden-snapshoten bit-för-bit", async () => {
    const actual = await snapshotProfileRender();
    const golden = JSON.parse(await readFile(GOLDEN_PATH, "utf8"));
    expect(actual).toEqual(golden);
  });
});
