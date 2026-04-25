import Anthropic from "@anthropic-ai/sdk";
import { writeFileSync, mkdirSync } from "fs";
import { execFileSync } from "child_process";
import path from "path";

const client = new Anthropic();

const profiles = [
  {
    name: "Anna Berg",
    role: "Partner / Senior Manager",
    focus: "strategi och affärsutveckling",
    years: 18,
    industries: ["finans", "life science", "energi"],
  },
  {
    name: "Magnus Holmqvist",
    role: "Senior Management Consultant",
    focus: "organisationsutveckling och ledarskap",
    years: 14,
    industries: ["offentlig sektor", "hälso- och sjukvård"],
  },
  {
    name: "Elin Wallén",
    role: "Senior Management Consultant",
    focus: "förändringsledning och transformation",
    years: 12,
    industries: ["bank", "försäkring"],
  },
  {
    name: "Henrik Ödman",
    role: "Manager",
    focus: "M&A och post-merger integration",
    years: 10,
    industries: ["industri", "retail", "telekom"],
  },
  {
    name: "Sara Norén",
    role: "Manager",
    focus: "verksamhetsutveckling och lean",
    years: 9,
    industries: ["tillverkning", "logistik", "offentlig sektor"],
  },
  {
    name: "Johan Frisk",
    role: "Senior Consultant",
    focus: "strategisk inköpsfunktion och sourcing",
    years: 7,
    industries: ["handel", "energi", "fordon"],
  },
  {
    name: "Linnea Bergqvist",
    role: "Senior Consultant",
    focus: "hållbarhet och ESG-strategi",
    years: 6,
    industries: ["fastighet", "finans", "retail"],
  },
  {
    name: "Aram Tahbaz",
    role: "Consultant",
    focus: "dataanalys och beslutsstöd för ledningsgrupper",
    years: 4,
    industries: ["offentlig sektor", "hälso- och sjukvård"],
  },
  {
    name: "Mira Söderlund",
    role: "Consultant",
    focus: "processkartläggning och verksamhetsstyrning",
    years: 3,
    industries: ["bank", "kommun", "fastighet"],
  },
  {
    name: "Filip Stenberg",
    role: "Junior Consultant",
    focus: "marknadsanalys och strategiunderlag",
    years: 2,
    industries: ["tech", "life science"],
  },
];

const OUTPUT_DIR = path.join("data", "synthetic", "konsult cv batch 2");

async function generateCv(profile: (typeof profiles)[number], index: number) {
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2500,
    messages: [
      {
        role: "user",
        content: `Generera ett realistiskt men anonymiserat konsult-CV på svenska i markdown-format.

Profil:
- Namn: ${profile.name} (använd exakt detta namn — döp inte om personen)
- Roll: ${profile.role}
- Fokusområde: ${profile.focus}
- Erfarenhet: ${profile.years} år
- Branscher: ${profile.industries.join(", ")}

Inkludera:
- Namn (${profile.name}), titel, kort sammanfattning (3-5 meningar)
- Nyckelkompetenser (8-12 punkter, som bullet-list)
- Utbildning
- 4-6 referensuppdrag — använd en markdown-tabell med kolumnerna: Kund | Roll | Period | Beskrivning | Resultat. Anonymisera kund som "Stor bank", "Medelstort energibolag", "Region X" etc.
- Certifieringar om relevant (bullet-list)

Formatkrav:
- Använd # för namn, ## för sektionsrubriker, ### för undersektioner vid behov
- Använd **fet text** för viktiga begrepp i sammanfattningen
- Inkludera minst en markdown-tabell (referensuppdrag)
- Inkludera både bullet-lists och numbered lists

Returnera enbart markdown — ingen kringtext, inga code fences.`,
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type");

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const mdPath = path.join(OUTPUT_DIR, `consultant-${index + 1}.md`);
  const docxPath = path.join(OUTPUT_DIR, `consultant-${index + 1}.docx`);
  writeFileSync(mdPath, content.text, "utf-8");
  execFileSync("python", ["scripts/md-to-docx.py", mdPath, docxPath], {
    stdio: "inherit",
  });
  console.log(`Generated: ${mdPath} + ${path.basename(docxPath)}`);
}

async function main() {
  console.log(`Generating ${profiles.length} synthetic management consultant CVs...`);
  for (let i = 0; i < profiles.length; i++) {
    await generateCv(profiles[i], i);
  }
  console.log("Done.");
}

main();
