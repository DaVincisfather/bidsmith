// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "path";
import os from "os";
import { existsSync, rmSync } from "fs";

const single = vi.fn();
const maybeSingle = vi.fn();
const download = vi.fn();

// Service-klienten av samma skäl som budget-loader: template-store anropas
// utanför Next:s request-scope (evals, tsx-skript, worker i fas 3) där
// cookie-klienten kraschar. Mock-kedjan speglar både .eq("id").single()
// (loadTemplate) och .eq("name").eq("version").single() (loadTemplateByName).
vi.mock("@/lib/supabase", () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single,
          eq: () => ({ single }),
          maybeSingle,
        }),
        limit: () => ({ maybeSingle }),
        maybeSingle,
      }),
    }),
    storage: { from: () => ({ download }) },
  }),
}));

import {
  loadTemplate,
  loadTemplateByName,
  clearTemplateCache,
  TemplateMissingError,
  InvalidManifestError,
} from "../template-store";

const MANIFEST = {
  manifestVersion: 1,
  name: "anbudsmall-v2",
  slides: [{ source: 1, type: "cover", placeholders: [] }],
  budgets: { "phases[*].objective": 120 },
  fieldSlides: { "phases[*].objective": 7 },
  excludedSlides: [],
};

// tmp-filen är immutable (append-only versionering) → kan finnas kvar från en
// tidigare körning på denna maskin. Rensa den så download anropas deterministiskt.
const TMP_KUNDMALL = path.join(os.tmpdir(), "bidsmith-templates", "kundmall-v1.pptx");

beforeEach(() => {
  vi.clearAllMocks();
  clearTemplateCache();
  if (existsSync(TMP_KUNDMALL)) rmSync(TMP_KUNDMALL);
});

describe("loadTemplate", () => {
  it("bundlad mall (storage_path null) → repo-disk-sökväg", async () => {
    single.mockResolvedValue({
      data: {
        id: "00000000-0000-0000-0000-000000000001",
        name: "anbudsmall-v2",
        version: 1,
        storage_path: null,
        manifest: MANIFEST,
      },
      error: null,
    });
    const tpl = await loadTemplate("00000000-0000-0000-0000-000000000001");
    expect(tpl.templateFile).toBe(path.resolve("templates", "anbudsmall-v2.pptx"));
    expect(tpl.manifest.budgets["phases[*].objective"]).toBe(120);
    expect(download).not.toHaveBeenCalled();
  });

  it("cachear per id — andra anropet träffar inte DB", async () => {
    single.mockResolvedValue({
      data: {
        id: "00000000-0000-0000-0000-000000000001",
        name: "anbudsmall-v2",
        version: 1,
        storage_path: null,
        manifest: MANIFEST,
      },
      error: null,
    });
    await loadTemplate("00000000-0000-0000-0000-000000000001");
    await loadTemplate("00000000-0000-0000-0000-000000000001");
    expect(single).toHaveBeenCalledTimes(1);
  });

  it("saknad rad → TemplateMissingError", async () => {
    single.mockResolvedValue({ data: null, error: { code: "PGRST116", message: "no rows" } });
    await expect(loadTemplate("00000000-0000-0000-0000-00000000dead")).rejects.toThrow(
      /templates-rad saknas/,
    );
    await expect(loadTemplate("00000000-0000-0000-0000-00000000dead")).rejects.toBeInstanceOf(
      TemplateMissingError,
    );
  });

  it("ogiltigt manifest → InvalidManifestError", async () => {
    single.mockResolvedValue({
      data: { id: "x", name: "x", version: 1, storage_path: null, manifest: { trasigt: true } },
      error: null,
    });
    await expect(loadTemplate("x")).rejects.toThrow(/matchar inte TemplateManifestSchema/);
    await expect(loadTemplate("x")).rejects.toBeInstanceOf(InvalidManifestError);
  });

  it("transient Supabase-fel → plain Error (inte TemplateMissingError)", async () => {
    single.mockResolvedValue({
      data: null,
      error: { code: "PGRST301", message: "rate limit exceeded" },
    });
    await expect(loadTemplate("id-x")).rejects.not.toBeInstanceOf(TemplateMissingError);
    await expect(loadTemplate("id-x")).rejects.toThrow(/rate limit exceeded/);
  });

  it("uppladdad mall (storage_path satt) → laddar ner till tmp", async () => {
    single.mockResolvedValue({
      data: {
        id: "id-2",
        name: "kundmall",
        version: 1,
        storage_path: "kundmall/v1.pptx",
        manifest: { ...MANIFEST, name: "kundmall" },
      },
      error: null,
    });
    download.mockResolvedValue({
      data: new Blob([Buffer.from("PK-fake")]),
      error: null,
    });
    const tpl = await loadTemplate("id-2");
    expect(download).toHaveBeenCalledWith("kundmall/v1.pptx");
    expect(tpl.templateFile).toMatch(/kundmall.*v1\.pptx$/);
    expect(existsSync(tpl.templateFile)).toBe(true);
  });
});

describe("loadTemplateByName", () => {
  it("happy path — laddar mall per namn+version", async () => {
    single.mockResolvedValue({
      data: {
        id: "00000000-0000-0000-0000-000000000001",
        name: "anbudsmall-v2",
        version: 1,
        storage_path: null,
        manifest: MANIFEST,
      },
      error: null,
    });
    const tpl = await loadTemplateByName("anbudsmall-v2", 1);
    expect(tpl.id).toBe("00000000-0000-0000-0000-000000000001");
    expect(tpl.templateFile).toBe(path.resolve("templates", "anbudsmall-v2.pptx"));
    // Cachas även per id → loadTemplate på samma id träffar inte DB igen.
    await loadTemplate("00000000-0000-0000-0000-000000000001");
    expect(single).toHaveBeenCalledTimes(1);
  });

  it("saknad rad → TemplateMissingError", async () => {
    single.mockResolvedValue({ data: null, error: { code: "PGRST116", message: "no rows" } });
    await expect(loadTemplateByName("finns-inte", 1)).rejects.toThrow(/templates-rad saknas/);
    await expect(loadTemplateByName("finns-inte", 1)).rejects.toBeInstanceOf(
      TemplateMissingError,
    );
  });
});
