import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

function isRetryable(error: unknown): boolean {
  if (error instanceof Anthropic.APIError) {
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

interface CallClaudeOptions<T> {
  model: string;
  maxTokens: number;
  system: string;
  userContent: string;
  schema: z.ZodType<T>;
  label: string;
}

export async function callClaude<T>({
  model,
  maxTokens,
  system,
  userContent,
  schema,
  label,
}: CallClaudeOptions<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const message = await getClient().messages.create({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: userContent }],
      });

      const content = message.content[0];
      if (content.type !== "text") {
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

// Extract JSON by finding matching braces — handles nested objects correctly
function extractJson(text: string): string | null {
  // Prefer ```json code blocks
  const codeBlock = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (codeBlock) return codeBlock[1];

  // Find first { and match braces
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") depth--;
    if (depth === 0) return text.slice(start, i + 1);
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
