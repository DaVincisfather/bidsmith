import { z } from "zod";
import { callClaude } from "@/lib/ai-client";
import type { FieldJudgment } from "./types";

export interface JudgeInput {
  golden: unknown;
  actual: unknown;
  field: string;
}

export async function exactJudge(input: JudgeInput): Promise<FieldJudgment> {
  const { golden, actual, field } = input;
  const norm = (v: unknown) => (typeof v === "string" ? v.trim() : v);
  const match = Object.is(norm(golden), norm(actual));
  return {
    field,
    judge: "exact",
    match,
    golden,
    actual,
  };
}

const JudgeResponseSchema = z.object({
  match: z.boolean(),
  reason: z.string(),
});

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

function renderValue(v: unknown): string {
  if (v === null || v === undefined) return "(inget värde)";
  if (typeof v === "string") return v;
  return JSON.stringify(v, null, 2);
}

export const EQUIV_SYSTEM = `Du bedömer semantisk ekvivalens mellan två värden. Svara med JSON { "match": boolean, "reason": string }.
Match = true om värdena uttrycker samma sak (synonymer, omformulering, ordordning).
Match = true även när ena värdet är en mer specificerad variant av samma sak
(t.ex. "Flytande svenska" vs "Flytande svenska i tal och skrift").
Match = false om de har olika betydelse eller scope.`;

export async function haikuEquivJudge(input: JudgeInput): Promise<FieldJudgment> {
  const { golden, actual, field } = input;
  const system = EQUIV_SYSTEM;

  const userContent = `Fält: ${field}

Golden (förväntat):
${renderValue(golden)}

Faktiskt (modell-output):
${renderValue(actual)}`;

  try {
    const judgment = await callClaude({
      model: HAIKU_MODEL,
      maxTokens: 300,
      system,
      userContent,
      schema: JudgeResponseSchema,
      label: `haiku-equiv-judge(${field})`,
    });
    return {
      field,
      judge: "haiku-equiv",
      match: judgment.match,
      evidence: judgment.reason,
      golden,
      actual,
    };
  } catch (err) {
    return {
      field,
      judge: "haiku-equiv",
      match: false,
      error: err instanceof Error ? err.message : String(err),
      golden,
      actual,
    };
  }
}

const RubricResponseSchema = z.object({
  meets: z.boolean(),
  reason: z.string(),
});

export interface RubricJudgeInput {
  field: string;
  rubric: string;
  actual: string;
}

export async function haikuRubricJudge(input: RubricJudgeInput): Promise<FieldJudgment> {
  const { field, rubric, actual } = input;
  const system = `Du bedömer om ett textutdrag uppfyller en rubric. Svara med JSON { "meets": boolean, "reason": string }.
meets = true om texten följer alla kriterier i rubriken.
meets = false om texten bryter mot något kriterium, saknar väsentligt innehåll, eller innehåller uppdiktade fakta.`;

  const userContent = `Fält: ${field}

Rubric (kriterier):
${rubric}

Text att bedöma:
${renderValue(actual)}`;

  try {
    const judgment = await callClaude({
      model: HAIKU_MODEL,
      maxTokens: 300,
      system,
      userContent,
      schema: RubricResponseSchema,
      label: `haiku-rubric-judge(${field})`,
    });
    return {
      field,
      judge: "haiku-rubric",
      match: judgment.meets,
      evidence: judgment.reason,
      golden: rubric,
      actual,
    };
  } catch (err) {
    return {
      field,
      judge: "haiku-rubric",
      match: false,
      error: err instanceof Error ? err.message : String(err),
      golden: rubric,
      actual,
    };
  }
}

const MhcResponseSchema = z.object({
  demonstrated: z.boolean(),
  evidence: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
});

const SONNET_MODEL = "claude-sonnet-4-6";

export interface MhcJudgeInput {
  requirement: { category: string; description: string; priority: string };
  consultantId: string;
  cvText: string;
}

export async function sonnetMhcJudge(input: MhcJudgeInput): Promise<FieldJudgment> {
  const { requirement, consultantId, cvText } = input;
  const field = `mhc.${consultantId}.${requirement.category}`;

  const system = `Du bedömer om ett konsult-CV demonstrerar ett specifikt ska-krav från en RFP.
Svara med JSON { "demonstrated": boolean, "evidence": string, "confidence": "high"|"medium"|"low" }.

demonstrated = true endast om CV:t innehåller konkret bevis (projekt, år, roll, omfattning) som visar att konsulten uppfyller kravet.
evidence = citat från CV:t som stödjer bedömningen (eller "inget relevant nämns" om demonstrated=false).
confidence = "high" om beviset är explicit, "medium" om rimlig inferens, "low" om svag inferens.

Var strikt: nämnd kompetens utan år eller roll räcker INTE. "Erfarenhet av X" måste backas av ett projekt.`;

  const userContent = `Ska-krav (kategori: ${requirement.category}):
${requirement.description}

Konsult-CV (${consultantId}):
${cvText}`;

  try {
    const judgment = await callClaude({
      model: SONNET_MODEL,
      maxTokens: 500,
      system,
      userContent,
      schema: MhcResponseSchema,
      label: `sonnet-mhc-judge(${field})`,
    });
    return {
      field,
      judge: "sonnet-mhc",
      match: judgment.demonstrated,
      evidence: judgment.evidence,
      confidence: judgment.confidence,
      golden: requirement,
      actual: `(cv text for ${consultantId})`,
    };
  } catch (err) {
    return {
      field,
      judge: "sonnet-mhc",
      match: false,
      error: err instanceof Error ? err.message : String(err),
      golden: requirement,
      actual: `(cv text for ${consultantId})`,
    };
  }
}

