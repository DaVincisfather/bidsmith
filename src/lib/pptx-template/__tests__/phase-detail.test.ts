// @vitest-environment node
/**
 * Task 7: Phase-detail applicator with cloning
 *
 * Pattern: render the full template, unzip output, scan all slide XMLs for
 * expected replacement values and absence of {placeholder} strings.
 *
 * The test fixture contains 3 phases so we get 3 cloned phase-detail slides.
 * We identify each phase's slide by a unique activity fingerprint string.
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

/** Minimal sections: cover + phases (3 phases) */
function makePhasesSections(): BidSection[] {
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
            name: "PHASE1_NAME Nulägesanalys",
            objective: "Kartlägg nuläge",
            activities: [
              "PHASE1_ACT1 intervjuer med handläggare, IT och ledning",
              "PHASE1_ACT2 dokumentgranskning av befintliga flöden",
              "PHASE1_ACT3 gap-analys nuläge mot önskat läge",
              "PHASE1_ACT4 riskidentifiering och prioritering",
            ],
            deliverables: [
              "PHASE1_DEL1 nulägesrapport med rekommendationer",
              "PHASE1_DEL2 risklogg version 1",
              "PHASE1_DEL3 prioriterad backlog",
            ],
            decisions: [
              "PHASE1_DEC1 godkänd nulägesanalys och riskbild",
              "PHASE1_DEC2 beslut om prioriteringsordning",
              // decision[2] omitted → should use fallback "Go/no-go till nästa fas"
            ],
            duration: "4 v",
            period: "M1–M4",
          },
          {
            name: "PHASE2_NAME Design och prototyp",
            objective: "Ta fram systemdesign",
            activities: [
              "PHASE2_ACT1 workshop kravanalys med IT-avdelning",
              "PHASE2_ACT2 prototyp i Figma för tre kärnflöden",
              // only 2 activities — slots 3+4 should be empty
            ],
            deliverables: [
              "PHASE2_DEL1 systemdesign dokument",
              "PHASE2_DEL2 klickbar prototyp godkänd av beställare",
              // only 2 deliverables — slot 3 should be empty
            ],
            decisions: [
              "PHASE2_DEC1 godkänd systemdesign och arkitektur",
              "PHASE2_DEC2 grönljus för implementationsfas",
              "PHASE2_DEC3 resursallokering bekräftad",
            ],
            duration: "6 v",
            period: "M5–M10",
          },
          {
            name: "PHASE3_NAME Implementering och test",
            objective: "Bygg och driftsätt",
            activities: [
              "PHASE3_ACT1 sprint-baserad implementation agilt",
              "PHASE3_ACT2 integrationstest mot befintliga system",
              "PHASE3_ACT3 UAT med slutanvändare",
              // only 3 activities — slot 4 should be empty
            ],
            deliverables: [
              "PHASE3_DEL1 driftsatt system med dokumentation",
              // only 1 deliverable — slots 2+3 should be empty
            ],
            decisions: [
              "PHASE3_DEC1 godkänd slutleverans",
              // decisions[1] and [2] omitted — should be empty / fallback
            ],
            duration: "8 v",
            period: "M11–M18",
          },
        ],
      },
    },
  ];
}

async function renderPhases(): Promise<string[]> {
  const buf = await renderTemplate("anbudsmall-v2", makePhasesSections(), master);
  const zip = await JSZip.loadAsync(buf);
  return getAllSlideXml(zip);
}

// ---------------------------------------------------------------------------
// Test 1: Cloning produces 3 phase-detail slides for 3 phases
// ---------------------------------------------------------------------------

