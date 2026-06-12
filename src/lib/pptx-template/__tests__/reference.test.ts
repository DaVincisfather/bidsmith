// @vitest-environment node
/**
 * Task 10: Reference (clone) applicator
 *
 * Pattern: render full template, unzip, scan all slide XMLs.
 * Reference slides are identified by unique clientName fingerprints.
 * Tests assert: cloning produces N slides, per-clone isolation, tab-label update, footer.
 */
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { renderTemplate } from "../loader";
import { bundledTemplate } from "../registry";
import type { BidSection } from "../../types";
import type { MasterContext } from "../types";

const master: MasterContext = {
  companyName: "Testbolaget AB",
  clientName: "TestKund Kommun",
  diaryNumber: "TK-2026-999",
  bidName: "Digitalisering av ärendehantering",
  bidDate: "2026-04-19",
};

async function getAllSlideXml(zip: JSZip): Promise<string[]> {
  const entries = Object.keys(zip.files).filter((f) =>
    /^ppt\/slides\/slide\d+\.xml$/.test(f),
  );
  return Promise.all(entries.map((e) => zip.file(e)!.async("text")));
}

function makeReferenceSections(): BidSection[] {
  return [
    {
      type: "data",
      key: "cover",
      title: "Cover",
      generatedAt: "2026-04-19",
      content: {
        format: "cover",
        title: "Testanbud",
        client: "TestKund",
        date: "2026-04-19",
      },
    },
    {
      type: "data",
      key: "references",
      title: "Referensuppdrag",
      generatedAt: "2026-04-19",
      content: {
        format: "reference-v2",
        references: [
          {
            clientName: "REF1_CLIENT Storstads Kommun",
            contextLine: "REF1_CTX Digitalisering av ärendehantering",
            organisation: "REF1_ORG Förvaltningen för stadsbyggnad",
            startDate: "01/2023",
            endDate: "06/2024",
            scope: "REF1_SCOPE 2400 timmar, 3 konsulter, 3,2 MSEK",
            contact: {
              name: "REF1_CONTACT_NAME Lars Svensson",
              titlePhoneEmail: "REF1_CONTACT Projektledare · 070-111 2222 · lars@storstads.se",
            },
            roleAndDelivery: "REF1_ROLE Projektledning och kravanalys, levererade systemspecifikation",
            result: "REF1_RESULT 35% kortare handläggningstid, 0 kritiska fel vid lansering",
          },
          {
            clientName: "REF2_CLIENT Mellanstads Landsting",
            contextLine: "REF2_CTX Upphandling av vårdsystem",
            organisation: "REF2_ORG Regionhälsa AB",
            startDate: "03/2022",
            endDate: "11/2022",
            scope: "REF2_SCOPE 1800 timmar, 2 konsulter, 2,1 MSEK",
            contact: {
              name: "REF2_CONTACT_NAME Maria Johansson",
              titlePhoneEmail: "REF2_CONTACT IT-chef · 073-333 4444 · maria@regionhalsa.se",
            },
            roleAndDelivery: "REF2_ROLE Systemarkitektur och integration mot befintliga system",
            result: "REF2_RESULT 99,8% uptime från dag 1, levererat 2 veckor före plan",
          },
          {
            clientName: "REF3_CLIENT Norrstads Energi",
            contextLine: "REF3_CTX Smart mätarinfrastruktur",
            organisation: "REF3_ORG Energibolag Norrland AB",
            startDate: "09/2021",
            endDate: "04/2022",
            scope: "REF3_SCOPE 1200 timmar, 2 konsulter, 1,5 MSEK",
            contact: {
              name: "REF3_CONTACT_NAME Erik Nilsson",
              titlePhoneEmail: "REF3_CONTACT Driftchef · 076-555 6666 · erik@norrstads.se",
            },
            roleAndDelivery: "REF3_ROLE Teknisk implementation och driftsättning IoT-plattform",
            result: "REF3_RESULT 40% energibesparing, ROI uppnått inom 18 månader",
          },
        ],
      },
    },
  ];
}

async function renderRefs(): Promise<string[]> {
  const buf = await renderTemplate(bundledTemplate(), makeReferenceSections(), master);
  const zip = await JSZip.loadAsync(buf);
  return getAllSlideXml(zip);
}

// ---------------------------------------------------------------------------
// Test 1: Cloning produces 3 reference slides for 3 references
// ---------------------------------------------------------------------------

