import { createClient } from "@/lib/supabase/server";
import { FieldBudgetsSchema, type FieldBudgets } from "./budget-types";

export class TemplateConfigMissingError extends Error {
  constructor(name: string) {
    super(`template_configs row missing for template '${name}' — applicera migration 017 eller seeda raden via SQL Editor`);
    this.name = "TemplateConfigMissingError";
  }
}

export class InvalidBudgetSchemaError extends Error {
  constructor(name: string, cause: unknown) {
    super(`template_configs.budgets för '${name}' matchar inte FieldBudgetsSchema: ${String(cause)}`);
    this.name = "InvalidBudgetSchemaError";
  }
}

// Failures are deliberately not cached — once Stefan applies the seed or fixes
// the malformed JSONB, the next call should succeed without process restart.
const cache = new Map<string, FieldBudgets>();

export function clearBudgetCache(name?: string): void {
  if (name === undefined) {
    cache.clear();
  } else {
    cache.delete(name);
  }
}

export async function loadBudgets(templateName: string): Promise<FieldBudgets> {
  const cached = cache.get(templateName);
  if (cached !== undefined) return cached;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("template_configs")
    .select("budgets")
    .eq("name", templateName)
    .single();

  // PGRST116 = PostgREST "no rows" — the only error code that means "row missing".
  // Any other error is transient (network, RLS misconfig, schema drift) and must
  // not be silently re-mapped to "applicera migration 017".
  if (error && error.code !== "PGRST116") {
    throw new Error(
      `Supabase query failed for template_configs(name='${templateName}'): ${error.message}`,
    );
  }
  if (!data) {
    throw new TemplateConfigMissingError(templateName);
  }

  const parsed = FieldBudgetsSchema.safeParse(data.budgets);
  if (!parsed.success) {
    throw new InvalidBudgetSchemaError(templateName, parsed.error.message);
  }

  cache.set(templateName, parsed.data);
  return parsed.data;
}
