// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFile } from "fs/promises";
import path from "path";

// --- Mock surface -----------------------------------------------------------
//
// Routes use two clients: the cookie client (@/lib/supabase/server) only for
// getUserId-auth, and the service client (@/lib/supabase) for all DB/storage
// work. We control auth via authUser and per-table results via tableResults.
//
// The query builder is a chainable thenable: every terminal form the routes
// use (.order(), .maybeSingle(), .single(), .eq()…) resolves to the result
// registered for that table. Writes are captured so UPSERT branching and the
// camelCase→snake_case mapping can be asserted.

let authUser: { id: string } | null;
const tableResults: Record<string, { data: unknown; error: unknown }> = {};
const inserted: Record<string, unknown[]> = {};
const updated: Record<string, unknown[]> = {};
const uploadMock = vi.fn();

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
  // Thenable so `await supabase.from(t).update().eq()` resolves directly.
  chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
    result().then(onF, onR);
  return chain;
}

const serviceClient = {
  from: (table: string) => builder(table),
  storage: { from: () => ({ upload: uploadMock }) },
};

vi.mock("@/lib/supabase", () => ({
  createServiceClient: () => serviceClient,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () =>
    Promise.resolve({
      from: (table: string) => builder(table),
      auth: { getUser: () => Promise.resolve({ data: { user: authUser } }) },
    }),
}));

vi.mock("@/lib/pptx-template/template-store", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/pptx-template/template-store")
  >("@/lib/pptx-template/template-store");
  return { ...actual, clearTemplateCache: vi.fn() };
});

import { GET, POST } from "@/app/api/templates/route";
import { POST as ACTIVATE } from "@/app/api/templates/[id]/activate/route";
import { clearTemplateCache } from "@/lib/pptx-template/template-store";

const clearTemplateCacheMock = vi.mocked(clearTemplateCache);

const VALID_UUID = "00000000-0000-0000-0000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  authUser = { id: "user-1" };
  for (const k of Object.keys(tableResults)) delete tableResults[k];
  for (const k of Object.keys(inserted)) delete inserted[k];
  for (const k of Object.keys(updated)) delete updated[k];
  uploadMock.mockResolvedValue({ error: null });
});

async function pptxFile(): Promise<File> {
  const buf = await readFile(path.resolve("templates", "anbudsmall-v2.pptx"));
  return new File([buf], "Min Anbudsmall.pptx", {
    type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
}

describe("GET /api/templates", () => {
  it("401 utan auth", async () => {
    authUser = null;
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("listar mallar", async () => {
    tableResults.templates = {
      data: [{ id: VALID_UUID, name: "anbudsmall-v2", version: 1 }],
      error: null,
    };
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.templates).toHaveLength(1);
  });
});

describe("POST /api/templates", () => {
  it("401 utan auth", async () => {
    authUser = null;
    const form = new FormData();
    form.set("file", await pptxFile());
    const req = new Request("http://t/api/templates", { method: "POST", body: form });
    const res = await POST(req as never);
    expect(res.status).toBe(401);
  });

  it("400 vid fel filtyp", async () => {
    const form = new FormData();
    form.set("file", new File([Buffer.from("hej")], "cv.pdf", { type: "application/pdf" }));
    const req = new Request("http://t/api/templates", { method: "POST", body: form });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("happy path — introspekterar riktig pptx, version 1, sparar + rensar cache", async () => {
    // Ingen tidigare version → maybeSingle på templates ger null → version 1.
    tableResults.templates = { data: { id: "new-id" }, error: null };

    const form = new FormData();
    form.set("file", await pptxFile());
    const req = new Request("http://t/api/templates", { method: "POST", body: form });
    const res = await POST(req as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("new-id");
    // Filnamnet "Min Anbudsmall.pptx" → slug "min-anbudsmall".
    expect(body.name).toBe("min-anbudsmall");
    expect(body.version).toBe(1);
    // Den riktiga introspektionskedjan körde → 13 slides, inga varningar.
    expect(body.manifest.slides).toHaveLength(13);
    expect(body.warnings).toEqual([]);

    // Storage-uppladdning till name/v1.pptx + insert med samma version.
    expect(uploadMock).toHaveBeenCalledWith(
      "min-anbudsmall/v1.pptx",
      expect.anything(),
      expect.objectContaining({ contentType: expect.stringContaining("presentationml") })
    );
    expect(inserted.templates?.[0]).toMatchObject({
      name: "min-anbudsmall",
      version: 1,
      storage_path: "min-anbudsmall/v1.pptx",
    });
    expect(clearTemplateCacheMock).toHaveBeenCalled();
  });

  it("nästa version blir prev+1", async () => {
    // Routen läser senaste versionen (maybeSingle) FÖRE insert. Båda träffar
    // tabellen "templates"; sätt resultatet till prev-versionen.
    tableResults.templates = { data: { version: 3, id: "new-id" }, error: null };

    const form = new FormData();
    form.set("file", await pptxFile());
    const req = new Request("http://t/api/templates", { method: "POST", body: form });
    const res = await POST(req as never);

    const body = await res.json();
    expect(body.version).toBe(4);
    expect(uploadMock).toHaveBeenCalledWith(
      "min-anbudsmall/v4.pptx",
      expect.anything(),
      expect.anything()
    );
  });
});

describe("POST /api/templates/[id]/activate", () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  it("401 utan auth", async () => {
    authUser = null;
    const res = await ACTIVATE({} as never, ctx(VALID_UUID));
    expect(res.status).toBe(401);
  });

  it("400 vid ogiltigt uuid", async () => {
    const res = await ACTIVATE({} as never, ctx("not-a-uuid"));
    expect(res.status).toBe(400);
  });

  it("404 när mallen saknas", async () => {
    tableResults.templates = { data: null, error: null };
    const res = await ACTIVATE({} as never, ctx(VALID_UUID));
    expect(res.status).toBe(404);
  });

  it("UPSERT update — befintlig workspace_settings-rad", async () => {
    tableResults.templates = { data: { id: VALID_UUID }, error: null };
    tableResults.workspace_settings = { data: { id: "ws-1" }, error: null };

    const res = await ACTIVATE({} as never, ctx(VALID_UUID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ activated: VALID_UUID });
    // Befintlig rad → update-grenen, ingen insert.
    expect(updated.workspace_settings?.[0]).toEqual({ active_template_id: VALID_UUID });
    expect(inserted.workspace_settings).toBeUndefined();
  });

  it("UPSERT insert — tom workspace_settings-tabell (kritiska fallet)", async () => {
    tableResults.templates = { data: { id: VALID_UUID }, error: null };
    tableResults.workspace_settings = { data: null, error: null };

    const res = await ACTIVATE({} as never, ctx(VALID_UUID));
    expect(res.status).toBe(200);
    // Tom tabell → insert-grenen, ingen tyst no-op-update.
    expect(inserted.workspace_settings?.[0]).toEqual({ active_template_id: VALID_UUID });
    expect(updated.workspace_settings).toBeUndefined();
  });
});
