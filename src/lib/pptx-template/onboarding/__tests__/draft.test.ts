import { describe, it, expect } from "vitest";
import { parseOnboardingDraft, TOKEN_RE, extractPrecount } from "../draft";

const validDraft = {
  draftVersion: 1,
  slideSize: { cx: 12192000, cy: 6858000 },
  slots: [
    {
      source: 1,
      shapeIndex: 0,
      shapeText: "Beskriv er metod här",
      token: "{Vår metod}",
      capability: "generic-prose",
      intent: "Beskrivning av leverantörens metod",
      confidence: "high",
      decision: "confirmed",
    },
  ],
  wireframe: [
    {
      source: 1,
      shapes: [
        {
          shapeIndex: 0,
          geometry: { x: 1000, y: 1000, cx: 5000000, cy: 2000000 },
          text: "Beskriv er metod här",
          candidate: true,
        },
      ],
    },
  ],
};

describe("OnboardingDraftSchema", () => {
  it("accepterar ett giltigt utkast", () => {
    expect(parseOnboardingDraft(validDraft).slots[0].token).toBe("{Vår metod}");
  });

  it("avvisar token utan klamrar", () => {
    const bad = structuredClone(validDraft);
    bad.slots[0].token = "Vår metod";
    expect(() => parseOnboardingDraft(bad)).toThrow();
  });

  it("avvisar okänt decision-värde", () => {
    const bad = structuredClone(validDraft);
    (bad.slots[0] as { decision: string }).decision = "maybe";
    expect(() => parseOnboardingDraft(bad)).toThrow();
  });

  it("TOKEN_RE matchar instrumentTemplates kontrakt", () => {
    expect(TOKEN_RE.test("{Namn}")).toBe(true);
    expect(TOKEN_RE.test("{}")).toBe(false);
    expect(TOKEN_RE.test("{a{b}")).toBe(false);
  });
});

describe("OnboardingDraftSchema — tables (optional, additiv)", () => {
  it("gamla utkast utan tables-fält parsar fortfarande oförändrat", () => {
    expect("tables" in validDraft).toBe(false);
    expect(() => parseOnboardingDraft(validDraft)).not.toThrow();
    expect(parseOnboardingDraft(validDraft).tables).toBeUndefined();
  });

  it("accepterar ett utkast med en obeslutad tabell", () => {
    const withTable = {
      ...validDraft,
      tables: [
        {
          source: 1,
          frameIndex: 0,
          geometry: { x: 1000, y: 1000, cx: 500000, cy: 200000 },
          gridColsEmu: [100, 200],
          rows: [
            { heightEmu: 10, cellTexts: ["Krav", "Uppfyllnad"] },
            { heightEmu: 10, cellTexts: ["Exempel", "Ja"] },
          ],
        },
      ],
    };
    const parsed = parseOnboardingDraft(withTable);
    expect(parsed.tables?.[0].decision).toBeUndefined();
    expect(parsed.tables?.[0].rows[1].cellTexts).toEqual(["Exempel", "Ja"]);
  });

  it("accepterar ett utkast med en bekräftad tabellkarta", () => {
    const withDecision = {
      ...validDraft,
      tables: [
        {
          source: 1,
          frameIndex: 0,
          geometry: null,
          gridColsEmu: [100, 200],
          rows: [
            { heightEmu: 10, cellTexts: ["Krav", "Uppfyllnad"] },
            { heightEmu: 10, cellTexts: ["Exempel", "Ja"] },
          ],
          decision: { headerRows: 1, templateRowIndex: 1, columns: ["krav", "uppfyllnad"], confirmed: true },
        },
      ],
    };
    expect(parseOnboardingDraft(withDecision).tables?.[0].decision?.confirmed).toBe(true);
  });

  it("avvisar en okänd kolumnroll i tabellbeslutet", () => {
    const bad = {
      ...validDraft,
      tables: [
        {
          source: 1,
          frameIndex: 0,
          geometry: null,
          gridColsEmu: [100],
          rows: [{ heightEmu: 10, cellTexts: ["x"] }],
          decision: { headerRows: 0, templateRowIndex: 0, columns: ["okänd-roll"], confirmed: true },
        },
      ],
    };
    expect(() => parseOnboardingDraft(bad)).toThrow();
  });
});

describe("extractPrecount", () => {
  it("plockar ut precount ur en ren precount-payload (satt av upload)", () => {
    expect(extractPrecount({ precount: { slides: 5, candidates: 12 } })).toEqual({
      slides: 5, candidates: 12,
    });
  });

  it("plockar ut precount ur en error-payload som bär den med (klassificeringsfel efter retry)", () => {
    expect(extractPrecount({ error: "boom", precount: { slides: 5, candidates: 12 } })).toEqual({
      slides: 5, candidates: 12,
    });
  });

  it("returnerar undefined för ett riktigt utkast (inget precount-fält)", () => {
    expect(extractPrecount(validDraft)).toBeUndefined();
  });

  it("returnerar undefined för null/icke-objekt", () => {
    expect(extractPrecount(null)).toBeUndefined();
    expect(extractPrecount("sträng")).toBeUndefined();
  });
});
