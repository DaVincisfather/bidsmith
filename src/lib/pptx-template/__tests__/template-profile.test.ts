import { describe, it, expect } from "vitest";
import {
  parseTemplateProfile,
  TemplateProfileSchema,
  isForeignProfile,
  hasMappedTable,
  type TemplateProfile,
  type TableMap,
} from "../template-profile";

// A representative profile for our own anbudsmall-v2: one slide profile per
// content slide, covering every capability, every format, cloneFrom, budgets,
// and each status. Proves the datamodel can describe our template end-to-end.
const anbudsmallV2Profile: TemplateProfile = {
  profileVersion: 1,
  templateId: "00000000-0000-0000-0000-000000000001",
  name: "anbudsmall-v2",
  version: 1,
  slides: [
    {
      source: 1,
      slots: [
        { placeholder: "{Kundnamn}", capability: "cover", format: "field", intent: "", status: "mapped" },
        { placeholder: "{Upphandlingens namn}", capability: "cover", format: "field", intent: "", status: "mapped" },
        { placeholder: "{Anbudsdatum}", capability: "cover", format: "field", intent: "", status: "mapped" },
      ],
    },
    { source: 2, slots: [{ placeholder: "{Innehåll}", capability: "toc", format: "field", intent: "", status: "mapped" }] },
    {
      source: 3,
      slots: [
        { placeholder: "{Nuläge}", capability: "understanding", format: "prose", intent: "Kundens nuläge", budgetChars: 600, status: "mapped" },
        { placeholder: "{Smärtpunkter}", capability: "understanding", format: "bullets", intent: "Smärtpunkter", budgetChars: 300, status: "mapped" },
      ],
    },
    {
      source: 6,
      slots: [{ placeholder: "{Fas 1 — namn}", capability: "execution-plan", format: "field", intent: "", budgetChars: 40, status: "mapped" }],
    },
    {
      source: 7,
      cloneFrom: "execution-plan",
      slots: [
        { placeholder: "{Aktiviteter}", capability: "execution-plan", format: "bullets", intent: "", budgetChars: 120, status: "mapped" },
        { placeholder: "{Leveranser}", capability: "execution-plan", format: "bullets", intent: "", budgetChars: 100, status: "mapped" },
      ],
    },
    {
      source: 11,
      slots: [
        { placeholder: "{QA-process}", capability: "quality-assurance", format: "prose", intent: "", status: "mapped" },
        { placeholder: "{Avstämning 1 — tidpunkt och innehåll}", capability: "quality-assurance", format: "field", intent: "", budgetChars: 80, status: "mapped" },
      ],
    },
    { source: 12, slots: [{ placeholder: "{Konsult 1 — namn}", capability: "team-pricing", format: "table-rows", intent: "", status: "mapped" }] },
    {
      source: 13,
      cloneFrom: "requirement-matrix",
      slots: [{ placeholder: "{Ska-krav 1 — formulering enligt upphandlingsunderlag}", capability: "requirement-matrix", format: "table-rows", intent: "", status: "mapped" }],
    },
    {
      source: 14,
      cloneFrom: "references",
      slots: [{ placeholder: "{Referens 1 — kundnamn}", capability: "references", format: "field", intent: "", status: "mapped" }],
    },
    { source: 16, slots: [{ placeholder: "{OSL kap X §Y}", capability: "secrecy", format: "table-rows", intent: "", status: "mapped" }] },
    { source: 17, slots: [{ placeholder: "{Certifikatnummer}", capability: "certifications", format: "field", intent: "", status: "mapped" }] },
    // A novel, unknown section a customer template might add → generic-prose.
    { source: 18, slots: [{ placeholder: "{Hållbarhetsredogörelse}", capability: "generic-prose", format: "prose", intent: "Beskriv hållbarhetsarbetet relevant för uppdraget", budgetChars: 500, status: "generic" }] },
    // A slot the customer chose to leave blank.
    { source: 19, slots: [{ placeholder: "{Valfri kommentar}", capability: "static", format: "field", intent: "", status: "skip" }] },
  ],
};

