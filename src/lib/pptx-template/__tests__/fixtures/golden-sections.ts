import type { BidSection } from "@/lib/types";
import type { MasterContext } from "../../types";

// Deterministic BidSection set used by both bid-export-e2e.test.ts and the
// golden-render bitparity test. Captured verbatim from generateAllSections() run
// with the e2e mock (see git history of bid-export-e2e.test.ts).
//
// Two fields are FROZEN here that the production generators derive from the wall
// clock — they are pinned in the fixture (never in production code) so the golden
// snapshot is stable across runs and days:
//   - generatedAt: every section uses GENERATED_AT instead of new Date()
//   - cover.content.date: pinned to FROZEN_COVER_DATE instead of today's date
const GENERATED_AT = "2026-06-12T00:00:00.000Z";
const FROZEN_COVER_DATE = "2026-06-12";

export const GOLDEN_SECTIONS: BidSection[] = [
  {
    type: "data",
    key: "cover",
    title: "Framsida",
    content: {
      format: "cover",
      title: "E2E-anbud",
      client: "E2E-Kund",
      date: FROZEN_COVER_DATE,
    },
    generatedAt: GENERATED_AT,
  },
  {
    type: "ai",
    key: "understanding-current",
    title: "Kunden idag",
    content: {
      format: "understanding-current",
      organisation: "Org",
      system: "Sys",
      processer: "Proc",
      smärtpunkter: ["Sp"],
    },
    generatedAt: GENERATED_AT,
  },
  {
    type: "ai",
    key: "understanding-assignment",
    title: "Uppdragsbeskrivning",
    content: {
      format: "understanding-assignment",
      stycken: ["A1", "A2", "A3"],
    },
    generatedAt: GENERATED_AT,
  },
  {
    type: "ai",
    key: "understanding-vision",
    title: "Vad vi ser",
    content: {
      format: "understanding-vision",
      utmaningar: ["U1"],
      värden: ["V1"],
    },
    generatedAt: GENERATED_AT,
  },
  {
    type: "ai",
    key: "phases",
    title: "Genomförande",
    content: {
      format: "phases",
      phases: [
        {
          name: "Fas 1: X",
          objective: "o",
          activities: ["a"],
          deliverables: ["d"],
          duration: "4 v",
          period: "M1-M2",
          decisions: ["Beslut"],
          shortDescription: "Fas 1",
        },
      ],
    },
    generatedAt: GENERATED_AT,
  },
  {
    type: "ai",
    key: "quality-assurance",
    title: "Kvalitetssäkring",
    content: {
      format: "quality-assurance",
      qaProcess: ["QA-P"],
      qualityLead: { name: "Anna", roleAndMandate: "QL", contact: "a@x.se" },
      escalation: { process: "E", reporting: "R" },
      checkpoints: ["CP"],
    },
    generatedAt: GENERATED_AT,
  },
  {
    type: "ai",
    key: "requirement-matrix-v2",
    title: "Kravmatris",
    content: {
      format: "requirement-matrix-v2",
      rows: [
        {
          requirement: "R1",
          hurUppfylls: "H",
          referens: "CV Anna",
          coverage: [{ consultantName: "Anna", status: "JA", evidence: "E" }],
        },
      ],
    },
    generatedAt: GENERATED_AT,
  },
  {
    type: "ai",
    key: "team-pricing",
    title: "Team och pris",
    content: {
      format: "team-pricing",
      members: [
        {
          name: "Anna",
          role: "PL",
          omfattningPct: 50,
          timpris: null,
          timmar: 240,
          total: null,
        },
      ],
      summary: { totalTimmar: 240, totalPris: null },
    },
    generatedAt: GENERATED_AT,
  },
  {
    type: "data",
    key: "reference-v2",
    title: "Referensuppdrag",
    content: {
      format: "reference-v2",
      references: [
        {
          clientName: "Fyll i kundnamn",
          contextLine: "Fyll i kort kontextrad",
          organisation: "Fyll i organisation",
          startDate: "MM/ÅÅÅÅ",
          endDate: "MM/ÅÅÅÅ",
          scope: "Fyll i uppdragets omfattning",
          contact: {
            name: "Fyll i referensperson",
            titlePhoneEmail: "Titel · telefon · e-post",
          },
          roleAndDelivery: "Fyll i roll och leverans",
          result: "Fyll i resultat",
        },
        {
          clientName: "Fyll i kundnamn",
          contextLine: "Fyll i kort kontextrad",
          organisation: "Fyll i organisation",
          startDate: "MM/ÅÅÅÅ",
          endDate: "MM/ÅÅÅÅ",
          scope: "Fyll i uppdragets omfattning",
          contact: {
            name: "Fyll i referensperson",
            titlePhoneEmail: "Titel · telefon · e-post",
          },
          roleAndDelivery: "Fyll i roll och leverans",
          result: "Fyll i resultat",
        },
      ],
    },
    generatedAt: GENERATED_AT,
  },
  {
    type: "data",
    key: "confidentiality",
    title: "Sekretess",
    content: {
      format: "confidentiality",
      oslReference: "19 kap 3 §",
      secrecyRows: [
        { reference: "Bilaga 2", scope: "Personuppgifter", justification: "GDPR" },
      ],
    },
    generatedAt: GENERATED_AT,
  },
  {
    type: "data",
    key: "certifications",
    title: "Certifieringar",
    content: {
      format: "certifications",
      certs: [
        { number: "Fyll i certifikatnummer", validUntil: "—" },
        { number: "Fyll i certifikatnummer", validUntil: "—" },
        { number: "Fyll i certifikatnummer", validUntil: "—" },
      ],
    },
    generatedAt: GENERATED_AT,
  },
];

export const GOLDEN_MASTER: MasterContext = {
  companyName: "TestCo",
  clientName: "E2E-Kund",
  diaryNumber: "D-001",
  bidName: "E2E-anbud",
  bidDate: "2026-04-20",
};