describe("reference applicator — cloning", () => {
  it("produces 3 distinct reference slides for 3 references", async () => {
    const allSlides = await renderRefs();

    const ref1Slides = allSlides.filter((s) => s.includes("REF1_CLIENT"));
    const ref2Slides = allSlides.filter((s) => s.includes("REF2_CLIENT"));
    const ref3Slides = allSlides.filter((s) => s.includes("REF3_CLIENT"));

    expect(ref1Slides.length).toBeGreaterThan(0);
    expect(ref2Slides.length).toBeGreaterThan(0);
    expect(ref3Slides.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Test 2: Reference 1 placeholders correct
// ---------------------------------------------------------------------------

describe("reference applicator — reference 1 placeholders", () => {
  it("ref 1 slide has correct data in all fields", async () => {
    const allSlides = await renderRefs();
    const slides = allSlides.filter((s) => s.includes("REF1_CLIENT"));
    expect(slides.length).toBeGreaterThan(0);
    const xml = slides[0];

    expect(xml).toContain("REF1_CLIENT Storstads Kommun");
    expect(xml).toContain("REF1_CTX Digitalisering av ärendehantering");
    expect(xml).toContain("REF1_ORG Förvaltningen för stadsbyggnad");
    expect(xml).toContain("01/2023");
    expect(xml).toContain("06/2024");
    expect(xml).toContain("REF1_SCOPE 2400 timmar, 3 konsulter, 3,2 MSEK");
    expect(xml).toContain("REF1_CONTACT_NAME Lars Svensson");
    expect(xml).toContain("REF1_CONTACT Projektledare");
    expect(xml).toContain("REF1_ROLE Projektledning och kravanalys");
    expect(xml).toContain("REF1_RESULT 35% kortare handläggningstid");

    // No unreplaced placeholders
    expect(xml).not.toContain("{Referens 1");
    expect(xml).not.toContain("{Kund \u2014 organisation}");
    expect(xml).not.toContain("{Start MM/\u00c5\u00c5\u00c5\u00c5}");
    expect(xml).not.toContain("{Slut MM/\u00c5\u00c5\u00c5\u00c5}");
    expect(xml).not.toContain("{Namn}");
  });
});

// ---------------------------------------------------------------------------
// Test 3: Reference 2 data isolated from reference 1
// ---------------------------------------------------------------------------

describe("reference applicator — reference 2 isolation", () => {
  it("ref 2 slide has ref 2 data, not ref 1 data", async () => {
    const allSlides = await renderRefs();
    const slides = allSlides.filter((s) => s.includes("REF2_CLIENT"));
    expect(slides.length).toBeGreaterThan(0);
    const xml = slides[0];

    expect(xml).toContain("REF2_CLIENT Mellanstads Landsting");
    expect(xml).toContain("REF2_CTX Upphandling av vårdsystem");
    expect(xml).toContain("REF2_ORG Regionhälsa AB");
    expect(xml).toContain("REF2_SCOPE 1800 timmar, 2 konsulter, 2,1 MSEK");
    expect(xml).toContain("REF2_CONTACT_NAME Maria Johansson");
    expect(xml).toContain("REF2_ROLE Systemarkitektur och integration");
    expect(xml).toContain("REF2_RESULT 99,8% uptime");

    // Isolation: ref1 data NOT present
    expect(xml).not.toContain("REF1_CLIENT");
    expect(xml).not.toContain("REF1_ROLE");
    expect(xml).not.toContain("REF1_RESULT");
  });
});

// ---------------------------------------------------------------------------
// Test 4: Tab label updated per clone — REFERENS NN
// ---------------------------------------------------------------------------

describe("reference applicator — tab label per clone", () => {
  it("ref 2 slide (clone 1) has REFERENS 02 in tab label area", async () => {
    const allSlides = await renderRefs();
    const slides = allSlides.filter((s) => s.includes("REF2_CLIENT"));
    expect(slides.length).toBeGreaterThan(0);
    const xml = slides[0];

    expect(xml).toContain("REFERENS 02");
    expect(xml).not.toContain("REFERENS 01");
  });

  it("ref 3 slide (clone 2) has REFERENS 03 in tab label area", async () => {
    const allSlides = await renderRefs();
    const slides = allSlides.filter((s) => s.includes("REF3_CLIENT"));
    expect(slides.length).toBeGreaterThan(0);
    const xml = slides[0];

    expect(xml).toContain("REFERENS 03");
    expect(xml).not.toContain("REFERENS 01");
    expect(xml).not.toContain("REFERENS 02");
  });

  it("ref 1 slide (clone 0) has REFERENS 01 in tab label area", async () => {
    const allSlides = await renderRefs();
    const slides = allSlides.filter((s) => s.includes("REF1_CLIENT"));
    expect(slides.length).toBeGreaterThan(0);
    const xml = slides[0];

    expect(xml).toContain("REFERENS 01");
  });
});

// ---------------------------------------------------------------------------
// Test 5: Footer applied per clone
// ---------------------------------------------------------------------------

describe("reference applicator — footer per clone", () => {
  it("each ref slide has footer placeholders replaced", async () => {
    const allSlides = await renderRefs();

    for (const fingerprint of ["REF1_CLIENT", "REF2_CLIENT", "REF3_CLIENT"]) {
      const slides = allSlides.filter((s) => s.includes(fingerprint));
      expect(slides.length).toBeGreaterThan(0);
      const xml = slides[0];

      expect(xml).toContain("Testbolaget AB");
      expect(xml).toContain("TK-2026-999");
      expect(xml).not.toContain("{Bolagsnamn}");
      expect(xml).not.toContain("{Diarienummer}");
    }
  });
});
