/**
 * Shared fixtures + scorer for the matching sandboxes (compare + reasoning-judge).
 * Procedurally generates a pool of N synthetic consultants across 4 levels with a
 * realistic mix of strong / mid / off-topic profiles for the 2 RFPs.
 */
import Anthropic from "@anthropic-ai/sdk";
import { ScoredMatchResultSchema } from "@/lib/ai-schemas";
import { extractJson } from "@/lib/ai-client";
import type {
  RfpAnalysis,
  Consultant,
  ConsultantLevel,
  ScoredConsultant,
} from "@/lib/types";

export const client = new Anthropic();

// 100 profiles × 2-3 sentence rationale each can exceed 8000 output tokens — the
// real production cap. Raised here so the scaling run doesn't truncate. Stays
// under the SDK's streaming threshold (max_tokens*60/128000 < 10).
const SCORING_MAX_TOKENS = 20000;

export const SCORING_SYSTEM = `Du är expert på att matcha konsulter till förfrågningsunderlag (RFP:er).
Du får en RFP-analys och en lista konsulter. Scora VARJE konsult individuellt mot RFP:en.
Bedöm hur väl varje konsults kompetenser, erfarenhet och referensuppdrag matchar kraven.

Rankning sker enbart inom samma erfarenhetsnivå — juniors tävlar aldrig mot seniors.

Svara ALLTID med giltig JSON som matchar detta schema:
{
  "scoredConsultants": [
    { "consultantId": "id", "consultantName": "Namn", "level": "senior", "score": 85, "reasoning": "2-3 meningar" }
  ]
}

Regler:
- Scora ALLA konsulter, inte bara de bästa
- Score 0-100: 80+ stark, 60-79 relevant, 40-59 delvis, <40 svag
- reasoning: specifik koppling till kraven`;

const FIRST = [
  "Anna", "Bo", "Cilla", "Dan", "Eva", "Finn", "Gun", "Hans", "Ida", "Jon",
  "Kaj", "Lo", "Mia", "Nils", "Ola", "Pia", "Rut", "Sam", "Tea", "Uno",
  "Vera", "Wilmer", "Yara", "Zack", "Åsa", "Erik", "Karin", "Lars", "Sara", "Olof",
  "Britt", "Per", "Lena", "Sven", "Maja", "Inga", "Carl", "Elin", "Gustav", "Hedda",
];
const LAST = [
  "Svensson", "Ekström", "Berg", "Holm", "Lind", "Ahl", "Sjö", "Borg", "Falk", "Ek",
  "Nyström", "Sand", "Roos", "Hag", "Vik", "Lund", "Norén", "Dahl", "Stål", "Frost",
  "Hall", "Krans", "Möller", "Wahl", "Bergqvist", "Lindqvist", "Åberg", "Sundström", "Hedlund", "Palm",
];

interface Archetype {
  key: string;
  summary: string;
  comps: string[];
}

// Mix: RFP1-strong, RFP1-mid, RFP2-strong, RFP2-mid, and several off-topic.
const ARCHETYPES: Archetype[] = [
  { key: "dt_public", summary: "Digital transformation i offentlig sektor.", comps: ["digital transformation", "offentlig sektor", "molnmigration", "förändringsledning"] },
  { key: "dt_arch", summary: "Molnarkitektur och digital transformation.", comps: ["digital transformation", "molnmigration", "systemarkitektur"] },
  { key: "change_public", summary: "Förändringsledning och verksamhetsutveckling i kommun.", comps: ["förändringsledning", "offentlig sektor", "verksamhetsanalys"] },
  { key: "econ_proc", summary: "Ekonomistyrning och offentlig upphandling.", comps: ["ekonomistyrning", "offentlig upphandling", "LOU", "verksamhetsanalys"] },
  { key: "proc_law", summary: "Offentlig upphandling och avtalsjuridik.", comps: ["offentlig upphandling", "LOU", "avtalsjuridik"] },
  { key: "econ_ctrl", summary: "Ekonomistyrning och controlling.", comps: ["ekonomistyrning", "controlling", "budgetprocess"] },
  { key: "pm_public", summary: "Projektledning i offentlig sektor.", comps: ["projektledning", "offentlig sektor", "förändringsledning"] },
  { key: "cloud_devops", summary: "Molntjänster och DevOps.", comps: ["molnmigration", "DevOps", "AWS"] },
  { key: "cyber", summary: "Cybersäkerhet och riskhantering.", comps: ["cybersäkerhet", "riskhantering", "ISO 27001"] },
  { key: "hr", summary: "HR och kompetensförsörjning.", comps: ["HR", "rekrytering", "kompetensförsörjning"] },
  { key: "frontend", summary: "Frontendutveckling och UX.", comps: ["frontend", "UX", "react"] },
  { key: "data", summary: "Dataanalys och BI.", comps: ["dataanalys", "SQL", "Power BI"] },
];

