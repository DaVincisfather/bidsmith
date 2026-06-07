/**
 * Sandbox: blind-judge the REASONING TEXT quality of Haiku vs Sonnet.
 *
 * Opus (neutral — neither contestant) judges, consultant by consultant, which
 * rationale better justifies the match: specific, grounded in the profile, no
 * invented facts. Order is randomized per item so the judge can't tell which
 * model wrote which.
 *
 * Run: source ~/projects/bidsmith-main/.env.local; npx tsx evals/scripts/sandbox-reasoning-judge.ts
 */
import { z } from "zod";
import { extractJson } from "@/lib/ai-client";
import { makePool, RFPS, scoreAll, client } from "./_matching-fixtures";
import type { RfpAnalysis, Consultant } from "@/lib/types";

const SONNET = "claude-sonnet-4-6";
const HAIKU = "claude-haiku-4-5-20251001";
const JUDGE = "claude-opus-4-7";

const POOL = makePool(Number(process.env.POOL_SIZE) || 20);
const MAX_JUDGE_PER_RFP = 40; // even sample to keep Opus judge calls bounded at large pools

const JudgeSchema = z.object({
  winner: z.enum(["A", "B", "tie"]),
  aSpecificity: z.number().min(1).max(5),
  bSpecificity: z.number().min(1).max(5),
  aHallucination: z.boolean(),
  bHallucination: z.boolean(),
});
type Judge = z.infer<typeof JudgeSchema>;

const JUDGE_SYSTEM = `Du är en sträng, opartisk domare. Du får en konsultprofil, ett uppdrags krav, och TVÅ motiveringar (A och B) för hur väl konsulten matchar.
Bedöm vilken motivering som är bäst. En bra motivering är:
- specifik: kopplar konsultens faktiska kompetenser/erfarenhet till uppdragets konkreta krav
- grundad: hittar INTE på fakta som saknas i profilen
- skarp: undviker generiskt fluff

Straffa hallucination (påståenden som inte stöds av profilen) hårt.

Svara ENBART med giltig JSON:
{ "winner": "A" | "B" | "tie", "aSpecificity": 1-5, "bSpecificity": 1-5, "aHallucination": true|false, "bHallucination": true|false }`;

function judgeUserContent(
  analysis: RfpAnalysis,
  c: Consultant,
  ratA: string,
  ratB: string,
): string {
  return `## Uppdragets krav
${analysis.requiredCompetencies.join(", ")}
Beskrivning: ${analysis.summary}

## Konsultprofil
Namn: ${c.name} (${c.level})
Sammanfattning: ${c.summary}
Kompetenser: ${c.competencies.map((co) => co.competency).join(", ")}

## Motivering A
${ratA}

## Motivering B
${ratB}`;
}

async function judge(
  analysis: RfpAnalysis,
  c: Consultant,
  ratA: string,
  ratB: string,
): Promise<Judge> {
  const msg = await client.messages.create({
    model: JUDGE,
    max_tokens: 400,
    system: JUDGE_SYSTEM,
    messages: [{ role: "user", content: judgeUserContent(analysis, c, ratA, ratB) }],
  });
  const textBlock = msg.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("no judge text");
  const json = extractJson(textBlock.text);
  if (!json) throw new Error("no judge JSON");
  return JudgeSchema.parse(JSON.parse(json));
}

// simple concurrency-limited map
async function pool<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

interface Tally {
  haikuWins: number;
  sonnetWins: number;
  ties: number;
  haikuSpec: number[];
  sonnetSpec: number[];
  haikuHall: number;
  sonnetHall: number;
  n: number;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY not set. Run: source ~/projects/bidsmith-main/.env.local");
    process.exit(1);
  }

  const t: Tally = {
    haikuWins: 0, sonnetWins: 0, ties: 0,
    haikuSpec: [], sonnetSpec: [], haikuHall: 0, sonnetHall: 0, n: 0,
  };

  for (let r = 0; r < RFPS.length; r++) {
    const analysis = RFPS[r];
    console.log(`\nRFP ${r + 1}: ${analysis.title} — scoring with Haiku + Sonnet...`);
    const haiku = await scoreAll(HAIKU, analysis, POOL);
    const sonnet = await scoreAll(SONNET, analysis, POOL);
    const hById = new Map(haiku.scored.map((s) => [s.consultantId, s.reasoning]));
    const sById = new Map(sonnet.scored.map((s) => [s.consultantId, s.reasoning]));

    // even sample to bound judge calls at large pools
    const eligible = POOL.filter((c) => hById.has(c.id) && sById.has(c.id));
    const sampled =
      eligible.length > MAX_JUDGE_PER_RFP
        ? eligible.filter((_, idx) => idx % Math.ceil(eligible.length / MAX_JUDGE_PER_RFP) === 0)
        : eligible;

    // randomize A/B assignment per consultant (avoid position bias)
    const items = sampled.map((c) => {
      const haikuIsA = Math.random() < 0.5;
      return {
        c,
        haikuIsA,
        ratA: haikuIsA ? hById.get(c.id)! : sById.get(c.id)!,
        ratB: haikuIsA ? sById.get(c.id)! : hById.get(c.id)!,
      };
    });

    console.log(`  judging ${items.length} rationale pairs with Opus...`);
    const verdicts = await pool(items, 5, (it) => judge(analysis, it.c, it.ratA, it.ratB));

    verdicts.forEach((v, i) => {
      const { haikuIsA } = items[i];
      // map A/B back to models
      const haikuSpec = haikuIsA ? v.aSpecificity : v.bSpecificity;
      const sonnetSpec = haikuIsA ? v.bSpecificity : v.aSpecificity;
      const haikuHall = haikuIsA ? v.aHallucination : v.bHallucination;
      const sonnetHall = haikuIsA ? v.bHallucination : v.aHallucination;
      t.haikuSpec.push(haikuSpec);
      t.sonnetSpec.push(sonnetSpec);
      if (haikuHall) t.haikuHall++;
      if (sonnetHall) t.sonnetHall++;
      if (v.winner === "tie") t.ties++;
      else {
        const haikuWon = (v.winner === "A") === haikuIsA;
        if (haikuWon) t.haikuWins++;
        else t.sonnetWins++;
      }
      t.n++;
    });
  }

  const avg = (v: number[]) => (v.reduce((s, x) => s + x, 0) / v.length).toFixed(2);
  const pct = (n: number) => ((n / t.n) * 100).toFixed(0) + "%";
  console.log(`\n${"=".repeat(60)}\nREASONING QUALITY (Opus blind judge, n=${t.n})\n${"=".repeat(60)}`);
  console.log(`  Wins:        Sonnet ${t.sonnetWins} (${pct(t.sonnetWins)})   Haiku ${t.haikuWins} (${pct(t.haikuWins)})   tie ${t.ties} (${pct(t.ties)})`);
  console.log(`  Specificity: Sonnet ${avg(t.sonnetSpec)}/5   Haiku ${avg(t.haikuSpec)}/5`);
  console.log(`  Hallucinations: Sonnet ${t.sonnetHall}/${t.n}   Haiku ${t.haikuHall}/${t.n}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
