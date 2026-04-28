import type { BidSection, BidSectionContent } from "@/lib/types";
import type { FieldJudgment } from "./types";

export const STRUCTURE_FIELDS = [
  "structure.all_sections_present",
  "structure.slot_format_valid",
  "structure.empty_fields",
] as const;

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
      // Nullable-by-design slots in BidSectionContent.team-pricing —
      // timpris/total are filled in post-export by the company, not the AI.
      // If new nullable slots land in src/lib/types.ts, append them here.
      if (k === "timpris" || k === "total") continue;
      walkForEmpty(v, `${path}.${k}`, out);
    }
  }
}

export function judgeBidStructure(
  sections: BidSection[],
  mandatorySections: string[],
): FieldJudgment[] {
  const judgments: FieldJudgment[] = [];

  // 1. All mandatory section formats present
  // Cast format to string: BidSectionContent["format"] is a literal union, but we
  // compare against the fixture's mandatorySections (plain string[]) so we widen here.
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