function levelFor(i: number): ConsultantLevel {
  const m = i % 20;
  if (m < 3) return "expert";
  if (m < 9) return "senior";
  if (m < 16) return "intermediate";
  return "junior";
}

const YEARS: Record<ConsultantLevel, number> = { expert: 14, senior: 9, intermediate: 5, junior: 2 };

/** Deterministically generate a pool of `n` consultants. */
export function makePool(n: number): Consultant[] {
  const pool: Consultant[] = [];
  for (let i = 0; i < n; i++) {
    const arch = ARCHETYPES[i % ARCHETYPES.length];
    const level = levelFor(i);
    const id = `k${String(i + 1).padStart(3, "0")}`;
    const name = `${FIRST[i % FIRST.length]} ${LAST[(i * 3) % LAST.length]}`;
    pool.push({
      id,
      name,
      level,
      yearsExperience: YEARS[level] + (i % 5),
      summary: arch.summary,
      rawCvText: null,
      competencies: arch.comps.map((c) => ({ competency: c, category: "domain" })),
      references: [{ title: `Uppdrag ${arch.key} ${id}`, description: "", year: 2023 + (i % 3), sector: i % 2 ? "public" : "private" }],
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    });
  }
  return pool;
}

export const POOL: Consultant[] = makePool(20);

function rfp(title: string, summary: string, reqs: string[], comps: string[]): RfpAnalysis {
  return {
    title,
    client: "Offentlig beställare",
    deadline: null,
    summary,
    requirements: reqs.map((description) => ({ category: "Kompetens", description, priority: "must" as const })),
    evaluationCriteria: [
      { name: "Kompetens", weight: 60, description: "Relevant erfarenhet" },
      { name: "Genomförande", weight: 40, description: "Metodik" },
    ],
    requiredCompetencies: comps,
    estimatedScope: "2 konsulter, 4 månader",
    redFlags: [],
    domain: "management",
    oslReference: null,
    secrecyRows: [],
  };
}

export const RFPS: RfpAnalysis[] = [
  rfp(
    "Digital transformation och molnmigration",
    "Stöd till offentlig förvaltning för molnmigration och digital transformation med förändringsledning.",
    ["Erfarenhet av digital transformation", "Molnmigration", "Offentlig sektor", "Förändringsledning"],
    ["digital transformation", "molnmigration", "offentlig sektor", "förändringsledning"],
  ),
  rfp(
    "Ekonomistyrning och offentlig upphandling",
    "Stöd för ekonomistyrning och upphandling enligt LOU i kommunal verksamhet.",
    ["Ekonomistyrning", "Offentlig upphandling", "LOU", "Verksamhetsanalys"],
    ["ekonomistyrning", "offentlig upphandling", "LOU", "verksamhetsanalys"],
  ),
];

export function buildUserContent(analysis: RfpAnalysis, consultants: Consultant[]): string {
  const grouped: Record<string, Consultant[]> = {};
  for (const c of consultants) (grouped[c.level] ??= []).push(c);
  const text = Object.entries(grouped)
    .map(([level, cons]) =>
      `${level.toUpperCase()}:\n` +
      cons
        .map((c) => `  - ${c.name} [id: ${c.id}]: ${c.summary}\n    Kompetenser: ${c.competencies.map((co) => co.competency).join(", ")}`)
        .join("\n"),
    )
    .join("\n\n");
  return `Scora följande konsulter mot detta förfrågningsunderlag.\n\n## RFP-analys\n${JSON.stringify(analysis, null, 2)}\n\n## Konsulter\n${text}`;
}

export interface ScorePass {
  model: string;
  scored: ScoredConsultant[];
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
}

export async function scoreAll(
  model: string,
  analysis: RfpAnalysis,
  consultants: Consultant[],
): Promise<ScorePass> {
  const userContent = buildUserContent(analysis, consultants);
  const t0 = Date.now();
  const msg = await client.messages.create({
    model,
    max_tokens: SCORING_MAX_TOKENS,
    system: SCORING_SYSTEM,
    messages: [{ role: "user", content: userContent }],
  });
  const latencyMs = Date.now() - t0;
  const textBlock = msg.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error(`no text from ${model}`);
  const json = extractJson(textBlock.text);
  if (!json) throw new Error(`no JSON from ${model}`);
  const parsed = ScoredMatchResultSchema.parse(JSON.parse(json));
  return {
    model,
    scored: parsed.scoredConsultants,
    latencyMs,
    inputTokens: msg.usage.input_tokens,
    outputTokens: msg.usage.output_tokens,
  };
}
