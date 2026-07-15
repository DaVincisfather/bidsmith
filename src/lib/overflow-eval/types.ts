import type { Finding, MeasurementFile } from "@/lib/pptx-template/measure/types";

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
}
