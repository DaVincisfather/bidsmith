import { parse as parseYaml } from "yaml";
import { z } from "zod";
import fs from "fs/promises";

const ThresholdPairSchema = z.object({
  green: z.number(),
  yellow: z.number(),
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

export type Category = "green" | "yellow" | "red" | "unknown";

export function categorize(value: number, pair: ThresholdPair | undefined): Category {
  if (!pair) return "unknown";
  if (value >= pair.green) return "green";
  if (value >= pair.yellow) return "yellow";
  return "red";
}
