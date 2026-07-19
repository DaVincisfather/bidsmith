import { describe, it, expect } from "vitest";
import type { SlideShapes, TableShape } from "../../introspect/read-pptx";
import type { ProposedSlot } from "../propose-injection-plan";
import type { TableColumnRole } from "../../template-profile";
import { TemplateManifestSchema } from "../../manifest-types";
import {
  buildDraft,
  applyDecision,
  buildInjections,
  buildFinalProfile,
  buildForeignManifest,
  applySlideDecision,
  fastSlideSources,
  applyTableDecision,
} from "../draft-logic";
import { parseOnboardingDraft } from "../draft";

const SIZE = { cx: 12192000, cy: 6858000 };

function shape(
  text: string,
  geometry: { x: number; y: number; cx: number; cy: number } | null = { x: 0, y: 0, cx: 100, cy: 100 },
  inGroup = false,
) {
  return {
    paragraphs: [text],
    tokens: [],
    geometry,
    fontSizePt: 18,
    lineSpacingPct: null,
    autofit: null,
    inGroup,
  };
}

const slides: SlideShapes[] = [
  { source: 1, shapes: [shape("Rubrik"), shape("Beskriv er metod")], tokens: [], images: { placed: 0, placeholders: 0 }, tables: [] },
  { source: 2, shapes: [shape("Statisk footer")], tokens: [], images: { placed: 0, placeholders: 0 }, tables: [] },
];

function table(
  frameIndex: number,
  gridColsEmu: number[],
  rows: { heightEmu: number; cells: string[] }[],
  geometry: { xEmu: number; yEmu: number; cxEmu: number; cyEmu: number } | null = {
    xEmu: 0, yEmu: 0, cxEmu: 100, cyEmu: 100,
  },
): TableShape {
  return {
    frameIndex,
    geometry,
    gridColsEmu,
    rows: rows.map((r) => ({ heightEmu: r.heightEmu, cells: r.cells.map((text) => ({ text })) })),
  };
}

// Slide 3: en kravmatris-kandidat — inga p:sp-textrutor alls (bara ett a:tbl),
// vilket är exakt hur Task 3-fixturens tabellslide ser ut.
const tableSlide: SlideShapes = {
  source: 3,
  shapes: [],
  tokens: [],
  images: { placed: 0, placeholders: 0 },
  tables: [
    table(0, [400, 300], [
      { heightEmu: 10, cells: ["Krav", "Uppfyllnad"] },
      { heightEmu: 10, cells: ["Exempel krav", "Ja — se referens"] },
    ]),
  ],
};

const VALID_TABLE_INPUT: {
  source: number; frameIndex: number; headerRows: number; templateRowIndex: number;
  columns: TableColumnRole[];
} = {
  source: 3, frameIndex: 0, headerRows: 1, templateRowIndex: 1,
  columns: ["krav", "uppfyllnad"],
};

// Slide 4: samma kravmatris-kandidat men med ärvd/saknad xfrm (geometry: null)
// — computeTablePages kan inte pagineras säkert utan bordets topp-position.
const geometrylessTableSlide: SlideShapes = {
  source: 4,
  shapes: [],
  tokens: [],
  images: { placed: 0, placeholders: 0 },
  tables: [
    table(0, [400, 300], [
      { heightEmu: 10, cells: ["Krav", "Uppfyllnad"] },
      { heightEmu: 10, cells: ["Exempel krav", "Ja — se referens"] },
    ], null),
  ],
};

const proposal: ProposedSlot[] = [
  {
    source: 1,
    shapeIndex: 1,
    shapeText: "Beskriv er metod",
    token: "{Metod}",
    capability: "understanding",
    intent: "Leverantörens metodbeskrivning",
    confidence: "high",
  },
  {
    source: 2,
    shapeIndex: 0,
    shapeText: "Statisk footer",
    token: "{Footer}",
    capability: "generic-prose",
    intent: "Oklart",
    confidence: "low",
  },
];

