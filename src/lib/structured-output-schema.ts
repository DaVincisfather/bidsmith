import { z } from "zod";

// Nyckelord som Anthropic structured outputs avvisar. Constraints upprätthålls
// ändå klient-side av Zod-safeParse i ai-client.ts — här tas de bara bort ur
// det schema som skickas till API:t.
const UNSUPPORTED_KEYWORDS = new Set([
  "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
  "minLength", "maxLength", "pattern",
  "minItems", "maxItems", "uniqueItems",
]);

function sanitize(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitize);
  if (node === null || typeof node !== "object") return node;

  const obj = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (UNSUPPORTED_KEYWORDS.has(key)) continue;
    out[key] = sanitize(value);
  }
  if (out.type === "object") {
    out.additionalProperties = false;
  }
  return out;
}

// Konverterar ett Zod-schema till JSON Schema kompatibelt med Anthropics
// output_config.format. Kastar om schemat innehåller Zod-typer utan
// JSON-motsvarighet — det ska smälla i test, inte tyst i drift.
export function toStructuredOutputSchema(
  schema: z.ZodType,
): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12" });
  return sanitize(json) as Record<string, unknown>;
}
