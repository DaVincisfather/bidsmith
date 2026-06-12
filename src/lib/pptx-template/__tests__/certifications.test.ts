// @vitest-environment node
/**
 * Task 10: Certifications applicator
 *
 * Critical: {Certifikatnummer} and {Giltighetstid} appear 4 times each.
 * Naïve global replace would make all 4 cards identical (collision).
 * Tests explicitly assert each card has a DIFFERENT cert number.
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

function makeCertificationsSections(): BidSection[] {
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
      key: "certifications",
      title: "Certifieringar",
      generatedAt: "2026-04-19",
      content: {
        format: "certifications",
        certs: [
          {
            // Card 1: ISO 9001
            number: "CERTNUM1 SE12345-QMS",
            validUntil: "CERTVAL1 03/2027",
          },
          {
            // Card 2: ISO 27001
            number: "CERTNUM2 SE67890-ISMS",
            validUntil: "CERTVAL2 07/2026",
          },
          {
            // Card 3: ISO 14001
            number: "CERTNUM3 SE11111-EMS",
            validUntil: "CERTVAL3 12/2026",
          },
          {
            // Card 4: Övrig
            name: "CERTNAME4 ITIL Foundation",
            description: "CERTDESC4 IT Service Management best practices",
            number: "CERTNUM4 ITIL-2023-0042",
            validUntil: "CERTVAL4 01/2028",
          },
        ],
      },
    },
  ];
}

async function renderCertifications(): Promise<string[]> {
  const buf = await renderTemplate(
    bundledTemplate(),
    makeCertificationsSections(),
    master,
  );
  const zip = await JSZip.loadAsync(buf);
  return getAllSlideXml(zip);
}

// ---------------------------------------------------------------------------
// Helper: find certifications slide by static text fingerprint
// ---------------------------------------------------------------------------

function findCertificationsSlide(allSlides: string[]): string | undefined {
  // Slide 17 contains "ISO 9001" and "Certifieringar" static text
  return allSlides.find(
    (s) => s.includes("ISO 9001") && s.includes("CERTNUM1"),
  );
}

// ---------------------------------------------------------------------------
// Test 1: All 4 cert numbers present and DIFFERENT (collision-resistance)
// ---------------------------------------------------------------------------

describe("certifications applicator — per-card isolation (collision test)", () => {
  it("all 4 different cert numbers present — proves per-ordinal not global replace", async () => {
    const allSlides = await renderCertifications();
    const xml = findCertificationsSlide(allSlides);
    expect(xml).toBeDefined();

    // If collision happened, all 4 would equal CERTNUM1 (first occurrence)
    expect(xml).toContain("CERTNUM1 SE12345-QMS");
    expect(xml).toContain("CERTNUM2 SE67890-ISMS");
    expect(xml).toContain("CERTNUM3 SE11111-EMS");
    expect(xml).toContain("CERTNUM4 ITIL-2023-0042");
  });

  it("all 4 different validUntil values present — proves per-ordinal not global replace", async () => {
    const allSlides = await renderCertifications();
    const xml = findCertificationsSlide(allSlides);
    expect(xml).toBeDefined();

    expect(xml).toContain("CERTVAL1 03/2027");
    expect(xml).toContain("CERTVAL2 07/2026");
    expect(xml).toContain("CERTVAL3 12/2026");
    expect(xml).toContain("CERTVAL4 01/2028");
  });
});

// ---------------------------------------------------------------------------
// Test 2: Card 4 (Övrig) specific fields replaced
// ---------------------------------------------------------------------------

describe("certifications applicator — card 4 Övrig fields", () => {
  it("replaces {Övrig relevant certifiering} and {Beskrivning} for card 4", async () => {
    const allSlides = await renderCertifications();
    const xml = findCertificationsSlide(allSlides);
    expect(xml).toBeDefined();

    expect(xml).toContain("CERTNAME4 ITIL Foundation");
    expect(xml).toContain("CERTDESC4 IT Service Management best practices");

    expect(xml).not.toContain("{Övrig relevant certifiering}");
    expect(xml).not.toContain("{Beskrivning}");
  });
});

// ---------------------------------------------------------------------------
// Test 3: No raw placeholders remaining
// ---------------------------------------------------------------------------

describe("certifications applicator — no raw placeholders", () => {
  it("no {Certifikatnummer} or {Giltighetstid} left unreplaced", async () => {
    const allSlides = await renderCertifications();
    const xml = findCertificationsSlide(allSlides);
    expect(xml).toBeDefined();

    expect(xml).not.toContain("{Certifikatnummer}");
    expect(xml).not.toContain("{Giltighetstid}");
    expect(xml).not.toContain("{Övrig relevant certifiering}");
    expect(xml).not.toContain("{Beskrivning}");
  });
});

// ---------------------------------------------------------------------------
// Test 4: Footer applied
// ---------------------------------------------------------------------------

describe("certifications applicator — footer", () => {
  it("has footer with companyName and diaryNumber replaced", async () => {
    const allSlides = await renderCertifications();
    const xml = findCertificationsSlide(allSlides);
    expect(xml).toBeDefined();

    expect(xml).toContain("Testbolaget AB");
    expect(xml).toContain("TK-2026-999");
    expect(xml).not.toContain("{Bolagsnamn}");
    expect(xml).not.toContain("{Diarienummer}");
  });
});
