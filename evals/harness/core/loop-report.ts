// Delad rapport-rendering + result-typ för noll-hallucinationsloopen (RFP + CV).
// Utfaktoriserad ur loop-skriptet så det håller sig under 300 rader med båda target.
import type { EvidenceMiss } from "@/lib/verify-evidence";

export type Target = "rfp" | "cv";

// Etiketter per target. LIKE-mönstret fångar båda + deras :requote-anrop (så
// budgetgrinden aldrig undervärderar; se loop-budget.ts).
export const LABELS: Record<Target, string> = {
  rfp: "eval:zero-halluc",
  cv: "eval:zero-halluc-cv",
};
export const LOOP_COST_PATTERN = "eval:zero-halluc%";

export interface FixtureResult {
  fixtureId: string;
  // Verifierbara poster: krav (rfp) ELLER kompetenser+referenser (cv).
  itemCount: number;
  // Extraherat antal för COVERAGE-ögonmåttet mot golden: krav-antal (rfp) resp.
  // kompetens-antal (cv). 0 hallucinationer är trivialt via 0 extraherade poster,
  // så coverage måste synas bredvid — riktig coverage-grind görs av analyzer-evalen.
  extractedForCoverage: number;
  goldenCount: number;
  verifiedCount: number;
  misses: EvidenceMiss[];
  pairs: { item: string; evidence: string | undefined }[];
  error?: string;
}

export function errorResult(fixtureId: string, err: unknown): FixtureResult {
  return {
    fixtureId,
    itemCount: 0,
    extractedForCoverage: 0,
    goldenCount: 0,
    verifiedCount: 0,
    misses: [],
    pairs: [],
    error: err instanceof Error ? err.message : String(err),
  };
}

export function renderReportMd(
  results: FixtureResult[],
  target: Target,
  timestamp: string,
  cumulativeCost: number,
  budget: number,
): string {
  const L: string[] = [];
  const totalMiss = results.reduce((s, r) => s + r.misses.length, 0);
  const allGreen = totalMiss === 0 && results.every((r) => !r.error);
  L.push(`# Noll-hallucinationsloop (${target}) — ${timestamp}`, "");
  L.push(`Etikett: \`${LABELS[target]}\` (kostnad summeras över \`${LOOP_COST_PATTERN}\`)`, "");
  L.push(`**Status: ${allGreen ? "✅ GRÖN (0 overifierbara påståenden)" : `❌ ${totalMiss} miss(ar) över ${results.length} fixture(s)`}**`, "");

  L.push("## Per fixture", "");
  L.push("| Fixture | Extraherade (golden) | Verifierade | Coverage | Missar |");
  L.push("|---|---|---|---|---|");
  for (const r of results) {
    if (r.error) {
      L.push(`| ${r.fixtureId} | — | — | — | ERROR: ${r.error} |`);
      continue;
    }
    const cov = r.itemCount === 0 ? 1 : r.verifiedCount / r.itemCount;
    L.push(
      `| ${r.fixtureId} | ${r.extractedForCoverage} (${r.goldenCount}) | ${r.verifiedCount} | ${(cov * 100).toFixed(1)}% | ${r.misses.length} |`,
    );
  }
  L.push("", `Totalt: ${results.reduce((s, r) => s + r.itemCount, 0)} poster, ${totalMiss} missar.`, "");

  const withMisses = results.filter((r) => r.misses.length > 0);
  if (withMisses.length > 0) {
    L.push("## Missar (diagnos: prompt vs schema vs fixture)", "");
    for (const r of withMisses) {
      L.push(`### ${r.fixtureId}`, "");
      for (const m of r.misses) {
        L.push(`- **[${m.reason}]** ${m.requirementText}`);
        L.push(`  - citat: ${m.evidence === undefined ? "_(utelämnat)_" : `\`${m.evidence}\``}`);
      }
      L.push("");
    }
  }

  if (allGreen) {
    L.push("## Verifierade par (underlag för mänskligt relevans-stickprov)", "");
    L.push("_Mekaniken garanterar att citaten finns ordagrant i källan; RELEVANSEN spot-checkas av människa._", "");
    for (const r of results) {
      L.push(`### ${r.fixtureId}`, "");
      for (const p of r.pairs) L.push(`- **${p.item}**`, `  - källa: \`${p.evidence}\``);
      L.push("");
    }
  }

  L.push("## Kostnad", "");
  L.push(`- Kumulativ loop-kostnad (all-time, \`${LOOP_COST_PATTERN}\`): **$${cumulativeCost.toFixed(4)}**`);
  L.push(`- Budgettak (BIDSMITH_LOOP_BUDGET_USD): $${budget.toFixed(2)}`);
  L.push(`- Kvar av budget: $${Math.max(0, budget - cumulativeCost).toFixed(4)}`, "");
  return L.join("\n");
}
