import { describe, expect, it } from "vitest";
import { contentTypeForFile } from "../document-parser";

describe("contentTypeForFile", () => {
  it("maps whitelisted extensions to their MIME type", () => {
    expect(contentTypeForFile("rfp.pdf")).toBe("application/pdf");
    expect(contentTypeForFile("brief.md")).toBe("text/markdown");
    expect(contentTypeForFile("mall.pptx")).toBe(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    );
  });

  it("is case-insensitive on the extension", () => {
    expect(contentTypeForFile("RFP.PDF")).toBe("application/pdf");
  });

  it("never trusts the name's apparent type — unknown ext → octet-stream", () => {
    // A file named .txt but served as text/html would be stored-XSS; deriving
    // from extension (text/plain) neutralises it. An unknown extension gets the
    // inert octet-stream, never a client-suggested type.
    expect(contentTypeForFile("evil.html")).toBe("application/octet-stream");
    expect(contentTypeForFile("noext")).toBe("application/octet-stream");
  });
});