describe("buildDraft", () => {
  it("hög konfidens förbekräftas, låg blir pending", () => {
    const draft = buildDraft(proposal, slides, SIZE);
    expect(draft.slots[0].decision).toBe("confirmed");
    expect(draft.slots[1].decision).toBe("pending");
  });

  it("wireframen täcker ALLA slides och markerar kandidater", () => {
    const draft = buildDraft(proposal, slides, SIZE);
    expect(draft.wireframe).toHaveLength(2);
    expect(draft.wireframe[0].shapes[0].candidate).toBe(false); // Rubrik
    expect(draft.wireframe[0].shapes[1].candidate).toBe(true);
  });

  it("trunkerar wireframe-text till 120 tecken", () => {
    const long = "x".repeat(500);
    const draft = buildDraft(
      proposal,
      [
        { ...slides[0], shapes: [shape(long), shape("Beskriv er metod")] },
        slides[1],
      ],
      SIZE,
    );
    expect(draft.wireframe[0].shapes[0].text).toHaveLength(120);
  });

  it("hög-konfidens static/toc förbekräftas ALDRIG (ska inte fyllas → pending)", () => {
    // static/toc = kundens footer/innehållsförteckning. En förbockad sådan blir
    // tyst AI-överskriven om användaren klickar igenom — kräver aktivt beslut.
    const staticToc: ProposedSlot[] = [
      { source: 1, shapeIndex: 0, shapeText: "Footer", token: "{Footer}",
        capability: "static", intent: "footer", confidence: "high" },
      { source: 1, shapeIndex: 1, shapeText: "Innehåll", token: "{Toc}",
        capability: "toc", intent: "innehållsförteckning", confidence: "high" },
      { source: 2, shapeIndex: 0, shapeText: "Metod", token: "{Metod}",
        capability: "understanding", intent: "metod", confidence: "high" },
    ];
    const draft = buildDraft(
      staticToc,
      [
        { ...slides[0], shapes: [shape("Footer"), shape("Innehåll")] },
        { ...slides[1], shapes: [shape("Metod")] },
      ],
      SIZE,
    );
    const byToken = Object.fromEntries(draft.slots.map((s) => [s.token, s.decision]));
    expect(byToken["{Footer}"]).toBe("pending");
    expect(byToken["{Toc}"]).toBe("pending");
    // En vanlig hög-konfidens-slot förbekräftas fortfarande.
    expect(byToken["{Metod}"]).toBe("confirmed");
  });

  it("grupperade shapes (inGroup) får wireframe-geometri null — hamnar i 'utan position'", () => {
    // Grupp-lokal xfrm ritas fel/utanför viewBoxen. read-pptx behåller geometrin
    // (index oförändrade), men wireframe-bygget droppar den för inGroup-shapes.
    const grouped = [
      {
        ...slides[0],
        shapes: [
          shape("Rubrik", { x: 0, y: 0, cx: 100, cy: 100 }, true), // inGroup
          shape("Beskriv er metod", { x: 0, y: 0, cx: 100, cy: 100 }, false),
        ],
      },
      slides[1],
    ];
    const draft = buildDraft(proposal, grouped, SIZE);
    expect(draft.wireframe[0].shapes[0].geometry).toBeNull(); // inGroup droppad
    expect(draft.wireframe[0].shapes[1].geometry).not.toBeNull();
    // Kandidat-index oförändrade (shapeIndex 1 är fortfarande kandidaten).
    expect(draft.wireframe[0].shapes[1].shapeIndex).toBe(1);
    expect(draft.wireframe[0].shapes[1].candidate).toBe(true);
  });
});

describe("buildDraft — tabeller", () => {
  const slidesWithTable = [...slides, tableSlide];

  it("kopierar SlideShapes.tables in i utkastet (normaliserad geometri, cellTexts)", () => {
    const draft = buildDraft(proposal, slidesWithTable, SIZE);
    expect(draft.tables).toHaveLength(1);
    const t = draft.tables![0];
    expect(t.source).toBe(3);
    expect(t.frameIndex).toBe(0);
    expect(t.gridColsEmu).toEqual([400, 300]);
    expect(t.geometry).toEqual({ x: 0, y: 0, cx: 100, cy: 100 });
    expect(t.rows).toEqual([
      { heightEmu: 10, cellTexts: ["Krav", "Uppfyllnad"] },
      { heightEmu: 10, cellTexts: ["Exempel krav", "Ja — se referens"] },
    ]);
    expect(t.decision).toBeUndefined();
  });

  it("mallar utan tabeller ger en tom tables-array (inte undefined)", () => {
    const draft = buildDraft(proposal, slides, SIZE);
    expect(draft.tables).toEqual([]);
  });

  it("null-geometri (ärvd/saknad xfrm) bärs igenom som null", () => {
    const noGeom: SlideShapes = { ...tableSlide, tables: [table(0, [100], [{ heightEmu: 5, cells: ["x"] }], null)] };
    const draft = buildDraft(proposal, [...slides, noGeom], SIZE);
    expect(draft.tables![0].geometry).toBeNull();
  });
});