describe("TemplateProfile schema", () => {
  it("round-trips a full anbudsmall-v2 profile without loss", () => {
    const parsed = parseTemplateProfile(anbudsmallV2Profile);
    const reparsed = parseTemplateProfile(JSON.parse(JSON.stringify(parsed)));
    expect(reparsed).toEqual(anbudsmallV2Profile);
  });

  it("covers every capability, format and status in the fixture", () => {
    const slots = anbudsmallV2Profile.slides.flatMap((s) => s.slots);
    expect(new Set(slots.map((s) => s.capability))).toContain("generic-prose");
    expect(new Set(slots.map((s) => s.format))).toEqual(
      new Set(["field", "prose", "bullets", "table-rows"]),
    );
    expect(new Set(slots.map((s) => s.status))).toEqual(
      new Set(["mapped", "generic", "skip"]),
    );
  });

  it("rejects an unknown capability", () => {
    const bad = structuredClone(anbudsmallV2Profile);
    (bad.slides[0].slots[0] as { capability: string }).capability = "nonsense";
    expect(() => parseTemplateProfile(bad)).toThrow();
  });

  it("rejects an empty slides array", () => {
    expect(() => parseTemplateProfile({ ...anbudsmallV2Profile, slides: [] })).toThrow();
  });

  it("rejects a non-v1 profileVersion", () => {
    expect(TemplateProfileSchema.safeParse({ ...anbudsmallV2Profile, profileVersion: 2 }).success).toBe(false);
  });

  it("rejects a zero/negative budgetChars", () => {
    const bad = structuredClone(anbudsmallV2Profile);
    (bad.slides[2].slots[0] as { budgetChars: number }).budgetChars = 0;
    expect(() => parseTemplateProfile(bad)).toThrow();
  });
});

describe("measurement + knownDefects (onboarding-measure)", () => {
  const base = {
    profileVersion: 1, templateId: "t1", name: "T", version: 1,
    slides: [{ source: 1, slots: [] }],
  };

  it("parses a legacy profile without the new fields unchanged", () => {
    const out = TemplateProfileSchema.parse(base);
    expect(out.measurement).toBeUndefined();
    expect(out.knownDefects).toBeUndefined();
  });

  it("round-trips measurement and knownDefects", () => {
    const out = TemplateProfileSchema.parse({
      ...base,
      measurement: {
        status: "complete", measuredAt: "2026-07-19T10:00:00Z",
        calibrationRounds: 6, unresolved: ["{X}"],
        slotWarnings: { "{Y}": ["overflowed at minimum budget — box likely tiny or decorative"] },
      },
      knownDefects: [{
        slide: 2, checkId: "vertical-overflow", shape: "Text 36",
        note: "tom originalmall", suggestion: "Bredda boxen eller acceptera.",
        status: "accepted", baselineBoundHeightPt: 43.2,
      }],
    });
    expect(out.measurement?.calibrationRounds).toBe(6);
    expect(out.knownDefects?.[0].status).toBe("accepted");
  });

  it("rejects an unknown defect status", () => {
    expect(() => TemplateProfileSchema.parse({
      ...base,
      knownDefects: [{ slide: 1, checkId: "outside-slide", shape: "Text 1", note: "", suggestion: "s", status: "maybe" }],
    })).toThrow();
  });
});

describe("tableMap on SlideProfile (foreign a:tbl matrix)", () => {
  const base = {
    profileVersion: 1, templateId: "t1", name: "T", version: 1,
    slides: [{ source: 1, slots: [] }],
  };
  const tableMap: TableMap = {
    frameIndex: 0,
    headerRows: 1,
    templateRowIndex: 1,
    columns: ["krav", "uppfyllnad", "referens"],
  };

  it("round-trips a slide carrying a tableMap", () => {
    const withTableMap = {
      ...base,
      slides: [{ source: 5, capability: "requirement-matrix" as const, slots: [], tableMap }],
    };
    const parsed = parseTemplateProfile(withTableMap);
    const reparsed = parseTemplateProfile(JSON.parse(JSON.stringify(parsed)));
    expect(reparsed).toEqual(withTableMap);
    expect(reparsed.slides[0].tableMap?.columns).toEqual(["krav", "uppfyllnad", "referens"]);
  });

  it("parses a legacy profile (no tableMap) unchanged — the field stays absent", () => {
    const out = TemplateProfileSchema.parse(base);
    expect(out.slides[0].tableMap).toBeUndefined();
  });

  it("rejects an unknown column role", () => {
    const bad = {
      ...base,
      slides: [{ source: 5, slots: [], tableMap: { ...tableMap, columns: ["krav", "nonsense"] } }],
    };
    expect(() => parseTemplateProfile(bad)).toThrow();
  });

  it("rejects an empty columns array", () => {
    const bad = {
      ...base,
      slides: [{ source: 5, slots: [], tableMap: { ...tableMap, columns: [] } }],
    };
    expect(() => parseTemplateProfile(bad)).toThrow();
  });
});

