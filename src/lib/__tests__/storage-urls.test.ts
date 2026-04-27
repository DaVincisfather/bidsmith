import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDocumentSignedUrl, DEFAULT_DOC_TTL_SECONDS } from "@/lib/storage-urls";

const mockCreateSignedUrl = vi.fn();

vi.mock("@/lib/supabase", () => ({
  createServiceClient: () => ({
    storage: {
      from: (bucket: string) => ({
        bucket,
        createSignedUrl: mockCreateSignedUrl,
      }),
    },
  }),
}));

beforeEach(() => {
  mockCreateSignedUrl.mockReset();
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
