import { describe, expect, it } from "vitest";
import { parseDocument } from "../document-parser";

describe("parseDocument empty-text guard for .md/.txt", () => {
  it("rejects a whitespace-only .txt instead of returning '' to a paid analysis", async () => {
    await expect(parseDocument(Buffer.from("   \n\t  "), "tom.txt")).rejects.toThrow(
      /Failed to extract text/,
    );
  });

  it("rejects an empty .md", async () => {
    await expect(parseDocument(Buffer.from(""), "tom.md")).rejects.toThrow(
      /Failed to extract text/,
    );
  });

  it("still returns real text content", async () => {
    await expect(parseDocument(Buffer.from("Riktig kravtext"), "rfp.txt")).resolves.toBe(
      "Riktig kravtext",
    );
  });
});
