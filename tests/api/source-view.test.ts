// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// Offline route-test för de två source-view-endpointsen. INGA API-anrop: lokaliseringen
// är ren sträng-matchning (evidence-context.ts), Supabase mockad, signeringen mockad.
// Samma mock-yta som andra route-tester: auth via authUser, per-tabell-resultat via
// tableResults. Endpointsen läser EN rad (.single()) per anrop.

let authUser: { id: string } | null;
const tableResults: Record<string, { data: unknown; error: unknown }> = {};

function builder(table: string) {
  const result = () =>
    Promise.resolve(tableResults[table] ?? { data: null, error: null });
  const chain: Record<string, unknown> = {};
  const ret = () => chain;
  chain.select = ret;
  chain.eq = ret;
  chain.single = result;
  chain.maybeSingle = result;
  chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
    result().then(onF, onR);
  return chain;
}

const client = {
  from: (table: string) => builder(table),
  auth: { getUser: () => Promise.resolve({ data: { user: authUser } }) },
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.resolve(client),
}));

// Signerings-mock: ingen storage-träff. Standard: en fejkad signerad URL.
const mockSign = vi.fn(async (p: string) => `https://signed.example/${p}`);
vi.mock("@/lib/storage-urls", () => ({
  getDocumentSignedUrl: (p: string) => mockSign(p),
}));

import { GET as ANALYSIS_GET } from "@/app/api/analyses/[id]/source-view/route";
import { GET as CONSULTANT_GET } from "@/app/api/consultants/[id]/source-view/route";

const VALID_UUID = "11111111-1111-1111-1111-111111111111";
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (base: string, id: string) =>
  new Request(`http://t/api/${base}/${id}/source-view`) as never;

const RFP_TEXT =
  "Anbudsgivaren ska ha minst tre års dokumenterad erfarenhet av liknande " +
  "uppdrag inom offentlig sektor. Referenser ska bifogas anbudet.";
const CV_TEXT =
  "Anna har lång erfarenhet av upphandling och avtalsrätt inom offentlig sektor. " +
  "Hon ledde införandet av ett nytt ärendehanteringssystem hos en kommun.";

beforeEach(() => {
  vi.clearAllMocks();
  authUser = { id: "user-1" };
  mockSign.mockImplementation(async (p: string) => `https://signed.example/${p}`);
  for (const k of Object.keys(tableResults)) delete tableResults[k];
});

