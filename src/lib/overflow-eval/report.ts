import { grossOverflowShapes } from "./gates";
import type { BidMeasurement, GateResult, KnownDefect } from "./types";

/** Cost ceiling for the whole overflow-loop research run (frozen, see
 *  notes/2026-07-15-overflow-loop-design.md) — display only, not enforced here. */
const COST_CAP_USD = 50;

export interface RunReport {
  varv: number;
  timestamp: string;
  branchCommit: string;
  bids: {
    fixtureId: string;
    label: string;
    bidId: string;
    gate: GateResult;
    failCount: number;
    grossOverflowCount: number;
    dupCount: number;
    totalChars: number;
  }[];
  aggregate: { passed: number; total: number; failFindings: number; grossOverflows: number; dupPairs: number };
  delta: { failFindings: number; grossOverflows: number; dupPairs: number; passed: number } | null;
  costUsdRun: number;
  costUsdAccumulated: number;
}

export interface BuildRunReportInput {
  varv: number;
  branchCommit: string;
  results: { bid: BidMeasurement; gate: GateResult }[];
  previous: RunReport | null;
  knownDefects: KnownDefect[];
  costUsdRun: number;
  costUsdAccumulated: number;
}

export function buildRunReport(input: BuildRunReportInput): RunReport {
  const bids = input.results.map(({ bid, gate }) => ({
    fixtureId: bid.fixtureId,
    label: bid.label,
    bidId: bid.bidId,
    gate,
    // excludedDefects are FAIL findings already carved out of the breach — subtract
    // them from the raw FAIL count to get the count that actually failed the gate.
    failCount: bid.findings.filter((f) => f.severity === "FAIL").length - gate.excludedDefects.length,
    // Same shared predicate applyGates uses (gates.ts) — gate and report counts
    // never diverge, and known-defect-matched shapes are excluded from both.
    grossOverflowCount: grossOverflowShapes(bid.measurement, input.knownDefects).length,
    dupCount: bid.duplicates.length,
    totalChars: bid.totalChars,
  }));

  const aggregate = {
    passed: bids.filter((b) => b.gate.pass).length,
    total: bids.length,
    failFindings: bids.reduce((sum, b) => sum + b.failCount, 0),
    grossOverflows: bids.reduce((sum, b) => sum + b.grossOverflowCount, 0),
    dupPairs: bids.reduce((sum, b) => sum + b.dupCount, 0),
  };

  // delta = current − previous, signed so fewer failFindings/grossOverflows/dupPairs
  // (improvement) is negative, and more passed (improvement) is positive.
  const delta = input.previous
    ? {
        failFindings: aggregate.failFindings - input.previous.aggregate.failFindings,
        grossOverflows: aggregate.grossOverflows - input.previous.aggregate.grossOverflows,
        dupPairs: aggregate.dupPairs - input.previous.aggregate.dupPairs,
        passed: aggregate.passed - input.previous.aggregate.passed,
      }
    : null;

  return {
    varv: input.varv,
    timestamp: new Date().toISOString(),
    branchCommit: input.branchCommit,
    bids,
    aggregate,
    delta,
    costUsdRun: input.costUsdRun,
    costUsdAccumulated: input.costUsdAccumulated,
  };
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

function arrow(n: number): string {
  if (n > 0) return "▲";
  if (n < 0) return "▼";
  return "–";
}

export function renderMarkdown(report: RunReport): string {
  const lines: string[] = [];

  lines.push(`# Varv ${report.varv} — ${report.aggregate.passed}/${report.aggregate.total} PASS`);
  lines.push("");
  lines.push(`_${report.timestamp} · commit \`${report.branchCommit}\`_`);
  lines.push("");

  lines.push("## Anbud");
  lines.push("");
  lines.push("| Fixture | Anbud | Status | Fails | Gross | Dup | Tecken | Breaches |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const b of report.bids) {
    const status = b.gate.pass ? "PASS" : "FAIL";
    const breaches = b.gate.breaches.length > 0 ? b.gate.breaches.map((br) => br.gate).join(", ") : "—";
    lines.push(
      `| ${b.fixtureId} | ${b.label} (${b.bidId}) | ${status} | ${b.failCount} | ${b.grossOverflowCount} | ${b.dupCount} | ${b.totalChars} | ${breaches} |`,
    );
  }
  lines.push("");

  lines.push("## Delta (vs. föregående varv)");
  lines.push("");
  if (report.delta) {
    lines.push(`- failFindings: ${signed(report.delta.failFindings)} ${arrow(report.delta.failFindings)}`);
    lines.push(`- grossOverflows: ${signed(report.delta.grossOverflows)} ${arrow(report.delta.grossOverflows)}`);
    lines.push(`- dupPairs: ${signed(report.delta.dupPairs)} ${arrow(report.delta.dupPairs)}`);
    lines.push(`- passed: ${signed(report.delta.passed)} ${arrow(report.delta.passed)}`);
  } else {
    lines.push("Inget föregående varv — ingen delta.");
  }
  lines.push("");

  lines.push("## Kostnad");
  lines.push("");
  lines.push(
    `Kostnad: $${report.costUsdRun.toFixed(2)} detta varv · $${report.costUsdAccumulated.toFixed(2)} ack. av $${COST_CAP_USD} tak.`,
  );
  lines.push("");

  lines.push("## Exkluderade malldefekter");
  lines.push("");
  const excluded = report.bids.flatMap((b) => b.gate.excludedDefects.map((f) => ({ b, f })));
  if (excluded.length === 0) {
    lines.push("Inga exkluderade malldefekter.");
  } else {
    for (const { b, f } of excluded) {
      lines.push(`- [${b.fixtureId}] slide ${f.slide} ${f.shape} (${f.checkId}): ${f.detail}`);
    }
  }

  return lines.join("\n");
}
