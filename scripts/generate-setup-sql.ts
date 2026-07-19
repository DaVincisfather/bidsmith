// scripts/generate-setup-sql.ts
// CLI: npm run gen:setup-sql
// Regenerates supabase/setup.sql from supabase/migrations/ (fresh-install
// bootstrap). Run after EVERY new migration — the drift test in
// src/lib/__tests__/setup-sql.test.ts fails the suite otherwise.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { buildSetupSql, listMigrations } from "../src/lib/setup-sql";

const migrationsDir = path.resolve("supabase", "migrations");
const outPath = path.resolve("supabase", "setup.sql");
const sql = buildSetupSql(migrationsDir);
writeFileSync(outPath, sql, "utf8");
console.log(
  `Skrev ${outPath} (${listMigrations(migrationsDir).length} migrationer + bucket-block).`,
);
