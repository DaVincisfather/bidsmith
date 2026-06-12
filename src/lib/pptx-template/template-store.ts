import { mkdir, rename, writeFile } from "fs/promises";
import { existsSync } from "fs";
import os from "os";
import path from "path";
import { createServiceClient } from "@/lib/supabase";
import { TemplateManifestSchema, type TemplateManifest } from "./manifest-types";

export const TEMPLATE_BUCKET = "bid-templates";

export class TemplateMissingError extends Error {
  constructor(ref: string) {
    super(`templates-rad saknas (${ref}) — applicera migration 004 eller ladda upp mallen`);
    this.name = "TemplateMissingError";
  }
}

export class InvalidManifestError extends Error {
  constructor(ref: string, cause: unknown) {
    super(`templates.manifest för ${ref} matchar inte TemplateManifestSchema: ${String(cause)}`);
    this.name = "InvalidManifestError";
  }
}

export interface LoadedTemplate {
  id: string;
  name: string;
  version: number;
  manifest: TemplateManifest;
  /** Absolut sökväg till lokal .pptx (bundlad i repo eller nedladdad till tmp) */
  templateFile: string;
}

// Samma cachepolicy som budget-loader hade: lyckade laddningar cachas, fel cachas inte.
const cache = new Map<string, LoadedTemplate>();

export function clearTemplateCache(id?: string): void {
  if (id === undefined) cache.clear();
  else cache.delete(id);
}

interface TemplateRow {
  id: string;
  name: string;
  version: number;
  storage_path: string | null;
  manifest: unknown;
}

export async function loadTemplate(templateId: string): Promise<LoadedTemplate> {
  const cached = cache.get(templateId);
  if (cached) return cached;

  // Service-klienten av samma skäl som budget-loader: anropas utanför
  // Next:s request-scope (evals, tsx-skript, worker i fas 3).
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("templates")
    .select("id, name, version, storage_path, manifest")
    .eq("id", templateId)
    .single();

  // PGRST116 = PostgREST "no rows" — enda felkoden som betyder "rad saknas".
  // Andra fel är transienta (nät, RLS, schema-drift) och får inte tolkas om till
  // "applicera migration 004".
  if (error && error.code !== "PGRST116") {
    throw new Error(`Supabase query failed for templates(id='${templateId}'): ${error.message}`);
  }
  if (!data) throw new TemplateMissingError(`id='${templateId}'`);

  const tpl = await materialize(data as TemplateRow);
  cache.set(templateId, tpl);
  return tpl;
}

/** Legacy-bids (template_id null) och fallback: ladda per namn+version. */
export async function loadTemplateByName(
  name: string,
  version = 1,
): Promise<LoadedTemplate> {
  const cacheKey = `${name}@${version}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("templates")
    .select("id, name, version, storage_path, manifest")
    .eq("name", name)
    .eq("version", version)
    .single();

  if (error && error.code !== "PGRST116") {
    throw new Error(`Supabase query failed for templates(name='${name}'): ${error.message}`);
  }
  if (!data) throw new TemplateMissingError(`name='${name}' v${version}`);

  const tpl = await materialize(data as TemplateRow);
  cache.set(cacheKey, tpl);
  cache.set(tpl.id, tpl);
  return tpl;
}

async function materialize(row: TemplateRow): Promise<LoadedTemplate> {
  const ref = `${row.name} v${row.version}`;
  const parsed = TemplateManifestSchema.safeParse(row.manifest);
  if (!parsed.success) throw new InvalidManifestError(ref, parsed.error.message);

  let templateFile: string;
  if (row.storage_path === null) {
    // Bundlad mall — repo-disk, samma resolution som gamla registryt.
    templateFile = path.resolve("templates", `${row.name}.pptx`);
  } else {
    templateFile = await downloadToTmp(row);
  }

  return {
    id: row.id,
    name: row.name,
    version: row.version,
    manifest: parsed.data,
    templateFile,
  };
}

async function downloadToTmp(row: TemplateRow): Promise<string> {
  const dir = path.join(os.tmpdir(), "bidsmith-templates");
  const file = path.join(dir, `${row.name}-v${row.version}.pptx`);
  // Append-only versionering (unique(name, version)) gör tmp-filen immutable —
  // finns den redan är den korrekt.
  if (existsSync(file)) return file;

  const supabase = createServiceClient();
  const { data, error } = await supabase.storage
    .from(TEMPLATE_BUCKET)
    .download(row.storage_path!);
  if (error || !data) {
    throw new Error(
      `kunde inte ladda ner mall '${row.name}' från storage (${row.storage_path}): ${error?.message ?? "tom respons"}`,
    );
  }
  await mkdir(dir, { recursive: true });
  // Skriv till tempnamn + rename så existsSync-kortslutningen ovan aldrig kan
  // träffa en halvskriven fil (krasch mitt i writeFile ger annars permanent
  // trasig cache — rename inom samma katalog är atomiskt).
  const partial = `${file}.${process.pid}.partial`;
  await writeFile(partial, Buffer.from(await data.arrayBuffer()));
  await rename(partial, file);
  return file;
}
