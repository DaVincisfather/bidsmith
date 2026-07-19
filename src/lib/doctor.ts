/**
 * Preflight checks for a fresh install (npm run doctor): env, Supabase
 * reachability, migration sentinels, storage buckets, bundled template file.
 * Pure check-runner with injected deps so the logic is unit-testable; the CLI
 * (scripts/doctor.ts) builds real deps and prints the checklist.
 */

export interface DoctorCheck {
  name: string;
  ok: boolean;
  /** Swedish operator guidance shown on failure. */
  fix?: string;
}

export interface DoctorResult {
  checks: DoctorCheck[];
  ok: boolean;
}

/** Minimal surface of the Supabase service client the doctor uses. */
export interface DoctorDb {
  selectOne(table: string, column: string): Promise<{ error: { message: string } | null }>;
  bundledTemplateRowExists(): Promise<{ exists: boolean; error: string | null }>;
  listBucketNames(): Promise<{ names: string[]; error: string | null }>;
}

export interface DoctorDeps {
  env: Record<string, string | undefined>;
  /** Pings the Supabase REST root; resolves false on network failure. */
  pingSupabase: () => Promise<boolean>;
  /** null when required env is missing — DB checks degrade with guidance. */
  db: DoctorDb | null;
  fileExists: (relPath: string) => boolean;
}

export const REQUIRED_ENV = [
  "ANTHROPIC_API_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

/** Sentinel per significant migration: [namn, tabell, kolumn, migrationsfil]. */
const SENTINELS: Array<[string, string, string, string]> = [
  ["Tabell templates", "templates", "id", "004_templates.sql"],
  ["Tabell org_profiles", "org_profiles", "id", "005_org_profiles.sql"],
  ["Tabell template_profiles", "template_profiles", "id", "008_template_profiles.sql"],
  ["Kolumn consultants.extraction_version", "consultants", "extraction_version", "011_consultant_extraction_version.sql"],
  ["Kolumn templates.onboarding_status", "templates", "onboarding_status", "012_template_onboarding.sql"],
];

const REQUIRED_BUCKETS = ["rfp-documents", "consultant-cvs", "bid-templates"] as const;

const SETUP_HINT =
  "kör supabase/setup.sql i SQL Editor (ny installation) eller applicera migrationsfilen";

export async function runDoctor(deps: DoctorDeps): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];

  for (const key of REQUIRED_ENV) {
    checks.push({
      name: `Env: ${key}`,
      ok: Boolean(deps.env[key]),
      fix: `lägg till ${key} i .env.local (SETUP.md steg 2)`,
    });
  }
  const envOk = checks.every((c) => c.ok);

  if (!envOk || deps.db === null) {
    checks.push({
      name: "Supabase-checkar",
      ok: false,
      fix: "kräver env-nycklarna ovan — åtgärda dem och kör npm run doctor igen",
    });
  } else {
    const reachable = await deps.pingSupabase();
    checks.push({
      name: "Supabase nåbar",
      ok: reachable,
      fix: "kontrollera NEXT_PUBLIC_SUPABASE_URL; free-tier-projekt pausar efter ~7 dagars inaktivitet — återställ i Supabase-dashboarden (~5 min boot)",
    });

    if (reachable) {
      for (const [name, table, column, migration] of SENTINELS) {
        const { error } = await deps.db.selectOne(table, column);
        checks.push({
          name: `${name} (${migration})`,
          ok: error === null,
          fix: `migration ${migration} verkar inte applicerad — ${SETUP_HINT}`,
        });
      }

      const row = await deps.db.bundledTemplateRowExists();
      checks.push({
        name: "Bundlade mallen seedad (templates: anbudsmall-v2 v1)",
        ok: row.error === null && row.exists,
        fix: `004_templates.sql:s seed saknas — anbudsgenerering/export fungerar inte utan den; ${SETUP_HINT}`,
      });

      const buckets = await deps.db.listBucketNames();
      for (const bucket of REQUIRED_BUCKETS) {
        checks.push({
          name: `Storage-bucket: ${bucket}`,
          ok: buckets.error === null && buckets.names.includes(bucket),
          fix: `skapa den privata bucketen '${bucket}' — ingår i supabase/setup.sql`,
        });
      }
    }
  }

  checks.push({
    name: "Mallfil: templates/anbudsmall-v2.pptx",
    ok: deps.fileExists("templates/anbudsmall-v2.pptx"),
    fix: "filen saknas i repot — klona om eller återställ templates/-katalogen",
  });

  return { checks, ok: checks.every((c) => c.ok) };
}
