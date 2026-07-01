import { parse as parseYaml } from "yaml";
import { z } from "zod";
import fs from "fs/promises";

const ThresholdPairSchema = z.object({
  green: z.number(),
  yellow: z.number(),
  // An informational metric is reported (with its green/yellow bands as reference)
  // but never counts as a gate FAIL. Decision A (2026-07-01): coverage.recall
  // against arbitrary RFP requirements is a fixture/scope-bound signal, not a
  // valid merge gate — the gate is structure.pass + overflow.pass.
  informational: z.boolean().optional(),
});

const ThresholdsSchema = z.object({
  analyzer: z.record(z.string(), ThresholdPairSchema).default({}),
  matcher: z.record(z.string(), ThresholdPairSchema).default({}),
  "bid-generator": z.record(z.string(), ThresholdPairSchema).default({}),
});

export type Thresholds = z.infer<typeof ThresholdsSchema>;
export type ThresholdPair = z.infer<typeof ThresholdPairSchema>;

export async function loadThresholds(filePath: string): Promise<Thresholds> {
  const content = await fs.readFile(filePath, "utf-8");
  const raw = parseYaml(content);
  return ThresholdsSchema.parse(raw);
}

export type Category = "green" | "yellow" | "red" | "info" | "unknown";

export function categorize(value: number, pair: ThresholdPair | undefined): Category {
  if (!pair) return "unknown";
  if (pair.informational) return "info";
  if (value >= pair.green) return "green";
  if (value >= pair.yellow) return "yellow";
  return "red";
}
