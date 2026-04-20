// @vitest-environment node
/**
 * Task 9: Requirement-matrix applicator (slide 13).
 *
 * Pattern: render the full template, unzip output, find the slide by a
 * unique content fingerprint, then assert placeholder replacements.
 *
 * Slide 13 has 6 fixed requirement row slots. Row numbers (01-06) and JA are
 * static in the template. Slot cap: 6. >6 rows: warn + truncate.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import JSZip from "jszip";
import { renderTemplate } from "../loader";
import type { BidSection } from "../../types";
import type { MasterContext } from "../types";

const master: MasterContext = {
  companyName: "ReqMatrixTestAB",
  clientName: "TestKund Myndighet",
  diaryNumber: "RM-2026-013",
  bidName: "Kravuppfyllelse test",
  bidDate: "2026-04-19",
};

async function getAllSlideXml(zip: JSZip): Promise<string[]> {
  const entries = Object.keys(zip.files).filter((f) =>
    /^ppt\/slides\/slide\d+\.xml$/.test(f),
  );
  return Promise.all(entries.map((e) => zip.file(e)!.async("text")));
}

/**
 * Find the requirement-matrix slide.
 * Unique tab label: "13 · UPPFYLLELSE" (middle dot U+00B7) — unique to slide 13.
 * Exclude template original by requiring absence of "{Ska-krav 1".
 */
async function getRequirementMatrixXml(sections: BidSection[]): Promise<string> {
  const buf = await renderTemplate("anbudsmall-v2", sections, master);
  const zip = await JSZip.loadAsync(buf);
  const allXmls = await getAllSlideXml(zip);

  // Tab label unique to slide 13 in the template (middle dot U+00B7)
  const TAB_LABEL = "13 \u00b7 UPPFYLLELSE";
  // The unfilled placeholder — ABSENT on the applicator-processed copy
  const UNFILLED_ACTUAL = "{Ska-krav 1";

  const candidates = allXmls.filter(
    (xml) => xml.includes(TAB_LABEL) && !xml.includes(UNFILLED_ACTUAL),
  );

  expect(candidates.length).toBeGreaterThan(0);
  return candidates[0];
}

function makeMinimalSections(extraSections: BidSection[] = []): BidSection[] {
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
    ...extraSections,
  ];
}

function make6RowSection(): BidSection {
  return {
    type: "data",
    key: "requirement-matrix-v2",
    title: "Kravuppfyllelse",
    generatedAt: "2026-04-19",
    content: {
      format: "requirement-matrix-v2",
      rows: [
        {
          requirement: "REQ1_TEXT Leverantören ska ha minst 5 års erfarenhet",
          hurUppfylls: "REQ1_HUR Vi har 12 års dokumenterad erfarenhet",
          coverage: [],
          referens: "REQ1_CV CV Anna, CV Bo",
        },
        {
          requirement: "REQ2_TEXT ISO-certifiering krävs",
          hurUppfylls: "REQ2_HUR ISO 9001 sedan 2018",
          coverage: [],
          referens: "REQ2_CV Certifikat bilaga",
        },
        {
          requirement: "REQ3_TEXT Kapacitet offentlig sektor",
          hurUppfylls: "REQ3_HUR 70% uppdrag inom offentlig sektor",
          coverage: [],
          referens: "REQ3_CV Ref Göteborg Stad",
        },
        {
          requirement: "REQ4_TEXT Metodkompetens agil",
          hurUppfylls: "REQ4_HUR Scrum master certifierade konsulter",
          coverage: [],
          referens: "REQ4_CV CV Cecilia",
        },
        {
          requirement: "REQ5_TEXT Tillgänglighet inom 4 veckor",
          hurUppfylls: "REQ5_HUR Team tillgängligt från 2026-06-01",
          coverage: [],
          referens: "REQ5_CV Resursplan",
        },
        {
          requirement: "REQ6_TEXT Referensuppdrag liknande storlek",
          hurUppfylls: "REQ6_HUR Tre jämförbara uppdrag bifogas",
          coverage: [],
          referens: "REQ6_CV Ref Region Västra",
        },
      ],
    },
  };
}