describe("phase-detail applicator — cloning", () => {
  it("produces 3 distinct phase-detail slides for 3 phases", async () => {
    const allSlides = await renderPhases();

    const phase1Slides = allSlides.filter((s) => s.includes("PHASE1_ACT1"));
    const phase2Slides = allSlides.filter((s) => s.includes("PHASE2_ACT1"));
    const phase3Slides = allSlides.filter((s) => s.includes("PHASE3_ACT1"));

    expect(phase1Slides.length).toBeGreaterThan(0);
    expect(phase2Slides.length).toBeGreaterThan(0);
    expect(phase3Slides.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Test 2: Per-clone placeholder replacement — phase 1
// ---------------------------------------------------------------------------

describe("phase-detail applicator — phase 1 placeholders", () => {
  it("phase 1 slide has correct name/activities/deliverables/decisions", async () => {
    const allSlides = await renderPhases();
    const slides = allSlides.filter((s) => s.includes("PHASE1_ACT1"));
    expect(slides.length).toBeGreaterThan(0);
    const xml = slides[0];

    // Name
    expect(xml).toContain("PHASE1_NAME Nulägesanalys");
    // Period/duration
    expect(xml).toContain("M1\u2013M4"); // en dash U+2013

    // Activities
    expect(xml).toContain("PHASE1_ACT1 intervjuer med handläggare, IT och ledning");
    expect(xml).toContain("PHASE1_ACT2 dokumentgranskning av befintliga flöden");
    expect(xml).toContain("PHASE1_ACT3 gap-analys nuläge mot önskat läge");
    expect(xml).toContain("PHASE1_ACT4 riskidentifiering och prioritering");

    // Deliverables
    expect(xml).toContain("PHASE1_DEL1 nulägesrapport med rekommendationer");
    expect(xml).toContain("PHASE1_DEL2 risklogg version 1");
    expect(xml).toContain("PHASE1_DEL3 prioriterad backlog");

    // Decisions (2 provided, [2] missing → fallback)
    expect(xml).toContain("PHASE1_DEC1 godkänd nulägesanalys och riskbild");
    expect(xml).toContain("PHASE1_DEC2 beslut om prioriteringsordning");
    // decisions[2] fallback: "Go/no-go till nästa fas"
    expect(xml).toContain("Go/no-go till n\u00e4sta fas");

    // No unreplaced placeholders
    expect(xml).not.toContain("{Fas 1");
    expect(xml).not.toContain("{M1\u2013M2}");
    expect(xml).not.toContain("{Antal veckor}");
    expect(xml).not.toContain("{Aktivitet 1");
    expect(xml).not.toContain("{Leverans 1");
    expect(xml).not.toContain("{Beslut 1");
  });
});

// ---------------------------------------------------------------------------
// Test 3: Per-clone placeholder replacement — phase 2 (NOT phase 1 data)
// ---------------------------------------------------------------------------

describe("phase-detail applicator — phase 2 placeholder isolation", () => {
  it("phase 2 slide has phase 2 data, not phase 1 data", async () => {
    const allSlides = await renderPhases();
    const slides = allSlides.filter((s) => s.includes("PHASE2_ACT1"));
    expect(slides.length).toBeGreaterThan(0);
    const xml = slides[0];

    // Phase 2 data present
    expect(xml).toContain("PHASE2_NAME Design och prototyp");
    expect(xml).toContain("PHASE2_ACT1 workshop kravanalys med IT-avdelning");
    expect(xml).toContain("PHASE2_ACT2 prototyp i Figma för tre kärnflöden");
    expect(xml).toContain("PHASE2_DEL1 systemdesign dokument");

    // Phase 1 data NOT present (isolation check)
    expect(xml).not.toContain("PHASE1_NAME");
    expect(xml).not.toContain("PHASE1_ACT1");
    expect(xml).not.toContain("PHASE1_DEL1");
  });
});

// ---------------------------------------------------------------------------
// Test 4: Literal text per clone — FAS N AV M, badge, timeline label
// ---------------------------------------------------------------------------

describe("phase-detail applicator — literal text per clone", () => {
  it("phase 1 slide (clone 0) has FAS 1 AV 3 in tab label", async () => {
    const allSlides = await renderPhases();
    const slides = allSlides.filter((s) => s.includes("PHASE1_ACT1"));
    expect(slides.length).toBeGreaterThan(0);
    const xml = slides[0];

    // Tab label: FAS 1 AV 3 (3 total phases in fixture)
    expect(xml).toContain("FAS 1 AV 3");
    expect(xml).not.toContain("FAS 1 AV 4"); // template literal gone

    // Badge: 01
    expect(xml).toContain(">01<");

    // Timeline label
    expect(xml).toContain("TIDSLINJE \u00B7 FAS 1");

    // Section label (standalone FAS 1 — not part of a longer pattern)
    expect(xml).toContain("FAS 1");
  });

  it("phase 2 slide (clone 1) has FAS 2 AV 3, badge 02, and TIDSLINJE · FAS 2", async () => {
    const allSlides = await renderPhases();
    const slides = allSlides.filter((s) => s.includes("PHASE2_ACT1"));
    expect(slides.length).toBeGreaterThan(0);
    const xml = slides[0];

    expect(xml).toContain("FAS 2 AV 3");
    expect(xml).not.toContain("FAS 1 AV 4");

    // Badge: 02 (in its own text run)
    expect(xml).toContain(">02<");
    expect(xml).not.toContain(">01<");

    // Timeline label updated
    expect(xml).toContain("TIDSLINJE \u00B7 FAS 2");
    expect(xml).not.toContain("TIDSLINJE \u00B7 FAS 1");

    // Section label FAS 2
    expect(xml).toContain("FAS 2");
    expect(xml).not.toContain("FAS 1 AV");
  });

  it("phase 3 slide (clone 2) has FAS 3 AV 3, badge 03, and TIDSLINJE · FAS 3", async () => {
    const allSlides = await renderPhases();
    const slides = allSlides.filter((s) => s.includes("PHASE3_ACT1"));
    expect(slides.length).toBeGreaterThan(0);
    const xml = slides[0];

    expect(xml).toContain("FAS 3 AV 3");
    expect(xml).not.toContain("FAS 1 AV 4");

    expect(xml).toContain(">03<");
    expect(xml).not.toContain(">01<");

    expect(xml).toContain("TIDSLINJE \u00B7 FAS 3");
    expect(xml).not.toContain("TIDSLINJE \u00B7 FAS 1");
  });
});

// ---------------------------------------------------------------------------
// Test 5: Empty slots — unused activities/deliverables/decisions → no leftover {}
// ---------------------------------------------------------------------------

describe("phase-detail applicator — empty slot handling", () => {
  it("phase 2 (2 activities) has no leftover {Aktivitet 3} or {Aktivitet 4}", async () => {
    const allSlides = await renderPhases();
    const slides = allSlides.filter((s) => s.includes("PHASE2_ACT1"));
    expect(slides.length).toBeGreaterThan(0);
    const xml = slides[0];

    // These placeholders must be replaced (with empty string)
    expect(xml).not.toContain("{Aktivitet 3}");
    expect(xml).not.toContain("{Aktivitet 4}");
    expect(xml).not.toContain("{Leverans 3}");
  });

  it("phase 3 (3 activities, 1 deliverable) has no leftover placeholders", async () => {
    const allSlides = await renderPhases();
    const slides = allSlides.filter((s) => s.includes("PHASE3_ACT1"));
    expect(slides.length).toBeGreaterThan(0);
    const xml = slides[0];

    expect(xml).not.toContain("{Aktivitet 4}");
    expect(xml).not.toContain("{Leverans 2}");
    expect(xml).not.toContain("{Leverans 3}");
    expect(xml).not.toContain("{Beslut 2}");
    expect(xml).not.toContain("{Beslut 1");
  });
});

// ---------------------------------------------------------------------------
// Test 6a: Badge "01" replacement must not corrupt substrings in placeholder
// content (e.g. "ISO 27001" in an activity, date "2026-01-15", etc.)
// ---------------------------------------------------------------------------

describe("phase-detail applicator — badge replacement scope", () => {
  it("phase 2 slide preserves 'ISO 27001' in activity text (no substring corruption)", async () => {
    const sections: BidSection[] = [
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
              name: "Nulägesanalys",
              objective: "x",
              activities: ["PHASE1_FINGERPRINT intervjuer"],
              deliverables: ["rapport"],
              decisions: [],
              duration: "4 v",
              period: "M1\u2013M4",
            },
            {
              name: "Design",
              objective: "x",
              activities: [
                "PHASE2_FINGERPRINT Certifiering enligt ISO 27001",
              ],
              deliverables: ["systemdesign"],
              decisions: [],
              duration: "4 v",
              period: "M5\u2013M8",
            },
          ],
        },
      },
    ];

    const buf = await renderTemplate("anbudsmall-v2", sections, master);
    const zip = await JSZip.loadAsync(buf);
    const slides = await getAllSlideXml(zip);

    const phase2Slide = slides.find((s) => s.includes("PHASE2_FINGERPRINT"));
    expect(phase2Slide).toBeDefined();

    // The activity contains "ISO 27001" — the "01" substring must NOT be
    // rewritten to "02" by the badge replacement (which targets only the
    // standalone two-digit badge).
    expect(phase2Slide).toContain("ISO 27001");
    expect(phase2Slide).not.toContain("ISO 27002");

    // Badge itself still renders correctly as standalone "02".
    expect(phase2Slide).toContain(">02<");
  });
});

// ---------------------------------------------------------------------------
// Test 6: Footer applies on each clone
// ---------------------------------------------------------------------------

describe("phase-detail applicator — footer", () => {
  it("each phase slide has footer placeholders replaced", async () => {
    const allSlides = await renderPhases();

    for (const fingerprint of ["PHASE1_ACT1", "PHASE2_ACT1", "PHASE3_ACT1"]) {
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

// ---------------------------------------------------------------------------
// Test 7: Goal box (upper-right) — {Mål} replaced with phase.objective
// ---------------------------------------------------------------------------

describe("phase-detail applicator — goal box", () => {
  it("replaces {Mål} with phase.objective on each clone", async () => {
    const sections: BidSection[] = [
      {
        type: "data",
        key: "cover",
        title: "Cover",
        generatedAt: "2026-04-25",
        content: {
          format: "cover",
          title: "Testanbud",
          client: "TestKund",
          date: "2026-04-25",
        },
      },
      {
        type: "data",
        key: "phases",
        title: "Genomförande",
        generatedAt: "2026-04-25",
        content: {
          format: "phases",
          phases: [
            {
              name: "Fas A",
              objective: "OBJECTIVE_A_TEXT kartlägg nuläge",
              activities: ["GOAL_PHASE_A_FINGERPRINT akt"],
              deliverables: ["A2"],
              decisions: [],
              duration: "4 v",
              period: "M1\u2013M4",
            },
            {
              name: "Fas B",
              objective: "OBJECTIVE_B_TEXT leverera prototyp",
              activities: ["GOAL_PHASE_B_FINGERPRINT akt"],
              deliverables: ["B2"],
              decisions: [],
              duration: "4 v",
              period: "M5\u2013M8",
            },
          ],
        },
      },
    ];

    const buf = await renderTemplate("anbudsmall-v2", sections, master);
    const zip = await JSZip.loadAsync(buf);
    const slides = await getAllSlideXml(zip);

    // Identify each phase-detail slide by its unique activity fingerprint;
    // objective is also rendered on phases-overview (slide 6) so we can't
    // use it for slide identification.
    const phaseA = slides.find((s) => s.includes("GOAL_PHASE_A_FINGERPRINT"));
    const phaseB = slides.find((s) => s.includes("GOAL_PHASE_B_FINGERPRINT"));
    expect(phaseA).toBeDefined();
    expect(phaseB).toBeDefined();

    // Goal box on phase-detail slide contains the per-phase objective.
    expect(phaseA).toContain("OBJECTIVE_A_TEXT kartlägg nuläge");
    expect(phaseB).toContain("OBJECTIVE_B_TEXT leverera prototyp");

    // No leftover placeholder
    expect(phaseA).not.toContain("{M\u00e5l}");
    expect(phaseB).not.toContain("{M\u00e5l}");

    // Per-clone isolation: phase-detail slide A does NOT show phase B's objective.
    expect(phaseA).not.toContain("OBJECTIVE_B_TEXT");
    expect(phaseB).not.toContain("OBJECTIVE_A_TEXT");
  });
});

// ---------------------------------------------------------------------------
// Test 8: Risks box — {Risker} with red ⚠ icon per row
// ---------------------------------------------------------------------------

describe("phase-detail applicator — risks box", () => {
  it("renders one row per risk with red warning icon prefix", async () => {
    const sections: BidSection[] = [
      {
        type: "data",
        key: "cover",
        title: "Cover",
        generatedAt: "2026-04-25",
        content: {
          format: "cover",
          title: "Testanbud",
          client: "TestKund",
          date: "2026-04-25",
        },
      },
      {
        type: "data",
        key: "phases",
        title: "Genomförande",
        generatedAt: "2026-04-25",
        content: {
          format: "phases",
          phases: [
            {
              name: "Fas med risker",
              objective: "Adressera risker",
              activities: ["RISK_PHASE_FINGERPRINT akt"],
              deliverables: ["levarans"],
              decisions: [],
              duration: "4 v",
              period: "M1\u2013M4",
              risks: [
                "RISK_ROW_1 begränsad tillgång till nyckelpersoner",
                "RISK_ROW_2 leveransberoende från extern part",
              ],
            },
          ],
        },
      },
    ];

    const buf = await renderTemplate("anbudsmall-v2", sections, master);
    const zip = await JSZip.loadAsync(buf);
    const slides = await getAllSlideXml(zip);

    const xml = slides.find((s) => s.includes("RISK_PHASE_FINGERPRINT"));
    expect(xml).toBeDefined();

    // Both risks rendered
    expect(xml).toContain("RISK_ROW_1 begränsad tillgång till nyckelpersoner");
    expect(xml).toContain("RISK_ROW_2 leveransberoende från extern part");

    // Warning icon (U+26A0 + variation selector U+FE0E) present in the slide
    expect(xml).toContain("\u26A0\uFE0E");

    // Red color used for the icon run (Tailwind red-600 hex)
    expect(xml).toContain("DC2626");

    // No leftover placeholder
    expect(xml).not.toContain("{Risker}");
  });

  it("leaves {Risker} empty when phase has no risks", async () => {
    const sections: BidSection[] = [
      {
        type: "data",
        key: "cover",
        title: "Cover",
        generatedAt: "2026-04-25",
        content: {
          format: "cover",
          title: "Testanbud",
          client: "TestKund",
          date: "2026-04-25",
        },
      },
      {
        type: "data",
        key: "phases",
        title: "Genomförande",
        generatedAt: "2026-04-25",
        content: {
          format: "phases",
          phases: [
            {
              name: "Riskfri fas",
              objective: "objektiv",
              activities: ["NO_RISK_FINGERPRINT akt"],
              deliverables: ["lev"],
              decisions: [],
              duration: "4 v",
              period: "M1\u2013M4",
              // risks omitted
            },
          ],
        },
      },
    ];

    const buf = await renderTemplate("anbudsmall-v2", sections, master);
    const zip = await JSZip.loadAsync(buf);
    const slides = await getAllSlideXml(zip);

    const xml = slides.find((s) => s.includes("NO_RISK_FINGERPRINT"));
    expect(xml).toBeDefined();

    // Placeholder gone, no orphan icon character
    expect(xml).not.toContain("{Risker}");
    expect(xml).not.toContain("\u26A0\uFE0E");
  });
});
