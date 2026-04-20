// @vitest-environment node
/**
 * Task 6: Footer helper + TOC + Prose + Quality applicators
 *
 * Pattern: render the full template, unzip output, scan all slide XMLs
 * for expected replacement values and absence of {placeholder} strings.
 * We identify each rendered slide by a unique content fingerprint since
 * pptx-automizer appends slides at unpredictable indices.
 */
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { renderTemplate } from "../loader";
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

/** Render the full template with all sections provided */
async function renderAll(sections: BidSection[]): Promise<string[]> {
  const buf = await renderTemplate("anbudsmall-v2", sections, master);
  const zip = await JSZip.loadAsync(buf);
  return getAllSlideXml(zip);
}

// ---------------------------------------------------------------------------
// Shared sections used by all slide types
// ---------------------------------------------------------------------------

function makeSections(): BidSection[] {
  return [
    {
      type: "data",
      key: "understanding-current",
      title: "Kunden idag",
      generatedAt: "2026-04-19",
      content: {
        format: "understanding-current",
        organisation: "UNIQUE_ORG_TEXT förvaltning 1200 anställda",
        system: "UNIQUE_SYS_TEXT system från 2003 SOAP",
        processer: "UNIQUE_PROC_TEXT manuella arbetsflöden",
        smärtpunkter: [
          "UNIQUE_SP1 ärendehantering tar tid",
          "UNIQUE_SP2 brist på realtidsdata",
          "UNIQUE_SP3 separata system",
          // 4th slot omitted — should become empty
        ],
      },
    },
    {
      type: "data",
      key: "understanding-assignment",
      title: "Uppdragsbeskrivning",
      generatedAt: "2026-04-19",
      content: {
        format: "understanding-assignment",
        stycken: [
          "UNIQUE_STYCKE1 uppdraget handlar om digitalisering",
          "UNIQUE_STYCKE2 omfattning 12 månader socialtjänst",
          "UNIQUE_STYCKE3 intressenter kommunledning",
        ],
      },
    },
    {
      type: "data",
      key: "understanding-vision",
      title: "Utmaningar och värde",
      generatedAt: "2026-04-19",
      content: {
        format: "understanding-vision",
        utmaningar: [
          "UNIQUE_UTM1 systemintegration komplex",
          "UNIQUE_UTM2 förändringsledning handläggare",
          // slots 3+4 omitted
        ],
        värden: [
          "UNIQUE_VARDE1 reducerar handläggningstid 40%",
          "UNIQUE_VARDE2 förbättrar medborgarnöjdhet",
          "UNIQUE_VARDE3 möjliggör realtidsrapportering",
          // slot 4 omitted
        ],
      },
    },
    {
      type: "data",
      key: "quality-assurance",
      title: "Kvalitetssäkring",
      generatedAt: "2026-04-19",
      content: {
        format: "quality-assurance",
        qaProcess: [
          "UNIQUE_QA1 ISO 9001 kvalitetsmetodik tydliga granskningspunkter",
          "UNIQUE_QA2 peer review varje leverans dokumenterat",
        ],
        qualityLead: {
          name: "UNIQUE_QLNAME Anna Lindqvist",
          roleAndMandate:
            "UNIQUE_QLROLE Kvalitetschef 15 års erfarenhet mandat stoppa leveranser",
          contact: "UNIQUE_QLCONTACT anna@testbolaget.se 070-123",
        },
        escalation: {
          process:
            "UNIQUE_ESC_PROC avvikelser rapporteras beställare 24h avvikelselogg",
          reporting:
            "UNIQUE_ESC_REP månadsrapport sista vardag avvikelserapport",
        },
        checkpoints: [
          "UNIQUE_CP1 projektstart scope leveransplan bekräftas",
          "UNIQUE_CP2 mid-point M6 halvtidsgenomgång",
          "UNIQUE_CP3 pre-leverans QA en vecka",
          // slot 4 omitted
        ],
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// TOC slide — footer replacements only (slide 2)
// ---------------------------------------------------------------------------

describe("TOC applicator (slide 2)", () => {
  it("replaces footer placeholders and slide counter", async () => {
    const allSlides = await renderAll(makeSections());

    // NOTE: pptx-automizer with removeExistingSlides keeps the original slide XML
    // files in the zip archive even though they are removed from the manifest.
    // We therefore MUST identify the rendered TOC by a content fingerprint, not
    // by asserting absence of counters across ALL slide XMLs (the orphaned original
    // slide2.xml from the template still contains '02 / 17').

    // The rendered TOC slide is the one that has the footer values replaced.
    // Multiple slides will have "Testbolaget AB" (every non-cover slide gets the footer).
    // We find TOC specifically by its static text "Innehåll" which only appears on slide 2.
    const tocSlides = allSlides.filter(
      (s) => s.includes("Testbolaget AB") && s.includes("Innehållsf"),
    );
    expect(tocSlides.length).toBeGreaterThan(0);

    const xml = tocSlides[0];
    // Footer replaced
    expect(xml).toContain("Testbolaget AB");
    expect(xml).toContain("TK-2026-999");
    expect(xml).not.toContain("{Bolagsnamn}");
    expect(xml).not.toContain("{Diarienummer}");

    // Slide counter replaced in the rendered TOC (02 / 17 → slideNum / totalSlides)
    expect(xml).not.toContain("02 / 17");
  });
});

// ---------------------------------------------------------------------------
// Prose: slide 3 — understanding-current
// ---------------------------------------------------------------------------

describe("Prose applicator — understanding-current (slide 3)", () => {
  it("replaces all section A + B placeholders and footer", async () => {
    const allSlides = await renderAll(makeSections());

    const targetSlides = allSlides.filter((s) => s.includes("UNIQUE_ORG_TEXT"));
    expect(targetSlides.length).toBeGreaterThan(0);

    const xml = targetSlides[0];

    // Section A
    expect(xml).toContain("UNIQUE_ORG_TEXT förvaltning 1200 anställda");
    expect(xml).toContain("UNIQUE_SYS_TEXT system från 2003 SOAP");
    expect(xml).toContain("UNIQUE_PROC_TEXT manuella arbetsflöden");

    // Section B — 3 smärtpunkter provided
    expect(xml).toContain("UNIQUE_SP1 ärendehantering tar tid");
    expect(xml).toContain("UNIQUE_SP2 brist på realtidsdata");
    expect(xml).toContain("UNIQUE_SP3 separata system");

    // No unreplaced placeholders
    expect(xml).not.toContain(
      "{Kundens nuläge — organisation: förvaltningar, antal anställda, geografi}",
    );
    expect(xml).not.toContain(
      "{Kundens nuläge — system: nuvarande verksamhetssystem, integrationer, leverantörer}",
    );
    expect(xml).not.toContain(
      "{Kundens nuläge — processer: arbetssätt, styrning, beslutsvägar}",
    );
    expect(xml).not.toContain(
      "{Smärtpunkt 1 — vad som inte fungerar idag och hur det påverkar verksamheten}",
    );
    // Slot 4 unused — placeholder replaced with empty string
    expect(xml).not.toContain("{Smärtpunkt 4}");

    // Footer
    expect(xml).not.toContain("{Bolagsnamn}");
    expect(xml).not.toContain("{Diarienummer}");
    expect(xml).not.toContain("03 / 17");
  });
});

// ---------------------------------------------------------------------------
// Prose: slide 4 — understanding-assignment
// ---------------------------------------------------------------------------

describe("Prose applicator — understanding-assignment (slide 4)", () => {
  it("replaces all stycken placeholders and footer", async () => {
    const allSlides = await renderAll(makeSections());

    const targetSlides = allSlides.filter((s) => s.includes("UNIQUE_STYCKE1"));
    expect(targetSlides.length).toBeGreaterThan(0);

    const xml = targetSlides[0];

    expect(xml).toContain("UNIQUE_STYCKE1 uppdraget handlar om digitalisering");
    expect(xml).toContain("UNIQUE_STYCKE2 omfattning 12 månader socialtjänst");
    expect(xml).toContain("UNIQUE_STYCKE3 intressenter kommunledning");

    // No unreplaced placeholders
    expect(xml).not.toContain(
      "{Uppdraget parafraserat med våra ord — stycke 1.",
    );
    expect(xml).not.toContain("{Bolagsnamn}");
    expect(xml).not.toContain("{Diarienummer}");
    expect(xml).not.toContain("04 / 17");
  });
});

// ---------------------------------------------------------------------------
// Prose: slide 5 — understanding-vision
// ---------------------------------------------------------------------------

describe("Prose applicator — understanding-vision (slide 5)", () => {
  it("replaces utmaningar and värden placeholders + footer", async () => {
    const allSlides = await renderAll(makeSections());

    const targetSlides = allSlides.filter((s) => s.includes("UNIQUE_UTM1"));
    expect(targetSlides.length).toBeGreaterThan(0);

    const xml = targetSlides[0];

    // Utmaningar (2 provided, 4 slots)
    expect(xml).toContain("UNIQUE_UTM1 systemintegration komplex");
    expect(xml).toContain("UNIQUE_UTM2 förändringsledning handläggare");
    expect(xml).not.toContain(
      "{Utmaning 1 — en konkret utmaning vi ser i uppdraget och varför den är viktig att hantera}",
    );
    expect(xml).not.toContain("{Utmaning 3}");
    expect(xml).not.toContain("{Utmaning 4}");

    // Värden (3 provided, 4 slots)
    expect(xml).toContain("UNIQUE_VARDE1 reducerar handläggningstid 40%");
    expect(xml).toContain("UNIQUE_VARDE2 förbättrar medborgarnöjdhet");
    expect(xml).toContain("UNIQUE_VARDE3 möjliggör realtidsrapportering");
    expect(xml).not.toContain(
      "{Värde 1 — mervärde vi kan synliggöra som går utöver ska-kraven, konkret och mätbart}",
    );
    expect(xml).not.toContain("{Värde 4}");

    // Footer
    expect(xml).not.toContain("{Bolagsnamn}");
    expect(xml).not.toContain("{Diarienummer}");
    expect(xml).not.toContain("05 / 17");
  });
});

// ---------------------------------------------------------------------------
// Quality-assurance applicator (slide 11)
// ---------------------------------------------------------------------------

describe("Quality-assurance applicator (slide 11)", () => {
  it("replaces all QA sub-section placeholders + checkpoints + footer", async () => {
    const allSlides = await renderAll(makeSections());

    const targetSlides = allSlides.filter((s) => s.includes("UNIQUE_QLNAME"));
    expect(targetSlides.length).toBeGreaterThan(0);

    const xml = targetSlides[0];

    // QA Process
    expect(xml).toContain("UNIQUE_QA1 ISO 9001 kvalitetsmetodik tydliga granskningspunkter");
    expect(xml).toContain("UNIQUE_QA2 peer review varje leverans dokumenterat");
    expect(xml).not.toContain(
      "{QA-process — övergripande beskrivning av vårt kvalitetsarbete: metodik, standarder och verktyg.}",
    );
    // The split placeholder — after paragraph-level replacement this should be gone
    expect(xml).not.toContain("{QA-process — granskningsrutiner");

    // Quality Lead
    expect(xml).toContain("UNIQUE_QLNAME Anna Lindqvist");
    expect(xml).toContain("UNIQUE_QLROLE Kvalitetschef 15 års erfarenhet mandat stoppa leveranser");
    expect(xml).toContain("UNIQUE_QLCONTACT anna@testbolaget.se 070-123");
    expect(xml).not.toContain("{Namn, kvalitetsledare}");
    expect(xml).not.toContain("{Roll, erfarenhet och mandat}");
    expect(xml).not.toContain("{Kontakt — e-post och telefon}");

    // Escalation
    expect(xml).toContain("UNIQUE_ESC_PROC avvikelser rapporteras beställare 24h avvikelselogg");
    expect(xml).toContain("UNIQUE_ESC_REP månadsrapport sista vardag avvikelserapport");
    expect(xml).not.toContain("{Hur avvikelser hanteras och eskaleras till beställare}");
    expect(xml).not.toContain("{Rapporteringsfrekvens och format");

    // Checkpoints (3 provided, 4 slots)
    expect(xml).toContain("UNIQUE_CP1 projektstart scope leveransplan bekräftas");
    expect(xml).toContain("UNIQUE_CP2 mid-point M6 halvtidsgenomgång");
    expect(xml).toContain("UNIQUE_CP3 pre-leverans QA en vecka");
    expect(xml).not.toContain("{Avstämning 1 — tidpunkt och innehåll}");
    expect(xml).not.toContain("{Avstämning 4}");

    // Footer
    expect(xml).toContain("Testbolaget AB");
    expect(xml).toContain("TK-2026-999");
    expect(xml).not.toContain("{Bolagsnamn}");
    expect(xml).not.toContain("{Diarienummer}");
    expect(xml).not.toContain("11 / 17");
  });
});
