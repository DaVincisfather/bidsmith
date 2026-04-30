import type { BidSection, BidSectionContent } from "@/lib/types";

export const STRUCTURE_FIELDS = [
  "structure.all_sections_present",
  "structure.slot_format_valid",
  "structure.empty_fields",
] as const;

export type StructureField = (typeof STRUCTURE_FIELDS)[number];

const KNOWN_FORMATS = new Set<BidSectionContent["format"]>([
  "cover",
  "phases",
  "understanding-current",
  "understanding-assignment",
  "understanding-vision",
  "quality-assurance",
  "team-pricing",
  "requirement-matrix-v2",
  "reference-v2",
  "confidentiality",
  "certifications",
]);

// Sections every bid is expected to contain in production. Mirrors the v2 template
// stack. Multi-template support would replace this with a per-template lookup.
export const RUNTIME_MANDATORY_SECTIONS: string[] = [
  "cover",
  "understanding-current",
  "understanding-assignment",
  "understanding-vision",
  "phases",
  "quality-assurance",
  "requirement-matrix-v2",
  "team-pricing",
  "reference-v2",
  "confidentiality",
  "certifications",
];

// Paths that may legitimately be empty. confidentiality.oslReference is empty
// when the RFP doesn't reference an OSL paragraph (analysis.oslReference=null
// → deterministic builder falls back to ""). Flagging it would be a false
// positive on every bid for non-public-sector RFPs.
const NULLABLE_PATHS = new Set<string>([
  "confidentiality.oslReference",
]);

// Keys that are nullable by design across all sections. timpris/total in
// team-pricing are filled in post-export by the company, not by AI.
const NULLABLE_KEYS = new Set<string>(["timpris", "total"]);

function findEmptyFields(sections: BidSection[]): string[] {
  const empty: string[] = [];
  for (const s of sections) {
    if (!s.content) {
      empty.push(`${s.key}.<missing content>`);
      continue;
    }
    walkForEmpty(s.content, s.key, empty);
  }
  return empty;
}

function walkForEmpty(value: unknown, path: string, out: string[]): void {
  if (typeof value === "string") {
    if (value.trim() === "") out.push(path);
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) walkForEmpty(value[i], `${path}[${i}]`, out);
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (NULLABLE_KEYS.has(k)) continue;
      const nextPath = `${path}.${k}`;
      if (NULLABLE_PATHS.has(nextPath)) continue;
      walkForEmpty(v, nextPath, out);
    }
  }
}

export interface BidStructureJudgment {
  field: StructureField;
  judge: "exact";
  match: boolean;
  evidence: string;
  golden: unknown;
  actual: unknown;
}

export function judgeBidStructure(
  sections: BidSection[],
  mandatorySections: string[],
): BidStructureJudgment[] {
  const judgments: BidStructureJudgment[] = [];

  // 1. All mandatory section formats present
  const presentFormats = new Set<string>(
    sections
      .map((s) => s.content?.format as string | undefined)
      .filter((f): f is string => typeof f === "string"),
  );
  const missing = mandatorySections.filter((m) => !presentFormats.has(m));
  judgments.push({
    field: "structure.all_sections_present",
    judge: "exact",
    match: missing.length === 0,
    evidence: missing.length === 0 ? "all present" : `missing: ${missing.join(", ")}`,
    golden: mandatorySections,
    actual: Array.from(presentFormats).sort(),
  });

  // 2. Every section's format is one of the v2 slot formats
  const knownFormatsAsStrings: ReadonlySet<string> = KNOWN_FORMATS as ReadonlySet<string>;
  const unknown = sections
    .map((s) => s.content?.format as string | undefined)
    .filter((f): f is string => typeof f === "string")
    .filter((f) => !knownFormatsAsStrings.has(f));
  judgments.push({
    field: "structure.slot_format_valid",
    judge: "exact",
    match: unknown.length === 0,
    evidence: unknown.length === 0 ? "all formats valid" : `unknown formats: ${unknown.join(", ")}`,
    golden: Array.from(KNOWN_FORMATS).sort(),
    actual: unknown,
  });

  // 3. No empty required text fields
  const empties = findEmptyFields(sections);
  judgments.push({
    field: "structure.empty_fields",
    judge: "exact",
    match: empties.length === 0,
    evidence: empties.length === 0 ? "no empty fields" : `empty: ${empties.slice(0, 5).join(", ")}${empties.length > 5 ? ` (+${empties.length - 5} more)` : ""}`,
    golden: 0,
    actual: empties.length,
  });

  return judgments;
}

// Persisted shape for bids.structure_eval. Stable across runs so the UI badge
// can read it without re-deriving from raw judgments.
export interface StructureEvalSummary {
  pass: boolean;
  fields: Record<StructureField, { match: boolean; evidence: string }>;
  evaluatedAt: string;
}

export function buildStructureEvalSummary(
  judgments: BidStructureJudgment[],
): StructureEvalSummary {
  const fields = {} as StructureEvalSummary["fields"];
  let pass = true;
  for (const f of STRUCTURE_FIELDS) {
    const j = judgments.find((x) => x.field === f);
    if (!j) {
      pass = false;
      fields[f] = { match: false, evidence: "missing judgment" };
      continue;
    }
    fields[f] = { match: j.match, evidence: j.evidence };
    if (!j.match) pass = false;
  }
  return {
    pass,
    fields,
    evaluatedAt: new Date().toISOString(),
  };
}
