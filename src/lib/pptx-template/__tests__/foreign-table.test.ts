// @vitest-environment node
/**
 * Foreign-table row engine — end-to-end against the committed real-a:tbl fixture
 * (table-sample.pptx, slide 2: 4 cols krav|uppfyllnad|referens|status, 1 header
 * row + 1 template row). We render a profile whose table slide carries a
 * tableMap through renderFromProfile, read the output back with readPptxSlides,
 * and assert the generated rows cell-by-cell.
 */
import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import path from "path";
import { renderFromProfile } from "../render-from-profile";
import { readPptxSlides } from "../introspect/read-pptx";
import { readSlideSize } from "../onboarding/slide-size";
import { packRows, BOTTOM_MARGIN_EMU } from "../foreign-table-pagination";
import {
  formulaicAnswer,
  coveringNames,
  wrapCellsFor,
  type MatrixRow,
} from "../applicators/foreign-table";
import type { TemplateProfile, TableColumnRole } from "../template-profile";
import type { BidSection } from "../../types";
import type { MasterContext } from "../types";
import type { LoadedTemplate } from "../template-store";

const FIXTURE = path.resolve(
  "src/lib/pptx-template/__tests__/fixtures/table-sample.pptx",
);

const master: MasterContext = {
  companyName: "TabellTestAB",
  clientName: "TestKund",
  diaryNumber: "T-2026-1",
  bidName: "Tabelltest",
  bidDate: "2026-07-19",
};

type Status = "JA" | "NEJ" | "DELVIS";

// A deliberately verbose referens string like the bundle emits — the exact input
// that overflowed the narrow cell before the fix. It must NOT reach any cell.
const VERBOSE_REF =
  "Karl Svensson – Organisationsdesign post-merger, Industrikoncern (2022); Anna Berg – Förändringsledning offentlig sektor (2021)";

/** n requirement rows with cycling statuses and a named covering consultant. */
function makeSections(n: number, longKrav = true): BidSection[] {
  const statuses: Status[] = ["JA", "DELVIS", "NEJ"];
  return [
    {
      type: "data",
      key: "requirement-matrix-v2",
      title: "Kravmatris",
      generatedAt: "2026-07-19",
      content: {
        format: "requirement-matrix-v2",
        rows: Array.from({ length: n }, (_, i) => {
          const status = statuses[i % statuses.length];
          return {
            requirement:
              `KRAV_${i + 1}` + (longKrav ? " " + "x".repeat(180) : " kort"),
            hurUppfylls: `HUR ${i + 1} prosa som inte får hamna i cellen`,
            referens: VERBOSE_REF,
            coverage: [
              { consultantName: `Konsult ${i + 1}`, status, evidence: "e" },
            ],
          };
        }),
      },
    },
  ];
}

function tableProfile(columns: TableColumnRole[]): TemplateProfile {
  return {
    profileVersion: 1,
    templateId: "fixture",
    name: "table-fixture",
    version: 1,
    slides: [
      {
        source: 2,
        capability: "requirement-matrix",
        slots: [],
        tableMap: { frameIndex: 0, headerRows: 1, templateRowIndex: 1, columns },
      },
    ],
  };
}

const tpl = { templateFile: FIXTURE } as unknown as Pick<
  LoadedTemplate,
  "manifest" | "templateFile"
>;

/** Expected page windows for `rows` against the fixture's real geometry, using
 *  the SAME wrap-cell builder the renderer uses (max wrap across mapped cols). */
async function expectedPages(
  rows: MatrixRow[],
  columns: TableColumnRole[],
): Promise<number[][]> {
  const buffer = await readFile(FIXTURE);
  const slides = await readPptxSlides(buffer);
  const { cy: slideHeightEmu } = await readSlideSize(buffer);
  const table = slides[1].tables[0];
  return packRows(
    rows.map((r) => wrapCellsFor(r, columns, table.gridColsEmu)),
    {
      slideHeightEmu,
      tableTopEmu: table.geometry!.yEmu,
      headerHeightsEmu: [table.rows[0].heightEmu],
      templateRowHeightEmu: table.rows[1].heightEmu,
      fontSizePt: null,
      bottomMarginEmu: BOTTOM_MARGIN_EMU,
    },
  );
}

const HEADER = ["Krav", "Uppfyllnad", "Referens", "Status"];
const TEMPLATE_ROW_KRAV = "Minst 5 års erfarenhet av strategisk rådgivning";

function cov(pairs: [string, Status][]) {
  return pairs.map(([consultantName, status]) => ({
    consultantName,
    status,
    evidence: "e",
  }));
}

