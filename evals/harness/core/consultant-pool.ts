import fs from "fs/promises";
import { parse as parseYaml } from "yaml";
import { ConsultantPoolSchema, type SyntheticConsultant } from "./fixtures";

export async function loadConsultantPool(filePath: string): Promise<SyntheticConsultant[]> {
  const content = await fs.readFile(filePath, "utf-8");
  const raw = parseYaml(content);
  const parsed = ConsultantPoolSchema.parse(raw);
  return parsed.consultants;
}

export function getConsultantsByIds(
  pool: SyntheticConsultant[],
  ids: string[]
): SyntheticConsultant[] {
  const byId = new Map(pool.map((c) => [c.id, c]));
  const result: SyntheticConsultant[] = [];
  for (const id of ids) {
    const c = byId.get(id);
    if (!c) throw new Error(`unknown consultant_id: ${id}`);
    result.push(c);
  }
  return result;
}
