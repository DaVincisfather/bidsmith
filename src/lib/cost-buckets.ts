import type { CostByLabel } from "@/lib/stats";

// Grupperar råa ai_call_logs-etiketter till tre begripliga kostnadsposter.
// Produktägar-feedback 2026-07-03: per-etikett-listan var brus — dela istället upp
// kostnaden i analys / konsultmatchning / anbudsgenerering. Mappningen är TOTAL:
// allt som inte matchar hamnar i "Övrigt" så ingen kostnad tyst försvinner.

export type BucketName =
  | "Analys"
  | "Konsultmatchning"
  | "Anbudsgenerering"
  | "Övrigt";

// Visningsordning i UI. "Övrigt" sist — det är restposten (evals, radar, okänt).
export const BUCKET_ORDER: readonly BucketName[] = [
  "Analys",
  "Konsultmatchning",
  "Anbudsgenerering",
  "Övrigt",
] as const;

// Prefix-regler mot etikettens rot. `:requote`-suffix (evidence-guard budget-
// attribution, t.ex. "RFP analysis:requote") fångas gratis eftersom
// "RFP analysis:requote".startsWith("RFP analysis"). Prefixen överlappar inte,
// så ordningen är oväsentlig — men listan MÅSTE täcka varje etikett koden kan
// emitta idag (enumererad via `label:`-anropsplatser).
const PREFIX_RULES: readonly { prefix: string; bucket: BucketName }[] = [
  // Analys — RFP-kravanalys + CV-extraktion
  { prefix: "RFP analysis", bucket: "Analys" },
  { prefix: "consultant-extraction", bucket: "Analys" },
  // Konsultmatchning — förfiltrering, matchning, go/no-go
  { prefix: "consultant prefilter", bucket: "Konsultmatchning" },
  { prefix: "consultant matching", bucket: "Konsultmatchning" },
  { prefix: "Go/No-Go evaluation", bucket: "Konsultmatchning" },
  // Anbudsgenerering — skrivbundles + fältkortning + export
  { prefix: "understanding bundle", bucket: "Anbudsgenerering" },
  { prefix: "phases bundle", bucket: "Anbudsgenerering" },
  { prefix: "quality bundle", bucket: "Anbudsgenerering" },
  { prefix: "requirement-matrix bundle", bucket: "Anbudsgenerering" },
  { prefix: "team bundle", bucket: "Anbudsgenerering" },
  { prefix: "generic-prose bundle", bucket: "Anbudsgenerering" },
  { prefix: "shorten-field", bucket: "Anbudsgenerering" },
];

/**
 * Total mappning etikett → bucket. Okänd/omatchad etikett (opportunity scoring,
 * slot classification, eval:*, "Okänd typ", framtida etiketter) → "Övrigt".
 */
export function bucketForLabel(label: string): BucketName {
  for (const rule of PREFIX_RULES) {
    if (label.startsWith(rule.prefix)) return rule.bucket;
  }
  return "Övrigt";
}

export interface BucketSummary {
  bucket: BucketName;
  costUsd: number;
  count: number;
}

/**
 * Aggregerar per-etikett-kostnader till bucket-summor i fast visningsordning.
 * Returnerar alltid alla fyra buckets (även tomma) — UI:t avgör vad som visas.
 */
export function aggregateBuckets(costByLabel: CostByLabel[]): BucketSummary[] {
  const totals = new Map<BucketName, { costUsd: number; count: number }>();
  for (const b of BUCKET_ORDER) totals.set(b, { costUsd: 0, count: 0 });

  for (const c of costByLabel) {
    const t = totals.get(bucketForLabel(c.label));
    if (!t) continue; // omöjligt: bucketForLabel är total — defensivt för TS
    t.costUsd += c.costUsd;
    t.count += c.count;
  }

  return BUCKET_ORDER.map((bucket) => {
    const t = totals.get(bucket) ?? { costUsd: 0, count: 0 };
    return { bucket, costUsd: t.costUsd, count: t.count };
  });
}
