// @vitest-environment node
import { describe, it, expect } from "vitest";
import Automizer from "pptx-automizer";
import path from "path";
import os from "os";

// The production template is tracked in the repo, so this runs everywhere
// (it previously pointed at a gitignored design mockup and always skipped —
// zero regression protection).
const TEMPLATE_DIR = path.resolve("templates");

describe("pptx-automizer smoke", () => {
  it("loads the production template and writes a copy without errors", async () => {
    const automizer = new Automizer({
      templateDir: TEMPLATE_DIR,
      outputDir: os.tmpdir(),
      removeExistingSlides: false,
    });

    // stream() is a top-level method on Automizer; loadRoot() returns `this`
    const readableStream = await automizer
      .loadRoot("anbudsmall-v2.pptx")
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
