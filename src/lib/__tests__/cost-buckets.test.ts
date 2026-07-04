import { describe, it, expect } from "vitest";
import {
  bucketForLabel,
  aggregateBuckets,
  BUCKET_ORDER,
  type BucketName,
} from "@/lib/cost-buckets";
import type { CostByLabel } from "@/lib/stats";

// Varje etikett koden kan emitta idag (enumererad via `label:`-anropsplatser),
// med förväntad bucket. Om en ny etikett läggs till i koden ska den läggas här.
const KNOWN: [label: string, bucket: BucketName][] = [
  ["RFP analysis", "Analys"],
  ["consultant-extraction", "Analys"],
  ["consultant prefilter", "Konsultmatchning"],
  ["consultant matching", "Konsultmatchning"],
  ["Go/No-Go evaluation", "Konsultmatchning"],
  ["understanding bundle", "Anbudsgenerering"],
  ["phases bundle", "Anbudsgenerering"],
  ["quality bundle", "Anbudsgenerering"],
  ["requirement-matrix bundle", "Anbudsgenerering"],
  ["team bundle", "Anbudsgenerering"],
  ["generic-prose bundle", "Anbudsgenerering"],
  ["shorten-field", "Anbudsgenerering"],
  // Radar/bakgrund + evals + okänt → restposten
  ["opportunity scoring", "Övrigt"],
  ["slot classification", "Övrigt"],
  ["eval:zero-halluc-cv", "Övrigt"],
  ["Okänd typ", "Övrigt"],
];

describe("bucketForLabel", () => {
  it.each(KNOWN)("mappar '%s' → %s", (label, bucket) => {
    expect(bucketForLabel(label)).toBe(bucket);
  });

  it("okänd/framtida etikett → Övrigt (mappningen är total)", () => {
    expect(bucketForLabel("helt-ny-etikett-2027")).toBe("Övrigt");
    expect(bucketForLabel("")).toBe("Övrigt");
  });

  it("`:requote`-suffix följer förälderns bucket (prefix-match)", () => {
    expect(bucketForLabel("RFP analysis:requote")).toBe("Analys");
    expect(bucketForLabel("consultant-extraction:requote")).toBe("Analys");
    // Även en okänd förälders requote hamnar rätt (i Övrigt)
    expect(bucketForLabel("eval:zero-halluc:requote")).toBe("Övrigt");
  });
});

describe("aggregateBuckets", () => {
  const rows: CostByLabel[] = [
    { label: "RFP analysis", costUsd: 2, count: 1 },
    { label: "RFP analysis:requote", costUsd: 0.5, count: 1 },
    { label: "consultant-extraction", costUsd: 1, count: 1 },
    { label: "consultant matching", costUsd: 3, count: 1 },
    { label: "phases bundle", costUsd: 4, count: 1 },
    { label: "team bundle", costUsd: 1, count: 1 },
    { label: "opportunity scoring", costUsd: 5, count: 2 },
  ];

  it("summerar kostnad + antal per bucket", () => {
    const byBucket = new Map(aggregateBuckets(rows).map((b) => [b.bucket, b]));
    expect(byBucket.get("Analys")).toEqual({
      bucket: "Analys",
      costUsd: 3.5, // 2 + 0.5 (requote) + 1
      count: 3,
    });
    expect(byBucket.get("Konsultmatchning")).toEqual({
      bucket: "Konsultmatchning",
      costUsd: 3,
      count: 1,
    });
    expect(byBucket.get("Anbudsgenerering")).toEqual({
      bucket: "Anbudsgenerering",
      costUsd: 5,
      count: 2,
    });
    expect(byBucket.get("Övrigt")).toEqual({
      bucket: "Övrigt",
      costUsd: 5,
      count: 2,
    });
  });

  it("returnerar alla buckets i fast ordning, även tomma", () => {
    const result = aggregateBuckets([]);
    expect(result.map((b) => b.bucket)).toEqual([...BUCKET_ORDER]);
    expect(result.every((b) => b.costUsd === 0 && b.count === 0)).toBe(true);
  });

  it("grand total = summan av bucket-kostnaderna (inget tappas)", () => {
    const buckets = aggregateBuckets(rows);
    const grand = buckets.reduce((s, b) => s + b.costUsd, 0);
    const raw = rows.reduce((s, r) => s + r.costUsd, 0);
    expect(grand).toBeCloseTo(raw);
  });
});
