// One-shot script to produce a sample PPTX exercising every v2 slide type.
// Run with: npx tsx scripts/generate-sample-pptx.ts
// Output: tmp/sample-bid.pptx — open in PowerPoint/Keynote to eyeball (Task 12).

import fs from "fs";
import path from "path";
import { renderTemplate } from "../src/lib/pptx-template/loader";
import type { MasterContext } from "../src/lib/pptx-template/types";
import type { BidSection } from "../src/lib/types";

// ---------------------------------------------------------------------------
// Master context — replaces placeholders in header/footer of every slide
// ---------------------------------------------------------------------------

const masterCtx: MasterContext = {
  companyName: "Edgren Konsult AB",
  clientName: "Region Västra Götaland",
  bidName: "Strategiskt utvecklingsstöd för digital transformation",
  diaryNumber: "VGR-2026-0042",
  bidDate: "2026-04-19",
};

// ---------------------------------------------------------------------------
// Section fixtures — one entry per slide that has structured placeholder data
// ---------------------------------------------------------------------------

const sections: BidSection[] = [
  // -------------------------------------------------------------------------
  // Slide 1: Cover (no structured section needed — covered by MasterContext)
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Slide 2: TOC (no structured section needed — static in template)
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Slide 3: Kunden idag — understanding-current
  // -------------------------------------------------------------------------
  {
    type: "ai",
    key: "understanding-current",
    title: "Kunden idag",
    generatedAt: "2026-04-19",
    content: {
      format: "understanding-current",
      organisation:
        "Sveriges näst största region med komplex politisk styrning.\n56 000 anställda, fyra sjukhus, 200+ vårdcentraler, 49 kommuner.",
      system:
        "Heterogen systemflora: TakeCare, Raindance, Cosmic, Millennium,\nlokala journalstödsystem och egenutvecklade specialapplikationer.",
      processer:
        "Kärnprocesser i silos mellan hälso- och sjukvårdsförvaltningar.\nManuell dataextraktion, begränsad integration, överlappande register.",
      smärtpunkter: [
        "Dubbeldokumentation pga bristande systemintegration mellan förvaltningar",
        "Begränsad realtidsdata försvårar operativ resursstyrning och kapacitetsplanering",
        "Ojämn digital mognad mellan förvaltningar skapar friktion vid samverkan",
        "Långa ledtider i beslutsprocesser — från behov till driftsatt lösning",
        "Svagt masterdata-arbete leder till inkonsistenta patientuppgifter över system",
        "Kompetensbrist inom integrations- och dataarkitektur i regionens egen IT",
      ],
    },
  },

  // -------------------------------------------------------------------------
  // Slide 4: Uppdragsbeskrivning — understanding-assignment
  // -------------------------------------------------------------------------
  {
    type: "ai",
    key: "understanding-assignment",
    title: "Uppdragsbeskrivning",
    generatedAt: "2026-04-19",
    content: {
      format: "understanding-assignment",
      stycken: [
        "Region Västra Götaland söker en erfaren konsultpartner för att driva digital transformation inom hälso- och sjukvård över samtliga förvaltningar. Uppdraget omfattar strategisk analys, gemensam målbild, prioriterad roadmap och operativt genomförandestöd under 12–18 månader med möjlighet till option om ytterligare 12 månader.",
        "Konsulten leder tvärfunktionella workshops med politisk styrgrupp, förvaltningsledning och verksamhet, säkrar ledningsförankring på alla nivåer och producerar beslutsunderlag, roadmap, business case samt mätramverk för löpande nyttorealisering under hela transformationsperioden.",
        "Arbetet bedrivs i nära samverkan med regionens digitaliseringsenhet, IT-förvaltning och upphandlingsavdelning. Leveransmodellen följer regionens etablerade projektmetodik och kvalitetskrav enligt ISO 9001.",
        "Slutleverans inkluderar styrgruppsrapportering, överlämningsdokumentation, rekommendationer för nästa fas samt en konkret förvaltningsplan som säkerställer att förändringsarbetet fortsätter efter uppdragets slut.",
      ],
    },
  },

  // -------------------------------------------------------------------------
  // Slide 5: Utmaningar och värde — understanding-vision
  // -------------------------------------------------------------------------
  {
    type: "ai",
    key: "understanding-vision",
    title: "Utmaningar och värde",
    generatedAt: "2026-04-19",
    content: {
      format: "understanding-vision",
      utmaningar: [
        "Samordna parallella digitaliseringsinitiativ utan stark central styrning eller portföljfunktion",
        "Förbättra medarbetarvardagen — inte bara byta teknik utan också arbetssätt och kultur",
        "Hantera motstånd i komplex multistakeholder-miljö med politisk, facklig och verksamhetspåverkan",
        "Uppnå GDPR- och patientdatakrav i distribuerat systemlandskap med gamla integrationer",
        "Säkerställa kompetensöverföring från konsult till intern förvaltning under hela resan",
      ],
      värden: [
        "20–30 % kortare ledtider i kärnprocesser genom automatisering och integration",
        "Ökad datakvalitet via masterdata-hantering och en enhetlig integrationshubb",
        "Stärkt beslutsförmåga i ledning och verksamhet via realtidsdashboards",
        "Framtidssäkrad plattform för AI-driven uppföljning och prediktiv analys",
        "Lägre förvaltningskostnad genom konsolidering av överlappande system",
      ],
    },
  },

  // -------------------------------------------------------------------------
  // Slides 6 + 7: Phases overview + phase-detail clones
  // -------------------------------------------------------------------------
  {
    type: "data",
    key: "phases",
    title: "Genomförandeplan",
    generatedAt: "2026-04-19",
    content: {
      format: "phases",
      phases: [
        {
          name: "Uppstart & nuläge",
          shortDescription: "Förankra uppdrag och kartlägg nuläge",
          objective: "Etablera projektstruktur, skapa gemensam bild av nuläget och identifiera prioriterade förbättringsområden",
          activities: [
            "Uppstartsmöte med styrgrupp och verksamhetsledning + projektplan",
            "15–20 djupintervjuer med nyckelpersoner i verksamhet och IT",
            "Systemkartläggning och dokumentinventering av befintligt landskap",
            "Workshop för validering och prioritering med förvaltningschefer",
            "Riskanalys och intressentkarta för transformationsresan",
          ],
          deliverables: [
            "Projektplan och kommunikationsplan för hela uppdraget",
            "Nulägessrapport med smärtpunktslista och bedömd affärspåverkan",
            "Intressent- och riskkarta som underlag för roadmap",
          ],
          decisions: [
            "Styrgruppen godkänner nulägessrapport och scope",
            "Go/No-go för fördjupad analys i fas 2",
            "Resurs- och budgetram bekräftad för nästa fas",
          ],
          duration: "4 v",
          period: "M1–M2",
          hoursEstimate: 120,
        },
        {
          name: "Analys & målbild",
          shortDescription: "Analysera material och definiera målbild",
          objective: "Djupanalys av prioriterade förbättringsområden och formulering av gemensam digital målbild",
          activities: [
            "Kvantitativ dataanalys av processer",
            "Benchmarking mot ledande regioner",
            "Co-design workshops för framtida processer",
            "Gap-analys: nuläge vs. målbild",
          ],
          deliverables: [
            "Analysrapport med gap-analys",
            "Digital målbild för 2027–2029",
          ],
          decisions: [
            "Styrgruppen antar digital målbild",
            "Prioritering av initiativ",
            "Resurs- och budgetram för roadmap",
          ],
          duration: "12 v",
          period: "M2–M5",
          hoursEstimate: 180,
        },
        {
          name: "Roadmap & förankring",
          shortDescription: "Designa roadmap och förankra i organisation",
          objective: "Producera konkret, prioriterad roadmap och säkerställa organisatorisk förankring för genomförande",
          activities: [
            "Designworkshops för initiativportfölj",
            "Nyttovärdering och resursallokering",
            "Politisk och ledningsförankring",
          ],
          deliverables: [
            "Transformations-roadmap 2026–2029",
            "Nyttokalyl och business case",
            "Presentationsmaterial till nämnd",
          ],
          decisions: [
            "Styrgruppen beslutar om roadmap",
            "Politisk nämnd godkänner inriktning",
          ],
          duration: "16 v",
          period: "M5–M9",
          hoursEstimate: 140,
        },
        {
          name: "Avslut & överlämning",
          shortDescription: "Slutleverans och överlämning till förvaltning",
          objective: "Avsluta uppdraget med kvalitetsgranskad slutleverans och tydlig överlämning till intern förvaltning",
          activities: [
            "Slutrapport till styrgrupp",
            "Kunskapsöverlämning till projektledare",
            "Lessons-learned-workshop",
          ],
          deliverables: [
            "Slutrapport med rekommendationer",
            "Förvaltningsdokumentation",
            "Slutpresentation till styrgrupp",
          ],
          decisions: [
            "Styrgruppen godkänner slutleverans",
            "Förvaltningsöverlämning bekräftas",
            "Avslut av uppdrag",
          ],
          duration: "12 v",
          period: "M9–M12",
          hoursEstimate: 90,
        },
      ],
    },
  },

  // -------------------------------------------------------------------------
  // Slide 11: Kvalitetssäkring — quality-assurance
  // -------------------------------------------------------------------------
  {
    type: "ai",
    key: "quality-assurance",
    title: "Kvalitetssäkring",
    generatedAt: "2026-04-19",
    content: {
      format: "quality-assurance",
      // \n triggers hard line breaks (avoids PowerPoint wrap-duplication bug).
      // Lines per box must match template heights:
      //   Text 4/5/13/14: h=700980 EMU → max 2 lines at 18pt + 145% spacing
      //   Text 9 (Roll), Text 10 (Kontakt): h=369540 → 1 line each
      //   AP text 19/22/25/28: h=247650 → 1 line each
      qaProcess: [
        "Alla leveranser granskas av oberoende\nsenior inom Edgren Konsult AB.",
        "ISO 9001-certifierade processer med\nlessons-learned per fas.",
      ],
      qualityLead: {
        name: "Anna Svensson",
        roleAndMandate: "Uppdragsledare, kvalitetsansvarig.",
        contact: "anna.svensson@edgrenkonsult.se",
      },
      escalation: {
        process:
          "Avvikelser eskaleras till beställaren\noch dokumenteras i riskloggen.",
        reporting:
          "Månadsvis statusrapport,\nveckovis kortrapport.",
      },
      checkpoints: [
        "Fas 1 gate (v. 4)",
        "Fas 2 gate (v. 10)",
        "Fas 3 gate (v. 14)",
        "Avslut (v. 18)",
      ],
    },
  },

  // -------------------------------------------------------------------------
  // Slide 12: Team & prissättning — team-pricing
  // -------------------------------------------------------------------------
  {
    type: "data",
    key: "team-pricing",
    title: "Team och pris",
    generatedAt: "2026-04-19",
    content: {
      format: "team-pricing",
      members: [
        {
          name: "Anna Svensson",
          role: "Uppdragsledare",
          omfattningPct: 60,
          timpris: 2100,
          timmar: 280,
          total: 588000,
        },
        {
          name: "Erik Johansson",
          role: "Lösningsarkitekt",
          omfattningPct: 40,
          timpris: 1950,
          timmar: 190,
          total: 370500,
        },
        {
          name: "Maria Lindqvist",
          role: "Data & BI-specialist",
          omfattningPct: 30,
          timpris: 1750,
          timmar: 140,
          total: 245000,
        },
        {
          name: "Johan Persson",
          role: "Förändringsledare",
          omfattningPct: 50,
          timpris: 1850,
          timmar: 230,
          total: 425500,
        },
        {
          name: "Linnea Björk",
          role: "Junior analytiker",
          omfattningPct: 80,
          timpris: 1250,
          timmar: 370,
          total: 462500,
        },
      ],
      summary: {
        totalTimmar: 1210,
        totalPris: 2091500,
      },
    },
  },

  // -------------------------------------------------------------------------
  // Slide 13: Kravmatris — requirement-matrix-v2
  // -------------------------------------------------------------------------
  {
    type: "data",
    key: "requirement-matrix-v2",
    title: "Kravmatris",
    generatedAt: "2026-04-19",
    content: {
      format: "requirement-matrix-v2",
      rows: [
        {
          requirement: "Minst 5 års erfarenhet av strategisk rådgivning inom offentlig sektor",
          hurUppfylls: "Anna 12 år, Erik 9 år regionerfarenhet.",
          referens: "Bilaga 1, 2",
          coverage: [],
        },
        {
          requirement: "Leder komplexa intressentprocesser",
          hurUppfylls: "Johan: PROSCI-program Region Skåne.",
          referens: "Referens 1",
          coverage: [],
        },
        {
          requirement: "Erfarenhet av digitalisering inom hälso- och sjukvård",
          hurUppfylls: "Fyra sjukvårdsuppdrag inkl. TakeCare.",
          referens: "Referens 2, 3",
          coverage: [],
        },
        {
          requirement: "ISO 9001-certifierade processer för projektleverans",
          hurUppfylls: "ISO 9001:2015, giltig 03/2027.",
          referens: "Bilaga 7",
          coverage: [],
        },
        {
          requirement: "Kapacitet att starta inom 4 veckor från avtalssignering",
          hurUppfylls: "Bekräftad uppstart inom 5 dagar.",
          referens: "Bilaga 8",
          coverage: [],
        },
        {
          requirement: "Leverans av samtliga delrapporter på svenska",
          hurUppfylls:
            "Helsvenskt bolag — allt på svenska.",
          referens: "Bilaga 9",
          coverage: [],
        },
      ],
    },
  },

  // -------------------------------------------------------------------------
  // Slide 14: Referensuppdrag — reference-v2 (cloned per reference entry)
  // -------------------------------------------------------------------------
  {
    type: "ai",
    key: "reference-v2",
    title: "Referensuppdrag",
    generatedAt: "2026-04-19",
    content: {
      format: "reference-v2",
      references: [
        {
          clientName: "Region Skåne",
          contextLine: "Digital arbetsplats och samarbetsplattform för 15 000 medarbetare",
          organisation: "Region Skåne",
          startDate: "03/2023",
          endDate: "11/2024",
          scope:
            "Microsoft 365-införande med förändringsprogram, utbildningspaket och ny styrmodell för digital arbetsplats över samtliga förvaltningar.",
          contact: {
            name: "Maria Ekström",
            titlePhoneEmail: "Digitaliseringschef Region Skåne / 040-123 45 67 / maria.ekstrom@skane.se",
          },
          roleAndDelivery:
            "Anna uppdragsledare; Johan förändringsledare. Ansvar för roadmap, utbildning, styrmodell och kommunikationsstrategi gentemot verksamhet och fackliga parter.",
          result:
            "98 % av medarbetarna onboardade inom 6 mån. Ledtid för samverkan –35 %. Leverans på tid och inom budget.",
        },
        {
          clientName: "Region Uppsala",
          contextLine: "Beslutsstöd och BI-plattform för verksamhetsledning",
          organisation: "Region Uppsala",
          startDate: "01/2024",
          endDate: "08/2024",
          scope:
            "Power BI-beslutsstöd för ekonomi-, HR- och patientdata.",
          contact: {
            name: "Lars Bergström",
            titlePhoneEmail: "IT-direktör / 018-456 78 90 / lars.bergstrom@regionuppsala.se",
          },
          roleAndDelivery:
            "Maria ledde teknisk leverans. Erik ansvarade för arkitektur.",
          result:
            "15 dashboards i produktion. Rapporteringstid 3 dagar → 4 tim/mån. NPS 68.",
        },
        {
          clientName: "Värmlands Stadshus AB",
          contextLine: "Transformationsstrategi och organisationsdesign efter sammanslagning",
          organisation: "Värmlands Stadshus AB",
          startDate: "09/2022",
          endDate: "06/2023",
          scope:
            "Strategistöd och organisationsdesign efter sammanslagning.",
          contact: {
            name: "Eva Nilsson",
            titlePhoneEmail: "VD / 054-987 65 43 / eva.nilsson@varmlandsstadshus.se",
          },
          roleAndDelivery:
            "Anna ensam konsult med rapport till VD. Strategi, struktur, kommunikationsplan.",
          result:
            "Ny organisation på plats inom 4 mån. eNPS från 12 → 41 första året.",
        },
      ],
    },
  },

  // -------------------------------------------------------------------------
  // Slide 16: Sekretess — confidentiality
  // -------------------------------------------------------------------------
  {
    type: "data",
    key: "confidentiality",
    title: "Sekretess och konfidentialitet",
    generatedAt: "2026-04-19",
    content: {
      format: "confidentiality",
      oslReference: "19 kap. 3 § OSL",
      secrecyRows: [
        {
          reference: "Bilaga 2\nPrisbilaga",
          scope:
            "Samtliga timpriser, totalsumma och fördelning av resurser per fas angivna i prisbilagan.",
          justification:
            "Röjande av prisinformation kan skada Edgren Konsult ABs konkurrensposition vid framtida upphandlingar av liknande karaktär.",
        },
        {
          reference: "Bilaga 5\nMarginal",
          scope:
            "Intern kostnadsstruktur, omkostnadspålägg och beräknade marginaler per konsultroll.",
          justification:
            "Informationen utgör affärshemlighet vars röjande kan medföra påtaglig skada för bolaget i konkurrenshänseende.",
        },
        {
          reference: "Bilaga 9\nKunddata",
          scope:
            "Icke-publika projektresultat och intern statistik som delats av referenskunder under sekretessåtagande.",
          justification:
            "Edgren Konsult AB är avtalsrättsligt bunden att skydda informationen och referenskundernas förtroende förutsätter sekretess.",
        },
      ],
    },
  },

  // -------------------------------------------------------------------------
  // Slide 17: Certifieringar — certifications
  // -------------------------------------------------------------------------
  {
    type: "data",
    key: "certifications",
    title: "Certifieringar",
    generatedAt: "2026-04-19",
    content: {
      format: "certifications",
      certs: [
        {
          number: "SE-QMS-2021-00347",
          validUntil: "03/2027",
        },
        {
          number: "SE-ISMS-2022-00189",
          validUntil: "07/2027",
        },
        {
          number: "SE-EMS-2023-00512",
          validUntil: "11/2026",
        },
        {
          name: "PROSCI Change Management",
          description:
            "PROSCI ADKAR-metodik för förändringsledning.",
          number: "PROSCI-SE-4821",
          validUntil: "06/2028",
        },
      ],
    },
  },
];

// ---------------------------------------------------------------------------
// Main — render and write to disk
// ---------------------------------------------------------------------------

async function main() {
  const buffer = await renderTemplate("anbudsmall-v2", sections, masterCtx);
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
