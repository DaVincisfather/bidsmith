import Anthropic from "@anthropic-ai/sdk";
import { writeFileSync } from "fs";
import path from "path";

const client = new Anthropic();

const rfpScenarios = [
  {
    type: "offentlig",
    title: "Organisationsöversyn av regional hälso- och sjukvård",
    scope: "Extern genomlysning av organisationsstruktur och styrmodell",
  },
  {
    type: "privat",
    title: "Molnmigrering för medelstort retailbolag",
    scope: "Flytt av legacy-system till Azure/AWS med minimal driftstörning",
  },
  {
    type: "offentlig",
    title: "Digitaliseringsstrategi för kommunal förvaltning",
    scope: "Framtagning av strategi och handlingsplan för digital transformation",
  },
];

async function generateRfp(scenario: (typeof rfpScenarios)[number], index: number) {
  const isPublic = scenario.type === "offentlig";

  const message = await client.messages.create({
    model: "claude-sonnet-4-6-20250514",
    max_tokens: 3000,
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
- Uppdragsbeskrivning med delmoment
- Kravspecifikation (ska-krav och bör-krav)
- Utvärderingskriterier med viktning (t.ex. kompetens 40%, pris 30%, metod 30%)
- Tidplan och leveranser
- Anbudets format och innehållskrav
- Sista anbudsdag
${isPublic ? "- Hänvisning till LOU\n- Upphandlingsform (förenklat förfarande)" : ""}

Gör det realistiskt — som ett riktigt underlag en konsultfirma skulle ta emot.`,
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type");

  const filePath = path.join("data", "synthetic", "rfps", `rfp-${index + 1}.md`);
  writeFileSync(filePath, content.text);
  console.log(`Generated: ${filePath}`);
}

async function main() {
  console.log("Generating synthetic RFPs...");
  for (let i = 0; i < rfpScenarios.length; i++) {
    await generateRfp(rfpScenarios[i], i);
  }
  console.log("Done.");
}

main();
