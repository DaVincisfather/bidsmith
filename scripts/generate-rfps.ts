import Anthropic from "@anthropic-ai/sdk";
import { writeFileSync, mkdirSync } from "fs";
import { execFileSync } from "child_process";
import path from "path";

const client = new Anthropic();

const rfpScenarios = [
  {
    type: "offentlig",
    title: "Organisationsöversyn av regional förvaltning",
    scope:
      "Extern genomlysning av organisationsstruktur, styrmodell och samverkan inom en region — leverans omfattar nulägesanalys, åtgärdsförslag och implementationsplan",
  },
  {
    type: "privat",
    title: "Strategiutveckling och tillväxtplan för medelstort industribolag",
    scope:
      "Marknadsanalys, strategiska alternativ, prioriterad tillväxtplan över tre år samt ledningsworkshop-leverans",
  },
];

const OUTPUT_DIR = path.join("data", "synthetic", "rfps batch 2");

async function generateRfp(scenario: (typeof rfpScenarios)[number], index: number) {
  const isPublic = scenario.type === "offentlig";

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 6000,
    messages: [
      {
        role: "user",
        content: `Generera ett realistiskt förfrågningsunderlag (RFP) på svenska i markdown-format.

Typ: ${isPublic ? "Offentlig upphandling (LOU)" : "Privat offertförfrågan"}
Titel: ${scenario.title}
Scope: ${scenario.scope}

Inkludera:
- Rubrik och diarienummer (påhittat)
- Bakgrund och syfte
- Uppdragsbeskrivning med delmoment som numbered list
- Kravspecifikation (ska-krav och bör-krav som bullet-lists)
- Utvärderingskriterier som markdown-tabell med kolumnerna: Kriterium | Viktning | Beskrivning
- Tidplan och leveranser som markdown-tabell med kolumnerna: Fas | Period | Leverans
- Anbudets format och innehållskrav
- Sista anbudsdag
${isPublic ? "- Hänvisning till LOU\n- Upphandlingsform (förenklat förfarande)" : ""}

Formatkrav:
- Använd # för huvudtitel, ## för sektionsrubriker, ### vid behov
- Använd **fet text** för avgörande krav och datum
- Inkludera minst två markdown-tabeller (utvärderingskriterier, tidplan)
- Inkludera både bullet-lists och numbered lists

Returnera enbart markdown — ingen kringtext, inga code fences. Gör det realistiskt — som ett riktigt underlag en konsultfirma skulle ta emot.`,
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type");

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const mdPath = path.join(OUTPUT_DIR, `rfp-${index + 1}.md`);
  const docxPath = path.join(OUTPUT_DIR, `rfp-${index + 1}.docx`);
  writeFileSync(mdPath, content.text, "utf-8");
  execFileSync("python", ["scripts/md-to-docx.py", mdPath, docxPath], {
    stdio: "inherit",
  });
  console.log(`Generated: ${mdPath} + ${path.basename(docxPath)}`);
}

async function main() {
  console.log(`Generating ${rfpScenarios.length} synthetic management RFPs...`);
  for (let i = 0; i < rfpScenarios.length; i++) {
    await generateRfp(rfpScenarios[i], i);
  }
  console.log("Done.");
}

main();
