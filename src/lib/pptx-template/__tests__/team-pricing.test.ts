// @vitest-environment node
/**
 * Task 9: Team-pricing applicator (slide 12).
 *
 * Pattern: render the full template, unzip output, find the slide by a
 * unique content fingerprint, then assert placeholder replacements.
 *
 * Slide 12 has 5 fixed consultant row slots + 1 summary row.
 * Number formatting: sv-SE locale (space as thousand separator).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import JSZip from "jszip";
import { renderTemplate } from "../loader";
import type { BidSection } from "../../types";
import type { MasterContext } from "../types";

const master: MasterContext = {
  companyName: "TeamPricingTestAB",
  clientName: "TestKund Stad",
  diaryNumber: "TP-2026-012",
  bidName: "Digitalisering team-pricing",
  bidDate: "2026-04-19",
};

async function getAllSlideXml(zip: JSZip): Promise<string[]> {
  const entries = Object.keys(zip.files).filter((f) =>
    /^ppt\/slides\/slide\d+\.xml$/.test(f),
  );
  return Promise.all(entries.map((e) => zip.file(e)!.async("text")));
}

/**
 * Find the team-pricing slide by the unique tab label "12 · TEAM" (middle dot U+00B7).
 * Exclude the template's original (unfilled) copy by requiring the absence of
 * "{Konsult 1" (the long-form row 1 placeholder).
 */
