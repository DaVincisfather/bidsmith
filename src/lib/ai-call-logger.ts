import { createServiceClient } from "@/lib/supabase";
import { calculateCostUsd } from "@/lib/ai-cost";

export interface LogAiCallInput {
  userId: string | null;
  model: string;
  label: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  latencyMs: number;
  error?: string;
}

export async function logAiCall(input: LogAiCallInput): Promise<void> {
  try {
    const cost = calculateCostUsd({
      model: input.model,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      cacheReadTokens: input.cacheReadTokens,
      cacheCreationTokens: input.cacheCreationTokens,
    });

    const client = createServiceClient();
    const { error } = await client.from("ai_call_logs").insert({
      user_id: input.userId,
      model: input.model,
      label: input.label,
      input_tokens: input.inputTokens,
      output_tokens: input.outputTokens,
      cache_read_tokens: input.cacheReadTokens,
      cache_creation_tokens: input.cacheCreationTokens,
      cost_usd: cost,
      latency_ms: input.latencyMs,
      error: input.error ?? null,
    });

    if (error) {
      console.warn(`ai-call-logger insert failed: ${error.message}`);
    }
  } catch (err) {
    console.warn(
      `ai-call-logger threw: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
