// @vitest-environment node
import { describe, it, expect } from "vitest";
import Automizer from "pptx-automizer";
import path from "path";
import os from "os";
import { existsSync } from "fs";

const TEMPLATE_DIR = path.resolve("data/design mockups");
// The .pptx mockup is gitignored, so it's absent in fresh checkouts/CI —
// skip rather than fail. It runs locally where the file is present.
const hasTemplate = existsSync(path.join(TEMPLATE_DIR, "Anbudsmall-v2.pptx"));

describe.skipIf(!hasTemplate)("pptx-automizer smoke", () => {
  it("loads mockup and writes a copy without errors", async () => {
    const automizer = new Automizer({
      templateDir: TEMPLATE_DIR,
      outputDir: os.tmpdir(),
      removeExistingSlides: false,
    });

    // stream() is a top-level method on Automizer; loadRoot() returns `this`
    const readableStream = await automizer
      .loadRoot("Anbudsmall-v2.pptx")
      .stream();

    const buf = await new Promise<Buffer>((res, rej) => {
      const chunks: Buffer[] = [];
      readableStream.on("data", (c: Buffer) => chunks.push(c));
      readableStream.on("end", () => res(Buffer.concat(chunks)));
      readableStream.on("error", rej);
    });

    expect(buf.length).toBeGreaterThan(10000);
  });
});
