import { z } from "zod";
import {
  RfpAnalysis,
  Consultant,
  ScoredConsultant,
  ScoredMatchResult,
} from "./types";
import { ScoredMatchResultSchema } from "./ai-schemas";
import { callClaude } from "./ai-client";
import { MODELS } from "./models";
import { groundedConsultantClaims } from "./grounded-claims";

// Two-stage matching.
//
// Stage 1 (Haiku) ranks the ENTIRE pool with SCORES ONLY — no free-text
// rationale. An eval over 100 synthetic consultants × 2 RFPs (see
// evals/results-matching-model-comparison.md) showed Haiku ranks within 0.96
// Spearman of Opus, but its free-text *rationales* hallucinate ~9% at that
// scale. Emitting only a number removes that hallucination surface entirely,
// and keeps the output tiny so the old 8000-token truncation cliff can't occur.
//
// Stage 2 (Sonnet) writes the rich 2-3 sentence rationale only for the top-N
// per level — the consultants that actually go into the bid, where Sonnet
// scored 0 hallucinations. The long tail keeps a score but no rationale text.

export const DEFAULT_DEEP_PER_LEVEL = 5;

const PREFILTER_MODEL = MODELS.prefilter;
const DEEP_MODEL = MODELS.matching;

// Output scales with how many consultants the model must emit, so the token cap
// is sized to the pool/shortlist instead of a fixed 8000 (which truncated past
// ~70 consultants). callClaude streams, so there is no upper request ceiling;
// we still clamp to keep cost bounded.
function tokenBudget(count: number, perItem: number, floor: number, ceil: number): number {
  return Math.min(ceil, Math.max(floor, Math.round(1000 + count * perItem)));
}
// Haiku emits score-only (~25 tok/consultant); Sonnet emits 2-3 sentences (~220).
const PREFILTER_BUDGET = (n: number) => tokenBudget(n, 60, 4000, 24000);
const DEEP_BUDGET = (n: number) => tokenBudget(n, 220, 4000, 24000);

// Lean schema: scores only, no reasoning key.
const PrefilterSchema = z.object({
  scoredConsultants: z.array(
    z.object({
      consultantId: z.string(),
      consultantName: z.string(),
      level: z.enum(["junior", "intermediate", "senior", "expert"]),
      score: z.number().min(0).max(100),
    }),
  ),
});

const PREFILTER_SYSTEM = `Du är expert på att matcha konsulter till förfrågningsunderlag (RFP:er).
Scora VARJE konsult individuellt mot RFP:en utifrån kompetenser, erfarenhet och referensuppdrag.
Returnera ENDAST en score per konsult — INGEN motivering, ingen text.

Rankning sker enbart inom samma erfarenhetsnivå — juniors tävlar aldrig mot seniors.

Svara ALLTID med giltig JSON som matchar detta schema:
{
  "scoredConsultants": [
    { "consultantId": "id", "consultantName": "Namn", "level": "senior", "score": 85 }
  ]
}

Regler:
- Scora ALLA konsulter, inte bara de bästa
- Score 0-100: 80+ stark, 60-79 relevant, 40-59 delvis, <40 svag
- Ingen "reasoning"-nyckel — bara score`;

const DEEP_SYSTEM = `Du är expert på att matcha konsulter till förfrågningsunderlag (RFP:er).
Du får en RFP-analys och en kortlista med de starkaste konsulterna. Skriv en utförlig motivering för VARJE konsult.

Svara ALLTID med giltig JSON som matchar detta schema:
{
  "scoredConsultants": [
    { "consultantId": "id", "consultantName": "Namn", "level": "senior", "score": 85, "reasoning": "2-3 meningar om varför denna konsult matchar uppdraget" }
  ]
}

Regler:
- Skriv motivering för ALLA konsulter du fått
- reasoning: 2-3 meningar, specifik koppling till RFP-kraven, inte generell text
- Behåll score i samma intervall 0-100 som du fått`;

