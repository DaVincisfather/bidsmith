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
const tableResults: Record<
  string,
  { data: unknown; error: unknown; count?: number }
> = {};
const inserted: Record<string, unknown[]> = {};
const updated: Record<string, unknown[]> = {};
const upserted: Record<string, unknown[]> = {};
const uploadMock = vi.fn();
const removeMock = vi.fn();

function builder(table: string) {
  const result = () =>
    Promise.resolve(tableResults[table] ?? { data: null, error: null });
  const chain: Record<string, unknown> = {};
  const ret = () => chain;
  chain.select = ret;
  chain.eq = ret;
  chain.order = ret;
  chain.limit = ret;
  chain.delete = ret;
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
  // profile-store upserts template_profiles after the templates insert.
  chain.upsert = (row: unknown) => {
    (upserted[table] ??= []).push(row);
    return chain;
  };
  // Thenable so `await supabase.from(t).update().eq()` resolves directly.
  chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
    result().then(onF, onR);
  return chain;
}

const serviceClient = {
  from: (table: string) => builder(table),
  storage: { from: () => ({ upload: uploadMock, remove: removeMock }) },
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
import { DELETE } from "@/app/api/templates/[id]/route";
import { clearTemplateCache } from "@/lib/pptx-template/template-store";

const clearTemplateCacheMock = vi.mocked(clearTemplateCache);

const VALID_UUID = "00000000-0000-0000-0000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  authUser = { id: "user-1" };
  for (const k of Object.keys(tableResults)) delete tableResults[k];
  for (const k of Object.keys(inserted)) delete inserted[k];
  for (const k of Object.keys(updated)) delete updated[k];
  for (const k of Object.keys(upserted)) delete upserted[k];
  uploadMock.mockResolvedValue({ error: null });
  removeMock.mockResolvedValue({ error: null });
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
    // A starting profile is derived from the manifest and upserted for the new
    // template (slice 5a), carrying the real template id + version.
    expect(upserted.template_profiles?.[0]).toMatchObject({ template_id: "new-id" });
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
    // onboarding_status: "none" speglar migration 012:s default för befintliga rader.
    tableResults.templates = {
      data: { id: VALID_UUID, onboarding_status: "none" },
      error: null,
    };
    tableResults.workspace_settings = { data: { id: "ws-1" }, error: null };

    const res = await ACTIVATE({} as never, ctx(VALID_UUID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ activated: VALID_UUID });
    // Befintlig rad → update-grenen, ingen insert.
    expect(updated.workspace_settings?.[0]).toEqual({ active_template_id: VALID_UUID });
    expect(inserted.workspace_settings).toBeUndefined();
  });

  it("UPSERT insert — tom workspace_settings-tabell (kritiska fallet)", async () => {
    tableResults.templates = {
      data: { id: VALID_UUID, onboarding_status: "none" },
      error: null,
    };
    tableResults.workspace_settings = { data: null, error: null };

    const res = await ACTIVATE({} as never, ctx(VALID_UUID));
    expect(res.status).toBe(200);
    // Tom tabell → insert-grenen, ingen tyst no-op-update.
    expect(inserted.workspace_settings?.[0]).toEqual({ active_template_id: VALID_UUID });
    expect(updated.workspace_settings).toBeUndefined();
  });

  it("409 när mallen är mitt i onboardingen (onboarding_status: draft)", async () => {
    // Grinden: en halvfärdig kundmall kan inte rendera → får inte bli aktiv.
    tableResults.templates = {
      data: { id: VALID_UUID, onboarding_status: "draft" },
      error: null,
    };

    const res = await ACTIVATE({} as never, ctx(VALID_UUID));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/onboard/);
    // Ingen skrivning mot workspace_settings när vi vägrar.
    expect(updated.workspace_settings).toBeUndefined();
    expect(inserted.workspace_settings).toBeUndefined();
  });
});

describe("DELETE /api/templates/[id]", () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  it("401 utan auth", async () => {
    authUser = null;
    const res = await DELETE({} as never, ctx(VALID_UUID));
    expect(res.status).toBe(401);
  });

  it("400 vid ogiltigt uuid", async () => {
    const res = await DELETE({} as never, ctx("not-a-uuid"));
    expect(res.status).toBe(400);
  });

  it("404 när mallen saknas", async () => {
    tableResults.templates = { data: null, error: null };
    const res = await DELETE({} as never, ctx(VALID_UUID));
    expect(res.status).toBe(404);
  });

  it("409 när mallen är aktiv", async () => {
    tableResults.templates = { data: { id: VALID_UUID, storage_path: "min/v1.pptx" }, error: null };
    tableResults.workspace_settings = { data: { id: "ws-1" }, error: null };

    const res = await DELETE({} as never, ctx(VALID_UUID));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/aktiv/);
    // Ingen radering, ingen storage-städning när vi vägrar.
    expect(removeMock).not.toHaveBeenCalled();
  });

  it("409 när anbud refererar mallen", async () => {
    tableResults.templates = { data: { id: VALID_UUID, storage_path: "min/v1.pptx" }, error: null };
    tableResults.workspace_settings = { data: null, error: null };
    tableResults.bids = { data: null, error: null, count: 2 };

    const res = await DELETE({} as never, ctx(VALID_UUID));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("mallen används av 2 anbud");
    expect(removeMock).not.toHaveBeenCalled();
  });

  it("happy path — raderar rad, städar storage, rensar cache", async () => {
    tableResults.templates = {
      data: { id: VALID_UUID, storage_path: "min-anbudsmall/v1.pptx" },
      error: null,
    };
    tableResults.workspace_settings = { data: null, error: null };
    tableResults.bids = { data: null, error: null, count: 0 };

    const res = await DELETE({} as never, ctx(VALID_UUID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true });
    expect(removeMock).toHaveBeenCalledWith(["min-anbudsmall/v1.pptx"]);
    expect(clearTemplateCacheMock).toHaveBeenCalledWith(VALID_UUID);
  });

  it("storage-fel är icke-fatalt — raderingen lyckas ändå", async () => {
    tableResults.templates = {
      data: { id: VALID_UUID, storage_path: "min-anbudsmall/v1.pptx" },
      error: null,
    };
    tableResults.workspace_settings = { data: null, error: null };
    tableResults.bids = { data: null, error: null, count: 0 };
    removeMock.mockResolvedValue({ error: { message: "boom" } });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await DELETE({} as never, ctx(VALID_UUID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true });
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("bundlad mall (storage_path null) — 409, kan inte återskapas via appen", async () => {
    // Routine-fynd #65: bundlade mallar seedas via migration; en radering är
    // permanent utan UI-väg tillbaka → vägra.
    tableResults.templates = { data: { id: VALID_UUID, storage_path: null }, error: null };

    const res = await DELETE({} as never, ctx(VALID_UUID));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/bundlad/);
    expect(removeMock).not.toHaveBeenCalled();
  });

  it("guard-DB-fel ger 500 — faller ALDRIG igenom till raderingen", async () => {
    tableResults.templates = { data: { id: VALID_UUID, storage_path: "x/v1.pptx" }, error: null };
    tableResults.workspace_settings = { data: null, error: { message: "transient" } };

    const res = await DELETE({} as never, ctx(VALID_UUID));
    expect(res.status).toBe(500);
  });
});
