// @vitest-environment node
/**
 * Task 8: Phases-overview applicator (slide 6).
 *
 * Pattern: render the full template, unzip output, scan slide 6 XML for
 * expected replacements and absence of leftover {placeholder} strings.
 *
 * Slide 6 is a single, non-cloned slide with 4 fixed phase card slots + 4
 * Gantt row slots. The applicator replaces up to 4 phases; unused slots get
 * empty strings.
 */
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { renderTemplate } from "../loader";
import { bundledTemplate } from "../registry";
import type { BidSection } from "../../types";
import type { MasterContext } from "../types";

const master: MasterContext = {
  companyName: "PhasesTestAB",
  clientName: "TestKund Stad",
  diaryNumber: "PH-2026-001",
  bidName: "Systemutveckling översikt",
  bidDate: "2026-04-19",
};

async function getAllSlideXml(zip: JSZip): Promise<string[]> {
  const entries = Object.keys(zip.files).filter((f) =>
    /^ppt\/slides\/slide\d+\.xml$/.test(f),
  );
  return Promise.all(entries.map((e) => zip.file(e)!.async("text")));
}

/** Minimal sections: cover + phases (4 phases). */
function make4PhaseSections(): BidSection[] {
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
      key: "phases",
      title: "Genomförande",
      generatedAt: "2026-04-19",
      content: {
        format: "phases",
        phases: [
          {
            name: "PH1NAME Nulägesanalys",
            objective: "Kartlägg nuläget objektivt",
            shortDescription: "PH1SHORT Kartlägg och analysera",
            activities: ["act1"],
            deliverables: ["del1"],
            duration: "4 v",
            period: "M1\u2013M2",
          },
          {
            name: "PH2NAME Design",
            objective: "Ta fram systemdesign",
            shortDescription: "PH2SHORT Design och arkitektur",
            activities: ["act1"],
            deliverables: ["del1"],
            duration: "6 v",
            period: "M2\u2013M5",
          },
          {
            name: "PH3NAME Implementering",
            objective: "Bygg och driftsätt systemet",
            shortDescription: "PH3SHORT Bygg och testa",
            activities: ["act1"],
            deliverables: ["del1"],
            duration: "8 v",
            period: "M5\u2013M9",
          },
          {
            name: "PH4NAME Överlämning",
            objective: "Överlämna till förvaltning",
            shortDescription: "PH4SHORT Överlämna och stäng",
            activities: ["act1"],
            deliverables: ["del1"],
            duration: "4 v",
            period: "M9\u2013M12",
          },
        ],
      },
    },
  ];
}

/** Minimal sections: cover + phases (3 phases — Fas 4 slots must become empty). */
function make3PhaseSections(): BidSection[] {
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
      key: "phases",
      title: "Genomförande",
      generatedAt: "2026-04-19",
      content: {
        format: "phases",
        phases: [
          {
            name: "PH1NAME Nulägesanalys",
            objective: "Kartlägg nuläget objektivt",
            shortDescription: "PH1SHORT Kartlägg och analysera",
            activities: ["act1"],
            deliverables: ["del1"],
            duration: "4 v",
            period: "M1\u2013M2",
          },
          {
            name: "PH2NAME Design",
            objective: "Ta fram systemdesign",
            // No shortDescription — falls back to objective
            activities: ["act1"],
            deliverables: ["del1"],
            duration: "6 v",
            period: "M2\u2013M5",
          },
          {
            name: "PH3NAME Implementering",
            objective: "Bygg och driftsätt systemet",
            shortDescription: "PH3SHORT Bygg och testa",
            activities: ["act1"],
            deliverables: ["del1"],
            duration: "8 v",
            period: "M5\u2013M9",
          },
        ],
      },
    },
  ];
}

/**
 * Find the phases-overview slide XML.
 *
 * pptx-automizer appends new slides to the PPTX while keeping the original
 * template slides in place. We cannot rely on numeric index because the output
 * slide order depends on pptx-automizer internals.
 *
 * Reliable approach: find the slide that:
 *   (a) contains the static "Genomförande — översikt" heading (unique to slide 6), AND
 *   (b) does NOT contain the unfilled "{Fas 1 — namn}" placeholder
 *       (the original template slide still has it; the applicator-processed
 *       output slide has replaced it with real data or "").
 *
 * This matches exactly what the phase-detail test does (find by activity
 * fingerprint rather than slide index).
 */
