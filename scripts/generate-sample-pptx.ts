// One-shot script to produce a sample PPTX with every v2 slide type.
// Run with: npx tsx scripts/generate-sample-pptx.ts
// Output: tmp/sample-bid.pptx — open in PowerPoint/Keynote to eyeball.

import fs from "fs";
import path from "path";
import { renderBidToPptx } from "../src/lib/pptx";
import { BidSection, StyleGuide } from "../src/lib/types";

const style: StyleGuide = {
  colors: {
    primary: "#1A2B4A",
    primaryLight: "#2D4A7A",
    secondary: "#E8913A",
    secondaryLight: "#F4B76E",
    accent: "#2E8B57",
    dark: "#1A1A1A",
    light: "#F5F5F0",
    muted: "#6B7280",
  },
  font: "Calibri",
  logoUrl: "",
};

const phases = [
  {
    name: "Fas 1: Uppstart & kartläggning",
    objective: "Förankra uppdrag och kartlägg nuläge",
    activities: ["Uppstartsmöte", "Intervjuer med nyckelpersoner", "Dokumentinventering"],
    deliverables: ["Projektplan", "Intervjusammanställning"],
    duration: "4 veckor",
    risks: ["Svårt att få tid med nyckelpersoner"],
    hoursEstimate: 120,
    period: "April 2026",
  },
  {
    name: "Fas 2: Analys",
    objective: "Analysera insamlat material och identifiera förbättringsområden",
    activities: ["Kvantitativ dataanalys", "Kvalitativ syntes", "Benchmarking"],
    deliverables: ["Analysrapport", "Gap-analys"],
    duration: "6 veckor",
    risks: ["Otillräcklig datakvalitet"],
    hoursEstimate: 180,
    period: "Maj–Juni 2026",
  },
  {
    name: "Fas 3: Lösningsdesign",
    objective: "Designa målbild och förslag till genomförande",
    activities: ["Workshops", "Prototypning", "Prioritering"],
    deliverables: ["Målbild", "Roadmap"],
    duration: "4 veckor",
    risks: ["Divergerande intressen mellan avdelningar"],
    hoursEstimate: 150,
    period: "Juni–Juli 2026",
  },
];

