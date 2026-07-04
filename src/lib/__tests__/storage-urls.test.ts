import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getDocumentSignedUrl,
  getCvSignedUrl,
  DEFAULT_DOC_TTL_SECONDS,
} from "@/lib/storage-urls";

const mockCreateSignedUrl = vi.fn();
const mockFrom = vi.fn((bucket: string) => ({
  bucket,
  createSignedUrl: mockCreateSignedUrl,
}));

vi.mock("@/lib/supabase", () => ({
  createServiceClient: () => ({
    storage: {
      from: mockFrom,
    },
  }),
}));

beforeEach(() => {
  mockCreateSignedUrl.mockReset();
  mockFrom.mockClear();
});

describe("getDocumentSignedUrl", () => {
  it("uses 24h TTL by default", async () => {
    expect(DEFAULT_DOC_TTL_SECONDS).toBe(60 * 60 * 24);

    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://example.com/signed" },
      error: null,
    });

    const url = await getDocumentSignedUrl("org-1/123-rfp.pdf");

    expect(url).toBe("https://example.com/signed");
    expect(mockFrom).toHaveBeenCalledWith("rfp-documents");
    expect(mockCreateSignedUrl).toHaveBeenCalledWith(
      "org-1/123-rfp.pdf",
      DEFAULT_DOC_TTL_SECONDS
    );
  });

  it("respects an explicit ttlSeconds override", async () => {
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://example.com/short" },
      error: null,
    });

    await getDocumentSignedUrl("org-1/abc.pdf", 600);

    expect(mockCreateSignedUrl).toHaveBeenCalledWith("org-1/abc.pdf", 600);
  });

  it("throws when Supabase returns an error", async () => {
    mockCreateSignedUrl.mockResolvedValue({
      data: null,
      error: { message: "object not found" },
    });

    await expect(
      getDocumentSignedUrl("missing/path.pdf")
    ).rejects.toThrow(/object not found/);
  });

  it("throws when signedUrl is missing in the response", async () => {
    mockCreateSignedUrl.mockResolvedValue({
      data: {},
      error: null,
    });

    await expect(
      getDocumentSignedUrl("missing/path.pdf")
    ).rejects.toThrow();
  });
});

describe("getCvSignedUrl", () => {
  it("signs against the private consultant-cvs bucket with the default TTL", async () => {
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://example.com/cv-signed" },
      error: null,
    });

    const url = await getCvSignedUrl("consultant-1/anna-cv.pdf");

    expect(url).toBe("https://example.com/cv-signed");
    // Distinkt bucket från RFP-dokumenten — får aldrig signera fel yta.
    expect(mockFrom).toHaveBeenCalledWith("consultant-cvs");
    expect(mockCreateSignedUrl).toHaveBeenCalledWith(
      "consultant-1/anna-cv.pdf",
      DEFAULT_DOC_TTL_SECONDS
    );
  });

  it("throws when Supabase returns an error (caller degrades to omitted fileUrl)", async () => {
    mockCreateSignedUrl.mockResolvedValue({
      data: null,
      error: { message: "object not found" },
    });

    await expect(
      getCvSignedUrl("consultant-1/missing.pdf")
    ).rejects.toThrow(/object not found/);
  });
});