// Exporterad för enhets-testning: prompt-texten ska utelämna flaggade (evidens-lösa)
// claims för post-feature-konsulter men bära allt för legacy-konsulter (fas C, policy A).
export function formatConsultantsForPrompt(consultants: Consultant[]): string {
  const grouped: Record<string, Consultant[]> = {};
  for (const c of consultants) {
    if (!grouped[c.level]) grouped[c.level] = [];
    grouped[c.level].push(c);
  }

  return Object.entries(grouped)
    .map(([level, cons]) => {
      const entries = cons.map((c) => {
        // Fas C: filtrera obelagda claims vid serialiserings-gränsen mot AI-input.
        // extractionVersion (migration 011): post-feature-rad → grinden alltid på.
        const { competencies, references } = groundedConsultantClaims(c, c.extractionVersion);
        const comps = competencies.map((co) => co.competency).join(", ");
        const refs = references
          .map((r) => `${r.title} (${r.year}, ${r.sector})`)
          .join("; ");
        return `  - ${c.name} [id: ${c.id}]: ${c.summary}\n    Kompetenser: ${comps}\n    Uppdrag: ${refs}`;
      });
      return `${level.toUpperCase()}:\n${entries.join("\n")}`;
    })
    .join("\n\n");
}

/**
 * Stage 1 — Haiku scores the whole pool, no rationale. Returns ScoredConsultant
 * with an empty `reasoning` (filled in later only for the shortlist).
 */
async function prefilterScoreAll(
  analysis: RfpAnalysis,
  consultants: Consultant[],
  userId?: string | null,
): Promise<ScoredConsultant[]> {
  const consultantText = formatConsultantsForPrompt(consultants);

  const result = await callClaude({
    model: PREFILTER_MODEL,
    maxTokens: PREFILTER_BUDGET(consultants.length),
    system: PREFILTER_SYSTEM,
    userContent: `Scora följande konsulter individuellt mot detta förfrågningsunderlag.

## RFP-analys
${JSON.stringify(analysis, null, 2)}

## Konsulter att scora
${consultantText}`,
    schema: PrefilterSchema,
    label: "consultant prefilter",
    userId,
  });

  return result.scoredConsultants.map((s) => ({ ...s, reasoning: "" }));
}

/**
 * Stage 1.5 — reconcile the prefilter output against the input pool. LLM
 * rankers drop and hallucinate entries at scale: an omitted consultant would
 * otherwise vanish silently from matching (and could never be shortlisted),
 * and a hallucinated id would survive into the stored result. Canonical
 * identity (id, name, level) always comes from the pool — level decides which
 * top-N bucket a consultant competes in, so model drift there is not cosmetic.
 * Omitted consultants get score 0 + `prefilterMiss` so they stay visible
 * without outranking actually-scored ones.
 */
export function reconcilePrefilter(
  consultants: Consultant[],
  scored: ScoredConsultant[],
): ScoredConsultant[] {
  const poolIds = new Set(consultants.map((c) => c.id));
  const scoredById = new Map<string, ScoredConsultant>();
  const hallucinated: string[] = [];
  const duplicates: string[] = [];
  for (const s of scored) {
    if (!poolIds.has(s.consultantId)) {
      hallucinated.push(s.consultantId);
    } else if (scoredById.has(s.consultantId)) {
      // First score wins — arbitrary either way, but deterministic and logged.
      duplicates.push(s.consultantId);
    } else {
      scoredById.set(s.consultantId, s);
    }
  }
  if (hallucinated.length > 0) {
    console.warn(
      `[matcher] prefilter returned ${hallucinated.length} id(s) not in the pool, dropped: ${hallucinated.join(", ")}`,
    );
  }
  if (duplicates.length > 0) {
    console.warn(
      `[matcher] prefilter scored ${duplicates.length} consultant(s) more than once, kept first: ${duplicates.join(", ")}`,
    );
  }

  const missed: string[] = [];
  const reconciled = consultants.map((c): ScoredConsultant => {
    const s = scoredById.get(c.id);
    if (!s) {
      missed.push(c.id);
      return {
        consultantId: c.id,
        consultantName: c.name,
        level: c.level,
        score: 0,
        reasoning: "",
        prefilterMiss: true,
      };
    }
    return { ...s, consultantName: c.name, level: c.level };
  });
  if (missed.length > 0) {
    console.warn(
      `[matcher] prefilter omitted ${missed.length} consultant(s), defaulted to score 0: ${missed.join(", ")}`,
    );
  }

  return reconciled;
}

