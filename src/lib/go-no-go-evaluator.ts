import {
  RfpAnalysis,
  RfpRequirement,
  Consultant,
  ScoredConsultant,
  GoNoGoResult,
  MustRequirementCheck,
} from "./types";
import { GoNoGoAiResponseSchema } from "./ai-schemas";
import { callClaude } from "./ai-client";
import { MODELS } from "./models";
import { qualificationRequirements } from "./requirement-kind";
import { groundedConsultantClaims } from "./grounded-claims";

const SYSTEM_PROMPT = `Du är expert på att bedöma konsultfirmors chanser att vinna upphandlingar.
Du får en RFP-analys, en numrerad kravlista, ett låst team med individuella matchscores, och övriga tillgängliga konsulter i poolen.

Din uppgift:
1. Kontrollera varje SKA-KRAV (priority: "must") i den numrerade kravlistan mot teamets kompetenser och referensuppdrag. Binärt: uppfyllt eller ej.
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
      "index": 1,
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
- mustRequirements: "index" är numret på kravet i listan "## Kvalifikationskrav (numrerade)" nedan — INTE kravtexten. Använd bara nummer som finns i listan, ett per ska-krav (priority: must).
- winProbability: 0-100. ALLTID 0 om något ska-krav saknas.
- improvements: sortera efter estimatedImpact (högst först). Du får BARA referera till konsulter som finns i listan "Övriga tillgängliga konsulter" nedan. Använd EXAKT namn och ID från den listan. Hitta INTE PÅ konsulter. Om inga tillgängliga konsulter förbättrar teamet, returnera en tom improvements-lista.
- improvements MÅSTE ha reell positiv impact. Om ett byte INTE löser ett ouppfyllt ska-krav och winProbability redan är 0, kommer bytet fortfarande resultera i 0% — ta INTE med det som förbättringsförslag. Varje förslag ska vara ett byte som faktiskt höjer winProbability. Inkludera ALDRIG förslag med +0% impact.
- estimatedImpact: beräkna genom att tänka igenom vad winProbability skulle bli med det nya teamet. Om nuvarande winProbability är 0 pga ouppfyllt ska-krav, och bytet löser det kravet, uppskatta den nya winProbability baserat på resterande ska-krav + bör-krav + viktning. Om bytet INTE löser alla ouppfyllda ska-krav förblir det 0% — inkludera inte förslaget.
- coveredBy: använd EXAKT namn från teamlistan.
- strengths/gaps: koppla till specifika krav i RFP:en, inte generella påståenden.
- reasoning: 2-4 meningar, professionell ton.`;