function make3RowSection(): BidSection {
  return {
    type: "data",
    key: "requirement-matrix-v2",
    title: "Kravuppfyllelse",
    generatedAt: "2026-04-19",
    content: {
      format: "requirement-matrix-v2",
      rows: [
        {
          requirement: "REQ1_TEXT Leverantören ska ha minst 5 års erfarenhet",
          hurUppfylls: "REQ1_HUR Vi har 12 års dokumenterad erfarenhet",
          coverage: [],
          referens: "REQ1_CV CV Anna, CV Bo",
        },
        {
          requirement: "REQ2_TEXT ISO-certifiering krävs",
          hurUppfylls: "REQ2_HUR ISO 9001 sedan 2018",
          coverage: [],
          referens: "REQ2_CV Certifikat bilaga",
        },
        {
          requirement: "REQ3_TEXT Kapacitet offentlig sektor",
          hurUppfylls: "REQ3_HUR 70% uppdrag inom offentlig sektor",
          coverage: [],
          referens: "REQ3_CV Ref Göteborg Stad",
        },
      ],
    },
  };
}

function makeMoreThan6RowSection(): BidSection {
  return {
    type: "data",
    key: "requirement-matrix-v2",
    title: "Kravuppfyllelse",
    generatedAt: "2026-04-19",
    content: {
      format: "requirement-matrix-v2",
      rows: [
        {
          requirement: "REQ1_TEXT krav ett",
          hurUppfylls: "REQ1_HUR uppfylls ett",
          coverage: [],
          referens: "REQ1_CV",
        },
        {
          requirement: "REQ2_TEXT krav två",
          hurUppfylls: "REQ2_HUR uppfylls två",
          coverage: [],
          referens: "REQ2_CV",
        },
        {
          requirement: "REQ3_TEXT krav tre",
          hurUppfylls: "REQ3_HUR uppfylls tre",
          coverage: [],
          referens: "REQ3_CV",
        },
        {
          requirement: "REQ4_TEXT krav fyra",
          hurUppfylls: "REQ4_HUR uppfylls fyra",
          coverage: [],
          referens: "REQ4_CV",
        },
        {
          requirement: "REQ5_TEXT krav fem",
          hurUppfylls: "REQ5_HUR uppfylls fem",
          coverage: [],
          referens: "REQ5_CV",
        },
        {
          requirement: "REQ6_TEXT krav sex",
          hurUppfylls: "REQ6_HUR uppfylls sex",
          coverage: [],
          referens: "REQ6_CV",
        },
        {
          requirement: "REQ7_TEXT krav sju — SHOULD_BE_TRUNCATED",
          hurUppfylls: "REQ7_HUR uppfylls sju",
          coverage: [],
          referens: "REQ7_CV",
        },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Test 1: 6 rows — all placeholders replaced
// ---------------------------------------------------------------------------

describe("requirement-matrix applicator — 6 rows", () => {
  it("replaces all Ska-krav, Hur krav uppfylls, and CV/ref placeholders", async () => {
    const sections = makeMinimalSections([make6RowSection()]);
    const xml = await getRequirementMatrixXml(sections);

    // Requirements
    expect(xml).toContain("REQ1_TEXT Leverantören ska ha minst 5 års erfarenhet");
    expect(xml).toContain("REQ2_TEXT ISO-certifiering krävs");
    expect(xml).toContain("REQ3_TEXT Kapacitet offentlig sektor");
    expect(xml).toContain("REQ4_TEXT Metodkompetens agil");
    expect(xml).toContain("REQ5_TEXT Tillgänglighet inom 4 veckor");
    expect(xml).toContain("REQ6_TEXT Referensuppdrag liknande storlek");

    // How fulfilled
    expect(xml).toContain("REQ1_HUR Vi har 12 års dokumenterad erfarenhet");
    expect(xml).toContain("REQ2_HUR ISO 9001 sedan 2018");
    expect(xml).toContain("REQ3_HUR 70% uppdrag inom offentlig sektor");
    expect(xml).toContain("REQ4_HUR Scrum master certifierade konsulter");
    expect(xml).toContain("REQ5_HUR Team tillgängligt från 2026-06-01");
    expect(xml).toContain("REQ6_HUR Tre jämförbara uppdrag bifogas");

    // References
    expect(xml).toContain("REQ1_CV CV Anna, CV Bo");
    expect(xml).toContain("REQ2_CV Certifikat bilaga");
    expect(xml).toContain("REQ3_CV Ref Göteborg Stad");
    expect(xml).toContain("REQ4_CV CV Cecilia");
    expect(xml).toContain("REQ5_CV Resursplan");
    expect(xml).toContain("REQ6_CV Ref Region Västra");

    // No leftover placeholders
    expect(xml).not.toContain("{Ska-krav 1");
    expect(xml).not.toContain("{Ska-krav 2}");
    expect(xml).not.toContain("{Ska-krav 3}");
    expect(xml).not.toContain("{Ska-krav 4}");
    expect(xml).not.toContain("{Ska-krav 5}");
    expect(xml).not.toContain("{Ska-krav 6}");
    expect(xml).not.toContain("{Hur krav 1");
    expect(xml).not.toContain("{Hur krav 2}");
    expect(xml).not.toContain("{Hur krav 3}");
    expect(xml).not.toContain("{Hur krav 4}");
    expect(xml).not.toContain("{Hur krav 5}");
    expect(xml).not.toContain("{Hur krav 6}");
    expect(xml).not.toContain("{CV/ref 1}");
    expect(xml).not.toContain("{CV/ref 2}");
    expect(xml).not.toContain("{CV/ref 3}");
    expect(xml).not.toContain("{CV/ref 4}");
    expect(xml).not.toContain("{CV/ref 5}");
    expect(xml).not.toContain("{CV/ref 6}");
  });
});

// ---------------------------------------------------------------------------
// Test 2: 3 rows — slots 4–6 replaced with empty string
// ---------------------------------------------------------------------------

describe("requirement-matrix applicator — 3 rows", () => {
  it("fills rows 1–3 and replaces rows 4–6 placeholders with empty string", async () => {
    const sections = makeMinimalSections([make3RowSection()]);
    const xml = await getRequirementMatrixXml(sections);

    // Rows 1–3 filled
    expect(xml).toContain("REQ1_TEXT Leverantören ska ha minst 5 års erfarenhet");
    expect(xml).toContain("REQ2_TEXT ISO-certifiering krävs");
    expect(xml).toContain("REQ3_TEXT Kapacitet offentlig sektor");

    // Rows 4–6: no leftover placeholders
    expect(xml).not.toContain("{Ska-krav 4}");
    expect(xml).not.toContain("{Ska-krav 5}");
    expect(xml).not.toContain("{Ska-krav 6}");
    expect(xml).not.toContain("{Hur krav 4}");
    expect(xml).not.toContain("{Hur krav 5}");
    expect(xml).not.toContain("{Hur krav 6}");
    expect(xml).not.toContain("{CV/ref 4}");
    expect(xml).not.toContain("{CV/ref 5}");
    expect(xml).not.toContain("{CV/ref 6}");
  });
});

// ---------------------------------------------------------------------------
// Test 3: >6 rows — console.warn called, only first 6 rendered
// ---------------------------------------------------------------------------

describe("requirement-matrix applicator — more than 6 rows", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("calls console.warn and truncates to first 6 rows", async () => {
    const sections = makeMinimalSections([makeMoreThan6RowSection()]);
    const xml = await getRequirementMatrixXml(sections);

    // Row 7 data must NOT appear
    expect(xml).not.toContain("REQ7_TEXT krav sju");
    expect(xml).not.toContain("SHOULD_BE_TRUNCATED");

    // Rows 1–6 still rendered
    expect(xml).toContain("REQ1_TEXT krav ett");
    expect(xml).toContain("REQ6_TEXT krav sex");

    // console.warn was called with a message about truncation
    expect(console.warn).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test 4: Footer applied with correct counter
// ---------------------------------------------------------------------------

describe("requirement-matrix applicator — footer", () => {
  it("replaces {Bolagsnamn}, {Diarienummer} and slide counter", async () => {
    const sections = makeMinimalSections([make6RowSection()]);
    const xml = await getRequirementMatrixXml(sections);

    expect(xml).toContain("ReqMatrixTestAB");
    expect(xml).toContain("RM-2026-013");
    expect(xml).not.toContain("{Bolagsnamn}");
    expect(xml).not.toContain("{Diarienummer}");
    // Slide counter pattern gone (template has "13 / 17")
    expect(xml).not.toContain("13 / 17");
  });
});
