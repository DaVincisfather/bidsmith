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
