import Anthropic from "@anthropic-ai/sdk";
import { writeFileSync } from "fs";
import path from "path";

const client = new Anthropic();

const bidScenarios = [
  {
    rfp: "Organisationsöversyn av regional hälso- och sjukvård",
    firm: "Nordic Strategy Group",
    consultants: ["Senior Management Consultant", "Junior Management Consultant"],
  },
  {
    rfp: "Molnmigrering för medelstort retailbolag",
    firm: "TechBridge Consulting",
    consultants: ["Senior IT-konsult", "IT-konsult"],
  },
];

async function generateBid(scenario: (typeof bidScenarios)[number], index: number) {
  const message = await client.messages.create({
    model: "claude-sonnet-4-6-20250514",
    max_tokens: 3000,
    messages: [
      {
        role: "user",
        content: `Generera ett realistiskt anbud/offert på svenska i markdown-format.

Kontext:
- Svar på RFP: "${scenario.rfp}"
- Konsultfirma: ${scenario.firm} (påhittat namn)
- Föreslagna konsulter: ${scenario.consultants.join(", ")}

Inkludera:
- Försättsblad med firmanamn, kontaktperson, datum
- Sammanfattning av förståelse för uppdraget
- Metod och genomförandeplan
- Organisation och bemanning (konsultpresentationer, kortfattade)
- Tidplan
- Prissättning (timpriser och totalestimat)
- Referenser (anonymiserade)
- Bilagor (CV:n hänvisas till separat)

Gör det realistiskt — som ett riktigt anbud en konsultfirma skulle skicka in.`,
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type");

  const filePath = path.join("data", "synthetic", "bids", `bid-${index + 1}.md`);
  writeFileSync(filePath, content.text);
  console.log(`Generated: ${filePath}`);
}

async function main() {
  console.log("Generating synthetic bids...");
  for (let i = 0; i < bidScenarios.length; i++) {
    await generateBid(bidScenarios[i], i);
  }
  console.log("Done.");
}

main();
