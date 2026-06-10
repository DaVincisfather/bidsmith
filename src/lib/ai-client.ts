import Anthropic, { APIError } from "@anthropic-ai/sdk";
import { z } from "zod";
import { logAiCall } from "@/lib/ai-call-logger";
import { toStructuredOutputSchema } from "@/lib/structured-output-schema";

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

// Thrown when a 200 response can't be turned into a schema-valid object
// (no JSON found, wrong content block, JSON.parse failure, Zod mismatch).
// Distinct from transport errors so the retry loop re-prompts: model drift
// (a stray enum alias, an extra field, a truncated array) is almost always
// fixed by a fresh generation rather than hard-failing an expensive call.
class ResponseFormatError extends Error {}

function isRetryable(error: unknown): boolean {
  if (error instanceof ResponseFormatError) {
    return true;
  }
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
  // User attribution for ai_call_logs. Null when caller cannot resolve
  // a user (cron probes, unauthenticated flows). Logged as NULL.
  userId?: string | null;
  // Bid attribution for ai_call_logs — set for bid-generation calls so
  // cost per bid is queryable. Null for calls with no bid.
  bidId?: string | null;
  // Delad kontext (t.ex. formatContext(ctx) i bid-generatorn) som renderas som
  // första system-block med cache_control. Byte-identisk över parallella anrop
  // → prefixet cacheas; den anropsspecifika prompten ligger i block två och
  // invaliderar inte cachen vid overflow-/format-retries.
  cachedContext?: string;
}

export async function callClaude<T>({
  model,
  maxTokens,
  system,
  userContent,
  schema,
  label,
  effort,
  userId,
  bidId,
  cachedContext,
}: CallClaudeOptions<T>): Promise<T> {
  let lastError: unknown;

  // Nödlucka: BIDSMITH_STRUCTURED_OUTPUTS=off återgår till fritext + extractJson
  // om API:t skulle avvisa något sanerat schema i drift. Tas bort i fas 1 om oanvänd.
  const useStructuredOutputs = process.env.BIDSMITH_STRUCTURED_OUTPUTS !== "off";
  // Beräknas EN gång — inte per retry-attempt.
  const outputConfig: Record<string, unknown> = {
    ...(effort ? { effort } : {}),
    ...(useStructuredOutputs
      ? { format: { type: "json_schema", schema: toStructuredOutputSchema(schema) } }
      : {}),
  };

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const startedAt = Date.now();
    try {
      // Streaming is required when the SDK estimates >10 min wall time
      // (max_tokens * 60/128000 > 10). Opus 4.7 + effort=max + 32k tokens
      // trips this. Using .stream().finalMessage() keeps parity with .create()
      // and removes the ceiling uniformly.
      const stream = getClient().messages.stream({
        model,
        max_tokens: maxTokens,
        system: cachedContext
          ? [
              {
                type: "text" as const,
                text: cachedContext,
                cache_control: { type: "ephemeral" as const },
              },
              { type: "text" as const, text: system },
            ]
          : system,
        messages: [{ role: "user", content: userContent }],
        ...(effort ? { thinking: { type: "adaptive" as const } } : {}),
        ...(Object.keys(outputConfig).length > 0
          ? { output_config: outputConfig }
          : {}),
      });
      const message = await stream.finalMessage();

      const u = (message.usage ?? {}) as {
        input_tokens?: number;
        output_tokens?: number;
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
      };
      void logAiCall({
        userId: userId ?? null,
        bidId: bidId ?? null,
        model,
        label,
        inputTokens: u.input_tokens ?? 0,
        outputTokens: u.output_tokens ?? 0,
        cacheReadTokens: u.cache_read_input_tokens ?? 0,
        cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
        latencyMs: Date.now() - startedAt,
      });

      // With adaptive thinking the first block is "thinking"; the text
      // block follows. Find the first text block rather than indexing.
      const content = message.content.find((b) => b.type === "text");
      if (!content || content.type !== "text") {
        throw new ResponseFormatError(`Unexpected response type for ${label}`);
      }

      const json = extractJson(content.text);
      if (!json) {
        throw new ResponseFormatError(`No JSON found in response for ${label}`);
      }

      return parseAndValidate(json, schema, label);
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES - 1 && isRetryable(error)) {
        // Transport errors (429/5xx) get exponential backoff; format errors
        // are model drift with no server to back off from — re-prompt at once.
        if (!(error instanceof ResponseFormatError)) {
          await sleep(BASE_DELAY_MS * Math.pow(2, attempt));
        }
        continue;
      }
      void logAiCall({
        userId: userId ?? null,
        bidId: bidId ?? null,
        model,
        label,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  throw lastError;
}

// Förvärmer prompt-cachen för en modell genom ett max_tokens: 0-anrop med
// enbart det delade kontextblocket. Körs en gång per modellgrupp innan
// parallella bundle-anrop så att de läser cachen istället för att alla
// betala fullpris. Fel sväljs — värmning får aldrig fälla en generering.
// OBS: inget output_config/thinking här — avvisas med max_tokens: 0.
export async function prewarmContextCache(
  model: string,
  cachedContext: string,
): Promise<void> {
  const startedAt = Date.now();
  try {
    const message = await getClient().messages.create({
      model,
      max_tokens: 0,
      system: [
        {
          type: "text" as const,
          text: cachedContext,
          cache_control: { type: "ephemeral" as const },
        },
      ],
      messages: [{ role: "user", content: "warmup" }],
    });
    // Cache-skrivningen kostar 1,25× input — logga så kostnaden per anbud
    // inte undervärderas i ai_call_logs.
    const u = (message.usage ?? {}) as {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
    void logAiCall({
      userId: null,
      bidId: null,
      model,
      label: "context prewarm",
      inputTokens: u.input_tokens ?? 0,
      outputTokens: u.output_tokens ?? 0,
      cacheReadTokens: u.cache_read_input_tokens ?? 0,
      cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
      latencyMs: Date.now() - startedAt,
    });
  } catch {
    // Avsiktligt tyst — cache-miss är bara dyrare, inte fel.
  }
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
    throw new ResponseFormatError(`Invalid JSON in response for ${label}`);
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    // Include the received value per issue so drifts (Swedish enum aliases,
    // capitalization, unexpected nulls) are diagnosable without re-running.
    const lines = parsed.error.issues.map((issue) => {
      const pathStr = issue.path.length ? issue.path.join(".") : "<root>";
      const received = getAtPath(raw, issue.path);
      return `${pathStr}: ${issue.message} (received: ${JSON.stringify(received)})`;
    });
    throw new ResponseFormatError(
      `Invalid ${label} response:\n  - ${lines.join("\n  - ")}`
    );
  }
  return parsed.data;
}

function getAtPath(
  obj: unknown,
  path: readonly PropertyKey[]
): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur == null) return undefined;
    cur = (cur as Record<PropertyKey, unknown>)[key];
  }
  return cur;
}