describe("buildForeignManifest", () => {
  it("bygger ett schemagiltigt minimalt manifest — en static-slide per wireframe-slide", () => {
    const draft = buildDraft(proposal, slides, SIZE);
    const manifest = buildForeignManifest(draft, "kundmall");
    // Fail-loud-validering (buildForeignManifest parse:ar redan, dubbelkolla här).
    expect(() => TemplateManifestSchema.parse(manifest)).not.toThrow();
    expect(manifest.name).toBe("kundmall");
    expect(manifest.slides).toHaveLength(draft.wireframe.length);
    expect(manifest.slides.every((s) => s.type === "static")).toBe(true);
    expect(manifest.slides.map((s) => s.source)).toEqual(
      draft.wireframe.map((w) => w.source),
    );
  });
});

describe("applyDecision", () => {
  const draft = buildDraft(proposal, slides, SIZE);

  it("bekräftar och redigerar token + intent", () => {
    const res = applyDecision(draft, {
      source: 2, shapeIndex: 0, decision: "confirmed",
      token: "{Sammanfattning}", intent: "Kort sammanfattning av anbudet",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const slot = res.draft.slots.find((s) => s.source === 2)!;
      expect(slot.token).toBe("{Sammanfattning}");
      expect(slot.decision).toBe("confirmed");
    }
  });

  it("avvisar okänd adress", () => {
    const res = applyDecision(draft, { source: 9, shapeIndex: 0, decision: "skipped" });
    expect(res.ok).toBe(false);
  });

  it("avvisar ogiltigt tokenformat", () => {
    const res = applyDecision(draft, {
      source: 1, shapeIndex: 1, decision: "confirmed", token: "utan-klamrar",
    });
    expect(res.ok).toBe(false);
  });

  it("avvisar token-kollision med annan slot", () => {
    const res = applyDecision(draft, {
      source: 2, shapeIndex: 0, decision: "confirmed", token: "{Metod}",
    });
    expect(res.ok).toBe(false);
  });

  it("muterar inte input-utkastet", () => {
    const before = structuredClone(draft);
    applyDecision(draft, { source: 1, shapeIndex: 1, decision: "skipped" });
    expect(draft).toEqual(before);
  });
});

describe("applyTableDecision", () => {
  const draft = buildDraft(proposal, [...slides, tableSlide, geometrylessTableSlide], SIZE);

  it("avvisar bekräftelse av en tabell utan geometri (ärvd xfrm — kan inte pagineras säkert)", () => {
    const res = applyTableDecision(draft, { ...VALID_TABLE_INPUT, source: 4 });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe(
      "tabellen saknar läsbar position i mallen — kan inte pagineras säkert; lämna den statisk",
    );
  });

  it("bekräftar en giltig kolumnkarta — sätter confirmed=true", () => {
    const res = applyTableDecision(draft, VALID_TABLE_INPUT);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.draft.tables![0].decision).toEqual({
        headerRows: 1, templateRowIndex: 1, columns: ["krav", "uppfyllnad"], confirmed: true,
      });
    }
  });

  it("avvisar okänd tabell (fel source/frameIndex)", () => {
    const res = applyTableDecision(draft, { ...VALID_TABLE_INPUT, frameIndex: 9 });
    expect(res.ok).toBe(false);
  });

  it("avvisar noll krav-kolumner", () => {
    const res = applyTableDecision(draft, { ...VALID_TABLE_INPUT, columns: ["uppfyllnad", "uppfyllnad"] });
    expect(res.ok).toBe(false);
  });

  it("avvisar två krav-kolumner", () => {
    const res = applyTableDecision(draft, { ...VALID_TABLE_INPUT, columns: ["krav", "krav"] });
    expect(res.ok).toBe(false);
  });

  it("avvisar avsaknad av uppfyllnad/status-kolumn", () => {
    const res = applyTableDecision(draft, { ...VALID_TABLE_INPUT, columns: ["krav", "referens"] });
    expect(res.ok).toBe(false);
  });

  it("uppfyllnad ELLER status räcker — status ensam är giltigt", () => {
    const res = applyTableDecision(draft, { ...VALID_TABLE_INPUT, columns: ["krav", "status"] });
    expect(res.ok).toBe(true);
  });

  it("avvisar mallrad som ligger i rubrikraderna (templateRowIndex < headerRows)", () => {
    const res = applyTableDecision(draft, { ...VALID_TABLE_INPUT, headerRows: 2, templateRowIndex: 1 });
    expect(res.ok).toBe(false);
  });

  it("avvisar mallradsindex utanför tabellens radantal", () => {
    const res = applyTableDecision(draft, { ...VALID_TABLE_INPUT, templateRowIndex: 5 });
    expect(res.ok).toBe(false);
  });

  it("avvisar kolumnantal som inte matchar gridColsEmu", () => {
    const res = applyTableDecision(draft, { ...VALID_TABLE_INPUT, columns: ["krav"] });
    expect(res.ok).toBe(false);
  });

  it("muterar inte input-utkastet", () => {
    const before = structuredClone(draft);
    applyTableDecision(draft, VALID_TABLE_INPUT);
    expect(draft).toEqual(before);
  });
});

