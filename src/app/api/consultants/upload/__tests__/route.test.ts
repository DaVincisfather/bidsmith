import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// --- Hoisted mocks (referenced inside vi.mock factories, which are hoisted) ---
const h = vi.hoisted(() => {
  const uploadMock = vi.fn();
  const updateEqMock = vi.fn();
  const updateMock = vi.fn(() => ({ eq: updateEqMock }));
  const tableFromMock = vi.fn(() => ({ update: updateMock }));
  const storageFromMock = vi.fn(() => ({ upload: uploadMock }));
  const upsertConsultantMock = vi.fn();
  const parseDocumentMock = vi.fn();
  const extractConsultantMock = vi.fn();
  return {
    uploadMock,
    updateEqMock,
    updateMock,
    tableFromMock,
    storageFromMock,
    upsertConsultantMock,
    parseDocumentMock,
    extractConsultantMock,
  };
});

// Behåll den RIKTIGA getExtension/SUPPORTED_EXTENSIONS/whitelisten så buildCvKey
// testas mot samma extensions-uppsättning som parsern — bara parseDocument stubbas.
vi.mock("@/lib/document-parser", async (importActual) => {
  const actual =
    await importActual<typeof import("@/lib/document-parser")>();
  return { ...actual, parseDocument: h.parseDocumentMock };
});

vi.mock("@/lib/consultant-extractor", () => ({
  extractConsultant: h.extractConsultantMock,
}));

vi.mock("@/lib/supabase", () => ({
  createServiceClient: () => ({
    storage: { from: h.storageFromMock },
    from: h.tableFromMock,
  }),
  upsertConsultant: h.upsertConsultantMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({}),
}));

vi.mock("@/lib/org", () => ({
  getUserId: async () => "user-1",
  NotAuthenticatedError: class extends Error {},
}));

import { POST } from "../route";

function fakeFile(name: string, type = "application/pdf"): File {
  return {
    name,
    type,
    arrayBuffer: async () => new TextEncoder().encode("cv-bytes").buffer,
  } as unknown as File;
}

function makeRequest(files: File[]): NextRequest {
  return {
    headers: { get: () => null },
    formData: async () => ({ getAll: (_key: string) => files }),
  } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.parseDocumentMock.mockResolvedValue("raw cv text");
  h.extractConsultantMock.mockResolvedValue({ name: "Anna" });
  h.upsertConsultantMock.mockResolvedValue({ consultantId: "c-1", updated: false });
  h.uploadMock.mockResolvedValue({ error: null });
  h.updateEqMock.mockResolvedValue({ error: null });
});

describe("POST /api/consultants/upload — original CV persistence", () => {
  it("laddar upp originalfilen till consultant-cvs vid rätt nyckel + sätter cv_file_path", async () => {
    const res = await POST(makeRequest([fakeFile("Anna Svensson CV.pdf")]));
    const body = await res.json();

    expect(body.successful).toBe(1);
    expect(body.results[0].warning).toBeNull();

    // Storage-nyckel: `${consultantId}/${slug}.${ext}`
    expect(h.storageFromMock).toHaveBeenCalledWith("consultant-cvs");
    expect(h.uploadMock).toHaveBeenCalledTimes(1);
    const [key, , opts] = h.uploadMock.mock.calls[0];
    expect(key).toBe("c-1/anna-svensson-cv.pdf");
    expect(opts).toMatchObject({ upsert: true, contentType: "application/pdf" });

    // Raden uppdateras med exakt samma nyckel.
    expect(h.tableFromMock).toHaveBeenCalledWith("consultants");
    expect(h.updateMock).toHaveBeenCalledWith({ cv_file_path: "c-1/anna-svensson-cv.pdf" });
    expect(h.updateEqMock).toHaveBeenCalledWith("id", "c-1");
  });

  it("sanerar ett illvilligt filnamn till en säker nyckel (åäö behålls, sökväg strippas)", async () => {
    const res = await POST(
      makeRequest([fakeFile("../../Öäå Ninja/CV Höst 2024.pdf")]),
    );
    await res.json();

    const [key] = h.uploadMock.mock.calls[0];
    expect(key).toBe("c-1/öäå-ninja-cv-höst-2024.pdf");
    // Ingen sökvägs-traversal kvar i nyckeln.
    expect(key).not.toContain("..");
    expect(key.split("/").length).toBe(2); // enbart consultantId/-prefixet
  });

  it("är ICKE-FATAL när storage-uploaden fallerar — raden är kvar, varning returneras", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    h.uploadMock.mockResolvedValue({ error: { message: "bucket missing" } });

    const res = await POST(makeRequest([fakeFile("cv.pdf")]));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.successful).toBe(1); // extraktionen committades
    expect(body.results[0].consultantId).toBe("c-1");
    expect(body.results[0].error).toBeNull();
    expect(body.results[0].warning).toMatch(/kunde inte sparas/);
    // cv_file_path lämnas orört när uploaden dör.
    expect(h.updateEqMock).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("är ICKE-FATAL när cv_file_path-uppdateringen fallerar", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    h.updateEqMock.mockResolvedValue({ error: { message: "column locked" } });

    const res = await POST(makeRequest([fakeFile("cv.pdf")]));
    const body = await res.json();

    expect(body.successful).toBe(1);
    expect(body.results[0].error).toBeNull();
    expect(body.results[0].warning).toMatch(/kunde inte sparas/);

    warnSpy.mockRestore();
  });
});