async function getTeamPricingXml(sections: BidSection[]): Promise<string> {
  const buf = await renderTemplate("anbudsmall-v2", sections, master);
  const zip = await JSZip.loadAsync(buf);
  const allXmls = await getAllSlideXml(zip);

  // Tab label unique to slide 12 in the template (middle dot U+00B7)
  const TAB_LABEL = "12 \u00b7 TEAM";
  // The unfilled placeholder — ABSENT on the applicator-processed copy
  const UNFILLED_ACTUAL = "{Konsult 1";

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

function make5MemberSection(): BidSection {
  return {
    type: "data",
    key: "team-pricing",
    title: "Team och pris",
    generatedAt: "2026-04-19",
    content: {
      format: "team-pricing",
      members: [
        {
          name: "MEMBER1_NAME Anna Eriksson",
          role: "MEMBER1_ROLE Projektledare",
          omfattningPct: 100,
          timpris: 1850,
          timmar: 240,
          total: 444000,
        },
        {
          name: "MEMBER2_NAME Bo Svensson",
          role: "MEMBER2_ROLE Systemarkitekt",
          omfattningPct: 80,
          timpris: 1600,
          timmar: 192,
          total: 307200,
        },
        {
          name: "MEMBER3_NAME Cecilia Lindqvist",
          role: "MEMBER3_ROLE Förändringsledare",
          omfattningPct: 50,
          timpris: 1400,
          timmar: 120,
          total: 168000,
        },
        {
          name: "MEMBER4_NAME David Persson",
          role: "MEMBER4_ROLE Testledare",
          omfattningPct: 60,
          timpris: 1200,
          timmar: 144,
          total: 172800,
        },
        {
          name: "MEMBER5_NAME Erik Johansson",
          role: "MEMBER5_ROLE Teknisk skribent",
          omfattningPct: 40,
          timpris: 1100,
          timmar: 96,
          total: 105600,
        },
      ],
    },
  };
}

function make3MemberSection(): BidSection {
  return {
    type: "data",
    key: "team-pricing",
    title: "Team och pris",
    generatedAt: "2026-04-19",
    content: {
      format: "team-pricing",
      members: [
        {
          name: "MEMBER1_NAME Anna Eriksson",
          role: "MEMBER1_ROLE Projektledare",
          omfattningPct: 100,
          timpris: 1850,
          timmar: 240,
          total: 444000,
        },
        {
          name: "MEMBER2_NAME Bo Svensson",
          role: "MEMBER2_ROLE Systemarkitekt",
          omfattningPct: 80,
          timpris: 1600,
          timmar: 192,
          total: 307200,
        },
        {
          name: "MEMBER3_NAME Cecilia Lindqvist",
          role: "MEMBER3_ROLE Förändringsledare",
          omfattningPct: 50,
          timpris: 1400,
          timmar: 120,
          total: 168000,
        },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Test 1: 5 members — all rows filled
// ---------------------------------------------------------------------------

describe("team-pricing applicator — 5 members", () => {
  it("fills all 5 consultant rows with name, role, and numbers", async () => {
    const sections = makeMinimalSections([make5MemberSection()]);
    const xml = await getTeamPricingXml(sections);

    expect(xml).toContain("MEMBER1_NAME Anna Eriksson");
    expect(xml).toContain("MEMBER1_ROLE Projektledare");
    expect(xml).toContain("MEMBER2_NAME Bo Svensson");
    expect(xml).toContain("MEMBER2_ROLE Systemarkitekt");
    expect(xml).toContain("MEMBER3_NAME Cecilia Lindqvist");
    expect(xml).toContain("MEMBER3_ROLE Förändringsledare");
    expect(xml).toContain("MEMBER4_NAME David Persson");
    expect(xml).toContain("MEMBER4_ROLE Testledare");
    expect(xml).toContain("MEMBER5_NAME Erik Johansson");
    expect(xml).toContain("MEMBER5_ROLE Teknisk skribent");

    // No leftover placeholders
    expect(xml).not.toContain("{Konsult 1");
    expect(xml).not.toContain("{Konsult 2");
    expect(xml).not.toContain("{Konsult 3");
    expect(xml).not.toContain("{Konsult 4");
    expect(xml).not.toContain("{Konsult 5");
    expect(xml).not.toContain("{Roll 1}");
    expect(xml).not.toContain("{Roll 2}");
    expect(xml).not.toContain("{Roll 3}");
    expect(xml).not.toContain("{Roll 4}");
    expect(xml).not.toContain("{Roll 5}");
    expect(xml).not.toContain("{Timpris 1}");
    expect(xml).not.toContain("{Timmar 1}");
    expect(xml).not.toContain("{Total 1}");
    expect(xml).not.toContain("{Summa timmar}");
    expect(xml).not.toContain("{Anbudspris totalt}");
  });
});

// ---------------------------------------------------------------------------
// Test 2: 3 members — slots 4–5 replaced with empty string
// ---------------------------------------------------------------------------

describe("team-pricing applicator — 3 members", () => {
  it("fills rows 1–3 and replaces rows 4–5 placeholders with empty string", async () => {
    const sections = makeMinimalSections([make3MemberSection()]);
    const xml = await getTeamPricingXml(sections);

    // Rows 1–3 filled
    expect(xml).toContain("MEMBER1_NAME Anna Eriksson");
    expect(xml).toContain("MEMBER2_NAME Bo Svensson");
    expect(xml).toContain("MEMBER3_NAME Cecilia Lindqvist");

    // Rows 4–5: no leftover placeholder text
    expect(xml).not.toContain("{Konsult 4");
    expect(xml).not.toContain("{Konsult 5");
    expect(xml).not.toContain("{Roll 4}");
    expect(xml).not.toContain("{Roll 5}");
    expect(xml).not.toContain("{Timpris 4}");
    expect(xml).not.toContain("{Timpris 5}");
    expect(xml).not.toContain("{Timmar 4}");
    expect(xml).not.toContain("{Timmar 5}");
    expect(xml).not.toContain("{Total 4}");
    expect(xml).not.toContain("{Total 5}");
    expect(xml).not.toContain("{Omfattning 4 %}");
    expect(xml).not.toContain("{Omfattning 5 %}");
  });
});

// ---------------------------------------------------------------------------
// Test 3: Summary computation — sum of timmar and total price correct
// ---------------------------------------------------------------------------

describe("team-pricing applicator — summary computation", () => {
  it("computes summa timmar and anbudspris totalt from members", async () => {
    // 5 members: 240+192+120+144+96 = 792 timmar
    // totals: 444000+307200+168000+172800+105600 = 1197600
    const sections = makeMinimalSections([make5MemberSection()]);
    const xml = await getTeamPricingXml(sections);

    expect(xml).toContain("792");       // Summa timmar (plain integer)
    // sv-SE locale: 1 197 600 — space separator (regular space, not nbsp)
    expect(xml).toContain("1 197 600");
  });

  it("computes 3-member summary correctly (552 timmar, 919 200 kr)", async () => {
    // 3 members: 240+192+120 = 552 timmar; 444000+307200+168000 = 919200
    const sections = makeMinimalSections([make3MemberSection()]);
    const xml = await getTeamPricingXml(sections);

    expect(xml).toContain("552");
    // 919 200 with sv-SE (space or non-breaking space)
    expect(xml).toMatch(/919[\s\u00a0]200/);
  });
});

// ---------------------------------------------------------------------------
// Test 4: Number formatting — sv-SE locale for {Total N}
// ---------------------------------------------------------------------------

describe("team-pricing applicator — number formatting", () => {
  it("{Total 1} uses sv-SE thousand separator (444 000 style)", async () => {
    const sections = makeMinimalSections([make5MemberSection()]);
    const xml = await getTeamPricingXml(sections);

    // 444000 → "444 000" (space or non-breaking space)
    expect(xml).toMatch(/444[\s\u00a0]000/);
  });

  it("{Timmar N} is plain integer without thousand separator", async () => {
    const sections = makeMinimalSections([make5MemberSection()]);
    const xml = await getTeamPricingXml(sections);

    // 240 hours — no formatting needed, appears as-is
    expect(xml).toContain("240");
    expect(xml).toContain("192");
    expect(xml).toContain("120");
  });

  it("{Omfattning N %} includes percent sign", async () => {
    const sections = makeMinimalSections([make5MemberSection()]);
    const xml = await getTeamPricingXml(sections);

    expect(xml).toContain("100%");
    expect(xml).toContain("80%");
    expect(xml).toContain("50%");
  });
});

// ---------------------------------------------------------------------------
// Test 5: Footer applied with correct counter
// ---------------------------------------------------------------------------

describe("team-pricing applicator — footer", () => {
  it("replaces {Bolagsnamn}, {Diarienummer} and slide counter", async () => {
    const sections = makeMinimalSections([make5MemberSection()]);
    const xml = await getTeamPricingXml(sections);

    expect(xml).toContain("TeamPricingTestAB");
    expect(xml).toContain("TP-2026-012");
    expect(xml).not.toContain("{Bolagsnamn}");
    expect(xml).not.toContain("{Diarienummer}");
    // Slide counter pattern gone (template has "12 / 17")
    expect(xml).not.toContain("12 / 17");
  });
});