describe("buildInjections + buildFinalProfile", () => {
  it("endast bekräftade slots blir injektioner", () => {
    const draft = buildDraft(proposal, slides, SIZE); // slot 1 confirmed, slot 2 pending
    expect(buildInjections(draft)).toEqual([
      { source: 1, shapeIndex: 1, token: "{Metod}" },
    ]);
  });

  it("slutprofilen: bekräftade slots generic-prose, resten static — validerar mot schemat", () => {
    const draft = buildDraft(proposal, slides, SIZE);
    const profile = buildFinalProfile(draft, { templateId: "t-1", name: "kundmall", version: 1 });
    expect(profile.slides).toHaveLength(2);
    expect(profile.slides[0].capability).toBe("generic-prose");
    expect(profile.slides[0].slots[0]).toMatchObject({
      placeholder: "{Metod}", capability: "generic-prose", format: "prose", status: "generic",
    });
    expect(profile.slides[1].capability).toBe("static");
    expect(profile.slides[1].slots).toEqual([]);
  });

  it("kastar vid noll bekräftade slots", () => {
    const draft = buildDraft(proposal, slides, SIZE);
    const allSkipped = {
      ...draft,
      slots: draft.slots.map((s) => ({ ...s, decision: "skipped" as const })),
    };
    expect(() =>
      buildFinalProfile(allSkipped, { templateId: "t-1", name: "kundmall", version: 1 }),
    ).toThrow("minst en textruta måste bekräftas");
  });
});

describe("buildFinalProfile — tabeller", () => {
  it("bekräftad tabell blir requirement-matrix + tableMap på rätt slide", () => {
    const draft = buildDraft(proposal, [...slides, tableSlide], SIZE);
    const decided = applyTableDecision(draft, VALID_TABLE_INPUT);
    if (!decided.ok) throw new Error(decided.error);
    const profile = buildFinalProfile(decided.draft, { templateId: "t-1", name: "kundmall", version: 1 });
    const tableProfileSlide = profile.slides.find((s) => s.source === 3)!;
    expect(tableProfileSlide.capability).toBe("requirement-matrix");
    expect(tableProfileSlide.slots).toEqual([]);
    expect(tableProfileSlide.tableMap).toEqual({
      frameIndex: 0, headerRows: 1, templateRowIndex: 1, columns: ["krav", "uppfyllnad"],
    });
    // Övriga slides oberörda — samma static/generic-prose-beteende som förut.
    expect(profile.slides.find((s) => s.source === 1)!.capability).toBe("generic-prose");
    expect(profile.slides.find((s) => s.source === 2)!.capability).toBe("static");
  });

  it("obekräftad tabell (ingen decision) → sliden förblir static — dagens beteende", () => {
    const draft = buildDraft(proposal, [...slides, tableSlide], SIZE);
    const profile = buildFinalProfile(draft, { templateId: "t-1", name: "kundmall", version: 1 });
    const tableProfileSlide = profile.slides.find((s) => s.source === 3)!;
    expect(tableProfileSlide.capability).toBe("static");
    expect(tableProfileSlide.tableMap).toBeUndefined();
  });

  it("en bekräftad tabell räcker för att bygga profilen — inga bekräftade textrutor behövs", () => {
    const draft = buildDraft([], [...slides, tableSlide], SIZE); // inga slots alls
    const decided = applyTableDecision(draft, VALID_TABLE_INPUT);
    if (!decided.ok) throw new Error(decided.error);
    expect(() =>
      buildFinalProfile(decided.draft, { templateId: "t-1", name: "kundmall", version: 1 }),
    ).not.toThrow();
  });
});

