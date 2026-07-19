// @vitest-environment node
import { describe, expect, it } from "vitest";
import { runDoctor, REQUIRED_ENV, type DoctorDb, type DoctorDeps } from "../doctor";

const fullEnv = Object.fromEntries(REQUIRED_ENV.map((k) => [k, "x"]));

const healthyDb: DoctorDb = {
  selectOne: async () => ({ error: null }),
  bundledTemplateRowExists: async () => ({ exists: true, error: null }),
  listBucketNames: async () => ({
    names: ["rfp-documents", "consultant-cvs", "bid-templates"],
    error: null,
  }),
};

const deps = (over: Partial<DoctorDeps> = {}): DoctorDeps => ({
  env: fullEnv,
  pingSupabase: async () => true,
  db: healthyDb,
  fileExists: () => true,
  ...over,
});

describe("runDoctor", () => {
  it("all green on a complete environment", async () => {
    const { checks, ok } = await runDoctor(deps());
    expect(ok).toBe(true);
    expect(checks.every((c) => c.ok)).toBe(true);
  });

  it("missing env fails those checks and degrades DB checks with guidance", async () => {
    const { checks, ok } = await runDoctor(deps({ env: {}, db: null }));
    expect(ok).toBe(false);
    for (const key of REQUIRED_ENV) {
      expect(checks.find((c) => c.name === `Env: ${key}`)?.ok).toBe(false);
    }
    const degraded = checks.find((c) => c.name === "Supabase-checkar");
    expect(degraded?.ok).toBe(false);
    expect(degraded?.fix).toMatch(/env-nycklarna/);
  });

  it("a missing migration table points at setup.sql", async () => {
    const db: DoctorDb = {
      ...healthyDb,
      selectOne: async (table) =>
        table === "template_profiles"
          ? { error: { message: "relation does not exist" } }
          : { error: null },
    };
    const { checks, ok } = await runDoctor(deps({ db }));
    expect(ok).toBe(false);
    const failed = checks.find((c) => c.name.includes("008_template_profiles.sql"));
    expect(failed?.ok).toBe(false);
    expect(failed?.fix).toMatch(/setup\.sql/);
  });

  it("missing seed row and missing bucket fail with concrete fixes", async () => {
    const db: DoctorDb = {
      ...healthyDb,
      bundledTemplateRowExists: async () => ({ exists: false, error: null }),
      listBucketNames: async () => ({ names: ["rfp-documents"], error: null }),
    };
    const { checks, ok } = await runDoctor(deps({ db }));
    expect(ok).toBe(false);
    expect(checks.find((c) => c.name.includes("anbudsmall-v2 v1"))?.ok).toBe(false);
    expect(checks.find((c) => c.name === "Storage-bucket: consultant-cvs")?.ok).toBe(false);
    expect(checks.find((c) => c.name === "Storage-bucket: bid-templates")?.ok).toBe(false);
  });

  it("unreachable Supabase mentions the free-tier pause", async () => {
    const { checks, ok } = await runDoctor(deps({ pingSupabase: async () => false }));
    expect(ok).toBe(false);
    const ping = checks.find((c) => c.name === "Supabase nåbar");
    expect(ping?.ok).toBe(false);
    expect(ping?.fix).toMatch(/pausar/);
  });
});
