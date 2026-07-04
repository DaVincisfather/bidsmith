// evals/scripts/generate-cv-fixtures.ts
//
// OPERATÖRSKÖRD, BETALD. Genererar syntetiska konsult-CV-fixtures för CV-noll-
// hallucinationsloopen (fas B). Läser identiteterna i synthetic-pool.yaml och ber
// modellen skriva ett realistiskt 1–2-sidigt svenskt konsult-CV i LÖPTEXT per
// identitet — rubriker, punktlistor, anställningshistorik — som UTTRYCKER poolens
// kompetenser/uppdrag i naturligt CV-språk (så att extraktionen blir icke-trivial).
// Skriver evals/fixtures/cv/<id>.yaml med golden.competency_count = poolprofilens
// antal kompetenser.
//
// FIXTURES ÄR SYNTETISKA — INGEN PII. Namn/bolag/uppdrag i poolen är påhittade.
//
//   tsx evals/scripts/generate-cv-fixtures.ts            # alla identiteter
//   tsx evals/scripts/generate-cv-fixtures.ts anna_svensson   # bara en
import path from "path";
import fs from "fs/promises";
import { z } from "zod";
import { stringify as stringifyYaml } from "yaml";
import { callClaude } from "@/lib/ai-client";
import { MODELS } from "@/lib/models";
import { ConsultantPoolSchema, type SyntheticConsultant } from "../harness/core/fixtures";
import { loadFixtureFromString } from "../harness/core/fixture-loader";

const POOL_PATH = path.resolve("evals/fixtures/consultants/synthetic-pool.yaml");
const OUT_DIR = path.resolve("evals/fixtures/cv");
const LABEL = "eval:cv-fixture-gen";

// Modellen returnerar HELA CV:t som en sträng. min(1): ett tomt CV är ett
// degenererat svar → ResponseFormatError + callClaudes format-retry.
const CvGenSchema = z.object({ cv_text: z.string().min(1) });

const SYSTEM_PROMPT = `Du är en erfaren CV-skribent. Du får en STRUKTURERAD konsultprofil och
skriver ett realistiskt svenskt konsult-CV i LÖPTEXT (1–2 sidor).

Krav på CV:t:
- Naturligt CV-språk: en kort profiltext, rubriker (t.ex. "Kompetenser", "Uppdrag",
  "Anställningar", "Språk"), punktlistor och anställningshistorik.
- ALLA kompetenser i profilen ska framgå av texten, men uttryckta naturligt — inte
  som en rå etikettlista utan invävt i profiltext, uppdragsbeskrivningar och en
  kompetensrubrik. Extraktionen ska behöva LÄSA CV:t, inte bara kopiera en lista.
- ALLA uppdrag/projekt i profilen ska finnas med som beskrivna referensuppdrag
  (kund, roll, år, vad konsulten gjorde).
- Håll dig till profilens fakta — hitta inte på nya kompetenser eller uppdrag.
- Skriv på svenska. Fixturen är syntetisk; ingen riktig person avses.

Svara ALLTID med giltig JSON: { "cv_text": "<hela CV:t som text med radbrytningar>" }`;

function profilePrompt(c: SyntheticConsultant): string {
  const p = c.parsed_profile;
  const comps = p.competencies.map((k) => `- ${k.name} (${k.category})`).join("\n");
  const projs = p.projects
    .map((pr) => `- ${pr.client}, ${pr.role}, ${pr.years} (${pr.sector}): ${pr.description}`)
    .join("\n");
  return `Skriv ett konsult-CV för följande profil:

Namn: ${p.name}
Nivå: ${p.level} (${p.yearsExperience} års erfarenhet)
Sammanfattning: ${p.summary}
Inriktning (för ton): ${c.match_profile.intent}

Kompetenser (alla ska framgå av texten):
${comps}

Uppdrag/projekt (alla ska beskrivas):
${projs}`;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY not set — generatorn gör BETALDA anrop. Vägrar köra.");
    process.exit(1);
  }
  const only = process.argv[2] ?? null;

  const poolRaw = await fs.readFile(POOL_PATH, "utf-8");
  const pool = loadFixtureFromString(poolRaw, ConsultantPoolSchema, "synthetic-pool.yaml");
  const targets = pool.consultants.filter((c) => !only || c.id === only);
  if (targets.length === 0) {
    console.error(`Ingen identitet matchar${only ? ` id=${only}` : ""}.`);
    process.exit(1);
  }

  await fs.mkdir(OUT_DIR, { recursive: true });
  console.log(`Genererar ${targets.length} CV-fixture(s) (modell: ${MODELS.writingSupport}, label: ${LABEL})...`);

  for (const c of targets) {
    console.log(`  → ${c.id}`);
    const { cv_text } = await callClaude({
      model: MODELS.writingSupport,
      maxTokens: 4000,
      system: SYSTEM_PROMPT,
      userContent: profilePrompt(c),
      schema: CvGenSchema,
      label: LABEL,
      // Determinism: samma profil → samma CV (billigare att regenerera reproducerbart).
      temperature: 0,
    });

    const fixture = {
      id: c.id,
      // golden = poolprofilens antal kompetenser (coverage-ögonmått i loopen).
      golden: { competency_count: c.parsed_profile.competencies.length },
      cv_text,
    };
    const out = path.join(OUT_DIR, `${c.id}.yaml`);
    await fs.writeFile(out, stringifyYaml(fixture, { lineWidth: 100 }), "utf-8");
    console.log(`    skrev ${out} (competency_count=${fixture.golden.competency_count})`);
  }
  console.log("Klart. Kör: npm run eval:zero-halluc -- --target=cv");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
