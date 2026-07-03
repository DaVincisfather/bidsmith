import { describe, it, expect } from "vitest";
import { manifestToProfile } from "../manifest-to-profile";
import { parseTemplateProfile } from "../template-profile";
import { bundledTemplate } from "../registry";

// Regression gate: deriving a profile from OUR own anbudsmall-v2 must classify
// every slide to the right capability, preserve cloneFrom, and drop footer
// tokens. If this drifts, the profile-driven renderer (slice 3) would mis-fill.
const manifest = bundledTemplate().manifest;
const profile = manifestToProfile(manifest, { templateId: "tpl-1" });
const bySource = new Map(profile.slides.map((s) => [s.source, s]));

describe("manifestToProfile — anbudsmall-v2", () => {
  it("produces a schema-valid profile", () => {
    expect(() => parseTemplateProfile(profile)).not.toThrow();
    expect(profile.name).toBe("anbudsmall-v2");
    expect(profile.slides.length).toBe(manifest.slides.length);
  });

  it("classifies every slide type to the expected capability", () => {
    expect(bySource.get(1)?.capability).toBe("cover");
    expect(bySource.get(2)?.capability).toBe("toc");
    expect(bySource.get(3)?.capability).toBe("understanding");
    expect(bySource.get(6)?.capability).toBe("execution-plan");
    expect(bySource.get(7)?.capability).toBe("execution-plan");
    expect(bySource.get(11)?.capability).toBe("quality-assurance");
    expect(bySource.get(12)?.capability).toBe("team-pricing");
    expect(bySource.get(13)?.capability).toBe("requirement-matrix");
    expect(bySource.get(14)?.capability).toBe("references");
    expect(bySource.get(16)?.capability).toBe("secrecy");
    expect(bySource.get(17)?.capability).toBe("certifications");
  });

  it("preserves the prose variant so slides 3/4/5 don't collapse to one", () => {
    // All three carry capability 'understanding'; only variant tells them apart.
    // Without it the profile-driven renderer would fill 3/4/5 identically.
    expect(bySource.get(3)?.variant).toBe("kunden-idag");
    expect(bySource.get(4)?.variant).toBe("uppdraget");
    expect(bySource.get(5)?.variant).toBe("vision");
    // Non-variant slides carry none.
    expect(bySource.get(1)?.variant).toBeUndefined();
  });

  it("preserves cloneFrom as the driving capability", () => {
    expect(bySource.get(7)?.cloneFrom).toBe("execution-plan"); // phase-detail
    expect(bySource.get(13)?.cloneFrom).toBe("requirement-matrix");
    expect(bySource.get(14)?.cloneFrom).toBe("references");
    // Non-clone slides carry no cloneFrom.
    expect(bySource.get(12)?.cloneFrom).toBeUndefined();
  });

  it("excludes footer tokens from every slot", () => {
    const allPlaceholders = profile.slides.flatMap((s) => s.slots.map((sl) => sl.placeholder));
    expect(allPlaceholders).not.toContain("{Bolagsnamn}");
    expect(allPlaceholders).not.toContain("{Diarienummer}");
  });

  it("leaves an auto slide (toc) with a capability but no content slots", () => {
    const toc = bySource.get(2);
    expect(toc?.capability).toBe("toc");
    expect(toc?.slots).toHaveLength(0); // toc had only footer tokens
  });

  it("maps a content slide's slots to its capability", () => {
    const matrix = bySource.get(13);
    expect(matrix?.slots.length).toBeGreaterThan(0);
    expect(matrix?.slots.every((s) => s.capability === "requirement-matrix")).toBe(true);
    expect(matrix?.slots.every((s) => s.status === "mapped")).toBe(true);
  });
});
