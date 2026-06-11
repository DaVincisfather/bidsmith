// evals/harness/core/pairwise-judge.ts
import { z } from "zod";
import { callClaude } from "@/lib/ai-client";
import { MODELS } from "@/lib/models";
import { JUDGE_TEMPERATURE } from "./judges";

const VerdictSchema = z.object({
  winner: z.enum(["A", "B", "tie"]),
  motivering: z.string(),
});

export interface PairInput {
  sectionType: string;
  textA: string; // alltid modell A:s text (basmodellen)
  textB: string; // alltid modell B:s text (utmanaren)
}

export interface PairVerdict {
  sectionType: string;
  winner: "A" | "B" | "tie"; // i modelltermer, inte positionstermer
  motiveringar: string[];
}

const SYSTEM = `Du jämför två anonyma utkast av samma anbudssektion för en svensk
offentlig upphandling. Döm vilken text som är bättre på: klarhet, övertygelse,
konkretion (specifika åtaganden, inte floskler), naturlig svensk ton, och frihet från
AI-floskler ("i dagens snabbrörliga värld", "robust", "sömlös" osv).
Svara med JSON { "winner": "A" | "B" | "tie", "motivering": string }.
"A" = första utkastet, "B" = andra. Döm ENDAST på texten — anta inget om avsändare.`;

async function judgeOnce(first: string, second: string, sectionType: string) {
  return callClaude({
    model: MODELS.judge,
    maxTokens: 500,
    system: SYSTEM,
    userContent: `Sektionstyp: ${sectionType}

=== Utkast A ===
${first}

=== Utkast B ===
${second}`,
    temperature: JUDGE_TEMPERATURE,
    schema: VerdictSchema,
    label: `pairwise-judge(${sectionType})`,
  });
}

// Två pass med bytta positioner. Pass 1: (A,B). Pass 2: (B,A) — där betyder
// svaret "B" alltså modell A. Samstämmighet i MODELLTERMER krävs; annars tie.
export async function judgePairBlind(input: PairInput): Promise<PairVerdict> {
  const p1 = await judgeOnce(input.textA, input.textB, input.sectionType);
  const p2 = await judgeOnce(input.textB, input.textA, input.sectionType);

  const inModelTerms = (v: "A" | "B" | "tie", swapped: boolean): "A" | "B" | "tie" =>
    v === "tie" ? "tie" : swapped ? (v === "A" ? "B" : "A") : v;

  const v1 = inModelTerms(p1.winner, false);
  const v2 = inModelTerms(p2.winner, true);
  return {
    sectionType: input.sectionType,
    winner: v1 === v2 ? v1 : "tie",
    motiveringar: [p1.motivering, p2.motivering],
  };
}