describe("GET /api/analyses/[id]/source-view", () => {
  it("401 utan auth", async () => {
    authUser = null;
    const res = await ANALYSIS_GET(req("analyses", VALID_UUID), ctx(VALID_UUID));
    expect(res.status).toBe(401);
  });

  it("400 vid ogiltigt uuid", async () => {
    const res = await ANALYSIS_GET(req("analyses", "bad"), ctx("bad"));
    expect(res.status).toBe(400);
  });

  it("404 när analysen saknas", async () => {
    tableResults.analyses = { data: null, error: { message: "not found" } };
    const res = await ANALYSIS_GET(req("analyses", VALID_UUID), ctx(VALID_UUID));
    expect(res.status).toBe(404);
  });

  it("returnerar hela sourceText + spann ur LAGRAD evidens (inte godtycklig text)", async () => {
    tableResults.analyses = {
      data: {
        id: VALID_UUID,
        analysis: {
          requirements: [
            { evidence: "minst tre års dokumenterad erfarenhet" },
            { evidence: null }, // obelagd → ignoreras
          ],
        },
        documents: { raw_text: RFP_TEXT, file_path: null },
      },
      error: null,
    };
    const res = await ANALYSIS_GET(req("analyses", VALID_UUID), ctx(VALID_UUID));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Medvetet PII-byte: HELA råtexten returneras i källvyn.
    expect(body.sourceText).toBe(RFP_TEXT);
    expect(body.spans.perEvidence).toHaveLength(1);
    const s = body.spans.perEvidence[0];
    expect(RFP_TEXT.slice(s.start, s.end)).toBe("minst tre års dokumenterad erfarenhet");
    expect(body.spans.merged).toHaveLength(1);
    expect(body.fileUrl).toBeUndefined();
  });

  it("spann kommer ENBART ur lagrad evidens — text som inte är evidens markeras ej", async () => {
    tableResults.analyses = {
      data: {
        id: VALID_UUID,
        analysis: { requirements: [{ evidence: "minst tre års dokumenterad erfarenhet" }] },
        documents: { raw_text: RFP_TEXT, file_path: null },
      },
      error: null,
    };
    const res = await ANALYSIS_GET(req("analyses", VALID_UUID), ctx(VALID_UUID));
    const body = await res.json();
    // "Referenser ska bifogas" står i texten men är inte lagrad evidens → inget spann.
    for (const s of body.spans.perEvidence) {
      expect(RFP_TEXT.slice(s.start, s.end)).not.toContain("Referenser");
    }
  });

  it("signerar file_path till fileUrl när originalfilen finns (D-länk)", async () => {
    tableResults.analyses = {
      data: {
        id: VALID_UUID,
        analysis: { requirements: [] },
        documents: { raw_text: RFP_TEXT, file_path: "user-1/abc.pdf" },
      },
      error: null,
    };
    const res = await ANALYSIS_GET(req("analyses", VALID_UUID), ctx(VALID_UUID));
    const body = await res.json();
    expect(mockSign).toHaveBeenCalledWith("user-1/abc.pdf");
    expect(body.fileUrl).toBe("https://signed.example/user-1/abc.pdf");
  });

  it("utelämnar fileUrl (inte 500) när signeringen fallerar", async () => {
    mockSign.mockRejectedValueOnce(new Error("sign failed"));
    tableResults.analyses = {
      data: {
        id: VALID_UUID,
        analysis: { requirements: [] },
        documents: { raw_text: RFP_TEXT, file_path: "user-1/abc.pdf" },
      },
      error: null,
    };
    const res = await ANALYSIS_GET(req("analyses", VALID_UUID), ctx(VALID_UUID));
    expect(res.status).toBe(200);
    expect((await res.json()).fileUrl).toBeUndefined();
  });

  it("tom sourceText när dokumentet saknar raw_text", async () => {
    tableResults.analyses = {
      data: {
        id: VALID_UUID,
        analysis: { requirements: [{ evidence: "x" }] },
        documents: null,
      },
      error: null,
    };
    const res = await ANALYSIS_GET(req("analyses", VALID_UUID), ctx(VALID_UUID));
    const body = await res.json();
    expect(body.sourceText).toBe("");
    expect(body.spans).toEqual({ merged: [], perEvidence: [] });
  });
});

describe("GET /api/consultants/[id]/source-view", () => {
  it("401 utan auth", async () => {
    authUser = null;
    const res = await CONSULTANT_GET(req("consultants", VALID_UUID), ctx(VALID_UUID));
    expect(res.status).toBe(401);
  });

  it("400 vid ogiltigt uuid", async () => {
    const res = await CONSULTANT_GET(req("consultants", "bad"), ctx("bad"));
    expect(res.status).toBe(400);
  });

  it("404 när konsulten saknas", async () => {
    tableResults.consultants = { data: null, error: { message: "not found" } };
    const res = await CONSULTANT_GET(req("consultants", VALID_UUID), ctx(VALID_UUID));
    expect(res.status).toBe(404);
  });

  it("returnerar hela CV-texten + spann ur kompetens- OCH referens-evidens, ALDRIG fileUrl", async () => {
    tableResults.consultants = {
      data: {
        raw_cv_text: CV_TEXT,
        consultant_competencies: [{ evidence: "erfarenhet av upphandling" }],
        consultant_references: [{ evidence: "införandet av ett nytt ärendehanteringssystem" }],
      },
      error: null,
    };
    const res = await CONSULTANT_GET(req("consultants", VALID_UUID), ctx(VALID_UUID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sourceText).toBe(CV_TEXT);
    expect(body.spans.perEvidence).toHaveLength(2);
    // D-asymmetri: konsulten lagrar ingen originalfil → fileUrl finns aldrig.
    expect(body.fileUrl).toBeUndefined();
  });

  it("tom sourceText när raw_cv_text saknas (äldre/manuell konsult)", async () => {
    tableResults.consultants = {
      data: {
        raw_cv_text: null,
        consultant_competencies: [{ evidence: "erfarenhet av upphandling" }],
        consultant_references: [],
      },
      error: null,
    };
    const res = await CONSULTANT_GET(req("consultants", VALID_UUID), ctx(VALID_UUID));
    const body = await res.json();
    expect(body.sourceText).toBe("");
    expect(body.spans).toEqual({ merged: [], perEvidence: [] });
  });
});