const sections: BidSection[] = [
  {
    type: "data",
    key: "cover",
    title: "Framsida",
    content: { format: "cover", title: "Digital transformation 2026", client: "Region VGR", date: "2026-04-10" },
    generatedAt: "2026-04-10",
  },
  {
    type: "data",
    key: "toc",
    title: "Innehållsförteckning",
    content: {
      format: "bullets",
      items: ["Uppdragsförståelse", "Genomförandeplan", "Team & Referenser", "Pris", "Kontakt"],
    },
    generatedAt: "2026-04-10",
  },
  {
    type: "data",
    key: "divider-1",
    title: "Uppdragsförståelse",
    content: { format: "section-divider", sectionNumber: 1, subtitle: "Vår förståelse och approach" },
    generatedAt: "2026-04-10",
  },
  {
    type: "ai",
    key: "understanding",
    title: "Uppdragsförståelse",
    content: {
      format: "prose",
      text: "Vi förstår att Region VGR behöver en extern partner med djup branschkunskap för att driva den pågående digitala transformationen vidare. Fokus ligger på att öka den digitala mognaden, effektivisera processer och säkerställa att den nya plattformen levererar mätbart värde till medborgarna. Vår approach kombinerar strukturerad metodik med praktisk erfarenhet från liknande uppdrag inom offentlig sektor.",
    },
    generatedAt: "2026-04-10",
  },
  {
    type: "data",
    key: "three-col-1",
    title: "Vår förståelse i tre perspektiv",
    content: {
      format: "three-column",
      columns: [
        { title: "Nuläge", icon: "N", body: "Processerna är delvis digitaliserade men saknar genomgående integration." },
        { title: "Vad vi ser", icon: "V", body: "Möjlighet att lyfta datadriven styrning och självservice för medborgaren." },
        { title: "Vårt uppdrag", icon: "U", body: "Skapa en tydlig roadmap med snabb realiserad nytta redan i fas 1." },
      ],
    },
    generatedAt: "2026-04-10",
  },
  {
    type: "ai",
    key: "value-proposition",
    title: "Identifierat värde",
    content: {
      format: "bullets",
      items: [
        "Snabbare ledtider i kärnprocesser — uppskattad tidsvinst 20–30%",
        "Ökad datakvalitet via gemensam masterdata",
        "Minskat dubbelarbete mellan förvaltningar",
        "Grund för datadriven uppföljning och beslutsstöd",
      ],
    },
    generatedAt: "2026-04-10",
  },
  {
    type: "data",
    key: "divider-2",
    title: "Genomförandeplan",
    content: { format: "section-divider", sectionNumber: 2, subtitle: "Metod, faser och tidplan" },
    generatedAt: "2026-04-10",
  },
  {
    type: "data",
    key: "gantt",
    title: "Tidplan",
    content: { format: "gantt", phases, milestones: [{ label: "Styrgrupp 1", afterPhase: 1 }, { label: "Styrgrupp 2", afterPhase: 2 }] },
    generatedAt: "2026-04-10",
  },
  {
    type: "ai",
    key: "execution-plan",
    title: "Genomförandeplan",
    content: { format: "phases", phases },
    generatedAt: "2026-04-10",
  },
  {
    type: "ai",
    key: "quality",
    title: "Kvalitetssäkring och samverkan",
    content: {
      format: "prose",
      text: "Kvalitet säkerställs via veckovisa avstämningar, månadsvisa styrgruppsmöten och en tydlig eskaleringsprocess. Vi följer ISO 9001-processer och lämnar alltid över resultatet med dokumenterad kunskapsöverföring.",
    },
    generatedAt: "2026-04-10",
  },
  {
    type: "ai",
    key: "risks",
    title: "Risker och hantering",
    content: {
      format: "bullets",
      items: [
        "Tillgång till nyckelpersoner — mitigeras genom tidig planering och backup-roller",
        "Integrationer mot gamla system — mitigeras genom tidiga spikes",
        "Organisationsförändringar — mitigeras genom tydlig kommunikationsplan",
      ],
    },
    generatedAt: "2026-04-10",
  },
  {
    type: "data",
    key: "divider-3",
    title: "Team & Referenser",
    content: { format: "section-divider", sectionNumber: 3, subtitle: "Vårt team och relevanta uppdrag" },
    generatedAt: "2026-04-10",
  },
  {
    type: "ai",
    key: "team",
    title: "Teamet",
    content: {
      format: "team",
      members: [
        { consultantId: "c1", name: "Anna Svensson", role: "Uppdragsledare", relevantExperience: "12 års erfarenhet av digitala transformationer inom offentlig sektor", keyCompetencies: ["Uppdragsledning", "Förändringsledning", "Offentlig upphandling"] },
        { consultantId: "c2", name: "Erik Johansson", role: "Lösningsarkitekt", relevantExperience: "Tidigare ledande arkitekt hos två regioner och ett landsting", keyCompetencies: ["Systemarkitektur", "Integration", "Azure"] },
        { consultantId: "c3", name: "Maria Lindqvist", role: "Data & BI", relevantExperience: "Byggt datadrivet beslutsstöd åt flera kommuner", keyCompetencies: ["Power BI", "Datamodellering", "SQL"] },
        { consultantId: "c4", name: "Johan Persson", role: "Förändringsledare", relevantExperience: "Har drivit change management i organisationer med 500+ användare", keyCompetencies: ["Change management", "Utbildning", "Kommunikation"] },
      ],
    },
    generatedAt: "2026-04-10",
  },
  {
    type: "data",
    key: "requirement-matrix",
    title: "Kravmatris",
    content: {
      format: "requirement-matrix",
      rows: [
        { requirement: "Erfarenhet av offentlig sektor", priority: "must", coverage: { c1: true, c2: true, c3: true, c4: false } },
        { requirement: "Azure-certifiering", priority: "should", coverage: { c1: false, c2: true, c3: false, c4: false } },
        { requirement: "Förändringsledning", priority: "must", coverage: { c1: true, c2: false, c3: false, c4: true } },
        { requirement: "Power BI-kompetens", priority: "nice-to-have", coverage: { c1: false, c2: false, c3: true, c4: false } },
      ],
      consultantNames: { c1: "Anna S.", c2: "Erik J.", c3: "Maria L.", c4: "Johan P." },
    },
    generatedAt: "2026-04-10",
  },
  {
    type: "ai",
    key: "references",
    title: "Referensuppdrag",
    content: {
      format: "references",
      references: [
        { title: "Digital arbetsplats", client: "Region Skåne", year: 2024, description: "Införande av ny samarbetsplattform för 15 000 medarbetare", relevance: "Samma skala och domän" },
        { title: "Integrationsplattform", client: "Kommun X", year: 2023, description: "Design och implementation av integrationsplattform", relevance: "Liknande teknisk komplexitet" },
        { title: "Datadrivet beslutsstöd", client: "Region Y", year: 2025, description: "Införde Power BI-baserat beslutsstöd för verksamhetsledningen", relevance: "Stödjer kravet på BI-kompetens" },
      ],
    },
    generatedAt: "2026-04-10",
  },
  {
    type: "placeholder",
    key: "pricing",
    title: "Pris & omfattning",
    content: { format: "placeholder", instruction: "Fyll i er prisbild, timmar och eventuella förbehåll." },
    generatedAt: "2026-04-10",
  },
];

async function main() {
  const buffer = await renderBidToPptx(sections, style);
  const outDir = path.join(process.cwd(), "tmp");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "sample-bid.pptx");
  fs.writeFileSync(outPath, buffer);
  console.log(`Wrote ${buffer.length} bytes to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
