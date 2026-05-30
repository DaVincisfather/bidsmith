import {
  RfpAnalysis,
  Consultant,
  ScoredConsultant,
  GoNoGoResult,
} from "./types";
import { GoNoGoResultSchema } from "./ai-schemas";
import { callClaude } from "./ai-client";

const SYSTEM_PROMPT = `Du är expert på att bedöma konsultfirmors chanser att vinna upphandlingar.
Du får en RFP-analys, ett låst team med individuella matchscores, och övriga tillgängliga konsulter i poolen.

Din uppgift:
1. Kontrollera varje SKA-KRAV (priority: "must") mot teamets kompetenser och referensuppdrag. Binärt: uppfyllt eller ej.
2. Om NÅGOT ska-krav INTE uppfylls → winProbability = 0. Inga undantag.
3. Bedöm bör-krav (should) och önskemål (nice-to-have) för sannolikhetsbedömningen.
4. Vikta utvärderingskriterierna som anges i RFP:en.
5. Beakta red flags.
6. Generera förbättringsförslag genom att jämföra teamets luckor mot tillgängliga konsulter i poolen. Föreslå konkreta byten med uppskattad påverkan.
7. Ge en rekommendation: go, no-go, eller go-with-reservations.

Svara ALLTID med giltig JSON som matchar detta schema:
{
  "mustRequirements": [
    {
      "requirement": "Beskrivning av ska-kravet",
      "met": true,
      "coveredBy": "Konsultens namn, eller null om ej uppfyllt"
    }
  ],
  "winProbability": 72,
  "winProbabilityReasoning": "Kort motivering av sannolikhetsbedömningen",
  "strengths": ["Styrka 1", "Styrka 2"],
  "gaps": ["Lucka 1", "Lucka 2"],
  "improvements": [
    {
      "swap": { "remove": "Konsult A", "add": "Konsult B" },
      "swapIds": { "removeId": "uuid-a", "addId": "uuid-b" },
      "estimatedImpact": "+15%",
      "reason": "Konsult B har erfarenhet av X som täcker ska-krav Y"
    }
  ],
  "recommendation": "go",
  "reasoning": "Sammanfattande motivering av rekommendationen"
}

Regler:
- winProbability: 0-100. ALLTID 0 om något ska-krav saknas.
- improvements: sortera efter estimatedImpact (högst först). Du får BARA referera till konsulter som finns i listan "Övriga tillgängliga konsulter" nedan. Använd EXAKT namn och ID från den listan. Hitta INTE PÅ konsulter. Om inga tillgängliga konsulter förbättrar teamet, returnera en tom improvements-lista.
- improvements MÅSTE ha reell positiv impact. Om ett byte INTE löser ett ouppfyllt ska-krav och winProbability redan är 0, kommer bytet fortfarande resultera i 0% — ta INTE med det som förbättringsförslag. Varje förslag ska vara ett byte som faktiskt höjer winProbability. Inkludera ALDRIG förslag med +0% impact.
- estimatedImpact: beräkna genom att tänka igenom vad winProbability skulle bli med det nya teamet. Om nuvarande winProbability är 0 pga ouppfyllt ska-krav, och bytet löser det kravet, uppskatta den nya winProbability baserat på resterande ska-krav + bör-krav + viktning. Om bytet INTE löser alla ouppfyllda ska-krav förblir det 0% — inkludera inte förslaget.
- coveredBy: använd EXAKT namn från teamlistan.
- strengths/gaps: koppla till specifika krav i RFP:en, inte generella påståenden.
- reasoning: 2-4 meningar, professionell ton.`;

function formatTeamForPrompt(
  team: Consultant[],
  scores: ScoredConsultant[]
): string {
  return team
    .map((c) => {
      const score = scores.find((s) => s.consultantId === c.id);
      const comps = c.competencies.map((co) => co.competency).join(", ");
      const refs = c.references
        .map((r) => `${r.title} (${r.year}, ${r.sector})`)
        .join("; ");
      return `- ${c.name} [id: ${c.id}] (${c.level}, score: ${score?.score ?? "N/A"})
  Kompetenser: ${comps}
  Uppdrag: ${refs}
  AI-bedömning: ${score?.reasoning ?? "N/A"}`;
    })
    .join("\n\n");
}

function formatPoolForPrompt(
  pool: ScoredConsultant[],
  teamIds: string[]
): string {
  const available = pool.filter((c) => !teamIds.includes(c.consultantId));
  if (available.length === 0) return "Inga ytterligare konsulter tillgängliga.";

  return available
    .sort((a, b) => b.score - a.score)
    .map(
      (c) =>
        `- ${c.consultantName} [id: ${c.consultantId}] (${c.level}, score: ${c.score}): ${c.reasoning}`
    )
    .join("\n");
}

export async function evaluateGoNoGo(
  analysis: RfpAnalysis,
  teamConsultants: Consultant[],
  allScoredConsultants: ScoredConsultant[],
  userId?: string | null
): Promise<GoNoGoResult> {
  const teamIds = teamConsultants.map((c) => c.id);
  const teamText = formatTeamForPrompt(teamConsultants, allScoredConsultants);
  const poolText = formatPoolForPrompt(allScoredConsultants, teamIds);

  const result = await callClaude({
    model: "claude-sonnet-4-6",
    maxTokens: 4000,
    system: SYSTEM_PROMPT,
    userContent: `Bedöm detta teams chanser att vinna följande upphandling.

## RFP-analys
${JSON.stringify(analysis, null, 2)}

## Låst team
${teamText}

## Övriga tillgängliga konsulter (för förbättringsförslag)
${poolText}`,
    schema: GoNoGoResultSchema,
    label: "Go/No-Go evaluation",
    userId,
  });

  // Enforce hard rule: if any must-requirement is unmet, winProbability must be 0.
  // The prompt states this but the LLM occasionally fudges it.
  const anyUnmet = result.mustRequirements.some((r) => !r.met);
  if (anyUnmet && result.winProbability !== 0) {
    result.winProbability = 0;
  }

  // Suppress improvements with non-positive impact. The prompt forbids 0 % swaps
  // but the LLM still produces "+0 %" suggestions where it argues against itself
  // in the reason field — confusing for the user.
  result.improvements = result.improvements.filter(
    (imp) => parseImpactPct(imp.estimatedImpact) > 0,
  );

  return result;
}

/** Parse "+15 %" / "-5%" / "0 %" → number. Returns NaN if unparseable. */
function parseImpactPct(s: string): number {
  const cleaned = s.replace(/[%\s]/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : NaN;
}
