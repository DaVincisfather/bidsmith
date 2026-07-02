import { describe, it, expect } from "vitest";
import {
  parseDocument,
  validateDocument,
  sanitizeFilename,
} from "@/lib/document-parser";

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

describe("validateDocument", () => {
  it("accepts a supported file within the size limit", () => {
    expect(() => validateDocument(Buffer.from("x"), "rfp.pdf")).not.toThrow();
  });

  it("rejects an unsupported extension", () => {
    expect(() => validateDocument(Buffer.from("x"), "rfp.exe")).toThrow(
      "Unsupported file type"
    );
  });

  it("rejects a file over the 20MB limit", () => {
    const tooBig = Buffer.alloc(20 * 1024 * 1024 + 1);
    expect(() => validateDocument(tooBig, "rfp.pdf")).toThrow("File too large");
  });
});

describe("sanitizeFilename", () => {
  it("keeps a normal filename intact", () => {
    expect(sanitizeFilename("Upphandling-2026.pdf")).toBe("Upphandling-2026.pdf");
  });

  it("strips directory components to defeat path traversal", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("..\\..\\windows\\system32")).toBe("system32");
  });

  it("replaces unsafe characters (including å ä ö) with underscores", () => {
    expect(sanitizeFilename("förfrågan (v2).pdf")).toBe("f_rfr_gan__v2_.pdf");
  });

  it("falls back to 'upload' when nothing usable remains", () => {
    expect(sanitizeFilename("...")).toBe("upload");
    expect(sanitizeFilename("/")).toBe("upload");
  });
});
