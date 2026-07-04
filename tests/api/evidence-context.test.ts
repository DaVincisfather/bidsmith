// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// Offline route-test för de två evidence-context-endpointsen. INGA API-anrop:
// lokaliseringen är ren sträng-matchning (evidence-context.ts) och Supabase mockad.
// Samma mock-yta som profiles.test.ts: auth via authUser, per-tabell-resultat via
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

import { GET as ANALYSIS_GET } from "@/app/api/analyses/[id]/evidence-context/route";
import { GET as CONSULTANT_GET } from "@/app/api/consultants/[id]/evidence-context/route";

const VALID_UUID = "11111111-1111-1111-1111-111111111111";
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

const RFP_TEXT =
  "Anbudsgivaren ska ha minst tre års dokumenterad erfarenhet av liknande " +
  "uppdrag inom offentlig sektor. Referenser ska bifogas anbudet.";
const CV_TEXT =
  "Anna har lång erfarenhet av upphandling och avtalsrätt inom offentlig sektor. " +
  "Hon ledde införandet av ett nytt ärendehanteringssystem hos en kommun.";

function getReq(base: string, id: string, q?: string): Request {
  const url =
    q === undefined
      ? `http://t/api/${base}/${id}/evidence-context`
      : `http://t/api/${base}/${id}/evidence-context?q=${encodeURIComponent(q)}`;
  return new Request(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  authUser = { id: "user-1" };
  for (const k of Object.keys(tableResults)) delete tableResults[k];
});

describe("GET /api/analyses/[id]/evidence-context", () => {
  it("401 utan auth", async () => {
    authUser = null;
    const res = await ANALYSIS_GET(
      getReq("analyses", VALID_UUID, "x") as never,
      ctx(VALID_UUID),
    );
    expect(res.status).toBe(401);
  });

  it("400 vid ogiltigt uuid", async () => {
    const res = await ANALYSIS_GET(
      getReq("analyses", "bad-uuid", "x") as never,
      ctx("bad-uuid"),
    );
    expect(res.status).toBe(400);
  });

  it("400 när q saknas", async () => {
    const res = await ANALYSIS_GET(
      getReq("analyses", VALID_UUID) as never,
      ctx(VALID_UUID),
    );
    expect(res.status).toBe(400);
  });

  it("400 när q överskrider PII-taket (>500 tecken)", async () => {
    const res = await ANALYSIS_GET(
      getReq("analyses", VALID_UUID, "a".repeat(501)) as never,
      ctx(VALID_UUID),
    );
    expect(res.status).toBe(400);
  });

  it("404 när analysen saknas", async () => {
    tableResults.analyses = { data: null, error: { message: "not found" } };
    const res = await ANALYSIS_GET(
      getReq("analyses", VALID_UUID, "x") as never,
      ctx(VALID_UUID),
    );
    expect(res.status).toBe(404);
  });

  it("200 {context:null} när dokumentet saknar raw_text", async () => {
    tableResults.analyses = { data: { id: VALID_UUID, documents: null }, error: null };
    const res = await ANALYSIS_GET(
      getReq("analyses", VALID_UUID, "minst tre års") as never,
      ctx(VALID_UUID),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ context: null });
  });

  it("200 med kontext när citatet finns i raw_text", async () => {
    tableResults.analyses = {
      data: { id: VALID_UUID, documents: { raw_text: RFP_TEXT } },
      error: null,
    };
    const res = await ANALYSIS_GET(
      getReq("analyses", VALID_UUID, "minst tre års dokumenterad erfarenhet") as never,
      ctx(VALID_UUID),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.context.quote).toBe("minst tre års dokumenterad erfarenhet");
    expect(body.context.before).toBe("Anbudsgivaren ska ha");
    expect(body.context.after).toContain("liknande");
  });

  it("200 {context:null} när citatet inte återfinns", async () => {
    tableResults.analyses = {
      data: { id: VALID_UUID, documents: { raw_text: RFP_TEXT } },
      error: null,
    };
    const res = await ANALYSIS_GET(
      getReq("analyses", VALID_UUID, "detta citat existerar inte i underlaget") as never,
      ctx(VALID_UUID),
    );
    expect(await res.json()).toEqual({ context: null });
  });

  it("PII: svaret innehåller ENDAST context-fönstret (ingen rå raw_text)", async () => {
    // Stort dokument, litet fönster: before/after ska vara begränsade och råtexten
    // aldrig serialiseras i sin helhet.
    const filler = "fyllnadsord ".repeat(200);
    const big = `${filler}minst tre års dokumenterad erfarenhet ${filler}`;
    tableResults.analyses = {
      data: { id: VALID_UUID, documents: { raw_text: big } },
      error: null,
    };
    const res = await ANALYSIS_GET(
      getReq("analyses", VALID_UUID, "minst tre års dokumenterad erfarenhet") as never,
      ctx(VALID_UUID),
    );
    const body = await res.json();
    expect(Object.keys(body)).toEqual(["context"]);
    expect(body.context.before.length).toBeLessThanOrEqual(200);
    expect(body.context.after.length).toBeLessThanOrEqual(200);
    expect(JSON.stringify(body).length).toBeLessThan(big.length);
  });
});

describe("GET /api/consultants/[id]/evidence-context", () => {
  it("401 utan auth", async () => {
    authUser = null;
    const res = await CONSULTANT_GET(
      getReq("consultants", VALID_UUID, "x") as never,
      ctx(VALID_UUID),
    );
    expect(res.status).toBe(401);
  });

  it("400 vid ogiltigt uuid", async () => {
    const res = await CONSULTANT_GET(
      getReq("consultants", "bad-uuid", "x") as never,
      ctx("bad-uuid"),
    );
    expect(res.status).toBe(400);
  });

  it("404 när konsulten saknas", async () => {
    tableResults.consultants = { data: null, error: { message: "not found" } };
    const res = await CONSULTANT_GET(
      getReq("consultants", VALID_UUID, "x") as never,
      ctx(VALID_UUID),
    );
    expect(res.status).toBe(404);
  });

  it("200 {context:null} när raw_cv_text saknas (äldre/manuell konsult)", async () => {
    tableResults.consultants = { data: { raw_cv_text: null }, error: null };
    const res = await CONSULTANT_GET(
      getReq("consultants", VALID_UUID, "erfarenhet av upphandling") as never,
      ctx(VALID_UUID),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ context: null });
  });

  it("200 med kontext ur CV-texten", async () => {
    tableResults.consultants = { data: { raw_cv_text: CV_TEXT }, error: null };
    const res = await CONSULTANT_GET(
      getReq("consultants", VALID_UUID, "erfarenhet av upphandling") as never,
      ctx(VALID_UUID),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.context.quote).toBe("erfarenhet av upphandling");
    expect(body.context.before).toContain("Anna");
  });
});