const BidCoverageResponseSchema = z.object({
  demonstrated: z.boolean(),
  evidence: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
});

export interface BidCoverageJudgeInput {
  requirement: { id: string; category: string; description: string; priority: string };
  bidText: string;
}

export async function bidCoverageJudge(input: BidCoverageJudgeInput): Promise<FieldJudgment> {
  const { requirement, bidText } = input;
  const field = `coverage.${requirement.id}`;

  const system = `Du bedömer om ett anbudsutkast demonstrerar att en RFP-krav uppfylls.
Svara med JSON { "demonstrated": boolean, "evidence": string, "confidence": "high"|"medium"|"low" }.

demonstrated = true endast om anbudet innehåller konkret skrivning som adresserar kravet (kompetens, metod, leverans, referens, certifiering, person).
evidence = citat eller paraphrase från anbudet som stödjer bedömningen (eller "inte adresserat" om demonstrated=false).
confidence = "high" om explicit, "medium" om rimlig inferens, "low" om svag inferens.

Var strikt: krav på "5 års erfarenhet" kräver konkret namn + år/projekt. Allmänna fraser ("vi har bred erfarenhet") räcker inte.`;

  const userContent = `Krav (kategori: ${requirement.category}, prioritet: ${requirement.priority}):
${requirement.description}

Anbudstext:
${bidText}`;

  try {
    const judgment = await callClaude({
      model: SONNET_MODEL,
      maxTokens: 500,
      system,
      userContent,
      schema: BidCoverageResponseSchema,
      label: `bid-coverage-judge(${field})`,
    });
    return {
      field,
      judge: "bid-coverage",
      match: judgment.demonstrated,
      evidence: judgment.evidence,
      confidence: judgment.confidence,
      golden: requirement,
      actual: "(bid text)",
    };
  } catch (err) {
    return {
      field,
      judge: "bid-coverage",
      match: false,
      error: err instanceof Error ? err.message : String(err),
      golden: requirement,
      actual: "(bid text)",
    };
  }
}

const HallucinationResponseSchema = z.object({
  claims: z.array(z.object({
    claim: z.string(),
    supported: z.boolean(),
    evidence: z.string(),
  })),
});

export interface BidHallucinationJudgeInput {
  bidText: string;
  sourceMaterial: string;
  allowlist: string[];
}

export const HALLUCINATION_SYSTEM = `Du extraherar och verifierar faktapåståenden i ett anbudsutkast mot källmaterialet.
Svara med JSON { "claims": [{ "claim": string, "supported": boolean, "evidence": string }] }.

Steg:
1. Extrahera 5-15 specifika faktapåståenden från anbudet — namn, år, projekt-klienter, numeriska värden, certifieringar, roller. Hoppa över allmänna formuleringar.
   Extrahera INTE: dokument-/anbudsdatum (sätts deterministiskt av systemet, inte av källan)
   och teamets bemanningsallokeringar — omfattning i procent, timmar, totaler (de SKAPAS i
   anbudet per design och kan aldrig finnas i källmaterialet).
2. För varje påstående, kontrollera om det stöds av källmaterialet (RFP + CV:n).
3. supported = true om källmaterialet bekräftar påståendet (exakt eller via stark inferens). supported = false om källan inte nämner det eller motsäger det.
4. evidence = citat från källan om supported=true, eller "inte i källa" om supported=false.

Var strikt: en siffra eller ett klientnamn som inte finns i källan = supported=false.`;

export async function bidHallucinationJudge(input: BidHallucinationJudgeInput): Promise<FieldJudgment> {
  const { bidText, sourceMaterial, allowlist } = input;
  const field = "hallucination";

  const system = HALLUCINATION_SYSTEM;

  const userContent = `Anbudstext:
${bidText}

Källmaterial (RFP + CV:n):
${sourceMaterial}`;

  try {
    const judgment = await callClaude({
      model: SONNET_MODEL,
      maxTokens: 2000,
      system,
      userContent,
      schema: HallucinationResponseSchema,
      label: `bid-hallucination-judge`,
    });

    const allowlistMatches = (claim: string) =>
      allowlist.some((term) => claim.toLowerCase().includes(term.toLowerCase()));

    const unsupported = judgment.claims.filter((c) => !c.supported && !allowlistMatches(c.claim));

    return {
      field,
      judge: "bid-hallucination",
      match: unsupported.length === 0,
      evidence: unsupported.length === 0
        ? `${judgment.claims.length} claims, all supported (or allowlisted)`
        : `unsupported: ${unsupported.map((c) => c.claim).join("; ")}`,
      golden: { allowlist },
      actual: judgment.claims,
    };
  } catch (err) {
    return {
      field,
      judge: "bid-hallucination",
      match: false,
      error: err instanceof Error ? err.message : String(err),
      golden: { allowlist },
      actual: null,
    };
  }
}