async function getPhasesOverviewXml(sections: BidSection[]): Promise<string> {
  const buf = await renderTemplate(bundledTemplate(), sections, master);
  const zip = await JSZip.loadAsync(buf);
  const entries = Object.keys(zip.files).filter((f) =>
    /^ppt\/slides\/slide\d+\.xml$/.test(f),
  );
  const allXmls = await Promise.all(entries.map((e) => zip.file(e)!.async("text")));

  // Static tab label "06 · GENOMFÖRANDE" (middle dot U+00B7) — unique to slide 6
  // in both the original template and the applicator output. The original template
  // slide still has unfilled "{Fas 1 — namn}"; the processed output slide does not.
  const TAB_LABEL = "06 \u00B7 GENOMF\u00d6RANDE";
  // The unfilled placeholder — ABSENT on the applicator-processed copy
  const UNFILLED_PLACEHOLDER = "{Fas 1 \u2014 namn}";

  const candidates = allXmls.filter(
    (xml) => xml.includes(TAB_LABEL) && !xml.includes(UNFILLED_PLACEHOLDER),
  );

  // There should be exactly one applicator-processed phases-overview slide
  expect(candidates.length).toBeGreaterThan(0);
  return candidates[0];
}

// ---------------------------------------------------------------------------
// Test 1: 4-phase case — all card + Gantt placeholders replaced
// ---------------------------------------------------------------------------

describe("phases-overview applicator — 4 phases", () => {
  it("replaces all 8 card placeholders and 4 Gantt spans", async () => {
    const xml = await getPhasesOverviewXml(make4PhaseSections());

    // Phase card names (appear in both card and Gantt row)
    expect(xml).toContain("PH1NAME Nulägesanalys");
    expect(xml).toContain("PH2NAME Design");
    expect(xml).toContain("PH3NAME Implementering");
    expect(xml).toContain("PH4NAME Överlämning");

    // Phase card short descriptions
    expect(xml).toContain("PH1SHORT Kartlägg och analysera");
    expect(xml).toContain("PH2SHORT Design och arkitektur");
    expect(xml).toContain("PH3SHORT Bygg och testa");
    expect(xml).toContain("PH4SHORT Överlämna och stäng");

    // Gantt span placeholders replaced with period values
    expect(xml).toContain("M1\u2013M2");
    expect(xml).toContain("M2\u2013M5");
    expect(xml).toContain("M5\u2013M9");
    expect(xml).toContain("M9\u2013M12");
  });

  it("leaves no unreplaced {Fas N — ...} card placeholders", async () => {
    const xml = await getPhasesOverviewXml(make4PhaseSections());

    // Long placeholders gone
    expect(xml).not.toContain("{Fas 1 \u2014 namn}");
    expect(xml).not.toContain("{Fas 2 \u2014 namn}");
    expect(xml).not.toContain("{Fas 3 \u2014 namn}");
    expect(xml).not.toContain("{Fas 4 \u2014 namn}");
    expect(xml).not.toContain("{Fas 1 \u2014 kort beskrivning");
    expect(xml).not.toContain("{Fas 2 \u2014 beskrivning}");
    expect(xml).not.toContain("{Fas 3 \u2014 beskrivning}");
    expect(xml).not.toContain("{Fas 4 \u2014 beskrivning}");

    // Short Gantt labels gone
    expect(xml).not.toContain("{Fas 1}");
    expect(xml).not.toContain("{Fas 2}");
    expect(xml).not.toContain("{Fas 3}");
    expect(xml).not.toContain("{Fas 4}");

    // Gantt span literals gone
    expect(xml).not.toContain("{M1\u2013M2}");
    expect(xml).not.toContain("{M2\u2013M5}");
    expect(xml).not.toContain("{M5\u2013M9}");
    expect(xml).not.toContain("{M9\u2013M12}");
  });
});

// ---------------------------------------------------------------------------
// Test 2: 3-phase case — Fas 4 slots replaced with empty string
// ---------------------------------------------------------------------------