describe("applySlideDecision", () => {
  const draft = parseOnboardingDraft({
    draftVersion: 1,
    slideSize: { cx: 12192000, cy: 6858000 },
    slots: [
      { source: 2, shapeIndex: 0, shapeText: "Metod", token: "{Metod}", capability: "understanding", intent: "Metod", confidence: "high", decision: "confirmed" },
      { source: 2, shapeIndex: 1, shapeText: "Tidplan", token: "{Tidplan}", capability: "understanding", intent: "Tidplan", confidence: "low", decision: "pending" },
      { source: 3, shapeIndex: 0, shapeText: "Referens", token: "{Referens}", capability: "understanding", intent: "Referens", confidence: "high", decision: "confirmed" },
    ],
    wireframe: [
      { source: 2, shapes: [
        { shapeIndex: 0, geometry: { x: 0, y: 0, cx: 100, cy: 100 }, text: "Metod", candidate: true },
        { shapeIndex: 1, geometry: { x: 0, y: 200, cx: 100, cy: 100 }, text: "Tidplan", candidate: true },
      ] },
      { source: 3, shapes: [
        { shapeIndex: 0, geometry: { x: 0, y: 0, cx: 100, cy: 100 }, text: "Referens", candidate: true },
      ] },
    ],
  });

  it("skippar ALLA slots på sliden och rör inte andra slides", () => {
    const result = applySlideDecision(draft, 2, "skipped");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const bySlide2 = result.draft.slots.filter((s) => s.source === 2);
    expect(bySlide2.every((s) => s.decision === "skipped")).toBe(true);
    const slide3 = result.draft.slots.find((s) => s.source === 3);
    expect(slide3?.decision).toBe("confirmed");
  });

  it("pending återställer sliden till obeslutad (ångra)", () => {
    const skipped = applySlideDecision(draft, 2, "skipped");
    if (!skipped.ok) throw new Error(skipped.error);
    const restored = applySlideDecision(skipped.draft, 2, "pending");
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.draft.slots.filter((s) => s.source === 2).every((s) => s.decision === "pending")).toBe(true);
  });

  it("okänd slide → fel", () => {
    const result = applySlideDecision(draft, 99, "skipped");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/99/);
  });

  it("muterar inte input-utkastet", () => {
    const before = JSON.stringify(draft);
    applySlideDecision(draft, 2, "skipped");
    expect(JSON.stringify(draft)).toBe(before);
  });
});

describe("fastSlideSources", () => {
  function slot(source: number, shapeIndex: number, decision: "confirmed" | "skipped" | "pending") {
    return {
      source, shapeIndex, shapeText: "Text", token: `{T${source}${shapeIndex}}`,
      capability: "understanding" as const, intent: "Text", confidence: "high" as const, decision,
    };
  }

  it("listar en slide där ALLA rutor är skippade", () => {
    const slots = [slot(1, 0, "skipped"), slot(1, 1, "skipped")];
    expect(fastSlideSources(slots)).toEqual([1]);
  });

  it("utesluter en slide där bara vissa rutor är skippade", () => {
    const slots = [slot(1, 0, "skipped"), slot(1, 1, "confirmed")];
    expect(fastSlideSources(slots)).toEqual([]);
  });

  it("sorterar stigande när flera slides kvalar in", () => {
    const slots = [
      slot(3, 0, "skipped"),
      slot(1, 0, "skipped"),
      slot(2, 0, "skipped"),
      slot(2, 1, "confirmed"), // slide 2 blir inte fast — en bekräftad ruta räcker
    ];
    expect(fastSlideSources(slots)).toEqual([1, 3]);
  });
});
