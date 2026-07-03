// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFile, writeFile } from "fs/promises";
import path from "path";
import { renderTemplate } from "../loader";
import { bundledTemplate } from "../registry";
import { GOLDEN_SECTIONS, GOLDEN_MASTER } from "./fixtures/golden-sections";
import { snapshotSlides } from "./fixtures/snapshot-slides";

const GOLDEN_PATH = path.resolve(
  "src/lib/pptx-template/__tests__/golden/anbudsmall-v2.golden.json",
);

async function snapshotRender() {
  const buffer = await renderTemplate(bundledTemplate(), GOLDEN_SECTIONS, GOLDEN_MASTER);
  return snapshotSlides(buffer);
}

describe("golden render — anbudsmall-v2 bitparitet", () => {
  it("matchar committad golden-snapshot (GOLDEN_UPDATE=1 för att regenerera)", async () => {
    const actual = await snapshotRender();
    if (process.env.GOLDEN_UPDATE === "1") {
      await writeFile(GOLDEN_PATH, JSON.stringify(actual, null, 2) + "\n", "utf8");
      return;
    }
    const golden = JSON.parse(await readFile(GOLDEN_PATH, "utf8"));
    expect(actual).toEqual(golden);
  });
});