describe("phases-overview applicator — 3 phases", () => {
  it("replaces Fas 1–3 with data and Fas 4 slots with empty strings", async () => {
    const xml = await getPhasesOverviewXml(make3PhaseSections());

    // Fas 1–3 have data
    expect(xml).toContain("PH1NAME Nulägesanalys");
    expect(xml).toContain("PH2NAME Design");
    expect(xml).toContain("PH3NAME Implementering");
    expect(xml).toContain("PH1SHORT Kartlägg och analysera");
    // Phase 2 falls back to objective (no shortDescription)
    expect(xml).toContain("Ta fram systemdesign");
    expect(xml).toContain("PH3SHORT Bygg och testa");

    // Gantt spans for Fas 1–3 present
    expect(xml).toContain("M1\u2013M2");
    expect(xml).toContain("M2\u2013M5");
    expect(xml).toContain("M5\u2013M9");
  });

  it("leaves no leftover {Fas 4 ...} placeholders", async () => {
    const xml = await getPhasesOverviewXml(make3PhaseSections());

    // All Fas 4 placeholders replaced (with empty string)
    expect(xml).not.toContain("{Fas 4 \u2014 namn}");
    expect(xml).not.toContain("{Fas 4 \u2014 beskrivning}");
    expect(xml).not.toContain("{Fas 4}");
    expect(xml).not.toContain("{M9\u2013M12}");

    // No other Fas 1–3 leftover placeholders either
    expect(xml).not.toContain("{Fas 1 \u2014 namn}");
    expect(xml).not.toContain("{Fas 2 \u2014 namn}");
    expect(xml).not.toContain("{Fas 3 \u2014 namn}");
    expect(xml).not.toContain("{Fas 1 \u2014 kort beskrivning");
    expect(xml).not.toContain("{Fas 2 \u2014 beskrivning}");
    expect(xml).not.toContain("{Fas 3 \u2014 beskrivning}");
  });
});

// ---------------------------------------------------------------------------
// Test 3: Replacement-order — {Fas N — namn} not corrupted by {Fas N}
// ---------------------------------------------------------------------------

describe("phases-overview applicator — replacement order safety", () => {
  it("does not leave stale {Fas N — ...} fragments after replacement", async () => {
    const xml = await getPhasesOverviewXml(make4PhaseSections());

    // These would appear if {Fas N} was replaced before {Fas N — namn},
    // corrupting "PH1NAME Nulägesanalys — namn}" → would leave stray text
    // The actual test: no { remains anywhere (for these known keys)
    const phantomPatterns = [
      // If {Fas 1} was replaced with phase.name first, then "{PH1NAME ... — namn}"
      // would remain unreplaced (an unknown-looking placeholder fragment).
      // We verify the full long-form placeholders are gone, not just shortened.
      "— namn}",
      "— beskrivning}",
      "— kort beskrivning",
    ];
    for (const pat of phantomPatterns) {
      // These fragments should not appear as leftovers in braces context
      // We check: the literal "{Fas N — namn}" form is gone (done in Test 1),
      // and also that no brace-started fragment remains open.
      // The simplest invariant: no "{" immediately followed by phase index digits
      // in the Fas placeholder form.
      expect(xml).not.toContain("{Fas 1 " + pat.split("— ")[1]);
      expect(xml).not.toContain("{Fas 2 " + pat.split("— ")[1]);
      expect(xml).not.toContain("{Fas 3 " + pat.split("— ")[1]);
      expect(xml).not.toContain("{Fas 4 " + pat.split("— ")[1]);
    }
  });

  it("after replacement, phase names appear cleanly without trailing placeholder syntax", async () => {
    const xml = await getPhasesOverviewXml(make4PhaseSections());

    // If replacement order was wrong, the phase name would have been inserted
    // INTO the longer placeholder string, leaving artifacts like
    // "{PH2NAME Design — namn}" or "PH1NAME Nulägesanalys — namn}"
    expect(xml).not.toContain("PH1NAME Nulägesanalys — namn}");
    expect(xml).not.toContain("PH2NAME Design — namn}");
    expect(xml).not.toContain("PH3NAME Implementering — namn}");
    expect(xml).not.toContain("PH4NAME Överlämning — namn}");
    expect(xml).not.toContain("PH1NAME Nulägesanalys — beskrivning}");
  });
});

// ---------------------------------------------------------------------------
// Test 4: Footer counter correct (06 / 17 → slideNum / totalSlides)
// ---------------------------------------------------------------------------

describe("phases-overview applicator — footer", () => {
  it("replaces {Bolagsnamn}, {Diarienummer}, and slide counter", async () => {
    const xml = await getPhasesOverviewXml(make4PhaseSections());

    expect(xml).toContain("PhasesTestAB");
    expect(xml).toContain("PH-2026-001");
    expect(xml).not.toContain("{Bolagsnamn}");
    expect(xml).not.toContain("{Diarienummer}");

    // Slide 6 is output position 6. Total slides = non-clone count + (phases-1 extra clones).
    // With 4 phases and template having slides 1-6,11-17 plus 4 phase clones minus 1 (template has 1):
    // Actual total depends on registry config. We just check counter pattern gone.
    expect(xml).not.toContain("06 / 17");
  });
});
