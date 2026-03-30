import Anthropic from "@anthropic-ai/sdk";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";

const client = new Anthropic();

const profiles = [
  {
    role: "Senior Management Consultant",
    focus: "strategi och organisationsutveckling",
    years: 12,
    industries: ["finans", "offentlig sektor", "life science"],
  },
  {
    role: "IT-konsult",
    focus: "systemintegration och molnmigrering",
    years: 8,
    industries: ["retail", "logistik", "fintech"],
  },
  {
    role: "Management Consultant",
    focus: "affärsutveckling och förändringsledning",
    years: 5,
    industries: ["energi", "telekom", "offentlig sektor"],
  },
  {
    role: "Senior IT-konsult",
    focus: "arkitektur och teknisk projektledning",
    years: 15,
    industries: ["bank", "försäkring", "hälso- och sjukvård"],
  },
  {
    role: "Junior Management Consultant",
    focus: "dataanalys och beslutsunderlag",
    years: 2,
    industries: ["offentlig sektor", "fastighet"],
  },
];

async function generateCv(profile: (typeof profiles)[number], index: number) {
  const message = await client.messages.create({
    model: "claude-sonnet-4-6-20250514",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `Generera ett realistiskt men anonymiserat konsult-CV på svenska i markdown-format.

Profil:
- Roll: ${profile.role}
- Fokusområde: ${profile.focus}
- Erfarenhet: ${profile.years} år
- Branscher: ${profile.industries.join(", ")}

Inkludera:
- Namn (påhittat), titel, sammanfattning
- Nyckelkompetenser (8-12 stycken)
- Utbildning
- 3-5 referensuppdrag med: kund (anonymiserat som "Stor bank", "Medelstort energibolag" etc.), roll, period, beskrivning, resultat
- Certifieringar om relevant

Gör det realistiskt — som ett riktigt konsult-CV som skulle skickas med i ett anbud.`,
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type");

  const filePath = path.join("data", "synthetic", "cvs", `consultant-${index + 1}.md`);
  writeFileSync(filePath, content.text);
  console.log(`Generated: ${filePath}`);
}

async function main() {
  console.log("Generating synthetic consultant CVs...");
  for (let i = 0; i < profiles.length; i++) {
    await generateCv(profiles[i], i);
  }
  console.log("Done.");
}

main();