describe("isForeignProfile", () => {
  const genericSlide = {
    source: 1, capability: "generic-prose" as const,
    slots: [{ placeholder: "{A}", capability: "generic-prose" as const, format: "prose" as const, intent: "i", status: "generic" as const }],
  };
  const staticSlide = { source: 2, capability: "static" as const, slots: [] };
  const matrixTableMap: TableMap = { frameIndex: 0, headerRows: 1, templateRowIndex: 1, columns: ["krav", "uppfyllnad"] };

  it("returns true for a pure generic-prose/static profile", () => {
    const profile: TemplateProfile = {
      profileVersion: 1, templateId: "t1", name: "kundmall", version: 1,
      slides: [genericSlide, staticSlide],
    };
    expect(isForeignProfile(profile)).toBe(true);
  });

  it("returns true for generic-prose + a requirement-matrix slide WITH tableMap", () => {
    const profile: TemplateProfile = {
      profileVersion: 1, templateId: "t1", name: "kundmall", version: 1,
      slides: [
        genericSlide,
        { source: 3, capability: "requirement-matrix", slots: [], tableMap: matrixTableMap },
      ],
    };
    expect(isForeignProfile(profile)).toBe(true);
  });

  it("returns false for a requirement-matrix slide WITHOUT tableMap (our bundled template)", () => {
    const profile: TemplateProfile = {
      profileVersion: 1, templateId: "t1", name: "kundmall", version: 1,
      slides: [
        genericSlide,
        { source: 3, capability: "requirement-matrix", slots: [] },
      ],
    };
    expect(isForeignProfile(profile)).toBe(false);
  });

  it("returns false for a mixed specialised profile (our own template)", () => {
    const profile: TemplateProfile = {
      profileVersion: 1, templateId: "t1", name: "anbudsmall-v2", version: 1,
      slides: [
        { source: 1, slots: [{ placeholder: "{Kundnamn}", capability: "cover", format: "field", intent: "", status: "mapped" }] },
        { source: 3, slots: [{ placeholder: "{Nuläge}", capability: "understanding", format: "prose", intent: "", status: "mapped" }] },
      ],
    };
    expect(isForeignProfile(profile)).toBe(false);
  });
});

describe("hasMappedTable", () => {
  const matrixTableMap: TableMap = { frameIndex: 0, headerRows: 1, templateRowIndex: 1, columns: ["krav", "status"] };

  it("returns true when a slide carries capability requirement-matrix AND tableMap", () => {
    const profile: TemplateProfile = {
      profileVersion: 1, templateId: "t1", name: "kundmall", version: 1,
      slides: [{ source: 1, capability: "requirement-matrix", slots: [], tableMap: matrixTableMap }],
    };
    expect(hasMappedTable(profile)).toBe(true);
  });

  it("returns false when the matrix slide has no tableMap", () => {
    const profile: TemplateProfile = {
      profileVersion: 1, templateId: "t1", name: "kundmall", version: 1,
      slides: [{ source: 1, capability: "requirement-matrix", slots: [] }],
    };
    expect(hasMappedTable(profile)).toBe(false);
  });

  it("returns false when no slide has capability requirement-matrix", () => {
    const profile: TemplateProfile = {
      profileVersion: 1, templateId: "t1", name: "kundmall", version: 1,
      slides: [{ source: 1, capability: "generic-prose", slots: [] }],
    };
    expect(hasMappedTable(profile)).toBe(false);
  });
});
