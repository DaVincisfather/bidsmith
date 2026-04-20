import { describe, it, expect } from "vitest";
import { getTemplate } from "../registry";

describe("template registry", () => {
  it("returns config for anbudsmall-v2", () => {
    const cfg = getTemplate("anbudsmall-v2");
    expect(cfg.id).toBe("anbudsmall-v2");
    expect(cfg.templateFile).toMatch(/anbudsmall-v2\.pptx$/);
    expect(cfg.slides.length).toBeGreaterThan(0);
    // Slide 7 is phase-detail with cloning enabled
    const phaseSlide = cfg.slides.find((s) => s.type === "phase-detail");
    expect(phaseSlide).toBeDefined();
    expect(phaseSlide!.cloneFrom).toBe("phases");
  });

  it("throws for unknown template id", () => {
    expect(() => getTemplate("nope" as never)).toThrow(/unknown template/i);
  });
});
