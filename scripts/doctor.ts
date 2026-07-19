// scripts/doctor.ts
// CLI: npm run doctor
// Preflight for a fresh install: env, Supabase, migrations, buckets, template
// file. Swedish PASS/FAIL checklist with a concrete fix per failure; exit 0/1.
// Loads .env.local ITSELF (no --env-file node flag: that would require Node
// 22.9+ while SETUP.md promises 20+ — the preflight must not crash on exactly
// the installs it exists to help). A missing .env.local is reported as check
// failures, never a startup error.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { runDoctor, type DoctorDb } from "../src/lib/doctor";

function loadEnvLocalIfExists(): void {
  const p = path.resolve(".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
  }
}

function buildDb(): DoctorDb | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return null;
  const supabase = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return {
    async selectOne(table, column) {
      const { error } = await supabase.from(table).select(column).limit(1);
      return { error: error ? { message: error.message } : null };
    },
    async bundledTemplateRowExists() {
      const { data, error } = await supabase
        .from("templates")
        .select("id")
        .eq("name", "anbudsmall-v2")
        .eq("version", 1)
        .maybeSingle();
      return { exists: data !== null, error: error ? error.message : null };
    },
    async listBucketNames() {
      const { data, error } = await supabase.storage.listBuckets();
      return { names: (data ?? []).map((b) => b.name), error: error ? error.message : null };
    },
  };
}

async function pingSupabase(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return false;
  try {
    // Timeout so a hanging connection can't lock the preflight.
    await fetch(`${url}/rest/v1/`, {
      headers: { apikey: anon },
      signal: AbortSignal.timeout(5000),
    });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  loadEnvLocalIfExists();
  console.log("Bidsmith doctor — preflight för installationen\n");
  const { checks, ok } = await runDoctor({
    env: process.env,
    pingSupabase,
    db: buildDb(),
    fileExists: (rel) => existsSync(path.resolve(rel)),
  });

  for (const c of checks) {
    console.log(`${c.ok ? "✓" : "✗"} ${c.name}`);
    if (!c.ok && c.fix) console.log(`    → ${c.fix}`);
  }
  console.log(ok ? "\nAllt grönt — kör npm run dev." : "\nÅtgärda punkterna ovan och kör npm run doctor igen.");
  process.exitCode = ok ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
