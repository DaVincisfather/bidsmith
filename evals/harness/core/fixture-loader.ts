import { parse as parseYaml } from "yaml";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";

export function loadFixtureFromString<T>(
  yamlContent: string,
  schema: z.ZodType<T>,
  filename: string
): T {
  let raw: unknown;
  try {
    raw = parseYaml(yamlContent);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[${filename}] malformed YAML: ${msg}`);
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new Error(`[${filename}] schema validation failed: ${result.error.message}`);
  }
  return result.data;
}

export async function loadFixturesFromDir<T>(
  dir: string,
  schema: z.ZodType<T>
): Promise<T[]> {
  const entries = await fs.readdir(dir);
  const yamlFiles = entries.filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  const fixtures: T[] = [];
  for (const file of yamlFiles.sort()) {
    const fullPath = path.join(dir, file);
    const content = await fs.readFile(fullPath, "utf-8");
    fixtures.push(loadFixtureFromString(content, schema, file));
  }
  return fixtures;
}
