// @vitest-environment node
/**
 * Requirement-matrix applicator (slide 13).
 *
 * Slide 13 is a cloneFrom: "requirement-matrix" slide: the loader clones it once
 * per page of 6 rows, so N requirements paginate across ceil(N/6) slides instead
 * of dropping rows 7+. Each clone renders its 6-row window (cloneIndex) with a
 * CONTINUOUS row number (page 2 → 07–12) and blanks unused slots.
 *
 * Pattern: render the full template, unzip output, find the matrix slides by a
 * unique content fingerprint, then assert placeholder + number replacements.
 */
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { renderTemplate } from "../loader";
import { bundledTemplate } from "../registry";
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

/** All requirement-matrix slides (one per page), in deck order. */
async function getMatrixPages(sections: BidSection[]): Promise<string[]> {
  const buf = await renderTemplate(bundledTemplate(), sections, master);
  const zip = await JSZip.loadAsync(buf);
  const allXmls = await getAllSlideXml(zip);

  // Tab label unique to slide 13 in the template (middle dot U+00B7). Exclude
  // the unfilled template original (still carries "{Ska-krav 1") — the output
  // retains the root template's slides alongside the rendered clones.
  const TAB_LABEL = "13 · UPPFYLLELSE";
  return allXmls.filter(
    (xml) => xml.includes(TAB_LABEL) && !xml.includes("{Ska-krav 1"),
  );
}

/** Asserts a single page and returns its XML. */
async function getSingleMatrixPage(sections: BidSection[]): Promise<string> {
  const pages = await getMatrixPages(sections);
  expect(pages.length).toBe(1);
  return pages[0];
}

/** True if the slide has an exact row-number cell <a:t>NN</a:t>. */
function hasRowNumber(xml: string, nn: string): boolean {
  return new RegExp(`<a:t[^>]*>${nn}</a:t>`).test(xml);
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

/** Generates a matrix section with n rows, content tagged REQ<i>_*. */
function makeRowSection(n: number): BidSection {
  return {
    type: "data",
    key: "requirement-matrix-v2",
    title: "Kravuppfyllelse",
    generatedAt: "2026-04-19",
    content: {
      format: "requirement-matrix-v2",
      rows: Array.from({ length: n }, (_, i) => ({
        requirement: `REQ${i + 1}_TEXT krav nummer ${i + 1}`,
        hurUppfylls: `REQ${i + 1}_HUR uppfylls ${i + 1}`,
        coverage: [{ consultantName: "Anna", status: "JA" as const, evidence: "E" }],
        referens: `REQ${i + 1}_CV ref ${i + 1}`,
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// One full page (6 rows)
// ---------------------------------------------------------------------------

describe("requirement-matrix applicator — one full page", () => {
  it("replaces all 6 rows' placeholders on a single slide with numbers 01–06", async () => {
    const xml = await getSingleMatrixPage(makeMinimalSections([makeRowSection(6)]));

    for (let i = 1; i <= 6; i++) {
      expect(xml).toContain(`REQ${i}_TEXT krav nummer ${i}`);
      expect(xml).toContain(`REQ${i}_HUR uppfylls ${i}`);
      expect(xml).toContain(`REQ${i}_CV ref ${i}`);
      expect(hasRowNumber(xml, String(i).padStart(2, "0"))).toBe(true);
    }

    // No leftover placeholders
    expect(xml).not.toContain("{Ska-krav");
    expect(xml).not.toContain("{Hur krav");
    expect(xml).not.toContain("{CV/ref");
  });
});

// ---------------------------------------------------------------------------
// Partial last page (3 rows) — unused slots blanked, including their numbers
// ---------------------------------------------------------------------------

describe("requirement-matrix applicator — partial page", () => {
  it("fills rows 1–3 and blanks the numbers of unused rows 4–6", async () => {
    const xml = await getSingleMatrixPage(makeMinimalSections([makeRowSection(3)]));

    expect(xml).toContain("REQ1_TEXT krav nummer 1");
    expect(xml).toContain("REQ3_TEXT krav nummer 3");
    expect(xml).not.toContain("REQ4_TEXT");

    // Used rows keep their number; unused rows are blanked (no stray "04"–"06").
    expect(hasRowNumber(xml, "03")).toBe(true);
    expect(hasRowNumber(xml, "04")).toBe(false);
    expect(hasRowNumber(xml, "05")).toBe(false);
    expect(hasRowNumber(xml, "06")).toBe(false);

    expect(xml).not.toContain("{Ska-krav");
  });
});

// ---------------------------------------------------------------------------
// Pagination — >6 rows spill onto more slides, nothing is dropped
// ---------------------------------------------------------------------------

describe("requirement-matrix applicator — pagination", () => {
  it("renders 7 rows across 2 pages with continuous numbering (row 7 not dropped)", async () => {
    const sections = makeMinimalSections([makeRowSection(7)]);
    const pages = await getMatrixPages(sections);
    expect(pages.length).toBe(2);

    const combined = pages.join("\n");
    // Every requirement is present somewhere — no silent truncation.
    for (let i = 1; i <= 7; i++) {
      expect(combined).toContain(`REQ${i}_TEXT krav nummer ${i}`);
    }

    // Page 1 carries rows 1–6, page 2 carries row 7 with a CONTINUOUS number.
    expect(pages[0]).toContain("REQ1_TEXT krav nummer 1");
    expect(pages[0]).not.toContain("REQ7_TEXT");
    expect(pages[1]).toContain("REQ7_TEXT krav nummer 7");
    expect(hasRowNumber(pages[1], "07")).toBe(true);
    // Page 2 slot 1 shows 07, not 01.
    expect(hasRowNumber(pages[1], "01")).toBe(false);
  });

  it("paginates 14 rows across 3 slides", async () => {
    const pages = await getMatrixPages(makeMinimalSections([makeRowSection(14)]));
    expect(pages.length).toBe(3);
    // Continuous numbering into the teens on page 3.
    expect(hasRowNumber(pages[2], "13")).toBe(true);
    expect(hasRowNumber(pages[2], "14")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Missing section — the guaranteed page renders blank, not raw placeholders
// ---------------------------------------------------------------------------

describe("requirement-matrix applicator — missing section", () => {
  it("renders one blank matrix page with no raw placeholders or numbers", async () => {
    // No requirement-matrix-v2 section at all — the slide is still guaranteed
    // (min 1 page), so it must blank cleanly rather than leak template markup.
    const xml = await getSingleMatrixPage(makeMinimalSections());

    expect(xml).not.toContain("{Ska-krav");
    expect(xml).not.toContain("{Hur krav");
    expect(xml).not.toContain("{CV/ref");
    expect(hasRowNumber(xml, "01")).toBe(false);
    expect(hasRowNumber(xml, "06")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Footer applied with correct counter
// ---------------------------------------------------------------------------

describe("requirement-matrix applicator — footer", () => {
  it("replaces {Bolagsnamn}, {Diarienummer} and the slide counter", async () => {
    const xml = await getSingleMatrixPage(makeMinimalSections([makeRowSection(6)]));

    expect(xml).toContain("ReqMatrixTestAB");
    expect(xml).toContain("RM-2026-013");
    expect(xml).not.toContain("{Bolagsnamn}");
    expect(xml).not.toContain("{Diarienummer}");
    expect(xml).not.toContain("13 / 17");
  });
});
