import type { Finding } from "./types";

/** Versioned scan result — schemaVersion 1 is the contract a future app
 *  surface consumes (design doc 2026-07-14-measure-core-design.md). */
export interface DeckScanReport {
  schemaVersion: 1;
  deck: string;
  scannedAt: string;
  slideCount: number;
  slides: { slide: number; findings: Finding[] }[];
  summary: { fail: number; warn: number; info: number };
}

export function buildReport(deck: string, slideCount: number, findings: Finding[]): DeckScanReport {
  const bySlide = new Map<number, Finding[]>();
  for (const f of findings) {
    const arr = bySlide.get(f.slide) ?? [];
    arr.push(f);
    bySlide.set(f.slide, arr);
  }
  const slides = [...bySlide.entries()]
    .sort(([a], [b]) => a - b)
    .map(([slide, slideFindings]) => ({ slide, findings: slideFindings }));
  return {
    schemaVersion: 1,
    deck,
    scannedAt: new Date().toISOString(),
    slideCount,
    slides,
    summary: {
      fail: findings.filter((f) => f.severity === "FAIL").length,
      warn: findings.filter((f) => f.severity === "WARN").length,
      info: findings.filter((f) => f.severity === "INFO").length,
    },
  };
}

export function exitCodeFor(report: DeckScanReport): 0 | 1 | 2 {
  if (report.summary.fail > 0) return 2;
  if (report.summary.warn > 0) return 1;
  return 0;
}

export function renderTextReport(report: DeckScanReport): string {
  const lines: string[] = [
    `Deck scan — ${report.deck} (${report.slideCount} slides)`,
  ];
  for (const s of report.slides) {
    for (const f of s.findings) {
      lines.push(`  slide ${s.slide}  ${f.severity.padEnd(4)}  ${f.checkId.padEnd(18)}  ${f.shape}: ${f.detail}`);
    }
  }
  lines.push(
    report.summary.fail + report.summary.warn + report.summary.info === 0
      ? "Rent deck — inga fynd."
      : `Summering: ${report.summary.fail} FAIL, ${report.summary.warn} WARN, ${report.summary.info} INFO.`,
  );
  return lines.join("\n");
}
