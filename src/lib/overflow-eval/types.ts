import type { Finding, MeasurementFile, ShapeMeasurementV2 } from "@/lib/pptx-template/measure/types";

export interface OverflowFixture {
  id: string;
  label: string;
  analysisId: string;
  teamConsultantIds: string[];
}

export interface FixturesFile {
  templateId: string;
  fixtures: OverflowFixture[];
}

export interface KnownDefect {
  slide: number;
  checkId: string;
  shape: string;
  note: string;
  /** Empty-substrate measured boundHeightPt, recorded for gross-overflow
   *  entries only (scripts/overflow-bootstrap.ts) — the magnitude-cap
   *  baseline a listed shape may not grow past (gates.ts
   *  DEFECT_BASELINE_TOLERANCE_PT) and still ride the exclusion. Absent for
   *  FAIL-class entries (e.g. outside-slide), which keep the unconditional
   *  exclusion on the FAIL gate. */
  baselineBoundHeightPt?: number;
}

export interface DuplicatePair {
  a: string;
  b: string;
  slide: number;
  similarity: number;
}

export interface FillEntry {
  placeholder: string;
  budgetChars: number;
  textChars: number;
  ratio: number;
}

export interface BidMeasurement {
  fixtureId: string;
  label: string;
  bidId: string;
  findings: Finding[];
  measurement: MeasurementFile;
  duplicates: DuplicatePair[];
  fill: FillEntry[];
  totalChars: number;
}

export type GateId = "fail-findings" | "gross-overflow" | "duplicates" | "min-fill" | "volume-corridor";

export interface GateBreach {
  gate: GateId;
  detail: string;
}

export interface GateResult {
  fixtureId: string;
  label: string;
  pass: boolean;
  breaches: GateBreach[];
  excludedDefects: Finding[];
  /** Gross-overflow shapes that matched a known template defect and stayed
   *  within its magnitude-cap tolerance — the audit trail for the exclusion
   *  gates.ts applies before it ever silently drops a shape. */
  excludedGross: ShapeMeasurementV2[];
}
