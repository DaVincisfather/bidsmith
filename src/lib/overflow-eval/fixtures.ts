// Single validated loader/writer for evals/overflow/fixtures.json. Replaces
// blind `JSON.parse(...) as FixturesFile` casts at the call sites: a stale,
// truncated or hand-edited file (it is meant to be hand-maintained) fails HERE
// with a schema-shaped error and a remediation hint, not as a confusing
// TypeError deep inside a round's bid generation. New frozen fields get
// validated by extending the schema in this one place.
import { readFile, writeFile } from "fs/promises";
import { z } from "zod";
import type { FixturesFile } from "./types";

const ScoredConsultantSchema = z.object({
  consultantId: z.string(),
  consultantName: z.string(),
  level: z.enum(["junior", "intermediate", "senior", "expert"]),
  score: z.number(),
  reasoning: z.string(),
  prefilterMiss: z.boolean().optional(),
});

const OverflowFixtureSchema = z.object({
  id: z.string(),
  label: z.string(),
  analysisId: z.string(),
  teamConsultantIds: z.array(z.string()),
  teamProposal: z.array(ScoredConsultantSchema),
});

const FixturesFileSchema = z.object({
  templateId: z.string(),
  fixtures: z.array(OverflowFixtureSchema),
});

// Refreeze path only: a fixtures.json written before teamProposal existed lacks
// the field — the repair tool (overflow:bootstrap -- --proposals-only) must be
// able to LOAD exactly the file every other consumer rejects, so teamProposal
// defaults to [] here and is overwritten by the refreeze.
const RefreezeFixturesFileSchema = z.object({
  templateId: z.string(),
  fixtures: z.array(
    OverflowFixtureSchema.extend({
      teamProposal: z.array(ScoredConsultantSchema).default([]),
    }),
  ),
});

async function parseFixturesFile(
  filePath: string,
  schema: typeof FixturesFileSchema | typeof RefreezeFixturesFileSchema,
): Promise<FixturesFile> {
  const parsed = schema.safeParse(JSON.parse(await readFile(filePath, "utf8")));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(
      `${filePath} matchar inte fixtur-schemat (${first?.path.join(".") || "(rot)"}: ${first?.message}) — ` +
      `äldre eller felredigerad fil? Saknas teamProposal: kör npm run overflow:bootstrap -- --proposals-only ` +
      `och committa om filen.`,
    );
  }
  return parsed.data;
}

export async function loadFixturesFile(filePath: string): Promise<FixturesFile> {
  return parseFixturesFile(filePath, FixturesFileSchema);
}

export async function loadFixturesFileForRefreeze(filePath: string): Promise<FixturesFile> {
  return parseFixturesFile(filePath, RefreezeFixturesFileSchema);
}

export async function saveFixturesFile(filePath: string, file: FixturesFile): Promise<void> {
  await writeFile(filePath, JSON.stringify(file, null, 2) + "\n", "utf8");
}
