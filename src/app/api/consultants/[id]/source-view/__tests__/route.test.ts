import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const h = vi.hoisted(() => {
  const singleMock = vi.fn();
  const getCvSignedUrlMock = vi.fn();
  return { singleMock, getCvSignedUrlMock };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({ eq: () => ({ single: h.singleMock }) }),
    }),
  }),
}));

vi.mock("@/lib/org", () => ({
  getUserId: async () => "user-1",
  NotAuthenticatedError: class extends Error {},
}));

vi.mock("@/lib/storage-urls", () => ({
  getCvSignedUrl: h.getCvSignedUrlMock,
}));

import { GET } from "../route";

const VALID_ID = "11111111-1111-1111-1111-111111111111";

function makeRequest(): NextRequest {
  return {} as unknown as NextRequest;
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/consultants/[id]/source-view — fileUrl (D-symmetri)", () => {
  it("signerar cv_file_path och returnerar fileUrl när originalfilen finns", async () => {
    h.singleMock.mockResolvedValue({
      data: {
        raw_cv_text: "CV-text",
        cv_file_path: "c-1/anna-cv.pdf",
        consultant_competencies: [],
        consultant_references: [],
      },
      error: null,
    });
    h.getCvSignedUrlMock.mockResolvedValue("https://example.com/signed-cv");

    const res = await GET(makeRequest(), ctx(VALID_ID));
    const body = await res.json();

    expect(h.getCvSignedUrlMock).toHaveBeenCalledWith("c-1/anna-cv.pdf");
    expect(body.fileUrl).toBe("https://example.com/signed-cv");
    expect(body.sourceText).toBe("CV-text");
  });

  it("utelämnar fileUrl när cv_file_path är null (konsult uppladdad före featuren)", async () => {
    h.singleMock.mockResolvedValue({
      data: {
        raw_cv_text: "CV-text",
        cv_file_path: null,
        consultant_competencies: [],
        consultant_references: [],
      },
      error: null,
    });

    const res = await GET(makeRequest(), ctx(VALID_ID));
    const body = await res.json();

    expect(h.getCvSignedUrlMock).not.toHaveBeenCalled();
    expect(body.fileUrl).toBeUndefined();
    expect(body.sourceText).toBe("CV-text");
  });

  it("degraderar till utelämnad fileUrl när signeringen fallerar", async () => {
    h.singleMock.mockResolvedValue({
      data: {
        raw_cv_text: "CV-text",
        cv_file_path: "c-1/anna-cv.pdf",
        consultant_competencies: [],
        consultant_references: [],
      },
      error: null,
    });
    h.getCvSignedUrlMock.mockRejectedValue(new Error("object not found"));

    const res = await GET(makeRequest(), ctx(VALID_ID));
    const body = await res.json();

    expect(body.fileUrl).toBeUndefined();
    expect(body.sourceText).toBe("CV-text"); // källvyn visar ändå råtexten
  });
});