describe("formulaicAnswer / coveringNames", () => {
  it("names the first CONSULTANT whose coverage carries the row status", () => {
    // JA row → the JA consultants; first one named.
    expect(formulaicAnswer(cov([["Anna", "JA"], ["Bo", "JA"], ["C", "DELVIS"]]))).toBe(
      "Ja — se CV: Anna",
    );
    // No JA → DELVIS row → the best-available (DELVIS) consultant.
    expect(formulaicAnswer(cov([["Anna", "NEJ"], ["Bo", "DELVIS"]]))).toBe(
      "Delvis — se CV: Bo",
    );
    // Nobody covers → bare "Nej", never a name.
    expect(formulaicAnswer(cov([["Anna", "NEJ"], ["Bo", "NEJ"]]))).toBe("Nej");
    expect(formulaicAnswer([])).toBe("Nej");
  });

  it("without a covering name, just the status word", () => {
    expect(formulaicAnswer(cov([["   ", "JA"]]))).toBe("Ja");
  });

  it("coveringNames returns only the status-carrying consultants, in order", () => {
    expect(coveringNames(cov([["Anna", "JA"], ["Bo", "JA"], ["C", "DELVIS"]]))).toEqual([
      "Anna",
      "Bo",
    ]);
    expect(coveringNames(cov([["Anna", "DELVIS"], ["Bo", "NEJ"]]))).toEqual(["Anna"]);
    expect(coveringNames(cov([["Anna", "NEJ"]]))).toEqual([]);
  });
});

describe("foreignTableApplicator — 7 requirements over the fixture table", () => {
  it("paginates by the customer geometry with short CV-pointer cell content", async () => {
    const columns: TableColumnRole[] = ["krav", "uppfyllnad", "referens", "status"];
    const sections = makeSections(7);
    const rows = (
      sections[0].content?.format === "requirement-matrix-v2"
        ? sections[0].content.rows
        : []
    ) as MatrixRow[];
    const pages = await expectedPages(rows, columns);

    const buffer = await renderFromProfile(tpl, tableProfile(columns), sections, master);
    const outSlides = await readPptxSlides(buffer);

    // One output slide per page from the packing; >1 proves pagination happened.
    expect(outSlides).toHaveLength(pages.length);
    expect(pages.length).toBeGreaterThan(1);

    const statuses: Status[] = ["JA", "DELVIS", "NEJ"];
    for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
      const table = outSlides[pageIdx].tables[0];
      const window = pages[pageIdx];

      // Header row untouched; template row removed; exactly window.length data rows.
      expect(table.rows).toHaveLength(1 + window.length);
      expect(table.rows[0].cells.map((c) => c.text)).toEqual(HEADER);

      for (let r = 0; r < window.length; r++) {
        const rowIdx = window[r];
        const status = statuses[rowIdx % statuses.length];
        const name = `Konsult ${rowIdx + 1}`;
        const cells = table.rows[r + 1].cells.map((c) => c.text);
        expect(cells[0]).toBe(rows[rowIdx].requirement); // krav
        // uppfyllnad — short CV pointer built from coverage, NOT the verbose ref.
        expect(cells[1]).toBe(status === "NEJ" ? "Nej" : `${status === "JA" ? "Ja" : "Delvis"} — se CV: ${name}`);
        // referens — covering consultant name(s), NOT the verbose bundle string.
        expect(cells[2]).toBe(status === "NEJ" ? "" : name);
        expect(cells[3]).toBe(status); // status word, no pill
      }
    }

    const allText = outSlides
      .flatMap((s) => s.tables[0].rows.flatMap((row) => row.cells.map((c) => c.text)))
      .join("\n");
    // Template row gone; verbose referens + hurUppfylls prosa never reach a cell.
    expect(allText).not.toContain(TEMPLATE_ROW_KRAV);
    expect(allText).not.toContain(VERBOSE_REF);
    expect(allText).not.toContain("prosa som inte får hamna");

    // Every requirement placed exactly once across all pages (coverage moat).
    const kravCells = outSlides.flatMap((s) =>
      s.tables[0].rows.slice(1).map((row) => row.cells[0].text),
    );
    expect(kravCells.sort()).toEqual(rows.map((r) => r.requirement).sort());
  });
});

describe("foreignTableApplicator — ignorera column keeps the template cell", () => {
  it("leaves an ignorera-mapped column at the template row's own text", async () => {
    const sections = makeSections(2, false); // short krav → single page
    const buffer = await renderFromProfile(
      tpl,
      tableProfile(["krav", "uppfyllnad", "referens", "ignorera"]),
      sections,
      master,
    );
    const outSlides = await readPptxSlides(buffer);
    expect(outSlides).toHaveLength(1);

    const table = outSlides[0].tables[0];
    expect(table.rows).toHaveLength(3); // header + 2 requirements
    // The 4th column was mapped "ignorera": every data row keeps the template
    // row's own status cell ("Uppfyllt"), NOT a rolled-up status word.
    for (let r = 1; r < table.rows.length; r++) {
      expect(table.rows[r].cells[3].text).toBe("Uppfyllt");
    }
    expect(table.rows[1].cells[0].text).toBe("KRAV_1 kort");
  });
});
