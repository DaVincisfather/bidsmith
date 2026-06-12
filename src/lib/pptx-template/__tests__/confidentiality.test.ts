// @vitest-environment node
/**
 * Task 10: Confidentiality applicator
 *
 * Critical: secrecy rows 2-4 have IDENTICAL placeholder text ({Uppgift som
 * omfattas}, {Motivering}). Naïve global replace would set all three to row 1's
 * values. Tests explicitly assert each row has DIFFERENT values from data.
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

function makeConfidentialitySections(): BidSection[] {
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
      key: "confidentiality",
      title: "Anbudssekretess",
      generatedAt: "2026-04-19",
      content: {
        format: "confidentiality",
        oslReference: "19 kap 3 §",
        secrecyRows: [
          {
            reference: "SECREF1 Bilaga 2 — Prislista",
            scope: "SECSCOPE1 Enhetspriser och timpriser för samtliga konsulter",
            justification: "SECJUST1 Röjer kommersiellt känslig prisinformation till konkurrenter",
          },
          {
            reference: "SECREF2 Bilaga 4 — CV:n",
            scope: "SECSCOPE2 Personuppgifter och anställningsvillkor",
            justification: "SECJUST2 Personuppgifter skyddas av GDPR och kan skada individer",
          },
          {
            reference: "SECREF3 Slide 12 — Teamprissättning",
            scope: "SECSCOPE3 Individuella timpriser per konsult",
            justification: "SECJUST3 Konkurrenskänslig lönesättning och marginalstruktur",
          },
          {
            reference: "SECREF4 Bilaga 1 — Metodbeskrivning",
            scope: "SECSCOPE4 Proprietär metodik och verktygsstack",
            justification: "SECJUST4 Röjer affärshemligheter och branschspecifik IP",
          },
        ],
      },
    },
  ];
}

async function renderConfidentiality(): Promise<string[]> {
  const buf = await renderTemplate(
    bundledTemplate(),
    makeConfidentialitySections(),
    master,
  );
  const zip = await JSZip.loadAsync(buf);
  return getAllSlideXml(zip);
}

// ---------------------------------------------------------------------------
// Helper: find the confidentiality slide by static text fingerprint
// ---------------------------------------------------------------------------

function findConfidentialitySlide(allSlides: string[]): string | undefined {
  // Slide 16 contains the static text "sekretess" (Swedish for secrecy)
  return allSlides.find((s) => s.includes("sekretess") && s.includes("SECREF1"));
}

// ---------------------------------------------------------------------------
// Test 1: OSL reference and body Bolagsnamn replaced
// ---------------------------------------------------------------------------

describe("confidentiality applicator — prose replacements", () => {
  it("replaces {OSL kap X §Y} and body {Bolagsnamn}", async () => {
    const allSlides = await renderConfidentiality();
    const xml = findConfidentialitySlide(allSlides);
    expect(xml).toBeDefined();

    expect(xml).toContain("19 kap 3 §");
    expect(xml).not.toContain("{OSL kap X §Y}");

    // Body Bolagsnamn (not footer — both should be replaced, neither raw)
    expect(xml).toContain("Testbolaget AB");
    expect(xml).not.toContain("{Bolagsnamn}");
  });
});

// ---------------------------------------------------------------------------
// Test 2: Row 1 unique placeholders replaced
// ---------------------------------------------------------------------------

describe("confidentiality applicator — secrecy row 1", () => {
  it("replaces {Slide/Bilaga 1}, {Uppgift som omfattas av sekretess}, {Varför...}", async () => {
    const allSlides = await renderConfidentiality();
    const xml = findConfidentialitySlide(allSlides);
    expect(xml).toBeDefined();

    expect(xml).toContain("SECREF1 Bilaga 2 — Prislista");
    expect(xml).toContain("SECSCOPE1 Enhetspriser och timpriser för samtliga konsulter");
    expect(xml).toContain("SECJUST1 Röjer kommersiellt känslig prisinformation till konkurrenter");

    expect(xml).not.toContain("{Slide/Bilaga 1}");
    expect(xml).not.toContain("{Uppgift som omfattas av sekretess}");
    expect(xml).not.toContain("{Varför \u2014 skadan som uppst\u00e5r vid utl\u00e4mnande}");
  });
});

// ---------------------------------------------------------------------------
// Test 3: Rows 2-4 have DIFFERENT values (collision-resistance critical test)
// ---------------------------------------------------------------------------

describe("confidentiality applicator — secrecy rows 2-4 isolation (collision test)", () => {
  it("row 2 has its own scope and justification, not row 1 values", async () => {
    const allSlides = await renderConfidentiality();
    const xml = findConfidentialitySlide(allSlides);
    expect(xml).toBeDefined();

    // Row 2 data must be present
    expect(xml).toContain("SECREF2 Bilaga 4 — CV:n");
    expect(xml).toContain("SECSCOPE2 Personuppgifter och anställningsvillkor");
    expect(xml).toContain("SECJUST2 Personuppgifter skyddas av GDPR");
  });

  it("row 3 has its own scope and justification, not row 1 or row 2 values", async () => {
    const allSlides = await renderConfidentiality();
    const xml = findConfidentialitySlide(allSlides);
    expect(xml).toBeDefined();

    expect(xml).toContain("SECREF3 Slide 12 — Teamprissättning");
    expect(xml).toContain("SECSCOPE3 Individuella timpriser per konsult");
    expect(xml).toContain("SECJUST3 Konkurrenskänslig lönesättning");
  });

  it("row 4 has its own scope and justification", async () => {
    const allSlides = await renderConfidentiality();
    const xml = findConfidentialitySlide(allSlides);
    expect(xml).toBeDefined();

    expect(xml).toContain("SECREF4 Bilaga 1 — Metodbeskrivning");
    expect(xml).toContain("SECSCOPE4 Proprietär metodik och verktygsstack");
    expect(xml).toContain("SECJUST4 Röjer affärshemligheter och branschspecifik IP");
  });

  it("all 4 different scope values present (proves per-ordinal not global)", async () => {
    const allSlides = await renderConfidentiality();
    const xml = findConfidentialitySlide(allSlides);
    expect(xml).toBeDefined();

    // If collision happened, some of these would be duplicated/missing
    expect(xml).toContain("SECSCOPE1");
    expect(xml).toContain("SECSCOPE2");
    expect(xml).toContain("SECSCOPE3");
    expect(xml).toContain("SECSCOPE4");

    expect(xml).toContain("SECJUST1");
    expect(xml).toContain("SECJUST2");
    expect(xml).toContain("SECJUST3");
    expect(xml).toContain("SECJUST4");
  });
});

// ---------------------------------------------------------------------------
// Test 4: No raw placeholders remaining
// ---------------------------------------------------------------------------

describe("confidentiality applicator — no raw placeholders", () => {
  it("no {Slide/Bilaga N} or {Uppgift} or {Motivering} left unreplaced", async () => {
    const allSlides = await renderConfidentiality();
    const xml = findConfidentialitySlide(allSlides);
    expect(xml).toBeDefined();

    expect(xml).not.toContain("{Slide/Bilaga");
    expect(xml).not.toContain("{Uppgift som omf");
    expect(xml).not.toContain("{Motivering}");
    expect(xml).not.toContain("{Varför");
  });
});

// ---------------------------------------------------------------------------
// Test 5: Footer applied
// ---------------------------------------------------------------------------

describe("confidentiality applicator — footer", () => {
  it("has footer with companyName and diaryNumber replaced", async () => {
    const allSlides = await renderConfidentiality();
    const xml = findConfidentialitySlide(allSlides);
    expect(xml).toBeDefined();

    expect(xml).toContain("Testbolaget AB");
    expect(xml).toContain("TK-2026-999");
    expect(xml).not.toContain("{Diarienummer}");
  });
});
