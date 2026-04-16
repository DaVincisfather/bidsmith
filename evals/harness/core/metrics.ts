export interface SetMetricsInput {
  goldenMatches: number;  // # golden items that had a matching output item
  outputMatches: number;  // # output items that matched a golden item
  goldenTotal: number;
  outputTotal: number;
}

export interface SetMetricsResult {
  recall: number;
  precision: number;
  f1: number;
}

export function setMetrics(input: SetMetricsInput): SetMetricsResult {
  const { goldenMatches, outputMatches, goldenTotal, outputTotal } = input;
  const recall = goldenTotal === 0 ? 1 : goldenMatches / goldenTotal;
  const precision = outputTotal === 0 ? 1 : outputMatches / outputTotal;
  const f1 = recall + precision === 0 ? 0 : (2 * recall * precision) / (recall + precision);
  return { recall, precision, f1 };
}

export function hitAtK(input: { ranked: string[]; k: number; mustContain: string[] }): number {
  const topK = new Set(input.ranked.slice(0, input.k));
  return input.mustContain.every((id) => topK.has(id)) ? 1 : 0;
}

export interface MhcEntry {
  consultantId: string;
  requirement: string;
  demonstrated: boolean;
}

export interface MhcAggregateResult {
  perConsultant: Record<string, number>;
  mean: number;
  passThreshold: boolean;
}

export function aggregateMhc(entries: MhcEntry[], threshold = 0.8): MhcAggregateResult {
  const byConsultant = new Map<string, { total: number; demonstrated: number }>();
  for (const e of entries) {
    const row = byConsultant.get(e.consultantId) ?? { total: 0, demonstrated: 0 };
    row.total += 1;
    if (e.demonstrated) row.demonstrated += 1;
    byConsultant.set(e.consultantId, row);
  }
  const perConsultant: Record<string, number> = {};
  let sum = 0;
  for (const [id, row] of byConsultant) {
    const cov = row.total === 0 ? 1 : row.demonstrated / row.total;
    perConsultant[id] = cov;
    sum += cov;
  }
  const mean = byConsultant.size === 0 ? 1 : sum / byConsultant.size;
  const passThreshold = Object.values(perConsultant).every((c) => c >= threshold);
  return { perConsultant, mean, passThreshold };
}

export function meanMetric(
  fixtureMetrics: Array<Record<string, number>>,
  key: string
): number {
  const values = fixtureMetrics
    .map((m) => m[key])
    .filter((v): v is number => typeof v === "number");
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
