import { describe, it, expect } from "vitest";
import type { SlideShapes } from "../../introspect/read-pptx";
import type { ProposedSlot } from "../propose-injection-plan";
import {
  buildDraft,
  applyDecision,
  buildInjections,
  buildFinalProfile,
} from "../draft-logic";

const SIZE = { cx: 12192000, cy: 6858000 };

function shape(text: string, geometry = { x: 0, y: 0, cx: 100, cy: 100 }) {
  return {
    paragraphs: [text],
    tokens: [],
    geometry,
    fontSizePt: 18,
    lineSpacingPct: null,
    autofit: null,
  };
}

const slides: SlideShapes[] = [
  { source: 1, shapes: [shape("Rubrik"), shape("Beskriv er metod")], tokens: [], images: { placed: 0, placeholders: 0 } },
  { source: 2, shapes: [shape("Statisk footer")], tokens: [], images: { placed: 0, placeholders: 0 } },
];

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
