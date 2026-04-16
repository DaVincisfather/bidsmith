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

export async function haikuEquivJudge(input: JudgeInput): Promise<FieldJudgment> {
  const { golden, actual, field } = input;
  const system = `Du bedömer semantisk ekvivalens mellan två värden. Svara med JSON { "match": boolean, "reason": string }.
Match = true om värdena uttrycker samma sak (synonymer, omformulering, ordordning).
Match = false om de har olika betydelse eller scope.`;

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
