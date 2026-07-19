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
import {
  packRows,
  BOTTOM_MARGIN_EMU,
} from "../foreign-table-pagination";
import { formulaicAnswer } from "../applicators/foreign-table";
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

/** n requirement rows with cycling statuses, long krav text to force pagination. */
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
            referens: `REF_${i + 1}`,
            coverage: [{ consultantName: "A", status, evidence: "e" }],
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

/** Expected page windows for `rows` against the fixture's real geometry. */
async function expectedPages(rows: { requirement: string }[]): Promise<number[][]> {
  const buffer = await readFile(FIXTURE);
  const slides = await readPptxSlides(buffer);
  const { cy: slideHeightEmu } = await readSlideSize(buffer);
  const table = slides[1].tables[0];
  return packRows(
    rows.map((r) => ({ kravText: r.requirement })),
    {
      slideHeightEmu,
      tableTopEmu: table.geometry!.yEmu,
      headerHeightsEmu: [table.rows[0].heightEmu],
      templateRowHeightEmu: table.rows[1].heightEmu,
      kravColWidthEmu: table.gridColsEmu[0],
      fontSizePt: null,
      bottomMarginEmu: BOTTOM_MARGIN_EMU,
    },
  );
}

const HEADER = ["Krav", "Uppfyllnad", "Referens", "Status"];
const TEMPLATE_ROW_KRAV = "Minst 5 års erfarenhet av strategisk rådgivning";

describe("formulaicAnswer", () => {
  it("Ja/Delvis include the referens, Nej never does", () => {
    expect(formulaicAnswer({ referens: "CV Anna" }, "JA")).toBe("Ja — se CV Anna");
    expect(formulaicAnswer({ referens: "CV Anna" }, "DELVIS")).toBe(
      "Delvis — se CV Anna",
    );
    expect(formulaicAnswer({ referens: "CV Anna" }, "NEJ")).toBe("Nej");
  });

  it("without a referens, just the status word", () => {
    expect(formulaicAnswer({}, "JA")).toBe("Ja");
    expect(formulaicAnswer({ referens: "  " }, "DELVIS")).toBe("Delvis");
  });
});

describe("foreignTableApplicator — 7 requirements over the fixture table", () => {
  it("paginates by the customer geometry with correct per-cell content", async () => {
    const sections = makeSections(7);
    const rows =
      sections[0].content?.format === "requirement-matrix-v2"
        ? sections[0].content.rows
        : [];
    const pages = await expectedPages(rows);

    const buffer = await renderFromProfile(
      tpl,
      tableProfile(["krav", "uppfyllnad", "referens", "status"]),
      sections,
      master,
    );
    const outSlides = await readPptxSlides(buffer);

    // One output slide per page from the packing.
    expect(outSlides).toHaveLength(pages.length);
    // >1 page proves pagination actually happened (long krav text).
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
        const cells = table.rows[r + 1].cells.map((c) => c.text);
        expect(cells[0]).toBe(rows[rowIdx].requirement); // krav
        expect(cells[1]).toBe(
          formulaicAnswer({ referens: rows[rowIdx].referens }, status),
        ); // uppfyllnad — formulaic, NOT hurUppfylls prosa
        expect(cells[2]).toBe(rows[rowIdx].referens); // referens
        expect(cells[3]).toBe(status); // status word, no pill
      }
    }

    // No template row leaked onto any page; no hurUppfylls prosa in cells.
    const allText = outSlides
      .flatMap((s) => s.tables[0].rows.flatMap((row) => row.cells.map((c) => c.text)))
      .join("\n");
    expect(allText).not.toContain(TEMPLATE_ROW_KRAV);
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
    // The mapped columns still filled.
    expect(table.rows[1].cells[0].text).toBe("KRAV_1 kort");
  });
});