/**
 * Stage 2 — Sonnet writes the rich rationale for the shortlist only.
 */
async function deepReasonSelected(
  analysis: RfpAnalysis,
  selected: Consultant[],
  userId?: string | null,
): Promise<ScoredMatchResult> {
  const consultantText = formatConsultantsForPrompt(selected);

  return callClaude({
    model: DEEP_MODEL,
    maxTokens: DEEP_BUDGET(selected.length),
    system: DEEP_SYSTEM,
    userContent: `Skriv en utförlig motivering för följande kortlistade konsulter mot detta förfrågningsunderlag.

## RFP-analys
${JSON.stringify(analysis, null, 2)}

## Kortlistade konsulter
${consultantText}`,
    schema: ScoredMatchResultSchema,
    label: "consultant matching",
    userId,
  });
}

/**
 * Returns the set of consultantIds with the top-N scores within each level.
 * Levels are ranked independently; a level with fewer than N is returned whole.
 */
export function selectTopNPerLevel(
  scored: ScoredConsultant[],
  n: number,
): Set<string> {
  const byLevel: Record<string, ScoredConsultant[]> = {};
  for (const s of scored) {
    (byLevel[s.level] ??= []).push(s);
  }

  const ids = new Set<string>();
  for (const list of Object.values(byLevel)) {
    [...list]
      .sort((a, b) => b.score - a.score)
      .slice(0, n)
      .forEach((s) => ids.add(s.consultantId));
  }
  return ids;
}

/**
 * Overlays the deep rationale onto the full scored list. Every base consultant
 * survives (nobody disappears); only the reasoning is replaced for those the
 * deep pass covered. The ranking score stays on the base (Haiku) score, and the
 * long tail keeps its empty rationale.
 *
 * Exception: a prefilterMiss consultant has a defensive 0, not a real score.
 * If the deep pass covered them (small level shortlisted everyone), Sonnet's
 * score is the only real assessment — adopt it and clear the flag, instead of
 * displaying "0/100" next to a rich rationale.
 */
export function mergeDeepReasoning(
  base: ScoredConsultant[],
  deep: ScoredConsultant[],
): ScoredConsultant[] {
  const deepById = new Map(deep.map((d) => [d.consultantId, d]));
  return base.map((b) => {
    const d = deepById.get(b.consultantId);
    if (!d) return b;
    if (b.prefilterMiss) {
      return { ...b, reasoning: d.reasoning, score: d.score, prefilterMiss: undefined };
    }
    return { ...b, reasoning: d.reasoning };
  });
}

export async function matchConsultants(
  analysis: RfpAnalysis,
  consultants: Consultant[],
  userId?: string | null,
  deepPerLevel: number = DEFAULT_DEEP_PER_LEVEL,
): Promise<ScoredMatchResult> {
  if (consultants.length === 0) return { scoredConsultants: [] };

  const base = reconcilePrefilter(
    consultants,
    await prefilterScoreAll(analysis, consultants, userId),
  );

  const topIds = selectTopNPerLevel(base, deepPerLevel);
  const selected = consultants.filter((c) => topIds.has(c.id));
  if (selected.length === 0) return { scoredConsultants: base };

  const deep = await deepReasonSelected(analysis, selected, userId);

  return {
    scoredConsultants: mergeDeepReasoning(base, deep.scoredConsultants),
  };
}
