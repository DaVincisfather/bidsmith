import { describe, it, expect } from "vitest";
import { parseDocument } from "@/lib/document-parser";

describe("parseDocument", () => {
  it("extracts text from a markdown file", async () => {
    const buffer = Buffer.from("# Test RFP\n\nThis is a test document.");
    const result = await parseDocument(buffer, "test.md");

    expect(result).toContain("Test RFP");
    expect(result).toContain("This is a test document.");
  });

  it("extracts text from a plain text file", async () => {
    const buffer = Buffer.from("Plain text content here.");
    const result = await parseDocument(buffer, "test.txt");

    expect(result).toBe("Plain text content here.");
  });

  it("throws on unsupported file type", async () => {
    const buffer = Buffer.from("data");
    await expect(parseDocument(buffer, "test.xyz")).rejects.toThrow(
      "Unsupported file type"
    );
  });
});
