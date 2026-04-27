// Anthropic list prices (USD per 1M tokens). Last verified: 2026-04-27.
// Update here when Anthropic publishes new prices.
export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
}

const PRICING: Record<string, ModelPricing> = {
  "claude-opus-4-7": { inputPerMTok: 15, outputPerMTok: 75 },
  "claude-opus-4-6": { inputPerMTok: 15, outputPerMTok: 75 },
  "claude-sonnet-4-6": { inputPerMTok: 3, outputPerMTok: 15 },
  "claude-haiku-4-5-20251001": { inputPerMTok: 1, outputPerMTok: 5 },
};

// Sonnet is the cheapest "real" model — falling back to it for an unknown
// Opus call would silently undercount cost ~5×. We still return *something*
// (the logger is fire-and-forget and we don't want to crash a paid call over
// a missing pricing row), but warn so the gap shows up in server logs.
const FALLBACK: ModelPricing = PRICING["claude-sonnet-4-6"];

const CACHE_READ_MULTIPLIER = 0.1;
const CACHE_WRITE_MULTIPLIER = 1.25;

const warnedModels = new Set<string>();

export function getModelPricing(model: string): ModelPricing {
  const hit = PRICING[model];
  if (hit) return hit;
  if (!warnedModels.has(model)) {
    warnedModels.add(model);
    console.warn(
      `[ai-cost] Unknown model "${model}" — falling back to Sonnet pricing. ` +
      `Add it to PRICING in src/lib/ai-cost.ts to avoid undercounting.`,
    );
  }
  return FALLBACK;
}

// Test helper — vitest beforeEach can reset the warn-once state so tests stay isolated.
export function _resetWarnedModelsForTests(): void {
  warnedModels.clear();
}

export interface UsageInput {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export function calculateCostUsd(usage: UsageInput): number {
  const p = getModelPricing(usage.model);
  const perToken = (perMTok: number) => perMTok / 1_000_000;
  return (
    usage.inputTokens * perToken(p.inputPerMTok) +
    usage.outputTokens * perToken(p.outputPerMTok) +
    usage.cacheReadTokens * perToken(p.inputPerMTok) * CACHE_READ_MULTIPLIER +
    usage.cacheCreationTokens * perToken(p.inputPerMTok) * CACHE_WRITE_MULTIPLIER
  );
}
