// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSetupSql, listMigrations } from "../setup-sql";

const MIGRATIONS_DIR = path.resolve("supabase", "migrations");
const SETUP_SQL = path.resolve("supabase", "setup.sql");

describe("supabase/setup.sql (fresh-install bootstrap)", () => {
  it("lists migrations in numeric order", () => {
    const files = listMigrations(MIGRATIONS_DIR);
    expect(files.length).toBeGreaterThanOrEqual(12);
    expect(files[0]).toBe("001_initial_schema.sql");
    expect([...files].sort()).toEqual(files);
  });

  it("committed setup.sql matches the generator output — drift guard", () => {
    // Fails when a migration lands without regenerating the bootstrap.
    // Fix: npm run gen:setup-sql (and commit the result).
    // Line endings normalised: git checks out CRLF on Windows while the
    // generator joins with LF separators — the guard is about CONTENT drift,
    // not the working tree's EOL style (green on CI, was falsely red on Win).
    const norm = (s: string) => s.replace(/\r\n/g, "\n");
    const expected = norm(buildSetupSql(MIGRATIONS_DIR));
    const actual = norm(readFileSync(SETUP_SQL, "utf8"));
    expect(actual).toBe(expected);
  });

  it("creates the two previously-manual buckets and includes every migration", () => {
    const sql = readFileSync(SETUP_SQL, "utf8");
    expect(sql).toContain("insert into storage.buckets (id, name, public) values ('rfp-documents'");
    expect(sql).toContain("insert into storage.buckets (id, name, public) values ('consultant-cvs'");
    for (const file of listMigrations(MIGRATIONS_DIR)) {
      expect(sql).toContain(`-- ===== ${file} =====`);
    }
  });
});
