import Anthropic, { APIError } from "@anthropic-ai/sdk";
import { z } from "zod";

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

function isRetryable(error: unknown): boolean {
  if (error instanceof APIError) {
    return error.status === 429 || error.status === 529 || error.status >= 500;
  }
  if (error instanceof Error && error.message.includes("fetch failed")) {
    return true;
  }
  return false;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type ClaudeEffort = "low" | "medium" | "high" | "max";

interface CallClaudeOptions<T> {
  model: string;
  maxTokens: number;
  system: string;
  userContent: string;
  schema: z.ZodType<T>;
  label: string;
  // Opus 4.7+ adaptive thinking. When set, enables reasoning budget via
  // output_config.effort. Omit for Sonnet/Haiku calls that don't need it.
  effort?: ClaudeEffort;
}

export async function callClaude<T>({
  model,
  maxTokens,
  system,
  userContent,
  schema,
  label,
  effort,
}: CallClaudeOptions<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const message = await getClient().messages.create({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: userContent }],
        ...(effort
          ? {
              thinking: { type: "adaptive" as const },
              output_config: { effort },
            }
          : {}),
      });

      // With adaptive thinking the first block is "thinking"; the text
      // block follows. Find the first text block rather than indexing.
      const content = message.content.find((b) => b.type === "text");
      if (!content || content.type !== "text") {
        throw new Error(`Unexpected response type for ${label}`);
      }

      const json = extractJson(content.text);
      if (!json) {
        throw new Error(`No JSON found in response for ${label}`);
      }

      return parseAndValidate(json, schema, label);
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES - 1 && isRetryable(error)) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }

  throw lastError;
}

// Extract JSON by finding matching braces — ignores braces inside string literals
// so values like {"msg": "hello } world"} parse correctly.
export function extractJson(text: string): string | null {
  // Prefer ```json code blocks
  const codeBlock = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (codeBlock) return codeBlock[1];

  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function parseAndValidate<T>(
  jsonStr: string,
  schema: z.ZodType<T>,
  label: string
): T {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Invalid JSON in response for ${label}`);
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid ${label} response: ${parsed.error.message}`);
  }
  return parsed.data;
}