// Exporterad för enhets-testning (fas C, policy A): flaggade claims utelämnas ur
// team-texten för post-feature-konsulter, allt bärs för legacy-konsulter.
export function formatTeamForPrompt(
  team: Consultant[],
  scores: ScoredConsultant[]
): string {
  return team
    .map((c) => {
      const score = scores.find((s) => s.consultantId === c.id);
      // Fas C: filtrera obelagda claims vid serialiserings-gränsen mot AI-input.
      // extractionVersion (migration 011): post-feature-rad → grinden alltid på.
      const { competencies, references } = groundedConsultantClaims(c, c.extractionVersion);
      const comps = competencies.map((co) => co.competency).join(", ");
      const refs = references
        .map((r) => `${r.title} (${r.year}, ${r.sector})`)
        .join("; ");
      // prefilterMiss = defensive 0, not an assessment — a literal "score: 0"
      // would read as "terrible match" to the judge.
      const scoreText = score
        ? score.prefilterMiss
          ? "ej scorad"
          : String(score.score)
        : "N/A";
      return `- ${c.name} [id: ${c.id}] (${c.level}, score: ${scoreText})
  Kompetenser: ${comps}
  Uppdrag: ${refs}
  AI-bedömning: ${score?.reasoning || "N/A"}`;
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
    .map((c) => {
      const note = c.reasoning ? `: ${c.reasoning}` : "";
      const scoreText = c.prefilterMiss ? "ej scorad" : String(c.score);
      return `- ${c.consultantName} [id: ${c.consultantId}] (${c.level}, score: ${scoreText})${note}`;
    })
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

  // Go/No-Go gatar hårt på ouppfyllda must-KRAV. Leverabler (kind=deliverable) är
  // uppdragets output, inte kvalifikationskrav — de får aldrig räknas som ska-krav
  // (annars kan en oproducerad leverans tvinga winProbability = 0). Filtrera bort dem.
  const analysisForGonogo: RfpAnalysis = {
    ...analysis,
    requirements: qualificationRequirements(analysis.requirements),
  };

  // Numrerad kravlista (1-baserad): modellen svarar med index i stället för att
  // återge varje kravs fulla text i mustRequirements — output-generering
  // dominerar go/no-go-latensen (23–36s), och en full kravtext per krav är dyr
  // att upprepa. Samma filtrering (kvalifikationskrav, inte leverabler) som
  // analysisForGonogo.requirements ovan.
  const numberedRequirements = analysisForGonogo.requirements;
  const requirementsList = numberedRequirements
    .map((r, i) => `${i + 1}. [${r.priority}/${r.kind ?? "qualification"}] ${r.description}`)
    .join("\n");

  const aiResult = await callClaude({
    model: MODELS.gonogo,
    maxTokens: 4000,
    system: SYSTEM_PROMPT,
    userContent: `Bedöm detta teams chanser att vinna följande upphandling.

## RFP-analys
${JSON.stringify(analysisForGonogo, null, 2)}

## Kvalifikationskrav (numrerade)
${requirementsList}

## Låst team
${teamText}

## Övriga tillgängliga konsulter (för förbättringsförslag)
${poolText}`,
    schema: GoNoGoAiResponseSchema,
    label: "Go/No-Go evaluation",
    userId,
  });

  // Hydrera AI-svarets index tillbaka till det publika GoNoGoResult-formatet
  // (requirement = kravtext) — UI/persistens/GoNoGoResultSchema är orörda.
  const result: GoNoGoResult = {
    ...aiResult,
    mustRequirements: hydrateMustRequirements(aiResult.mustRequirements, numberedRequirements),
  };

  // Enforce hard rule: if any must-requirement is unmet, winProbability must be 0.
  // The prompt states this but the LLM occasionally fudges it.
  const anyUnmet = result.mustRequirements.some((r) => !r.met);
  if (anyUnmet && result.winProbability !== 0) {
    result.winProbability = 0;
  }

  // Suppress improvements that aren't actionable: a null swap (no concrete
  // consultant change) or non-positive impact. The prompt forbids 0 % swaps
  // but the LLM still produces "+0 %" suggestions where it argues against
  // itself in the reason field — confusing for the user.
  result.improvements = result.improvements.filter(
    (imp) =>
      imp.swap?.remove != null &&
      imp.swap?.add != null &&
      parseImpactPct(imp.estimatedImpact) > 0,
  );

  return result;
}

/** Parse "+15 %" / "-5%" / "0 %" → number. Returns NaN if unparseable. */
function parseImpactPct(s: string): number {
  const cleaned = s.replace(/[%\s]/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

// Modellen svarar med index in i den numrerade kravlistan (## Kvalifikationskrav)
// i stället för att återge varje kravs text — hydrerar tillbaka till det
// publika GoNoGoResult-formatet. Ogiltigt index (utanför listans intervall)
// droppas defensivt med en varning: modellen instrueras använda giltiga index,
// men en AI-drift ska inte krascha bedömningen.
function hydrateMustRequirements(
  aiMustRequirements: { index: number; met: boolean; coveredBy: string | null }[],
  numberedRequirements: RfpRequirement[],
): MustRequirementCheck[] {
  const hydrated: MustRequirementCheck[] = [];
  for (const r of aiMustRequirements) {
    const requirement = numberedRequirements[r.index - 1];
    if (!requirement) {
      console.warn(
        `Go/No-Go evaluation: ogiltigt kravindex ${r.index} (giltigt intervall 1-${numberedRequirements.length}) — droppar raden`,
      );
      continue;
    }
    hydrated.push({ requirement: requirement.description, met: r.met, coveredBy: r.coveredBy });
  }
  return hydrated;
}
