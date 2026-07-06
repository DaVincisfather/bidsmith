// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { buildMiniPptx } from "../../introspect/__tests__/mini-pptx";
import { readPptxSlides } from "../../introspect/read-pptx";
import { instrumentTemplate } from "../../instrument/instrument-template";
import { isAllGenericProfile, parseTemplateProfile } from "../../template-profile";
import { proposeInjectionPlan } from "../propose-injection-plan";
import { isForeignPptx } from "../detect-foreign";
import { readSlideSize } from "../slide-size";
import { buildDraft, applyDecision, buildInjections, buildFinalProfile } from "../draft-logic";

// Kedjetest: hela lib-flödet, MOCKAD klassificering (noll live-AI-anrop).
// Mock: samma modul-specifier + fabriksform som propose-injection-plan.test.ts.
vi.mock("../../introspect/classify-slot", () => ({
  classifyForeignSlot: vi.fn(async ({ shapeText }: { shapeText: string }) => ({
    name: shapeText.slice(0, 20) || "Sektion",
    capability: "generic-prose",
    intent: `Fyll i: ${shapeText.slice(0, 30)}`,
    confidence: shapeText.length > 10 ? "high" : "low",
  })),
}));

// Slide 1: två textboxar med geometri + text — shape-strukturen kopierad från
// instrument-template.test.ts (SHAPE_MULTIPARA/SHAPE_UNTOUCHED-mönstret).
const SHAPE_ONE = `
  <p:spPr><a:xfrm><a:off x="100" y="200"/><a:ext cx="3000" cy="4000"/></a:xfrm></p:spPr>
  <p:txBody>
    <a:bodyPr/>
    <a:p><a:r><a:rPr sz="1600"/><a:t>Första raden</a:t></a:r></a:p>
    <a:p><a:r><a:rPr sz="1600"/><a:t>Andra stycket</a:t></a:r></a:p>
  </p:txBody>`;

const SHAPE_TWO = `
  <p:spPr><a:xfrm><a:off x="500" y="600"/><a:ext cx="1000" cy="1200"/></a:xfrm></p:spPr>
  <p:txBody><a:bodyPr/><a:p><a:r><a:rPr sz="1200"/><a:t>Untouched box</a:t></a:r></a:p></p:txBody>`;

const SLIDE_WITH_BOXES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:sp>${SHAPE_ONE}</p:sp>
    <p:sp>${SHAPE_TWO}</p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

// Slide 2: ren bildslide, inga <p:sp> alls — kandidat-lös, ska bli
// static-passthrough och ändå överleva hela vägen till slutprofilen.
const STATIC_SLIDE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:pic/>
  </p:spTree></p:cSld>
</p:sld>`;

describe("onboarding-kedjan (mockad klassificering, noll live-API)", () => {
  it("upload-detektering → propose → beslut → instrumentering → slutprofil", async () => {
    const pptx = await buildMiniPptx([SLIDE_WITH_BOXES, STATIC_SLIDE]);
    const slides = await readPptxSlides(pptx);

    // 1. Foreign-detektering
    expect(isForeignPptx(slides)).toBe(true);

    // 2. Propose (klassificeringen mockad)
    const proposal = await proposeInjectionPlan(pptx, {
      templateId: "t-1", name: "kundmall", version: 1, userId: null,
    });
    const draft = buildDraft(proposal.slots, slides, await readSlideSize(pptx));
    expect(draft.slots.length).toBeGreaterThan(0);

    // 3. Beslut: skippa första sloten, redigera + bekräfta resten
    let current = draft;
    const [first, ...rest] = current.slots;
    const skipRes = applyDecision(current, {
      source: first.source, shapeIndex: first.shapeIndex, decision: "skipped",
    });
    expect(skipRes.ok).toBe(true);
    if (skipRes.ok) current = skipRes.draft;
    for (const slot of rest) {
      const res = applyDecision(current, {
        source: slot.source, shapeIndex: slot.shapeIndex,
        decision: "confirmed", intent: "Redigerat syfte",
      });
      expect(res.ok).toBe(true);
      if (res.ok) current = res.draft;
    }

    // 4. Instrumentering — tokens hamnar i rätt shapes
    const injections = buildInjections(current);
    expect(injections.length).toBe(rest.length);
    const instrumented = await instrumentTemplate(pptx, injections);
    const after = await readPptxSlides(instrumented);
    for (const inj of injections) {
      const slide = after.find((s) => s.source === inj.source)!;
      expect(slide.shapes[inj.shapeIndex].tokens).toContain(inj.token);
    }

    // 5. Slutprofil — schemagiltig, all-generic (routing-diskriminatorn)
    const profile = buildFinalProfile(current, { templateId: "t-1", name: "kundmall", version: 1 });
    expect(() => parseTemplateProfile(profile)).not.toThrow();
    expect(isAllGenericProfile(profile)).toBe(true);
    expect(profile.slides).toHaveLength(slides.length); // ALLA slides — inga försvinner
  });
});
