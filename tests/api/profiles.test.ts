// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// Same mock surface as templates.test.ts: auth via authUser, per-table results
// via tableResults, writes captured in inserted/updated. Profile create/patch
// go through the cookie client; activate uses the service client.

let authUser: { id: string } | null;
const tableResults: Record<string, { data: unknown; error: unknown }> = {};
const inserted: Record<string, unknown[]> = {};
const updated: Record<string, unknown[]> = {};

function builder(table: string) {
  const result = () =>
    Promise.resolve(tableResults[table] ?? { data: null, error: null });
  const chain: Record<string, unknown> = {};
  const ret = () => chain;
  chain.select = ret;
  chain.eq = ret;
  chain.order = ret;
  chain.limit = ret;
  chain.single = result;
  chain.maybeSingle = result;
  chain.insert = (row: unknown) => {
    (inserted[table] ??= []).push(row);
    return chain;
  };
  chain.update = (row: unknown) => {
    (updated[table] ??= []).push(row);
    return chain;
  };
  chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
    result().then(onF, onR);
  return chain;
}

const client = {
  from: (table: string) => builder(table),
  auth: { getUser: () => Promise.resolve({ data: { user: authUser } }) },
};

vi.mock("@/lib/supabase", () => ({
  createServiceClient: () => client,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.resolve(client),
}));

import { GET, POST } from "@/app/api/profiles/route";
import { PATCH } from "@/app/api/profiles/[id]/route";
import { POST as ACTIVATE } from "@/app/api/profiles/[id]/activate/route";

const VALID_UUID = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  authUser = { id: "user-1" };
  for (const k of Object.keys(tableResults)) delete tableResults[k];
  for (const k of Object.keys(inserted)) delete inserted[k];
  for (const k of Object.keys(updated)) delete updated[k];
});

function jsonReq(body: unknown): Request {
  return new Request("http://t/api/profiles", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/profiles", () => {
  it("401 utan auth", async () => {
    authUser = null;
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("listar profiler", async () => {
    tableResults.org_profiles = {
      data: [{ id: VALID_UUID, company_name: "Testbolaget AB" }],
      error: null,
    };
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).profiles).toHaveLength(1);
  });
});

describe("POST /api/profiles", () => {
  it("401 utan auth", async () => {
    authUser = null;
    const res = await POST(jsonReq({ companyName: "X" }) as never);
    expect(res.status).toBe(401);
  });

  it("400 vid ogiltig body (saknat companyName)", async () => {
    const res = await POST(jsonReq({ tonality: "rak" }) as never);
    expect(res.status).toBe(400);
  });

  it("happy path — skapar profil, mappar camelCase→snake_case, 201", async () => {
    tableResults.org_profiles = {
      data: { id: VALID_UUID, company_name: "Testbolaget AB" },
      error: null,
    };
    const res = await POST(
      jsonReq({
        companyName: "Testbolaget AB",
        tonality: "Rak, konkret.",
        colors: { primary: "#7A1F2B" },
      }) as never
    );
    expect(res.status).toBe(201);
    expect(inserted.org_profiles?.[0]).toEqual({
      company_name: "Testbolaget AB",
      tonality: "Rak, konkret.",
      boilerplate: null,
      colors: { primary: "#7A1F2B" },
    });
  });
});

describe("PATCH /api/profiles/[id]", () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
  const patchReq = (body: unknown) =>
    new Request("http://t/api/profiles/x", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("401 utan auth", async () => {
    authUser = null;
    const res = await PATCH(patchReq({ companyName: "Y" }) as never, ctx(VALID_UUID));
    expect(res.status).toBe(401);
  });

  it("400 vid ogiltigt uuid", async () => {
    const res = await PATCH(patchReq({ companyName: "Y" }) as never, ctx("bad-uuid"));
    expect(res.status).toBe(400);
  });

  it("partiell uppdatering — mappar bara skickade fält", async () => {
    tableResults.org_profiles = {
      data: [{ id: VALID_UUID, company_name: "Nytt namn" }],
      error: null,
    };
    const res = await PATCH(patchReq({ companyName: "Nytt namn" }) as never, ctx(VALID_UUID));
    expect(res.status).toBe(200);
    expect(updated.org_profiles?.[0]).toEqual({ company_name: "Nytt namn" });
  });

  it("404 när raden saknas (update matchar noll rader)", async () => {
    tableResults.org_profiles = { data: [], error: null };
    const res = await PATCH(patchReq({ companyName: "Y" }) as never, ctx(VALID_UUID));
    expect(res.status).toBe(404);
  });
});

describe("POST /api/profiles/[id]/activate", () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  it("401 utan auth", async () => {
    authUser = null;
    const res = await ACTIVATE({} as never, ctx(VALID_UUID));
    expect(res.status).toBe(401);
  });

  it("400 vid ogiltigt uuid", async () => {
    const res = await ACTIVATE({} as never, ctx("bad-uuid"));
    expect(res.status).toBe(400);
  });

  it("404 när profilen saknas", async () => {
    tableResults.org_profiles = { data: null, error: null };
    const res = await ACTIVATE({} as never, ctx(VALID_UUID));
    expect(res.status).toBe(404);
  });

  it("UPSERT update — befintlig workspace_settings-rad", async () => {
    tableResults.org_profiles = { data: { id: VALID_UUID }, error: null };
    tableResults.workspace_settings = { data: { id: "ws-1" }, error: null };
    const res = await ACTIVATE({} as never, ctx(VALID_UUID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ activated: VALID_UUID });
    expect(updated.workspace_settings?.[0]).toEqual({ active_profile_id: VALID_UUID });
    expect(inserted.workspace_settings).toBeUndefined();
  });

  it("UPSERT insert — tom workspace_settings-tabell (kritiska fallet)", async () => {
    tableResults.org_profiles = { data: { id: VALID_UUID }, error: null };
    tableResults.workspace_settings = { data: null, error: null };
    const res = await ACTIVATE({} as never, ctx(VALID_UUID));
    expect(res.status).toBe(200);
    expect(inserted.workspace_settings?.[0]).toEqual({ active_profile_id: VALID_UUID });
    expect(updated.workspace_settings).toBeUndefined();
  });
});
