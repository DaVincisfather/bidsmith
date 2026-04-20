// @vitest-environment node
import { describe, it, expect } from "vitest";
import Automizer from "pptx-automizer";
import path from "path";

describe("pptx-automizer smoke", () => {
  it("loads mockup and writes a copy without errors", async () => {
    const automizer = new Automizer({
      templateDir: path.resolve("data/design mockups"),
      outputDir: path.resolve("/tmp"),
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
